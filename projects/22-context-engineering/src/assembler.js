// assembler.js — Context window assembler
// Takes an allocation plan + sources, produces final ordered context.
// Implements the Stanford "lost in the middle" finding for attention-optimized ordering.

import { truncateMiddle, estimateTokens } from './tokenizer.js';
import { SourceType, totalTokens } from './sources.js';

/**
 * Ordering rules for the final context window (chronological mode).
 * Lower number = placed earlier in the context.
 */
const ORDER = {
  SYSTEM_PROMPT: 0,
  CONVERSATION_HISTORY: 1,
  RAG_CHUNKS: 2,
  MEMORY: 3,
  TOOL_RESULTS: 4,
  EXAMPLES: 5,
};

/**
 * Reorder sources for attention optimization (Stanford "Lost in the Middle" finding).
 *
 * Research: Liu et al. (2023) "Lost in the Middle: How Language Models Use Long Contexts"
 * showed that LLMs attend most strongly to content at the START and END of the context,
 * with a significant attention valley in the middle. Content placed in the middle
 * is effectively "lost" — the model is up to 30% less likely to use it correctly.
 *
 * Strategy: Place highest-importance content at positions 1 (right after system prompt)
 * and at the end. Place lowest-importance content in the middle.
 *
 * Input:  [sys, A(0.9), B(0.3), C(0.5), D(0.7), E(0.4), F(0.8)]
 * Output: [sys, A(0.9), F(0.8), E(0.4), B(0.3), C(0.5), D(0.7)]
 *         ^     ^start          ^middle valley^          ^end^
 *         |     highest importance             lowest     high
 *
 * @param {Array} items - Array of assembled items (with relevance scores)
 * @returns {Array} Reordered items with attention positions annotated
 */
export function reorderForAttention(items) {
  if (!items || items.length <= 2) return items;

  // Separate system prompts (always position 0) from content
  const systemItems = items.filter(i => i.type === 'SYSTEM_PROMPT');
  const contentItems = items.filter(i => i.type !== 'SYSTEM_PROMPT');

  if (contentItems.length <= 2) {
    return [...systemItems, ...contentItems];
  }

  // Sort by relevance (highest first)
  const sorted = [...contentItems].sort((a, b) => {
    const relA = a.relevance ?? 0.5;
    const relB = b.relevance ?? 0.5;
    return relB - relA;
  });

  // Distribute into attention-optimized positions:
  // - First half of high-relevance items go to the START
  // - Second half of high-relevance items go to the END
  // - Low-relevance items fill the MIDDLE
  const reordered = new Array(sorted.length);
  let startIdx = 0;
  let endIdx = sorted.length - 1;

  for (let i = 0; i < sorted.length; i++) {
    if (i % 2 === 0) {
      // Even indices (highest, 3rd highest, 5th...) go to the start
      reordered[startIdx] = sorted[i];
      reordered[startIdx].attentionPosition = 'start';
      startIdx++;
    } else {
      // Odd indices (2nd highest, 4th highest...) go to the end
      reordered[endIdx] = sorted[i];
      reordered[endIdx].attentionPosition = 'end';
      endIdx--;
    }
  }

  // Mark middle positions
  const middleStart = Math.floor(sorted.length * 0.3);
  const middleEnd = Math.ceil(sorted.length * 0.7);
  for (let i = middleStart; i < middleEnd; i++) {
    if (reordered[i]) {
      reordered[i].attentionPosition = 'middle';
    }
  }

  return [...systemItems, ...reordered];
}

/**
 * Assemble the final context window from an allocation plan.
 *
 * @param {Array} sources - Original source array
 * @param {object} plan - Allocation plan from budget.allocate() or a strategy
 * @param {object} opts - { ordering: 'chronological' | 'attention-optimized' }
 * @returns {object} { messages, report, totalTokens }
 */
export function assemble(sources, plan, opts = {}) {
  const ordering = opts.ordering || 'attention-optimized';
  const items = [];

  // Process included sources (full content)
  for (const source of plan.included) {
    items.push({
      type: source.type.name,
      label: source.type.label,
      content: source.content,
      tokens: source.allocatedTokens,
      status: 'full',
      relevance: source.relevanceScore,
    });
  }

  // Process truncated sources (compressed content)
  for (const source of plan.truncated) {
    const compressed = truncateMiddle(source.content, source.allocatedTokens);
    const actualTokens = estimateTokens(compressed);
    items.push({
      type: source.type.name,
      label: source.type.label,
      content: compressed,
      tokens: actualTokens,
      originalTokens: source.originalTokens,
      status: 'truncated',
      relevance: source.relevanceScore,
    });
  }

  // Sort by assembly order (chronological first)
  items.sort((a, b) => {
    const orderA = ORDER[a.type] ?? 99;
    const orderB = ORDER[b.type] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    // Within same type: RAG chunks by relevance (highest first)
    if (a.type === 'RAG_CHUNKS') return b.relevance - a.relevance;
    return 0;
  });

  // Apply attention-optimized reordering if requested
  let finalItems;
  if (ordering === 'attention-optimized') {
    finalItems = reorderForAttention(items);
  } else {
    finalItems = items;
  }

  // Build messages array (chat format)
  const messages = [];
  for (const item of finalItems) {
    if (item.type === 'SYSTEM_PROMPT') {
      messages.push({ role: 'system', content: item.content });
    } else if (item.type === 'CONVERSATION_HISTORY') {
      messages.push({ role: 'user', content: item.content });
    } else {
      messages.push({
        role: 'system',
        content: `[${item.label}]\n${item.content}`,
      });
    }
  }

  // Build report
  const keptCount = plan.included.length + plan.truncated.length;
  const droppedCount = plan.dropped.length;
  const actualTotal = finalItems.reduce((s, i) => s + i.tokens, 0);

  const report = {
    sourcesKept: keptCount,
    sourcesDropped: droppedCount,
    sourcesTruncated: plan.truncated.length,
    tokensUsed: actualTotal,
    tokenBudget: plan.budget.available,
    utilization: Math.round((actualTotal / plan.budget.available) * 100),
    ordering,
    items: finalItems.map(i => ({
      type: i.type,
      label: i.label,
      tokens: i.tokens,
      status: i.status,
      relevance: i.relevance,
      ...(i.attentionPosition ? { attentionPosition: i.attentionPosition } : {}),
      ...(i.originalTokens ? { originalTokens: i.originalTokens } : {}),
    })),
    dropped: plan.dropped.map(d => ({
      type: d.type.name,
      label: d.type.label,
      tokens: d.tokens,
      reason: d.reason,
    })),
  };

  return {
    messages,
    report,
    totalTokens: actualTotal,
  };
}

/**
 * Assemble context with scratchpad awareness.
 *
 * When a source would be dropped due to budget constraints, it is parked
 * in the scratchpad instead. The scratchpad's compact index is injected
 * as a low-cost source so the agent knows what is available without
 * paying the full token cost.
 *
 * This is the "Write" move in practice: instead of losing information
 * entirely, you park it and maintain a table of contents.
 *
 * @param {Array} sources - Original source array
 * @param {object} plan - Allocation plan from budget.allocate() or a strategy
 * @param {import('./scratchpad.js').Scratchpad} scratchpad - Scratchpad instance
 * @param {object} opts - { ordering, parkRelevanceThreshold }
 * @returns {object} { messages, report, totalTokens, parkedSources }
 */
export function assembleWithScratchpad(sources, plan, scratchpad, opts = {}) {
  const parkThreshold = opts.parkRelevanceThreshold ?? 0.0; // park everything by default
  const parkedSources = [];

  // Park dropped sources into the scratchpad instead of losing them
  for (const dropped of plan.dropped) {
    if (dropped.relevanceScore >= parkThreshold) {
      const result = scratchpad.write(
        dropped.id || `dropped_${dropped.type.name}_${Date.now()}`,
        dropped.content,
        {
          source: dropped.type.name,
          relevance: dropped.relevanceScore,
          tags: [dropped.type.label, dropped.reason || 'budget_exceeded'],
        }
      );
      parkedSources.push({
        id: dropped.id,
        type: dropped.type.name,
        label: dropped.type.label,
        tokens: dropped.tokens,
        tokensSaved: result.tokensSaved,
        relevance: dropped.relevanceScore,
      });
    }
  }

  // Also park truncated sources (full version) — the truncated version
  // is in-context, but the full version is available via scratchpad
  for (const trunc of plan.truncated) {
    scratchpad.write(
      `full_${trunc.id || trunc.type.name}_${Date.now()}`,
      trunc.content,
      {
        source: trunc.type.name,
        relevance: trunc.relevanceScore,
        tags: [trunc.type.label, 'full_version_of_truncated'],
      }
    );
  }

  // Build a scratchpad index source to inject into context
  const scratchpadIndex = scratchpad.formatIndex();
  const indexTokens = estimateTokens(scratchpadIndex);

  // Create a modified plan that includes the scratchpad index
  const scratchpadSource = {
    type: { name: 'SCRATCHPAD_INDEX', priority: 3, label: 'Scratchpad Index' },
    content: scratchpadIndex,
    tokens: indexTokens,
    allocatedTokens: indexTokens,
    relevanceScore: 0.7,
  };

  const augmentedPlan = {
    ...plan,
    included: [...plan.included, scratchpadSource],
    // Drop the "dropped" list since they are now parked
    dropped: plan.dropped.filter(d => d.relevanceScore < parkThreshold),
  };

  // Run standard assembly with the augmented plan
  const result = assemble(sources, augmentedPlan, opts);

  // Enhance the report
  result.report.scratchpad = {
    sourcesParked: parkedSources.length,
    totalTokensParked: parkedSources.reduce((s, p) => s + p.tokens, 0),
    indexTokenCost: indexTokens,
    stats: scratchpad.getStats(),
  };
  result.parkedSources = parkedSources;

  return result;
}
