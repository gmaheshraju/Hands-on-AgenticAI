# FACTS — 06-llmops (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/06-llmops/src/` (n=5 files, 873 lines) plus
`public/dashboard.html` (407 lines).
**Every element in the diagram appears below with a `file:line` citation. The
diagram may contain nothing that is not on this page, and this page may contain
nothing without a citation.** The project README ships an ASCII diagram; it was
treated as a CLAIM, not as evidence. Two of its claims did not survive contact
with the source — see "README claims that failed verification" below.

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The escalation retry loop *inside*
`route()` is an L2 state concern and is deliberately NOT drawn here.

What it is: a **model-routing proxy with a cost dashboard**. A heuristic
classifier scores query complexity, a router sends the query down a per-tier
fallback chain of mock LLMs, every attempt is written to SQLite, and a second
process serves aggregates over HTTP to a browser dashboard.

---

## Components

| # | Component | What it is | Citation |
|---|---|---|---|
| 1 | `demo.js` | Driver: 50 literal queries, awaited one at a time through `route()` | demo.js:14 (`const QUERIES`), :74 (`runDemo`), :82 (`await route(query)`), :144 |
| 2 | `classify()` | Heuristic complexity scorer, no model call | classifier.js:125 |
| 3 | `route()` | Fallback-chain router; the only writer of metrics rows | router.js:153 |
| 4 | `mockModelCall()` | The model layer — simulated latency, tokens, cost, failures | router.js:107 |
| 5 | `MODEL_CONFIG` / `ROUTING_TABLE` | Model registry and per-tier chain | router.js:19, :64 |
| 6 | `logRequest()` | Prepared INSERT into `requests` | metrics.js:74, statement metrics.js:65 |
| 7 | `metrics.db` | SQLite file, WAL journal, `requests` table + 2 indexes | metrics.js:14, :21, :30, :47, :48 |
| 8 | 9 read queries | Exported aggregate SELECTs used by the dashboard | metrics.js:94-215 (enumerated below) |
| 9 | `dashboard.js` | Node `http` server, port 3000, no framework | dashboard.js:69, :21, :80 |
| 10 | `public/dashboard.html` | Browser client, polls the JSON API | `public/dashboard.html:249`, `:404` |

Component 10 is drawn outside the process boundary because it executes in the
browser, not in Node.

## Flows

| Flow | From → To | Mechanism | Citation |
|---|---|---|---|
| query in | demo.js → `route()` | `await route(query)` in a for-loop over 50 literals | demo.js:82 |
| classify | `route()` → `classify()` | called first, before any model | router.js:157 |
| model call | `route()` → `mockModelCall()` | `callModel(modelKey, query)` per chain position | router.js:171, default bound at :154 |
| pricing lookup | `mockModelCall()` → `MODEL_CONFIG` | `MODEL_CONFIG[modelKey]`, cost computed from `inputCostPer1k` / `outputCostPer1k` | router.js:108, :130-131 |
| result back | `mockModelCall()` → `route()` | returns `{response, tokensIn, tokensOut, cost, latencyMs, success}` | router.js:133-140 |
| metrics write | `route()` → `logRequest()` | **three** call sites: escalated attempt, success, thrown error | router.js:187, :207, :242 |
| insert | `logRequest()` → `metrics.db` | prepared INSERT, 12 bound columns | metrics.js:65-71, :76 |
| aggregate read | `metrics.db` → 9 read queries | `getDb().prepare(...)` per query | metrics.js:95, :102, :117, :130, :142, :156, :168, :180, :206 |
| API assembly | read queries → `dashboard.js` | `handleApi` builds an 11-key payload | dashboard.js:44, :50-61 |
| serve | `dashboard.js` → browser | `GET /api/metrics` JSON, `GET /` HTML | dashboard.js:70, :72 |
| poll | browser → `dashboard.js` | `fetch('/api/metrics')`, `setInterval(loadData, 10000)` | `public/dashboard.html:249`, `:404` |

---

## INVARIANT CARD 1 — CLASSIFY → ROUTE, the complete table in code order

The score is a fixed weighted sum; the tier is a two-threshold cut; the chain is
a literal three-key table. Nothing else selects a model.

| Element | Value | Citation |
|---|---|---|
| score | `kw × 0.50 + len × 0.30 + struc × 0.20`, rounded to 2dp | classifier.js:135, :136 |
| inputs | `lengthScore` / `keywordScore` / `structureScore` | classifier.js:46, :64, :91 |
| dictionaries | SIMPLE / COMPLEX / MEDIUM keyword lists | classifier.js:14, :23, :36 |
| tier `simple` | `score < 0.30` | classifier.js:139 |
| tier `medium` | `score < 0.55` | classifier.js:140 |
| tier `complex` | else | classifier.js:141 |
| chain `simple` | `['haiku','sonnet','opus']` | router.js:65 |
| chain `medium` | `['sonnet','opus']` | router.js:66 |
| chain `complex` | `['opus']` — no fallback remains | router.js:67 |

## INVARIANT CARD 2 — ESCALATION: `LOW_QUALITY_SIGNALS`, 6 checks in code order

`isLowQuality` is `.some()` over this array — any one match escalates
(router.js:101, :102). Declaration: router.js:92.

| # | Check | Citation |
|---|---|---|
| 1 | `resp.length < 20` | router.js:93 |
| 2 | `/i don'?t know/i` | router.js:94 |
| 3 | `/i'?m not sure/i` | router.js:95 |
| 4 | `/i cannot/i && resp.length < 100` | router.js:96 |
| 5 | `/as an ai/i && resp.length < 150` | router.js:97 |
| 6 | `resp.trim().endsWith('...') && resp.length < 80` | router.js:98 |

**Exemption that makes the chain terminate:** the last model in the chain is
never judged — `qualityOk = !isLowQuality(...) || isLastInChain` — router.js:177, :178.

**`escalation_reason` — the complete set of values written to the DB, in code order:**

| Value | Where set | Citation |
|---|---|---|
| `response_too_short` | quality reject, response shorter than 20 chars | router.js:183-184 |
| `low_quality_detected` | quality reject, any other signal | router.js:185 |
| `error: <err.message>` | model call threw | router.js:240 |
| `all_models_exhausted` | chain ran out; returned, not logged | router.js:273 |

Injected failure that drives escalation in the demo: cheap-tier model, query
longer than 300 chars, 30% of the time — router.js:127, response substituted at
router.js:134 (which trips check #3).

## INVARIANT CARD 3 — `MODEL_CONFIG`: 5 models in code order, $ per 1K tokens

| Key | `name` | `tier` | in / out per 1K | `avgLatencyMs` | Citation |
|---|---|---|---|---|---|
| `haiku` | claude-haiku-4-5 | cheap | 0.001 / 0.005 | 200 | router.js:20 |
| `gpt-4o-mini` | gpt-4o-mini | cheap | 0.00015 / 0.0006 | 250 | router.js:28 |
| `sonnet` | claude-sonnet-5 | medium | 0.003 / 0.015 | 800 | router.js:36 |
| `gpt-4o` | gpt-4o | medium | 0.0025 / 0.01 | 700 | router.js:44 |
| `opus` | claude-opus-5 | expensive | 0.005 / 0.025 | 2000 | router.js:52 |

**Finding — 2 of the 5 configured models are unreachable.** `ROUTING_TABLE`
names only `haiku`, `sonnet`, `opus` (router.js:65, :66, :67). `gpt-4o-mini`
and `gpt-4o` are declared and priced but no code path can select them: the only
model lookup is `chain[i]` (router.js:168, :171). Registered ≠ routable, and the
diagram says so on the card.

---

## Artifacts and durable state

| Artifact | Written by | Citation |
|---|---|---|
| `metrics.db` (SQLite, WAL, `synchronous=NORMAL`) | `getDb()` on first use | metrics.js:14, :20, :21, :22 |
| table `requests`, 14 columns | `migrate()` | metrics.js:28, :30 |
| indexes on `timestamp`, `model` | `migrate()` | metrics.js:47, :48 |
| in-place timestamp normalisation of pre-ISO rows | `migrate()` | metrics.js:55-59 |
| HTTP JSON payload, 11 keys | `handleApi` | dashboard.js:50-61 |

**Two processes, one file.** `npm run demo` (writer) and `npm run dashboard`
(reader) are separate Node processes over the same `DB_PATH`; WAL is the reason
concurrent read/write does not block — metrics.js:14, :21.

The 9 exported read queries, in code order: `totalCost` metrics.js:94,
`costByModel` :101, `avgLatencyByModel` :116, `escalationStats` :129,
`requestsPerHour` :141, `tierDistribution` :155, `topExpensiveRequests` :167,
`savingsVsFrontier` :178, `recentRequests` :205.

---

## README claims that failed verification

1. **"Fallback chain … Simple: Haiku ▸ Sonnet ▸ Opus"** is correct, but the
   README's model list omits `gpt-4o-mini` and `gpt-4o`, which exist in
   `MODEL_CONFIG` (router.js:28, :44) and are unroutable. The README under-states
   what is configured; the code over-states what is reachable.
2. **"metrics.js — SQLite Store (WAL mode) … Logs: model, tokens_in/out, cost,
   latency, escalation"** — the row is wider than that: 14 columns including
   `query_preview`, `complexity`, `tier` and `response_preview`
   (metrics.js:30-45). The dashboard's "top expensive" view depends on
   `query_preview` (metrics.js:170), so the omission is not cosmetic.
3. The README's ASCII draws a single vertical pipeline. It does not show that
   the dashboard is a **separate process** reading the same file (dashboard.js:69
   vs demo.js:144), which is the one boundary an L1 diagram exists to show.

## Deliberately NOT drawn (L1 scope discipline)

- The retry/escalation loop inside `route()` (`for (let i…)`, router.js:167) —
  that is an L2 state machine, a different altitude per `DIAGRAM_RULES_LLD.md`.
  Its *outcome vocabulary* is on a card; its *transitions* are not on the page.
- Scoring internals: `lengthScore` buckets (classifier.js:46-54), `hasWord`
  regex construction (classifier.js:60-62), `structureScore` additions
  (classifier.js:91-115) — function-level detail excluded by the L1 content rules.
- `MOCK_RESPONSES` corpus contents (router.js:72).
- The dashboard's chart rendering (`public/dashboard.html` DOM code) — client
  presentation, not architecture.
- The console summary printing in `demo.js:96-141`.

## Portability notes — rules that needed bending for this domain

Recorded because "rules bent per new domain" is the portability metric for the
governed-diagram harness.

1. **`edge.money` → `edge.primary`** (already renamed in the shared theme by
   `agent_harness_v1`). Here the critical path is cost-bearing but not a money
   transfer; `edge.primary` fits.
2. **`component.store` is absent from the theme** (renamed to
   `component.artifact` for a file-based project). This project genuinely has a
   **database**, so `component.artifact` is a slight semantic under-fit — the
   token vocabulary would benefit from `component.store` existing alongside
   `component.artifact` rather than instead of it. Used `component.artifact`
   for `metrics.db` rather than introduce a token.
3. **`boundary.external` labels a MOCK model layer, not a network zone.** As in
   `agent_harness_v1`, nothing leaves the process — honesty requires the zone
   label carry the word MOCK. The vocabulary lacks a "would-be-external, is
   currently stubbed" boundary token.
4. **No token distinguishes a second OS process.** `dashboard.js` runs in its
   own process yet is drawn inside the one `boundary.primary` zone; the
   two-process fact is carried by node text, not by geometry. A
   `boundary.process` token would have drawn it correctly.
