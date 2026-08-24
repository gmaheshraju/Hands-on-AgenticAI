"""Spec — 08-eval-engineering, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
 "id": "hoa_eval_engineering_v1",
 "name": "08 Eval Engineering — Architecture",
 "desc": "The RAG eval harness: a golden Q&A set and a RAG system under test enter a "
 "nine-step runEval() pipeline, an LLM-as-judge scores three calibrated dimensions "
 "against either Gemini or a mock backend, regression gates decide PASS/FAIL against "
 "a saved baseline, and a markdown report plus a new baseline are written. Every "
 "element cites a source line in FACTS.md.",
 "theme": "hoa-default.json",
 "drawio": "HOA_EvalEngineering_v1.drawio",
 "svg": "eval-engineering.svg",
 "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_entry","③ Entry (CLI)","boundary.datasource", 40, 96, 240, 160),
 ("z_data", "④ Inputs — golden data + system under test","boundary.datasource", 40, 340, 240, 292),
 ("z_proc", "① 08-eval-engineering process (Node ESM)","boundary.primary", 344, 96, 936, 688),
 ("z_flow", "Eval pipeline — runEval(), one pass over the golden set","boundary.functional",
 376, 176, 872, 268),
 ("z_ext", "② Judge backends — only Gemini leaves the process","boundary.external",
 1344, 176, 296, 272),
 ("z_out", "⑤ Artifacts written","boundary.observability", 1344, 592, 296, 176),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_demo","component.entry",
 "<b>demo.js</b><br>runDemo()<br>perfect vs degraded", 64, 140, 160, 64),
 ("n_golden","component.artifact",
 "<b>golden-set.json</b><br>30 Q&amp;A triples<br>read at runner.js", 64, 396, 160, 64),
 ("n_rag","component.mock",
 "<b>RAG under test</b><br>injected fn<br>called at runner.js", 64, 520, 160, 64),

 ("n_runner","component.service",
 "<b>runEval()</b><br>runner.js<br>9-step pipeline", 396, 232, 160, 64),
 ("n_judge","component.agent",
 "<b>LLM-as-judge</b><br>evaluator.js<br>3 dims · Promise.all", 620, 232, 160, 64),
 ("n_regress","component.service",
 "<b>regression.js</b><br>detectRegressions<br>saveBaseline", 844, 232, 160, 64),
 ("n_reporter","component.service",
 "<b>reporter.js</b><br>generateReport<br>markdown + verdict", 1068, 232, 160, 64),
 ("n_dims","component.service",
 "<b>dimensions.js</b><br>3 rubric prompts<br>", 620, 360, 160, 64),

 ("n_gemini","component.external",
 "<b>Gemini API</b><br>gemini-2.0-flash · temp 0.1<br>evaluator.js · maxOut 1024",
 1368, 232, 248, 64),
 ("n_mockjudge","component.mock",
 "<b>createMockJudge()</b><br>word-overlap heuristic<br>evaluator.js · no API key",
 1368, 360, 248, 64),

 ("n_baseline","component.artifact",
 "<b>baselines/baseline.json</b><br>saveBaseline · regression.js", 1368, 616, 248, 48),
 ("n_out_report","component.artifact",
 "<b>reports/eval-&lt;ts&gt;.md</b><br>writeReport · reporter.js", 1368, 688, 248, 48),

 ("card_pipeline","card.invariant",
 "<b>runEval() — 9 STEPS, complete, in code order · runner.js</b><br>"
 "1 load golden-set.json · 2 create judge (mock|real)<br>"
 "3 loop: ragSystem() → judge.evaluate()<br>"
 "4 computeAggregate — skips parseError rows<br>"
 "5 loadBaseline → detectRegressions<br>"
 "6 generateReport → writeReport<br>"
 "7 saveBaseline if --save-baseline OR no baseline<br>"
 "8 print aggregate + PASS/FAIL verdict<br>"
 "9 --ci AND hasRegressions → process.exit(1)", 360, 524, 440, 140),

 ("card_gates","card.failure",
 "<b>REGRESSION GATES — every threshold, regression.js</b><br>"
 "REGRESSION_THRESHOLD_POINTS = 1 — per-dim drop<br>"
 "IMPROVEMENT_THRESHOLD_POINTS = 1 — per-dim gain<br>"
 "AGGREGATE_THRESHOLD_PERCENT = 0.05 — 5% drop<br>"
 "applied: diff &lt; -1 → regressed<br>"
 "diff &gt; +1 → improved · else unchanged<br>"
 "pctChange &lt; -0.05 → aggregateRegression<br>"
 "hasRegressions = regressions.length &gt; 0 OR agg<br>"
 "no baseline → false, and this run becomes the baseline", 824, 524, 440, 140),

 ("card_dims","card.primitive",
 "<b>THE 3 DIMENSIONS — complete, in DIMENSIONS array order · dimensions.js</b><br>"
 "faithfulness w=0.4 — grounded in sources? prompt · rubric 5→1 · 4 calibrations<br>"
 "relevance w=0.3 — answers the question? prompt · rubric · 4 calibrations<br>"
 "completeness w=0.3 — covers all key points? prompt · rubric · 4 calibrations<br>"
 "composite sums only non-parseError dims · mock judge hard-codes the same weights<br>"
 "parseJudgeResponse — 3 exits to score 0: no JSON · out of 1-5 · throw",
 360, 680, 904, 88),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_run","n_demo","n_runner","runEval() ×2","edge.primary",(1,0.5),(0,0.5),[(312,172),(312,264)]),
 ("e_golden","n_golden","n_runner","30 questions","edge.data_in",(1,0.5),(0.25,1),[(436,428)]),
 ("e_rag","n_rag","n_runner","answer + sources","edge.data_in",(1,0.5),(0.75,1),[(312,552),(312,296)]),
 ("e_eval","n_runner","n_judge","per question","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_prompt","n_judge","n_dims","3 prompts","edge.call",(0.5,1),(0.5,0),[]),
 ("e_api","n_judge","n_gemini","generateContent","edge.call",(0.5,0),(0,0.5),[(700,140),(1320,140),(1320,264)]),
 ("e_mock","n_judge","n_mockjudge","--mock","edge.call",(0.25,0),(0,0.5),[(660,208),(1296,208),(1296,392)]),
 ("e_regress","n_judge","n_regress","scores","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_report","n_regress","n_reporter","diff report","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_baseread","n_baseline","n_regress","loadBaseline","edge.data_in",(0,0.5),(0.5,1),[(1296,640),(1296,476),(924,476)]),
 ("e_basewrite","n_regress","n_baseline","saveBaseline","edge.artifact",(0.75,1),(0.5,0),[(964,500),(1492,500)]),
 ("e_reportout","n_reporter","n_out_report","writeReport","edge.artifact",(0.5,1),(0,0.5),[(1148,452),(1320,452),(1320,712)]),
]
