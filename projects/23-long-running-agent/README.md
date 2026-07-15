# Project 23: Long-Running Agent — Durable Execution Engine

A production-grade durable execution engine for long-running agent tasks. Demonstrates checkpoint/resume, crash recovery, budget enforcement, and progress streaming — the hard problems that separate toy agent demos from production systems.

## Quick Start

```bash
# Run the demo (4 scenarios)
node src/demo.js

# Run tests (27 tests)
node --test src/tests/agent.test.js
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   DurableExecutor                       │
│  Orchestrates step execution with checkpointing         │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ Checkpoint   │  │ Execution    │  │ Recovery      │ │
│  │ Store        │  │ Budget       │  │ Manager       │ │
│  │              │  │              │  │               │ │
│  │ save/load    │  │ cost/time/   │  │ retry/skip/   │ │
│  │ versioning   │  │ API tracking │  │ rollback/     │ │
│  │ history      │  │ hard limits  │  │ abort         │ │
│  └──────────────┘  └──────────────┘  └───────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ProgressReporter — timeline, ETA, status icons   │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Components

| Module | Purpose |
|--------|---------|
| `checkpoint.js` | In-memory store with auto-versioning. Save/load/list/clear. Deep-clones state to prevent mutation bugs. |
| `executor.js` | Core engine. Sequential step execution, checkpoint after each step, resume from checkpoint, budget checks, timeout handling. |
| `budget.js` | Tracks cost, tokens, duration, API calls. Hard limits with violation reporting. Supports restore for checkpoint resume. |
| `recovery.js` | Auto-selects strategy by error type: timeout → retry with backoff, rate limit → exponential backoff, auth → abort, data → skip/abort by criticality. |
| `progress.js` | Collects events, renders timeline with status icons, calculates ETA from average step duration. |
| `tasks.js` | Pre-built task definitions: Deep Research (8 steps), CI Pipeline (6 steps), Data Migration (5 steps), Expensive Task (budget demo). |

## Design Decisions

**Checkpoint vs event sourcing.** Checkpointing stores the full state snapshot after each step — simpler, easier to reason about, and sufficient for sequential step execution. Event sourcing would be overkill here; it shines when you need to replay or audit individual mutations.

**Budget as a first-class constraint.** Real agent runs burn real money. The budget isn't an afterthought — it's checked before every step, and violations halt execution immediately. The executor saves a checkpoint even on budget abort, so you can inspect where things stood.

**Critical vs non-critical steps.** Not every failure should abort a multi-hour task. Research synthesis can fail without invalidating the facts already gathered. The executor uses step criticality to decide: abort or continue.

**Timer leak prevention.** Every `setTimeout` for step timeouts is paired with a `clearTimeout` on both success and failure paths. No dangling timers.

## File Structure

```
src/
  checkpoint.js    — CheckpointStore (save, load, list, clear, versioning)
  budget.js        — ExecutionBudget (track, check, report, restore)
  recovery.js      — RecoveryManager (strategy selection, rollback)
  progress.js      — ProgressReporter (timeline, ETA, formatting)
  executor.js      — DurableExecutor (the core engine)
  tasks.js         — Pre-built task definitions for demos
  demo.js          — 4-scenario demo with formatted output
  tests/
    agent.test.js  — 27 tests covering all components + integration
```

## Demo Scenarios

1. **Deep Research** — 8-step agent runs to completion with checkpointing
2. **CI Pipeline** — Deploy step fails, retries with backoff, succeeds
3. **Crash Recovery** — Task crashes mid-run, resumes from checkpoint, skips completed steps
4. **Budget Enforcement** — Expensive task aborted when cost limit exceeded

Zero external dependencies. Pure ESM JavaScript.
