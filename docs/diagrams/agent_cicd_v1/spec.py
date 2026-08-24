"""Spec — 26-agent-cicd, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
    "id":      "hoa_agent_cicd_v1",
    "name":    "26 Agent CI/CD — Eval Suite + Quality Gates for AI Agents",
    "desc":    "One in-process pipeline that runs an eval suite against an agent-under-test, compares "
               "the scores to a stored baseline, applies quality-gate rules, and decides promote / "
               "block — all in four ordered stages, no network and no real LLM. Every element cites "
               "a source line in FACTS.md.",
    "theme":   "hoa-default.json",
    "drawio":  "HOA_AgentCicd_v1.drawio",
    "svg":     "agent-cicd.svg",
    "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_in",   "③ Inputs — demo.js CLI + eval config", "boundary.datasource",
   40, 240, 216, 376),
 ("z_proc", "① agent-cicd pipeline (Node ESM · no network, no real LLM)", "boundary.primary",
   320, 96, 976, 684),
 ("z_pipe", "4-stage pipeline — eval → baseline → gate → promote", "boundary.functional",
   528, 216, 752, 256),
 ("z_out",  "④ Reported output (in-memory / stdout)", "boundary.observability",
   1360, 440, 296, 224),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_cli", "component.entry",
  "<b>demo.js</b><br>5 scenarios :59-114<br>runPipeline &times;3", 64, 272, 168, 64),
 ("n_cases", "component.mock",
  "<b>8 eval cases</b><br>tags + weights<br>demo.js:39-50", 64, 368, 168, 64),
 ("n_scorers", "component.mock",
  "<b>3 scorer fns</b><br>faith / safety / cost<br>demo.js:15-36", 64, 448, 168, 64),
 ("n_agent", "component.agent",
  "<b>agentFn (SUT · mock)</b><br>good / bad agent<br>demo.js:61 :92", 64, 528, 168, 64),

 ("n_pipeline", "component.service",
  "<b>AgentCICDPipeline</b><br>runPipeline() :18<br>4-stage orchestrator<br>runs[] log :73",
  336, 256, 176, 96),

 ("n_eval", "component.service",
  "<b>&#9312; EvalSuite.run</b><br>evalSuite.js:32<br>agentFn :44<br>score dims :55", 552, 272, 160, 64),
 ("n_baseline", "component.service",
  "<b>&#9313; compare()</b><br>baseline.js:24<br>regression :52", 736, 272, 160, 64),
 ("n_gate", "component.service",
  "<b>&#9314; QualityGate</b><br>evaluate() :22<br>rules &rarr; verdict :39", 920, 272, 160, 64),
 ("n_promo", "component.service",
  "<b>&#9315; _decide()</b><br>pipeline.js:82<br>promote / block", 1104, 272, 160, 64),

 ("n_store", "component.artifact",
  "<b>baseline store</b><br>Map (in-memory)<br>saveBaseline :8", 736, 496, 160, 64),

 ("n_report", "component.artifact",
  "<b>stdout report</b><br>generateReport :110", 1384, 472, 248, 64),
 ("n_history", "component.artifact",
  "<b>run history</b><br>this.runs :73<br>getRunHistory :102", 1384, 568, 248, 64),

 ("card_stages", "card.invariant",
  "<b>FOUR STAGES — runPipeline() pipeline.js:18</b><br>"
  "1 eval     EvalSuite.run :24 &rarr; scores<br>"
  "2 baseline compare :35 (skip if none :43)<br>"
  "3 gate     QualityGate.evaluate :47<br>"
  "4 promote  _decide :56 &rarr; action<br>"
  "each stage output feeds the next<br>"
  "auto-save baseline only on 'promote' :75<br>"
  "(never on promote_with_warnings)", 336, 616, 304, 160),

 ("card_promo", "card.failure",
  "<b>PROMOTION LADDER — _decide() :82</b><br>"
  "first match wins, in code order:<br>"
  "1 BLOCK if gate verdict = BLOCK :83<br>"
  "2 BLOCK if baseline REGRESSION :87<br>"
  "3 BLOCK if cases &lt; minCases(5) :91<br>"
  "4 PROMOTE_WITH_WARNINGS if WARN :95<br>"
  "5 PROMOTE if all clear :99<br>"
  "3 independent block gates, not 1", 656, 616, 304, 160),

 ("card_gate", "card.primitive",
  "<b>QUALITY GATE — qualityGate.js:22</b><br>"
  "rule types (evaluate loop :27):<br>"
  "  threshold :55 · regression :64 · custom :76<br>"
  "severity: error blocks, warning notes :15<br>"
  "verdict: BLOCK / WARN / PASS :39<br>"
  "history push :50 &rarr; trend<br>"
  "demo rules :53-56 —<br>"
  "  safety gte 0.9 err · cost gte 0.7 warn", 976, 616, 304, 160),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_cli",     "n_cli",     "n_pipeline", "runPipeline", "edge.primary", (1, 0.5), (0, 0.5),
   []),
 ("e_cases",   "n_cases",   "n_pipeline", "8 cases", "edge.data_in", (1, 0.5), (0, 0.25),
   [(288, 400), (288, 280)]),
 ("e_scorers", "n_scorers", "n_pipeline", "scorers", "edge.data_in", (1, 0.5), (0, 0.75),
   [(312, 480), (312, 328)]),
 ("e_agent",   "n_agent",   "n_pipeline", "agentFn (SUT)", "edge.data_in", (1, 0.5), (0.5, 1),
   [(424, 560)]),

 ("e_run",   "n_pipeline",  "n_eval",     "", "edge.primary", (1, 0.5), (0, 0.5),
   []),
 ("e_base",  "n_eval",      "n_baseline", "", "edge.primary", (1, 0.5), (0, 0.5),
   []),
 ("e_gate",  "n_baseline",  "n_gate",     "", "edge.primary", (1, 0.5), (0, 0.5),
   []),
 ("e_promo", "n_gate",      "n_promo",    "", "edge.primary", (1, 0.5), (0, 0.5),
   []),

 ("e_read",  "n_store",   "n_baseline", "read :25",           "edge.data_in", (0.5, 0), (0.5, 1),
   []),
 ("e_save",  "n_promo",   "n_store",    "save on promote :75", "edge.artifact", (0.25, 1), (1, 0.5),
   [(1144, 528)]),

 ("e_report", "n_promo", "n_report",  "stdout :110", "edge.artifact", (1, 0.5), (0, 0.25),
   [(1320, 304), (1320, 488)]),
 ("e_hist",   "n_promo", "n_history", "run :73",     "edge.primary",  (0.75, 1), (0, 0.25),
   [(1224, 584)]),
]
