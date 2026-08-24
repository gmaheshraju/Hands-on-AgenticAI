# FACTS — 19-agent-observability (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/19-agent-observability/`, n=8 JS modules under `src/`
(2517 lines) + one 960-line browser page `public/index.html`. **Every element in
the diagram appears below with a `file:line` citation. The diagram may contain
nothing that is not on this page, and this page may contain nothing without a
citation.**

The README ships a Components table, an ASCII architecture block and an API
table. All three were treated as **claims**, not evidence. Every one of them was
read against source, and **five README claims did not survive** (see "README
claims that did not verify"). Two of the five are load-bearing: the ASCII draws
a data path that no code takes, and the "standout feature" is wired to a column
that does not exist.

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The z-score maths, the LCG scorer, the
canvas chart renderer and the per-request generation loop are L2/L2b concerns
and are deliberately NOT drawn (see "Deliberately NOT drawn").

Nothing was executed. `node_modules/` is absent in this checkout, so there are
**no observed-run numbers anywhere on this page or on the diagram** — every
figure below is a count or a literal read out of source.

---

## Entry point — `src/demo.js` (39 lines, `npm start` → package.json:7)

| Fact | Citation |
|---|---|
| `const DB_PATH = './observability.db'` | demo.js:6 |
| Deletes the database file before every run — each run starts from zero | demo.js:10, :11, :12 |
| Phase 1: `await simulate({ totalRequests: 500, daysBack: 7, dbPath })` | demo.js:18, :19, :20, :21 |
| Prints the returned summary to stdout — 5 lines | demo.js:24, :25, :26, :27, :28, :29 |
| Phase 2: `await startDashboard(DB_PATH)` | demo.js:32, :33 |
| Failure path: `main().catch` → `console.error` → `process.exit(1)` | demo.js:36, :37, :38 |

`src/simulator.js` and `src/dashboard.js` each also carry their own CLI
self-start guard (simulator.js:399, :407; dashboard.js:409, :410), wired in
package.json as `simulate` and `dashboard`. Only `demo.js` is drawn as the
entry component; the other two are drawn as the services they are.

## The dead SDK — `src/tracer.js` (175 lines)

This module is the project's headline abstraction — the README's Components
table calls it "OpenTelemetry-inspired tracing" and the ASCII puts it first in
the data path. **No module in the repository constructs it.**

| Fact | Citation |
|---|---|
| `export class Tracer` with `startTrace({agent, model, workflow, userId})` | tracer.js:160, :165 |
| `class Trace` — `startSpan()` and `end()` | tracer.js:104, :120, :134 |
| `class Span` — `setTokens`, `setToolCalls`, `setMetadata`, `end()` | tracer.js:21, :43, :49, :53, :57 |
| `Span.end()` writes both a span row and a cost row | tracer.js:65, :66 |
| `Trace.end()` writes the trace row | tracer.js:155 |
| `MODEL_PRICING` — the 7-model price table, USD per 1M tokens | tracer.js:4, :5-11 |
| `calculateCost()` — the pricing function | tracer.js:14, :17, :18 |
| The **only** import of `Tracer` anywhere | simulator.js:3 |
| …and `Tracer` is never instantiated in that file, or any other (`grep -rn "new Tracer\|new Trace(\|new Span("` over `src/` + `public/` returns the two internal constructions at tracer.js:121 and tracer.js:166 and nothing else) | tracer.js:121, :166 |

### The field-name break that no caller exists to hit

`Span._serialize()` emits **camelCase** keys; `Store.insertSpan()` reads
**snake_case** keys off the object it is handed. The same disagreement repeats
on the cost record.

| Emitted by tracer | Read by store | Citations |
|---|---|---|
| `traceId` | `span.trace_id` | tracer.js:85 / store.js:212 |
| `parentSpanId` | `span.parent_span_id` | tracer.js:86 / store.js:213 |
| `promptTokens` / `completionTokens` / `totalTokens` | `span.prompt_tokens` / `span.completion_tokens` / `span.total_tokens` | tracer.js:90, :91, :92 / store.js:217, :218, :219 |
| `latencyMs` | `span.latency_ms` | tracer.js:93 / store.js:220 |
| `toolCalls` | `span.tool_calls` | tracer.js:96 / store.js:223 |
| `startedAt` / `endedAt` | `span.started_at` / `span.ended_at` | tracer.js:97, :98 / store.js:224, :225 |
| cost record `spanId` / `traceId` | `record.span_id` / `record.trace_id` | tracer.js:68, :69 / store.js:240, :239 |
| cost record `promptTokens` / `completionTokens` | `record.input_tokens` / `record.output_tokens` | tracer.js:72, :73 / store.js:245, :246 |

`store.js:212` has no `|| null` fallback (unlike store.js:213), so the binding
would be `undefined`. **This is stated as a name disagreement, not as an
observed crash** — nothing runs this path, which is exactly why it survives.
`simulator.js` writes the same rows itself, in snake_case, and works
(simulator.js:187-204, :209-220).

## The traffic source — `src/simulator.js` (413 lines)

| Fact | Citation |
|---|---|
| `export async function simulate(options)` — defaults 500 requests / 7 days | simulator.js:75, :77, :78, :79 |
| Constructs `Store` and `CostTracker` | simulator.js:82, :83 |
| Vocabularies: 4 agents, 4 models, 5 workflows, 5 users, 5 tools | simulator.js:10, :11, :12, :13, :14 |
| Main loop over `totalRequests` | simulator.js:97 |
| 1–4 spans per trace | simulator.js:125 |
| Timestamps spread over `daysBack`, business-hours weighted (70% 09:00-17:00) | simulator.js:31, :33, :34, :109, :113 |
| Trace row inserted **first**, to satisfy the FK on spans | simulator.js:223, :227 |
| Then spans and cost records, per span | simulator.js:241, :242, :244 |
| Quality score sampled on ~30% of traces | simulator.js:250, :271 |
| Four demo budgets set at the end | simulator.js:381, :382, :383, :384 |
| Returns `{traces, spans, qualityScores, driftAlerts, totalCost}` | simulator.js:386-392, :394 |
| **No LLM call, no HTTP client, no network egress**: the only imports are `crypto`, `Store`, `Tracer`/`MODEL_PRICING`, `CostTracker` | simulator.js:1, :2, :3, :4 |

## The store — `src/store.js` (552 lines)

| Fact | Citation |
|---|---|
| `export class Store`, opens `better-sqlite3` on the given path | store.js:105, :106, :107 |
| `journal_mode = WAL`, `foreign_keys = ON` | store.js:108, :109 |
| `_runMigrations()` splits the DDL blob on `;` and execs each statement | store.js:110, :113, :114, :117, :118 |
| 23 class members total; 20 of them are data methods (constructor store.js:106, `_runMigrations` store.js:113 and `close` store.js:547 excluded) | store.js:106-547 |
| **8 of those 20 have zero call sites** anywhere in `src/` or `public/` | store.js:144, :159, :163, :167, :347, :444, :458, :514 |
| Named: `updateTrace`, `getTrace`, `getTraceSpans`, `getTraces`, `getQualityScores`, `insertMetricsSnapshot`, `getMetricsSnapshots`, `getStats` | store.js:144, :159, :163, :167, :347, :444, :458, :514 |
| Every other module reaches **past** the Store into `store.db` / `this.store.db` — 5 files do it | costTracker.js:77, dashboard.js:41, driftDetector.js:70, qualityScorer.js:168, simulator.js:291 |

### INVARIANT CARD source — the 7 tables, complete, in schema order

| # | Table | Declared | Written by | Read by |
|---|---|---|---|---|
| 1 | `traces` | store.js:5 | `insertTrace` store.js:124 ← simulator.js:227 (and the dead tracer.js:155) | dashboard.js:43, :89, :90, :102, :292, :293, :321, :332 |
| 2 | `spans` | store.js:18 | `insertSpan` store.js:205 ← simulator.js:242 (and the dead tracer.js:65) | dashboard.js:45, :105, :359, :364; driftDetector.js:81, :93, :118, :280, :322 |
| 3 | `cost_records` | store.js:37 | `insertCostRecord` store.js:233 ← simulator.js:244, costTracker.js:17 (uncalled), tracer.js:66 (dead) | dashboard.js:48, :61, :139, :145, :177; costTracker.js:81, :226, :232, :241 |
| 4 | `quality_scores` | store.js:51 | `insertQualityScore` store.js:330 ← simulator.js:271, qualityScorer.js:112, :135 | dashboard.js:51, :221, :223, :228, :254; qualityScorer.js:169, :195, :227, :267 |
| 5 | `drift_alerts` | store.js:63 | `insertDriftAlert` store.js:394 ← simulator.js:323, :343, :363 and driftDetector.js:222 | dashboard.js:54, :281; store.js:438 |
| 6 | `metrics_snapshots` | store.js:78 | `insertMetricsSnapshot` store.js:444 — **zero call sites** | `getMetricsSnapshots` store.js:458 — **zero call sites** |
| 7 | `budgets` | store.js:87 | `setBudget` store.js:479 ← costTracker.js:121 ← simulator.js:381-384 | `getBudget` store.js:506 ← costTracker.js:129, :167 |

Plus 7 indexes, created in the same DDL blob: store.js:96, :97, :98, :99, :100,
:101, :102. **Six of seven tables carry rows after `npm start`;
`metrics_snapshots` is created and never touched** — it is the only table with
no writer and no reader.

## The three analysis classes

### `src/costTracker.js` (258 lines)

| Fact | Citation |
|---|---|
| `export class CostTracker(store)` | costTracker.js:9, :10 |
| 14 members; 12 public data methods (constructor costTracker.js:10 and private `_attributeBy` costTracker.js:62 excluded) | costTracker.js:10-217 |
| **2 of the 12 are ever called**: `setBudget` and `getBudgetStatus` | costTracker.js:120 ← simulator.js:381; costTracker.js:128 ← dashboard.js:200 |
| Uncalled: `recordCost`, `getHourlyCosts`, `getDailyCosts`, `getWeeklyCosts`, `getCostByAgent`, `getCostByModel`, `getCostByUser`, `getCostByWorkflow`, `checkBudget`, `getTodaySummary` | costTracker.js:16, :33, :42, :51, :98, :102, :106, :114, :166, :217 |
| Budget bands, in `getBudgetStatus`: `alert = pct >= 100 ? 'blocked' : pct >= 80 ? 'warning' : null` | costTracker.js:146, :157 |
| The same 100 / 80 bands again in the uncalled pre-request gate `checkBudget` | costTracker.js:176, :183, :195, :203 |
| The header comment says it "Aggregates token-level cost records written by the tracer" | costTracker.js:4 |

### `src/qualityScorer.js` (313 lines)

| Fact | Citation |
|---|---|
| `export class QualityScorer(store, options)` | qualityScorer.js:76, :77 |
| Defaults: `sampleRate 0.1`, `threshold 3.5`, `windowDays 7` | qualityScorer.js:9, :10, :11, :12 |
| 9 members; 8 public methods (constructor qualityScorer.js:77 excluded) | qualityScorer.js:77-282 |
| **Constructed exactly once — and then never called** | dashboard.js:15 |
| `scoreResponse` (the "LLM-as-judge") is a djb2 hash + LCG, no model call | qualityScorer.js:17, :25, :86, :87, :88, :105 |
| Uncalled from outside the class: `scoreResponse`, `shouldSample`, `recordScore`, `getAverageScore`, `getRollingAverage`, `getScoreDistribution`, `getQualityTrend`, `checkQualityThreshold` | qualityScorer.js:86, :128, :134, :149, :180, :207, :243, :282 |
| The 5-criteria feedback template table (relevance, accuracy, helpfulness, coherence, safety) is defined and unreachable | qualityScorer.js:36, :37, :44, :51, :58, :65 |

### `src/driftDetector.js` (354 lines)

| Fact | Citation |
|---|---|
| `export class DriftDetector(store, options)` | driftDetector.js:6, :7 |
| `METRICS = ['token_usage','latency','cost','tool_usage','quality']` — 5, complete | driftDetector.js:1 |
| Defaults: baseline 7 days, recent window 6 hours, z threshold 2.0 | driftDetector.js:9, :10, :11 |
| True z-score: `(current - baselineMean) / baselineStd`, 0 when std is 0 | driftDetector.js:18, :19, :20 |
| Severity: `|z| >= 3.0` critical, `|z| >= threshold` warning, else none | driftDetector.js:178, :179, :181, :185 |
| `runAllChecks(agents, models)` — triple loop, inserts an alert per drifted cell | driftDetector.js:209, :215, :216, :217, :218, :221, :222 |
| 13 members; 11 public methods (constructor driftDetector.js:7, private `_getMetricValues` driftDetector.js:69 excluded) | driftDetector.js:7-310 |
| **Reached from exactly one route**, via `runAllChecks` | dashboard.js:294 |
| Never called at all: `getActiveAlerts`, `resolveAlert`, `getLatencyPercentiles`, `getTokenStats`, `getToolUsageRate` | driftDetector.js:244, :248, :254, :268, :310 |

## The server — `src/dashboard.js` (413 lines)

| Fact | Citation |
|---|---|
| `export function startDashboard(dbPath)` | dashboard.js:12 |
| Constructs Store, CostTracker, QualityScorer, DriftDetector — in that order | dashboard.js:13, :14, :15, :16 |
| `PORT` env or 3000 | dashboard.js:19 |
| Serves `../public` statically — this is how `index.html` is delivered | dashboard.js:22 |
| Permissive CORS on every response | dashboard.js:28, :29, :30, :31 |
| **13** `app.get` routes | dashboard.js:39, :71, :99, :113, :162, :197, :208, :240, :269, :289, :302, :318, :329 |
| **12 of the 13 reach `store.db` directly**; only `/api/costs/budget` goes purely through a class | dashboard.js:41, :73, :101, :115, :164, :210, :242, :271, :292, :310, :320, :331 vs dashboard.js:200 |
| `console.log` of the URL on listen | dashboard.js:342, :343, :344 |
| The Store's own query helpers (`getTraces`, `getTraceSpans`, `getStats`, `getQualityScores`) are re-implemented inline here rather than called | store.js:167 vs dashboard.js:90; store.js:163 vs dashboard.js:105; store.js:514 vs dashboard.js:43-62; store.js:347 vs dashboard.js:221 |

### The route that cannot work

`GET /api/traces/:id` — the trace-viewer backend, the README's "standout"
drill-down — filters on a column the schema does not declare:

```
const trace = db.prepare('SELECT * FROM traces WHERE trace_id = ?').get(...)   dashboard.js:102
```

`traces` has ten columns and `trace_id` is not among them; the primary key is
`id`: store.js:6, :7, :8, :9, :10, :11, :12, :13, :14, :15. The span query one
line later uses the correct column name (`spans.trace_id`, store.js:20) —
dashboard.js:105. The route body is wrapped in try/catch, so the failure
surfaces as `500 {error}`, not a stack trace: dashboard.js:107, :108.

## The browser client — `public/index.html` (960 lines)

Delivered by `express.static` (dashboard.js:22) and executed in the user's
browser: the **only** real network hop in the system.

| Fact | Citation |
|---|---|
| Single inline `<script>`, no external library, no `<script src=>` | index.html:263 |
| `MiniChart` — a hand-rolled Canvas-2D renderer (line / bar / area / horizontalBar) | index.html:297, :298 |
| `const API = ''` — same-origin | index.html:577 |
| 5 tabs: Overview, Costs, Quality, Drift, Traces | index.html:183, :184, :185, :186, :187 |
| 11 `fetch()` call sites | index.html:581, :586, :590, :595, :600, :608, :612, :621, :638, :642, :857 |
| KPI auto-refresh every 10 s | index.html:678 |
| 2 of the 13 server routes are never fetched: `/api/quality/distribution` and `/api/costs/budget` | dashboard.js:240, :197 |
| 1 fetch has no route behind it: `POST /api/drift/alerts/:id/resolve` | index.html:857 vs the 13 `app.get`s above — no `app.post` exists in dashboard.js |

---

### INVARIANT CARD 1 — drift: injected in 4 places, detected by 2 different engines

The project's headline feature. The ground truth and the detector do not share
a line of code, and the detector that runs on `npm start` is **not** the
z-score one the README describes.

**Injected — `simulator.js`, and only into one agent, and only in the tail of
the window:**

| # | Perturbation | Factor | Citation |
|---|---|---|---|
| gate | `agent === 'research-agent'` | — | simulator.js:120 |
| gate | `dayOffset >= daysBack - 2` (last 2 of 7 days) | — | simulator.js:89, :121 |
| gate | both must hold: `applyDrift = isDriftAgent && isDriftPeriod` | — | simulator.js:122 |
| 1 | prompt **and** completion tokens | × 1.4 | simulator.js:143, :144, :145 |
| 2 | latency | × 1.6 | simulator.js:160, :161 |
| 3 | tool-call probability 0.30 → 0.55, plus 1–2 extra calls appended | — | simulator.js:165, :170, :171, :173 |
| 4 | quality score | − 0.5, floored at 1.0 | simulator.js:265, :266 |

**Detector A — inline in `simulate()`, percent-change, runs on every `npm start`:**

| Fact | Citation |
|---|---|
| Cutoff `baselineEnd`, then 4 aggregate queries (span latency+tokens, quality) split around it | simulator.js:289, :291, :298, :305, :311 |
| latency alert when pct change > 20; severity critical above 40 | simulator.js:321, :322, :327 |
| token alert when pct change > 20; severity critical above 30 | simulator.js:341, :342, :347 |
| quality alert when the mean drops more than 0.2; critical above 0.4 | simulator.js:361, :362, :367 |
| It stores the **percent change** in the `z_score` column | simulator.js:331, :351, :371 |
| Ceiling of 3 alerts, all hard-coded to `agent: 'research-agent'` | simulator.js:324, :344, :364, :317, :335, :355, :375 |
| The comment admits the substitution: "Manually compute drift alerts since DriftDetector may not exist yet." | simulator.js:287 |
| `DriftDetector` sits imported-out in a comment two lines above the file's live imports | simulator.js:5, :8 |

**Detector B — `DriftDetector`, real z-score, runs only when a browser hits one URL:**

| Fact | Citation |
|---|---|
| 5 metrics × every distinct agent × every distinct model | driftDetector.js:1, :209, :215, :216, :217 |
| Baseline mean and population std over the 7-day window ending 6 h ago | driftDetector.js:39, :40, :48, :49, :50 |
| Current value = mean of the last 6 h | driftDetector.js:59, :61, :64 |
| Requires ≥ 2 baseline samples, else "Insufficient data" and no alert | driftDetector.js:44, :160, :171 |
| Reached only from `GET /api/drift/check` | dashboard.js:289, :294 |

### INVARIANT CARD 2 — six classes, every construction site

| Class | Declared | `new` sites | Method reach |
|---|---|---|---|
| `Store` | store.js:105 | simulator.js:82, dashboard.js:13 | 20 data methods, 8 with zero call sites (store.js:144, :159, :163, :167, :347, :444, :458, :514) |
| `CostTracker` | costTracker.js:9 | simulator.js:83, dashboard.js:14 | 12 public, 2 called — `setBudget` (simulator.js:381) and `getBudgetStatus` (dashboard.js:200) |
| `QualityScorer` | qualityScorer.js:76 | dashboard.js:15 | 8 public, **0 called** |
| `DriftDetector` | driftDetector.js:6 | dashboard.js:16 | 11 public, 1 called — `runAllChecks` (dashboard.js:294) |
| `Tracer` | tracer.js:160 | **none** | unreachable |
| `Span` / `Trace` | tracer.js:21, :104 | tracer.js:121, :166 only | reachable only through `Tracer` (tracer.js:120, :165) |

### INVARIANT CARD 3 — the UI reads fields the API never sends

The client and the server were written against different field vocabularies.
Two response shapes are adapted; four are consumed raw and silently render as
`--`, `0` or empty.

| The page reads | The row/response actually carries | Citations |
|---|---|---|
| `trace.latencyMs` | nothing — `traces` has no latency column at all | index.html:883 / store.js:5-16 |
| `trace.totalTokens` | `total_tokens` | index.html:883 / store.js:13 |
| `trace.costCents` | `total_cost` (USD float, not cents) | index.html:883 / store.js:14 |
| `trace.timestamp` | `started_at` | index.html:883 / store.js:11 |
| `span.durationMs` | `latency_ms` | index.html:906, :915 / store.js:28 |
| `span.tokens` | `total_tokens` | index.html:917 / store.js:27 |
| `span.costCents` | `cost` | index.html:918 / store.js:29 |
| `span.toolCalls` (expects an array) | `tool_calls` (a JSON **string**, re-stringified at write time) | index.html:923, :925 / store.js:31, simulator.js:200 |
| `span.children` (expects a tree) | flat rows; the parent link is `parent_span_id` | index.html:936 / store.js:21 |
| `alert.zScore` | `z_score` | index.html:848 / store.js:72 |
| `data.metrics.labels/baseline/current` | `/api/drift/alerts` returns `{ alerts }` and nothing else | index.html:865, :866, :868 / dashboard.js:282 |

**Adapted, correctly, in exactly two places:** `fetchTimeseries` maps the four
front-end metric names onto the API's four (index.html:614, :615, :616) and
reshapes `{bucket,value,count}` rows into labels/values (index.html:622, :627,
:630); `fetchCostAttribution` maps `{name,cost}` into labels/values
(index.html:600, :601, :602). Everything else is handed straight to the
renderer.

---

## Artifacts written

| Artifact | Written by | Citation |
|---|---|---|
| `./observability.db` — SQLite, 7 tables, WAL journal | `new Database(dbPath)` + DDL | store.js:107, :108, :4-103 |
| …deleted and recreated on every `npm start` | `fs.unlinkSync` | demo.js:10, :11 |
| stdout — 5-line simulation summary | `console.log` in demo | demo.js:24-29 |
| stdout — the dashboard URL | `console.log` on listen | dashboard.js:343, :344 |
| HTTP responses — 13 JSON routes + the static page | express | dashboard.js:22, :39-337 |

## README claims that did not verify

1. **The ASCII draws `Tracer → SQLite Store` as the write path.** No module
   constructs `Tracer`. The write path is `simulate()` → `Store` directly:
   simulator.js:227, :242, :244. The only import is simulator.js:3, and it takes
   only `MODEL_PRICING` in practice — `calculateCost` is re-declared locally at
   simulator.js:40. **Most load-bearing correction on this page.**
2. **"Run drift detection to generate alerts"** (README Quick Start, step 3)
   implies the z-score engine runs during `npm start`. It does not. The demo
   path uses a separate percent-change implementation inlined in the simulator
   (simulator.js:289-377), which even writes percent change into the `z_score`
   column (simulator.js:331). The z-score `DriftDetector` runs only on
   `GET /api/drift/check` (dashboard.js:289, :294).
3. **"Dashboard UI — `public/dashboard.html`"** (Components table). The file is
   `public/index.html`; there is no `dashboard.html`. `express.static`
   (dashboard.js:22) serves `index.html` by directory-index default.
4. **The API table lists 11 endpoints.** There are 13 `app.get` routes
   (dashboard.js:39, :71, :99, :113, :162, :197, :208, :240, :269, :289, :302,
   :318, :329) — `/api/agents` and `/api/models` are undocumented, and the page
   depends on both (index.html:638, :642).
5. **"Trace viewer: click a request → see the full span tree"** is presented as
   working. The backing route filters `traces.trace_id`, a column that does not
   exist (dashboard.js:102 vs store.js:5-16), and the client-side renderer reads
   a different field vocabulary again (invariant card 3). The feature is broken
   at both layers independently.

## Folded into one box (to hold the 6-12 component-box rule)

The page draws **12 component boxes**. Each fold keeps both citations on the
surviving box, so nothing became untraceable.

| Folded | Into | Why it is legitimate |
|---|---|---|
| `Span` (tracer.js:21) + `Trace` (tracer.js:104) | the `Tracer` box | They are constructed only from inside `Tracer`/`Trace` (tracer.js:121, :166) — not separate addresses in the system |
| `calculateCost` + `MODEL_PRICING` (tracer.js:4, :14) | the `Tracer` box | Same module; the pricing table is the only part of the file anything imports (simulator.js:3) |
| `buildTimeseries` (dashboard.js:352) | the `startDashboard()` box | A module-private helper of one route (dashboard.js:310) |
| `MiniChart` (index.html:297) + the 5 tab loaders | the browser box | Same file, same process, one deliverable |
| the 7 SQLite tables + 7 indexes | the `observability.db` box | Enumerated on invariant card 1's source table above; drawing 7 cylinders would be a schema diagram, not L1 |

## Deliberately NOT drawn (L1 scope discipline)

- The per-request generation loop inside `simulate()` (simulator.js:97-283) —
  L2b; the diagram carries its inputs, outputs and the drift gates.
- The z-score / percentile / variance maths (driftDetector.js:18-53, :25) — L2.
- The djb2 hash + LCG inside `scoreResponse` (qualityScorer.js:17, :25) — L2,
  and unreachable besides.
- The `MiniChart` canvas draw routines (index.html:297-574) — L2, and a
  rendering concern, not an architectural one.
- Individual SQL statements. The tables and who writes/reads them are L1; the
  `WHERE` clauses are not.
- The `budgets` table's four demo rows (simulator.js:381-384) — data, not
  architecture.

## Portability notes — where the FTS token vocabulary bent for this domain

Fourth codebase for this harness; recorded because "rules bent per new domain"
is the portability metric being tracked.

1. **`component.agent` has no honest occupant — again.** This project is named
   "agent observability" and contains no agent: the four "agents" are four
   string literals in an array (simulator.js:10) used as a column value
   (store.js:6). The nearest structural occupant of the agent position is
   `Tracer` — the SDK a real agent would import — so it took `component.agent`,
   **with `DEAD — 0 instantiations` carried on the node label** so the picture
   cannot imply that anything calls it. This is the same strain reported on
   04-multi-agent and 07-guardrails, now in its most extreme form: the token's
   occupant here is dead code.
2. **`component.external` finally has a legitimate occupant.** Across previous
   diagrams the "external" surface kept turning out to be a hardcoded mock.
   Here it is `public/index.html`, which runs in the user's browser and talks to
   the process over HTTP (dashboard.js:22, index.html:577) — a real process
   boundary, a real network hop, no mock involved. Recorded as the
   counter-example: the token is not broken, the earlier projects simply had no
   outside.
3. **`component.mock` fits exactly, for once.** `simulate()` is a traffic
   generator standing in for real agent traffic (simulator.js:75) — the token's
   literal meaning. Contrast 07-guardrails, where it had to be stretched over a
   control-query constant.
4. **`component.artifact` is used for a database, contradicting the theme
   file's own rename note.** `hoa-default.json` records
   `component.store -> component.artifact` with the reason "durable output here
   is files, not a database". In this project the durable output *is* a
   database (store.js:107). The token still fits — `observability.db` is a
   durable artifact on disk — but the rename's stated rationale no longer holds
   and should be dropped from the theme's `_meta`, not the token.
5. **No write-direction edge token exists.** `edge.data_in` reads correctly for
   `observability.db → startDashboard()`, but the three write edges
   (`simulate() → Store`, `Store → db`, inline alerter `→ Store`) had to borrow
   `edge.primary`. An `edge.data_out` / `edge.write` would remove the ambiguity;
   `edge.primary` currently means both "the critical path" and "a write".
6. **`edge.stop` was stretched from "blocked at runtime" to "unreachable at
   build time".** It carries `tracer.js → Store` because that is the only red
   vocabulary available. A `edge.dead` token would be honest; the label
   `never instantiated` does the work in the meantime.
7. **`boundary.observability` labels a zone containing stdout only** — the same
   over-promise recorded on 07-guardrails. Kept, because "where the run becomes
   visible to a human" is exactly the semantic role.
