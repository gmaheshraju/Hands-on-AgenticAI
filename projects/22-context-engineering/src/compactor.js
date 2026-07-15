// compactor.js — Conversation history compression
// The hardest part of context engineering in practice:
// when conversation exceeds token budget, compress older turns
// while preserving key facts, decisions, and open questions.

import { estimateTokens } from './tokenizer.js';

/**
 * Regex patterns for extracting key facts from conversation text.
 * These approximate what an LLM would extract — good enough for
 * a demo, and the same approach used in production when you need
 * deterministic extraction without an LLM call.
 */
const EXTRACTION_PATTERNS = {
  // Decisions: "decided to X", "we'll go with X", "chose X"
  decisions: [
    /\b(?:decided?|choosing?|chose|selected?|go(?:ing)?\s+with|opted?\s+for|picked|agreed?\s+(?:to|on))\s+(.{10,80}?)(?:\.|$)/gim,
    /\b(?:we'll|let's|going\s+to|plan\s+(?:is\s+)?to)\s+(.{10,80}?)(?:\.|$)/gim,
  ],

  // Questions: lines ending with "?", or "how/what/why/when/where/should" starters
  questions: [
    /([^.!?\n]*\?)/gm,
    /\b((?:how|what|why|when|where|should|could|would|can)\s+.{10,80}?)(?:\.|$)/gim,
  ],

  // Entities: capitalized multi-word names, technical terms, specific values
  entities: [
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g,  // Proper nouns
    /\b((?:v\d+\.[\d.]+))\b/g,                    // Version numbers
    /\b(\d+(?:\.\d+)?(?:\s*(?:GB|MB|KB|TB|ms|RPM|RPS|QPS|K|M|%)))\b/gi, // Metrics
    /`([^`]+)`/g,                                   // Backtick-quoted terms
    /\b([A-Z]{2,}(?:[-_][A-Z]+)*)\b/g,            // Acronyms (e.g., OOM, CQRS, API)
  ],

  // Action items: "need to X", "TODO", "next step", "should X"
  actionItems: [
    /\b(?:need\s+to|TODO|todo|FIXME|next\s+step[s]?|action\s+item|should\s+(?:we\s+)?)\s*:?\s*(.{10,80}?)(?:\.|$)/gim,
    /\b(?:recommend|suggest|advise)\s+(.{10,80}?)(?:\.|$)/gim,
  ],

  // Key values: "X is Y", "X = Y", "set X to Y"
  keyValues: [
    /\b(\w[\w\s]{2,20})\s+(?:is|are|was|were|=)\s+(.{3,40}?)(?:\.|,|$)/gim,
    /\bset\s+(\w[\w\s]{2,15})\s+to\s+(.{3,30}?)(?:\.|,|$)/gim,
  ],
};

/**
 * Extract key facts from a text block using regex-based NLP.
 * Returns structured facts grouped by category.
 *
 * @param {string} text - Conversation text to analyze
 * @returns {{ decisions: string[], questions: string[], entities: string[], actionItems: string[], keyValues: string[] }}
 */
export function extractKeyFacts(text) {
  if (!text || typeof text !== 'string') {
    return { decisions: [], questions: [], entities: [], actionItems: [], keyValues: [] };
  }

  const facts = {
    decisions: [],
    questions: [],
    entities: [],
    actionItems: [],
    keyValues: [],
  };

  // Extract each category
  for (const [category, patterns] of Object.entries(EXTRACTION_PATTERNS)) {
    const seen = new Set();

    for (const pattern of patterns) {
      // Reset regex state
      pattern.lastIndex = 0;
      let match;

      while ((match = pattern.exec(text)) !== null) {
        // Use the first capture group, or full match
        const extracted = (match[1] || match[0]).trim();

        // Deduplicate and filter noise
        const normalized = extracted.toLowerCase();
        if (normalized.length < 3) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        if (category === 'keyValues' && match[2]) {
          facts.keyValues.push(`${extracted}: ${match[2].trim()}`);
        } else {
          facts[category].push(extracted);
        }
      }
    }
  }

  // Deduplicate entities more aggressively (substring matches)
  facts.entities = deduplicateSubstrings(facts.entities);

  return facts;
}

/**
 * Remove entries that are substrings of other entries.
 */
function deduplicateSubstrings(items) {
  return items.filter((item, i) =>
    !items.some((other, j) =>
      i !== j && other.length > item.length && other.toLowerCase().includes(item.toLowerCase())
    )
  );
}

/**
 * Generate a compact summary from extracted facts.
 * Produces a structured text block that preserves key information.
 *
 * @param {{ decisions: string[], questions: string[], entities: string[], actionItems: string[], keyValues: string[] }} facts
 * @param {number} turnCount - Number of turns summarized
 * @returns {string}
 */
function buildSummary(facts, turnCount) {
  const sections = [];

  sections.push(`[Conversation Summary — ${turnCount} turns compacted]`);

  if (facts.entities.length > 0) {
    sections.push(`Key topics: ${facts.entities.slice(0, 10).join(', ')}`);
  }

  if (facts.decisions.length > 0) {
    sections.push('Decisions made:');
    for (const d of facts.decisions.slice(0, 5)) {
      sections.push(`  - ${d}`);
    }
  }

  if (facts.keyValues.length > 0) {
    sections.push('Key facts:');
    for (const kv of facts.keyValues.slice(0, 5)) {
      sections.push(`  - ${kv}`);
    }
  }

  if (facts.actionItems.length > 0) {
    sections.push('Action items:');
    for (const a of facts.actionItems.slice(0, 3)) {
      sections.push(`  - ${a}`);
    }
  }

  if (facts.questions.length > 0) {
    const openQuestions = facts.questions.slice(-3); // keep most recent questions
    sections.push('Open questions:');
    for (const q of openQuestions) {
      sections.push(`  - ${q}`);
    }
  }

  return sections.join('\n');
}

/**
 * Compact a conversation to fit within a token budget.
 *
 * Strategy:
 * 1. Keep the last N turns verbatim (recent context is critical)
 * 2. Extract key facts from older turns
 * 3. Generate a compact summary to replace older turns
 * 4. Track compression statistics
 *
 * @param {Array<{role: string, content: string}>} turns - Conversation turns
 * @param {number} maxTokens - Token budget for the entire conversation
 * @param {object} opts - { recentTurnCount: number (default 3), mode: 'text' | 'code' }
 * @returns {{ turns: Array, stats: object }}
 */
export function compactConversation(turns, maxTokens, opts = {}) {
  const recentTurnCount = opts.recentTurnCount ?? 3;
  const tokenOpts = { mode: opts.mode || 'text' };

  if (!turns || turns.length === 0) {
    return {
      turns: [],
      stats: {
        originalTurns: 0,
        compactedTurns: 0,
        originalTokens: 0,
        compactedTokens: 0,
        compressionRatio: 1,
        summarizedTurns: 0,
        recentTurnsKept: 0,
        description: 'No turns to compact',
      },
    };
  }

  // Calculate total tokens
  const originalTokens = turns.reduce(
    (sum, t) => sum + estimateTokens(t.content, tokenOpts), 0
  );

  // If already within budget, return as-is
  if (originalTokens <= maxTokens) {
    return {
      turns: [...turns],
      stats: {
        originalTurns: turns.length,
        compactedTurns: turns.length,
        originalTokens,
        compactedTokens: originalTokens,
        compressionRatio: 1,
        summarizedTurns: 0,
        recentTurnsKept: turns.length,
        description: `All ${turns.length} turns fit within budget (${originalTokens}/${maxTokens} tokens)`,
      },
    };
  }

  // Split into older (to summarize) and recent (to keep verbatim)
  const recentCount = Math.min(recentTurnCount, turns.length);
  const olderTurns = turns.slice(0, turns.length - recentCount);
  const recentTurns = turns.slice(turns.length - recentCount);

  // Calculate token budget for summary
  const recentTokens = recentTurns.reduce(
    (sum, t) => sum + estimateTokens(t.content, tokenOpts), 0
  );
  const summaryBudget = maxTokens - recentTokens;

  // If recent turns alone exceed budget, iteratively reduce recent turns
  if (summaryBudget <= 50) {
    let adjustedRecentCount = recentTurnCount - 1;
    while (adjustedRecentCount >= 1) {
      const fewerRecent = turns.slice(turns.length - adjustedRecentCount);
      const fewerRecentTokens = fewerRecent.reduce(
        (sum, t) => sum + estimateTokens(t.content, tokenOpts), 0
      );
      if (maxTokens - fewerRecentTokens > 50) {
        return compactConversation(turns, maxTokens, {
          ...opts,
          recentTurnCount: adjustedRecentCount,
        });
      }
      adjustedRecentCount--;
    }
    // Even 1 recent turn doesn't fit — just return the last turn truncated
    const lastTurn = turns[turns.length - 1];
    return {
      turns: [lastTurn],
      stats: {
        originalTurns: turns.length,
        compactedTurns: 1,
        originalTokens,
        compactedTokens: estimateTokens(lastTurn.content, tokenOpts),
        compressionRatio: +(originalTokens / estimateTokens(lastTurn.content, tokenOpts)).toFixed(2),
        summarizedTurns: turns.length - 1,
        recentTurnsKept: 1,
        description: `Budget too tight — kept only last turn`,
      },
    };
  }

  // Extract key facts from older turns
  const olderText = olderTurns.map(t => t.content).join('\n');
  const olderTokens = olderTurns.reduce(
    (sum, t) => sum + estimateTokens(t.content, tokenOpts), 0
  );
  const facts = extractKeyFacts(olderText);

  // Build summary
  let summary = buildSummary(facts, olderTurns.length);

  // If summary still exceeds budget, truncate it
  let summaryTokens = estimateTokens(summary, tokenOpts);
  if (summaryTokens > summaryBudget) {
    // Progressively trim sections
    const lines = summary.split('\n');
    while (estimateTokens(lines.join('\n'), tokenOpts) > summaryBudget && lines.length > 2) {
      lines.splice(-1, 1);
    }
    summary = lines.join('\n');
    summaryTokens = estimateTokens(summary, tokenOpts);
  }

  // Assemble compacted conversation
  const compactedTurns = [
    { role: 'system', content: summary },
    ...recentTurns,
  ];

  const compactedTokens = summaryTokens + recentTokens;

  return {
    turns: compactedTurns,
    stats: {
      originalTurns: turns.length,
      compactedTurns: compactedTurns.length,
      originalTokens,
      compactedTokens,
      compressionRatio: originalTokens > 0 ? +(originalTokens / compactedTokens).toFixed(2) : 1,
      summarizedTurns: olderTurns.length,
      recentTurnsKept: recentCount,
      summaryTokens,
      recentTokens,
      factsExtracted: {
        decisions: facts.decisions.length,
        questions: facts.questions.length,
        entities: facts.entities.length,
        actionItems: facts.actionItems.length,
        keyValues: facts.keyValues.length,
      },
      description: `Compacted ${olderTurns.length} turns (${olderTokens} tokens) -> summary (${summaryTokens} tokens) + ${recentCount} recent turns (${recentTokens} tokens)`,
    },
  };
}
