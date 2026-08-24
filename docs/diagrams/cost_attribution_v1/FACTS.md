# FACTS — 27-cost-attribution (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/27-cost-attribution/src/`, n=6 JS modules (491 lines)
+ 1 test module (214 lines). **Every element in the diagram appears below with a
`file:line` citation. The diagram may contain nothing that is not on this page,
and this page may contain nothing without a citation.** The project README ships
an ASCII architecture diagram; it was treated as a claim, not as evidence — every
fact below was read from source (see "README claims that did not verify").

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The per-pattern detection math inside
`waste.js`, the rounding/aggregation arithmetic inside each attribution
dimension, and the ROI value-function plumbing are L2 concerns and are
deliberately NOT drawn here — their **enumerations and thresholds** are carried
on the invariant cards, which is the L1-relevant fact.

---

## Entry point — `src/demo.js`

| Fact | Citation |
|---|---|
| `main()` — the single CLI entry, invoked at module load | demo.js:3, :95 |
| Imports `CostAttributionEngine` from the engine | demo.js:1 |
| Constructs one engine | demo.js:8 |
| Sets two team budgets (engineering $5, marketing $1) | demo.js:10, :11 |
| Registers three per-task-type value functions on the ROI calculator | demo.js:13, :14, :15 |
| Defines 12 simulated LLM-call scenarios (no real model is called) | demo.js:18-31 |
| Records every scenario through `engine.record(s)` | demo.js:33 |
| Prints 6 report scenarios to stdout via `console.log` | demo.js:36, :43, :53, :60, :72, :81 |

`src/collector.js` and the other modules carry no CLI of their own; only
`demo.js` is drawn as the entry component. The test module
(`src/tests/cost.test.js`, 20 `it()` cases across 5 `describe()` suites —
cost.test.js:21, :49, :101, :146, :185) is a harness, not part of the runtime
graph, and is not drawn.

## The facade — `src/engine.js` (`CostAttributionEngine`)

| Fact | Citation |
|---|---|
| Constructor composes all four sub-services over ONE collector | engine.js:8, :9, :10, :11 |
| `attribution`, `waste`, `roi` are each handed `this.collector` | engine.js:9, :10, :11 |
| `budgets` (Map) and `alerts` (array) live on the engine, not the collector | engine.js:12, :13 |
| `record(event)` → `collector.record()` then `_checkBudget()` | engine.js:16, :17, :18 |
| `setBudget(teamId, dailyUsd)` | engine.js:22, :23 |
| `dashboard(filters)` aggregates byAgent/byTeam/byTaskType/byModel + waste + alerts + totals | engine.js:52 |
| `executiveSummary(filters)` — total cost, success rate, waste count, savings % | engine.js:69 |

## The store — `src/collector.js` (`CostCollector`)

| Fact | Citation |
|---|---|
| `this.events = []` — the single in-memory event store | collector.js:3 |
| `this.pricing` — hardcoded default price table, **7 models** | collector.js:4-12 |
| `record(event)` — stamps `evt_N` id + `Date.now()` timestamp, pushes to `events[]` | collector.js:15, :18, :35 |
| Cost = explicit `costUsd` **or** `calculateCost(model, in, out)` | collector.js:16 |
| `calculateCost` reads the pricing table; unknown model → 0 | collector.js:39, :40, :41 |
| `query(filters)` — the one read path, 7 filter dimensions | collector.js:45, :47-53 |

The 7 query filters, complete and in code order: `agentId`, `teamId`, `taskId`,
`taskType`, `model`, `since`, `until` (collector.js:47, :48, :49, :50, :51, :52,
:53).

## The pricing table — `src/collector.js`

| Fact | Citation |
|---|---|
| 7 models with input/output per-1K rates | collector.js:4-12 |
| claude-opus-5, claude-sonnet-5, claude-haiku-4-5 | collector.js:5, :6, :7 |
| gpt-4o, gpt-4o-mini | collector.js:8, :9 |
| gemini-2.5-pro, gemini-2.5-flash | collector.js:10, :11 |
| Overridable via `config.pricing` (default used in demo + tests) | collector.js:4 |

## Reporting service 1 — `src/attribution.js` (`CostAttribution`)

| Fact | Citation |
|---|---|
| Constructed with the collector; every method calls `collector.query()` | attribution.js:2, :7, :31, :59, :86 |
| `byAgent` — cost, requests, tokens, successRate, avgCostPerRequest | attribution.js:6 |
| `byTeam` — cost, uniqueAgents, per-model breakdown | attribution.js:30 |
| `byTaskType` — costPerSuccess, avgLatency, successRate | attribution.js:58 |
| `byModel` — tokens, cacheHitRate, avgCostPerRequest | attribution.js:85 |
| All four sort by `totalCost` descending | attribution.js:27, :55, :82, :106 |

## Reporting service 2 — `src/waste.js` (`WasteDetector`)

| Fact | Citation |
|---|---|
| Constructed with the collector | waste.js:2, :3 |
| `analyze(filters)` runs 6 detectors in fixed order, then sorts | waste.js:7, :11-16, :18 |
| Results sorted by `savingsUsd` descending | waste.js:18 |

## Reporting service 3 — `src/roi.js` (`ROICalculator`)

| Fact | Citation |
|---|---|
| Constructed with the collector; `valueMetrics` Map holds pluggable value fns | roi.js:2, :4 |
| `setOutcomeValue(taskType, valueFn)` registers a value function | roi.js:7 |
| `agentROI(agentId)` — cost vs value, roi, costPerSuccess, valuePerDollar | roi.js:11 |
| `teamROI(teamId)` — aggregates agentROIs, top/worst performer | roi.js:45, :59, :60 |
| `costEfficiency()` — costPerToken, costPerSuccess, tokensPerRequest, latency | roi.js:64 |

---

### INVARIANT CARD 1 — the 4 attribution dimensions, complete, in code order

All four are methods of `CostAttribution`; each calls `collector.query()` and
each sorts its output by `totalCost` descending. There is no fifth dimension.

| # | Dimension | Key metrics | Citation |
|---|---|---|---|
| 1 | `byAgent` | totalCost, requests, tokens, successRate, avgCostPerRequest | attribution.js:6, :27 |
| 2 | `byTeam` | totalCost, uniqueAgents, per-model breakdown | attribution.js:30, :55 |
| 3 | `byTaskType` | costPerSuccess, avgLatencyMs, successRate | attribution.js:58, :82 |
| 4 | `byModel` | inputTokens+outputTokens, cacheHitRate, avgCostPerRequest | attribution.js:85, :106 |

Each dimension reads the SAME store via `collector.query(filters)`
(attribution.js:7, :31, :59, :86).

### INVARIANT CARD 2 — the 6 waste patterns, complete, in code order

`analyze()` calls six private detectors in this fixed order, collects every
pattern that fires into `this.patterns`, then returns them sorted by
`savingsUsd` descending (waste.js:18). Nothing short-circuits.

| # | Pattern | Trigger condition | Savings basis | Citation |
|---|---|---|---|---|
| 1 | `overpowered_model` | premium model (opus-5 / gpt-4o) with input < 500 **and** output < 200 | 85% of cost | waste.js:11, :21, :22, :24, :28 |
| 2 | `duplicate_requests` | same agent·model·inputTokens within 60 000 ms | full duplicate cost | waste.js:12, :40, :47 |
| 3 | `excessive_retries` | > 1 failure on one taskId | cost of retries after the first | waste.js:13, :65, :76 |
| 4 | `low_cache_hit_rate` | > 10 events **and** hit rate < 10% | 15% of total cost | waste.js:14, :93, :98, :99 |
| 5 | `high_failure_rate` | > 5 events for an agent **and** failure rate > 30% | cost of the failures | waste.js:15, :110, :122, :123 |
| 6 | `idle_agent` | last activity > 1 h ago **and** total cost > $0.01 | 0 (advisory) | waste.js:16, :135, :143, :145 |

### INVARIANT CARD 3 — budget alerts, checked on every record

Budget enforcement lives in the engine, not the collector, and fires as a
side-effect of recording — not on a schedule.

| Fact | Citation |
|---|---|
| `_checkBudget(teamId)` runs inside every `record()` | engine.js:18, :26 |
| No budget set for the team ⇒ return, no alert | engine.js:27, :28 |
| Spend = today's team events summed by `costUsd` | engine.js:30-34 |
| Thresholds, in order: 0.5, 0.8, 0.95, 1.0 | engine.js:36 |
| Level: ratio ≥ 1.0 critical, ≥ 0.8 warning, else info | engine.js:45 |
| Deduped: one alert per team·threshold·day | engine.js:39, :40 |
| Alerts accumulate on `this.alerts[]` | engine.js:42, :13 |

Observed on an actual run (`node src/demo.js`, 2026-08-24): 12 events, total
cost $0.05, 83% success, 3 waste patterns detected (overpowered_model,
low_cache_hit_rate, duplicate_requests), 39% potential savings. These are
outputs, not source lines; the formulas that produce them are cited above.
No budget alert fired in the demo (spend well under both budgets).

---

## Artifacts written

**None persisted.** Like `07-guardrails`, this project writes no file: every
output goes to stdout via `console.log` in `demo.js` (demo.js:36, :43, :53, :60,
:72, :81). `dashboard()` and `executiveSummary()` return plain objects
(engine.js:52, :69); demo consumes and prints them.

## README claims that did not verify

1. **The README's ASCII shows the four attribution boxes ("By Agent / By Team /
   By Task / By Model") fanning out directly under "Cost Collector."** In code
   they are not children of the collector — they are methods of a **separate
   class**, `CostAttribution` (attribution.js:1), which the engine constructs and
   hands the collector to (engine.js:9). The store and the read-models are
   distinct components; the diagram draws that boundary.
2. **The README's ASCII places "Budget Alerts" and "Executive Summary" as a flat
   footer of the collector.** In code both belong to the **engine facade**, not
   the collector: budgets/alerts are engine fields (engine.js:12, :13) and
   `_checkBudget` fires inside `engine.record()` (engine.js:18), while
   `executiveSummary` is an engine method (engine.js:69). The diagram attaches
   them to the engine, not the store.

## Folded into one box (to hold the 6-15 component-box rule)

The page draws **10 component boxes**. Two folds; each keeps its citation on the
surviving box, so nothing became untraceable.

| Folded | Into | Why it is legitimate |
|---|---|---|
| `calculateCost()` (collector.js:39) | the `CostCollector` box | called only from `collector.record()` (collector.js:16), same class — it is not a separate address in the system |
| `_checkBudget()` (engine.js:26) | the `Budget monitor` box | drawn as one box with `budgets`/`alerts` (engine.js:12, :13); the split into a method vs. fields is not an architectural boundary |

## Deliberately NOT drawn (L1 scope discipline)

- The per-detector arithmetic inside each of the 6 waste patterns
  (waste.js:21-155) — L2; the diagram carries their **triggers and savings
  basis** on card 2.
- The rounding/aggregation loops inside each attribution dimension
  (attribution.js) — L2; card 1 carries the dimension list and key metrics.
- The 20-test / 5-suite test module (cost.test.js) — a harness, not runtime.
- The `dashboard()` object's internal field-by-field shape (engine.js:52-67) —
  it re-exposes the four attribution dims + waste + alerts already drawn.

## Portability notes — vocabulary strain recorded for this domain

The token set was built for a trading system; this is a cost-analytics tool.
Two of the recurring strains named in the brief both appear here.

1. **`component.external` has no honest occupant — used for the hardcoded
   pricing table.** There is no external pricing API; `this.pricing` is a
   hardcoded default object of 7 models (collector.js:4-12). `component.external`
   is the nearest token (it stands in for what would be a pricing feed), and the
   box carries a **"hardcoded, no API"** correction label so the picture cannot
   imply a live integration. A `component.config` or `component.pricing` token
   would be more honest.
2. **`component.agent` was NOT used — the "agents" are data labels, not
   processes.** The system tracks `agentId` **strings** on event records
   (collector.js:20); there is no agent process in this codebase. Forcing
   `component.agent` would invent an occupant that does not exist, so the token
   is deliberately absent — per the brief's guidance to use the nearest real
   token rather than a fictional one.
3. **`component.mock` labels the 12 simulated scenarios** (demo.js:18-31): fake
   LLM-call records standing in for real telemetry. No real model is invoked.
4. **`boundary.observability` labels a zone that persists nothing** — stdout
   only. Kept because the semantic role ("where the run becomes visible") is
   exactly right; the token name over-promises durability.
5. **No `edge.data_out` token exists.** The store→reporting reads use
   `edge.data_in`; the reporting→stdout direction had to borrow `edge.artifact`.
