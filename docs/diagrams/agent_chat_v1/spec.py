"""Spec — 31-agent-chat, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
    "id":      "hoa_agent_chat_v1",
    "name":    "31 Agent Chat — Decision-Quality Observability for an LLM Agent",
    "desc":    "A single Node process serves a streaming LLM agent whose headline feature is "
               "decision-quality observability: an AgentObserver scores every decision (not every "
               "span) and writes a per-run report card to SQLite. Browser and upstream providers are "
               "the two external surfaces; the pipeline lives in one async generator. Every element "
               "cites a source line in FACTS.md.",
    "theme":   "hoa-default.json",
    "drawio":  "HOA_AgentChat_v1.drawio",
    "svg":     "agent-chat.svg",
    "w": 1700, "h": 1000, "svg_h": 820,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_client", "③ Browser — untrusted client tier (HTTP + SSE)", "boundary.external",
   40, 208, 200, 344),
 ("z_proc",   "① Express server process — Node ESM, no framework", "boundary.primary",
   320, 96, 976, 700),
 ("z_pipe",   "runAgent() — per-message agent pipeline (async generator)", "boundary.functional",
   568, 200, 712, 336),
 ("z_net",    "② Upstream network — real fetch() calls", "boundary.external",
   1360, 96, 296, 288),
 ("z_data",   "④ SQLite persistence (WAL + FTS5)", "boundary.datasource",
   1360, 452, 296, 176),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 # ── Browser tier ──
 ("n_ui", "component.entry",
  "<b>Chat UI</b><br>SSE client · app.js<br>EventSource :401", 56, 264, 176, 64),
 ("n_inspector", "component.entry",
  "<b>Run Inspector</b><br>report-card modal<br>showTrace :812", 56, 400, 176, 64),

 # ── Server: front door + streams ──
 ("n_server", "component.service",
  "<b>Express server</b><br>routes · CSP · limits<br>server.js :135", 352, 264, 176, 64),
 ("n_streams", "component.service",
  "<b>StreamManager</b><br>buffer + SSE replay<br>streams.js :29", 352, 424, 176, 64),

 # ── Pipeline (functional boundary) ──
 ("n_guardrails", "component.service",
  "<b>Guardrails</b><br>block inject · redact<br>guardrails.js :10", 592, 264, 176, 64),
 ("n_agent", "component.agent",
  "<b>runAgent()</b><br>reason ≤8 → answer<br>agent.js:9 :234", 844, 264, 176, 64),
 ("n_llm", "component.service",
  "<b>LLMAdapter</b><br>chat/stream · JSON-retry<br>llm.js:18 :75", 1096, 264, 176, 64),
 ("n_observer", "component.service",
  "<b>AgentObserver</b><br>5 scores → report card<br>tracer.js:3 :60", 592, 424, 176, 64),
 ("n_tools", "component.service",
  "<b>Tools · executeTool</b><br>wiki search/read · calc<br>tools.js:3 :72", 1096, 424, 176, 64),

 # ── Upstream network ──
 ("n_providers", "component.external",
  "<b>LLM providers</b><br>Ollama NDJSON · NVIDIA/Gemini SSE<br>llm.js:103 :128 :163", 1384, 168, 248, 72),
 ("n_wiki", "component.external",
  "<b>Wikipedia API</b><br>opensearch + REST summary<br>tools.js:8 :27", 1384, 288, 248, 64),

 # ── Persistence ──
 ("n_db", "component.artifact",
  "<b>SQLite · WAL + FTS5</b><br>threads · messages(tree) · runs<br>decisions · feedback · facts<br>db.js:7 (shared store)",
  1384, 512, 248, 80),

 # ── Cards ──
 ("card_scores", "card.invariant",
  "<b>FIVE SCORES PER RUN · tracer.js end() :60</b><br>"
  "1 Tool ROI = used ÷ tool decisions :72<br>"
  "&nbsp;&nbsp;&nbsp;n-gram overlap ≥ 0.15 ⇒ used :124 :150<br>"
  "2 Coherence = consec-thought terms :74<br>"
  "&nbsp;&nbsp;&nbsp;≥ 2 shared terms ⇒ coherent :167<br>"
  "3 Productivity: productive | wasted :68 :69<br>"
  "&nbsp;&nbsp;&nbsp;respond OR result used ⇒ productive :141<br>"
  "4 Confidence signals (from thought) :183<br>"
  "&nbsp;&nbsp;&nbsp;hedging·confident·uncertain·<br>"
  "&nbsp;&nbsp;&nbsp;seeking_info·ready_to_answer :189<br>"
  "5 Strategy :173<br>"
  "&nbsp;&nbsp;&nbsp;direct·single_tool·multi_tool·iterative<br>"
  "→ persisted: agent_runs + decisions :86 :78",
  344, 560, 296, 224),

 ("card_guard", "card.failure",
  "<b>GUARDRAILS — block in, redact both ways</b><br>"
  "scanInput() :10<br>"
  "&nbsp;&nbsp;16 injection regex → block :40<br>"
  "&nbsp;&nbsp;5 PII types redacted :34<br>"
  "&nbsp;&nbsp;&nbsp;card·ssn·email·phone·apikey :70<br>"
  "&nbsp;&nbsp;blocked ⇒ canned reply :41<br>"
  "scanOutput() :60<br>"
  "&nbsp;&nbsp;same 5 PII masked on answer :72<br>"
  "&nbsp;&nbsp;2 disclaimer patterns flagged :76<br>"
  "one audit_log row per scan :45",
  664, 560, 296, 160),

 ("card_limits", "card.primitive",
  "<b>PRODUCTION LIMITS — safe to expose publicly</b><br>"
  "rate/IP: 300 read · 20 write per min :113<br>"
  "20 concurrent runs → 503 :91<br>"
  "message &gt; 8000 chars → 413 :86<br>"
  "JSON body ≤ 64 kb :103<br>"
  "CSP + 5 security headers :26<br>"
  "graceful drain + WAL checkpoint :380",
  984, 560, 296, 136),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 # ── client ↔ server ──
 ("e_post",  "n_ui",        "n_server", "POST message", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_sse",   "n_streams",   "n_ui",     "SSE tokens",   "edge.primary", (0, 0.5), (1, 0),
   [(292, 456), (292, 264)]),
 ("e_runs",  "n_inspector", "n_server", "GET /api/runs","edge.call",    (1, 0.5), (0, 1),
   [(264, 432), (264, 328)]),

 # ── server → pipeline + streams ──
 ("e_run",     "n_server", "n_guardrails", "runAgent()",  "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_srv_str", "n_server", "n_streams",    "emit events", "edge.primary", (0.5, 1), (0.5, 0), []),

 # ── pipeline spine (left → right) ──
 ("e_gna", "n_guardrails", "n_agent", "input ok",       "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_al",  "n_agent",      "n_llm",   "reason + answer","edge.primary", (1, 0.5), (0, 0.5), []),

 # ── agent branches ──
 ("e_at", "n_agent", "n_tools",    "executeTool", "edge.call", (0.75, 1), (0.5, 0),
   [(976, 392), (1184, 392)]),
 ("e_ao", "n_agent", "n_observer", "record / end","edge.call", (0.25, 1), (0.5, 0),
   [(888, 392), (680, 392)]),

 # ── crossing the process boundary to upstream + store ──
 ("e_llm_prov", "n_llm",      "n_providers", "chat / stream", "edge.primary", (1, 0.5), (0, 0.5),
   [(1328, 296), (1328, 204)]),
 ("e_tw",       "n_tools",    "n_wiki",      "fetch",         "edge.call",    (1, 0.5), (0, 0.5),
   [(1328, 456), (1328, 320)]),
 ("e_od",       "n_observer", "n_db",        "agent_runs + decisions", "edge.artifact", (0.5, 1), (0, 0.5),
   [(680, 520), (1328, 520), (1328, 552)]),
]
