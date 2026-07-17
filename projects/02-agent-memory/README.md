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
      │
      ▼
  ┌──────────────────────────────────────────────────────────┐
  │  Episodic Memory (SQLite + FTS5)                         │
  │  raw_input, raw_output, context, consolidated flag       │
  └──────────────┬───────────────────────────────────────────┘
                 │
                 │  consolidation gate (every 5 episodes OR urgent pattern)
                 ▼
  ┌──────────────────────────────────────────────────────────┐
  │  Consolidation Engine         consolidation.js           │
  │  ├─ extract facts (subject ─ predicate ─ object)         │
  │  ├─ conflict resolution (same subj+pred → update)        │
  │  ├─ extract procedural patterns (call_prep, intro)       │
  │  └─ mark stale facts (6+ months without reinforcement)   │
  └────────┬───────────────────────────────┬─────────────────┘
           ▼                               ▼
  ┌─────────────────────────┐   ┌─────────────────────────┐
  │  Semantic Memory        │   │  Procedural Memory      │
  │  subject → predicate:   │   │  trigger_pattern →      │
  │    object (+ confidence │   │    action_template      │
  │    + staleness flag)    │   │    (use_count ranked)   │
  └────────┬────────────────┘   └────────┬────────────────┘
           │                             │
           └──────────┬──────────────────┘
                      ▼
  ┌──────────────────────────────────────────────────────────┐
  │  Retrieval Pipeline                  retrieval.js        │
  │  ├─ FTS keyword search (episodic + semantic)             │
  │  ├─ direct subject lookup (exact match)                  │
  │  ├─ procedural trigger matching                          │
  │  ├─ score: relevance × 0.6 + recency × 0.4 − staleness │
  │  └─ deduplicate, sort, top-K                             │
  └──────────────────────────────────────────────────────────┘
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
