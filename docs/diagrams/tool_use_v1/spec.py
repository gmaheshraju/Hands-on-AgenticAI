"""Spec — 10-tool-use, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
    "id":      "hoa_tool_use_v1",
    "name":    "10 Tool Use — SQL Analytics Agent Architecture",
    "desc":    "A text-to-SQL agent whose security boundary is a code-enforced SQL validator, not a "
               "prompt: CLI question, LLM seam, ten-check permission gate, EXPLAIN-based cost "
               "estimate, better-sqlite3 execution against a seeded local file, and the two stdout "
               "outcomes. Every element cites a source line in FACTS.md.",
    "theme":   "hoa-default.json",
    "drawio":  "HOA_ToolUse_v1.drawio",
    "svg":     "tool-use.svg",
    "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_entry", "③ Entry (CLI)", "boundary.datasource",                              40, 216, 176, 128),
 ("z_proc",  "① 10-tool-use process (Node ESM)", "boundary.primary",             280,  96, 1016, 680),
 ("z_flow",  "② agent.ask() — ONE attempt, steps in code order", "boundary.functional",
                                                                                 496, 200, 760, 264),
 ("z_data",  "④ Durable store — SQLite, local file", "boundary.external",
                                                                                1360, 232, 296, 288),
 ("z_out",   "⑤ Terminal outcomes (stdout)", "boundary.observability",           1360, 584, 296, 176),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_cli", "component.entry",
  "<b>demo.js</b><br>npm run demo<br>3 parts · :32", 64, 248, 128, 64),

 ("n_ask", "component.service",
  "<b>agent.ask(question)</b><br>retry loop · 4 tries<br>agent.js:239 :258", 304, 248, 160, 64),

 ("n_llm", "component.agent",
  "<b>llm(messages) — mockLLM</b><br>19 patterns + default<br>agent.js:62 · seam :223",
  520, 248, 176, 64),

 ("n_perm", "component.service",
  "<b>validateQuery()</b><br>3 tiers, deny-default<br>permissions.js:144", 776, 248, 176, 64),

 ("n_exec", "component.service",
  "<b>db.prepare(sql).all()</b><br>better-sqlite3 · timed<br>agent.js:297 :296", 1032, 248, 176, 64),

 ("n_cost", "component.service",
  "<b>estimateQueryCost()</b><br>EXPLAIN QUERY PLAN<br>permissions.js:329", 776, 368, 176, 56),

 ("n_fmt", "component.service",
  "<b>formatResult(rows)</b><br>table / scalar / meta<br>formatter.js:116", 1032, 368, 176, 56),

 ("n_dbmod", "component.service",
  "<b>database.js</b><br>openDatabase :321 (WAL, FK on)<br>getSchemaContext :350"
  "<br>getAllowedTables :396", 1384, 260, 248, 72),

 ("n_db", "component.artifact",
  "<b>analytics.db</b><br>SQLite · users products<br>orders events · 15,020 rows"
  "<br>database.js:13 · seeded :330", 1384, 372, 248, 72),

 ("n_out", "component.artifact",
  "<b>stdout — success</b><br>table + query metadata<br>demo.js:99-101", 1384, 612, 248, 56),

 ("n_deny", "component.artifact",
  "<b>stdout — refusal</b><br>PERMISSION DENIED :281<br>CONFIRMATION REQUIRED :286",
  1384, 684, 248, 56),

 ("card_gate", "card.invariant",
  "<b>validateQuery() — EVERY check, in code order · permissions.js:144</b><br>"
  "BLOCK 1 multiple statements ';' :153 · 2 first keyword not SELECT :165<br>"
  "BLOCK 3 destructive keyword x14 :177-192 · 4 metadata table x6 :207<br>"
  "BLOCK 5 load_extension :229 · 6 table not in allowedTables :241-257<br>"
  "BLOCK 7 subquery depth > 2 :261 · 8 UNION + constant :274-287<br>"
  "CONFIRM 9 over 3 JOINs :296 · 10 no WHERE clause :300 (one result :304)<br>"
  "ALLOW  fall-through only :316 — first match wins; order is load-bearing",
  304, 496, 456, 112),

 ("card_deny", "card.failure",
  "<b>DENY LISTS — complete, in declaration order</b><br>"
  "destructive :178-191 — INSERT UPDATE DELETE DROP ALTER CREATE<br>"
  "TRUNCATE REPLACE EXEC ATTACH DETACH PRAGMA GRANT REVOKE  (14)<br>"
  "metadata :208-213 — information_schema sqlite_master sqlite_schema<br>"
  "sqlite_temp_master pg_catalog pg_tables  (6) · load_extension :229<br>"
  "allowedTables database.js:397 — users products orders events  (4)",
  304, 632, 456, 96),

 ("card_attempt", "card.primitive",
  "<b>ONE ask() ATTEMPT — 4 steps in code order · agent.js:258-323</b><br>"
  "1 llm(messages) :264 — md fences + trailing ';' stripped :266 :268<br>"
  "2 validateQuery(sql, allowedTables) :277<br>"
  "      !allowed -> 'PERMISSION DENIED', return :280-283<br>"
  "      needsConfirm and !autoConfirm -> return :285-288 — never retried<br>"
  "3 estimateQueryCost(db, sql) :291 — EXPLAIN QUERY PLAN :331<br>"
  "4 db.prepare(sql).all() :297 — timed by performance.now() :296<br>"
  "      on throw -> errors.push :313 + retry prompt appended :317-321<br>"
  "<br>"
  "<b>4 ATTEMPTS MAX</b> — attempt = 0..maxRetries, default 3 :227 :258<br>"
  "exhausted -> 'Failed after N attempts' + error list :327-334<br>"
  "<br>"
  "<b>AgentResult envelope — 10 fields · agent.js:206-215</b><br>"
  "success · question · sql · rows · formatted · permission<br>"
  "cost · attempts · errors · executionTimeMs",
  792, 496, 456, 232),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_ask",   "n_cli",   "n_ask",  "question (natural language)", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_llm",   "n_ask",   "n_llm",  "messages[] · system + user",  "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_perm",  "n_llm",   "n_perm", "raw SQL",                     "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_exec",  "n_perm",  "n_exec", "allowed",                     "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_cost",  "n_perm",  "n_cost", "sql :291",                    "edge.call",    (0.5, 1), (0.5, 0), []),
 ("e_fmt",   "n_exec",  "n_fmt",  "rows :303",                   "edge.primary", (0.5, 1), (0.5, 0), []),

 ("e_db",    "n_exec",  "n_db",   "prepared statement", "edge.call", (1, 0.5), (0, 0.5),
  [(1336, 280), (1336, 408)]),

 ("e_plan",  "n_cost",  "n_db",   "EXPLAIN QUERY PLAN", "edge.call", (0.5, 1), (0.5, 1),
  [(864, 476), (1508, 476)]),

 ("e_out",   "n_fmt",   "n_out",  "formatted string", "edge.artifact", (1, 0.5), (0, 0.5),
  [(1312, 396), (1312, 640)]),

 ("e_deny",  "n_perm",  "n_deny", "blocked / needs confirm", "edge.stop", (0.25, 1), (0.5, 1),
  [(820, 336), (772, 336), (772, 756), (1508, 756)]),

 ("e_schema", "n_dbmod", "n_llm", "schemaContext -> system prompt", "edge.data_in", (0.5, 0), (0.5, 0),
  [(1508, 168), (608, 168)]),

 ("e_seed",  "n_dbmod", "n_db",   "createSchema + seed if empty", "edge.data_in", (0.5, 1), (0.5, 0), []),
]
