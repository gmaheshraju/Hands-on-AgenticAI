/**
 * Reciprocal Rank Fusion (RRF)
 *
 * The problem: you have two ranked lists from different search systems
 * (BM25 keyword search and vector similarity search). Each uses a different
 * scoring scale. BM25 scores might be 0-15, vector cosine scores are 0-1.
 * You can't just add them.
 *
 * RRF solves this elegantly by converting scores to RANKS, then combining:
 *
 *   RRF_score(doc) = SUM over all rankers of: 1 / (k + rank_in_list)
 *
 * Where k is a constant (typically 60) that controls how much weight
 * top-ranked results get relative to lower-ranked ones.
 *
 * Why RRF beats alternatives:
 * - Score normalization (min-max) is fragile — one outlier distorts everything
 * - Z-score normalization assumes normal distributions (scores aren't)
 * - RRF is rank-based, so it's immune to score scale differences
 * - Used in production by Elasticsearch, Azure AI Search, and Pinecone
 *
 * Reference: Cormack, Clarke & Butt (2009) — "Reciprocal Rank Fusion
 * outperforms Condorcet and individual Rank Learning Methods"
 */

/**
 * @typedef {Object} SearchResult
 * @property {string} id       - Document/chunk ID
 * @property {number} score    - Score from the originating search system
 * @property {Object} metadata - Arbitrary metadata
 */

/**
 * Fuse multiple ranked result lists using Reciprocal Rank Fusion.
 *
 * @param {SearchResult[][]} resultLists - Array of ranked result arrays
 * @param {Object} [options]
 * @param {number} [options.k=60]     - RRF constant (higher = more uniform weighting)
 * @param {number} [options.topK=10]  - Number of results to return
 * @param {number[]} [options.weights] - Weight for each result list (default: equal)
 * @returns {SearchResult[]} Fused results, sorted by RRF score
 */
export function reciprocalRankFusion(resultLists, options = {}) {
  const { k = 60, topK = 10, weights = null } = options;

  // Validate weights if provided
  if (weights && weights.length !== resultLists.length) {
    throw new Error(
      `weights length (${weights.length}) must match resultLists length (${resultLists.length})`
    );
  }

  // RRF score accumulator: docId -> { score, metadata, sources }
  const fusedScores = new Map();

  for (let listIdx = 0; listIdx < resultLists.length; listIdx++) {
    const results = resultLists[listIdx];
    const weight = weights ? weights[listIdx] : 1;
    const sourceName = listIdx === 0 ? 'bm25' : listIdx === 1 ? 'vector' : `source_${listIdx}`;

    for (let rank = 0; rank < results.length; rank++) {
      const result = results[rank];
      const rrfScore = weight * (1 / (k + rank + 1)); // rank is 0-based, +1 to make it 1-based

      if (!fusedScores.has(result.id)) {
        fusedScores.set(result.id, {
          id: result.id,
          score: 0,
          metadata: result.metadata,
          sources: [],
          originalScores: {},
        });
      }

      const entry = fusedScores.get(result.id);
      entry.score += rrfScore;
      entry.sources.push(sourceName);
      entry.originalScores[sourceName] = {
        rank: rank + 1,
        score: result.score,
      };
    }
  }

  // Sort by fused score, return top K
  const fused = Array.from(fusedScores.values());
  fused.sort((a, b) => b.score - a.score);
  return fused.slice(0, topK);
}

/**
 * Debug helper: show why each document was ranked where it was.
 *
 * @param {Object[]} fusedResults - Output from reciprocalRankFusion
 * @returns {string} Human-readable explanation
 */
export function explainFusion(fusedResults) {
  const lines = ['=== RRF Fusion Explanation ===\n'];

  for (let i = 0; i < fusedResults.length; i++) {
    const r = fusedResults[i];
    const sources = r.sources.join(' + ');
    const origScores = Object.entries(r.originalScores)
      .map(([src, { rank, score }]) => `${src}: rank #${rank} (score ${score.toFixed(3)})`)
      .join(', ');

    lines.push(
      `#${i + 1} [${r.id}]`,
      `  RRF score: ${r.score.toFixed(4)}`,
      `  Found in: ${sources}`,
      `  Original: ${origScores}`,
      ''
    );
  }

  return lines.join('\n');
}
