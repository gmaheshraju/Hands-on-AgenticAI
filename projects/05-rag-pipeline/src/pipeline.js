/**
 * RAG Pipeline — Full End-to-End Codebase Q&A
 *
 * The pipeline:
 *   1. CHUNK   — Split source files into semantic units (functions, classes, sections)
 *   2. INDEX   — Build both BM25 and vector indexes from chunks
 *   3. SEARCH  — Run BM25 + vector search in parallel
 *   4. FUSE    — Merge results with Reciprocal Rank Fusion
 *   5. RERANK  — LLM (or heuristic) scores each candidate for relevance
 *   6. GENERATE — LLM produces an answer with source citations
 *
 * Each step is a separate module that can be tested and swapped independently.
 */

import { chunkFile, shouldIndex, detectLanguage } from './chunker.js';
import { BM25Index } from './bm25.js';
import { VectorIndex } from './vectorSearch.js';
import { reciprocalRankFusion, explainFusion } from './fusion.js';
import { Reranker, buildRerankerPrompt } from './reranker.js';

// ---------------------------------------------------------------------------
// Answer generation prompt
// ---------------------------------------------------------------------------

function buildAnswerPrompt(query, topChunks) {
  const context = topChunks
    .map((chunk, i) => {
      const loc = chunk.metadata?.filePath
        ? `${chunk.metadata.filePath}:${chunk.metadata.startLine}-${chunk.metadata.endLine}`
        : chunk.id;
      const name = chunk.metadata?.name ? ` (${chunk.metadata.name})` : '';
      return `--- Source ${i + 1}: ${loc}${name} ---\n${chunk.metadata?.content || '(no content)'}`;
    })
    .join('\n\n');

  return `You are a codebase expert. Answer the question using ONLY the provided source code snippets. Follow these rules strictly:

1. Cite specific file paths and line numbers for every claim
2. If the snippets don't contain the answer, say "I couldn't find this in the indexed codebase" — do NOT guess or hallucinate
3. Be specific and technical — mention function names, variable names, patterns used
4. Keep the answer concise but complete

Question: ${query}

Source code context:
${context}

Answer:`;
}

// ---------------------------------------------------------------------------
// Mock LLM for demo (structured response without API call)
// ---------------------------------------------------------------------------

function mockGenerateAnswer(query, topChunks) {
  if (topChunks.length === 0) {
    return "I couldn't find any relevant code in the indexed codebase for this question.";
  }

  const lines = [];
  lines.push(`Based on the indexed codebase, here is what I found:\n`);

  for (const chunk of topChunks) {
    const loc = chunk.metadata?.filePath
      ? `${chunk.metadata.filePath}:${chunk.metadata.startLine}-${chunk.metadata.endLine}`
      : chunk.id;
    const name = chunk.metadata?.name;

    if (name) {
      lines.push(`- **${name}** in \`${loc}\``);
    } else {
      lines.push(`- Code in \`${loc}\``);
    }

    // Extract a brief description from the content
    const content = chunk.metadata?.content || '';
    const firstComment = content.match(/\/\*\*[\s\S]*?\*\/|\/\/.*|#.*/);
    if (firstComment) {
      const cleaned = firstComment[0]
        .replace(/\/\*\*|\*\/|\*|\/\/|#/g, '')
        .trim()
        .slice(0, 120);
      if (cleaned) {
        lines.push(`  ${cleaned}`);
      }
    }
  }

  lines.push('\nSources:');
  for (const chunk of topChunks) {
    const loc = chunk.metadata?.filePath
      ? `${chunk.metadata.filePath}:${chunk.metadata.startLine}-${chunk.metadata.endLine}`
      : chunk.id;
    lines.push(`- ${loc}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// RAG Pipeline
// ---------------------------------------------------------------------------

export class RAGPipeline {
  /**
   * @param {Object} [options]
   * @param {number} [options.bm25TopK=20]      - BM25 candidates per query
   * @param {number} [options.vectorTopK=20]     - Vector candidates per query
   * @param {number} [options.fusionTopK=15]     - Results after RRF fusion
   * @param {number} [options.rerankerTopK=5]    - Final results after re-ranking
   * @param {number} [options.rrfK=60]           - RRF constant
   * @param {string} [options.rerankerMode='heuristic'] - 'heuristic' or 'llm'
   * @param {Function} [options.llmCall]         - async (prompt) => response
   * @param {boolean} [options.verbose=false]    - Log pipeline steps
   */
  constructor(options = {}) {
    this.bm25TopK = options.bm25TopK || 20;
    this.vectorTopK = options.vectorTopK || 20;
    this.fusionTopK = options.fusionTopK || 15;
    this.rerankerTopK = options.rerankerTopK || 5;
    this.rrfK = options.rrfK || 60;
    this.verbose = options.verbose || false;
    this.llmCall = options.llmCall || null;

    // Initialize components
    this.bm25 = new BM25Index();
    this.vectorIndex = new VectorIndex();
    this.reranker = new Reranker({
      mode: options.rerankerMode || 'heuristic',
      llmCall: options.llmCall,
    });

    // Chunk storage for retrieval
    this.chunks = new Map(); // id -> chunk
    this.stats = { files: 0, chunks: 0, skipped: 0 };
  }

  // -------------------------------------------------------------------------
  // Step 1 + 2: Chunk and Index
  // -------------------------------------------------------------------------

  /**
   * Index a single file.
   */
  async indexFile(content, filePath) {
    if (!shouldIndex(filePath)) {
      this.stats.skipped++;
      return 0;
    }

    const fileChunks = chunkFile(content, filePath);
    this.stats.files++;

    for (const chunk of fileChunks) {
      // Store chunk for later retrieval
      this.chunks.set(chunk.id, chunk);

      const metadata = {
        filePath: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        name: chunk.name,
        language: chunk.language,
        content: chunk.content,
      };

      // Add to both indexes
      this.bm25.addDocument(chunk.id, chunk.content, metadata);
      await this.vectorIndex.addDocument(chunk.id, chunk.content, metadata);

      this.stats.chunks++;
    }

    return fileChunks.length;
  }

  /**
   * Index multiple files at once.
   *
   * @param {Array<{path: string, content: string}>} files
   */
  async indexFiles(files) {
    const startTime = Date.now();

    for (const file of files) {
      await this.indexFile(file.content, file.path);
    }

    const elapsed = Date.now() - startTime;
    if (this.verbose) {
      console.log(
        `Indexed ${this.stats.files} files, ${this.stats.chunks} chunks ` +
        `(${this.stats.skipped} skipped) in ${elapsed}ms`
      );
    }

    return this.stats;
  }

  // -------------------------------------------------------------------------
  // Steps 3-5: Search, Fuse, Rerank
  // -------------------------------------------------------------------------

  /**
   * Full search pipeline: BM25 + Vector -> RRF -> Rerank
   *
   * @param {string} query
   * @returns {Promise<Object>} { results, debug }
   */
  async search(query) {
    const debug = { timings: {} };
    let t0;

    // Step 3a: BM25 keyword search
    t0 = Date.now();
    const bm25Results = this.bm25.search(query, this.bm25TopK);
    debug.timings.bm25 = Date.now() - t0;
    debug.bm25Count = bm25Results.length;

    // Step 3b: Vector semantic search
    t0 = Date.now();
    const vectorResults = await this.vectorIndex.search(query, this.vectorTopK);
    debug.timings.vector = Date.now() - t0;
    debug.vectorCount = vectorResults.length;

    // Step 4: RRF Fusion
    t0 = Date.now();
    const fusedResults = reciprocalRankFusion(
      [bm25Results, vectorResults],
      { k: this.rrfK, topK: this.fusionTopK }
    );
    debug.timings.fusion = Date.now() - t0;
    debug.fusionCount = fusedResults.length;
    debug.fusionExplanation = explainFusion(fusedResults);

    // Step 5: Re-rank
    t0 = Date.now();
    const rerankedResults = await this.reranker.rerank(query, fusedResults, this.rerankerTopK);
    debug.timings.rerank = Date.now() - t0;

    if (this.verbose) {
      console.log(`Search: BM25=${debug.bm25Count}, Vector=${debug.vectorCount}, ` +
        `Fused=${debug.fusionCount}, Reranked=${rerankedResults.length}`);
      console.log(`Timings: BM25=${debug.timings.bm25}ms, Vector=${debug.timings.vector}ms, ` +
        `Fusion=${debug.timings.fusion}ms, Rerank=${debug.timings.rerank}ms`);
    }

    return { results: rerankedResults, debug };
  }

  // -------------------------------------------------------------------------
  // Step 6: Answer generation
  // -------------------------------------------------------------------------

  /**
   * Full RAG pipeline: search + generate answer.
   *
   * @param {string} query
   * @returns {Promise<Object>} { answer, sources, debug }
   */
  async ask(query) {
    // Search phase
    const { results, debug } = await this.search(query);

    // Generate answer
    const t0 = Date.now();
    let answer;

    if (this.llmCall) {
      // Production: send to LLM
      const prompt = buildAnswerPrompt(query, results);
      answer = await this.llmCall(prompt);
      debug.answerPromptTokens = prompt.length; // approximate
    } else {
      // Demo: structured mock answer
      answer = mockGenerateAnswer(query, results);
    }
    debug.timings.generate = Date.now() - t0;

    // Extract source citations
    const sources = results.map(r => ({
      file: r.metadata?.filePath,
      lines: `${r.metadata?.startLine}-${r.metadata?.endLine}`,
      name: r.metadata?.name,
      relevanceScore: r.rerankerScore,
    }));

    return { answer, sources, debug };
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  /**
   * Get indexing statistics.
   */
  getStats() {
    return {
      ...this.stats,
      bm25VocabSize: this.bm25.invertedIndex.size,
      avgDocLength: Math.round(this.bm25.avgDocLength),
    };
  }

  /**
   * Explain BM25 scoring for a query (debug tool).
   */
  explainBM25(query) {
    return this.bm25.explain(query);
  }
}
