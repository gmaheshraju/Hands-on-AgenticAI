# FACTS — 14-forward-deployed-engineering (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/14-forward-deployed-engineering/src/`, n=8 files, 1596
lines (`demo.js` 216, `processor.js` 230, `domainAdapter.js` 315, `evalBuilder.js`
284, `checklist.js` 221, `dashboard.js` 138, `connectors/base.js` 58,
`connectors/filesystem.js` 85, `connectors/api.js` 147).
**Every element in the diagram appears below with a `file:line` citation. The
diagram may contain nothing that is not on this page, and this page may contain
nothing without a citation.** The project README ships two ASCII diagrams; both
were treated as a CLAIM, not as evidence. Two README claims did not survive
reading the code — see *README claims corrected* below.

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The interactive eval-review loop
(`reviewInteractive`, evalBuilder.js:120) is a state machine over one operator
session — L2 — and is deliberately NOT drawn here.

---

## What the project is

A toolkit a Forward Deployed Engineer runs at a customer site to stand up an AI
document-analysis pilot: pull the customer's documents through pluggable
connectors, extract and quality-score the text, derive a domain-specific
vocabulary and system prompt from the corpus, auto-generate a golden eval set,
run a 9-point deployment readiness checklist, and serve a pilot dashboard.
`package.json:6` names `src/demo.js` as main; the only runtime dependency is
`express` (`package.json:14`).

---

## Components

| # | Node | What it is | Citation |
|---|---|---|---|
| 1 | `demo.js` — CLI | `async function run()` orchestrates six numbered steps | demo.js:30 |
| 2 | `BaseConnector` | abstract 4-method connector contract | base.js:8 |
| 3 | `FilesystemConnector` | reads a local directory | filesystem.js:12 |
| 4 | `ApiConnector` | mock paginated REST source, no network | api.js:60 |
| 5 | `DocumentProcessor` | text extraction + quality scoring | processor.js:15 |
| 6 | `DomainAdapter` | vocabulary, few-shot, system prompt | domainAdapter.js:50 |
| 7 | `EvalBuilder` | candidate Q&A generation, review, export | evalBuilder.js:15 |
| 8 | `DeploymentChecklist` | 9 readiness checks | checklist.js:13 |
| 9 | `data/eval-set.json` | the exported golden set (artifact) | evalBuilder.js:218 |
| 10 | `createDashboardServer` | express app, 5 routes | dashboard.js:54 |
| 11 | `public/dashboard.html` | the page served at `GET /` | dashboard.js:62, :64 |

### Entry point — `src/demo.js`

| Fact | Citation |
|---|---|
| Six numbered steps in one `run()` | demo.js:30 |
| Step 1 constructs both connectors and health-checks each | demo.js:40, :43, :46, :50 |
| API endpoint + key are literals in the demo, not env | demo.js:47, :48 |
| Step 2 runs `processor.processAll()` twice — once per connector | demo.js:60, :64 |
| The two result arrays are concatenated into `allDocs` | demo.js:67 |
| Step 3 `adapter.adapt(allDocs)` | demo.js:86 |
| Step 4 `evalBuilder.generateCandidates(allDocs)` — **the SAME corpus, not the adapter's output** | demo.js:111 |
| Step 4 auto-accepts for the demo; production reviews interactively | demo.js:115 |
| Step 4 exports to `data/eval-set.json` | demo.js:118, :119 |
| Step 5 hands the checklist five pieces of state | demo.js:140, :141, :142, :143 |
| Step 6 builds `dashboardState` and starts the server | demo.js:159, :205, :206 |
| Port is `process.env.PORT || 3014` | demo.js:204 |
| `--checklist-only` and `--no-server` both stop before the server | demo.js:152 |
| Two demo issues are hard-coded into the dashboard state | demo.js:195, :196 |
| Top-level failure handler exits non-zero | demo.js:213, :215 |

### Connectors — `src/connectors/`

| Fact | Citation |
|---|---|
| `FilesystemConnector extends BaseConnector` | filesystem.js:12 |
| Accepted extensions default to `.txt .md .json .pdf .docx` | filesystem.js:17 |
| Non-files and non-matching extensions are skipped in listing | filesystem.js:41, :43 |
| `ApiConnector extends BaseConnector` | api.js:60 |
| Backing store is `MOCK_API_DOCS`, **n=5**, in-module | api.js:17, ids at :19, :27, :35, :43, :51 |
| Auth is a length check on the API key, not a request | api.js:72 |
| Latency is simulated with `setTimeout` | api.js:144, :145 |
| Rate limit is counted and silently reset — never throws | api.js:136, :138, :139 |
| A cursor-paginated listing exists but the demo does not call it | api.js:120 |
| Listing strips `content`, returning metadata only | api.js:95 |

### Processor — `src/processor.js`

| Fact | Citation |
|---|---|
| `processAll(connector)` = list, then fetch-and-process one at a time | processor.js:88, :89, :93, :94 |
| Five format branches in a switch; anything else throws | processor.js:38, :55 |
| A throw is caught and becomes a `FAILED` result, not a crash | processor.js:65, :71 |
| Running counters: processed / succeeded / failed / warnings | processor.js:17-22 |
| `getSummary()` adds `successRate` and `avgQuality` | processor.js:104, :107, :110 |
| PDF and DOCX are interface stubs that pass text straight through | processor.js:158, :165, :171, :178 |

### Domain adaptation — `src/domainAdapter.js`

| Fact | Citation |
|---|---|
| `LEGAL_TERM_PATTERNS` — **29 regex/definition/category rows**, not the "25+" the README claims | domainAdapter.js:17, rows :19-:47 |
| `adapt()` runs three steps in order: vocabulary, few-shot, prompt | domainAdapter.js:68, :70, :73, :76 |
| Vocabulary extraction concatenates all non-FAILED document text first | domainAdapter.js:99, :100 |
| Capitalised multi-word phrases seen 3+ times are added as `custom` terms | domainAdapter.js:124, :133, :137 |
| Terms are returned sorted by descending count | domainAdapter.js:143 |
| Few-shot generation is template-based, **no LLM call** | domainAdapter.js:150, :153 |
| Few-shot output is deduplicated by question and capped at 20 | domainAdapter.js:222, :230 |
| System prompt embeds at most 25 vocabulary terms and 5 examples | domainAdapter.js:240, :249 |

### Eval set — `src/evalBuilder.js`

| Fact | Citation |
|---|---|
| `generateCandidates(processedDocs)` — ids are `eval-NNN`, zero-padded | evalBuilder.js:32, :46 |
| Documents whose quality status is `FAILED` are skipped first | evalBuilder.js:37 |
| `reviewInteractive()` — readline loop, commands a/e/r/s/q | evalBuilder.js:120, :135, :147 |
| `acceptAll()` marks every candidate `auto-accepted` | evalBuilder.js:186, :187 |
| `export()` mkdirs the parent and writes pretty JSON | evalBuilder.js:195, :217, :218 |
| The file carries version, createdAt, customer, stats, questions | evalBuilder.js:196-214 |
| Standalone CLI entry: builds its own connector + processor | evalBuilder.js:262, :266, :269 |

### Checklist — `src/checklist.js`

| Fact | Citation |
|---|---|
| Thresholds are constructor config: 5 docs, 2 max failures, 10 terms, 15 questions, 14 pilot days | checklist.js:18, :19, :20, :21, :22 |
| Check 7 is the only one that touches the filesystem | checklist.js:119 |
| Check 7 has TWO push sites — try and catch — so 10 `results.push` calls yield 9 checks | checklist.js:122, :131 |
| Standalone CLI entry runs against empty state to show what is missing | checklist.js:214, :218 |

### Dashboard — `src/dashboard.js`

| Fact | Citation |
|---|---|
| `createDashboardServer(state)` merges the passed state over the module default | dashboard.js:54, :55 |
| State is a module-level object — in-memory, no database | dashboard.js:19 |
| `GET /` reads `public/dashboard.html` off disk per request | dashboard.js:61, :62, :64 |
| `GET /api/state` computes daysRemaining / daysElapsed / progressPercent | dashboard.js:72, :77, :78, :85 |
| `POST /api/state` shallow-merges the request body into pilot state | dashboard.js:90, :91 |
| `POST /api/issues` and `PATCH /api/issues/:id` | dashboard.js:96, :109 |
| `POST /api/activity` | dashboard.js:118 |
| Standalone CLI entry listens on `PORT || 3014` | dashboard.js:132, :133 |

---

## INVARIANT CARD 1 — extraction quality gate (complete, code order)

`_assessQuality(text, metadata)` — processor.js:186. Five conditions, evaluated in
this order. The first one **returns immediately**; the other four accumulate
warnings.

| # | Condition | Effect | Citation |
|---|---|---|---|
| 1 | `charCount === 0` | returns `status: 'EMPTY'`, score 0 — hard stop, no further checks | processor.js:192, :193 |
| 2 | `wordCount < 10` | warning "Very short document" | processor.js:197, :198 |
| 3 | `alphaRatio < 0.3` | warning "Possible garbage output" | processor.js:202, :203, :204 |
| 4 | text contains U+FFFD | warning "possible encoding issue" | processor.js:208, :209 |
| 5 | `charCount < metadata.size * 0.2` | warning "Extraction may be incomplete" | processor.js:213, :214 |

Scoring: `score = 1.0 − 0.15 × warnings.length`, clamped to `[0, 1]` —
processor.js:218, :219, :220. Status is `OK` with zero warnings, else `WARNING` —
processor.js:224. Three statuses exist in total: `OK`, `WARNING`, `EMPTY`
(processor.js:224, :193) plus `FAILED` written by the catch path
(processor.js:71). Downstream, both `DomainAdapter` (domainAdapter.js:100, :157)
and `EvalBuilder` (evalBuilder.js:37) skip only `FAILED` — `EMPTY` and `WARNING`
documents still flow through.

## INVARIANT CARD 2 — eval candidate types (all five, code order)

`generateCandidates` — evalBuilder.js:32. Documents with quality status `FAILED`
are skipped before any type runs (evalBuilder.js:37).

| # | `type` | `difficulty` | Trigger | Citation |
|---|---|---|---|---|
| 1 | `factual` | easy | dollar amounts, first 2 per document | evalBuilder.js:42, :43, :50, :51 |
| 2 | `comprehension` | medium | numbered section headers, first 2, content > 100 chars | evalBuilder.js:56, :57, :60, :66, :67 |
| 3 | `analytical` | hard | risk terms, needs ≥ 2 matches | evalBuilder.js:73, :74, :81, :82 |
| 4 | `extraction` | easy | timeframes, needs ≥ 2 matches | evalBuilder.js:87, :88, :94, :95 |
| 5 | `application` | medium | `shall …` obligations, needs ≥ 2 matches | evalBuilder.js:100, :101, :107, :108 |

Note the naming asymmetry: `DomainAdapter._generateFewShotExamples` emits its own
independent type vocabulary — `comprehension`, `summary`, `extraction`,
`extraction`, `analysis` (domainAdapter.js:172, :183, :194, :205, :216). The two
type sets are NOT the same enumeration and nothing reconciles them.

## INVARIANT CARD 3 — deployment readiness (all nine checks, code order)

`DeploymentChecklist.run(state)` — checklist.js:34. Severity is the fourth
argument to `_check` (checklist.js:208).

| # | Check | Threshold | Severity | Citation |
|---|---|---|---|---|
| 1 | Data connector configured and tested | `connectorHealth.ok === true` | critical | checklist.js:38, :41, :45 |
| 2 | Documents ingested | succeeded ≥ 5 AND failed ≤ 2 | critical | checklist.js:52, :55, :59 |
| 3 | Extraction quality score | avgQuality ≥ 0.7 | warning | checklist.js:65, :68, :72 |
| 4 | Domain vocabulary extracted | uniqueTermsFound ≥ 10 | critical | checklist.js:79, :82, :86 |
| 5 | System prompt customized | length > 500 chars | critical | checklist.js:92, :95, :99 |
| 6 | Eval set built | accepted ≥ 15 | critical | checklist.js:105, :108, :113 |
| 7 | Eval set exported to file | file parses, `questions.length > 0` | warning | checklist.js:122, :121, :127 |
| 8 | Pilot timeline | daysRemaining > 0 | warning | checklist.js:146, :149, :154 |
| 9 | Few-shot examples generated | fewShotCount ≥ 5 | warning | checklist.js:159, :162, :167 |

Aggregation: `passed` counts every passing check; `failed` counts only failing
**critical** checks; `warnings` counts only failing **warning** checks —
checklist.js:171, :172, :173. **`ready = (failed === 0)`** — checklist.js:180.
A failing warning check therefore never blocks the pilot.

---

## Artifacts written / served

| Artifact | Written or served by | Citation |
|---|---|---|
| `data/eval-set.json` | `EvalBuilder.export()` — mkdir + writeFile | evalBuilder.js:217, :218 |
| the same file, read back | checklist check 7 | checklist.js:119, :120 |
| `public/dashboard.html` | served on every `GET /` | dashboard.js:62, :64, :65 |
| pilot state JSON | `GET /api/state` | dashboard.js:80 |
| console checklist report | `DeploymentChecklist.print()` | checklist.js:188, :196 |

Committed sample corpus: `data/sample-docs/`, n=10 `.txt` files, plus the n=5
in-module mock API documents (api.js:19, :27, :35, :43, :51).

---

## README claims corrected

Both README ASCII diagrams were verified against source. Two claims failed:

1. **"identifies 25+ legal terms"** — the table has **29** rows
   (domainAdapter.js:17, :19-:47). Off by four, in the safe direction.
2. **The README pipeline draws Eval Builder downstream of Domain Adapter.** It is
   not: `evalBuilder.generateCandidates(allDocs)` consumes the processor's output
   directly (demo.js:111), the same array the adapter received (demo.js:86). The
   two are siblings, not a chain. The diagram draws the real fan-out.

Also noted, not a defect: the README's second ASCII diagram shows the checklist
fed by "Vocab+Prompt" and "Golden Q&A" only. In code it is fed by five things,
including the processor's own stats (demo.js:140).

---

## Deliberately NOT drawn (L1 scope discipline)

- `reviewInteractive()`'s accept/edit/reject/skip/quit state machine
  (evalBuilder.js:120, :147) — **L2**, per `DIAGRAM_RULES_LLD.md`.
- Per-format extractor internals — `_extractMarkdown`, `_extractJson`,
  `_walkJson`, `_extractPdf`, `_extractDocx` (processor.js:123, :140, :148, :158,
  :171): function-level detail, excluded by the L1 content rules.
- The system prompt's literal body (domainAdapter.js:257-282) and the 29
  individual vocabulary regexes.
- `listDocumentsPaginated` (api.js:120) — real code, but the demo never calls it;
  drawing an uninvoked path at L1 would misrepresent the runtime shape.
- The two standalone CLI entry points (checklist.js:214, evalBuilder.js:262,
  dashboard.js:132) — alternate front doors to boxes already on the page.

---

## Portability notes — rules that needed bending for this domain

Second application of the HOA theme after `agent_harness_v1`. Tokens that did not
fit are recorded because "rules bent per new domain" is the portability metric.

1. **`component.mock` had to carry two different meanings.** In
   `agent_harness_v1` it meant "a fake corpus standing in for the network". Here
   `ApiConnector` is a mock *transport* — it has real pagination, real
   auth-shaped checks, and real latency simulation (api.js:120, :72, :144) over a
   fake store. "Mock" flattens a distinction the reader needs. A
   `component.simulated` token would be more honest.
2. **No `boundary.datasource` node is actually a data source.** The zone holds
   connector *classes*, not the systems they front. Kept the token because the
   zone answers "where does the corpus enter", which is what the boundary is for.
3. **`edge.data_in` is doing triple duty** — corpus ingestion, the
   `extends` structural relation, and the checklist's read-back of a file the
   pipeline itself wrote (checklist.js:119). The third is a genuine feedback
   read, and the vocabulary has no token for "reads back what we wrote".
4. **`card.failure` was the only red card token available** for the quality gate,
   which is not a failure taxonomy but a *grading* rubric — only condition 1
   actually stops anything (processor.js:192). Semantically stretched; visually
   correct, since it is the page's one "what goes wrong" card.
5. `component.artifact` (renamed from `component.store` for `agent_harness_v1`)
   generalised cleanly a second time — `data/eval-set.json` and
   `public/dashboard.html` are both files, no database anywhere in the project.
