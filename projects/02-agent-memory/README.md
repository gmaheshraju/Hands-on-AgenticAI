# Personal CRM Agent with Cross-Session Memory

A CLI chat agent that maintains a persistent knowledge graph of people, companies, and interactions across sessions. Built with three memory layers (episodic, semantic, procedural) backed by SQLite.

## Quick Start

```bash
npm install
npm run demo     # Watch the full demo with 30+ contacts
npm run chat     # Interactive CLI session
```

## Architecture

### Three Memory Layers

```
User Input
    |
    v
+-- Episodic Memory (raw logs) --------+
|   "met Priya at KubeCon, she leads   |
|    platform eng at Stripe"           |
+---------------------------------------+
    |
    | (consolidation gate: every 5 episodes)
    v
+-- Semantic Memory (distilled facts) --+
|   Priya -> company: Stripe           |
|   Priya -> role: platform eng        |
|   Priya -> met_at: KubeCon           |
|   Priya -> interested_in: observability |
+---------------------------------------+
    |
    v
+-- Procedural Memory (patterns) -------+
|   call_prep: pull facts + recent      |
|   interactions + interests + threads  |
+---------------------------------------+
```

### Key Components

- **`src/memory.js`** — SQLite-backed storage for all three memory types. FTS5 indexes for full-text search. Triggers keep FTS in sync automatically.

- **`src/consolidation.js`** — The consolidation gate. After N episodes accumulate, it extracts semantic facts using pattern matching (mock LLM) or a real LLM. Handles conflict resolution: if "Priya works at Stripe" is already stored and you say "Priya moved to Datadog", the old fact gets superseded, not duplicated.

- **`src/retrieval.js`** — Hybrid retrieval combining FTS keyword search, direct fact lookup, and procedural pattern matching. Results are scored by relevance (FTS rank), recency (exponential decay), confidence, and staleness.

- **`src/agent.js`** — The CRM agent. Classifies user intent (log interaction, query person, query topic, call prep), routes to the appropriate handler, and manages the consolidation lifecycle.

- **`src/cli.js`** — Interactive readline CLI with session persistence.

- **`src/demo.js`** — Full demo with 30+ contacts across 4 simulated sessions.

### Memory Lifecycle

1. **Every user message** is stored as an episodic entry (raw input + agent response + intent metadata)
2. **Every 5 episodes**, the consolidation gate fires:
   - Gathers unconsolidated episodes
   - Extracts facts (subject-predicate-object triples)
   - Checks for conflicts with existing facts (same subject + predicate)
   - Updates or creates facts accordingly
   - Marks episodes as consolidated
3. **Queries** search across all three layers with hybrid scoring
4. **Stale facts** (no reinforcement in 6 months) are flagged and ranked lower

### Conflict Resolution

When new information contradicts existing facts:
```
Existing:  Priya -> company: Stripe
New input: "Priya moved to Datadog"
Result:    Priya -> company: Datadog  (updated, previous value preserved in source trail)
```

The system uses subject+predicate as a composite key. Same subject+predicate = update, not duplicate.

## Commands

| Command | Example |
|---------|---------|
| Log interaction | `met Priya at KubeCon, she leads platform eng at Stripe` |
| Query person | `what do I know about Priya?` |
| Query topic | `who knows about Kafka?` |
| Call prep | `prep me for my call with Priya` |
| Update fact | `Priya moved to Datadog` |
| View stats | `stats` |
| List facts | `facts` |
| Help | `help` |

## Interview Talking Points

**The hard problem**: Consolidation — turning messy conversation logs into clean, non-redundant facts. The consolidation gate diffs new episodes against existing semantic memory and only writes genuinely new information. Conflict resolution uses subject+predicate as a natural key to detect when facts should be updated vs. created.

**Retrieval at scale**: Hybrid search combining SQLite FTS5 for keyword matching with direct fact lookup and procedural pattern matching. Results are re-ranked by a weighted combination of relevance, recency (exponential decay), confidence score, and staleness penalty.

**Memory decay**: Facts that aren't reinforced within 6 months get flagged as stale and ranked lower in retrieval. This prevents outdated information from dominating results.

## Files

```
src/
  memory.js          Three-layer SQLite store with FTS indexes
  consolidation.js   Episode-to-fact distillation engine
  retrieval.js       Hybrid search with relevance scoring
  agent.js           CRM agent with intent classification
  cli.js             Interactive CLI
  demo.js            Full demo scenario
```
