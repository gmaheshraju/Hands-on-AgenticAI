# FACTS — 26-agent-cicd (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/26-agent-cicd/src/`, n=5 JS modules (585 lines) +
1 test file (255 lines). **Every element in the diagram appears below with a
`file:line` citation. The diagram may contain nothing that is not on this page,
and this page may contain nothing without a citation.** The project README ships
an ASCII diagram; it was treated as a claim, not as evidence — every fact below
was read from source (see "README claims" at the end).

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The per-rule loop inside `QualityGate`, the
per-dimension math inside `EvalSuite._aggregate`, and the per-case comparison
loop inside `BaselineComparator.compare` are L2 concerns and are deliberately NOT
drawn here.

---

## The process — `src/pipeline.js`

| Fact | Citation |
|---|---|
| `class AgentCICDPipeline` composes the three subsystems + run log | pipeline.js:5, :7-10 |
| `async runPipeline(agentFn, options)` — the 4-stage orchestrator | pipeline.js:18 |
| Stage 1 — `this.evalSuite.run(agentFn, {tags})` | pipeline.js:24 |
| Stage 2 — `this.baseline.compare(...)`, only if a baseline exists | pipeline.js:34, :35 |
| Stage 2 skipped branch — no baseline → status `skipped` | pipeline.js:43 |
| Stage 3 — `this.qualityGate.evaluate(evalResults, baselineComparison)` | pipeline.js:47 |
| Stage 4 — `this._decide(evalResults, baselineComparison, gateResult)` | pipeline.js:56 |
| The whole run (stages, results, promotion) pushed to `this.runs` | pipeline.js:73 |
| Baseline auto-saved ONLY on a pure `promote` action | pipeline.js:75, :76 |
| `promotionRules` default: autoPromote, requireBaseline, minCases 5 | pipeline.js:11-15 |
| `_decide()` — the promotion ladder (invariant card 2) | pipeline.js:82 |
| `getRunHistory()` — maps `this.runs` to a summary list | pipeline.js:102 |
| `generateReport(runId)` — builds the markdown/stdout report | pipeline.js:110 |

## Entry point — `src/demo.js`

| Fact | Citation |
|---|---|
| `main()` runs 5 scenarios | demo.js:3, :59, :82, :90, :108, :114 |
| Constructs the pipeline with 3 dimensions | demo.js:8, :9 |
| Registers 3 scorers (faithfulness, safety, cost) | demo.js:15, :23, :30 |
| Defines 8 eval cases with tags/context | demo.js:39-50 |
| Registers 4 quality-gate rules | demo.js:53-56 |
| `goodAgent` — the well-behaved system-under-test (mock fn) | demo.js:61 |
| `badAgent` — the degraded/unsafe system-under-test (mock fn) | demo.js:92 |
| Runs the pipeline three times (runs 1-3) | demo.js:75, :84, :96 |
| Failure path: `main().catch(console.error)` | demo.js:126 |

## Stage 1 — the eval suite (`src/evalSuite.js`)

| Fact | Citation |
|---|---|
| `class EvalSuite`; default dims faithfulness/safety/cost/latency | evalSuite.js:1, :4 |
| `addCase()` / `addScorer()` / `setThreshold()` | evalSuite.js:9, :24, :28 |
| `async run(agentFn, options)` — tag-filtered case loop | evalSuite.js:32, :35 |
| The system-under-test is invoked here: `await agentFn(input, context)` | evalSuite.js:44 |
| Each dimension scored by its registered scorer | evalSuite.js:52, :55 |
| Errored case → all scores 0 | evalSuite.js:61, :62 |
| Threshold pass/fail per case | evalSuite.js:67, :92 |
| Returns totals + weighted `aggregateScores` | evalSuite.js:81-89, :100, :113 |

## Stage 2 — the baseline comparator (`src/baseline.js`)

| Fact | Citation |
|---|---|
| `class BaselineComparator`; baselines kept in an in-memory `Map` | baseline.js:1, :3 |
| Regression threshold 0.05, improvement threshold 0.10 | baseline.js:4, :5 |
| `saveBaseline(name, evalResults)` snapshots scores + pass rate | baseline.js:8 |
| `compare(baselineName, currentResults)` reads the stored baseline | baseline.js:24, :25 |
| Regression when pctChange < -threshold; improvement when > threshold | baseline.js:52, :55 |
| Verdict REGRESSION / IMPROVED / STABLE | baseline.js:72 |

## Stage 3 — the quality gate (`src/qualityGate.js`)

| Fact | Citation |
|---|---|
| `class QualityGate`; rules + evaluation history | qualityGate.js:1, :3, :4 |
| `addRule()` — type threshold / regression / custom; severity error/warning | qualityGate.js:7, :11, :15 |
| `evaluate(evalResults, baselineComparison)` — the rule loop | qualityGate.js:22, :27 |
| Verdict BLOCK (any violation) / WARN (any warning) / PASS | qualityGate.js:39 |
| Every decision appended to `this.history` | qualityGate.js:50 |
| Rule dispatch: threshold :55, regression :64, custom :76 | qualityGate.js:55, :64, :76 |

## Inputs (all defined in `src/demo.js`, wired onto the pipeline)

| Fact | Citation |
|---|---|
| 8 eval cases (data + tags + context) | demo.js:39-50 |
| 3 scorer functions (grading logic) | demo.js:15-36 |
| agentFn — the system-under-test, passed to `runPipeline` | demo.js:61, :92 |

## Artifacts (outputs) — all in-memory / stdout; NOTHING is persisted to disk

| Output | Written by | Citation |
|---|---|---|
| baseline store (`Map`) — in-memory only | `saveBaseline` | baseline.js:3, :8, :20 |
| stdout report (markdown lines + `console.log`) | `generateReport` + demo | pipeline.js:110, :134; demo.js:111 |
| run history (`this.runs` array) | `runPipeline` / `getRunHistory` | pipeline.js:73, :102 |

---

### INVARIANT CARD 1 — the FOUR stages, complete, in code order

Run by `runPipeline()` (pipeline.js:18); each stage's output feeds the next.

| # | Stage | Call | Produces | Citation |
|---|---|---|---|---|
| 1 | eval | `evalSuite.run(agentFn)` | scores, pass/fail, aggregates | pipeline.js:24 |
| 2 | baseline | `baseline.compare(...)` (skipped if none) | REGRESSION/IMPROVED/STABLE | pipeline.js:34, :35, :43 |
| 3 | gate | `qualityGate.evaluate(...)` | BLOCK/WARN/PASS | pipeline.js:47 |
| 4 | promote | `_decide(...)` | promote / block action | pipeline.js:56 |

Auto-save of the baseline happens ONLY on a pure `promote` action
(pipeline.js:75) — never on `promote_with_warnings`.

### INVARIANT CARD 2 — the promotion ladder, complete, in code order

`_decide()` (pipeline.js:82) checks in this exact order; first match wins:

| # | Condition | Action | Citation |
|---|---|---|---|
| 1 | gate verdict === BLOCK | block | pipeline.js:83, :84 |
| 2 | requireBaseline && baseline verdict === REGRESSION | block | pipeline.js:87, :88 |
| 3 | totalCases < minCases (default 5) | block | pipeline.js:91, :92 |
| 4 | gate verdict === WARN | promote_with_warnings | pipeline.js:95, :96 |
| 5 | (all clear) | promote | pipeline.js:99 |

Note: `_decide` consumes gate result AND baseline comparison AND eval case
count — three independent block gates, not just the quality gate.

### INVARIANT CARD 3 — the quality gate, complete

`QualityGate.evaluate()` (qualityGate.js:22) runs every rule, then reduces:

| Fact | Citation |
|---|---|
| rule types: threshold, regression, custom | qualityGate.js:11, :55, :64, :76 |
| severity: `error` → violation (blocks), `warning` → note (promotes) | qualityGate.js:15, :32, :35 |
| verdict = BLOCK if any violation, else WARN if any warning, else PASS | qualityGate.js:39 |
| every decision appended to history for trend analysis | qualityGate.js:50 |
| demo's 4 rules: faith gte 0.6, safety gte 0.9 (err), cost gte 0.7 (warn), no-regression | demo.js:53-56 |

Observed on an actual run (`node src/demo.js`, 2026-08-24): run 1 promotes
(8/8, establishes baseline), run 2 promotes (stable vs baseline), run 3 blocks
(badAgent leaks `password`/`api_key` → safety violation). These are outputs, not
source lines; the formulas that produce them are cited above.

---

## Deliberately NOT drawn (L1 scope discipline)

- The 3 scorer heuristics' internals (word-overlap, unsafe-term list, token
  buckets) — demo.js:15-36, L2 detail; the diagram carries only that 3 scorers
  plug into eval.
- `_aggregate`'s weighted-mean math (evalSuite.js:100-119) — L2.
- `compare`'s per-dimension / per-case delta loop (baseline.js:34-58) — L2.
- `_evaluateRule` / `_compare` operator dispatch (qualityGate.js:54-93) — L2;
  the rule *types* are carried on invariant card 3.
- `generateReport`'s line-formatting loop (pipeline.js:114-134) — L2.
- The 22 unit tests / 4 suites (src/tests/cicd.test.js) — verification harness,
  not runtime architecture.

## README claims — checked against source

1. **README ASCII: `Eval Suite → Baseline Comparator → Quality Gate →
   Promotion Decision`.** VERIFIED — pipeline.js runs exactly this order
   (:24 → :35 → :47 → :56).
2. **README: "Auto-saves baseline on successful promotion".** VERIFIED but
   NARROWER than the prose implies: the save fires only for the exact `promote`
   action (pipeline.js:75), NOT for `promote_with_warnings`. The diagram labels
   the save edge accordingly.
3. **README ASCII: promotion has three outcomes PROMOTE / WARN / BLOCK.**
   PARTIALLY TRUE — there are in fact three *actions* (`promote`,
   `promote_with_warnings`, `block`), but `block` is reached by THREE distinct
   conditions, not one (pipeline.js:83, :87, :91). The README shows only the
   gate → promotion arrow; the baseline-regression and min-cases block gates are
   invisible in its ASCII. Invariant card 2 draws all five branches.
4. **README: "22 tests across 4 suites".** VERIFIED — 22 `it()` blocks under 4
   `describe()` blocks (src/tests/cicd.test.js:10, :75, :124, :182).

## Portability notes — vocabulary built for a trading system, bent here

Recorded because "rules bent per new domain" is the portability metric. Both of
the two recurring strains flagged in the brief occur in this project.

1. **`component.agent` has no honest occupant — the recurring "stateless
   function" strain.** The "agent" under test (`goodAgent` / `badAgent`,
   demo.js:61, :92) is a plain synchronous lookup function with no memory, no
   tools, and no LLM call. The token was used for the SUT box because it occupies
   the agent's *structural* position (the thing being evaluated), and the box
   carries a **SUT / mock** label so the picture cannot claim there is a real
   agent. Nearest-token rule applied; no token invented.
2. **`component.external` has NO occupant at all — omitted.** This project makes
   no network call, no broker call, no file read; it does not even write a file.
   There is no external surface to draw, so `component.external` and
   `boundary.external` are unused. This is the "external surface is empty" strain
   in its extreme form.
3. **`component.artifact` over-promises durability.** All three "artifacts" —
   the baseline `Map`, the stdout report, the run-history array — are in-memory
   or stdout; nothing is persisted (baseline.js:3, pipeline.js:73, :134). The
   token was reused because the semantic role ("the run's durable-looking
   output") is right, but a `component.store`/`component.stdout` split would be
   more honest. Carried on the box labels ("in-memory", "stdout").
4. **`boundary.observability`** labels the output zone even though nothing is
   persisted there — same over-promise as guardrails_v1; kept because "where the
   run becomes visible" is exactly right.
5. **No `edge.data_out` token exists.** Inputs → orchestrator used
   `edge.data_in`; store read → baseline used `edge.data_in`; the write-back
   (promote → store) and the two report writes borrowed `edge.artifact`.
