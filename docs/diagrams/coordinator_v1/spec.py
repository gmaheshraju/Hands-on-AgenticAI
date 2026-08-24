"""Spec — 21-multi-agent-coordinator, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
    "id":      "hoa_coordinator_v1",
    "name":    "21 Multi-Agent Coordinator — Capability Routing, Waves, Escalation",
    "desc":    "One Node process, no network and no filesystem, that pattern-matches a request into "
               "skill-tagged sub-tasks, groups them into priority waves, routes each task to the "
               "least-loaded capability card that declares the skill, and calls that card's handler "
               "directly. The message bus records five envelope kinds for audit and carries no work. "
               "Every element cites a source line in FACTS.md.",
    "theme":   "hoa-default.json",
    "drawio":  "HOA_Coordinator_v1.drawio",
    "svg":     "coordinator.svg",
    "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_in",   "③ Inputs — no files, no network", "boundary.datasource",
   24, 96, 216, 448),
 ("z_proc", "① 21-multi-agent-coordinator process (Node ESM · in-process · no I/O)", "boundary.primary",
   304, 96, 1008, 688),
 ("z_task", "per-task pipeline — _executeTask() :137", "boundary.functional",
   704, 200, 584, 264),
 ("z_out",  "④ Reported output (stdout only)", "boundary.observability",
   1376, 480, 296, 144),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_demo", "component.entry",
  "<b>demo.js</b><br>CLI entry :19 :143<br>4 requests :59 :69<br>:79 :89 — no args",
  40, 136, 176, 96),
 ("n_cards", "component.mock",
  "<b>ALL_AGENTS</b><br>agents.js:309 — 6 cards<br>15 skills, 12 names",
  40, 256, 176, 64),
 ("n_rules", "component.mock",
  "<b>DECOMPOSITION_RULES</b><br>decomposer.js:9<br>5 regex + fallback :78",
  40, 352, 176, 64),
 ("n_test", "component.entry",
  "<b>coordinator.test.js</b><br>2nd entry — 15 tests<br>4 suites, all pass",
  40, 448, 176, 64),

 ("n_registry", "component.service",
  "<b>CapabilityRegistry</b><br>register() :19<br>skillIndex Map :16",
  320, 136, 160, 64),
 ("n_decomp", "component.service",
  "<b>decomposer.js</b><br>decompose() :58<br>getExecutionPlan :97<br>waves by priority",
  320, 256, 160, 96),
 ("n_exec", "component.service",
  "<b>processRequest()</b><br>coordinator.js:47<br>wave loop :94<br>allSettled :99",
  512, 256, 160, 96),

 ("n_task", "component.service",
  "<b>_executeTask()</b><br>coordinator.js:137<br>retry loop :140<br>maxRetries 2 :28",
  728, 256, 160, 96),
 ("n_select", "component.service",
  "<b>selectAgent()</b><br>capability.js:80<br>load, then cost :70<br>maxConcurrency :85",
  920, 256, 160, 96),
 ("n_handler", "component.mock",
  "<b>skill handler</b><br>agents.js:17 :20<br>SIMULATED closure<br>setTimeout only :9",
  1112, 256, 160, 96),
 ("n_escalate", "component.service",
  "<b>_tryEscalation()</b><br>coordinator.js:225<br>escalatesTo chain :227",
  920, 376, 176, 64),

 ("n_bus", "component.service",
  "<b>MessageBus</b><br>bus.js:13 publish :28<br>history[] cap 500 :17",
  920, 520, 176, 64),
 ("n_summary", "component.service",
  "<b>run summary</b><br>_printRunSummary :299<br>demo totals :118",
  1120, 520, 160, 64),

 ("n_stdout", "component.artifact",
  "<b>stdout — console.log only</b><br>no file written, no socket open<br>0 fs/http refs in src/",
  1400, 520, 248, 64),

 ("card_bus", "card.invariant",
  "<b>BUS = AUDIT LOG, NOT TRANSPORT</b><br>"
  "5 publish sites, ALL in coordinator.js:<br>"
  "  :160 TASK_REQUEST  :184 TASK_RESULT<br>"
  "  :200 TASK_FAILED   :245 ESCALATION<br>"
  "  :269 TASK_RESULT (escalated)<br>"
  "1 subscribe site: coordinator.js:37<br>"
  "  ESCALATION → console.log :39, nothing more<br>"
  "agents.js has 0 imports, 0 bus refs<br>"
  "handlers are called DIRECTLY :174 :259<br>"
  "bus.js:9-10 names HEARTBEAT + BROADCAST —<br>"
  "neither is ever published (README:90 false)",
  320, 608, 312, 160),

 ("card_route", "card.primitive",
  "<b>selectAgent() :80 — 7 checks, in order</b><br>"
  "1 skillIndex.get(skill) → ids, reg order :65<br>"
  "2 map to card, drop deregistered :67-68<br>"
  "3 sort: lower load first :70<br>"
  "4 tie → lower cost for THAT skill :71-73<br>"
  "5 no providers → null :82<br>"
  "6 best = providers[0] :84<br>"
  "7 load &gt;= maxConcurrency || 5 → null :85<br>"
  "incrementLoad :152 fires BEFORE the await :173<br>"
  "→ 2nd parallel code task goes to Senior Dev<br>"
  "README:108 claims Junior ×2 — observed J then S",
  652, 608, 312, 160),

 ("card_esc", "card.failure",
  "<b>ESCALATION: 4 NULL EXITS, 0 FIRINGS</b><br>"
  "_tryEscalation :225, called at :146 + :213<br>"
  "returns null on 4 guards, in code order:<br>"
  "  a assigned card has no escalatesTo :229<br>"
  "  b escalatesTo id not registered :232<br>"
  "  c target lacks that skill/handler :235<br>"
  "  d target handler throws :281-283<br>"
  "only 2 of 6 cards set escalatesTo :31 :198<br>"
  "demo: maxRetries 1 :49 + junior throws only<br>"
  "at attempt === 0 :40 ⇒ :213 unreachable<br>"
  "13 demo runs observed — Escalations: 0",
  984, 608, 312, 160),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_demo_reg",  "n_demo",  "n_registry", "register ×6 :32", "edge.primary", (1, 0.5), (0, 0.75), []),
 ("e_cards_reg", "n_cards", "n_registry", "6 cards",         "edge.data_in", (1, 0.5), (0.25, 1),
   [(264, 288), (264, 232), (360, 232)]),
 ("e_demo_dec",  "n_demo",  "n_decomp",   "decompose :71",  "edge.primary", (1, 0.75), (0, 0.25),
   [(288, 208), (288, 280)]),
 ("e_rules_dec", "n_rules", "n_decomp",   "5 patterns",      "edge.data_in", (1, 0.5), (0, 0.75),
   [(264, 384), (264, 328)]),
 ("e_test_exec", "n_test",  "n_exec",     "15 tests",        "edge.data_in", (1, 0.5), (0, 0.75),
   [(496, 480), (496, 328)]),

 ("e_dec_exec",   "n_decomp", "n_exec",    "waves",           "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_exec_task",  "n_exec",   "n_task",    "per task",        "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_task_sel",   "n_task",   "n_select",  ":142",            "edge.call",    (1, 0.5), (0, 0.5), []),
 ("e_sel_handler","n_select", "n_handler", ":174",            "edge.primary", (1, 0.5), (0, 0.5), []),

 ("e_reg_sel", "n_registry", "n_select", "skillIndex", "edge.data_in", (1, 0.5), (0.75, 0),
   [(1040, 168)]),

 ("e_handler_back", "n_handler", "n_task", "result :194", "edge.primary", (0.5, 1), (0.75, 1),
   [(1192, 368), (848, 368)]),
 ("e_task_esc", "n_task", "n_escalate", "escalate :146 :213", "edge.stop", (0.5, 1), (0, 0.25),
   [(808, 392)]),
 ("e_esc_handler", "n_escalate", "n_handler", "senior :259", "edge.call", (1, 0.5), (0.75, 1),
   [(1232, 408)]),

 ("e_task_bus", "n_task", "n_bus", "3 publishes", "edge.analysis", (0.25, 1), (0, 0.5),
   [(768, 552)]),
 ("e_esc_bus",  "n_escalate", "n_bus", "2 publishes", "edge.analysis", (0.5, 1), (0.5, 0), []),

 ("e_exec_sum", "n_exec", "n_summary", "run object", "edge.primary", (0.75, 1), (0.25, 0),
   [(632, 496), (1160, 496)]),
 ("e_bus_sum",  "n_bus",  "n_summary", ":118",          "edge.analysis", (1, 0.5), (0, 0.5), []),
 ("e_sum_out",  "n_summary", "n_stdout", "console.log", "edge.artifact", (1, 0.5), (0, 0.5), []),
]
