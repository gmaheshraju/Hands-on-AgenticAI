# Project 18: Agentic Workflow Engine

A DAG-based workflow engine where each node is an LLM call, tool execution, human approval gate, conditional branch, parallel fan-out, or data transformation.

## Architecture

```
Workflow JSON Definition
        |
        v
  ┌─────────────┐
  │  Validation  │  — verify nodes, edges, types, cycle detection
  └──────┬──────┘
         v
  ┌─────────────┐
  │  Topo Sort   │  — Kahn's algorithm, produces parallel layers
  └──────┬──────┘
         v
  ┌─────────────┐
  │  Execution   │  — layer by layer, independent nodes in parallel
  │  Engine      │  — retry w/ backoff, state machine, condition branches
  └──────┬──────┘
         v
  ┌─────────────┐
  │  Trace +     │  — per-node timing, retries, inputs/outputs
  │  Summary     │
  └─────────────┘
```

## Node Types

| Type | Description |
|------|-------------|
| `llm` | Call an LLM with a prompt template + input interpolation |
| `tool` | Execute a registered function (API call, DB query, etc.) |
| `approval` | Pause workflow for human approval (auto-approves in demo) |
| `condition` | Branch based on a field value (if/else with operator support) |
| `parallel` | Fan out to multiple sub-tasks, collect all results |
| `transform` | Pure data transformation (pick, merge, compose, format, map, filter) |

## Run

```bash
node src/demo.js
```

## Workflow DSL

Workflows are defined in JSON with three top-level arrays:

```json
{
  "id": "my-workflow",
  "nodes": [
    { "id": "step1", "type": "llm", "config": { "prompt": "..." } },
    { "id": "step2", "type": "tool", "config": { "tool": "myTool" } }
  ],
  "edges": [
    { "from": "step1", "to": "step2" }
  ]
}
```

Conditional edges use `conditionBranch`:

```json
{ "from": "check", "to": "yes-path", "conditionBranch": "true" },
{ "from": "check", "to": "no-path", "conditionBranch": "false" }
```

## Demo Workflows

1. **Content Pipeline** — research -> write -> review -> approval -> format -> publish
2. **Customer Onboarding** — verify email -> credit check -> condition (approved?) -> approval -> welcome email OR rejection
3. **Incident Response** — detect -> classify severity (LLM) -> parallel (route + summarize) -> notify -> report

## Key Design Decisions

- **Kahn's algorithm** for topological sort produces natural parallel layers
- **State machine** with explicit transitions: PENDING -> RUNNING -> WAITING_APPROVAL -> COMPLETED/FAILED
- **Retry with exponential backoff** + jitter, configurable per node
- **Condition branches** propagate skips to entire downstream subtrees
- **Data flows** through edges: each node's output merges into downstream inputs
- **Execution traces** capture full timing, retries, and input/output per node
