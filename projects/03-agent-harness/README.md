# Project 03: Research Agent with Observable Harness

A Node.js research agent wrapped in a fully instrumented harness that enforces three termination conditions and produces JSONL trace logs for every iteration.

## Architecture

```
  Question
      │
      ▼
  ┌─────────────────────────────────────────────────────────┐
  │  AgentHarness                            harness.js     │
  │                                                         │
  │  Termination gates:                                     │
  │    ├─ iteration cap (default 20)                        │
  │    ├─ cost cap (default $1.00)                          │
  │    └─ convergence (3 consecutive zero-fact iterations)  │
  │                                                         │
  │  ┌───────────────────────────────────────────────────┐  │
  │  │  ResearchAgent loop              agent.js         │  │
  │  │                                                   │  │
  │  │    ┌──────────┐   plan    ┌──────────┐            │  │
  │  │    │ Observe  ├──────────▸│  Think   │            │  │
  │  │    └────▲─────┘           └────┬─────┘            │  │
  │  │         │                      │                  │  │
  │  │         │  result         tool │ call             │  │
  │  │         │                      ▼                  │  │
  │  │    ┌────┴─────┐           ┌──────────┐            │  │
  │  │    │ Evaluate │◂──────────┤   Act    │            │  │
  │  │    └──────────┘           └────┬─────┘            │  │
  │  └────────────────────────────────┼──────────────────┘  │
  │                                   ▼                     │
  │  ┌───────────────────────────────────────────────────┐  │
  │  │  Tool Registry               tools.js             │  │
  │  │  webSearch │ readPage │ noteFindings │ synthesize  │  │
  │  └───────────────────────────────────────────────────┘  │
  │                         │                               │
  │  ┌──────────────────────▼────────────────────────────┐  │
  │  │  Tracer (per-iteration JSONL)     tracer.js       │  │
  │  │  tokens, cost, duration, new_facts_added          │  │
  │  └───────────────────────────────────────────────────┘  │
  └──────────────┬──────────────────────┬───────────────────┘
                 ▼                      ▼
            Report.md            trace-*.jsonl
```

## Quick Start

```bash
# Full research run (default question: Pinecone vs Weaviate vs Qdrant)
node src/demo.js

# Custom question
node src/demo.js "Compare Redis vs Memcached for session caching"

# Demo convergence detection
node src/demo.js --convergence

# Demo cost cap termination
node src/demo.js --cost-cap
```

## Files

| File | Purpose |
|------|---------|
| `src/harness.js` | Observable harness — iteration/cost/convergence caps + tracing |
| `src/agent.js` | Research agent — Observe/Think/Act/Evaluate loop |
| `src/tools.js` | Tool implementations with mock data |
| `src/tracer.js` | JSONL trace writer with per-iteration metrics |
| `src/demo.js` | Demo runner with three modes |

## Termination Conditions

1. **Iteration cap** — hard stop at 20 iterations (configurable)
2. **Cost cap** — hard stop when cumulative cost exceeds $1.00 (configurable)
3. **Convergence** — stops when 3 consecutive iterations add zero new facts to the report

## Trace Format

Each iteration writes one JSON line:

```json
{
  "timestamp": "2026-07-15T10:30:00.000Z",
  "run_id": "2026-07-15T10-30-00-000Z",
  "iteration": 5,
  "thought": "Need pricing data for Qdrant",
  "tool": "webSearch",
  "tool_input": { "query": "qdrant pricing" },
  "duration_ms": 120,
  "tokens_in": 450,
  "tokens_out": 120,
  "cost_usd": 0.00315,
  "cumulative_cost": 0.02100,
  "new_facts_added": 2
}
```

