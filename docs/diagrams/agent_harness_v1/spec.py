"""Spec — 03-agent-harness, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
    "id":      "hoa_agent_harness_v1",
    "name":    "03 Agent Harness — Architecture",
    "desc":    "The harness process wrapping a research agent: entry CLI, run loop with four "
               "stop conditions, tool surface over mock data, and the JSONL trace and markdown "
               "report it writes. Every element cites a source line in FACTS.md.",
    "theme":   "hoa-default.json",
    "drawio":  "FTS_AgentHarness_v1.drawio",
    "svg":     "agent-harness.svg",
    "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_entry","③ Entry (CLI)","boundary.datasource",      40, 232, 176, 176),
 ("z_proc", "① 03-agent-harness process (Node ESM)","boundary.primary", 280, 96, 1016, 680),
 ("z_loop", "Harness run loop — one continuous flow","boundary.functional", 320, 200, 936, 264),
 ("z_tools","② Tool surface (in-process, MOCK data)","boundary.external", 1360, 232, 296, 288),
 ("z_out",  "④ Artifacts written","boundary.observability", 1360, 584, 296, 176),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_cli","component.entry","<b>demo.js</b><br>CLI · 3 modes<br>:27 :54 :84 :120", 64, 260, 128, 60),
 ("n_harness","component.service","<b>AgentHarness.run()</b><br>while(true) · :74 :82", 352, 260, 160, 60),
 ("n_agent","component.agent","<b>ResearchAgent.step()</b><br>3 phases · :101", 624, 260, 160, 60),
 ("n_registry","component.service","<b>TOOL_REGISTRY</b><br>dispatch · :260", 896, 260, 160, 60),
 ("n_tracer","component.service","<b>Tracer.log()</b><br>every iteration · :44", 896, 356, 160, 56),
 ("n_tools","component.external","<b>4 tools</b><br>webSearch · readPage<br>noteFindings · synthesize", 1384, 260, 248, 60),
 ("n_mocks","component.mock","<b>MOCK corpora</b><br>MOCK_SEARCH_RESULTS :17<br>MOCK_PAGES :55 — no network", 1384, 372, 248, 60),
 ("n_trace","component.artifact","<b>trace-&lt;runId&gt;.jsonl</b><br>tracer.js:20", 1384, 620, 248, 48),
 ("n_report","component.artifact","<b>report-&lt;runId&gt;.md</b><br>demo.js:66-67", 1384, 692, 248, 48),
 ("n_pm","component.service","<b>postmortem()</b><br>harness.js:183", 352, 512, 160, 56),
 ("n_dx","component.service","<b>diagnosePrimitives()</b><br>diagnosis.js:50", 560, 512, 176, 56),
 ("card_gates","card.invariant",
  "<b>STOP CONDITIONS — complete, in code order</b><br>"
  "1 ITERATION_CAP :86 — checked BEFORE the step<br>"
  "2 AGENT_DONE :126 · 3 COST_CAP :132 · 4 CONVERGENCE :138<br>"
  "counter resets on a productive iteration :144<br>"
  "cost model $3 / $15 per 1M tokens :20", 832, 496, 424, 116),
 ("card_fail","card.failure",
  "<b>POSTMORTEM TAXONOMY — 8 patterns :170-177</b><br>"
  "context_miss · bad_tool_result · wasteful_action<br>"
  "hallucinated_tool_loop · convergence_stall · cost_overrun<br>"
  "iteration_cap · tool_imbalance", 832, 624, 424, 104),
 ("card_prim","card.primitive",
  "<b>10 harness primitives, scored 0.0–1.0 · diagnosis.js:5</b><br>"
  "Instructions · Context Delivery · Context Management<br>"
  "Tool Interface · Execution Environment · Durable State … :9-14", 352, 624, 424, 104),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_cli","n_cli","n_harness","question","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_step","n_harness","n_agent","agentStepFn(iter)","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_disp","n_agent","n_registry","tool + args","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_call","n_registry","n_tools","toolDef.fn(…)","edge.call",(1,0.5),(0,0.5),[]),
 ("e_mock","n_tools","n_mocks","lookup","edge.data_in",(0.5,1),(0.5,0),[]),
 ("e_ret","n_registry","n_agent","result · tokens","edge.primary",(0.5,0),(0.75,0),[(976,232),(744,232)]),
 ("e_trace","n_harness","n_tracer","per-iteration record","edge.artifact",(0.5,1),(0.5,0),[(432,340),(976,340)]),
 ("e_file","n_tracer","n_trace","append JSONL","edge.artifact",(1,0.5),(0,0.5),[(1316,384),(1316,644)]),
 ("e_rep","n_agent","n_report","finalReport","edge.artifact",(0.75,1),(0,0.5),[(744,436),(1340,436),(1340,716)]),
 ("e_stop","n_harness","n_pm","on stop → analyse","edge.stop",(0.25,1),(0.25,0),[]),
 ("e_dx","n_pm","n_dx","trace entries","edge.analysis",(1,0.5),(0,0.5),[]),
]
