# FACTS — 11-cost-latency (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/11-cost-latency/src/`, n=7 files, 1695 lines, plus
`data/conversations.json` (50 fixtures).
**Every element in the diagram appears below with a `file:line` citation. The
diagram may contain nothing that is not on this page, and this page may contain
nothing without a citation.** The project README ships an ASCII architecture
diagram; it was treated as a CLAIM, not as evidence — and it is wrong about
pipeline order (see the PER-TURN PIPELINE card below).

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The internals of each optimizer (the trigram
hash, the complexity scoring table, the completeness regexes) are L2 and are
deliberately NOT drawn here.

What the project is: a **cost/latency optimization toolkit for an LLM support
agent**. Four optimizations, each independently toggleable
(`DEFAULT_CONFIG` — benchmark.js:17), measured against an unoptimized baseline
across the same 50 fixture conversations. No network call is made anywhere; the
model is simulated in-process.

---

## Components

| # | Element | What it is | Citation |
|---|---|---|---|
| 1 | `demo.js` | CLI entry. Three single-conversation before/after demos, then the full benchmark, then the ablation study | demo.js:19, :103, :111-115, :124-125, :135-153 |
| 2 | `benchmark.js` | CLI entry AND the pipeline itself — `runOptimizedPipeline` | benchmark.js:27, :281, :285-289 |
| 3 | `data/conversations.json` | The fixture: 50 conversations, 1–4 user turns each, loaded by `loadConversations()` | baseline.js:307, :308 |
| 4 | `SemanticCache.lookup()` | Stage 1. Cosine similarity over trigram+word hash embeddings; hit ⇒ zero cost | semanticCache.js:69, :101, :117; constructed benchmark.js:28-31 |
| 5 | `summarizeHistory()` | Stage 2. Keeps the last 2 exchanges in full, summarizes the rest. Paired with the compressed system prompt | promptCompression.js:26, :35, :14 |
| 6 | `classifyComplexity()` → `routeToModel()` | Stage 3. Scores the query, picks a model tier | modelRouter.js:15, :77 |
| 7 | `simulateLLMCall()` | Stage 4. The only token spend in the loop. Multiplies raw input tokens by a tool-context factor of 4 | baseline.js:35, :39, :53 |
| 8 | `applyEarlyTermination()` | Stage 5. Truncates at the next sentence boundary once the response reads complete | earlyTermination.js:70, :85 |
| 9 | `MODEL_PRICING` | The price table — three tiers, per 1K tokens | baseline.js:18, :19-21 |
| 10 | `generateResponse()` | MOCK response corpus — 5 canned bodies picked by keyword category. Not exported; no network | baseline.js:89, :95, :156-164 |
| 11 | `stats` + `summary` | What `runOptimizedPipeline` returns: cache hit rate, termination rate, output-token savings, avg cost/latency/quality | benchmark.js:174-193 |
| 12 | `formatComparisonTable()` | The deliverable — the 5-stage markdown table printed to stdout | benchmark.js:227, :202-206, :289 |

## Flows

| Edge | From → To | What crosses | Citation |
|---|---|---|---|
| `runIncrementalBenchmark` | demo.js → benchmark.js | the 50 conversations, 5 stage configs | demo.js:124, benchmark.js:200 |
| fixture load | conversations.json → benchmark.js | 50 conversations | baseline.js:307, benchmark.js:285 |
| per user turn | benchmark.js → cache lookup | one user message | benchmark.js:61-62, :66 |
| cache MISS | lookup → summarizeHistory | the message list so far | benchmark.js:82, :86-89 |
| cache HIT (bypass) | lookup → stats | zero-cost turn: cost 0, latency 2ms, `continue` | benchmark.js:67-80 |
| compressed msgs | summarizeHistory → router | `callMessages` | benchmark.js:88-89, :95 |
| tier | router → simulateLLMCall | `model` ∈ frontier/mid/cheap | benchmark.js:96, :103 |
| price lookup | simulateLLMCall → MODEL_PRICING | tier name → `{input, output}` | baseline.js:41, :69 |
| response text | simulateLLMCall → generateResponse | last user message + tier | baseline.js:57, :89 |
| response | simulateLLMCall → applyEarlyTermination | the generated text | benchmark.js:106, :113 |
| roll-up | applyEarlyTermination → stats | adjusted cost, latency, perceived latency | benchmark.js:118-119, :127, :144-146 |
| render | stats → comparison table | per-stage `summary` + `stats` | benchmark.js:213-218, :247-254 |

---

## INVARIANT CARD 1 — PER-TURN PIPELINE, complete and in code order

`runOptimizedPipeline` — benchmark.js:27. Every user turn passes through
exactly these seven steps, in this order. **This is where the README's ASCII
diagram is wrong**: it draws prompt compression as box 1 and the cache as box 2;
the code checks the cache *first*, and a hit skips compression entirely.

| # | Step | Citation |
|---|---|---|
| 1 | `cache.lookup(msg.content)` — HIT ⇒ cost 0, latency 2, `continue` | benchmark.js:66, :67-77, :80 |
| 2 | `summarizeHistory(callMessages)` — a no-op unless the conversation has >4 messages; the system-prompt swap happens once, up front | benchmark.js:88, promptCompression.js:27, benchmark.js:33 |
| 3 | `classifyComplexity` → `routeToModel` | benchmark.js:95, :96 |
| 4 | `simulateLLMCall(callMessages, {model, systemPrompt})` | benchmark.js:103 |
| 5 | `applyEarlyTermination` — `cost × (0.5 + 0.5·ratio)` | benchmark.js:113, :118 |
| 6 | `perceivedLatency(adjustedLatency, model)` | benchmark.js:127 |
| 7 | `cache.store(msg.content, finalResponse)` — every miss is written back | benchmark.js:131 |

Ordering consequence, stated in code: because step 1 short-circuits with
`continue` (benchmark.js:80), a cached turn is never compressed, never routed,
never truncated — the cache is the only optimization that removes the LLM call
rather than shrinking it.

## INVARIANT CARD 2 — MODEL TIERS, all three, complete

`MODEL_PRICING` — baseline.js:18. Three tiers, no more.

| Tier | Model name | Input / Output per 1K | Base + per-token latency | TTFT |
|---|---|---|---|---|
| `frontier` | gpt-4 | $0.03 / $0.06 | 800ms + 15ms/tok | 300ms |
| `mid` | claude-sonnet | $0.003 / $0.015 | 400ms + 8ms/tok | 150ms |
| `cheap` | gpt-4o-mini | $0.00015 / $0.0006 | 200ms + 5ms/tok | 100ms |

- pricing rows: baseline.js:19, :20, :21
- latency constants: baseline.js:61, :62; jitter ×(0.8–1.2): baseline.js:66
- cost formula: baseline.js:69
- routing map, complete: `simple→cheap`, `medium→mid`, `complex→frontier`,
  default `frontier` — modelRouter.js:79, :80, :81, :82
- classifier thresholds, complete: `score ≤ 0 → simple`, `score ≤ 3 → medium`,
  else `complex` — modelRouter.js:69, :70, :71
- TTFT values: earlyTermination.js:120, consumed at earlyTermination.js:124

## INVARIANT CARD 3 — QUALITY LEDGER, every debit, complete

benchmark.js:165-169. The whole quality model is five lines of arithmetic.

| Step | Value | Citation |
|---|---|---|
| start | 0.92 | benchmark.js:165 (matches the baseline constant, baseline.js:270) |
| `promptCompression` | − 0.03 | benchmark.js:166 |
| `modelRouting` | − 0.02 | benchmark.js:167 |
| `earlyTermination` | − 0.03 | benchmark.js:168 |
| `semanticCaching` | − 0.00 (comment: cached replies are frontier replies) | benchmark.js:169 |
| end, all four on | 0.84 | computed from the four rows above |

**The number is assigned, never measured.** `scoreQuality()` exists
(baseline.js:278) and is imported (promptCompression.js:9) but is called from
nowhere in the repo. Anything the table prints in the Quality column is a
constant, not a judgement of the generated text.

---

## Artifacts

| Artifact | Written by | Citation |
|---|---|---|
| Comparison table (5 stages) → **stdout** | `formatComparisonTable` | benchmark.js:227, :289; demo.js:125-126 |
| Ablation study (4 solo runs) → **stdout** | demo.js | demo.js:135-153 |
| Per-stage `stats` object | `runOptimizedPipeline` | benchmark.js:174-185 |

No file is written. Nothing is persisted. Every run re-derives its numbers, and
`simulateLLMCall` injects random jitter (baseline.js:66), so two runs of the
same command do not produce identical latency figures.

## Deliberately NOT drawn (L1 scope discipline)

- The **internals of each optimizer** — trigram hashing and L2 normalization
  (semanticCache.js:15-50), the complexity scoring table (modelRouter.js:21-66),
  the completeness regexes (earlyTermination.js:30-58), the topic extractor
  (promptCompression.js:42-62). All L2.
- The **six per-module `main` blocks** (`node src/<module>.js`) — baseline.js:315,
  promptCompression.js:157, semanticCache.js:253, modelRouter.js:177,
  earlyTermination.js:230. They are demo harnesses around the same functions, not
  a second architecture. Only the two composed entries are drawn.
- The **dead measure* functions** — `measureSemanticCaching`
  (semanticCache.js:170), `measureModelRouting` (modelRouter.js:106),
  `measureEarlyTermination` (earlyTermination.js:132),
  `measurePromptCompression` (promptCompression.js:85), `routedLLMCall`
  (modelRouter.js:89). Each is reachable only from its own module's `main`
  block; `runOptimizedPipeline` uses none of them.
- The **cache eviction paths** — `_evictExpired` (semanticCache.js:85) and
  `_evictLRU` (semanticCache.js:93). L2 lifecycle.

## Portability notes — rules that needed bending for this domain

Recorded because "rules bent per new domain" is the portability metric.

1. **`component.artifact` assumes a durable output.** This project writes no
   file — its deliverable is stdout. Used `component.artifact` anyway for the
   stats object and the comparison table, because they *are* the run's product.
   The token vocabulary needs a `component.output` that does not imply a file.
2. **`boundary.external` again labels something that never leaves the process.**
   Same bend recorded by `agent_harness_v1`: the "external" zone is a MOCK model
   (`generateResponse`, baseline.js:89) plus a price table. Honesty required the
   zone label to carry the word MOCK, since the token cannot.
3. **`component.agent` has no natural occupant.** There is no agent loop here —
   the closest thing is the simulated LLM call. Used `component.agent` for
   `simulateLLMCall` because it is the one box where a real model would sit.
4. **`edge.stop` does not mean "terminate the run" here.** It marks the cache-hit
   short-circuit (benchmark.js:80) — a per-turn bypass, not a run-level stop. The
   token generalizes as "control leaves the normal path", which is the right
   reading, but the name misleads on first contact.
