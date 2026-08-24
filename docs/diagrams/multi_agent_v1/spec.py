"""Spec — 04-multi-agent-systems, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.

The shape this diagram exists to show: the README claims each agent subscribes
to the bus itself (README.md:53-55). It does not. All 5 subscribes and all 10
publishes live in supervisor.js; the four agents are pure async functions the
supervisor awaits directly. FACTS.md carries the grep that proves it.
"""

META = {
    "id":      "hoa_multi_agent_v1",
    "name":    "04 Multi-Agent Content Pipeline — Architecture",
    "desc":    "One Node process with zero npm deps: a supervisor that owns the message bus and "
               "all five channel handlers, four bus-unaware agent functions it awaits directly, "
               "two mock tool surfaces, and three stdout-only outputs. Every element cites a "
               "source line in FACTS.md.",
    "theme":   "hoa-default.json",
    "drawio":  "HOA_MultiAgent_v1.drawio",
    "svg":     "multi-agent.svg",
    "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_entry", "③ Entry — CLI", "boundary.datasource",                                 40, 272,  176, 112),
 ("z_proc",  "① runPipeline() — one Node ESM process, zero npm dependencies",
             "boundary.primary",                                                    280,  56, 1016, 724),
 ("z_flow",  "② Agent tier — 4 pure async functions, ZERO bus awareness (grep: 0 hits)",
             "boundary.functional",                                                 424, 104,  848, 152),
 ("z_tools", "④ Tool surface — MOCK, in-process, no network",
             "boundary.external",                                                  1360,  76,  296, 212),
 ("z_out",   "⑤ Output — stdout only, no file is written",
             "boundary.observability",                                             1360, 380,  296, 288),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_demo", "component.entry",
  "<b>demo.js</b><br>CLI · argv[2] :16<br>main() :85", 64, 296, 128, 64),

 ("n_res", "component.agent",
  "<b>① Researcher</b><br>runResearcher() :58<br>web_search · fetch_url", 448, 152, 176, 64),
 ("n_writer", "component.agent",
  "<b>② Writer</b><br>runWriter() :25<br>no tools · 2 draft fns", 656, 152, 176, 64),
 ("n_editor", "component.agent",
  "<b>③ Editor</b><br>runEditor() :147<br>scoreDraft() :46 — 0-10", 864, 152, 176, 64),
 ("n_fc", "component.agent",
  "<b>④ Fact-Checker</b><br>runFactChecker() :40<br>fetch_url only :29", 1072, 152, 176, 64),

 ("n_super", "component.service",
  "<b>runPipeline() — supervisor.js:48 · the ONLY module that touches the bus</b><br>"
  "creates the bus :57 · registers all 5 handlers :81 :102 :140 :162 :182 · awaits each agent fn directly<br>"
  "MAX_BUDGET $2 :40 · MAX_RETRIES 2 :41 · assembles the report :243-259 · resolves the Promise :282",
  424, 296, 848, 64),

 ("n_bus", "component.service",
  "<b>createMessageBus() — messageBus.js:22</b><br>"
  "publish(msg) :37 — stamps id + timestamp :39-40, appends to log :43, then invokes every handler for msg.to :46-47<br>"
  "subscribe(channel, handler) :31 — channel is an agent NAME, not a topic · getLog() :52 · printSummary() :69",
  424, 424, 848, 64),

 ("n_tool_r", "component.mock",
  "<b>Researcher mockTools</b><br>web_search(q) :27 — 3 hits<br>fetch_url(u) :47 — canned", 1384, 120, 248, 56),
 ("n_tool_f", "component.mock",
  "<b>Fact-Checker mockTools</b><br>fetch_url(u) :29 only<br>a separate object :28", 1384, 204, 248, 56),

 ("n_report", "component.artifact",
  "<b>Pipeline report</b><br>supervisor.js:243-259<br>resolve() :282 → demo.js:24", 1384, 412, 248, 56),
 ("n_final", "component.artifact",
  "<b>FINAL → to: 'Output'</b><br>supervisor.js:233-238<br>no subscriber — log only", 1384, 496, 248, 56),
 ("n_buslog", "component.artifact",
  "<b>Bus log (ordered)</b><br>getLog() :52 · print :69<br>stdout only — no file", 1384, 580, 248, 56),

 ("card_msg", "card.invariant",
  "<b>MESSAGE TYPES — all 8, in publish order · every publish() AND every subscribe() lives in supervisor.js, none in src/agents/</b><br>"
  "1 RESEARCH_REQUEST · Supervisor → Researcher · :290-295 — the kick-off, published LAST, after all five handlers are registered<br>"
  "2 RESEARCH_COMPLETE · Researcher → Writer · :89-94 — emitted by the 'Researcher' handler after it awaits runResearcher() :85<br>"
  "3 DRAFT_COMPLETE · Writer → Editor · :114-119 (attempt 1) and :127-132 (revision) — two publish sites, one type<br>"
  "4 REVIEW_COMPLETE · Editor → Supervisor · :150-155 — carries verdict, score, issues and the draft itself<br>"
  "5 REVISION_REQ · Supervisor → Writer · :206-211 — payload is the major-severity issues only, joined at :199-202<br>"
  "6 FACT_CHECK_REQUEST · Supervisor → FactChecker · :192-197 (on ACCEPT) and :216-221 (retries exhausted)<br>"
  "7 FACT_CHECK_COMPLETE · FactChecker → Supervisor · :169-174 — triggers final assembly :227<br>"
  "8 FINAL · Supervisor → 'Output' · :233-238 — messageBus.js's own header lists a different, stale set of names :11-17",
  304, 520, 968, 132),

 ("card_chan", "card.primitive",
  "<b>BUS CHANNELS — all 5, in code order, all in supervisor.js</b><br>"
  "1 'Researcher' :81 — RESEARCH_REQUEST only :82<br>"
  "2 'Writer' :102 — RESEARCH_COMPLETE :104 · REVISION_REQ :120<br>"
  "3 'Editor' :140 — DRAFT_COMPLETE only :141<br>"
  "4 'FactChecker' :162 — FACT_CHECK_REQUEST only :163<br>"
  "5 'Supervisor' :182 — REVIEW_COMPLETE :184 · FACT_CHECK_COMPLETE :223<br>"
  "'Output' :235 is published to but never subscribed — log-only hop.",
  304, 668, 476, 108),

 ("card_stop", "card.failure",
  "<b>SUPERVISOR VERDICT BRANCH — complete, in code order :184-222</b><br>"
  "1 verdict === 'ACCEPT' :188 → publish FACT_CHECK_REQUEST :192<br>"
  "2 else attempt ≤ MAX_RETRIES(2) :198 → majors :199 → REVISION_REQ :206<br>"
  "3 else :212 → stop revising, fact-check the best draft anyway :216<br>"
  "Budget gate: trackCost() :301 bills every tokenUsage; checkBudget() :305<br>"
  "THROWS above $2 at :308 — called 4× at :106 :144 :186 :225 → demo.js:79",
  796, 668, 476, 108),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
# n_super top ports are written as fractions of its 848 width so each lands on
# the agent's centre line: 424 + 112/320/528/736 = 536/744/952/1160.
EDGES = [
 ("e_cli",   "n_demo",  "n_super", "runPipeline(topic) · demo.js:24", "edge.primary", (1, 0.25), (0, 0.25), [(240, 312)]),
 ("e_stop",  "n_super", "n_demo",  "checkBudget throws :308 → catch :79", "edge.stop",  (0, 0.75), (1, 0.75), [(240, 344)]),

 ("e_pub",   "n_super", "n_bus",   "bus.publish() ×10",            "edge.call",    (0.25, 1), (0.25, 0), [(636, 392)]),
 ("e_route", "n_bus",   "n_super", "routes msg.to → handler :46-47", "edge.data_in", (0.75, 0), (0.75, 1), [(1060, 392)]),

 ("e_a1", "n_super", "n_res",    "await runResearcher() :85",  "edge.primary", (112/848, 0), (0.5, 1), [(536, 272)]),
 ("e_a2", "n_super", "n_writer", "await runWriter() :110 :123", "edge.primary", (320/848, 0), (0.5, 1), [(744, 272)]),
 ("e_a3", "n_super", "n_editor", "await runEditor() :147",     "edge.primary", (528/848, 0), (0.5, 1), [(952, 272)]),
 ("e_a4", "n_super", "n_fc",     "await runFactChecker() :166", "edge.primary", (736/848, 0), (0.5, 1), [(1160, 272)]),

 ("e_t1", "n_res", "n_tool_r", "mock tools :78 :86", "edge.call",
  (0, 0.5), (0, 0.5), [(400, 184), (400, 88), (1336, 88), (1336, 148)]),
 ("e_t2", "n_fc",  "n_tool_f", "fetch_url ×3 :59", "edge.call",
  (1, 0.5), (0, 0.5), [(1304, 184), (1304, 232)]),

 ("e_rep", "n_super", "n_report", "report + resolve() :282", "edge.artifact",
  (1, 0.5), (0.5, 0), [(1508, 328)]),
 ("e_fin", "n_bus", "n_final", "FINAL :233", "edge.artifact",
  (1, 0.25), (0, 0.5), [(1320, 440), (1320, 524)]),
 ("e_log", "n_bus", "n_buslog", "log :43", "edge.artifact",
  (1, 0.75), (0, 0.5), [(1344, 472), (1344, 608)]),
]
