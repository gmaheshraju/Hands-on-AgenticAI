# FACTS — 03-agent-harness (L1 architecture, extracted 2026-08-23)

Source of truth: `projects/03-agent-harness/src/`, n=6 files, 1505 lines.
**Every element in the diagram appears below with a `file:line` citation. The
diagram may contain nothing that is not on this page, and this page may contain
nothing without a citation.** The project README ships an ASCII diagram; it was
treated as a claim, not as evidence — every fact below was read from source.

Altitude: **L1 — space** (where things live, what talks to what), per
`DIAGRAM_RULES.md`. The agent's own Observe→Think→Act→Evaluate cycle is an L2b
concern and is deliberately NOT drawn here.

---

## Entry point — `src/demo.js`

| Fact | Citation |
|---|---|
| CLI reads `process.argv.slice(2)` | demo.js:27 |
| Constructs `ResearchAgent` then `AgentHarness` | demo.js:53, :54 |
| Drives the loop: `harness.run((iter, h) => agent.step(iter))` | demo.js:62 |
| Writes the report to `report-${runId}.md` | demo.js:66-67 |
| Runs postmortem after the run | demo.js:152 |
| Runs primitive diagnosis after the run | demo.js:174 |
| Three demo modes exist (default research, `--convergence`, `--cost-cap`), each building its own harness | demo.js:54, :84, :120 |

## The harness — `src/harness.js`

| Fact | Citation |
|---|---|
| `export class AgentHarness` — the boundary that wraps any agent loop | harness.js:29 |
| Defaults: `maxIterations = 20`, `maxCostUsd = 1.0`, `convergenceWindow = 3` | harness.js:39, :40, :41 |
| Owns a `Tracer`, `cumulativeCost`, `iteration`, `convergenceCounter`, `stopReason` | harness.js:50-54 |
| `run(agentStepFn)` — the `while (true)` loop | harness.js:74, :82 |
| Traces EVERY iteration via `this.tracer.log({...})` | harness.js:101-112 |
| Returns `{ stopReason, totalIterations, totalCost, traceFile }` | harness.js:155-160 |
| `postmortem(runResult, traceEntries)` | harness.js:183 |

### Cost model

| Fact | Citation |
|---|---|
| `COST_PER_INPUT_TOKEN = 3.0 / 1_000_000` ($3 per 1M) | harness.js:20 |
| `COST_PER_OUTPUT_TOKEN = 15.0 / 1_000_000` ($15 per 1M) | harness.js:21 |
| `computeCost(tokensIn, tokensOut)` | harness.js:23-25 |
| Stated in-file as "Claude Sonnet pricing as reference" | harness.js:18 |

### STOP CONDITIONS — the complete set, in code order (invariant card)

Four, not the three the README advertises. **Order matters and is load-bearing:**
the iteration cap is evaluated at the TOP of the loop before the agent runs; the
other three are evaluated AFTER the step returns.

| # | Stop reason | When checked | Citation |
|---|---|---|---|
| 1 | `ITERATION_CAP` | top of loop, **before** the step | harness.js:86-89 |
| 2 | `AGENT_DONE` | after step, `step.done` | harness.js:126-129 |
| 3 | `COST_CAP` | after step, `cumulativeCost >= maxCostUsd` | harness.js:132-135 |
| 4 | `CONVERGENCE` | after step, counter `>= convergenceWindow` | harness.js:138-143 |

Convergence counter resets to 0 on any productive iteration — harness.js:144-146.

### POSTMORTEM FAILURE TAXONOMY — 8 patterns (invariant card)

`context_miss` · `bad_tool_result` · `wasteful_action` · `hallucinated_tool_loop`
· `convergence_stall` · `cost_overrun` · `iteration_cap` · `tool_imbalance`
— declared harness.js:170-177. Implemented branches observed: `convergence_stall`
harness.js:190-204, `cost_overrun` :207-223, `iteration_cap` :226-240.

## The agent — `src/agent.js`

| Fact | Citation |
|---|---|
| `export class ResearchAgent` | agent.js:82 |
| `async step(iteration)` — three phases, first match wins | agent.js:101 |
| Phase 1: drain `searchResultsBuffer` → `_noteFindingsFromBuffer` | agent.js:102-105, :161 |
| Phase 2: execute next planned step → `_executeTool` | agent.js:107-112, :120 |
| Phase 3: `_synthesize` | agent.js:114-115, :177 |
| `_executeTool` looks the tool up in `TOOL_REGISTRY` and passes `this.report` when `needsReport` | agent.js:120-125 |
| Plan is built up front from the question | agent.js:23 (`buildResearchPlan`) |

## Tools — `src/tools.js`

| Fact | Citation |
|---|---|
| `export const TOOL_REGISTRY` — exactly 4 tools | tools.js:260 |
| `webSearch` (params: query) | tools.js:139, registry :261-265 |
| `readPage` (params: url) | tools.js:165, registry :266-270 |
| `noteFindings` (params: section, facts, sources; `needsReport: true`) | tools.js:186, registry :271-276 |
| `synthesize` (no params; `needsReport: true`) | tools.js:216, registry :277-282 |
| **Data sources are MOCKS, not network calls**: `MOCK_SEARCH_RESULTS`, `MOCK_PAGES` | tools.js:17, :55 |
| Latency is simulated via a `delay()` helper | tools.js:11 |

## Tracer — `src/tracer.js`

| Fact | Citation |
|---|---|
| `export class Tracer` | tracer.js:12 |
| Writes `trace-${runId}.jsonl` | tracer.js:20 |
| `runId` defaults to an ISO timestamp with `:` and `.` replaced | tracer.js:19 |
| Truncates the file at construction so append never fails | tracer.js:24 |
| One JSONL record per iteration, carrying timestamp, run_id, iteration, phase, thought, tool, tokens, cost, cumulative cost, new_facts_added | tracer.js:44 (`log`), :45 (record shape), :26-42 (documented fields) |
| `printSummary()` renders the run table to stdout | tracer.js:70 |

## Diagnosis — `src/diagnosis.js`

| Fact | Citation |
|---|---|
| `export function diagnosePrimitives(runResult, traceEntries)` | diagnosis.js:50 |
| Scores **10 harness primitives**, 0.0 broken → 1.0 fine | diagnosis.js:5 |
| Primitives 1-6 named in-file: Instructions, Context Delivery, Context Management, Tool Interface, Execution Environment, Durable State | diagnosis.js:9-14 (impl. branches :67, :150) |
| `export function printDiagnosis(result)` | diagnosis.js:295 |

## Artifacts written

| Artifact | Written by | Citation |
|---|---|---|
| `trace-<runId>.jsonl` | Tracer | tracer.js:20, :24 |
| `report-<runId>.md` | demo.js after a successful run | demo.js:66-67 |
| Both land in `traces/` in the committed repo | n=6 `trace-*.jsonl` + n=4 `report-*.md` present |

---

## Deliberately NOT drawn (L1 scope discipline)

- The agent's internal Observe→Think→Act→Evaluate cycle — **L2b**, a different
  altitude, per `DIAGRAM_RULES_LLD.md`. The README's ASCII mixes it into the
  architecture view; this diagram does not.
- `buildResearchPlan` / `extractEntities` / `guessSectionName` internals —
  function-level detail, excluded by the L1 content rules.
- The mock corpora's contents.

## Portability notes — rules that needed bending for a non-FTS codebase

Recorded because this is the harness's first contact with a second codebase, and
"rules bent per new domain" is the portability metric.

1. **`edge.money` does not generalise.** There is no money path here; the
   equivalent is the critical execution path. Used **`edge.primary`** in this
   diagram's theme. The token vocabulary needs a domain-neutral primary-path name.
2. **`component.store` assumes a database.** Here the durable outputs are files.
   Used **`component.artifact`**.
3. **`component.broker` / `boundary.external`** map cleanly onto the mock data
   layer — but honesty requires the boundary be labelled MOCK, since nothing
   leaves the process.
