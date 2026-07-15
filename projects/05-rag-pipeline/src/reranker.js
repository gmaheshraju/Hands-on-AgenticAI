/**
 * LLM Re-Ranker
 *
 * After hybrid search (BM25 + vector + RRF) gives us ~20 candidate chunks,
 * we use an LLM to re-rank them by relevance to the query.
 *
 * Why re-rank?
 * - BM25 can't understand semantics ("authentication" vs "login")
 * - Vector search can't do exact matching ("rateLimiter" function name)
 * - RRF merges them but still uses statistical proxies for relevance
 * - An LLM can read the code, understand the question, and judge
 *
 * The tradeoff:
 * - Re-ranking adds 1-3 seconds of latency per query
 * - Costs tokens (each candidate chunk is sent to the LLM)
 * - But dramatically improves precision — typically +15-25% on retrieval benchmarks
 *
 * Implementation:
 * - We send all candidates in a single prompt asking the LLM to score each 0-10
 * - The LLM returns structured scores which we parse and re-sort
 * - For the demo, we use a heuristic re-ranker (no API needed)
 */

// ---------------------------------------------------------------------------
// Heuristic re-ranker (for demo / offline use)
// ---------------------------------------------------------------------------

/**
 * Score a chunk's relevance to a query using heuristics.
 *
 * This mimics what an LLM re-ranker does, but with simple rules:
 * - Exact query term matches in function/class names score highest
 * - Query terms appearing in the content boost the score
 * - Shorter, more focused chunks score higher (less noise)
 * - Code chunks (vs prose) get a small boost for code-related queries
 */
function heuristicScore(query, chunk) {
  const queryTerms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2);

  const content = chunk.content.toLowerCase();
  const name = (chunk.name || '').toLowerCase();
  let score = 0;

  for (const term of queryTerms) {
    // Exact match in function/class name — strongest signal
    if (name.includes(term)) {
      score += 3;
    }

    // Count occurrences in content — each match adds diminishing value
    const regex = new RegExp(term, 'g');
    const matches = content.match(regex);
    if (matches) {
      // Saturating: first match = 1.0, second = 0.5, third = 0.25, ...
      score += 1 - (1 / (matches.length + 1));
    }
  }

  // Length penalty: prefer focused chunks (100 lines = 1.0, 10 lines = 1.5, 200 lines = 0.8)
  const lineCount = chunk.content.split('\n').length;
  const lengthBonus = 1 / (1 + Math.log(lineCount / 20 + 1));
  score *= (1 + lengthBonus * 0.3);

  return Math.round(score * 100) / 100;
}

// ---------------------------------------------------------------------------
// LLM re-ranker (production implementation structure)
// ---------------------------------------------------------------------------

/**
 * Build the re-ranking prompt for the LLM.
 *
 * In production, you would send this to the Gemini/OpenAI/Claude API.
 * The LLM reads the query + all candidate snippets and returns a relevance
 * score for each.
 */
export function buildRerankerPrompt(query, candidates) {
  const snippets = candidates
    .map((c, i) => {
      const header = c.metadata?.filePath
        ? `[${i}] ${c.metadata.filePath}:${c.metadata.startLine}-${c.metadata.endLine}`
        : `[${i}] ${c.id}`;
      // Truncate very long chunks for the re-ranking prompt
      const content = c.metadata?.content
        ? c.metadata.content.slice(0, 500)
        : '(content not available)';
      return `${header}\n${content}`;
    })
    .join('\n---\n');

  return `You are a code relevance judge. Given a question about a codebase and a list of code snippets, score each snippet's relevance from 0 to 10.

Question: ${query}

Code snippets:
${snippets}

For each snippet [0] through [${candidates.length - 1}], respond with a JSON array of objects: [{"index": 0, "score": 7, "reason": "..."}, ...]

Score guide:
- 10: Directly answers the question (the exact function/class asked about)
- 7-9: Highly relevant (closely related code, configuration, or documentation)
- 4-6: Somewhat relevant (related module but not the specific code asked about)
- 1-3: Tangentially related (same area of codebase but different concern)
- 0: Not relevant at all`;
}

/**
 * Parse the LLM's re-ranking response.
 * Expects a JSON array of {index, score, reason} objects.
 */
export function parseRerankerResponse(response) {
  try {
    // Try to extract JSON from the response (LLMs sometimes wrap in markdown)
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map(item => ({
      index: item.index,
      score: item.score,
      reason: item.reason || '',
    }));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Re-ranker class — supports both heuristic and LLM modes
// ---------------------------------------------------------------------------

export class Reranker {
  /**
   * @param {Object} [options]
   * @param {'heuristic'|'llm'} [options.mode='heuristic'] - Re-ranking strategy
   * @param {Function} [options.llmCall] - async (prompt) => response string
   */
  constructor({ mode = 'heuristic', llmCall = null } = {}) {
    this.mode = mode;
    this.llmCall = llmCall;
  }

  /**
   * Re-rank candidates by relevance to the query.
   *
   * @param {string} query
   * @param {Object[]} candidates - Results from fusion (must have .id, .metadata)
   * @param {number} [topK=5]
   * @returns {Promise<Object[]>} Re-ranked results with .rerankerScore
   */
  async rerank(query, candidates, topK = 5) {
    if (candidates.length === 0) return [];

    let scored;

    if (this.mode === 'llm' && this.llmCall) {
      scored = await this._llmRerank(query, candidates);
    } else {
      scored = this._heuristicRerank(query, candidates);
    }

    // Sort by re-ranker score, take top K
    scored.sort((a, b) => b.rerankerScore - a.rerankerScore);
    return scored.slice(0, topK);
  }

  _heuristicRerank(query, candidates) {
    return candidates.map(c => ({
      ...c,
      rerankerScore: heuristicScore(query, {
        content: c.metadata?.content || '',
        name: c.metadata?.name || '',
      }),
    }));
  }

  async _llmRerank(query, candidates) {
    const prompt = buildRerankerPrompt(query, candidates);
    const response = await this.llmCall(prompt);
    const scores = parseRerankerResponse(response);

    if (!scores) {
      // Fallback to heuristic if LLM response is unparseable
      console.warn('LLM re-ranker response unparseable, falling back to heuristic');
      return this._heuristicRerank(query, candidates);
    }

    // Map scores back to candidates
    return candidates.map((c, i) => {
      const scoreEntry = scores.find(s => s.index === i);
      return {
        ...c,
        rerankerScore: scoreEntry ? scoreEntry.score : 0,
        rerankerReason: scoreEntry ? scoreEntry.reason : 'not scored',
      };
    });
  }
}
