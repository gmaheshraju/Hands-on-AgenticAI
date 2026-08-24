# FACTS — 09-fine-tuning-vs-rag (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/09-fine-tuning-vs-rag/src/`, n=5 files, 1153 lines,
plus `data/` (n=5 JSON/JSONL files) and `package.json`.
**Every element in the diagram appears below with a `file:line` citation. The
diagram may contain nothing that is not on this page, and this page may contain
nothing without a citation.** The project README ships an ASCII architecture
diagram (README.md, "## Architecture"); it was treated as a CLAIM, not as
evidence. Two of its claims did not survive reading the code and are corrected
in §"What the README's ASCII gets wrong".

## What this project is

One classification problem — route a customer support ticket into one of four
categories — solved four ways over the **same** held-out test set, so the
approaches can be compared on accuracy, latency and cost. The deliverable is a
markdown table, not a service: `COMPARISON.md` (demo.js:110-111).

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The per-ticket classify loop, the TF-IDF
maths, and the metric formulas are L2/L2b concerns and are deliberately NOT
drawn here.

---

## Components (the boxes on the page)

| # | Box | Source | Citation |
|---|---|---|---|
| 1 | `demo.js` — CLI entry, 5 printed steps | orchestrator, no exports | demo.js:27 (`main`), :25 (`--skip-eval`) |
| 2 | Labelled corpus — `tickets.json` (100) + `test-set.json` (30) | read from `data/` | demo.js:37, :38 |
| 3 | `fineTuning.js` — validation + training-file prep | `validateTrainingData`, `writeTrainingFiles` | fineTuning.js:138, :62 |
| 4 | `evaluate.js` — the evaluation harness | `runEvaluation`, `evaluateApproach`, `computeMetrics` | evaluate.js:129, :85, :23 |
| 5 | `prompting.js` — approach 1 (zero-shot / few-shot) | `classifyZeroShot`, `classifyFewShot` | prompting.js:25, :53, :11 |
| 6 | `rag.js` — approach 2 (retrieval) | `SimpleVectorStore`, `retrieve`, `classifyWithRAG` | rag.js:21, :111, :129 |
| 7 | `fineTuning.js` — approach 3 (fine-tuned, MOCK) | `classifyWithFineTuning` | fineTuning.js:207 |
| 8 | Google Gemini API — the only network dependency | `gemini-2.0-flash` via `@google/generative-ai` | evaluate.js:136, package.json dependencies |
| 9 | `comparison.js` — report generator | `generateComparison` | comparison.js:17 |
| 10 | Artifact: `data/fine-tuning/` — 3 training files | written by `writeTrainingFiles` | fineTuning.js:70, :77, :81 |
| 11 | Artifact: `data/results/evaluation-results.json` | written by `runEvaluation` | evaluate.js:196, :199, :200 |
| 12 | Artifact: `COMPARISON.md` | written by `main` | demo.js:110, :111 |

## Flows (the arrows on the page)

| Edge | From → To | What moves | Citation |
|---|---|---|---|
| load | corpus → `demo.js` | `readFileSync` of both JSON files | demo.js:37, :38 |
| run | `demo.js` → `fineTuning.js` | the 100 training tickets | demo.js:44, :60 |
| prep | `demo.js` → `evaluate.js` | control, plus `{ apiKey, delayMs: 500 }` | demo.js:101 |
| index | corpus → `evaluate.js` | `evaluate.js` re-reads both files itself | evaluate.js:141, :142 |
| dispatch (×3) | `evaluate.js` → each approach | one bound `classifyFn` per approach | evaluate.js:155, :179, :189 |
| API call (×3) | each approach → Gemini | a prompt string, returns a category word | prompting.js:35, rag.js:156, fineTuning.js:235 |
| build index | `evaluate.js` → `rag.js` | 100 training tickets, indexed once per run | evaluate.js:173, rag.js:177 |
| report | `evaluate.js` → `comparison.js` | the `allResults` object | demo.js:109 |
| write ×3 | components → artifacts | see Artifacts below | fineTuning.js:71, evaluate.js:200, demo.js:111 |

---

## INVARIANT CARD 1 — DATA QUALITY GATE: 5 checks, complete, in code order

`validateTrainingData` (fineTuning.js:138) pushes an issue string for each
failing check and returns `valid: issues.length === 0` (fineTuning.js:189).
There are exactly five, and this is their order in the function:

| # | Check | Fires when | Citation |
|---|---|---|---|
| 1 | category imbalance | `maxCount / minCount > 2` | fineTuning.js:149 |
| 2 | corpus too small | `tickets.length < 50` | fineTuning.js:156 |
| 3 | text too short | any ticket text `< 20` chars | fineTuning.js:165, :166 |
| 4 | duplicates | lowercased `Set` smaller than the array | fineTuning.js:173, :174 |
| 5 | unknown category | category not in the 4-item whitelist | fineTuning.js:181, :182 |

**The gate does not gate.** `demo.js` prints `PASS` / `ISSUES FOUND` and the
issue list (demo.js:48-53) and then continues to Step 2 unconditionally
(demo.js:60). No caller reads `validation.valid`.

## INVARIANT CARD 2 — THE 4 EVALUATED APPROACHES, in code order

`runEvaluation` calls `evaluateApproach` exactly four times, sequentially, each
over the same 30-ticket `testSet` (evaluate.js:142) with the same `delayMs`
(evaluate.js:148, default 500):

| # | Key | Classifier bound | Prompt content | Citation |
|---|---|---|---|---|
| 1 | `zeroShot` | `classifyZeroShot` | categories + the ticket | evaluate.js:153, :155; prompting.js:25 |
| 2 | `fewShot` | `classifyFewShot` | + 8 hand-picked examples (2 per category) | evaluate.js:163; prompting.js:53, :11 |
| 3 | `rag` | `classifyWithRAG` | + top-5 TF-IDF neighbours from the 100 | evaluate.js:177, :179; rag.js:129, :111 |
| 4 | `fineTuned` | `classifyWithFineTuning` | a persona prompt; the ticket only | evaluate.js:187, :189; fineTuning.js:207 |

The RAG index is built once, before approach 3, over the training tickets
(evaluate.js:173 → rag.js:177). All four share `computeMetrics`
(evaluate.js:23) — accuracy, per-category P/R/F1, avg/p50/p95 latency
(evaluate.js:61, :62) and a cost estimate at Gemini Flash input pricing
(evaluate.js:69).

## INVARIANT CARD 3 — SIMULATED, NOT REAL: the complete list

The project is honest about this in its comments; the diagram makes it visible.
Five things a reader would otherwise assume are real:

| # | What is simulated | How | Citation |
|---|---|---|---|
| 1 | The fine-tuned model | no model is trained or called; a "you are a fine-tuned model" persona prompt stands in | fineTuning.js:202-206, :207, :220 |
| 2 | Its latency advantage | the measured API latency is multiplied by 0.6 before being reported | fineTuning.js:246, :250 |
| 3 | The vector database | in-process `Map`s, TF-IDF + cosine; "in production you'd use ChromaDB, Pinecone" | rag.js:18, :19, :21 |
| 4 | Token counts | every `inputTokens` is `text.length / 4`, never metered by the API | prompting.js:45, :81; rag.js:169; fineTuning.js:252 |
| 5 | The whole evaluation, without a key | `generateSampleResults()` fabricates predictions from hard-coded error indices | demo.js:98, :132, :164, :168, :172, :176 |

The three evaluation sources, in the order `demo.js` tests them: cached file
(`--skip-eval` and the file exists, demo.js:86-88) → fabricated sample (no
`GEMINI_API_KEY`, demo.js:91-98) → live run (demo.js:101).

---

## Artifacts written

| Artifact | Written by | Citation |
|---|---|---|
| `data/fine-tuning/openai_training.jsonl` | `writeTrainingFiles` | fineTuning.js:70, :71 |
| `data/fine-tuning/gemini_training.json` | `writeTrainingFiles` | fineTuning.js:77, :78 |
| `data/fine-tuning/instruction_training.jsonl` | `writeTrainingFiles` | fineTuning.js:81, :82 |
| `data/results/evaluation-results.json` | `runEvaluation` (dir created on demand) | evaluate.js:196, :197, :199, :200 |
| `COMPARISON.md` — the deliverable, 6 markdown sections | `main` from `generateComparison` | demo.js:110, :111; comparison.js:63, :77, :89, :113, :133, :155 |

Present in the committed repo: the three `data/fine-tuning/` files (100 rows
each). **`data/results/` does not exist** — no live evaluation has been
committed, so `--skip-eval` (demo.js:86) currently falls through to the
fabricated-sample branch.

## Corpus shape (verified by reading the JSON, not the README)

| Fact | Value |
|---|---|
| `data/tickets.json` | 100 tickets, exactly 25 per category |
| `data/test-set.json` | 30 tickets — 8 billing, 8 technical, 7 account, 7 feature-request |
| Categories, identical in all four modules | `billing, technical, account, feature-request` — prompting.js:9, rag.js:15, fineTuning.js:16, evaluate.js:18 |

## What the README's ASCII gets wrong

1. It draws **three** branches ("Prompting / RAG / Fine-Tuning"). The harness
   evaluates **four** — zero-shot and few-shot are separate runs with separate
   metrics rows (evaluate.js:153, :163). The diagram draws the code's four.
2. It draws "Train model" inside the Fine-Tuning box. Nothing trains: the
   training config is never called on the demo path (`getTrainingConfig` is
   defined at fineTuning.js:98 and invoked only from the standalone block,
   fineTuning.js:325). The diagram labels that box MOCK.

## Deliberately NOT drawn (L1 scope discipline)

- The per-ticket `for` loop inside `evaluateApproach`, its `try/catch`
  (evaluate.js:100-110), its progress print (evaluate.js:113) and its rate-limit
  sleep (evaluate.js:119) — **L2b**, ordering over time.
- The TF-IDF internals: `tokenize` (rag.js:32), `index` (rag.js:43), IDF
  (rag.js:64), `computeTfIdf` (rag.js:74), `cosineSimilarity` (rag.js:91).
  Function-level detail.
- `getTrainingConfig` (fineTuning.js:98) and `computeFineTuningCosts`
  (fineTuning.js:260) — cost/config reporting that writes nothing and feeds
  nothing downstream; `demo.js:70` only prints it.
- The six standalone `if (process.argv[1]...)` blocks (prompting.js:96,
  rag.js:186, fineTuning.js:296, evaluate.js:210, comparison.js:174) — alternate
  entry points, one box each would double the diagram for no structural gain.
- The contents of the mock corpora and the shape of the emitted markdown.

## Portability notes — rules that needed bending for this domain

Recorded because "rules bent per new domain" is the harness's portability metric.

1. **`component.agent` is the wrong noun here.** Nothing in this project is an
   agent — there is no loop, no tool choice, no autonomy. The three approach
   boxes are *strategies* over one API. `component.agent` was used for its
   visual role (the interchangeable middle tier), and the vocabulary needs a
   `component.strategy` token.
2. **`component.mock` had to carry two different meanings.** The corpus box
   (real committed data, but local files rather than a datastore) and the
   fabricated-results path are both grey. A `component.dataset` token would
   separate "real data, no infrastructure" from "not real at all".
3. **`edge.data_in` reads as "external ingress"** but here the ingress is
   `readFileSync` on a sibling folder. Kept, because the semantics — data
   entering the process from outside its own code — still hold.
4. **No `edge.stop` / `edge.analysis` token applies.** This project has no
   failure taxonomy and no self-analysis path; those two tokens went unused
   rather than being repurposed.
