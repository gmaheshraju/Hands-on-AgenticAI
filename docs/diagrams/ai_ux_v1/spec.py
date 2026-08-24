"""Spec — 12-ai-ux, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
 "id": "hoa_ai_ux_v1",
 "name": "12 AI UX — Production Chat Trust Signals — Architecture",
 "desc": "A vanilla-JS browser client and an Express server joined by one SSE connection per "
 "message: the scenario router, the event pump and its eight event types, the HITL "
 "park that holds the connection open on a Promise, the stop path, and the single "
 "durable artifact (browser localStorage). Every element cites a source line in FACTS.md.",
 "theme": "hoa-default.json",
 "drawio": "HOA_AiUx_v1.drawio",
 "svg": "ai-ux.svg",
 "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_client", "③ Browser — vanilla JS, no bundler, no framework", "boundary.datasource",
 40, 192, 240, 272),
 ("z_server", "① Express server process — Node ESM · express 4 · all state in memory",
 "boundary.primary", 344, 96, 952, 676),
 ("z_stream", "② One SSE connection per messageId — held open across HITL",
 "boundary.functional", 384, 176, 872, 184),
 ("z_agent", "④ Mock agent module — in-process, scripted, no LLM and no network",
 "boundary.external", 1360, 152, 296, 336),
 ("z_out", "⑤ Durable state (the only one)", "boundary.observability",
 40, 560, 240, 136),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_client", "component.entry",
 "<b>chat.js</b><br>EventSource · 8 events<br>", 72, 232, 176, 64),
 ("n_render", "component.entry",
 "<b>Trust renderers</b><br>confidence<br>citation hitl<br>error cards",
 72, 376, 176, 64),

 ("n_stream", "component.service",
 "<b>GET /api/chat/stream</b><br>SSE handler · send()<br>server.js", 416, 232, 176, 64),
 ("n_match", "component.agent",
 "<b>matchScenario()</b><br>first regex wins<br>agent.js", 720, 232, 176, 64),
 ("n_pump", "component.service",
 "<b>event pump</b><br>for/switch · 6 cases<br>server.js", 1024, 232, 176, 64),

 ("n_hitl", "component.service",
 "<b>POST hitl/resolve</b><br>wakes the Promise<br>server.js", 416, 400, 176, 64),
 ("n_stop", "component.service",
 "<b>POST chat/stop</b><br>sets aborted = true<br>server.js", 720, 400, 176, 64),
 ("n_state", "component.service",
 "<b>in-memory Maps</b><br>activeStreams<br>pendingApprovals", 1024, 400, 176, 64),

 ("n_scen", "component.external",
 "<b>SCENARIOS — 8 builders</b><br>scripted arrays · no LLM call<br>agent.js",
 1388, 232, 240, 64),
 ("n_sources", "component.mock",
 "<b>SOURCES — 5 mock docs</b><br>title · url · passage<br>agent.js · no network",
 1388, 320, 240, 64),
 ("n_cont", "component.external",
 "<b>getHITLContinuation()</b><br>approved / rejected branches<br>agent.js",
 1388, 408, 240, 64),

 ("n_storage", "component.artifact",
 "<b>localStorage</b><br>chat_history_v1<br>chat.js", 72, 604, 176, 64),

 ("card_events", "card.invariant",
 "<b>SSE EVENT TYPES — all 8, in first-emission order · server.js</b><br>"
 "1 stream_start · 2 stream_stop<br>"
 "3 thinking · 4 token (text + confidence)<br>"
 "5 citation · 6 hitl_request<br>"
 "7 done · 8 error<br>"
 "client also listens 'error_event' — no server emitter",
 384, 520, 424, 92),

 ("card_router", "card.primitive",
 "<b>SCENARIO ROUTER — 8 entries, first match wins · agent.js</b><br>"
 "1 refund_policy /refund|return|money back/i<br>"
 "2 send_email · 3 database_query — the two HITL flows<br>"
 "4 rate_limit · 5 context_long · 6 timeout<br>"
 "7 network_error · 8 default /.*/<br>"
 "loop skips 'default', returns it as fallback",
 832, 520, 424, 92),

 ("card_errors", "card.failure",
 "<b>TYPED ERROR BRANCHES — the complete switch · chat.js</b><br>"
 "1 rate_limit — live countdown; the server itself auto-retries after retry_after s (server.js)<br>"
 "2 context_too_long — Summarize and Continue / Start New Chat<br>"
 "3 timeout — Try Again / Dismiss, prints elapsed seconds<br>"
 "4 network_error — Retry Now; header status flips to Disconnected<br>"
 "5 default — Something Went Wrong / Try Again. Only branch 1 leaves the stream alive.",
 384, 648, 872, 92),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_get", "n_client", "n_stream", "GET ?message&id", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_match", "n_stream", "n_match", "userMessage", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_events","n_match", "n_pump", "events[]", "edge.primary", (1, 0.5), (0, 0.5), []),

 ("e_scen", "n_match", "n_scen", "SCENARIOS[k].events()", "edge.call",
 (0.75, 0), (0.25, 0), [(852, 208), (1448, 208)]),
 ("e_src", "n_pump", "n_sources", "SOURCES.find", "edge.data_in",
 (1, 0.5), (0, 0.5), [(1320, 264), (1320, 352)]),
 ("e_cont", "n_pump", "n_cont", "on resume", "edge.call",
 (0.75, 1), (0, 0.5), [(1156, 376), (1344, 376), (1344, 440)]),

 ("e_sse", "n_pump", "n_render", "SSE frames · send()", "edge.primary",
 (0.25, 1), (0.5, 0), [(1068, 340), (160, 340)]),

 ("e_park", "n_pump", "n_state", "pendingApprovals.set", "edge.data_in",
 (0.5, 1), (0.5, 0), []),

 ("e_hitl", "n_render", "n_hitl", "POST resolve", "edge.call",
 (1, 0.5), (0, 0.5), [(352, 408), (352, 432)]),
 ("e_wake", "n_hitl", "n_state", "resolve({approved, edits})", "edge.call",
 (0.75, 0), (0.25, 0), [(548, 376), (1068, 376)]),

 ("e_stop", "n_render", "n_stop", "POST stop", "edge.stop",
 (0.75, 1), (0.5, 1), [(204, 488), (808, 488)]),
 ("e_abort", "n_stop", "n_state", "aborted = true", "edge.stop", (1, 0.5), (0, 0.5), []),

 ("e_save", "n_render", "n_storage", "setItem", "edge.artifact",
 (0.25, 1), (0.25, 0), []),
]
