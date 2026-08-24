"""Spec — 30-self-improving-agent, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
 "id": "hoa_self_improving_v1",
 "name": "30 Self-Improving Agent — Research Loop + Prompt Evolution",
 "desc": "One process (demo.js main) that researches a question through an observable harness, "
 "grades its own answer, runs a postmortem on the trace, and lets an LLM rewrite its "
 "own system prompt for the next round — closing a measurable self-improvement loop. "
 "Real fetch() to LLM providers and Wikipedia; cross-session memory in SQLite. Every "
 "element cites a source line in FACTS.md.",
 "theme": "hoa-default.json",
 "drawio": "HOA_SelfImproving_v1.drawio",
 "svg": "self-improving.svg",
 "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_entry", "③ CLI + prompt store — data/prompt-history/", "boundary.datasource",
 40, 200, 216, 232),
 ("z_proc", "① Self-improvement loop — demo.js main() (Node ESM · better-sqlite3)", "boundary.primary",
 320, 96, 968, 680),
 ("z_loop", "agent.step(i) — one observe→think→act iteration", "boundary.functional",
 560, 132, 520, 236),
 ("z_ext", "② External network — real fetch(), no mock", "boundary.external",
 1352, 132, 308, 236),
 ("z_state", "④ State & persistence — data/", "boundary.observability",
 1352, 436, 308, 280),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_cli", "component.entry",
 "<b>demo.js</b><br>CLI · main() loop<br> · rounds=3", 64, 224, 176, 64),
 ("n_prompts", "component.artifact",
 "<b>prompt-history/</b><br>v{N}.json on disk<br>base→v2→v3", 64, 352, 176, 64),

 ("n_harness", "component.service",
 "<b>harness.js</b><br>run(i⇒step) wrapper<br>cap·cost·converge<br>trace JSONL", 344, 224, 176, 64),

 ("n_agent", "component.agent",
 "<b>agent.js</b><br>ResearchAgent.step<br>observe→think→act<br> · facts[]", 584, 224, 176, 64),
 ("n_llm", "component.service",
 "<b>llm.js</b><br>LLMAdapter.chat<br>3-provider fallback<br> · JSON retry", 856, 156, 176, 64),
 ("n_tools", "component.service",
 "<b>tools.js</b><br>executeTool<br>5 tools · dispatch", 856, 292, 176, 64),

 ("n_providers", "component.external",
 "<b>LLM providers</b><br>NVIDIA·Ollama·Gemini<br>real fetch()", 1376, 156, 176, 64),
 ("n_wiki", "component.external",
 "<b>Wikipedia API</b><br>REST summary+search<br>real fetch()", 1376, 292, 176, 64),

 ("n_eval", "component.service",
 "<b>evaluator.js</b><br>evaluate()<br>4 dims → composite", 584, 412, 176, 64),
 ("n_pm", "component.service",
 "<b>postmortem.js</b><br>analyzeRun()<br>7 finds · 6 prims", 832, 412, 176, 64),
 ("n_improve", "component.service",
 "<b>improver.js</b><br>generatePatch<br>applyPatch", 1080, 412, 176, 64),

 ("n_memory", "component.service",
 "<b>memory.js</b><br>SQLite agent.db · WAL<br>episodes+facts+FTS5<br> · decay", 1376, 468, 176, 64),
 ("n_scratch", "component.service",
 "<b>scratchpad.js</b><br>Write move · Map<br>park·index", 1376, 556, 176, 64),
 ("n_traces", "component.artifact",
 "<b>data/traces/</b><br>*.jsonl per run<br>harness", 1376, 644, 176, 64),

 ("card_stop", "card.invariant",
 "<b>STOP CONDITIONS — harness.run(), code order</b><br>"
 "1 AGENT_DONE — step.done (synthesize)<br>"
 "2 COST_CAP — totalCost ≥ $0.50<br>"
 "3 CONVERGENCE — zeroFactStreak ≥ 3<br>"
 "4 MAX_ITERATIONS — i &gt; 12 (demo cap)<br>"
 "cost is SIMULATED: (in+out)·0.4 / 1e6<br>"
 "thrown step logged &amp; skipped, not fatal", 344, 592, 300, 180),

 ("card_eval", "card.primitive",
 "<b>EVALUATE — 4 dims → weighted composite</b><br>"
 "factCount w0.25 · heuristic<br>"
 "sourceDiversity w0.20 · heuristic<br>"
 "coherence w0.25 · LLM-as-judge<br>"
 "completeness w0.30 · LLM-as-judge<br>"
 "Σ weights = 1.00 · no answer ⇒ all 0<br>"
 "2 heuristics + 2 real LLM grader calls", 672, 592, 296, 180),

 ("card_pm", "card.failure",
 "<b>SELF-DIAGNOSIS → THE PATCH — postmortem.js</b><br>"
 "7 findings (code order):<br>"
 "single_source · premature_synthesis<br>"
 "repeated_action · tool_failure<br>"
 "convergence_stall · no_synthesis<br>"
 "context_bloat<br>"
 "6 primitives → weakest picked<br>"
 "instructions·contextDelivery<br>"
 "contextManagement·toolInterface<br>"
 "orchestration·verification<br>"
 "→ LLM writes ONE patch → prompt v{N+1}", 996, 592, 288, 180),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 # ---- loop closure: prompt store feeds the CLI, improver writes it back ----
 ("e_load", "n_prompts", "n_cli", "loadHistory vN", "edge.data_in", (0.5, 0), (0.5, 1), []),
 ("e_cli", "n_cli", "n_harness","orchestrate round", "edge.primary", (1, 0.5), (0, 0.5), []),

 # ---- run phase ----
 ("e_run", "n_harness", "n_agent", "run(i⇒step)", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_chat", "n_agent", "n_llm", "chat", "edge.call", (0.75, 0), (0, 0.5),
 [(716, 188)]),
 ("e_prov", "n_llm", "n_providers", "fetch (fallback)", "edge.call", (1, 0.5), (0, 0.5), []),
 ("e_tool", "n_agent", "n_tools", "executeTool", "edge.call", (0.75, 1), (0, 0.5),
 [(716, 324)]),
 ("e_wiki", "n_tools", "n_wiki", "fetch", "edge.call", (1, 0.5), (0, 0.5), []),

 # ---- agent state ----
 ("e_mem", "n_agent", "n_memory", "prior facts / addFact", "edge.data_in", (1, 0.25), (0, 0.5),
 [(1300, 240), (1300, 500)]),
 ("e_pad", "n_agent", "n_scratch", "note / index", "edge.call", (1, 0.75), (0, 0.5),
 [(1276, 272), (1276, 588)]),

 # ---- improve phase (drawn as demo.js call-order pipeline; see FACTS) ----
 ("e_eval", "n_harness", "n_eval", "runResult + answer", "edge.primary", (0.5, 1), (0, 0.5),
 [(432, 444)]),
 ("e_an", "n_eval", "n_pm", "then analyze", "edge.analysis", (1, 0.5), (0, 0.5), []),
 ("e_find", "n_pm", "n_improve","findings + scores", "edge.analysis", (1, 0.5), (0, 0.5), []),
 ("e_patch", "n_improve", "n_prompts","save patch → v{N+1}", "edge.artifact", (0.5, 1), (0.5, 1),
 [(1168, 540), (152, 540)]),

 # ---- observability artifact ----
 ("e_trace", "n_harness", "n_traces", "trace JSONL", "edge.artifact", (0.75, 1), (0, 0.5),
 [(476, 388), (1324, 388), (1324, 676)]),
]
