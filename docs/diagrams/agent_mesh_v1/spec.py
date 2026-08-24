"""Spec — 29-agent-mesh, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
    "id":      "hoa_agent_mesh_v1",
    "name":    "29 Agent Mesh — Self-Healing Orchestrator",
    "desc":    "One in-memory Node process (no network, no DB, no real LLM) that routes work to "
               "worker nodes, watches their heartbeats, and — when the Mesh (which owns the event "
               "bus) sees a node_failed event — trips the node's breaker, excludes it, and "
               "redistributes its pending work. Every element cites a source line in FACTS.md.",
    "theme":   "hoa-default.json",
    "drawio":  "HOA_AgentMesh_v1.drawio",
    "svg":     "agent-mesh.svg",
    "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_entry", "③ Driver — CLI", "boundary.datasource",
   40, 200, 216, 144),
 ("z_out",   "④ stdout", "boundary.observability",
   40, 408, 216, 120),
 ("z_proc",  "① 29-agent-mesh — one Node process · in-memory · no network, no DB, no real LLM",
   "boundary.primary",
   320, 96, 1200, 680),
 ("z_flow",  "Work path — submit → select → gate → enqueue", "boundary.functional",
   336, 200, 1180, 128),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_demo", "component.entry",
  "<b>demo.js</b><br>CLI · 5 scenarios<br>main() :227", 64, 232, 168, 64),

 ("n_mesh", "component.service",
  "<b>Mesh</b> :22<br>orchestrator + bus<br>submitWork :114<br>_onNodeFailed :240", 360, 232, 176, 64),
 ("n_router", "component.service",
  "<b>MeshRouter</b> :24<br>selectNode :65<br>4 strategies", 664, 232, 176, 64),
 ("n_nodes", "component.agent",
  "<b>AgentNode ×N</b> :20<br>enqueue :129<br>queue · health · caps<br>processor = async fn",
  1264, 232, 176, 64),

 ("n_monitor", "component.service",
  "<b>HealthMonitor</b> :14<br>_check :64<br>heartbeat detect", 360, 432, 176, 64),
 ("n_cb", "component.service",
  "<b>CircuitBreaker</b> :19<br>Registry :128<br>per-node · 3 states", 664, 432, 176, 64),
 ("n_redist", "component.service",
  "<b>WorkRedistributor</b><br>redistribute :29<br>capability + cascade", 968, 432, 176, 64),

 ("n_stdout", "component.artifact",
  "<b>stdout</b><br>dashboardString :199<br>console.log", 64, 440, 168, 64),

 # ---- cards ----
 ("card_routes", "card.invariant",
  "<b>ROUTING STRATEGIES — meshRouter.js, code order</b><br>"
  "selectNode() switch :69-79 · default least-loaded :65<br>"
  "1 round-robin        _roundRobin :95<br>"
  "2 least-loaded       _leastLoaded :102  (default)<br>"
  "3 capability-based   filter → least-loaded :75<br>"
  "4 affinity-sticky    _affinitySticky :116<br>"
  "all run on _healthyCandidates :84<br>"
  "excludes FAILED + DEGRADED + excluded :88",
  336, 544, 376, 184),

 ("card_breaker", "card.invariant",
  "<b>CIRCUIT BREAKER — 3 states, circuitBreaker.js</b><br>"
  "per-node breaker, lazy registry :128 :138<br>"
  "CLOSED    requests flow :54<br>"
  "OPEN      blocked :58<br>"
  "HALF_OPEN one probe :55<br>"
  "CLOSED→OPEN        ≥ 5 fails :90<br>"
  "OPEN→HALF_OPEN     after 10s cooldown :43<br>"
  "HALF_OPEN→CLOSED   probe ok :66<br>"
  "HALF_OPEN→OPEN     probe fail :83<br>"
  "trip() force-open :101 · reset() :107",
  736, 544, 376, 184),

 ("card_heal", "card.failure",
  "<b>SELF-HEALING on node_failed — mesh.js:240</b><br>"
  "README says HealthMonitor → WorkRedistributor.<br>"
  "FALSE: monitor only emits :87; the MESH owns<br>"
  "the bus :59 and drives the reaction:<br>"
  "1 router.excludeNode :245<br>"
  "2 breaker.trip() :246<br>"
  "3 collect healthy nodes :249<br>"
  "4 redistribute pending work :252<br>"
  "5 if failed/total ≥ 0.5 → mesh_degraded :257<br>"
  "6 emit node_failed (+redistributed) :262",
  1136, 544, 376, 184),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 # --- main work path (left to right) ---
 ("e_submit", "n_demo", "n_mesh", "submitWork :114", "edge.primary", (1, 0.25), (0, 0.25),
   []),
 ("e_select", "n_mesh", "n_router", "selectNode :229", "edge.call", (1, 0.5), (0, 0.5),
   []),
 ("e_enq", "n_mesh", "n_nodes", "enqueue :135", "edge.primary", (0.75, 1), (0.5, 1),
   [(492, 348), (1352, 348)]),

 # --- consultations from the hub ---
 ("e_gate", "n_mesh", "n_cb", "allowRequest :129", "edge.call", (0.5, 1), (0.5, 0),
   [(448, 372), (752, 372)]),
 ("e_redist", "n_mesh", "n_redist", "redistribute :252", "edge.call", (0.25, 1), (0.5, 0),
   [(404, 404), (1056, 404)]),

 # --- self-healing loop ---
 ("e_failed", "n_monitor", "n_mesh", "node_failed :59", "edge.stop", (0, 0.5), (0, 0.75),
   [(324, 464), (324, 280)]),
 ("e_reenq", "n_redist", "n_nodes", "re-enqueue :84", "edge.primary", (1, 0.5), (0.75, 1),
   [(1144, 416), (1396, 416)]),

 # --- output ---
 ("e_out", "n_demo", "n_stdout", "dashboard :221", "edge.artifact", (0.5, 1), (0.5, 0),
   []),
]
