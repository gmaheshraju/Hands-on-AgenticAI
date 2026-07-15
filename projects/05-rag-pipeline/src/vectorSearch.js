/**
 * Vector Search — Embedding-Based Semantic Search
 *
 * This module handles:
 * 1. Generating embeddings for text chunks
 * 2. Storing them in memory (production would use a vector DB)
 * 3. Finding the most similar chunks via cosine similarity
 *
 * Embedding strategy:
 * - For demo: a deterministic mock embedding that captures word overlap
 *   (so the demo works without an API key)
 * - For production: pluggable — swap in OpenAI, Gemini, or local embeddings
 *
 * Why mock embeddings work for the demo:
 *   The mock builds a vocabulary vector where each dimension = a unique word.
 *   Cosine similarity on these bag-of-words vectors is equivalent to
 *   normalized word overlap — a reasonable baseline that lets us demonstrate
 *   the full pipeline end-to-end.
 */

// ---------------------------------------------------------------------------
// Embedding providers
// ---------------------------------------------------------------------------

/**
 * Mock embedding provider — bag-of-words vector.
 *
 * Production replacement would look like:
 *   const response = await fetch('https://api.openai.com/v1/embeddings', {
 *     method: 'POST',
 *     headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
 *   });
 *   return response.json().data[0].embedding;
 */
export class MockEmbeddingProvider {
  constructor() {
    this.vocabulary = new Map(); // word -> dimension index
    this.nextDim = 0;
  }

  /**
   * Build a vocabulary-index vector for the given text.
   * Each unique word gets a dimension; the value is TF (term frequency).
   */
  async embed(text) {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);

    // Register new words in the vocabulary
    for (const word of words) {
      if (!this.vocabulary.has(word)) {
        this.vocabulary.set(word, this.nextDim++);
      }
    }

    // Build sparse vector as a Map (dimension -> value)
    const tf = new Map();
    for (const word of words) {
      const dim = this.vocabulary.get(word);
      tf.set(dim, (tf.get(dim) || 0) + 1);
    }

    return { sparse: tf, dims: this.nextDim };
  }

  /**
   * Batch embed multiple texts.
   */
  async embedBatch(texts) {
    const results = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// Cosine similarity for sparse vectors
// ---------------------------------------------------------------------------

/**
 * Cosine similarity between two sparse vectors.
 *
 *   cos(A, B) = (A . B) / (|A| * |B|)
 *
 * Sparse representation makes this fast: we only iterate over non-zero
 * dimensions in the smaller vector.
 */
export function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  // Dot product: iterate over the smaller sparse map
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const [dim, valA] of smaller) {
    const valB = larger.get(dim);
    if (valB !== undefined) {
      dotProduct += valA * valB;
    }
  }

  // Norms
  for (const val of a.values()) normA += val * val;
  for (const val of b.values()) normB += val * val;

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (normA * normB);
}

// ---------------------------------------------------------------------------
// Vector Index
// ---------------------------------------------------------------------------

export class VectorIndex {
  /**
   * @param {Object} [options]
   * @param {Object} [options.embeddingProvider] - Must have embed(text) and embedBatch(texts)
   */
  constructor({ embeddingProvider = null } = {}) {
    this.provider = embeddingProvider || new MockEmbeddingProvider();
    this.documents = []; // [{id, embedding, metadata}]
  }

  /**
   * Add a document to the vector index.
   */
  async addDocument(id, text, metadata = {}) {
    const embedding = await this.provider.embed(text);
    this.documents.push({ id, embedding: embedding.sparse, metadata });
  }

  /**
   * Add multiple documents efficiently.
   */
  async addDocuments(docs) {
    const texts = docs.map(d => d.text);
    const embeddings = await this.provider.embedBatch(texts);

    for (let i = 0; i < docs.length; i++) {
      this.documents.push({
        id: docs[i].id,
        embedding: embeddings[i].sparse,
        metadata: docs[i].metadata,
      });
    }
  }

  /**
   * Search for the most similar documents to a query.
   *
   * @param {string} query - Natural language query
   * @param {number} [topK=10] - Number of results
   * @returns {Promise<Array<{id: string, score: number, metadata: Object}>>}
   */
  async search(query, topK = 10) {
    const queryEmbedding = await this.provider.embed(query);

    const scored = this.documents.map(doc => ({
      id: doc.id,
      score: cosineSimilarity(queryEmbedding.sparse, doc.embedding),
      metadata: doc.metadata,
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}
