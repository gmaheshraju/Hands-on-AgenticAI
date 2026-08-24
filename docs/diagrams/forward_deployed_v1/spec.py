"""Spec — 14-forward-deployed-engineering, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
 "id": "hoa_forward_deployed_v1",
 "name": "14 Forward Deployed Engineering — Architecture",
 "desc": "The FDE customer-onboarding toolkit as one Node process: two pluggable connectors "
 "over a 4-method contract, a quality-scored extraction stage, a domain adapter and "
 "an eval builder that are siblings over the same corpus, a 9-check readiness gate, "
 "and the pilot dashboard it serves. Every element cites a source line in FACTS.md.",
 "theme": "hoa-default.json",
 "drawio": "HOA_ForwardDeployed_v1.drawio",
 "svg": "forward-deployed.svg",
 "w": 1700, "h": 800, "svg_h": 720,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_entry","③ Entry — node src/demo.js","boundary.datasource", 40, 88, 240, 112),
 ("z_src", "② Data sources — pluggable connectors","boundary.external", 40, 268, 240, 328),
 ("z_proc", "① FDE onboarding toolkit — one Node ESM process","boundary.primary", 344, 96, 952, 600),
 ("z_flow", "Onboarding pipeline — demo.js Steps 2 → 5, left to right","boundary.functional", 376, 200, 888, 200),
 ("z_out", "④ Outputs & pilot surface (HTTP)","boundary.observability", 1360, 232, 296, 300),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_cli","component.entry",
 "<b>demo.js</b><br>6-step pipeline<br>run()", 64, 124, 192, 64),

 ("n_fs","component.external",
 "<b>FilesystemConnector</b><br>reads data/sample-docs<br>txt md json pdf docx", 64, 296, 192, 64),
 ("n_api","component.mock",
 "<b>ApiConnector</b><br>MOCK_API_DOCS — n=5<br>paginated, no network", 64, 400, 192, 64),
 ("n_base","component.service",
 "<b>BaseConnector</b><br>4-method contract<br>healthCheck default", 64, 504, 192, 64),

 ("n_proc","component.service",
 "<b>DocumentProcessor</b><br>processAll()<br>extract + score quality", 408, 252, 176, 64),
 ("n_adapt","component.agent",
 "<b>DomainAdapter</b><br>adapt()<br>vocab·fewshot·prompt", 624, 252, 176, 64),
 ("n_eval","component.agent",
 "<b>EvalBuilder</b><br>generateCandidates<br>acceptAll<br>export()", 840, 252, 176, 64),
 ("n_check","component.service",
 "<b>DeploymentChecklist</b><br>run() — 9 checks<br>ready = 0 critical", 1056, 252, 176, 64),

 ("n_evalfile","component.artifact",
 "<b>data/eval-set.json</b><br>written by export()<br>re-read by check 7", 1384, 268, 248, 64),
 ("n_dash","component.service",
 "<b>createDashboardServer</b><br>express · PORT || 3014<br>GET / · GET+POST /api/state<br>POST /api/issues · /api/activity", 1384, 356, 248, 64),
 ("n_html","component.artifact",
 "<b>public/dashboard.html</b><br>served by GET /", 1384, 452, 248, 56),

 ("card_quality","card.failure",
 "<b>EXTRACTION QUALITY GATE — _assessQuality, code order</b><br>"
 "charCount == 0 → status EMPTY, score 0, hard stop<br>"
 "wordCount < 10 → 'Very short document'<br>"
 "alphaRatio < 0.3 → 'Possible garbage output'<br>"
 "text contains U+FFFD → 'possible encoding issue'<br>"
 "charCount < 20% of file size → 'may be incomplete'<br>"
 "score = 1.0 - 0.15 x warnings, clamped; OK / WARNING",
 376, 428, 424, 104),

 ("card_qtypes","card.primitive",
 "<b>EVAL CANDIDATES — all 5 types, code order, evalBuilder.js</b><br>"
 "1 factual · easy — dollar amounts, first 2 per doc<br>"
 "2 comprehension · medium — numbered sections, first 2<br>"
 "3 analytical · hard — risk terms, needs >= 2<br>"
 "4 extraction · easy — timeframes, needs >= 2<br>"
 "5 application · medium — 'shall' clauses, needs >= 2<br>"
 "docs with quality FAILED are skipped before all five",
 376, 560, 424, 104),

 ("card_checks","card.invariant",
 "<b>DEPLOYMENT READINESS — all 9 checks, code order-</b><br>"
 "1 connector configured + tested — critical<br>"
 "2 documents ingested >=5, failed <=2 — critical<br>"
 "3 extraction quality >= 0.7 — warning<br>"
 "4 domain vocabulary >= 10 terms — critical<br>"
 "5 system prompt > 500 chars — critical<br>"
 "6 eval set >= 15 accepted — critical<br>"
 "7 eval set file on disk, parseable — warning<br>"
 "8 pilot timeline days remaining > 0 — warning<br>"
 "9 few-shot examples >= 5 — warning<br>"
 "ready = (critical failures == 0) — warnings never block",
 840, 428, 424, 164),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_cli_fs", "n_cli","n_fs", "new FilesystemConnector","edge.call",(0.25,1),(0.25,0),[]),
 ("e_cli_api", "n_cli","n_api", "new ApiConnector","edge.call",(0.75,1),(1,0.25),[(296,188),(296,416)]),

 ("e_fs_base", "n_fs","n_base", "extends","edge.data_in",(0,0.5),(0,0.5),[(48,328),(48,536)]),
 ("e_api_base", "n_api","n_base","extends","edge.data_in",(0.25,1),(0.25,0),[]),

 ("e_fs_proc", "n_fs","n_proc", "processAll(fs)","edge.data_in",(1,0.5),(0,0.25),[(328,328),(328,268)]),
 ("e_api_proc", "n_api","n_proc","processAll(api)","edge.data_in",(1,0.75),(0,0.75),[(352,448),(352,300)]),

 ("e_proc_adapt","n_proc","n_adapt","allDocs → adapt()","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_proc_eval", "n_proc","n_eval", "same allDocs","edge.primary",(0.5,1),(0.25,1),[(496,336),(884,336)]),

 ("e_proc_check", "n_proc","n_check", "processingStats","edge.primary",(0.25,1),(0.75,1),[(452,384),(1188,384)]),
 ("e_adapt_check","n_adapt","n_check","domainStats + systemPrompt","edge.primary",(0.75,1),(0.25,1),[(756,360),(1100,360)]),
 ("e_eval_check", "n_eval","n_check", "evalStats","edge.primary",(1,0.5),(0,0.5),[]),

 ("e_eval_file", "n_eval","n_evalfile","export() writes JSON","edge.artifact",(0.75,0),(0,0.75),[(972,216),(1320,216),(1320,316)]),
 ("e_file_check", "n_evalfile","n_check","check 7 re-reads disk","edge.data_in",(0,0.25),(0.75,0),[(1344,284),(1344,240),(1188,240)]),

 ("e_check_dash", "n_check","n_dash","checklistReport → dashboardState","edge.primary",(1,0.5),(0,0.5),[(1296,284),(1296,388)]),
 ("e_dash_html", "n_dash","n_html","GET / reads it per request","edge.artifact",(0.5,1),(0.5,0),[]),
]
