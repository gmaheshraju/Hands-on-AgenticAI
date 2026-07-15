/**
 * BM25 Search — Implemented from Scratch
 *
 * BM25 (Best Matching 25) is the ranking function used by Elasticsearch,
 * Lucene, and most production search engines. It improves on raw TF-IDF
 * by adding two key ideas:
 *
 *   1. Term frequency saturation — the 50th occurrence of a word matters
 *      less than the 1st. Controlled by parameter k1.
 *
 *   2. Document length normalization — a 10-line function that mentions
 *      "cache" twice is more relevant than a 500-line file that mentions
 *      it twice. Controlled by parameter b.
 *
 * The formula for each (query_term, document) pair:
 *
 *   score = IDF(term) * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl/avgdl))
 *
 * Where:
 *   tf    = frequency of term in document
 *   dl    = document length (in tokens)
 *   avgdl = average document length across corpus
 *   IDF   = log((N - n + 0.5) / (n + 0.5) + 1)
 *   N     = total number of documents
 *   n     = number of documents containing the term
 *   k1    = 1.2 (typical) — controls saturation speed
 *   b     = 0.75 (typical) — controls length normalization strength
 */

// ---------------------------------------------------------------------------
// Tokenizer — simple but effective for code
// ---------------------------------------------------------------------------

/**
 * Tokenize text for BM25 indexing/search.
 *
 * For code search, we want to:
 * - Split camelCase and snake_case into parts
 * - Lowercase everything
 * - Remove very short tokens (< 2 chars)
 * - Keep numbers (they matter in code: "v2", "http2")
 */
export function tokenize(text) {
  // Split camelCase: "rateLimiter" -> "rate Limiter"
  let expanded = text.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Split snake_case: "rate_limiter" -> "rate limiter"
  expanded = expanded.replace(/_/g, ' ');

  // Split on non-alphanumeric, lowercase, filter short tokens
  return expanded
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2);
}

// ---------------------------------------------------------------------------
// BM25 Index
// ---------------------------------------------------------------------------

export class BM25Index {
  /**
   * @param {Object} [params]
   * @param {number} [params.k1=1.2] — Term frequency saturation
   * @param {number} [params.b=0.75] — Length normalization (0=off, 1=full)
   */
  constructor({ k1 = 1.2, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;

    // Document storage
    this.docs = [];           // [{id, tokens, length, metadata}]
    this.avgDocLength = 0;

    // Inverted index: term -> Set of doc indices
    this.invertedIndex = new Map();

    // Per-document term frequencies: docIndex -> Map(term -> count)
    this.termFreqs = [];
  }

  /**
   * Add a document to the index.
   *
   * @param {string} id       - Unique document/chunk ID
   * @param {string} text     - The document text
   * @param {Object} metadata - Arbitrary metadata to return with results
   */
  addDocument(id, text, metadata = {}) {
    const tokens = tokenize(text);
    const docIndex = this.docs.length;

    // Build term frequency map for this document
    const tf = new Map();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    // Update inverted index
    for (const term of tf.keys()) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Set());
      }
      this.invertedIndex.get(term).add(docIndex);
    }

    this.docs.push({ id, tokens, length: tokens.length, metadata });
    this.termFreqs.push(tf);

    // Recompute average document length
    const totalLength = this.docs.reduce((sum, d) => sum + d.length, 0);
    this.avgDocLength = totalLength / this.docs.length;
  }

  /**
   * Compute IDF for a term.
   *
   * IDF = log((N - n + 0.5) / (n + 0.5) + 1)
   *
   * The +1 inside the log prevents negative IDF for very common terms.
   * The 0.5 smoothing prevents division by zero.
   */
  idf(term) {
    const N = this.docs.length;
    const n = this.invertedIndex.has(term)
      ? this.invertedIndex.get(term).size
      : 0;
    return Math.log((N - n + 0.5) / (n + 0.5) + 1);
  }

  /**
   * Score a single document against a single term.
   *
   * score = IDF * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl/avgdl))
   */
  scoreTermDoc(term, docIndex) {
    const tf = this.termFreqs[docIndex].get(term) || 0;
    if (tf === 0) return 0;

    const dl = this.docs[docIndex].length;
    const idf = this.idf(term);

    const numerator = tf * (this.k1 + 1);
    const denominator = tf + this.k1 * (1 - this.b + this.b * (dl / this.avgDocLength));

    return idf * (numerator / denominator);
  }

  /**
   * Search the index. Returns results sorted by BM25 score (descending).
   *
   * @param {string} query - Natural language query
   * @param {number} [topK=10] - Number of results to return
   * @returns {Array<{id: string, score: number, metadata: Object}>}
   */
  search(query, topK = 10) {
    const queryTokens = tokenize(query);

    if (queryTokens.length === 0) return [];

    // Find candidate documents (union of all posting lists for query terms)
    const candidates = new Set();
    for (const token of queryTokens) {
      const postings = this.invertedIndex.get(token);
      if (postings) {
        for (const docIdx of postings) {
          candidates.add(docIdx);
        }
      }
    }

    // Score each candidate
    const scored = [];
    for (const docIdx of candidates) {
      let totalScore = 0;
      for (const token of queryTokens) {
        totalScore += this.scoreTermDoc(token, docIdx);
      }
      scored.push({
        id: this.docs[docIdx].id,
        score: totalScore,
        metadata: this.docs[docIdx].metadata,
      });
    }

    // Sort by score descending, take top K
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Debug: show the IDF and posting list size for query terms.
   * Useful for understanding why BM25 ranks things the way it does.
   */
  explain(query) {
    const tokens = tokenize(query);
    return tokens.map(token => ({
      token,
      idf: this.idf(token).toFixed(3),
      docFrequency: this.invertedIndex.has(token)
        ? this.invertedIndex.get(token).size
        : 0,
      totalDocs: this.docs.length,
    }));
  }
}
