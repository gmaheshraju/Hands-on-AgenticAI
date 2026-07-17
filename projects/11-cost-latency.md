# Capstone 11: Optimize an Existing Agent from $2 to $0.15 Per Conversation

## The Problem

You have a working customer support agent (build one, or use any of the previous capstones). It costs $2 per conversation and takes 8 seconds average response time. Your product manager says: "Get it under $0.15 and under 2 seconds, without noticeable quality loss." This is the optimization problem every AI product team faces.

## What You Build

Take an existing agent and apply four optimization techniques, measuring the impact of each.

## Architecture Requirements

### Baseline Measurement

Before optimizing, measure your starting point across 50 representative conversations:
- Average cost per conversation (tokens * price)
- Average latency (time to first token, total response time)
- Quality score (use your eval harness from Capstone 08, or a simple LLM-as-judge)

### Optimization 1: Prompt Compression

1. Audit your system prompt — how many tokens is it? Most system prompts are 2-3x longer than they need to be.
2. Rewrite it to be shorter while preserving behavior. Measure quality after compression.
3. For multi-turn conversations: compress conversation history. Instead of sending all previous messages, send a summary of the conversation so far + the last 2 messages.
4. Measure: token reduction, quality impact, cost savings.

### Optimization 2: Semantic Caching

1. Build a cache layer: before calling the LLM, check if a semantically similar question was asked recently.
2. Embed the incoming question, compare against cached question embeddings (cosine similarity > 0.95 = cache hit).
3. Cache the response with a TTL (time-to-live) — stale cache is worse than no cache.
4. Measure: cache hit rate on your 50 test conversations, cost savings, latency improvement.

### Optimization 3: Model Routing

1. Implement the complexity classifier from Capstone 06 (or a simpler version).
2. Route simple questions to a cheap model, complex ones to the frontier model.
3. Measure: cost breakdown by model tier, quality impact per tier, escalation rate.

### Optimization 4: Streaming + Early Termination

1. Use streaming responses so the user sees tokens as they arrive (perceived latency).
2. Implement early termination: if the model has answered the question in the first 100 tokens, stop generation (don't let it ramble).
3. Measure: perceived latency improvement, token savings from early termination.

### Final Comparison

Produce a table showing the cumulative impact:

```
| Stage                  | Cost/Conv | Latency | Quality | Notes                    |
|-----------------------|-----------|---------|---------|--------------------------|
| Baseline              |           |         |         |                          |
| + Prompt Compression  |           |         |         | X% token reduction       |
| + Semantic Cache      |           |         |         | X% cache hit rate        |
| + Model Routing       |           |         |         | X% routed to cheap model |
| + Early Termination   |           |         |         | X% avg tokens saved      |
```

## What Makes This Not a Toy

- Each optimization has a quality cost — the question is whether it's noticeable
- Semantic caching sounds simple but the similarity threshold is critical: too low = stale answers, too high = no cache hits
- Prompt compression can silently break edge cases — you need evals to catch this
- These optimizations compound: 40% + 30% + 25% savings doesn't equal 95% — measure the actual compound effect
- The real deliverable is the comparison table with real numbers, not the code

## Evaluation Criteria

- Did each optimization produce measurable cost savings?
- Did you measure quality impact for each (not just assume it's fine)?
- Is the final cost under $0.15 per conversation?
- Is the final latency under 2 seconds?
- Did quality drop more than 10%? If so, which optimization caused it?

## Stack

- The agent from a previous capstone (or any LLM-powered application)
- Embedding model for semantic caching
- Redis or in-memory cache (Map) for the cache layer
- Multiple LLM providers/tiers for routing

