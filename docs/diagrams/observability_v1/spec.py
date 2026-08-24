"""Spec — 19-agent-observability, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
    "id":      "hoa_observability_v1",
    "name":    "19 Agent Observability — Trace Store, Dashboard, and the Two Drift Detectors",
    "desc":    "One Node process that fabricates 500 agent traces into SQLite, then serves them over "
               "13 HTTP routes to a browser page. Drawn as it is wired, not as the README describes it: "
               "the OpenTelemetry-style tracer is never instantiated, drift is detected twice by two "
               "different formulas, and the browser reads field names the API never sends. Every "
               "element cites a source line in FACTS.md.",
    "theme":   "hoa-default.json",
    "drawio":  "HOA_Observability_v1.drawio",
    "svg":     "observability.svg",
    "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_in",    "③ Entry — CLI + a dead SDK", "boundary.datasource",
   40, 176, 248, 280),
 ("z_proc",  "① 19-agent-observability — one Node ESM process (no LLM call, no network egress)",
   "boundary.primary", 352, 96, 944, 684),
 ("z_write", "Phase 1 — write path (demo.js:18)", "boundary.functional",
   368, 192, 464, 136),
 ("z_ext",   "② Browser — the only real network hop", "boundary.external",
   1360, 200, 296, 136),
 ("z_out",   "④ stdout — what a human sees", "boundary.observability",
   1360, 520, 296, 136),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_demo", "component.entry",
  "<b>demo.js — npm start</b><br>unlink DB first :10-13<br>simulate() :18<br>startDashboard() :33",
  64, 232, 200, 64),
 ("n_tracer", "component.agent",
  "<b>Tracer</b> tracer.js:160<br>DEAD — 0 new sites<br>Span.end() :57 writes<br>camelCase keys :85",
  64, 336, 200, 64),

 ("n_sim", "component.mock",
  "<b>simulate()</b><br>simulator.js:75<br>500 reqs · 7 days<br>1-4 spans each :125",
  400, 232, 176, 64),
 ("n_store", "component.service",
  "<b>Store</b> store.js:105<br>WAL · FK on :108<br>only writer API<br>20 methods · 8 dead",
  624, 232, 176, 64),
 ("n_db", "component.artifact",
  "<b>observability.db</b><br>SQLite · 7 tables<br>6 ever written<br>wiped each run :10",
  848, 232, 176, 64),
 ("n_dash", "component.service",
  "<b>startDashboard()</b><br>dashboard.js:12<br>express · 13 routes<br>12 use store.db raw",
  1104, 232, 176, 64),

 ("n_inline", "component.service",
  "<b>inline drift check</b><br>simulator.js:289-377<br>pct change, not z<br>3 alerts, 1 agent",
  400, 408, 176, 64),
 ("n_cost", "component.service",
  "<b>CostTracker</b><br>costTracker.js:9<br>12 methods · 2 used<br>warn 80% block 100%",
  624, 408, 176, 64),
 ("n_qual", "component.service",
  "<b>QualityScorer</b><br>qualityScorer.js:76<br>8 methods · 0 used<br>hash+LCG, no judge",
  864, 408, 176, 64),
 ("n_drift", "component.service",
  "<b>DriftDetector</b><br>driftDetector.js:6<br>real z-score :18<br>5 metrics · 1 route",
  1104, 408, 176, 64),

 ("n_ui", "component.external",
  "<b>public/index.html</b> — browser<br>5 tabs · hand-rolled canvas :297<br>"
  "11 fetch() sites :581-857<br>KPI auto-refresh 10 s :678",
  1384, 232, 248, 64),

 ("n_stdout", "component.artifact",
  "<b>stdout summary</b><br>demo.js:24-29 — traces · spans<br>quality scores · drift alerts<br>plus the URL, dashboard.js:343",
  1384, 552, 248, 64),

 ("card_drift", "card.primitive",
  "<b>DRIFT — injected in 4 places, detected by 2</b><br>"
  "INJECTED — simulator.js, one agent only<br>"
  "  :120 research-agent · :89 :121 last 2 of 7 d<br>"
  "  1 prompt+completion tokens x1.4  :144 :145<br>"
  "  2 latency x1.6                   :161<br>"
  "  3 tool-call chance .30 -&gt; .55    :165<br>"
  "  4 quality score -0.5             :266<br>"
  "DETECTED TWICE, BY DIFFERENT MATH<br>"
  "  A simulator.js:289-377 — percent change<br>"
  "    latency &gt;20% :322 · tokens &gt;20% :342<br>"
  "    quality drop &gt;0.2 :362 · 3 alerts max<br>"
  "    writes pct INTO the z_score column :331<br>"
  "    runs on every npm start<br>"
  "  B driftDetector.js:154 — a real z-score :18<br>"
  "    |z|&gt;=2 warn :181 · |z|&gt;=3 critical :179<br>"
  "    5 metrics :1 x each agent x model :209<br>"
  "    runs only via dashboard.js:289",
  376, 520, 296, 248),

 ("card_wiring", "card.invariant",
  "<b>SIX CLASSES — every construction site</b><br>"
  "Store          store.js:105<br>"
  "  simulator.js:82 · dashboard.js:13<br>"
  "  20 data methods, 8 with 0 callers<br>"
  "CostTracker    costTracker.js:9<br>"
  "  simulator.js:83 · dashboard.js:14<br>"
  "  12 public, 2 called :381 :200<br>"
  "QualityScorer  qualityScorer.js:76<br>"
  "  dashboard.js:15 — then NEVER called<br>"
  "DriftDetector  driftDetector.js:6<br>"
  "  dashboard.js:16 · runAllChecks :294<br>"
  "Tracer         tracer.js:160<br>"
  "  ZERO construction sites in the repo<br>"
  "Span · Trace   tracer.js:21 :104<br>"
  "  reachable only via Tracer :120 :165<br>"
  "metrics_snapshots store.js:78 is the only<br>"
  "table with no writer and no reader",
  688, 520, 272, 248),

 ("card_contract", "card.failure",
  "<b>THE PAGE READS FIELDS THE API NEVER SENDS</b><br>"
  "index.html reads          the row carries<br>"
  "  trace.latencyMs :883    traces has none<br>"
  "  trace.totalTokens       total_tokens<br>"
  "  trace.costCents         total_cost (USD)<br>"
  "  trace.timestamp         started_at<br>"
  "  span.durationMs :915    latency_ms<br>"
  "  span.tokens :917        total_tokens<br>"
  "  span.costCents :918     cost<br>"
  "  span.toolCalls :923     tool_calls, a string<br>"
  "  span.children :936      parent_span_id, flat<br>"
  "  alert.zScore :848       z_score<br>"
  "  data.metrics :865       dashboard.js:282<br>"
  "Adapted in 2 places only — timeseries :614,<br>"
  "attribution :600. The rest are read raw.<br>"
  "GET /api/traces/:id — dashboard.js:102 filters<br>"
  "trace_id; store.js:5-16 has no such column.",
  976, 520, 304, 248),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_cli",   "n_demo",  "n_sim",  "npm start", "edge.primary", (1, 0.25), (0, 0.25), []),

 ("e_store", "n_sim",   "n_store", "inserts",  "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_db",    "n_store", "n_db",    "sqlite3",  "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_read",  "n_db",    "n_dash",  "SELECT",   "edge.data_in", (1, 0.5), (0, 0.5), []),

 ("e_tracer", "n_tracer", "n_store", "never instantiated", "edge.stop",
   (1, 0.5), (0.75, 1), [(756, 368)]),

 ("e_simdrift", "n_sim",    "n_inline", "post-run", "edge.analysis", (0.5, 1), (0.5, 0), []),
 ("e_inline",   "n_inline", "n_store",  "3 alerts", "edge.primary",  (1, 0.25), (0.25, 1),
   [(600, 424), (600, 296)]),

 ("e_qual",  "n_dash", "n_qual",  "never called",  "edge.call", (0.25, 1), (0.5, 0),
   [(1148, 360), (952, 360)]),
 ("e_cost",  "n_dash", "n_cost",  "1 route :200",  "edge.call", (0.75, 1), (0.5, 0),
   [(1236, 392), (712, 392)]),
 ("e_drift", "n_dash", "n_drift", "1 route :294",  "edge.call", (0.5, 1), (0.5, 0), []),

 ("e_serve", "n_dash", "n_ui",   "HTML+JSON", "edge.call", (1, 0.25), (0, 0.25), []),
 ("e_fetch", "n_ui",   "n_dash", "11 fetch()",    "edge.call", (0, 0.75), (1, 0.75), []),

 ("e_stdout", "n_sim", "n_stdout", "run summary", "edge.artifact", (0, 0.75), (0, 0.5),
   [(328, 280), (328, 496), (1320, 496), (1320, 584)]),
]
