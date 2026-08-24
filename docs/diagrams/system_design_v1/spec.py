"""Spec — 01-agent-system-design (PR Review Agent), L1 architecture.
CONTENT ONLY. Every element cited in FACTS.md; rendering lives in ../_harness/."""

META = {
 "id": "hoa_system_design_v1",
 "name": "01 Agent System Design — PR Review Agent",
 "desc": "A ReAct-pattern PR review agent: two entry points (mock demo, live), the ReAct loop, "
 "a five-tool registry that branches mock-vs-live, schema validation, and the external "
 "GitHub and LLM services it crosses a network boundary to reach.",
 "theme": "hoa-default.json",
 "drawio": "HOA_SystemDesign_v1.drawio", "svg": "system-design.svg",
 "w": 1700, "h": 1000, "svg_h": 820,
}

ZONES = [
 ("z_entry", "③ Entry points", "boundary.datasource", 40, 200, 240, 292),
 ("z_proc", "① PR Review Agent process (Node ESM)", "boundary.primary", 344, 96, 936, 680),
 ("z_loop", "ReAct loop — observe · think · act", "boundary.functional", 376, 200, 872, 240),
 ("z_ext", "② External services (network boundary)", "boundary.external", 1344, 200, 296, 336),
 ("z_out", "④ Output artifact", "boundary.observability", 1344, 600, 296, 180),
]

NODES = [
 ("n_demo","component.entry","<b>demo.js</b><br>mock LLM + fixtures", 64, 236, 160, 64),
 ("n_live","component.entry","<b>review.js</b><br>real GitHub + LLM", 64, 380, 160, 64),
 ("n_react","component.service","<b>runReActLoop()</b><br>agent.js", 408, 252, 176, 64),
 ("n_tools","component.service","<b>Tool Registry</b><br>5 tools · tools.js", 688, 252, 176, 64),
 ("n_schema","component.service","<b>Schema · validate</b><br>schema.js", 968, 252, 176, 64),
 ("n_mockllm","component.mock","<b>Simulated LLM</b><br>8 scripted steps", 408, 460, 176, 56),
 ("n_mockdata","component.mock","<b>Mock PR data</b><br>mock-data.js", 688, 460, 176, 56),
 ("n_github","component.external","<b>GitHub API</b><br>PR · diff · file · search · comment", 1368, 240, 248, 56),
 ("n_anthropic","component.external","<b>Anthropic API</b><br>review.js", 1368, 332, 248, 56),
 ("n_openai","component.external","<b>OpenAI API</b><br>review.js", 1368, 424, 248, 56),
 ("n_findings","component.artifact","<b>Findings JSON</b><br>findings · summary<br>filesReviewed · filesSkipped", 1368, 700, 248, 72),
 ("card_exit","card.invariant",
 "<b>HOW ONE ITERATION EXITS — complete, in code order</b><br>"
 "1 FINISH unparseable → retry message<br>"
 "2 FINISH valid → validate · dedupe · sort · return<br>"
 "3 unknown tool → error observation<br>"
 "4 stall xN identical → force-finish<br>"
 "5 neither FINISH nor ACTION → parse retry<br>"
 "6 maxIterations → empty output, cappedOut<br>"
 "<i>findings sort: bug → security → suggestion → nit · schema.js</i>", 408, 540, 456, 152),
]

EDGES = [
 ("e_demo","n_demo","n_react","runReActLoop","edge.primary",(1,0.5),(0,0.25),[]),
 ("e_live","n_live","n_react","runReActLoop","edge.primary",(1,0.5),(0,0.75),[(304,412),(304,300)]),
 ("e_tool","n_react","n_tools","tool.execute","edge.call",(1,0.5),(0,0.5),[]),
 ("e_val","n_react","n_schema","validate · dedupe · sort","edge.call",(0.75,1),(0.25,1),[(540,364),(1012,364)]),
 ("e_llm","n_react","n_mockllm","llmCall","edge.call",(0.5,1),(0.5,0),[]),
 ("e_fix","n_mockdata","n_tools","ctx.mockData branch","edge.data_in",(0.5,0),(0.5,1),[]),
 # gutter lanes between z_proc (right 1280) and z_ext (left 1344): 1296 / 1320, 24px apart
 ("e_gh","n_tools","n_github","fetch · post","edge.call",(0.5,0),(0,0.5),[(776,232),(1296,232),(1296,268)]),
 ("e_ant","n_live","n_anthropic","POST /v1/messages","edge.call",(0.5,1),(0,0.5),[(144,712),(1296,712),(1296,360)]),
 ("e_oai","n_live","n_openai","POST /v1/chat","edge.call",(0.75,1),(0,0.5),[(184,760),(1320,760),(1320,452)]),
 ("e_out","n_schema","n_findings","return output","edge.artifact",(0.75,1),(0,0.5),[(1100,736)]),
]
