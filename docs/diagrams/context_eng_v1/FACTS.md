# FACTS — 22-context-engineering (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/22-context-engineering/src/`, n=9 JS modules (2582
lines) + 1 test file (776 lines). **Every element in the diagram appears below
with a `file:line` citation. The diagram may contain nothing that is not on this
page, and this page may contain nothing without a citation.**

The project README ships a large ASCII architecture diagram. It was treated as a
**claim, not as evidence** — every fact below was read from source. **Six README
claims did not survive that reading**, two of them structural (see "README claims
that did not verify"). The diagram draws the code, not the ASCII.

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The per-word estimation ladder inside
`estimateTokens`, the even/odd interleave inside `reorderForAttention`, and the
regex inventories inside `compactor.js` are L2 concerns; the diagram carries
their *contracts* (as cards) and not their bodies.

Zero external dependencies, zero network, zero filesystem: `package.json` has no
`dependencies` key, and `grep -rniE "fetch\(|axios|process\.env|fs\.|readFile"`
over `src/` returns only comments and a URL regex (tokenizer.js:47). Nothing in
this system leaves the process.

---

## Entry point — `src/demo.js` (533 lines)

| Fact | Citation |
|---|---|
| `function run()` — the only top-level driver, invoked at module load | demo.js:492, demo.js:533 |
| No CLI argument parsing at all — `node src/demo.js` is the whole interface | package.json `scripts.demo`; no `process.argv` in demo.js |
| Eight demo sections, called in this order | demo.js:497, demo.js:498, demo.js:499, demo.js:500, demo.js:501, demo.js:502, demo.js:503, demo.js:504 |
| Imports all 8 sibling modules | demo.js:5, demo.js:6, demo.js:7, demo.js:8, demo.js:9, demo.js:10, demo.js:11, demo.js:12 |
| Claims four moves — "Select \| Compress \| Write \| Isolate" | demo.js:495 |
| `createDemoSources()` builds the input corpus **as in-code string literals** | demo.js:48 |
| The corpus is 13 sources across all 6 types, relevance 0.30–1.00 | demo.js:48–demo.js:122 (13 `createSource` calls); observed run prints "Sources: 13" |
| Strategy-comparison budget is 1024 tokens | demo.js:306 |

## The allocation pipeline (the main flow, left to right)

### `src/sources.js` (86 lines) — typing and ranking

| Fact | Citation |
|---|---|
| `SourceType` — the 6 type/priority definitions | sources.js:9 |
| `createSource(type, content, opts)` | sources.js:26 |
| Token count is auto-estimated at creation | sources.js:34 |
| `relevanceScore` clamped to `[0,1]`, default 1.0 | sources.js:35 |
| `sortByPriority` — priority first, relevance as tiebreak within a tier | sources.js:51, sources.js:53, sources.js:57 |
| `sortByRelevance` — relevance only, type ignored | sources.js:64 |
| `groupByType`, `totalTokens` | sources.js:71, sources.js:84 |

### `src/strategies.js` (111 lines) — three ways to rank before allocating

| Fact | Citation |
|---|---|
| `greedy` — pass straight through to `budget.allocate` | strategies.js:9, strategies.js:11 |
| `relevance` — system kept at priority 0, everything else re-priorited `1..N` by relevance rank | strategies.js:19, strategies.js:24, strategies.js:28 |
| `balanced` — proportional per-type sub-budget, then relevance within type | strategies.js:44, strategies.js:62, strategies.js:68, strategies.js:87 |
| `balanced` forces over-budget sources out by assigning priority `100 + n` | strategies.js:99 |
| **All three end in the same call**: `budget.allocate(...)` | strategies.js:11, strategies.js:36, strategies.js:105 |
| Exported as one object | strategies.js:111 |

### `src/budget.js` (125 lines) — the fitting decision

| Fact | Citation |
|---|---|
| `class TokenBudget` | budget.js:9 |
| Output buffer fraction defaults to 0.25 | budget.js:16 |
| `outputBuffer = floor(total × fraction)`; `available = total − outputBuffer` | budget.js:17, budget.js:18 |
| `allocate(sources)` — the whole allocation contract (card 2) | budget.js:30 |
| `report(plan)` — human-readable breakdown | budget.js:95 |
| `budget.js` imports **only** `sources.js` — not the tokenizer, not the compactor, not the cache | budget.js:3 |

### `src/assembler.js` (292 lines) — ordering and output

| Fact | Citation |
|---|---|
| `const ORDER` — the 6 assembly ranks | assembler.js:12 |
| `assemble(sources, plan, opts)`; default ordering `attention-optimized` | assembler.js:100, assembler.js:101 |
| Included sources copied at full content | assembler.js:105 |
| Truncated sources passed through `truncateMiddle` and **re-estimated** | assembler.js:118, assembler.js:119 |
| Sorted by `ORDER`, RAG chunks tiebroken by relevance | assembler.js:132, assembler.js:137 |
| `reorderForAttention` applied only when `ordering === 'attention-optimized'` | assembler.js:143, assembler.js:144 |
| Chat messages built: SYSTEM_PROMPT → `system`, CONVERSATION_HISTORY → `user`, everything else → `system` with a `[label]` prefix | assembler.js:152, assembler.js:154, assembler.js:157 |
| Returns `{ messages, report, totalTokens }` — **a value, not a request** | assembler.js:194 |
| `reorderForAttention(items)` — separately exported, separately imported by demo.js:9 | assembler.js:40 |
| Bails out below 3 items | assembler.js:41, assembler.js:47 |
| Even ranks → start, odd ranks → end | assembler.js:67, assembler.js:70, assembler.js:75 |
| Middle band relabelled at 30%–70% of the list | assembler.js:81, assembler.js:82, assembler.js:85 |
| `assembleWithScratchpad(...)` — the second assembly path | assembler.js:218 |
| Parks each dropped source into the scratchpad | assembler.js:223, assembler.js:225 |
| Also parks the **full** text of every truncated source | assembler.js:247, assembler.js:248 |
| Injects `scratchpad.formatIndex()` as a synthetic `SCRATCHPAD_INDEX` source at priority 3 | assembler.js:260, assembler.js:264 |

## The three subsystems that are NOT in the allocation path

### `src/tokenizer.js` (245 lines) — the shared foundation

| Fact | Citation |
|---|---|
| `estimateTokens(text, opts)` — the live estimator | tokenizer.js:92 |
| Per-word ladder: common word = 1 token, else length bands 4 / 8 / 13 / rest | tokenizer.js:109, tokenizer.js:115, tokenizer.js:118, tokenizer.js:121, tokenizer.js:126 |
| `SINGLE_TOKEN_WORDS` — the common-word set | tokenizer.js:11 |
| CamelCase boundaries add 0.5 each; newlines add 0.5 each | tokenizer.js:133, tokenizer.js:141 |
| `detectContentType` → `code` when indicator density > 2 | tokenizer.js:58, tokenizer.js:75 |
| Code multiplier ×1.3 | tokenizer.js:146 |
| `estimateTokensNaive` — the ~4-chars/token method, kept only for comparison | tokenizer.js:153, tokenizer.js:156 |
| `compareEstimates` | tokenizer.js:172 |
| `truncateToTokens` — binary search on word boundaries | tokenizer.js:186, tokenizer.js:198 |
| `truncateMiddle` — 60% start / 40% end around a marker | tokenizer.js:220, tokenizer.js:232 |
| **`TOKEN_PATTERNS` (6 patterns: leading space, digit runs, punctuation clusters, URLs, camel boundaries, underscores) is declared and never referenced anywhere in the repo** | tokenizer.js:39 (declaration); zero other hits for the identifier across `src/` |
| Imported by exactly 6 files | sources.js:3, assembler.js:5, cache.js:9, scratchpad.js:9, compactor.js:6, demo.js:5 |

Note the file that is **missing** from that list: `budget.js` never imports the
tokenizer (its only import is sources.js:3). The budget allocates token counts
that were computed upstream at source-creation time (sources.js:34); it never
counts anything itself.

### `src/compactor.js` (622 lines) — conversation compression

| Fact | Citation |
|---|---|
| `EXTRACTION_PATTERNS` — 5 categories (decisions, questions, entities, actionItems, keyValues) | compactor.js:14, compactor.js:16, compactor.js:22, compactor.js:28, compactor.js:37, compactor.js:43 |
| `extractKeyFacts(text)` — dedupes per category, then substring-dedupes entities | compactor.js:56, compactor.js:71, compactor.js:98 |
| `buildSummary` — module-private; caps at 10 entities / 5 decisions / 5 keyValues / 3 actions / last 3 questions | compactor.js:122, compactor.js:128, compactor.js:133, compactor.js:140, compactor.js:147, compactor.js:153 |
| `compactConversation(turns, maxTokens, opts)` — keeps last 3 turns verbatim by default | compactor.js:177, compactor.js:178 |
| Returns unchanged if already within budget | compactor.js:203 |
| Recurses with fewer recent turns when the summary budget drops to ≤ 50 | compactor.js:231, compactor.js:239 |
| `contextAwareCompress(...)` — the failure-mode-aware entry (card 3) | compactor.js:538 |
| `compactor.js` imports **only** the tokenizer | compactor.js:6 |
| Nothing in `src/` imports `compactor.js` except `demo.js` | demo.js:10 |

### `src/cache.js` (251 lines) — prompt-cache simulation

| Fact | Citation |
|---|---|
| `PRICING` — a hardcoded table, the only "external" surface in the system | cache.js:16 |
| input $3.00/M, cached input $0.30/M, output $15.00/M, cache **write** $3.75/M | cache.js:17, cache.js:18, cache.js:19, cache.js:20 |
| `class ContextCache(staticPrefix, opts)`; TTL default 300 s | cache.js:40, cache.js:49 |
| `isCacheValid(timestamp)` — pure arithmetic on a caller-supplied clock | cache.js:73, cache.js:75 |
| Miss → pay the write premium, warm the cache | cache.js:97, cache.js:99, cache.js:102 |
| Hit → pay the cached rate | cache.js:104, cache.js:106 |
| `simulateSession(...)` — synthesises the timestamps itself | cache.js:228, cache.js:236, cache.js:239 |
| `cache.js` imports **only** the tokenizer | cache.js:9 |
| Nothing in `src/` imports `cache.js` except `demo.js` | demo.js:11 |

### `src/scratchpad.js` (317 lines) — the "Write" move

| Fact | Citation |
|---|---|
| `class Scratchpad` | scratchpad.js:27 |
| Backing store is an in-memory `Map` — **not a file, not a database** | scratchpad.js:38 |
| `maxEntries` default 100; eviction policy `'lru'` default, `'relevance'` alternative | scratchpad.js:34, scratchpad.js:35, scratchpad.js:291, scratchpad.js:301 |
| `write` / `read` / `search` / `summarize` / `formatIndex` / `evict` / `getStats` | scratchpad.js:55, scratchpad.js:109, scratchpad.js:132, scratchpad.js:192, scratchpad.js:234, scratchpad.js:252, scratchpad.js:266 |
| Eviction fires only on a NEW key at capacity | scratchpad.js:74 |
| `tokensSaved = tokens − cost(index entry)` | scratchpad.js:97, scratchpad.js:98 |
| Header names the move it implements: "the Write move" | scratchpad.js:1 |
| Imported by `demo.js` and by `assembler.js`'s scratchpad path (as a parameter, not an import) | demo.js:12, assembler.js:214, assembler.js:218 |

## Tests

| Fact | Citation |
|---|---|
| One test file, 12 `describe` suites | context.test.js:16, context.test.js:77, context.test.js:107, context.test.js:146, context.test.js:205, context.test.js:254, context.test.js:298, context.test.js:356, context.test.js:385, context.test.js:462, context.test.js:618, context.test.js:712 |
| 63 `it(` cases (counted) — observed `node --test`: `tests 63 / suites 12 / pass 63 / fail 0` | `grep -c "^  it(" src/tests/context.test.js` = 63 |

---

### INVARIANT CARD 1 — the 6 source types, complete, in code order

The priority ladder is declared once in `sources.js` and **repeated a second
time** as assembly ranks in `assembler.js`. Two independent enumerations that
must agree; today they do, member for member.

| Priority | `SourceType` member | Declared | `ORDER` rank | Declared |
|---|---|---|---|---|
| 0 | `SYSTEM_PROMPT` | sources.js:10 | 0 | assembler.js:13 |
| 1 | `CONVERSATION_HISTORY` | sources.js:11 | 1 | assembler.js:14 |
| 2 | `RAG_CHUNKS` | sources.js:12 | 2 | assembler.js:15 |
| 3 | `MEMORY` | sources.js:13 | 3 | assembler.js:16 |
| 4 | `TOOL_RESULTS` | sources.js:14 | 4 | assembler.js:17 |
| 5 | `EXAMPLES` | sources.js:15 | 5 | assembler.js:18 |

Priority 0 is the only tier with a hard guarantee: `allocate` admits every
priority-0 source before it looks at the budget at all (budget.js:39,
budget.js:40, budget.js:41) — it can therefore overshoot `available` and leave
`remaining` negative, which the second pass reads as "drop everything"
(budget.js:51). Within a tier, higher `relevanceScore` ranks first
(sources.js:57). A type not present in `ORDER` sorts last via `?? 99`
(assembler.js:133).

### INVARIANT CARD 2 — `allocate()`: the complete fitting contract

`budget.js:30`. Four outcomes, in code order; nothing else can happen to a
source.

| # | Condition | Outcome | Citation |
|---|---|---|---|
| — | `priority === 0` | included at full tokens, unconditionally, before any budget check | budget.js:40, budget.js:41 |
| 1 | `remaining <= 0` | dropped, `reason: 'budget_exhausted'` | budget.js:51, budget.js:52 |
| 2 | `source.tokens <= remaining` | included at full tokens | budget.js:56, budget.js:58 |
| 3 | `remaining >= 50` | truncated, `reason: 'truncated_to_fit'`, `allocatedTokens = remaining` | budget.js:61, budget.js:65, budget.js:67 |
| 4 | else | dropped, `reason: 'insufficient_remaining'` | budget.js:73 |

**At most one source is ever truncated per allocation**: branch 3 sets
`remaining = 0` immediately after truncating (budget.js:70), so every later
source falls into branch 1. Observed on the demo run: `relevance` produced
`Truncated 1`, `greedy` and `balanced` produced `0`.

The returned shape is `{ included, truncated, dropped, budget{ total,
outputBuffer, available, used, remaining, systemReserved } }` (budget.js:77
through budget.js:88).

### INVARIANT CARD 3 — the 4 failure modes, complete, in code order

`contextAwareCompress` (compactor.js:538) runs four detectors, then acts on
**three** of them.

| # | Mode | Detector + rule | Detected at | Acted on? |
|---|---|---|---|---|
| 1 | poisoning | same subject asserted with two different values in two different turns | compactor.js:326, compactor.js:357, compactor.js:562 | flagged — `[WARNING: Contradiction]` prepended to the last user turn (compactor.js:589, compactor.js:596) |
| 2 | distraction | turn shares < 10% vocabulary with words present in ≥ 50% of turns, and has > 5 distinct long words | compactor.js:381, compactor.js:398, compactor.js:416, compactor.js:563 | **stripped** — the turn is deleted (compactor.js:577, compactor.js:580) |
| 3 | confusion | > 3 vague references and < 2 capitalised nouns in one turn | compactor.js:434, compactor.js:446, compactor.js:564 | **nothing** — counted only |
| 4 | clash | opposite-polarity directives whose action words overlap > 0.5 | compactor.js:464, compactor.js:477, compactor.js:506, compactor.js:565 | flagged — `[WARNING: Conflicting instructions]` (compactor.js:592) |

Quality score: `1 − (3·poisoning + 1·distraction + 2·confusion + 3·clash) ×
0.05`, clamped to `[0,1]` (compactor.js:610, compactor.js:611). All four
detectors are **module-private** — `compactor.js` exports only
`extractKeyFacts`, `compactConversation` and `contextAwareCompress`
(compactor.js:56, compactor.js:177, compactor.js:538), so nothing outside the
file can run a detector on its own.

Observed on the demo run (`node src/demo.js`, 2026-08-24): 7 turns → 1
poisoning, 1 distraction, 1 clash, quality 0.65, 33 tokens recovered, 2.52×
compression. Those are outputs, not source lines; the formulas above are the
cited part.

---

## Artifacts written

**None.** No `fs` call, no `writeFile`, no network client anywhere in `src/`.
The two things this system produces are:

| Output | Produced by | Citation |
|---|---|---|
| `{ messages[], report, totalTokens }` — returned to the caller, in-process | `assemble()` | assembler.js:194, assembler.js:195, assembler.js:196, assembler.js:197 |
| Terminal text | `console.log` throughout `demo.js` | demo.js:493, demo.js:506 |

The assembled `messages[]` is never sent to a model. There is no LLM in this
repository.

## README claims that did not verify

Every one of these was checked against source, not against another document.

1. **The ASCII draws `Tokenizer`, `Conversation Compactor` and `Prompt Cache` as
   three parallel boxes whose outputs all flow down into `TokenBudget`.** They do
   not. `budget.js` imports one module, `sources.js` (budget.js:3). `compactor.js`
   imports only the tokenizer (compactor.js:6) and `cache.js` imports only the
   tokenizer (cache.js:9); neither is imported by anything except `demo.js`
   (demo.js:10, demo.js:11) and the test file. **The compactor and the cache are
   not in the allocation path at all.** This is the single most load-bearing
   correction on the page, and the diagram draws them as standalone subsystems
   with no edge into the pipeline.
2. **The ASCII terminates in an `LLM` box.** Nothing in `src/` calls a model.
   `assemble()` returns a value (assembler.js:194) and `demo.js` prints. The
   diagram's output zone is labelled as a return value, and `component.external`
   is left with no occupant (see portability notes).
3. **README §1 describes the tokenizer as "Simple token estimator using
   character-based heuristics (~4 chars/token)".** That describes
   `estimateTokensNaive` (tokenizer.js:156, tokenizer.js:158) — which the file
   itself labels "the old method … kept for comparison" (tokenizer.js:153). The
   live estimator is a per-word class ladder with a code multiplier
   (tokenizer.js:104, tokenizer.js:146). The README's own ASCII box gets this
   right; the prose contradicts it.
4. **README §Design Decisions: "29 sources totaling ~3,300 tokens competing for a
   1,536-token budget".** `createDemoSources()` returns 13 sources (demo.js:48)
   and the strategy demo sets `BUDGET = 1024` (demo.js:306). Observed run:
   "Sources: 13 totaling ~891 tokens / Budget: 1024 tokens (768 available)".
5. **README Quick Start and File Structure both say "38 tests" / "38 tests across
   9 suites".** Counted: 63 `it(` cases in 12 `describe` suites
   (context.test.js:16, context.test.js:712); observed `node --test` output:
   `tests 63 / suites 12 / pass 63`.
6. **The README File Structure block omits `src/scratchpad.js` entirely**, and
   the prose says "four core components … with two supporting subsystems" (six)
   before numbering seven. `src/` holds nine modules; `scratchpad.js` (317
   lines, scratchpad.js:27) is imported by demo.js:12 and is the subject of two
   demo sections (demo.js:502, demo.js:503).

Two further gaps found in code rather than in the README:

7. **`TOKEN_PATTERNS` is dead.** Six declared regex/cost pairs (tokenizer.js:39
   through tokenizer.js:52) — leading whitespace, digit runs, punctuation
   clusters, URLs, camel boundaries, underscores — are never referenced. So the
   estimator does *not* price URLs or snake_case specially, despite the module
   header advertising pattern analysis (tokenizer.js:2). The diagram carries
   `TOKEN_PATTERNS :39 dead` on the tokenizer box.
8. **"Isolate" has no implementation.** demo.js:495 advertises four moves —
   Select, Compress, Write, Isolate. Only "Write" is named in code
   (scratchpad.js:1). Select maps to strategies.js:111 + budget.js:30, Compress
   to compactor.js:177 + tokenizer.js:220; nothing in `src/` isolates context
   into sub-agents or sub-contexts. The process zone label carries this.

## Folded into one box (to hold the component-box budget)

The page draws **12 component boxes** for 9 modules, 1 in-code corpus and 1
return value. Four folds; each keeps its citations on the surviving box.

| Folded | Into | Why it is legitimate |
|---|---|---|
| `sortByPriority` / `sortByRelevance` / `groupByType` / `totalTokens` (sources.js:51, sources.js:64, sources.js:71, sources.js:84) | the `createSource()` box | same module, and they are ranking helpers consumed by the two boxes downstream — not separate addresses |
| `TokenBudget.report()` (budget.js:95) | the `allocate` box | same class, printing only |
| `assembleWithScratchpad()` (assembler.js:218) | the `assemble()` box | it builds an augmented plan and then calls `assemble` (assembler.js:280); the scratchpad edge on the page is drawn from that box and cited to assembler.js:225 |
| `simulateSession()` (cache.js:228) | the `ContextCache` box | it constructs a `ContextCache` (cache.js:232) and loops `processRequest` — a driver, not a component |

`reorderForAttention` is **not** folded: it is separately exported
(assembler.js:40) and separately imported by demo.js:9, so it is its own address
in the system.

## Deliberately NOT drawn (L1 scope discipline)

- **`demo.js`'s eight section calls** (demo.js:497 through demo.js:504) are not
  drawn as eight edges. Doing so would make `demo.js` an eight-spoke hub and turn
  an architecture diagram into a call graph. Each standalone subsystem box
  instead carries its own file:line, and this table carries the call sites.
- The per-word estimation ladder inside `estimateTokens` (tokenizer.js:104
  through tokenizer.js:137) — L2.
- The even/odd interleave and middle-band relabelling inside
  `reorderForAttention` (assembler.js:66 through assembler.js:87) — the box
  carries the rule, the loop is L2.
- The 5 extraction categories and their 11 regexes (compactor.js:14 through
  compactor.js:47) — L2; the four *failure-mode* detectors are the L1-relevant
  contract and they are on card 3.
- `Scratchpad.search()` scoring and snippet extraction (scratchpad.js:132
  through scratchpad.js:181) — L2.
- The test file's 12 suites — tests are not architecture.
- `balanced`'s proportional sub-budget arithmetic (strategies.js:62 through
  strategies.js:102) — L2; the box carries that it exists.

## Portability notes — where the token vocabulary did not fit this domain

Fourth codebase for this harness. "Rules bent per new domain" is the tracked
metric, so these are recorded rather than smoothed over.

1. **`component.external` has NO occupant on this page, and that is the honest
   answer.** The strain flagged across previous diagrams reaches its limit here:
   this system has no external surface at all — no network, no filesystem, no
   subprocess, no model. Previous diagrams could at least give the token to JSON
   files on disk. Here the inputs are string literals inside `demo.js`
   (demo.js:48) and the pricing is a hardcoded object (cache.js:16). Rather than
   award `component.external` to something in-process and mislead the reader, the
   token is left unused and the output zone is labelled "nothing is sent
   anywhere".
2. **`component.agent` has no occupant either.** There is no agent, no loop, no
   model call — nine stateless modules plus two classes. The second recurring
   strain, confirmed again.
3. **`component.mock` was stretched to cover in-code demo data.** `createDemoSources()`
   is not a mock of an interface; it is the corpus. But it *stands in* for what a
   real deployment would fetch from a vector store, a memory service and a tool
   runner, so `component.mock` is the nearest token. The box carries
   `in-code, no files` so the picture cannot imply a data source.
4. **`component.artifact` was used for a `Map` in RAM.** The theme's own `_meta`
   says this token replaced `component.store` because "durable output here is
   files". `Scratchpad` is a store but nothing about it is durable
   (scratchpad.js:38) — it dies with the process. Nearest token, used, with
   `Map in RAM :38` on the label so the durability implication is cancelled on
   the picture. Same for the return-value box, which is a value, not an artifact:
   its label says `returned in-process`.
5. **`boundary.observability` labels a zone that observes nothing.** Reused as in
   `guardrails_v1` for "where the run becomes visible". The name still
   over-promises; `boundary.output` would be the honest token.
6. **No `edge.data_out` and no `edge.dependency`.** The tokenizer fan-in is five
   modules *depending on* one module, which is not a call in the flow sense;
   `edge.call` is the nearest and is used, with the arrow pointing consumer →
   provider. `edge.artifact` was borrowed for `assemble → return value`, which is
   a return, not a written artifact.
