# Capstone 02: Personal CRM Agent with Cross-Session Memory

## The Problem

You meet people at conferences, on calls, in Slack. Six months later someone says "Hey, talk to Priya about the Kafka migration" and you can't remember who Priya is, what she works on, or when you last spoke. You need an agent that remembers people, relationships, and context across conversations — and retrieves the right memory at the right time.

## What You Build

A CLI chat agent that maintains a persistent knowledge graph of people and interactions.

**Commands:**
- `met Priya at KubeCon, she leads platform eng at Stripe, interested in our observability stack`
- `who knows about Kafka migrations?`
- `what do I know about Stripe?`
- `prep me for my call with Priya tomorrow`

## Architecture Requirements

1. **Three memory types:**
   - **Episodic** — Raw interaction logs with timestamps. "Met Priya at KubeCon on 2024-03-15."
   - **Semantic** — Distilled facts. "Priya → leads platform eng at Stripe. Interested in observability."
   - **Procedural** — Learned patterns. "When prepping for calls, pull recent interactions + their interests + open threads."

2. **Memory storage** — Use a local SQLite database with a vector column (via `sqlite-vec` or similar). Each memory gets a text embedding for semantic search.

3. **Consolidation gate** — After every 10 episodic entries, run a consolidation pass: use the LLM to extract new semantic facts from recent episodes. "From the last 10 interactions, what new facts should I remember?"

4. **Retrieval** — When the user asks a question, combine keyword search (SQLite FTS) and vector similarity. Re-rank results by recency and relevance.

5. **Decay** — Memories older than 6 months without reinforcement get flagged as "stale" and ranked lower.

## What Makes This Not a Toy

- Memory conflicts: "Priya moved from Stripe to Datadog" — the agent must update, not duplicate
- Retrieval precision matters: "who knows about Kafka?" should find people who mentioned Kafka in passing, not just people named Kafka
- The consolidation gate is the hard part — distilling 10 messy conversations into clean facts without losing nuance
- Scale: after 500 entries, naive retrieval breaks. You need hybrid search + re-ranking

## Evaluation Criteria

Populate the system with 50+ entries about different people. Then:
- Query precision: does "who works on infrastructure?" return the right people?
- Conflict resolution: update someone's company — does the old fact get superseded?
- Consolidation quality: are the distilled facts accurate and non-redundant?
- Retrieval latency: under 500ms for any query

## Stack

- Node.js or Python
- SQLite + vector extension (sqlite-vec, sqlite-vss)
- Any embedding model (OpenAI `text-embedding-3-small`, Voyage, etc.)
- Any LLM for consolidation and chat

