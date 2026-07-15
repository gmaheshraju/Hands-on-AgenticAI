/**
 * Retrieval engine — hybrid keyword + semantic search with relevance scoring.
 *
 * Strategy:
 *   1. FTS keyword search across episodic and semantic tables
 *   2. Direct fact lookup by subject name
 *   3. Score each result by: relevance (FTS rank), recency, staleness
 *   4. Merge and deduplicate across sources
 *   5. Return top-K results sorted by combined score
 */

/**
 * @typedef {object} RetrievalResult
 * @property {'episodic'|'semantic'|'procedural'} source
 * @property {number} score — combined relevance score (higher = better)
 * @property {object} data — the raw row from the database
 * @property {string} summary — human-readable summary of this result
 */

/**
 * Retrieve relevant memories for a query.
 *
 * @param {import('./memory.js').MemoryStore} memory
 * @param {string} query — the user's natural-language query
 * @param {object} options — { topK: number }
 * @returns {RetrievalResult[]}
 */
export function retrieve(memory, query, options = {}) {
  const topK = options.topK || 10;
  const results = [];

  // ─── 1. Extract candidate search terms ────────────────────────────
  const terms = extractSearchTerms(query);
  const ftsQuery = buildFTSQuery(terms);

  // ─── 2. FTS search on episodic memory ─────────────────────────────
  if (ftsQuery) {
    try {
      const episodicHits = memory.searchEpisodic(ftsQuery);
      for (const hit of episodicHits) {
        const recencyScore = computeRecencyScore(hit.timestamp);
        const relevanceScore = Math.abs(hit.rank || 0);
        const combined =
          normalizeRank(relevanceScore) * 0.6 + recencyScore * 0.4;

        results.push({
          source: "episodic",
          score: combined,
          data: hit,
          summary: `[Episode] ${truncate(hit.raw_input, 120)}`,
        });
      }
    } catch {
      // FTS query might fail on unusual characters — fall through to direct lookup
    }
  }

  // ─── 3. FTS search on semantic facts ──────────────────────────────
  if (ftsQuery) {
    try {
      const semanticHits = memory.searchSemantic(ftsQuery);
      for (const hit of semanticHits) {
        const stalenessPenalty = hit.stale ? 0.3 : 0;
        const recencyScore = computeRecencyScore(hit.updated_at);
        const relevanceScore = Math.abs(hit.rank || 0);
        const combined =
          normalizeRank(relevanceScore) * 0.5 +
          recencyScore * 0.3 +
          hit.confidence * 0.2 -
          stalenessPenalty;

        results.push({
          source: "semantic",
          score: combined,
          data: hit,
          summary: `[Fact] ${hit.subject} — ${hit.predicate}: ${hit.object}`,
        });
      }
    } catch {
      // Fall through
    }
  }

  // ─── 4. Direct subject lookup (exact match on names) ──────────────
  for (const term of terms) {
    if (term.length < 2) continue;
    const directFacts = memory.getFactsAbout(term);
    for (const fact of directFacts) {
      // Avoid duplicates from FTS
      if (results.some((r) => r.source === "semantic" && r.data.id === fact.id))
        continue;

      const recencyScore = computeRecencyScore(fact.updated_at);
      const stalenessPenalty = fact.stale ? 0.3 : 0;
      const combined =
        0.8 + recencyScore * 0.2 + fact.confidence * 0.1 - stalenessPenalty;

      results.push({
        source: "semantic",
        score: combined,
        data: fact,
        summary: `[Fact] ${fact.subject} — ${fact.predicate}: ${fact.object}`,
      });
    }
  }

  // ─── 5. Check procedural memory ───────────────────────────────────
  const procedures = memory.getProcedures();
  for (const proc of procedures) {
    const triggerWords = proc.trigger_pattern.toLowerCase().split("_");
    const queryLower = query.toLowerCase();
    const matchScore = triggerWords.filter((w) =>
      queryLower.includes(w)
    ).length;
    if (matchScore > 0) {
      results.push({
        source: "procedural",
        score: (matchScore / triggerWords.length) * 0.7,
        data: proc,
        summary: `[Procedure] ${proc.trigger_pattern}: ${truncate(proc.action_template, 100)}`,
      });
    }
  }

  // ─── 6. Sort by score descending, take top K ──────────────────────
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * Retrieve everything known about a specific person.
 */
export function retrievePerson(memory, name) {
  const facts = memory.getFactsAbout(name);

  // Also search episodes that mention them
  let episodes = [];
  try {
    episodes = memory.searchEpisodic(name);
  } catch {
    // ignore
  }

  return {
    facts: facts.map((f) => ({
      predicate: f.predicate,
      value: f.object,
      confidence: f.confidence,
      stale: !!f.stale,
      updatedAt: f.updated_at,
    })),
    recentInteractions: episodes.slice(0, 5).map((e) => ({
      date: e.timestamp,
      summary: truncate(e.raw_input, 200),
    })),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function extractSearchTerms(query) {
  const stopWords = new Set([
    "who",
    "what",
    "when",
    "where",
    "how",
    "is",
    "are",
    "was",
    "were",
    "do",
    "does",
    "did",
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "about",
    "i",
    "me",
    "my",
    "know",
    "tell",
    "find",
    "get",
    "can",
    "could",
    "would",
    "should",
    "prep",
    "prepare",
    "call",
    "meeting",
    "works",
    "work",
  ]);

  return query
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w.toLowerCase()))
    .map((w) => w.trim());
}

function buildFTSQuery(terms) {
  if (terms.length === 0) return null;
  // Use OR to broaden matches
  return terms.map((t) => `"${t}"`).join(" OR ");
}

function computeRecencyScore(timestamp) {
  if (!timestamp) return 0.5;
  const age = Date.now() - new Date(timestamp).getTime();
  const dayMs = 86400000;
  const ageInDays = age / dayMs;

  // Exponential decay: halves every 90 days
  return Math.exp(-ageInDays / 130);
}

function normalizeRank(rank) {
  // FTS5 rank is negative (closer to 0 = better match)
  // Convert to 0..1 where 1 is best
  return 1 / (1 + rank);
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "..." : str;
}
