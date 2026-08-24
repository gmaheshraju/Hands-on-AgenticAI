# FACTS — 08-eval-engineering (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/08-eval-engineering/`, n=6 JS modules (1195 lines) +
`data/golden-set.json` + `baselines/baseline.json` + `reports/`.
**Every element in the diagram appears below with a `file:line` citation. The
diagram may contain nothing that is not on this page, and this page may contain
nothing without a citation.** The README ships an ASCII diagram
(`README.md:7-15`) and a set of dataset counts (`README.md:84-85`); both were
treated as CLAIMS. Two README claims were **refuted** against source — see
"README claims checked" below.

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The per-question scoring loop's internal
control flow, and the shape of the judge prompts themselves, are L2/L2b concerns
and are deliberately NOT drawn.

---

## What the project is

A RAG evaluation harness. It runs a golden Q&A set through a RAG system under
test, scores every answer with an LLM-as-judge across three calibrated
dimensions, compares the run against a saved baseline, writes a markdown report,
and — in CI mode — exits non-zero when the scores regressed.
`package.json` declares `"type": "module"`, three npm scripts, and one runtime
dependency (`@google/generative-ai`).

---

## Components (every box on the diagram)

| Box | What it is | Citation |
|---|---|---|
| `demo.js` — CLI, 2 RAG scenarios | `runDemo()` runs the pipeline twice: perfect RAG then degraded RAG | demo.js:118, :141, :157 |
| `golden-set.json` — 30 Q&A triples | read and parsed at the top of `runEval` | runner.js:22, :54 |
| RAG under test — injected function | `options.ragSystem` is `async (question) => { answer, sourceContent }`, invoked per question | runner.js:30, :70 |
| `runEval()` — the 9-step pipeline | the orchestrator; the only thing that sequences the other modules | runner.js:37 |
| LLM-as-judge | `createJudge(apiKey)` (real) / `createMockJudge()` (heuristic); both expose `evaluate(...)` | evaluator.js:22, :88, :52, :118 |
| `dimensions.js` — 3 rubric prompts | one prompt builder per dimension + the response parser | dimensions.js:13, :57, :100, :147 |
| Gemini API | `gemini-2.0-flash`, `temperature: 0.1`, `maxOutputTokens: 1024` | evaluator.js:24, :25, :27, :28 |
| `createMockJudge()` — word-overlap heuristic | no API key needed; scores from token overlap + key-point substring hits | evaluator.js:88, :89, :100, :104 |
| `regression.js` | `detectRegressions` compares run vs baseline; `saveBaseline` writes the new one | regression.js:61, :31, :53 |
| `reporter.js` | `generateReport` builds the markdown; `writeReport` puts it on disk | reporter.js:19, :150 |
| `baselines/baseline.json` | JSON snapshot of aggregate + per-question scores | regression.js:37, :53; runner.js:23 |
| `reports/eval-<ts>.md` | one markdown report per run, named by `Date.now()` | runner.js:24, :146, :147 |

## Flows (every arrow on the diagram)

| From → To | What crosses | Citation |
|---|---|---|
| `demo.js` → `runEval()` | two full pipeline runs (baseline, then degraded) | demo.js:141, :157 |
| `golden-set.json` → `runEval()` | the 30 questions, parsed from disk | runner.js:54, :55 |
| RAG under test → `runEval()` | `{ answer, sourceContent }` per question | runner.js:70, :74 |
| `runEval()` → judge | `evaluate({question, answer, expectedAnswer, sourceContent, keyPoints})` | runner.js:78-84 |
| judge → `dimensions.js` | three prompt builders, called to construct the judge calls | evaluator.js:55, :56, :57 |
| judge → Gemini API | `model.generateContent(prompt)`, response text parsed | evaluator.js:36, :37, :38 |
| judge → mock judge | selected when `useMock` — the `--mock` path | runner.js:58 |
| judge → `regression.js` | per-question score objects accumulate into `questionResults` | runner.js:86-94, :120-124 |
| `regression.js` → `reporter.js` | the regression report feeds `generateReport` | runner.js:128, :139 |
| `baseline.json` → `regression.js` | `loadBaseline(BASELINE_PATH)` — returns `null` if absent | runner.js:127; regression.js:20, :21 |
| `regression.js` → `baseline.json` | `writeFileSync` of the new snapshot | regression.js:53; runner.js:152 |
| `reporter.js` → `reports/eval-<ts>.md` | `writeReport(reportFile, report)` | runner.js:146, :147; reporter.js:151 |

---

## INVARIANT CARD 1 — `runEval()`, the 9 steps, complete and in code order

The numbered comments in `runner.js` are the author's own enumeration; all nine
are present and none was collapsed.

| # | Step | Citation |
|---|---|---|
| 1 | Load golden dataset (`JSON.parse(readFileSync(GOLDEN_SET_PATH))`) | runner.js:53, :54 |
| 2 | Create judge — `useMock ? createMockJudge() : createJudge(apiKey)` | runner.js:57, :58 |
| 3 | For each question: call the RAG system, then the judge | runner.js:60, :64, :70, :78 |
| 4 | Compute aggregate metrics | runner.js:117, :118 |
| 5 | Load baseline and detect regressions | runner.js:126, :127, :128 |
| 6 | Generate report, then write it | runner.js:130, :139, :146, :147 |
| 7 | Save baseline if requested **or if there is no baseline yet** | runner.js:150, :151, :152 |
| 8 | Print summary — four aggregates, then the PASS/FAIL verdict | runner.js:156, :157, :163, :164 |
| 9 | CI exit code — `process.exit(1)` | runner.js:166, :167, :169 |

Two details that matter and are on the card:
- Step 4 **skips** rows where both faithfulness and relevance failed to parse, so
  the denominator is `validCount`, not the question count — runner.js:184, :185, :195.
- Step 3 is wrapped in `try/catch`: a thrown error becomes a score-0 row with
  `parseError: true` on all three dimensions rather than aborting the run —
  runner.js:95, :104-108.

## INVARIANT CARD 2 — regression gates: every threshold and where it fires

Three module constants, all in `regression.js`, and the exact comparison each one
drives. Nothing else in the codebase decides PASS/FAIL.

| Constant | Value | Applied at | Meaning |
|---|---|---|---|
| `REGRESSION_THRESHOLD_POINTS` | 1 | regression.js:109 | `diff < -1` on any dimension ⇒ that question regressed |
| `IMPROVEMENT_THRESHOLD_POINTS` | 1 | regression.js:112 | `diff > +1` on any dimension ⇒ that question improved |
| `AGGREGATE_THRESHOLD_PERCENT` | 0.05 | regression.js:155 | `pctChange < -0.05` on any aggregate ⇒ aggregate regression |

Declared: regression.js:13, :14, :15. Classification is a first-match ladder —
regressed, else improved, else unchanged — regression.js:132, :134, :136, :137.
Verdict: `hasRegressions = regressions.length > 0 || aggregateRegression`
(regression.js:161). With **no baseline** the function short-circuits to
`hasRegressions: false` and the run becomes the baseline — regression.js:62, :65,
:67 with runner.js:151. The only process-level consequence is the CI exit at
runner.js:167-169.

## INVARIANT CARD 3 — the three dimensions, complete, in `DIMENSIONS` order

Declared as one array, in this order, at dimensions.js:190-205.

| Dimension | Weight | Prompt builder | Rubric 5→1 | Calibration examples |
|---|---|---|---|---|
| `faithfulness` | 0.4 | dimensions.js:13 | dimensions.js:30-34 | 4, dimensions.js:38-41 |
| `relevance` | 0.3 | dimensions.js:57 | dimensions.js:74-78 | 4, dimensions.js:82-85 |
| `completeness` | 0.3 | dimensions.js:100 | dimensions.js:119-123 | 4, dimensions.js:127-130 |

Weights live in the real judge at evaluator.js:63 and are mirrored, hard-coded,
in the mock judge at evaluator.js:139-141. `composite` sums only dimensions whose
`parseError` is false — evaluator.js:67, :68, :69, :74.

`parseJudgeResponse` (dimensions.js:147) has exactly **three** exits that return
`score: 0, parseError: true`:
1. no JSON object found in the response — dimensions.js:155, :156, :157
2. score missing or outside 1–5 — dimensions.js:167, :168, :170
3. `JSON.parse` threw — dimensions.js:177, :178, :180

It also strips markdown code fences before matching — dimensions.js:151.

---

## Report structure (behind the `reporter.js` box)

`generateReport` emits eight blocks, in this order: header reporter.js:23,
verdict :34, aggregate scores table :46, score distribution :64, regression
details :76, per-question table :81, low-score details :119, footer :141.
Low-score details are gated on `minScore <= 3` — reporter.js:115.

## Artifacts

| Artifact | Written by | Citation |
|---|---|---|
| `reports/eval-<Date.now()>.md` | `writeReport` from `runEval` | runner.js:146, :147; reporter.js:151 |
| `baselines/baseline.json` | `saveBaseline` from `runEval` | runner.js:152; regression.js:53 |
| `baselines/demo-baseline.json` (path declared, unused by `runDemo`) | `demo.js` constant only | demo.js:25 |

Present in the committed repo: n=8 `reports/eval-*.md`, n=1 `baselines/baseline.json`.

## README claims checked against source

| Claim | Verdict | Evidence |
|---|---|---|
| "30 Q&A triples" (README.md:42) | **CONFIRMED** — `questions` array has 30 entries | data/golden-set.json |
| "easy (7), medium (14), hard (9)" (README.md:84) | **REFUTED** — actual split is easy 6, medium 13, hard 11 | counted from data/golden-set.json |
| "factual (17), reasoning (8), multi-hop (5)" (README.md:85) | **REFUTED** — actual split is factual 16, reasoning 9, multi-hop 5 | counted from data/golden-set.json |
| "flags any dimension that drops more than 1 point" (README.md:74) | CONFIRMED | regression.js:13, :109 |
| "flags if any overall metric drops more than 5%" (README.md:75) | CONFIRMED | regression.js:14, :155 |
| ASCII diagram's linear chain (README.md:8) | INCOMPLETE, not wrong — it omits the baseline read/write loop and the two judge backends | runner.js:127, :152; runner.js:58 |

Because the two dataset-split claims are refuted, the diagram states only the
counts it verified (30 questions) and no difficulty/category breakdown.

---

## Deliberately NOT drawn (L1 scope discipline)

- The per-question loop body's control flow and its `try/catch` recovery —
  **L2b**, a different altitude. Its outcome is stated on card 1 instead.
- The text of the rubric prompts (the project's most interesting content, but it
  is prose inside one module, not structure).
- `formatRegressionDetails` (regression.js:184) and `computeDistribution`
  (reporter.js:157) — helpers wholly inside a box already on the page.
- `introduceHallucination` / `simpleHash` (demo.js:98, :108) — the degradation
  fixture's internals; the box says "perfect vs degraded" and that is the L1 fact.
- The 8 committed report files individually; one artifact box stands for the set.

## Portability notes — tokens that did not fit this domain

Third codebase through this harness; recording the same metric the exemplar did.

1. **`component.mock` is carrying two different meanings here.** The RAG system
   under test is a *fixture* (a stand-in for the thing being evaluated), while
   `createMockJudge()` is a *degraded backend* (a stand-in for a paid API). Both
   render identically grey. The vocabulary wants a `component.fixture` distinct
   from `component.mock`.
2. **`component.artifact` is used for an INPUT.** `golden-set.json` is a durable
   file the system reads, not one it writes, but the token set has no
   `component.dataset`. Same green box as the outputs, which slightly understates
   the direction of travel; the arrow token (`edge.data_in`) carries it instead.
3. **No `edge.stop` was used.** In `agent_harness_v1` that token marked the run
   loop terminating. The nearest thing here is `process.exit(1)` (runner.js:169),
   which is a process-level consequence with no target box — so it lives on card 2
   as text rather than as an arrow. A domain-neutral `edge.verdict` would have fit.
4. `boundary.external` labels a zone where exactly one member (Gemini) actually
   leaves the process; the other (mock judge) never does. Same honesty problem the
   exemplar recorded — the zone label has to say so.
