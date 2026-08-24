# FACTS — 15-mcp-server (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/15-mcp-server/src/`, n=5 files, 1544 lines
(`client.js` 327, `database.js` 258, `server.js` 355, `demo.js` 304, `agent.js` 300).
**Every element in the diagram appears below with a `file:line` citation. The
diagram may contain nothing that is not on this page, and this page may contain
nothing without a citation.** The project README ships two ASCII diagrams
(README.md:9-19, :32-47); both were treated as CLAIMS, not evidence — every fact
below was read from source. Two README claims did not survive that reading; they
are recorded under *README claims corrected* at the end.

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
process boundary), per `DIAGRAM_RULES.md`. The JSON-RPC message ordering
(initialize → initialized → tools/list → tools/call → resources/read) is **time**,
i.e. L2b, and is deliberately NOT drawn here.

The defining structural fact of this project: **there are two OS processes.** The
client spawns `node src/server.js` as a child and speaks JSON-RPC 2.0 over its
stdin/stdout. Everything else in the diagram hangs off that seam.

---

## ③ Entry — three client-side programs, one protocol

All three are separate `npm` scripts (`package.json` scripts block, lines 7-11:
`server`, `client`, `agent`, `demo`, `seed`) and each builds its own MCP client.

| Fact | Citation |
|---|---|
| `demo.js` — non-interactive scripted walkthrough, `async function demo()` | demo.js:69 |
| demo spawns the server and connects | demo.js:97-100, :107 |
| `client.js` — interactive REPL, `interactiveMode()` | client.js:189, loop :211 |
| REPL advertises **11 commands** (one `console.log` per command) | client.js:199-209 |
| REPL dispatch is a `switch` on the first token | client.js:216, :220 |
| `agent.js` — natural-language question → MCP tool calls, `runAgent()` | agent.js:208 |
| Agent plans with a rule-based planner, no LLM | agent.js:42 (`planToolCalls`), stated :10 |
| Agent executes the plan step by step through the MCP client | agent.js:251, :260, :264 |
| Agent synthesises a text answer from tool results | agent.js:162, called :286 |

## ① MCP client process — `Client` + `StdioClientTransport`

| Fact | Citation |
|---|---|
| `StdioClientTransport({ command: "node", args: [serverPath] })` — the client **spawns the server as a child process** | client.js:59-62, agent.js:211-214, demo.js:97-100 |
| `serverPath` resolves to `src/server.js` next to the caller | client.js:57, agent.js:210, demo.js:96 |
| `new Client({ name, version })` | client.js:64, agent.js:216, demo.js:102 |
| `await client.connect(transport)` — handshake | client.js:75, agent.js:221, demo.js:107 |
| Discovery: `client.listTools()` / `client.listResources()` | client.js:93, :121 |
| Invocation: `client.callTool({ name, arguments })` | client.js:142, agent.js:264, demo.js:197 |
| Resource read: `client.readResource({ uri })` | client.js:168, demo.js:266 |
| Session ends with `client.close()` | client.js:320, agent.js:291, demo.js:295 |

### Protocol logger (client-side observability)

| Fact | Citation |
|---|---|
| `createProtocolLogger()` — counts and prints every message | client.js:25 |
| Prints direction arrow + sequence number to **stdout** | client.js:35 |
| Prints the JSON payload indented under the header | client.js:37-40 |
| Message count reported at session end | client.js:43, :319 |

## ② MCP server process — `sqlite-explorer`

| Fact | Citation |
|---|---|
| `new McpServer({ name: "sqlite-explorer", version: "1.0.0", ... })` | server.js:29-33 |
| Transport is stdio: `new StdioServerTransport()` then `server.connect(transport)` | server.js:342, :343 |
| Database handle opened **once at module load**, shared by every handler | server.js:25 |
| Diagnostics go to **stderr** — "stdout is reserved for MCP protocol messages" | server.js:345, :346-349 |
| Fatal error path: log to stderr and `process.exit(1)` | server.js:352-355 |

### INVARIANT CARD 1 — `query` tool: every guard, in code order

The handler is `async ({ sql, limit })`, server.js:49-136. **First match wins and
the order is load-bearing:** the SELECT prefix check runs on the uppercased string,
the next three run on a copy with string literals blanked out, so a keyword hidden
inside quotes cannot be smuggled past check 3.

| # | Guard | Citation |
|---|---|---|
| — | `trimmed = sql.trim().toUpperCase()` | server.js:51 |
| 1 | must start with `SELECT` → refusal, `isError: true` | server.js:54, :63 |
| — | `withoutStrings = sql.replace(/'[^']*'/g, '""')` — literals blanked | server.js:68 |
| 2 | split on `;`, more than one statement → refusal | server.js:69, :70, :78 |
| 3 | 17 blocked keywords, matched anywhere incl. subqueries → refusal | server.js:83, :84, :92 |
| 4 | SQL comments `--` or `/*` → refusal | server.js:97, :106 |
| — | `effectiveLimit = Math.min(limit \|\| 100, 1000)` | server.js:110 |
| — | `LIMIT <n>` appended when the SQL has none | server.js:113, :114 |
| — | `db.prepare(execSql).all()` → `{ rowCount, rows }` | server.js:117, :121-124 |
| — | `catch` → `{ error: err.message }`, `isError: true` — never throws | server.js:127-134 |

### INVARIANT CARD 2 — the blocked-keyword list, all 17, in regex order

Declared as one case-insensitive word-boundary regex at server.js:83, applied at
server.js:84:

`DROP` · `ALTER` · `CREATE` · `DELETE` · `INSERT` · `UPDATE` · `TRUNCATE` ·
`REPLACE` · `EXEC` · `EXECUTE` · `GRANT` · `REVOKE` · `ATTACH` · `DETACH` ·
`PRAGMA` · `REINDEX` · `VACUUM`

Four refusal shapes exist in the `query` handler, all returned as **normal MCP
results** carrying `isError: true` — never as a thrown exception:
server.js:63, :78, :92, :106. `describe_table` adds a fifth, for an unknown table:
server.js:187-197.

### INVARIANT CARD 3 — the MCP surface: 3 tools + 2 resources, complete

| Kind | Name / URI | Parameters | Citation |
|---|---|---|---|
| Tool | `query` | `sql: string`, `limit?: number` default 100, capped at 1000 | server.js:42, :46, :47, cap :110 |
| Tool | `list_tables` | none (`{}`) | server.js:143, :146, :147 |
| Tool | `describe_table` | `table_name: string` | server.js:174, :177, :178 |
| Resource | `db://schema` | `application/json` — CREATE TABLEs + indexes | server.js:258, :260, :262-263 |
| Resource | `db://stats` | `application/json` — row counts + page-derived size | server.js:299, :301, :302-303 |

These five are the entire declared surface — `grep -n "server.tool(\|server.resource("
src/server.js` returns exactly lines 42, 143, 174, 258, 299 and nothing else.
The client learns them at runtime via `listTools()` (client.js:93) and
`listResources()` (client.js:121).

### What each handler reads

| Handler | Reads | Citation |
|---|---|---|
| `query` | arbitrary caller SELECT, after the guard chain | server.js:117 |
| `list_tables` | `sqlite_master` + a `COUNT(*)` per table | server.js:148-150, :153 |
| `describe_table` | existence check, then `PRAGMA table_info`, `foreign_key_list`, `index_list`, 5 sample rows, `COUNT(*)` | server.js:183-185, :200, :203, :206, :209, :212 |
| `db://schema` | `sqlite_master` tables **and** indexes | server.js:266-268, :270-272 |
| `db://stats` | per-table `COUNT(*)`, then `page_count` × `page_size` | server.js:311-313, :319-321 |

## ④ Durable store — `database.js` and the SQLite file

| Fact | Citation |
|---|---|
| `getDatabase()` = `createDatabase()` then `seedDatabase()` | database.js:239, :240, :241 |
| `createDatabase()` opens `better-sqlite3` at `DB_PATH` | database.js:101, :102 |
| `DB_PATH` = `<project>/ecommerce.db` (one level above `src/`) | database.js:20 |
| WAL journal mode enabled for concurrent reads | database.js:105 |
| Schema: 5 tables + 4 indexes, created `IF NOT EXISTS` in one `db.exec` | database.js:108-153 |
| Tables: `categories` :109, `users` :116, `products` :124, `orders` :133, `order_items` :141 | database.js:109, :116, :124, :133, :141 |
| Indexes: `idx_orders_user`, `idx_orders_status`, `idx_items_order`, `idx_products_cat` | database.js:149-152 |
| Seeding is **idempotent** — returns early if `categories` is non-empty | database.js:160, :161 |
| Seed volumes: 8 categories, 50 users, 30 products, 200 orders, 1-5 items each | database.js:40-49 (8), :191 (50), :51-82 (30), :212 (200), :221 |
| All seeding runs inside one transaction | database.js:179, :235 |
| `database.js` is also runnable directly as a seeding CLI | database.js:246-257 |

## Artifacts / outputs

| Output | Written by | Citation |
|---|---|---|
| `ecommerce.db` (+ WAL files) | `createDatabase` / `seedDatabase` | database.js:20, :102, :105 |
| stdout — protocol log and results | client protocol logger | client.js:35, :153 |
| stderr — server diagnostics (stdout is the protocol channel) | server.js:345-349 |

---

## Deliberately NOT drawn (L1 scope discipline)

- **The JSON-RPC message sequence** (initialize → notifications/initialized →
  tools/list → resources/list → tools/call → resources/read), narrated in
  demo.js:85-125, :134-150, :162-179, :192-195, :229-232, :261-264 and in the
  README's second ASCII block. That is ordering over time — **L2b**, per
  `DIAGRAM_RULES_LLD.md`. This diagram shows the pipe, not the conversation.
- **The 14 planner branches** of `agent.js:42-159` (13 pattern rules, first match
  wins, plus the unconditional `list_tables` fallback at :159). That is a decision
  table inside one node — L2, not space.
- The REPL command switch body (client.js:220-290) and the answer formatter
  (agent.js:162-204): function-level detail.
- The seed corpora themselves (`FIRST_NAMES` :24, `LAST_NAMES` :34, `CATEGORIES`
  :40, `PRODUCTS` :51) — data, not structure.

## README claims corrected by reading the source

1. The README's core-concepts table advertises **Prompts** as a capability
   (README.md:27) and the first ASCII block lists "Capabilities: Tools /
   Resources / Prompts" (README.md:14-17). **No prompt is registered.** There is
   no `server.prompt(` call anywhere in `src/`; the declared surface is exactly
   3 tools + 2 resources (server.js:42, :143, :174, :258, :299). The diagram
   draws what exists.
2. The README's tool sketch (README.md:145-155) shows the handler as
   `db.prepare(sql).all()` with no validation. The real handler runs a four-check
   guard chain before it ever reaches `prepare` (server.js:54, :70, :84, :97).
   That gate is the most load-bearing element on the page, and the README omits it.

## Portability notes — rules that needed bending for this codebase

Recorded because "rules bent per new domain" is the harness's portability metric.

1. **`component.mock` was re-purposed, because nothing here is a mock.** Unlike
   `03-agent-harness`, nothing is simulated — the SQLite file is real and the
   child process is real. The token's grey is the only "this is off the critical
   path" colour in the theme, so it carries the two diagnostic streams (client
   protocol logger client.js:25, server stderr server.js:345-349). That is a
   colour borrowed for a meaning it does not name. The vocabulary wants a
   `component.diagnostic`.
2. **`boundary.external` describes an in-machine child process.** The strongest
   boundary in this system is a *process* boundary, not a network one. Used
   `boundary.external` for the spawned server and said "spawned child process,
   stdio" in the label so the reader is not misled into thinking it is remote.
   The vocabulary wants a `boundary.process` token.
3. **`component.artifact` fits only the durable half.** `ecommerce.db` is a real
   file and takes the token cleanly; the two terminal streams are outputs too but
   are not artifacts in any retrievable sense, so they did not get it (see note 1).
4. **`edge.stop` did not generalise.** In `03-agent-harness` it marked loop
   termination. Here the analogous thing — a guard refusing a query — is not a
   stop but a *returned value*, because MCP refusals are ordinary results
   (server.js:63). Left the token unused and put the refusals in a card instead.
