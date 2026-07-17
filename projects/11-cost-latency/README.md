# Project 11: Optimize an Agent from $2 to $0.15

LLM agent cost optimization toolkit. Four independently toggleable optimizations that compound to reduce per-conversation cost by ~90%.

## Quick Start

```bash
cd projects/11-cost-latency
node src/demo.js          # Full before/after demo with comparison table
node src/benchmark.js     # Just the benchmark numbers
```

## Individual Optimizations

```bash
node src/baseline.js            # Measure unoptimized baseline
node src/promptCompression.js   # Optimization 1: compress prompts
node src/semanticCache.js       # Optimization 2: semantic caching
node src/modelRouter.js         # Optimization 3: complexity-based routing
node src/earlyTermination.js    # Optimization 4: stop generation early
```

## Architecture

```
                    Conversation Query
                           │
                           ▼
                ┌──────────────────────┐
                │ 1. Prompt Compressor │  System prompt: 400 → 150 tokens
                │    History summarize │  Keep last 2 exchanges in full
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐    ┌──────────────┐
                │ 2. Semantic Cache    │───▶│  Cache HIT   │──▶ Response (zero LLM cost)
                │    Trigram + cosine  │    └──────────────┘
                │    similarity ≥ 0.85 │
                └──────────┬───────────┘
                           │ miss
                           ▼
                ┌──────────────────────┐
                │ 3. Model Router      │
                │    Classify complexity│
                │    ┌─────┬─────┬────┐│
                │    │simpl│ mid │comp││
                │    └──┬──┴──┬──┴──┬─┘│
                └───────│─────│─────│──┘
                        ▼     ▼     ▼
                     Haiku  Mid  Frontier
                    (cheap)      (full)
                        │     │     │
                        ▼     ▼     ▼
                ┌──────────────────────┐
                │ 4. Early Termination │  Detect "complete enough" response
                │    Truncate at next  │  sentence boundary
                └──────────┬───────────┘
                           │
                           ▼
                      Response

          ┌────────────────────────────────────┐
          │ Cost Tracker (all stages)          │
          │ Tokens in/out, model tier, cache   │
          │ hit rate, latency, quality score   │
          └────────────────────────────────────┘
```

### File Structure

```
data/conversations.json    50 sample customer support conversations
src/baseline.js            Token counting, cost calculation, simulated LLM calls
src/promptCompression.js   System prompt audit + conversation history summarizer
src/semanticCache.js       Embedding-based cache with cosine similarity + TTL
src/modelRouter.js         Complexity classifier + model tier routing
src/earlyTermination.js    Response completeness detection + streaming
src/benchmark.js           Cumulative measurement across all optimizations
src/demo.js                Side-by-side before/after + comparison table
```

## How Each Optimization Works

### 1. Prompt Compression
- Rewrites the 400+ token system prompt to ~150 tokens (same behavior)
- Summarizes older conversation turns into a compact summary
- Keeps only the last 2 message exchanges in full

### 2. Semantic Caching
- Embeds queries using character trigram + word-level hashing
- Cosine similarity matching (threshold: 0.85)
- TTL-based expiration prevents stale responses
- Cache hits return instantly at zero LLM cost

### 3. Model Routing
- Classifies query complexity: simple / medium / complex
- Routes to cheap (haiku-class), mid, or frontier model
- Technical/diagnostic queries stay on frontier; FAQ goes to cheap

### 4. Early Termination
- Detects when a response is "complete enough" (answer + closing signal)
- Truncates at next sentence boundary after completeness threshold
- Combined with streaming for near-instant perceived latency

## Configuration

Each optimization is independently toggleable:

```js
import { runOptimizedPipeline } from './src/benchmark.js';

const result = runOptimizedPipeline(conversations, {
  promptCompression: true,
  semanticCaching: true,
  modelRouting: true,
  earlyTermination: false,  // disable one to measure its impact
});
```

## The Deliverable

The comparison table showing cumulative impact at each stage:

```
| Stage                  | Cost/Conv | Latency | Quality | Notes                    |
|------------------------|-----------|---------|---------|--------------------------|
| Baseline               |   $X.XXXX |  XXXXms |    92%  |                          |
| + Prompt Compression   |   $X.XXXX |  XXXXms |    89%  | 62% prompt token cut     |
| + Semantic Cache       |   $X.XXXX |  XXXXms |    89%  | ~20% cache hit rate      |
| + Model Routing        |   $X.XXXX |  XXXXms |    87%  | ~60% routed to cheap     |
| + Early Termination    |   $X.XXXX |  XXXXms |    84%  | ~35% early stopped       |
```

Run `node src/demo.js` to see the actual numbers.

