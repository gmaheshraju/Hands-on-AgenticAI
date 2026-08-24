# FACTS — 31-agent-chat (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/31-agent-chat/src/` (11 JS modules, 2594 lines) +
`public/app.js` (941 lines). **Every element in the diagram appears below with a
`file:line` citation. The diagram may contain nothing that is not on this page,
and this page may contain nothing without a citation.** The project README ships
an ASCII architecture diagram; it was treated as a claim, not as evidence —
every fact below was read from source, and one README claim did not survive that
reading (see "README claims that did not verify").

Altitude: **L1 — space** (which tier a thing lives in, what talks to what, what
crosses a trust boundary), per `DIAGRAM_RULES.md`. The two-phase reasoning loop
inside `runAgent`, the git-like message tree, and the per-regex scoring math are
L2 concerns and are deliberately NOT drawn here (see "Deliberately NOT drawn").

---

## The three tiers

| Tier | Boundary | What lives there | Citation |
|---|---|---|---|
| Browser (untrusted client) | external | vanilla-JS chat UI + run inspector, one `<script>` | public/app.js, public/index.html:50 |
| Express server process | primary | Node ESM, no framework; routes, streams, agent pipeline, DB | src/server.js:13 |
| Upstream network | external | 3 LLM providers + Wikipedia — **real** `fetch()` calls | src/llm.js, src/tools.js |
| SQLite persistence | datasource | one file, WAL + FTS5, 10 tables + 1 FTS virtual table | src/db.js:10, :16 |

## Components — the browser tier

| Component | Fact | Citation |
|---|---|---|
| Chat UI (SSE client) | subscribes to the stream over `EventSource` | app.js:401 |
| — | escapes HTML **before** applying markdown (XSS order) | app.js:703 |
| — | thread id lives in the URL hash; reconnect on load | app.js:27, :130 |
| Run Inspector | `showTrace(traceId)` → `GET /api/runs/:id` → report-card modal | app.js:812, :823 |
| — | "Inspect run" link rendered under each assistant message | app.js:736 |

## Components — the server process

| Component | Fact | Citation |
|---|---|---|
| Express server | routes; static `public/`; `x-powered-by` disabled | server.js:13, :18, :15 |
| — | SSE endpoint `GET /api/threads/:id/stream` | server.js:135 |
| — | read/write rate buckets dispatched by HTTP method | server.js:24-26 |
| — | `startAgentStream()` drives the agent generator | server.js:313, :334 |
| Security + rate limiter (folded into the server box) | CSP + 5 headers | middleware.js:26-31 |
| — | fixed-window per-IP `RateLimiter` | middleware.js:41, :81 |
| StreamManager | buffers every SSE event, replays to late subscribers | streams.js:16, :29-35 |
| — | global concurrency count via `activeCount()` | streams.js:65 |
| — | `abort()` / `isAborted()` back the stop button | streams.js:78, :86 |
| runAgent() | `async function* runAgent(...)` — the agent | agent.js:9 |
| — | reasoning/tool loop, capped at `maxToolRounds` (8) | agent.js:125, config.js:15 |
| — | final answer streamed token-by-token (phase 2) | agent.js:234 |
| Guardrails | `scanInput` (block+redact) / `scanOutput` (redact) | guardrails.js:10, :60 |
| AgentObserver | `AgentObserver`→`AgentRun`→`DecisionHandle` chain | tracer.js:3, :20, :208 |
| — | `startRun` at agent start, `end()` writes the report card | agent.js:15, tracer.js:60 |
| Tools · executeTool | 3 tools registered; dispatched by name | tools.js:3, :72 |
| — | `wikipedia_*` hit the network; `calculator` is local eval | tools.js:8, :27, :53 |
| LLMAdapter | `chat()` (non-stream) + `chatStream()` | llm.js:18, :75 |
| — | JSON-mode parse with one retry on bad JSON | llm.js:47, :338 |
| — | per run, the adapter is bound to the thread's provider | server.js:319-322 |

## Components — upstream network (real external calls)

| Component | Fact | Citation |
|---|---|---|
| LLM providers | Ollama NDJSON stream | llm.js:103 |
| — | NVIDIA SSE (`integrate.api.nvidia.com`) | llm.js:128, :137 |
| — | Gemini SSE (`generativelanguage.googleapis.com`) | llm.js:163, :180 |
| Wikipedia API | opensearch search | tools.js:8 |
| — | REST v1 page-summary read | tools.js:27 |

## Components — persistence

| Component | Fact | Citation |
|---|---|---|
| SQLite (better-sqlite3) | `DB` class; WAL + foreign keys | db.js:7, :11, :12 |
| — | 10 tables: threads, messages, audit_log, context_summaries, tool_lessons, interrupted_contexts, agent_runs, decisions, feedback, facts | db.js:18, :26, :41, :52, :61, :73, :86, :109, :132, :146 |
| — | `facts_fts` FTS5 virtual table + insert/delete triggers | db.js:155, :160, :165 |
| — | **shared store** — written by server, agent, observer, guardrails, context | db.js:7 (single instance, injected everywhere: server.js:28, :327) |

## Flows — the drawn edges

| Edge | From → To | Meaning | Citation |
|---|---|---|---|
| POST message | Chat UI → server | new user message | server.js:78, app.js:373 |
| SSE tokens | StreamManager → Chat UI | buffered event stream | streams.js:16, server.js:167 |
| GET /api/runs | Run Inspector → server | fetch a run's decisions | server.js:259, app.js:812 |
| runAgent() | server → Guardrails | pipeline entry; input scanned first | agent.js:9, :17 |
| emit events | server → StreamManager | yielded agent events → SSE | server.js:336 |
| input ok | Guardrails → runAgent | allowed input proceeds | agent.js:25, :40 |
| reason + answer | runAgent → LLMAdapter | `chat()` reasoning + `chatStream()` answer | agent.js:134, :234 |
| executeTool | runAgent → Tools | run a selected tool | agent.js:168 |
| record / end | runAgent → AgentObserver | `recordDecision` + `end()` | agent.js:145, :256 |
| chat / stream | LLMAdapter → LLM providers | provider `fetch()` | llm.js:107, :137, :181 |
| fetch | Tools → Wikipedia API | search/read | tools.js:9, :28 |
| agent_runs + decisions | AgentObserver → SQLite | persist the report card | tracer.js:86, :78 |

---

### INVARIANT CARD 1 — five decision-quality scores, complete, in `AgentRun.end()` order

The headline of the project: it scores **decisions, not spans**. All five are
computed in `end()` (tracer.js:60) and persisted; enumeration is in code order.

| # | Score | How it is computed | Citation |
|---|---|---|---|
| 1 | Tool ROI | `toolsUsedInAnswer / toolDecisions` (1 if no tools) | tracer.js:71, :72 |
| — | — | a result is "used" when bigram overlap with the answer ≥ 0.15 | tracer.js:124, :150 |
| 2 | Reasoning coherence | fraction of consecutive decisions sharing ≥ 2 thought terms | tracer.js:74, :167 |
| 3 | Decision productivity | per decision: productive vs wasted | tracer.js:68, :69 |
| — | — | `respond`, or a used tool result, ⇒ productive; else wasted | tracer.js:141, :150 |
| 4 | Confidence signals | 5 patterns matched on the thought text | tracer.js:183 |
| — | — | hedging · confident · uncertain · seeking_info · ready_to_answer | tracer.js:189, :191, :194, :197, :200 |
| 5 | Strategy classification | shape of the run, 4 values | tracer.js:173 |
| — | — | direct · single_tool · multi_tool · iterative | tracer.js:175, :177, :179, :180 |

Persisted: the run row via `endAgentRun` (tracer.js:86 → db.js:410), each
decision via `createDecision` in a loop (tracer.js:78 → db.js:422). Read back
by the inspector through `getRunWithDecisions` (db.js:433).

### INVARIANT CARD 2 — Guardrails, complete, in call order

`scanInput` blocks and redacts on the way in; `scanOutput` redacts on the way
out. Enumeration in code order.

| Stage | Check | Effect | Citation |
|---|---|---|---|
| `scanInput()` | 16 injection regexes | any match ⇒ `allowed=false`, request blocked | guardrails.js:13, :40; config.js:52-67 |
| — | 5 PII types redacted | credit_card · ssn · email · phone · api_key | guardrails.js:24, :34; config.js:70-74 |
| — | blocked path | `allowed=false` ⇒ agent returns a canned reply, `outcome:'blocked'` | guardrails.js:41; agent.js:25, :36 |
| `scanOutput()` | same 5 PII types masked on the answer | `pii_leak` flags | guardrails.js:63, :72 |
| — | 2 disclaimer patterns flagged | low-severity `output_quality` | guardrails.js:76; config.js:76-79 |
| both | one `audit_log` row per non-empty scan | observability | guardrails.js:45, :86 |

### INVARIANT CARD 3 — production limits, complete (the "safe to expose publicly" thesis)

Every guard that lets this run on the open internet, all dependency-free.

| Guard | Value | Citation |
|---|---|---|
| Per-IP rate limit | 300 reads/min · 20 writes/min (writes spawn LLM work) | config.js:113, :114; server.js:24-26 |
| Global concurrency cap | 20 simultaneous runs → `503` | server.js:91; config.js:105 |
| Oversized message | > 8000 chars → `413` | server.js:86; config.js:104 |
| JSON body cap | 64 kb | config.js:103; server.js:17 |
| Security headers | CSP + 5 headers, `x-powered-by` off | middleware.js:26-31; server.js:15 |
| Graceful shutdown | drain in-flight streams, then close SQLite (WAL checkpoint) | server.js:380, :384, :388 |

---

## README claims that did not verify

1. **The README ASCII draws the SQLite box as six tables** —
   "threads · messages(tree) · agent_runs · decisions · feedback · facts(FTS5)".
   Source has **ten** base tables plus the `facts_fts` virtual table: the ASCII
   omits `audit_log`, `context_summaries`, `tool_lessons`, and
   `interrupted_contexts` (db.js:41, :52, :61, :73). The diagram's DB node
   carries the fuller list and the FACTS table above is complete. This is the
   single load-bearing correction on this page — the app's persistence surface
   is ~65% larger than the marketing picture shows.

2. **The README ASCII implies the LLMAdapter fails over across providers on
   every call** ("Ollama NDJSON · NVIDIA/Gemini SSE" under one box). The
   fail-over loop is real (llm.js:21, :64) but in the agent path the adapter is
   constructed with a **single** provider — the thread's chosen one
   (`providers: [thread.provider || 'ollama']`, server.js:320) — so no fail-over
   occurs there. The multi-provider default list (config.js:85) is only used by
   the health check's default adapter (server.js:29, :197). The diagram draws
   three providers as reachable and labels the adapter with what the agent path
   actually does; the fail-over nuance is documented here, not on the picture.

## Deliberately NOT drawn (L1 scope discipline)

- The two-phase reasoning loop inside `runAgent` (reason → tool → repeat ≤ 8,
  then stream answer) — L2 behaviour, agent.js:125-249.
- The git-like message tree (`parent_id`, branch points, active-branch walk) —
  L2 data-structure detail, db.js:246, :271.
- The 16 injection regexes and 5 PII regexes individually — the card carries
  their **counts**, which is the L1-relevant fact.
- Context compression / summarization (`ContextManager`) and cross-session fact
  extraction — real features, but internal to the pipeline; folded into the
  runAgent box (context.js, agent.js:64, :99).
- Tool-intelligence "lessons" and the audit trail as separate stores — rows in
  the shared SQLite box, not separate architecture (db.js:343, :294).
- `calculator` has no external node: it is a local sandboxed `Function` eval,
  not a network call (tools.js:53).

## Portability notes — how the trading-system vocabulary fit this domain

24th diagram for this harness; recorded because "which tokens fit / needed
bending" is the portability metric. Two recurring strains were checked:

1. **`component.external` has a HONEST occupant here** — unlike the common
   strain where the "external" surface is a hardcoded mock. This project makes
   real `fetch()` calls to three LLM endpoints and to Wikipedia (llm.js:107,
   tools.js:9). No bending needed; the token means exactly what it says.
2. **`component.agent` has an HONEST occupant here** — unlike the strain where
   "agents" are stateless functions. `runAgent` is a genuine stateful loop with
   a reasoning/tool cycle capped at 8 rounds (agent.js:9, :125). No bending.
3. **`boundary.external` is reused for two different external surfaces** — the
   downstream browser (untrusted client) and the upstream network (providers +
   Wikipedia). Both are genuinely external to the server process, so the token
   is honest for each, but the two zones share one colour; their labels
   disambiguate (client vs upstream).
4. **`component.artifact` labels a live database, not a written file.** SQLite is
   a durable store rather than an emitted artifact; the token's "durable output"
   sense fits, but a `component.datastore` token would be more precise. The DB
   sits inside `boundary.datasource`, which is exactly right.
5. **`component.mock` is unused** — this build has no hardcoded mock to place, so
   the token is simply not drawn. (No token was invented to fill a gap.)
