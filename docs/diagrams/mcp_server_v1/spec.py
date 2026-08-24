"""Spec — 15-mcp-server, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
 "id": "hoa_mcp_server_v1",
 "name": "15 MCP Server + Client — Architecture",
 "desc": "Two OS processes joined by one pipe: three client programs share a Client that "
 "spawns node server.js as a child and speaks JSON-RPC 2.0 over its stdio, and a "
 "sqlite-explorer server whose whole declared surface is 3 tools and 2 resources "
 "over one shared SQLite handle. Every element cites a source line in FACTS.md.",
 "theme": "hoa-default.json",
 "drawio": "HOA_McpServer_v1.drawio",
 "svg": "mcp-server.svg",
 "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_entry", "③ Entry — 3 npm scripts", "boundary.datasource",
 32, 184, 192, 272),
 ("z_client", "① MCP CLIENT process (Node ESM)", "boundary.primary",
 288, 200, 240, 264),
 ("z_server", "② MCP SERVER process — spawned child, stdio", "boundary.external",
 592, 152, 552, 344),
 ("z_caps", "declared capability surface — all of it", "boundary.functional",
 872, 184, 240, 288),
 ("z_data", "④ Durable store — SQLite, local file", "boundary.observability",
 1208, 232, 304, 320),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_demo", "component.entry",
 "<b>demo.js</b><br>scripted 5-step run<br>demo()", 48, 208, 160, 56),

 ("n_cli", "component.entry",
 "<b>client.js</b><br>interactive REPL<br>11 commands", 48, 292, 160, 56),

 ("n_agent", "component.entry",
 "<b>agent.js</b><br>NL question -&gt; plan<br>planToolCalls", 48, 376, 160, 56),

 ("n_client", "component.service",
 "<b>Client (MCP SDK)</b><br>StdioClientTransport<br>spawns node server.js"
 "<br>client.js", 312, 272, 176, 96),

 ("n_log", "component.mock",
 "<b>protocol logger</b><br>raw JSON-RPC to stdout<br>client.js", 312, 384, 176, 56),

 ("n_mcp", "component.agent",
 "<b>McpServer</b><br>&quot;sqlite-explorer&quot; 1.0.0<br>StdioServerTransport"
 "<br>server.js", 624, 272, 176, 96),

 ("n_query", "component.service",
 "<b>TOOL query</b><br>read-only SELECT gate<br>4 blocks &middot; server.js", 896, 208, 192, 64),

 ("n_meta", "component.service",
 "<b>TOOLS list_tables</b><br>+ describe_table<br>server.js", 896, 288, 192, 64),

 ("n_res", "component.service",
 "<b>RESOURCES</b><br>db://schema<br>db://stats", 896, 384, 192, 64),

 ("n_stderr", "component.mock",
 "<b>stderr diagnostics</b><br>stdout is reserved<br>for protocol", 624, 424, 176, 56),

 ("n_dbmod", "component.service",
 "<b>database.js</b><br>getDatabase -&gt; create<br>seedDatabase, idempotent"
 "<br>5 tables + 4 indexes", 1232, 272, 256, 96),

 ("n_db", "component.artifact",
 "<b>ecommerce.db</b><br>SQLite, WAL &middot; path<br>8 cat, 50 users, 30 products"
 "<br>200 orders, 1-5 items each", 1232, 440, 256, 80),

 ("card_gate", "card.invariant",
 "<b>query TOOL — EVERY GUARD, IN CODE ORDER &middot; server.js</b><br>"
 "trimmed = sql.trim().toUpperCase()<br>"
 "1 must start with SELECT — else refusal<br>"
 "withoutStrings = literals blanked — checks 2-4 run on this copy<br>"
 "2 split on ';', more than one statement — refusal<br>"
 "3 17 blocked keywords, anywhere incl. subqueries — refusal<br>"
 "4 SQL comments -- or /* — refusal<br>"
 "then effectiveLimit = min(limit || 100, 1000)<br>"
 " LIMIT appended when the SQL has none<br>"
 " db.prepare(execSql).all() -&gt; { rowCount, rows }<br>"
 "catch -&gt; { error } + isError — the handler never throws",
 288, 512, 456, 160),

 ("card_deny", "card.failure",
 "<b>BLOCKED KEYWORDS — all 17, in regex order &middot; server.js</b><br>"
 "DROP &middot; ALTER &middot; CREATE &middot; DELETE &middot; INSERT &middot; UPDATE &middot; TRUNCATE<br>"
 "REPLACE &middot; EXEC &middot; EXECUTE &middot; GRANT &middot; REVOKE &middot; ATTACH &middot; DETACH<br>"
 "PRAGMA &middot; REINDEX &middot; VACUUM case-insensitive, word-boundary<br>"
 "4 refusals in query, 1 in describe_table<br>"
 "every one is a normal MCP result carrying isError — not an exception",
 288, 688, 456, 88),

 ("card_surface", "card.primitive",
 "<b>MCP SURFACE — the complete declared set &middot; server.js</b><br>"
 "TOOL query(sql, limit? = 100, capped at 1000)<br>"
 "TOOL list_tables() — no params<br>"
 "TOOL describe_table(table_name)<br>"
 "RES db://schema application/json<br>"
 "RES db://stats application/json<br>"
 "these 5 and nothing else — no server.prompt() exists in src/<br>"
 "client learns them at runtime: listTools, listResources",
 776, 592, 456, 116),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_demo", "n_demo", "n_client", "scripted calls", "edge.primary", (1, 0.5), (0, 0.25),
 [(240, 236), (240, 296)]),
 ("e_cli", "n_cli", "n_client", "REPL command", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_agent", "n_agent", "n_client", "planned tool call", "edge.primary", (1, 0.5), (0, 0.75),
 [(264, 404), (264, 344)]),

 ("e_log", "n_client", "n_log", "every send / recv", "edge.artifact", (0.5, 1), (0.5, 0), []),

 ("e_rpc", "n_client", "n_mcp", "JSON-RPC 2.0 over stdio",
 "edge.primary", (1, 0.5), (0, 0.5), []),

 ("e_q", "n_mcp", "n_query", "tools/call query", "edge.primary", (1, 0.25), (0, 0.5),
 [(848, 296), (848, 240)]),
 ("e_m", "n_mcp", "n_meta", "tools/call metadata", "edge.call", (1, 0.5), (0, 0.5), []),
 ("e_r", "n_mcp", "n_res", "resources/read", "edge.call", (1, 0.75), (0, 0.5),
 [(848, 344), (848, 416)]),

 ("e_stderr", "n_mcp", "n_stderr", "console.error", "edge.artifact", (0.5, 1), (0.5, 0), []),

 ("e_qdb", "n_query", "n_dbmod", "prepared SELECT", "edge.primary",
 (1, 0.5), (0.25, 0), [(1296, 240)]),
 ("e_mdb", "n_meta", "n_dbmod", "sqlite_master + PRAGMA", "edge.call", (1, 0.5), (0, 0.5), []),
 ("e_rdb", "n_res", "n_dbmod", "COUNT(*) + page_count", "edge.call",
 (1, 0.5), (0.75, 1), [(1424, 416)]),

 ("e_file", "n_dbmod", "n_db", "open + seed if empty", "edge.artifact", (0.25, 1), (0.25, 0), []),
]
