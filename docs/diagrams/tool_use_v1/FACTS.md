# FACTS — 10-tool-use (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/10-tool-use/src/`, n=5 files, 1521 lines
(`database.js` 406, `permissions.js` 345, `agent.js` 340, `demo.js` 244,
`formatter.js` 186).
**Every element in the diagram appears below with a `file:line` citation. The
diagram may contain nothing that is not on this page, and this page may contain
nothing without a citation.** The project README ships an ASCII diagram; it was
treated as a claim, not as evidence — every fact below was read from source, and
three README claims were found wrong (see *README corrections*).

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The retry loop's internal iteration is an L2b
concern; the diagram draws the four steps of ONE attempt and puts the loop
arithmetic on a card rather than as a back-edge.

What the project is: a **text-to-SQL analytics agent** whose security boundary
is a code-enforced SQL validator, not a prompt. A natural-language question goes
to an LLM seam that emits SQL; `validateQuery()` accepts, escalates, or refuses
it; allowed SQL is cost-estimated with `EXPLAIN QUERY PLAN` and executed against
a local seeded SQLite file; results are formatted for stdout.

---

## Components

| # | Node | What it is | Citation |
|---|---|---|---|
| 1 | `demo.js` CLI | entry point; `main()` runs 3 parts — 10 questions, 5 injections, 7 tier tests | demo.js:32, :60, :116, :173 |
| 2 | `agent.ask(question)` | the orchestrator returned by `createAgent(config)`; owns the attempt loop | agent.js:221, :239, :258 |
| 3 | `llm(messages)` / `mockLLM` | the model seam; default is a pattern-matching mock, swappable via config | agent.js:62, :223 |
| 4 | `validateQuery()` | the permission gate — the security boundary, in code | permissions.js:144 |
| 5 | `estimateQueryCost()` | `EXPLAIN QUERY PLAN` cost estimate before execution | permissions.js:329, :331 |
| 6 | `db.prepare(sql).all()` | better-sqlite3 execution, timed with `performance.now()` | agent.js:296, :297, :298 |
| 7 | `formatResult(rows)` | ASCII table / scalar / metadata rendering | formatter.js:116, :121, :126 |
| 8 | `database.js` | opens (WAL, FK on), builds schema context, publishes the table whitelist | database.js:321, :323, :350, :396 |
| 9 | `analytics.db` | the SQLite file on disk; seeded once when empty | database.js:13, :330 |
| 10 | stdout — success | formatted table + query metadata printed by the demo | demo.js:99-101 |
| 11 | stdout — refusal | `PERMISSION DENIED` / `CONFIRMATION REQUIRED` strings | agent.js:281, :286 |

Prompt construction (`buildSystemPrompt` agent.js:22, `buildRetryPrompt`
agent.js:40) is folded into node 3's label rather than drawn as its own box —
it is a function of the seam, not a separate place.

## Flows

| Edge | From → To | Carries | Citation |
|---|---|---|---|
| question | CLI → `ask()` | natural-language string | demo.js:89 |
| messages | `ask()` → `llm()` | `[system, user]` message array | agent.js:253-256, :264 |
| SQL | `llm()` → `validateQuery()` | raw SQL, fences and trailing `;` stripped | agent.js:266-268, :277 |
| allowed | `validateQuery()` → execute | passes only when `permission.allowed` and not blocked on confirm | agent.js:280, :285 |
| sql | `validateQuery()` → `estimateQueryCost()` | same SQL string, cost path | agent.js:291 |
| EXPLAIN | `estimateQueryCost()` → `analytics.db` | `EXPLAIN QUERY PLAN <sql>` prepared on the same handle | permissions.js:331 |
| prepared statement | execute → `analytics.db` | `db.prepare(sql).all()` | agent.js:297 |
| rows | execute → `formatResult()` | result rows + metadata | agent.js:303-308 |
| formatted string | `formatResult()` → stdout | table/scalar plus `Query \| time \| rows \| cost` line | formatter.js:144-147, demo.js:101 |
| blocked / needs confirm | `validateQuery()` → stdout refusal | early return, never retried | agent.js:280-288 |
| schemaContext | `database.js` → `llm()` | DDL + 3 sample rows + relationships + notes, injected into the system prompt | database.js:350, demo.js:37, agent.js:231 |
| createSchema + seed | `database.js` → `analytics.db` | 4 tables, 9 indexes, seeded only when `users` is empty | database.js:132, :167-175, :330 |

---

## INVARIANT CARD 1 — `validateQuery()`, every check in code order

Ten checks, evaluated top-to-bottom in one function; the FIRST match returns.
Order is load-bearing: the multi-statement split runs before the SELECT check,
so `SELECT 1; DROP TABLE users` is refused as *multiple statements*, not as
*DROP*.

| # | Verdict | Check | Citation |
|---|---|---|---|
| 1 | blocked | multiple statements (split on `;`, >1 non-empty) | permissions.js:153-162 |
| 2 | blocked | first keyword after comment/string stripping is not `SELECT` | permissions.js:165-174 |
| 3 | blocked | any of 14 destructive keywords anywhere in the query | permissions.js:177-192, :194-204 |
| 4 | blocked | any of 6 database-metadata table patterns | permissions.js:207-214, :216-226 |
| 5 | blocked | `load_extension` | permissions.js:229-237 |
| 6 | blocked | a referenced table is not in `allowedTables` | permissions.js:241-257 |
| 7 | blocked | subquery nesting depth > 2 | permissions.js:261-270 |
| 8 | blocked | `UNION` (or `UNION ALL`) followed by a numeric or string constant | permissions.js:274-287 |
| 9 | confirm | more than 3 `JOIN` clauses | permissions.js:291, :296-298 |
| 10 | confirm | no `WHERE` clause while tables are referenced | permissions.js:292, :300-302 |
| — | allowed | fall-through only | permissions.js:316-322 |

Checks 9 and 10 accumulate into one `warnings` array and return a single
`tier: 'confirm'` result — permissions.js:294, :304-312.
`lacksWhereClause` exempts queries that have `GROUP BY` or `LIMIT` —
permissions.js:130.

## INVARIANT CARD 2 — the deny lists, complete

**14 destructive keywords, in declaration order** — permissions.js:178-191:
`INSERT` `UPDATE` `DELETE` `DROP` `ALTER` `CREATE` `TRUNCATE` `REPLACE` `EXEC`
`ATTACH` `DETACH` `PRAGMA` `GRANT` `REVOKE`

**6 metadata patterns, in declaration order** — permissions.js:208-213:
`information_schema` `sqlite_master` `sqlite_schema` `sqlite_temp_master`
`pg_catalog` `pg_tables`

**4 allowed tables** — database.js:397: `users` `products` `orders` `events`

Plus the single named-function block, `load_extension` — permissions.js:229.

## INVARIANT CARD 3 — one `ask()` attempt, 4 steps in code order

| Step | Code | Citation |
|---|---|---|
| 1 | `sql = await Promise.resolve(llm(messages))`; markdown fences and a trailing `;` are stripped | agent.js:264, :266, :268 |
| 2 | `validateQuery(sql, allowedTables)`; `!allowed` → `PERMISSION DENIED`, return | agent.js:277, :280-283 |
| 2b | `needsConfirm && !autoConfirm` → `CONFIRMATION REQUIRED`, return | agent.js:285-288 |
| 3 | `estimateQueryCost(db, sql)` | agent.js:291 |
| 4 | `db.prepare(sql).all()` inside `try`; on throw the message is pushed and a retry prompt appended | agent.js:297, :313, :317-321 |

Loop bound: `for (let attempt = 0; attempt <= maxRetries; attempt++)` with
`maxRetries = 3` → **4 attempts maximum**, not 3 — agent.js:227, :258.
Exhaustion renders `Failed after N attempts` plus the error list —
agent.js:327-334.

`AgentResult` envelope, 10 fields in declaration order — agent.js:206-215:
`success` `question` `sql` `rows` `formatted` `permission` `cost` `attempts`
`errors` `executionTimeMs`.

---

## Artifacts

| Artifact | Written by | Citation |
|---|---|---|
| `analytics.db` (SQLite, WAL) | `openDatabase()` at `<project>/analytics.db` | database.js:13, :321, :323 |
| 4 tables + 9 indexes | `createSchema()` | database.js:132, :134-165, :167-175 |
| 15,020 seeded rows | 2,000 users + 20 products + 5,000 orders + 8,000 events, deterministic (Mulberry32 seed 42) | database.js:194, :191 with :67-89, :231, :257, :26 |
| stdout | `console.log` of status, attempts, SQL and formatted block | demo.js:91-101 |

## README corrections (the ASCII was a claim, not evidence)

1. **"Tier 1 ALLOW: SELECT only, 14 destructive keywords blocked"** — wrong
   tier. In code the 14 keywords return `tier: 'blocked'` (permissions.js:200),
   not a tier-1 verdict. Tier 1 is fall-through only, permissions.js:316-322.
2. **"Retry loop (up to 3x)"** — the loop runs `attempt = 0..maxRetries`
   inclusive with `maxRetries = 3`, i.e. **4 attempts**, agent.js:227, :258.
3. **"database.js — SQLite Execution"** — `database.js` never executes agent
   SQL. Execution is `db.prepare(sql).all()` inside `agent.js:297`;
   `database.js` only opens, seeds, and describes the handle.

The diagram follows the code, not the README, on all three.

## Deliberately NOT drawn (L1 scope discipline)

- The retry back-edge and per-attempt state. The loop is a **behaviour over
  time** — L2b — so it is stated as an invariant card, not as an arrow that
  would make the main flow read right-to-left.
- `mockLLM`'s 19 question patterns and the retry fixups
  (agent.js:66-88, :93-186) — function-level detail.
- `formatTable` / `formatScalar` / `toChartData` internals (formatter.js:39,
  :91, :161). `toChartData` is exported but never imported by `demo.js` —
  drawing it would imply a flow that does not exist.
- The seeded data generators and reference tables (database.js:48-116,
  :181-313) — data content, not architecture.
- `demo.js`'s late `import { estimateQueryCost }` at demo.js:239, below its use
  at demo.js:218. It is legal ESM hoisting, and a code smell, but not an L1 fact.

## Portability notes — rules bent for this domain

Third contact for the harness with a non-FTS codebase; recorded because "rules
bent per new domain" is the portability metric.

1. **`component.mock` was NOT used for the LLM.** `mockLLM` is a mock, but it
   occupies the position of the swappable model seam (`llm` is a config field,
   agent.js:223). Drawing it grey as "mock data" would misread the
   architecture: the seam is real, only its default implementation is fake.
   Used `component.agent` and put the honesty in the label.
2. **`boundary.external` labels a LOCAL file.** SQLite is in-process, so nothing
   crosses a network. The boundary that matters here is *process → durable
   store*, not *process → network*. The token name still assumes the network
   reading; the zone label carries the correction.
3. **No `edge.stop` equivalent for a refusal that is also a success.** A
   `blocked` verdict is the system working correctly, not a failure. Used
   `edge.stop` for its colour semantics (a path that terminates), and named the
   target node `stdout — refusal` so the red is not read as an error.
4. **`component.artifact` covers both a database file and a stdout stream.**
   The vocabulary has no token for "terminal output". Reused
   `component.artifact`; a `component.stream` token would be the honest fix.
