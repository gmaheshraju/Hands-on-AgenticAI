# FACTS — 05-rag-pipeline (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/05-rag-pipeline/src/`, n=7 files, 1757 lines, zero npm
dependencies (`package.json` declares none; `"type": "module"`).
**Every element in the diagram appears below with a `file:line` citation. The
diagram may contain nothing that is not on this page, and this page may contain
nothing without a citation.** The project README ships an ASCII pipeline
diagram; it was treated as a CLAIM and re-derived from source. Two of its
claims did not survive — see "Where the README overstates" below.

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The BM25 scoring formula, the RRF arithmetic
and the chunker's line-walking loop are L2 concerns and are deliberately NOT
drawn here.

---

## Entry point — `src/demo.js`

| Fact | Citation |
|---|---|
| `SAMPLE_CODEBASE` — the corpus is a literal in the demo, n=6 files | demo.js:16 |
| The 6 file paths, in array order: `src/middleware/rateLimiter.js`, `src/auth/jwt.js`, `src/routes/users.js`, `src/services/webhookDelivery.js`, `src/config/limits.js`, `docs/api-rate-limits.md` | demo.js:18, :88, :179, :279, :374, :418 |
| `async function runDemo()` — the only driver | demo.js:459 |
| Constructs the pipeline: `new RAGPipeline({ verbose: true })` | demo.js:466 |
| Indexes: `await pipeline.indexFiles(SAMPLE_CODEBASE)` | demo.js:470 |
| `const questions = [...]` — n=5, asked in array order | demo.js:474 |
| Asks: `await pipeline.ask(question)` per question | demo.js:487 |
| Prints the answer to stdout | demo.js:489 |
| Prints the per-stage timings to stdout | demo.js:490 |
| Debug calls after the loop: `explainBM25`, `search`, `getStats` | demo.js:500, :508, :513 |
| Top-level invocation: `runDemo().catch(console.error)` | demo.js:516 |

## The orchestrator — `src/pipeline.js`

| Fact | Citation |
|---|---|
| `export class RAGPipeline` — owns every component instance | pipeline.js:104 |
| Constructs `BM25Index`, `VectorIndex`, `Reranker` in its own constructor | pipeline.js:126, :127, :128 |
| `this.chunks = new Map()` — chunk store, in-process | pipeline.js:134 |
| `async indexFile(content, filePath)` — the index-time path | pipeline.js:145 |
| `async indexFiles(files)` — loops indexFile over the corpus | pipeline.js:182 |
| `async search(query)` — the query-time path, steps 3-5 | pipeline.js:210 |
| `async ask(query)` — search + step 6 (answer generation) | pipeline.js:261 |
| Returns `{ answer, sources, debug }` to the caller | pipeline.js:288 |
| `buildAnswerPrompt(query, topChunks)` — the production prompt | pipeline.js:25 |
| `mockGenerateAnswer(query, topChunks)` — the no-API-key path | pipeline.js:55 |

### CANDIDATE FUNNEL — every knob, complete and in constructor order (invariant card)

Seven values, all read in one constructor block, all of the form
`options.X || <literal>`. There is no config file and no environment variable
anywhere in the project.

| # | Knob | Default | What it caps | Citation |
|---|---|---|---|---|
| 1 | `bm25TopK` | 20 | BM25 candidates per query | pipeline.js:117 |
| 2 | `vectorTopK` | 20 | vector candidates per query | pipeline.js:118 |
| 3 | `fusionTopK` | 15 | survivors of RRF | pipeline.js:119 |
| 4 | `rerankerTopK` | 5 | chunks that reach the answer prompt | pipeline.js:120 |
| 5 | `rrfK` | 60 | the RRF constant | pipeline.js:121 |
| 6 | `llmCall` | `null` | the LLM hook, declared as a constructor option at pipeline.js:113 | pipeline.js:123 |
| 7 | `rerankerMode` | `'heuristic'` | re-rank strategy | pipeline.js:129 |

The funnel actually narrows 20+20 -> 15 -> 5 because `search()` passes exactly
these fields to the three stages — pipeline.js:216, :222, :230, :238.

### SILENT DEGRADATIONS ON THE QUERY PATH — complete, in call order (failure card)

Every point between `search()` (pipeline.js:210) and the return of `ask()`
(pipeline.js:288) where the code substitutes a weaker answer instead of
failing. Seven, in the order the call stack reaches them.

| # | Degradation | Citation |
|---|---|---|
| 1 | `BM25Index.search`: query tokenizes to nothing -> `return []` | bm25.js:159 |
| 2 | `cosineSimilarity`: either norm is zero -> `return 0` | vectorSearch.js:115 |
| 3 | `Reranker.rerank`: no candidates -> `return []` | reranker.js:158 |
| 4 | `_llmRerank`: LLM response unparseable -> heuristic; `console.warn` is the ONLY signal | reranker.js:188, :190, :191 |
| 5 | `_llmRerank`: a candidate missing from the LLM's scores -> `rerankerScore: 0` | reranker.js:199 |
| 6 | `ask`: no `llmCall` supplied -> `mockGenerateAnswer` | pipeline.js:274, :276 |
| 7 | `mockGenerateAnswer`: zero chunks -> a fixed "couldn't find" string | pipeline.js:56, :57 |

Counterpoint that makes the card load-bearing: the ONLY `throw` in the whole
project is the RRF weights-length guard — fusion.js:48. Nothing else on the
query path can fail loudly.

## Chunking — `src/chunker.js`

| Fact | Citation |
|---|---|
| `export function chunkFile(content, filePath, options)` | chunker.js:112 |
| Defaults `maxChunkLines = 80`, `minChunkLines = 3` | chunker.js:113 |
| `EXT_TO_LANG` — n=17 extensions mapped to a language | chunker.js:17 |
| `export function detectLanguage(filePath)` | chunker.js:37 |
| Boundary regexes, n=3: `JS_BOUNDARY`, `PY_BOUNDARY`, `MD_BOUNDARY` | chunker.js:55, :56, :57 |
| Regex, not tree-sitter — stated reason: zero native dependencies | chunker.js:51 |
| No boundary pattern for the language -> `fixedSizeChunk` fallback | chunker.js:119, :120 |
| Chunk id is `filePath:startLine-endLine` | chunker.js:170 |
| Chunk carries content, filePath, language, startLine, endLine, name | chunker.js:169-177 |

### `shouldIndex()` REJECTS — complete, in code order (primitive card)

`export function shouldIndex(filePath)` — chunker.js:209. Four reject rules,
evaluated in this order; anything that survives all four is indexed.

| # | Reject rule | Citation |
|---|---|---|
| 1 | any path part is in `SKIP_DIRS` (n=11) | chunker.js:213 (set at :195-198) |
| 2 | any path part starts with `.` (and is not `.`) | chunker.js:214 |
| 3 | extension is in `SKIP_EXTENSIONS` (n=19) | chunker.js:219 (set at :200-204) |
| 4 | extension is longer than 6 chars | chunker.js:222 |
| — | otherwise `return true` | chunker.js:224 |

`SKIP_DIRS` members, in source order (n=11): `node_modules` `.git` `dist`
`build` `.next` `__pycache__` `.venv` `venv` `vendor` `coverage` `.cache` —
chunker.js:195, :196, :197.
`SKIP_EXTENSIONS` (n=19) — chunker.js:200, :201, :202, :203.
The reject is counted, not logged: `this.stats.skipped++` — pipeline.js:147.

## Keyword retrieval — `src/bm25.js`

| Fact | Citation |
|---|---|
| `export class BM25Index` | bm25.js:61 |
| Parameters `k1 = 1.2`, `b = 0.75` | bm25.js:67 |
| `this.invertedIndex = new Map()` — term -> Set of doc indices | bm25.js:76 |
| `export function tokenize(text)` — splits camelCase and snake_case | bm25.js:43, :45, :48 |
| `addDocument(id, text, metadata)` | bm25.js:89 |
| avgDocLength recomputed on every add | bm25.js:112 |
| `idf(term)` — `log((N - n + 0.5) / (n + 0.5) + 1)` | bm25.js:128 |
| `scoreTermDoc` — the BM25 formula | bm25.js:143, :144 |
| `search(query, topK = 10)` — union of posting lists, then score | bm25.js:156, :162, :174 |
| `explain(query)` — debug surface used by the demo | bm25.js:195 |

## Semantic retrieval — `src/vectorSearch.js`

| Fact | Citation |
|---|---|
| `export class VectorIndex` | vectorSearch.js:124 |
| Provider defaults to `new MockEmbeddingProvider()` if none passed | vectorSearch.js:130 |
| `this.documents = []` — in-memory, no vector DB | vectorSearch.js:131 |
| `export class MockEmbeddingProvider` — bag-of-words, **no network call** | vectorSearch.js:36 |
| `async embed(text)` — vocabulary dimension per unique word, value = TF | vectorSearch.js:46, :67 |
| `export function cosineSimilarity(a, b)` — sparse | vectorSearch.js:94 |
| `async addDocument(id, text, metadata)` — awaits `provider.embed` | vectorSearch.js:137, :138 |
| `async search(query, topK = 10)` — embeds the query, scores every doc | vectorSearch.js:165, :166, :168 |
| A real provider is pluggable via the constructor option | vectorSearch.js:127, :129 |

## Fusion — `src/fusion.js`

| Fact | Citation |
|---|---|
| `export function reciprocalRankFusion(resultLists, options)` | fusion.js:43 |
| Defaults `k = 60`, `topK = 10`, `weights = null` | fusion.js:44 |
| The only `throw` in the project: weights length mismatch | fusion.js:48 |
| Score accumulator `1 / (k + rank + 1)`, weighted | fusion.js:63 |
| List 0 is named `bm25`, list 1 `vector` — positional, by index | fusion.js:59 |
| Sort by fused score, slice topK | fusion.js:87, :88 |
| `export function explainFusion(fusedResults)` — debug surface | fusion.js:97 |

## Re-ranking — `src/reranker.js`

| Fact | Citation |
|---|---|
| `export class Reranker` | reranker.js:138 |
| Constructor `mode = 'heuristic'`, `llmCall = null` | reranker.js:144 |
| `async rerank(query, candidates, topK = 5)` | reranker.js:157 |
| LLM path taken only when `mode === 'llm' && this.llmCall` | reranker.js:162 |
| `heuristicScore` — name match +3, saturating content match, length penalty | reranker.js:37, :51, :59, :65 |
| `export function buildRerankerPrompt(query, candidates)` — score 0 to 10 | reranker.js:82, :96 |
| Candidate content truncated to 500 chars in the prompt | reranker.js:90 |
| `export function parseRerankerResponse(response)` — JSON array or `null` | reranker.js:117, :121 |

## What crosses the process boundary

| Surface | Default | Citation |
|---|---|---|
| `llmCall(prompt)` for re-ranking | not called — `mode` is `'heuristic'` | reranker.js:162, :185 |
| `llmCall(prompt)` for answer generation | not called — `llmCall` is `null` | pipeline.js:123, :269, :272 |
| Embedding provider | `MockEmbeddingProvider`, in-process | vectorSearch.js:130, :36 |

**Nothing leaves the process in the shipped demo.** Both LLM hooks and the
embedding provider are caller-supplied seams; the defaults are all in-process.
This is why the external zone in the diagram is labelled MOCK BY DEFAULT.

## Artifacts

| Artifact | Written by | Citation |
|---|---|---|
| `{ answer, sources, debug }` returned to the caller | `RAGPipeline.ask` | pipeline.js:288 |
| stdout — answer text and per-stage timings | `runDemo` | demo.js:489, :490 |

No file is written and no database is touched anywhere in the project.

---

## Where the README overstates (claims that did not survive)

1. The README's ASCII shows `vectorSearch.js` as "Sparse Embeddings / Cosine
   Similarity" without qualification. The shipped embedding is a bag-of-words
   mock whose cosine is equivalent to normalised word overlap — stated in the
   file's own header and implemented at vectorSearch.js:46. The diagram labels
   it MOCK.
2. The README's ASCII shows `reranker.js` as "LLM Re-Ranking". The default mode
   is `'heuristic'` — reranker.js:144 — and the demo never overrides it
   (demo.js:466 passes only `verbose`). The LLM branch is unreachable in the
   shipped demo.

## Deliberately NOT drawn (L1 scope discipline)

- The BM25 formula itself (bm25.js:143-146) and the IDF smoothing — **L2**.
- The chunker's per-line boundary walk (chunker.js:128-155) — **L2**.
- The RRF accumulation loop (fusion.js:56-83) — **L2**; only its contract
  (two ranked lists in, one ranked list out) is drawn.
- The 6 sample source files' contents (demo.js:18-457) — they are test data,
  not architecture.
- `explainFusion` / `explain` / `getStats` debug surfaces — they are read by
  the demo for teaching output, not by the pipeline.

## Portability notes — rules that needed bending for this domain

Recorded because "rules bent per new domain" is the harness's portability
metric. This is the harness's third codebase.

1. **`component.agent` had no natural occupant.** Nothing here is an agent —
   the closest thing is the re-ranker, the only stage that delegates judgement
   to a model rather than computing a score. Used `component.agent` for
   `Reranker` on that reading; a domain-neutral `component.judgement` token
   would be more honest.
2. **`component.artifact` assumes something durable is written.** This project
   writes no file and touches no database; its outputs are a returned object
   and stdout. Used `component.artifact` for both, but the observability zone
   is labelled "returned to caller", not "artifacts written".
3. **`boundary.external` had to be labelled MOCK BY DEFAULT** — the same bend
   recorded for `03-agent-harness`. Two of three codebases now need it, which
   suggests the vocabulary is missing a `boundary.seam` token for a pluggable
   surface that is not, today, crossed.
4. **`edge.stop` and `edge.analysis` went unused.** There is no stop condition
   and no post-hoc analysis path in a synchronous pipeline. Unused tokens are
   not a defect, but two of thirteen edge/component tokens not fitting a very
   ordinary program is a signal the vocabulary is tuned to agent loops.
