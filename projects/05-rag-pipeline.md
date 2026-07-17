# Capstone 05: Codebase Q&A with Hybrid RAG

## The Problem

A new engineer joins your team. They have 200 questions about the codebase: "Where is authentication handled?" "How does the billing pipeline work?" "What's the retry logic for webhook delivery?" Today, they grep, read docs (outdated), and interrupt senior engineers. You need a RAG system that can answer questions about your actual codebase.

## What You Build

A CLI tool that indexes a real codebase and answers questions about it with source citations.

**Setup:** `node index.js ./path/to/repo`

**Query:** `node ask.js "How does the rate limiter work?"`

**Output:**
```
The rate limiter uses a sliding window algorithm implemented in 
src/middleware/rateLimiter.ts (lines 45-89). It tracks requests 
per IP using a Redis sorted set with timestamps as scores...

Sources:
- src/middleware/rateLimiter.ts:45-89 (implementation)
- src/config/limits.ts:12-18 (configuration)  
- docs/api-rate-limits.md (documentation)
```

## Architecture Requirements

1. **Chunking strategy** — Don't just split on character count. Implement language-aware chunking:
   - Code files: chunk by function/class boundaries (use a simple AST parser or regex for function boundaries)
   - Markdown/docs: chunk by heading sections
   - Each chunk keeps metadata: file path, line numbers, language, parent function/class name

2. **Embedding** — Embed each chunk using a real embedding model. Store in a local vector database (ChromaDB, LanceDB, or SQLite with vector extension).

3. **Hybrid search** — For every query, run both:
   - **Vector search:** cosine similarity against embeddings (top 20)
   - **Keyword search:** BM25 or FTS against the raw text (top 20)
   - **Merge with RRF:** Reciprocal Rank Fusion to combine both result sets

4. **Re-ranking** — After hybrid search returns ~20 candidates, re-rank them using the LLM: "Given the question X, rank these code snippets by relevance." Return top 5.

5. **Answer generation** — Feed the top 5 chunks as context to the LLM. The answer must cite specific files and line numbers. If the context doesn't contain the answer, say so — don't hallucinate.

## What Makes This Not a Toy

- Real codebases have 10,000+ files — you can't embed everything. You need to filter (skip node_modules, binaries, generated code)
- Code chunking is hard: a 500-line function shouldn't be split in the middle
- Keyword search catches exact matches that embeddings miss (function names, config keys, error messages)
- The LLM re-ranker is expensive but dramatically improves relevance vs. pure vector similarity
- Hallucination is the #1 failure mode: the model confidently describes code that doesn't exist

## Evaluation Criteria

Index a real open-source repo you know well (at least 100 files). Write 10 questions you know the answer to. For each:
- Did it find the right source files? (retrieval precision)
- Did it cite the correct line numbers? (citation accuracy)
- Did it answer correctly? (answer quality)
- Did it refuse when the codebase doesn't contain the answer? (hallucination detection)
- Latency: indexing time and query time

## Stack

- Node.js or Python
- Vector store: ChromaDB, LanceDB, or sqlite-vec
- Embedding model: OpenAI `text-embedding-3-small` or local (nomic-embed)
- Any LLM for re-ranking and answer generation
- Tree-sitter or regex for code-aware chunking

