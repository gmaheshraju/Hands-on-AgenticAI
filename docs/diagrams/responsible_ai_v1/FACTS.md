# FACTS — 13-responsible-ai (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/13-responsible-ai/src/` + `data/templates/`, n=7 files,
2228 lines. **Every element in the diagram appears below with a `file:line`
citation. The diagram may contain nothing that is not on this page, and this page
may contain nothing without a citation.** The project README ships an ASCII
diagram (README.md lines 40-83); it was treated as a **claim, not evidence** —
every fact below was read from source. Two claims from that ASCII did not survive
(see "What the README's ASCII gets wrong").

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The numerical interiors of the statistical
tests (Lanczos gamma, Lentz continued fractions) are L2 detail and are
deliberately NOT drawn.

---

## What this project is

A bias-audit pipeline for an AI resume screener, plus an EU AI Act model-card
generator. It builds matched resume pairs that differ on exactly one demographic
attribute, pushes both halves through the system under test, and converts the
score/decision deltas into statistical findings and a compliance document.

| Fact | Citation |
|---|---|
| Package name `bias-audit-pipeline`, ESM (`"type": "module"`) | package.json |
| Entry `src/demo.js`; `npm run audit` = `node src/demo.js --full` | package.json |
| Pipeline is a single pass, five numbered steps, inside `runDemo()` | demo.js:146, demo.js:164, demo.js:185, demo.js:205, demo.js:235, demo.js:253 |

---

## Components

| # | Node in diagram | What it is | Citation |
|---|---|---|---|
| 1 | `demo.js` — CLI, 3 modes | reads `process.argv.slice(2)`; `--full`; `--fair` | demo.js:147, :148, :149 |
| 2 | `resumeTemplates.js` — fixtures | 5 role templates, 3 demographic attributes, 3 university buckets | resumeTemplates.js:5, :144, :215 |
| 3 | `datasetBuilder.js` | `buildMatchedPairs` / `buildProxyTestPairs` / `buildIntersectionalPairs` | datasetBuilder.js:38, :179, :126 |
| 4 | `counterfactual.js` | `testPair` (both halves in one `Promise.all`), `aggregateResults`; batches of `concurrency = 5` | counterfactual.js:60, counterfactual.js:61, counterfactual.js:91, counterfactual.js:96, counterfactual.js:123 |
| 5 | `statistics.js` | `analyzeResults` — the four fairness tests, implemented from scratch | statistics.js:351 |
| 6 | `intersectional.js` | `analyzeIntersections` — compound bias, `--full` only | intersectional.js:24, demo.js:234 |
| 7 | `modelCard.js` | `generateModelCard`, `renderMarkdown`, `writeModelCard` | modelCard.js:34, :177, :374 |
| 8 | `scoringFn` — the system under test | `createBiasedScorer()` default, `createFairScorer()` under `--fair` | demo.js:40, :116, :151 |
| 9 | `output/MODEL_CARD.md` | written by `writeModelCard` | modelCard.js:377, :381 |
| 10 | `output/model_card.json` | written by `writeModelCard` | modelCard.js:378, :382 |

Ten component boxes. Node 8 sits in its own boundary because it is the *subject*
of the audit, not a stage of it — the pipeline is written against an opaque
`async (resumeText) => { score, decision, summary }` contract and never inspects
the scorer. That contract is the only thing crossing the boundary.

| Boundary fact | Citation |
|---|---|
| Contract the pipeline assumes of the system under test | counterfactual.js:56 |
| It is a MOCK: both scorers are local closures, no network anywhere in the repo | demo.js:40, :116 |
| The biased scorer's hidden biases are documented in-file (gender +0.8, ethnicity +0.5, age, university proxy) | demo.js:71, :79, :86, :93, :96 |

---

## Flows

| Edge | From → To | Payload | Citation |
|---|---|---|---|
| e_cli | demo.js → datasetBuilder | attribute + pairs-per-attribute (25, or 50 under `--full`) | demo.js:152, :166, :167, :168 |
| e_tmpl | resumeTemplates → datasetBuilder | templates + `DEMOGRAPHIC_DATA` + `UNIVERSITIES` | datasetBuilder.js:9, :39, :52, :53 |
| e_pairs | datasetBuilder → counterfactual | matched pairs carrying `resumeA` / `resumeB` | datasetBuilder.js:106, demo.js:191 |
| e_score | counterfactual → scoringFn | `scoringFn(resumeA)` and `scoringFn(resumeB)`, concurrently | counterfactual.js:61, :62, :63 |
| e_ret | scoringFn → counterfactual | `{ score, decision, summary }` | demo.js:105, :106, :107, :108 |
| e_agg | counterfactual → statistics | `aggregateResults()` buckets, per group pair | demo.js:207, :211, counterfactual.js:123 |
| e_stats | statistics → modelCard | `combinedStats` (gender + ethnicity + age merged) | demo.js:216, :273 |
| e_ipairs | datasetBuilder → intersectional | intersectional pairs, `--full` only | demo.js:178, datasetBuilder.js:126 |
| e_iscore | scoringFn → intersectional | every intersectional resume re-scored by the SAME scorer | demo.js:239 |
| e_icard | intersectional → modelCard | `intersectionalReport` | demo.js:246, :273 |
| e_md | modelCard → `MODEL_CARD.md` | `renderMarkdown(card)` then `writeFile` | modelCard.js:380, :381 |
| e_json | modelCard → `model_card.json` | `JSON.stringify(card, null, 2)` | modelCard.js:382 |

The main path reads left to right with no backtracking: **build → counterfactual
→ statistics → model card**. The intersectional branch is the only fan-out, and
it rejoins at the model card.

---

## INVARIANT CARD 1 — the four fairness tests, complete and in code order

`analyzeResults` runs exactly four tests per group pair, in this order, and then
ORs their verdicts. There is no fifth test and no configurable threshold.

| # | Test | Called at | Implemented at |
|---|---|---|---|
| 1 | `chiSquaredTest` — 2×2 flip-rate independence, df = 1 | statistics.js:365 | statistics.js:170, df statistics.js:201 |
| 2 | `welchTTest` — unequal-variance score difference | statistics.js:368 | statistics.js:224 |
| 3 | `cohensD` — standardized effect size | statistics.js:371 | statistics.js:285 |
| 4 | `demographicParity` — disparate-impact / 80% rule | statistics.js:376 | statistics.js:318, threshold statistics.js:331 |

Combination rule, verbatim in structure:
`biasDetected = chiSq.significant || tTest.significant || !parity.passes80PercentRule`
— statistics.js:391. Significance is `pValue < 0.05` in both tests
(statistics.js:208, statistics.js:269). p-values come from hand-written
distribution code, not a library: chi-squared via the upper incomplete gamma
(statistics.js:141, :62) and t via the regularized incomplete beta
(statistics.js:150, :85).

---

## INVARIANT CARD 2 — the finding ladder, complete and in code order

`generateFindings` (statistics.js:417) appends findings in this order. The fourth
is reachable only when the first three are all silent.

| # | Severity | Type | Condition | Citation |
|---|---|---|---|---|
| 1 | `HIGH` | `decision_flip_bias` | chi-squared significant | statistics.js:420, :422, :423 |
| 2 | `CRITICAL` if effect size is `large`, else `HIGH` | `score_disparity` | t-test significant | statistics.js:429, :432, :433 |
| 3 | `CRITICAL` | `disparate_impact` | 80% rule fails | statistics.js:439, :441, :442 |
| 4 | `INFO` | `no_bias_detected` | `findings.length === 0` | statistics.js:448, :450, :451 |

The intersectional analyzer contributes two more CRITICALs and one INFO by the
same shape — `intersectional_bias` (intersectional.js:182, :183),
`compound_discrimination` (intersectional.js:192, :193), `no_compound_bias`
(intersectional.js:202, :203).

Severity counts, and nothing else, set the verdict. `assessRiskLevel`
(modelCard.js:413) is a strict ladder:

| Condition | Risk level | Citation |
|---|---|---|
| any `CRITICAL` | `HIGH` | modelCard.js:417, :419 |
| else any `HIGH` | `MEDIUM` | modelCard.js:423, :425 |
| else | `LOW` | modelCard.js:430 |

and the risk level alone decides the two headline strings — assessment
`PASS` / `CONDITIONAL_PASS` / `FAIL` (modelCard.js:94) and deployment
`APPROVED_WITH_MONITORING` / `APPROVED_WITH_RESTRICTIONS` / `NOT_APPROVED`
(modelCard.js:133). One CRITICAL anywhere is sufficient to produce
`NOT_APPROVED`.

---

## INVARIANT CARD 3 — the model card's 10 sections, complete and in code order

The card object is a fixed literal; sections are not conditional (only their
*contents* can be null). In declaration order:

| # | Section key | Line | EU AI Act anchor as written in-file |
|---|---|---|---|
| 1 | `modelDetails` | modelCard.js:42 | — |
| 2 | `intendedUse` | modelCard.js:54 | Art. 13(3)(b) |
| 3 | `riskClassification` | modelCard.js:65 | Art. 6 |
| 4 | `trainingData` | modelCard.js:75 | Art. 10 |
| 5 | `metrics` | modelCard.js:83 | — |
| 6 | `biasAndFairness` | modelCard.js:93 | Art. 13(3)(b)(ii) |
| 7 | `ethicalConsiderations` | modelCard.js:101 | — |
| 8 | `limitations` | modelCard.js:112 | — |
| 9 | `recommendations` | modelCard.js:132 | Art. 13(3)(d) |
| 10 | `regulatoryCompliance` | modelCard.js:150 | Art. 6/9/10/13/14/15, modelCard.js:152-157 |

`renderMarkdown` (modelCard.js:177) walks the same object into ten numbered
Markdown headings (modelCard.js:194, :206, :217, :226, :233, :271, :305, :314,
:328, :350).

---

## Artifacts written

| Artifact | Written by | Citation |
|---|---|---|
| `output/MODEL_CARD.md` | `writeModelCard` after `renderMarkdown` | modelCard.js:377, :380, :381 |
| `output/model_card.json` | `writeModelCard`, `JSON.stringify(card, null, 2)` | modelCard.js:378, :382 |
| Output directory is created if absent | modelCard.js:375 |
| Directory chosen by the demo as `cwd()/output` | demo.js:275 |
| Both files are present in the committed repo | `output/MODEL_CARD.md` 10055 B, `output/model_card.json` 21969 B |

---

## What the README's ASCII gets wrong (claims that did not survive the source)

1. **"50+ pairs per attribute"** (README.md:51) — the default run builds **25**
   per variant combination; 50 only under `--full` (demo.js:152). The library
   default is 50 (datasetBuilder.js:38), but the demo never uses it.
2. **The ASCII shows statistics and intersectional as a symmetric fan-out from
   counterfactual testing** (README.md:64-73). In code, intersectional analysis
   does NOT consume counterfactual results — it takes pairs straight from the
   dataset builder (demo.js:178) and calls the scorer itself (demo.js:239).
   The diagram draws the real wiring.
3. The ASCII omits the fixture module and the proxy-test path entirely.

---

## Deliberately NOT drawn (L1 scope discipline)

- The numerical interiors of the statistical machinery — `gammaLn`
  (statistics.js:19), `lowerGammaP` (statistics.js:39), `upperGammaQ`
  (statistics.js:62), `regularizedBeta` (statistics.js:85). These are algorithm
  detail, an L2 concern.
- `runProxyTest` (counterfactual.js:112) and `buildProxyTestPairs`
  (datasetBuilder.js:179). Proxy testing is a *third* dataset flavour through the
  identical counterfactual path (counterfactual.js:114) — drawing it would add a
  parallel lane that teaches nothing new at L1. It is named inside the
  `datasetBuilder.js` box instead.
- `buildFullDataset` (datasetBuilder.js:226) — exported but never called by the
  demo.
- `detectNonAdditiveEffects` (intersectional.js:127) — internal to the
  intersectional box.
- The pretty-printers `printStatisticalSummary` (demo.js:306) and
  `printIntersectionalSummary` (demo.js:322) — stdout only, no artifact.

---

## Portability notes — tokens that did not fit this domain

Second codebase for this harness after `03-agent-harness`; recording where the
vocabulary strained.

1. **`component.mock` is the wrong name for the system under test.** Here the
   mock scorer (demo.js:40) is not a stand-in for missing data — it *is* the
   audited subject, the whole reason the pipeline exists. The token vocabulary
   needs `component.subject` (or `component.under_test`). Used
   `component.external` inside a boundary explicitly labelled MOCK, and
   `component.mock` for the fixture module, which is the honest fit.
2. **`edge.stop` has no analogue.** This project has no loop and no stop
   conditions; the equivalent "this is where it can go wrong" signal is a
   *severity verdict*, which is card content, not an edge. Token unused.
3. **`component.agent` unused.** There is no agent and no LLM call anywhere —
   a batch analysis pipeline exercises none of the agentic tokens. A diagram
   family aimed at agent systems should not assume one is present.
4. **`edge.analysis` generalised well** — used for the optional `--full`
   intersectional branch, which is exactly "an analysis path off the main line".
5. **`boundary.datasource` carried two things** (CLI entry + fixture module) in
   one zone. It held, but a `boundary.fixture` would be cleaner than overloading
   the entry zone.
