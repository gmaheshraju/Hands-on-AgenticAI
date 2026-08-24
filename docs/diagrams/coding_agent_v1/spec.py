"""Spec — 16-ai-coding-agent, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
 "id": "hoa_coding_agent_v1",
 "name": "16 AI Coding Agent — Architecture",
 "desc": "Issue-to-PR pipeline: parse a GitHub issue, plan a fix with a rule-based planner, "
 "patch the target repo on disk, run its tests in a child process with a bounded "
 "self-correction loop, and emit a PR description. The repo explorer is a shared "
 "tool surface, not a pipeline stage. Every element cites a source line in FACTS.md.",
 "theme": "hoa-default.json",
 "drawio": "HOA_CodingAgent_v1.drawio",
 "svg": "coding-agent.svg",
 "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_entry", "③ Entry — CLI and issue source", "boundary.datasource", 40, 200, 176, 288),
 ("z_proc", "① 16-ai-coding-agent process (Node ESM, no LLM)", "boundary.primary", 280, 96, 1016, 680),
 ("z_flow", "runAgent — six numbered steps, straight-line (agent.js)", "boundary.functional", 320, 216, 936, 152),
 ("z_repo", "② Target repo + child process (real disk, real OS)", "boundary.external", 1360, 216, 296, 232),
 ("z_out", "④ Pull-request output", "boundary.observability", 1360, 512, 296, 192),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_demo", "component.entry",
 "<b>demo.js</b><br>CLI · mock #1<br>", 64, 244, 128, 64),
 ("n_github", "component.external",
 "<b>GitHub REST</b><br>fetch()<br>URL input only", 64, 372, 128, 64),

 ("n_agent", "component.agent",
 "<b>runAgent()</b><br>agent.js · 6 steps", 340, 128, 160, 56),

 ("n_parse", "component.service",
 "<b>parseIssue()</b><br>issueParser.js<br>3 input forms", 340, 264, 160, 64),
 ("n_plan", "component.service",
 "<b>createPlan()</b><br>planner.js<br>rule-based, no LLM", 524, 264, 160, 64),
 ("n_coder", "component.service",
 "<b>createCoder()</b><br>coder.js<br>diff + applyChanges", 708, 264, 160, 64),
 ("n_test", "component.service",
 "<b>selfCorrectLoop()</b><br>testRunner.js<br>≤ 3 retries", 892, 264, 160, 64),
 ("n_prgen", "component.service",
 "<b>generatePR()</b><br>prGenerator.js<br>title·body·labels", 1076, 264, 160, 64),

 ("n_explorer", "component.service",
 "<b>createExplorer()</b><br>repoExplorer.js<br>5 tools · shared", 700, 424, 176, 64),

 ("n_files", "component.artifact",
 "<b>sample-project/</b><br>src/app.js · tests/app.test.js<br>planted bug", 1384, 260, 248, 64),
 ("n_proc", "component.external",
 "<b>child process</b><br>execSync(testCommand)<br>node --test · 30s timeout", 1384, 356, 248, 64),

 ("n_pr", "component.artifact",
 "<b>PR object</b><br>title·body·branch·labels", 1384, 552, 248, 56),
 ("n_stdout", "component.artifact",
 "<b>stdout</b><br>formatPRForDisplay", 1384, 632, 248, 56),

 ("card_loop", "card.invariant",
 "<b>SELF-CORRECTION LOOP — complete, in code order</b><br>"
 "for attempt = 0 .. maxRetries — default maxRetries 3<br>"
 "1 runTests() on EVERY attempt — fresh execSync, no cache<br>"
 "2 if result.passed → return immediately<br>"
 "3 else if attempt &lt; maxRetries → attemptCorrection<br>"
 "4 retries exhausted → one MORE runTests()<br>"
 "corrector writes the file itself, not via the coder",
 320, 508, 456, 112),

 ("card_bug", "card.failure",
 "<b>BUG-TYPE TAXONOMY — 4 branches, first match wins</b><br>"
 "1 missing-null-check — hasNullError &amp;&amp; has500<br>"
 "2 unhandled-error — has500 alone<br>"
 "3 missing-route — has404 alone<br>"
 "4 general — fallback, summary = issue title<br>"
 "ONLY branch 1 emits code steps — generateSteps<br>"
 "branches 2-4 fall through to test steps only",
 800, 508, 456, 112),

 ("card_fix", "card.primitive",
 "<b>FIX EMITTERS — the generateFix switch, complete and in code order</b><br>"
 "1 missing-null-check → fixMissingNullCheck"
 "2 unhandled-error → fixUnhandledError, which returns its input unchanged<br>"
 "3 default → originalContent.replace(oldCode, newCode), and only when BOTH are set on the step; otherwise the input is returned<br>"
 "the null-check SHAPE is sniffed from the file&#39;s own text, in this order —<br>"
 "isExpress → res.status(404).json · isRawHttp → res.writeHead(404) · neither → throw new Error<br>"
 "the guard is spliced in immediately after the lookup line, indentation copied from that line",
 320, 644, 936, 104),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_start", "n_demo", "n_agent", "runAgent(config)", "edge.primary",
 (1, 0.5), (0, 0.5), [(256, 276), (256, 156)]),
 ("e_issue", "n_github", "n_parse", "issue JSON", "edge.data_in",
 (1, 0.5), (0, 0.25), [(268, 404), (268, 280)]),

 ("e_s1", "n_agent", "n_parse", "[1/6]", "edge.primary", (0.5, 1), (0.5, 0), []),
 ("e_s3", "n_parse", "n_plan", "parsed issue", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_s4", "n_plan", "n_coder", "plan.steps[]", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_s5", "n_coder", "n_test", "changes[]", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_s6", "n_test", "n_prgen", "testResult", "edge.primary", (1, 0.5), (0, 0.5), []),

 ("e_plan_x", "n_plan", "n_explorer", "gatherContext", "edge.call",
 (0.5, 1), (0, 0.5), [(604, 456)]),
 ("e_code_x", "n_coder", "n_explorer", "readFile", "edge.call", (0.5, 1), (0.5, 0), []),
 ("e_test_x", "n_test", "n_explorer", "readFile · searchCode", "edge.call",
 (0.5, 1), (0.75, 0), [(972, 400), (832, 400)]),

 ("e_x_repo", "n_explorer", "n_files", "listFiles · readFile · searchCode", "edge.data_in",
 (1, 0.5), (0, 0.75), [(1320, 456), (1320, 308)]),
 ("e_code_repo", "n_coder", "n_files", "applyChanges → writeFile", "edge.artifact",
 (0.75, 0), (0, 0.25), [(828, 200), (1296, 200), (1296, 276)]),

 ("e_exec", "n_test", "n_proc", "execSync", "edge.call",
 (0.75, 1), (0, 0.25), [(1012, 372)]),
 ("e_back", "n_proc", "n_test", "raw output → parseFailures", "edge.analysis",
 (0, 0.75), (0.25, 1), [(1296, 404), (1296, 344), (932, 344)]),

 ("e_pr", "n_prgen", "n_pr", "PR object", "edge.artifact",
 (1, 0.5), (0, 0.5), [(1272, 296), (1272, 580)]),
 ("e_disp", "n_pr", "n_stdout", "formatPRForDisplay", "edge.artifact",
 (0.5, 1), (0.5, 0), []),
]
