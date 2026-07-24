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

// ─── Failure mode detection (Drew Brunic's 4 failure modes) ─────────

/**
 * Detect contradictions across turns — the "Poisoning" failure mode.
 * Two turns asserting opposite things about the same entity.
 *
 * @param {Array<{role: string, content: string}>} turns
 * @returns {Array<{ turnA: number, turnB: number, description: string }>}
 */
function detectPoisoning(turns) {
  const findings = [];

  // Extract assertions: "X is Y" or "X = Y" patterns per turn
  const assertions = turns.map((turn, idx) => {
    const matches = [];
    const patterns = [
      /\b(\w[\w\s]{2,20})\s+(?:is|are|was|were|=)\s+(.{3,40}?)(?:\.|,|$)/gim,
      /\bset\s+(\w[\w\s]{2,15})\s+to\s+(.{3,30}?)(?:\.|,|$)/gim,
    ];
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(turn.content)) !== null) {
        matches.push({
          subject: m[1].trim().toLowerCase(),
          value: m[2].trim().toLowerCase(),
          turnIndex: idx,
        });
      }
    }
    return matches;
  });

  // Compare assertions across turns for contradictions
  const flat = assertions.flat();
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const a = flat[i];
      const b = flat[j];
      // Same subject, different value, different turn
      if (
        a.subject === b.subject &&
        a.value !== b.value &&
        a.turnIndex !== b.turnIndex
      ) {
        findings.push({
          turnA: a.turnIndex,
          turnB: b.turnIndex,
          description: `"${a.subject}" asserted as "${a.value}" (turn ${a.turnIndex + 1}) vs "${b.value}" (turn ${b.turnIndex + 1})`,
        });
      }
    }
  }

  return findings;
}

/**
 * Detect low-relevance tangents — the "Distraction" failure mode.
 * Turns whose content diverges significantly from the dominant topic.
 *
 * @param {Array<{role: string, content: string}>} turns
 * @returns {Array<{ turnIndex: number, description: string }>}
 */
function detectDistraction(turns) {
  if (turns.length < 3) return [];

  const findings = [];

  // Build a combined vocabulary from all turns
  const globalWords = new Map();
  const turnWords = turns.map(t => {
    const words = t.content.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const wordSet = new Set(words);
    for (const w of words) {
      globalWords.set(w, (globalWords.get(w) || 0) + 1);
    }
    return wordSet;
  });

  // Words that appear in 50%+ of turns are "core topic" words
  const threshold = Math.max(2, Math.floor(turns.length * 0.5));
  const coreWords = new Set();
  for (const [word, count] of globalWords) {
    if (count >= threshold) coreWords.add(word);
  }

  if (coreWords.size === 0) return [];

  // Score each turn by overlap with core words
  for (let i = 0; i < turns.length; i++) {
    const tw = turnWords[i];
    let overlap = 0;
    for (const w of tw) {
      if (coreWords.has(w)) overlap++;
    }
    const overlapRatio = tw.size > 0 ? overlap / tw.size : 0;

    // A turn with < 10% overlap with core vocabulary is a tangent
    if (overlapRatio < 0.1 && tw.size > 5) {
      findings.push({
        turnIndex: i,
        description: `Turn ${i + 1} shares <10% vocabulary with the dominant topic (${Math.round(overlapRatio * 100)}% overlap)`,
      });
    }
  }

  return findings;
}

/**
 * Detect ambiguous references — the "Confusion" failure mode.
 * Pronouns or vague references ("it", "that", "this") without clear antecedents.
 *
 * @param {Array<{role: string, content: string}>} turns
 * @returns {Array<{ turnIndex: number, description: string }>}
 */
function detectConfusion(turns) {
  const findings = [];

  const vagueRefs = /\b(it|that|this|these|those|they|them)\b/gi;
  const definiteNouns = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;

  for (let i = 0; i < turns.length; i++) {
    const content = turns[i].content;
    const refs = content.match(vagueRefs) || [];
    const nouns = content.match(definiteNouns) || [];

    // High ratio of vague references to concrete nouns suggests confusion
    if (refs.length > 3 && nouns.length < 2) {
      findings.push({
        turnIndex: i,
        description: `Turn ${i + 1} has ${refs.length} vague references ("it", "that", etc.) with only ${nouns.length} concrete noun(s)`,
      });
    }
  }

  return findings;
}

/**
 * Detect conflicting instructions — the "Clash" failure mode.
 * Instructions that contradict each other (e.g., "always X" vs "never X").
 *
 * @param {Array<{role: string, content: string}>} turns
 * @returns {Array<{ turnA: number, turnB: number, description: string }>}
 */
function detectClash(turns) {
  const findings = [];

  // Extract instruction-like statements
  const instructionPattern = /\b(always|never|must|must not|don't|do not|should|should not|avoid|ensure|require)\s+(.{5,50}?)(?:\.|,|!|$)/gim;

  const instructions = [];
  for (let i = 0; i < turns.length; i++) {
    instructionPattern.lastIndex = 0;
    let m;
    while ((m = instructionPattern.exec(turns[i].content)) !== null) {
      const directive = m[1].toLowerCase();
      const action = m[2].trim().toLowerCase();
      const isNegative = ['never', 'must not', "don't", 'do not', 'should not', 'avoid'].includes(directive);

      instructions.push({
        turnIndex: i,
        directive,
        action,
        isNegative,
        raw: m[0].trim(),
      });
    }
  }

  // Compare instructions for contradictions
  for (let i = 0; i < instructions.length; i++) {
    for (let j = i + 1; j < instructions.length; j++) {
      const a = instructions[i];
      const b = instructions[j];

      // Check if same action with opposite polarity
      if (a.turnIndex !== b.turnIndex && a.isNegative !== b.isNegative) {
        // Simple similarity: check if the action words overlap significantly
        const wordsA = new Set(a.action.split(/\s+/).filter(w => w.length > 2));
        const wordsB = new Set(b.action.split(/\s+/).filter(w => w.length > 2));
        let overlap = 0;
        for (const w of wordsA) {
          if (wordsB.has(w)) overlap++;
        }
        const similarity = wordsA.size > 0 ? overlap / wordsA.size : 0;

        if (similarity > 0.5) {
          findings.push({
            turnA: a.turnIndex,
            turnB: b.turnIndex,
            description: `Conflicting directives: "${a.raw}" (turn ${a.turnIndex + 1}) vs "${b.raw}" (turn ${b.turnIndex + 1})`,
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Context-aware compression with failure mode detection.
 *
 * Improves on compactConversation by first detecting Drew Brunic's 4 failure modes:
 * - Poisoning: contradictory information across turns
 * - Distraction: low-relevance tangents that waste tokens
 * - Confusion: ambiguous references without clear antecedents
 * - Clash: instructions that conflict with each other
 *
 * Problematic content is stripped or flagged before compression, improving
 * both the quality and efficiency of the compacted output.
 *
 * @param {Array<{role: string, content: string}>} turns
 * @param {number} maxTokens
 * @param {object} opts - All compactConversation opts plus:
 *   { stripDistractions: boolean (default true), flagContradictions: boolean (default true) }
 * @returns {{ turns: Array, stats: object }}
 */
export function contextAwareCompress(turns, maxTokens, opts = {}) {
  const stripDistractions = opts.stripDistractions ?? true;
  const flagContradictions = opts.flagContradictions ?? true;

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
        failureModesDetected: [],
        tokensRecovered: 0,
        qualityScore: 1,
        description: 'No turns to compact',
      },
    };
  }

  // Step 1: Detect all failure modes
  const poisoning = detectPoisoning(turns);
  const distraction = detectDistraction(turns);
  const confusion = detectConfusion(turns);
  const clash = detectClash(turns);

  const failureModesDetected = [];
  if (poisoning.length > 0) failureModesDetected.push({ mode: 'poisoning', count: poisoning.length, details: poisoning });
  if (distraction.length > 0) failureModesDetected.push({ mode: 'distraction', count: distraction.length, details: distraction });
  if (confusion.length > 0) failureModesDetected.push({ mode: 'confusion', count: confusion.length, details: confusion });
  if (clash.length > 0) failureModesDetected.push({ mode: 'clash', count: clash.length, details: clash });

  // Step 2: Optionally strip distracting turns
  let cleanedTurns = [...turns];
  let tokensRecovered = 0;

  if (stripDistractions && distraction.length > 0) {
    const distractionIndices = new Set(distraction.map(d => d.turnIndex));
    const before = cleanedTurns.reduce((s, t) => s + estimateTokens(t.content), 0);
    cleanedTurns = cleanedTurns.filter((_, i) => !distractionIndices.has(i));
    const after = cleanedTurns.reduce((s, t) => s + estimateTokens(t.content), 0);
    tokensRecovered += before - after;
  }

  // Step 3: Add contradiction/clash warnings if flagging is enabled
  if (flagContradictions && (poisoning.length > 0 || clash.length > 0)) {
    const warnings = [];
    for (const p of poisoning) {
      warnings.push(`[WARNING: Contradiction] ${p.description}`);
    }
    for (const c of clash) {
      warnings.push(`[WARNING: Conflicting instructions] ${c.description}`);
    }

    // Prepend warnings to the most recent user turn
    const lastUserIdx = cleanedTurns.findLastIndex(t => t.role === 'user');
    if (lastUserIdx >= 0) {
      cleanedTurns[lastUserIdx] = {
        ...cleanedTurns[lastUserIdx],
        content: warnings.join('\n') + '\n\n' + cleanedTurns[lastUserIdx].content,
      };
    }
  }

  // Step 4: Run standard compaction on cleaned turns
  const result = compactConversation(cleanedTurns, maxTokens, opts);

  // Step 5: Compute quality score
  // Quality degrades with each failure mode detected, weighted by severity
  const totalIssues = poisoning.length * 3 + distraction.length + confusion.length * 2 + clash.length * 3;
  const qualityScore = Math.max(0, Math.min(1, +(1 - totalIssues * 0.05).toFixed(2)));

  return {
    turns: result.turns,
    stats: {
      ...result.stats,
      failureModesDetected,
      tokensRecovered,
      qualityScore,
    },
  };
}
