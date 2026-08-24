"""Spec — 06-llmops (model router + cost dashboard), L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
    "id":      "hoa_llmops_v1",
    "name":    "06 LLMOps — Model Router & Cost Dashboard",
    "desc":    "A heuristic classifier scores each query, a router walks a per-tier fallback chain "
               "of mock models, every attempt is written to SQLite, and a second process serves "
               "aggregates to a browser dashboard. Every element cites a source line in FACTS.md.",
    "theme":   "hoa-default.json",
    "drawio":  "HOA_LlmOps_v1.drawio",
    "svg":     "llmops.svg",
    "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_entry", "③ Entry — npm run demo (demo.js:74)", "boundary.datasource",       40, 216,  176, 128),
 ("z_proc",  "① 06-llmops — Node ESM + better-sqlite3", "boundary.primary",     280,  96, 1016, 680),
 ("z_flow",  "Write path — one query, classify → route → escalate", "boundary.functional",
                                                                                320, 184,  504, 200),
 ("z_models","② Model layer — MOCK, no network egress", "boundary.external",   1360, 216,  296, 232),
 ("z_out",   "④ Dashboard client — browser", "boundary.observability",         1360, 512,  296, 128),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_demo","component.entry",
  "<b>demo.js</b><br>50 queries :14<br>await route() :82", 64, 248, 128, 64),

 ("n_classify","component.service",
  "<b>classify()</b><br>kw .50 len .30 str .20<br>classifier.js:125 :135", 352, 248, 176, 64),

 ("n_route","component.agent",
  "<b>route()</b><br>router.js:153<br>fallback chain :167<br>3 logRequest sites", 624, 248, 176, 64),

 ("n_mock","component.mock",
  "<b>mockModelCall() :107</b><br>MOCK — no network call<br>0.3 fail rate, len&gt;300 :127", 1384, 248, 240, 64),

 ("n_cfg","component.external",
  "<b>MODEL_CONFIG :19</b><br>5 models · 3 reachable<br>ROUTING_TABLE :64", 1384, 352, 240, 64),

 ("n_log","component.service",
  "<b>logRequest()</b><br>metrics.js:74<br>INSERT · 12 columns", 352, 440, 160, 64),

 ("n_db","component.artifact",
  "<b>metrics.db</b><br>SQLite WAL :14 :21<br>requests table :30", 592, 440, 160, 64),

 ("n_read","component.service",
  "<b>9 read queries</b><br>metrics.js :94-215", 832, 440, 160, 64),

 ("n_server","component.entry",
  "<b>dashboard.js</b><br>http :3000 :69 :80<br>11-key payload :50", 1072, 440, 160, 64),

 ("n_browser","component.external",
  "<b>public/dashboard.html</b><br>fetch /api/metrics :249<br>auto-refresh 10s :404", 1384, 552, 240, 64),

 ("card_route","card.invariant",
  "<b>CLASSIFY → ROUTE — complete table, in code order</b><br>"
  "score = kw×0.50 + len×0.30 + struc×0.20 · classifier.js:135<br>"
  "tier: &lt;0.30 simple · &lt;0.55 medium · else complex :139-141<br>"
  "simple → haiku → sonnet → opus · router.js:65<br>"
  "medium → sonnet → opus · router.js:66<br>"
  "complex → opus, no fallback remains · router.js:67", 320, 540, 456, 92),

 ("card_esc","card.failure",
  "<b>ESCALATION — LOW_QUALITY_SIGNALS, 6 in code order :92</b><br>"
  "1 len &lt; 20 :93 · 2 /i don't know/ :94 · 3 /i'm not sure/ :95<br>"
  "4 /i cannot/ &amp; len&lt;100 :96 · 5 /as an ai/ &amp; len&lt;150 :97<br>"
  "6 endsWith('...') &amp; len&lt;80 :98 — last in chain exempt :178<br>"
  "reason: response_too_short · low_quality_detected :183<br>"
  "error: &lt;err.message&gt; :240 · all_models_exhausted :273", 800, 540, 456, 92),

 ("card_models","card.primitive",
  "<b>MODEL_CONFIG — 5 models in code order, $ per 1K :19</b><br>"
  "haiku · claude-haiku-4-5 · cheap · .001 / .005 · 200ms :20<br>"
  "gpt-4o-mini · cheap · .00015 / .0006 · 250ms :28<br>"
  "sonnet · claude-sonnet-5 · medium · .003 / .015 · 800ms :36<br>"
  "gpt-4o · medium · .0025 / .01 · 700ms :44<br>"
  "opus · claude-opus-5 · expensive · .005 / .025 · 2000ms :52<br>"
  "only haiku · sonnet · opus reachable — ROUTING_TABLE :64-68", 320, 668, 456, 104),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_q",    "n_demo",    "n_classify","query :82",              "edge.primary", (1,0.5),   (0,0.5), []),
 ("e_cls",  "n_classify","n_route",   "score · tier :158",      "edge.primary", (1,0.5),   (0,0.5), []),
 ("e_call", "n_route",   "n_mock",    "chain[i] :171",          "edge.call",    (1,0.5),   (0,0.5), []),
 ("e_ret",  "n_mock",    "n_route",   "response · tokens · cost :133", "edge.data_in",
                                                                (0.25,0), (0.75,0), [(1444,208),(756,208)]),
 ("e_cfg",  "n_mock",    "n_cfg",     "pricing :108",           "edge.data_in", (0.5,1),   (0.5,0), []),
 ("e_log",  "n_route",   "n_log",     "3 sites :187 :207 :242", "edge.artifact",(0.25,1),  (0.5,0), [(668,392),(432,392)]),
 ("e_ins",  "n_log",     "n_db",      "INSERT",                 "edge.artifact",(1,0.5),   (0,0.5), []),
 ("e_rd",   "n_db",      "n_read",    "SELECT",                 "edge.analysis",(1,0.5),   (0,0.5), []),
 ("e_api",  "n_read",    "n_server",  "handleApi :44",          "edge.analysis",(1,0.5),   (0,0.5), []),
 ("e_http", "n_server",  "n_browser", "GET /api/metrics",       "edge.analysis",(1,0.5),   (0,0.5), [(1304,472),(1304,584)]),
]
