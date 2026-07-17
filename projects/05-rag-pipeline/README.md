# Project 05: Codebase Q&A with Hybrid RAG

A Node.js implementation of a hybrid RAG (Retrieval-Augmented Generation) pipeline for answering questions about codebases. Combines BM25 keyword search, vector similarity search, Reciprocal Rank Fusion, and LLM re-ranking.

## Quick Start

```bash
node src/demo.js
```

No dependencies required — runs on Node.js 18+ with zero npm packages.

## Architecture

```
  ┌──────────────────────────────────────────────────────────┐
  │                    SOURCE FILES                          │
  └────────────────────────┬─────────────────────────────────┘
                           ▼
  ┌──────────────────────────────────────────────────────────┐
  │  chunker.js ── Code-Aware Chunking                      │
  │  Split by function/class/section boundaries              │
  └────────────────────────┬─────────────────────────────────┘
                           ▼
          ┌────────────────┴────────────────┐
          ▼                                 ▼
  ┌───────────────────┐           ┌───────────────────┐
  │  bm25.js          │           │  vectorSearch.js   │
  │  Inverted Index   │           │  Sparse Embeddings │
  │  TF-IDF + length  │           │  Cosine Similarity │
  │  normalization    │           │                    │
  └────────┬──────────┘           └────────┬──────────┘
           │        QUERY                  │
           ▼        ─────                  ▼
  ┌───────────────────┐           ┌───────────────────┐
  │  BM25 Search      │           │  Vector Search     │
  │  top-K keywords   │           │  top-K semantic    │
  └────────┬──────────┘           └────────┬──────────┘
           │                               │
           └───────────┬───────────────────┘
                       ▼
  ┌──────────────────────────────────────────────────────────┐
  │  fusion.js ── Reciprocal Rank Fusion (RRF)              │
  │  score = 1/(k + rank_bm25) + 1/(k + rank_vec)          │
  │  Rank-based merge → immune to score-scale differences   │
  └────────────────────────┬─────────────────────────────────┘
                           ▼
  ┌──────────────────────────────────────────────────────────┐
  │  reranker.js ── LLM Re-Ranking                          │
  │  Score each candidate 0-10 for query relevance          │
  └────────────────────────┬─────────────────────────────────┘
                           ▼
  ┌──────────────────────────────────────────────────────────┐
  │  pipeline.js ── Answer Generation                       │
  │  LLM produces answer with file:line source citations    │
  └──────────────────────────────────────────────────────────┘
```

## Key Files

| File | What It Does | Key Concept |
|------|-------------|-------------|
| `src/chunker.js` | Splits code by function/class boundaries | Language-aware chunking vs naive char splitting |
| `src/bm25.js` | BM25 search from scratch | TF-IDF + length normalization + term saturation |
| `src/vectorSearch.js` | Embedding-based semantic search | Cosine similarity on sparse vectors |
| `src/fusion.js` | Reciprocal Rank Fusion (RRF) | Rank-based merging immune to score scale diffs |
| `src/reranker.js` | LLM re-ranking of candidates | Precision boost at latency cost |
| `src/pipeline.js` | Full RAG pipeline orchestration | Chunk -> Index -> Search -> Rerank -> Generate |
| `src/demo.js` | Working demo with sample codebase | End-to-end walkthrough |

## BM25 — The Learning Piece

BM25 is the ranking function behind Elasticsearch and Lucene. The implementation in `src/bm25.js` builds it from scratch:

```
score(term, doc) = IDF(term) * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl/avgdl))
```

**Three ideas that make BM25 better than raw TF-IDF:**

1. **IDF (Inverse Document Frequency)** — Rare terms matter more. "rateLimiter" appearing in 1/20 docs scores higher than "const" appearing in 20/20.

2. **Term frequency saturation (k1)** — The 50th occurrence of a word matters less than the 1st. Controlled by k1 (typically 1.2). Without saturation, keyword-stuffed docs dominate.

3. **Length normalization (b)** — A 10-line function mentioning "cache" twice is more relevant than a 500-line file mentioning it twice. Controlled by b (typically 0.75). b=0 disables normalization, b=1 applies full normalization.

## RRF — The Production Pattern

Reciprocal Rank Fusion solves the "different score scales" problem:

```
RRF_score(doc) = SUM over rankers of: 1 / (k + rank)
```

**Why not just normalize scores?**
- Min-max normalization: one outlier score distorts the entire range
- Z-score normalization: assumes normal distribution (search scores aren't)
- RRF uses ranks, not scores, so it works regardless of scale

**Used in production by:** Elasticsearch, Azure AI Search, Pinecone, Weaviate.

## Extending to Production

To use real embeddings and LLM:

```javascript
import { RAGPipeline } from './src/pipeline.js';

const pipeline = new RAGPipeline({
  rerankerMode: 'llm',
  llmCall: async (prompt) => {
    // Call your LLM API here (Gemini, OpenAI, Claude, etc.)
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: 'gpt-4', messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await response.json();
    return data.choices[0].message.content;
  },
});
```

For real vector embeddings, implement the `embed(text)` method on a custom provider and pass it to the VectorIndex constructor.
