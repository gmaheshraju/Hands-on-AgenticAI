# Project 21: Multi-Agent Coordinator

A multi-agent system with dynamic delegation, capability-based routing, escalation chains, and a real message bus.

## Quick Start

```bash
node src/demo.js     # Full demo — 4 requests, 6 agents, escalations
node --test src/tests/coordinator.test.js   # 13 tests
```

## Architecture

```
                         ┌──────────────────────┐
                         │   Incoming Request    │
                         │  "Build a full-stack  │
                         │       web app"        │
                         └──────────┬───────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          Coordinator                                │
│                        coordinator.js                                │
│                                                                     │
│  ┌─────────────┐    ┌──────────────────┐    ┌───────────────────┐   │
│  │ decompose() │───▶│ getExecutionPlan │───▶│  Wave Executor    │   │
│  │             │    │                  │    │                   │   │
│  │ Request ──▶ │    │ Group tasks by   │    │ Promise.allSettled│   │
│  │ Sub-tasks   │    │ priority into    │    │ per wave, waves   │   │
│  │ + skills    │    │ parallel waves   │    │ run sequentially  │   │
│  └─────────────┘    └──────────────────┘    └────────┬──────────┘   │
│   decomposer.js                                      │              │
└──────────────────────────────────────────────────────┼──────────────┘
                                                       │
              ┌────────────────────────────────────────┼──────────┐
              │           CapabilityRegistry           │          │
              │             capability.js              │          │
              │                                        ▼          │
              │  ┌──────────────────────────────────────────────┐  │
              │  │            skillIndex (Map)                  │  │
              │  │                                              │  │
              │  │  "code"    → [junior-dev, senior-dev]        │  │
              │  │  "test"    → [junior-dev, senior-dev]        │  │
              │  │  "review"  → [senior-dev]                    │  │
              │  │  "design"  → [senior-dev]                    │  │
              │  │  "deploy"  → [devops]                        │  │
              │  │  "monitor" → [data-analyst, devops]          │  │
              │  │  "analyze" → [data-analyst]                  │  │
              │  │  "write"   → [writer]                        │  │
              │  │  ...                                         │  │
              │  └──────────────────────────────────────────────┘  │
              │                                                    │
              │  selectAgent(skill) → lowest load, then lowest     │
              │                       cost, under maxConcurrency   │
              └────────────────────────────────────────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
          ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
          │ Junior Dev   │    │ Data Analyst │    │ DevOps Engineer │
          │ code, test   │    │ analyze,     │    │ deploy, monitor │
          │ max: 3       │    │ research,    │    │ max: 2          │
          │              │    │ monitor      │    │                 │
          │ escalatesTo: │    │ max: 3       │    │ escalatesTo:    │
          │  senior-dev  │    └──────────────┘    │  senior-dev     │
          └──────┬───────┘                        └────────┬────────┘
                 │                                         │
                 │  on failure (after retries)              │
                 └──────────────┬───────────────────────────┘
                                │ ESCALATION
                                ▼
                       ┌─────────────────┐
                       │  Senior Dev      │     ┌──────────────┐
                       │  code, review,   │     │ Tech Writer  │
                       │  design, test    │     │ write        │
                       │  max: 2          │     │ max: 2       │
                       │  escalatesTo:    │     └──────────────┘
                       │   null (top)     │     ┌──────────────┐
                       └─────────────────┘     │ Operations   │
                                                │ validate,    │
                                                │ provision,   │
                                                │ notify       │
                                                │ max: 5       │
                                                └──────────────┘

═══════════════════════════════════════════════════════════════════════
                  MessageBus (bus.js) — typed pub/sub
              connects ALL components via publish/subscribe

  TASK_REQUEST ──▶  coordinator assigns task to agent
  TASK_RESULT  ──▶  agent reports success
  TASK_FAILED  ──▶  agent reports failure (triggers retry or escalation)
  ESCALATION   ──▶  task routed from junior to senior agent
  HEARTBEAT    ──▶  agent alive signal
  BROADCAST    ──▶  coordinator announces to all

  history[]  ← every message recorded for audit/replay (max 500)
═══════════════════════════════════════════════════════════════════════
```

**Example: "Build a full-stack web app" execution flow**

```
Wave 1 (priority 1):  [design]           → Senior Dev
                                             │
Wave 2 (priority 2):  [code, code]        → Junior Dev (parallel)
                       backend   frontend    │  if fail → retry → ESCALATE → Senior Dev
                                             │
Wave 3 (priority 3):  [test]              → Junior Dev
                                             │
Wave 4 (priority 4):  [review]            → Senior Dev
```

### Capability Cards

Each agent publishes a structured card declaring its skills, cost, latency, concurrency limit, and escalation target. The coordinator never hardcodes which agent handles what — it discovers capabilities at runtime.

### Message Bus

All agent communication flows through a typed pub/sub bus:
- `TASK_REQUEST` — coordinator assigns work
- `TASK_RESULT` — agent reports success
- `TASK_FAILED` — agent reports failure
- `ESCALATION` — task routed to more capable agent

### Task Decomposition

Natural language requests are broken into skill-tagged sub-tasks with priority levels. Tasks at the same priority execute in parallel.

### Routing & Escalation

1. Coordinator decomposes the request
2. For each sub-task, finds the least-loaded agent with the required skill
3. If the agent fails, retries with another agent
4. If retries exhaust, escalates to the agent's `escalatesTo` target
5. Results aggregated into a final report

## File Structure

```
src/
  capability.js    # Capability card registry + skill index
  bus.js           # Typed pub/sub message bus
  decomposer.js   # Request → sub-tasks with skill mapping
  coordinator.js   # Orchestrator: decompose → route → execute → aggregate
  agents.js        # 6 agent definitions with simulated handlers
  demo.js          # Full demo runner
  tests/
    coordinator.test.js   # 13 tests covering routing, escalation, bus
```

## Design Decisions

- **Capability discovery over configuration** — agents register themselves. The coordinator doesn't know agent implementations, only their capability cards. Add a new agent type without touching the coordinator.
- **Load-aware routing** — when multiple agents share a skill, the one with the lowest queue depth gets the task. Prevents hot-spotting.
- **Escalation chains** — junior-dev escalates to senior-dev. The chain is declared in capability cards, not hardcoded in the coordinator.
- **Wave-based parallelism** — tasks at the same priority level run concurrently via `Promise.allSettled`. Higher-priority tasks must complete before lower ones start.
- **Bus as audit trail** — every task lifecycle event (assign, complete, fail, escalate) flows through the bus. Replay the bus history to debug any coordination issue.
