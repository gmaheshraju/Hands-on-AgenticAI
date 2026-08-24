"""Spec — 09-fine-tuning-vs-rag, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
 "id": "hoa_finetune_vs_rag_v1",
 "name": "09 Fine-Tuning vs RAG — Architecture",
 "desc": "One ticket-classification problem solved four ways over the same 30 held-out "
 "tickets: zero-shot, few-shot, TF-IDF retrieval, and a mocked fine-tuned model. "
 "The evaluation harness, the single external API, the three artifacts it writes, "
 "and what is simulated rather than real. Every element cites a source line in "
 "FACTS.md.",
 "theme": "hoa-default.json",
 "drawio": "HOA_FineTuneVsRag_v1.drawio",
 "svg": "finetune-vs-rag.svg",
 "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_in", "③ Inputs — CLI + labelled corpus", "boundary.datasource", 40, 240, 216, 248),
 ("z_proc", "① 09-fine-tuning-vs-rag process (Node ESM)", "boundary.primary", 320, 96, 944, 680),
 ("z_flow", "Head-to-head evaluation — one pass, 30 held-out tickets, four approaches",
 "boundary.functional", 352, 176, 776, 304),
 ("z_ext", "② External network — the only one", "boundary.external", 1360, 216, 296, 176),
 ("z_out", "④ Artifacts written", "boundary.observability", 1360, 568, 296, 216),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_demo","component.entry",
 "<b>demo.js</b><br>CLI · 5 steps<br>--skip-eval", 64, 280, 168, 64),
 ("n_corpus","component.mock",
 "<b>tickets.json</b> 100<br>test-set.json 30<br>4 categories", 64, 392, 168, 64),
 ("n_prep","component.service",
 "<b>fineTuning.js</b><br>validate<br>writeTrainingFiles", 384, 280, 176, 64),
 ("n_eval","component.service",
 "<b>evaluate.js</b><br>runEvaluation<br>evaluateApproach<br>computeMetrics",
 664, 264, 176, 96),
 ("n_prompt","component.agent",
 "<b>prompting.js</b><br>classifyZeroShot<br>classifyFewShot<br>8 few-shot ex.",
 904, 192, 176, 64),
 ("n_rag","component.agent",
 "<b>rag.js</b><br>SimpleVectorStore<br>TF-IDF · cosine<br>retrieve top-5",
 904, 280, 176, 64),
 ("n_ft","component.agent",
 "<b>fineTuning.js</b><br>classifyWithFineTuning<br> — MOCK, no weights", 904, 368, 176, 64),
 ("n_gemini","component.external",
 "<b>Google Gemini API</b><br>gemini-2.0-flash<br>@google/generative-ai ^0.24.0<br>"
 "the ONLY network call", 1384, 264, 248, 96),
 ("n_compare","component.service",
 "<b>comparison.js</b><br>generateComparison<br>6 md sections", 1064, 544, 176, 64),
 ("n_train","component.artifact",
 "<b>data/fine-tuning/ — 3 files</b><br>OpenAI · Gemini · instruction", 1384, 604, 248, 48),
 ("n_results","component.artifact",
 "<b>evaluation-results.json</b><br>evaluate.js — not committed", 1384, 664, 248, 48),
 ("n_md","component.artifact",
 "<b>COMPARISON.md</b><br>the deliverable · demo.js", 1384, 724, 248, 48),

 ("card_gate","card.invariant",
 "<b>DATA QUALITY GATE — 5 checks, complete, in code order</b><br>"
 "1 imbalance max/min &gt; 2 · 2 corpus &lt; 50<br>"
 "3 text &lt; 20 chars · 4 duplicate texts<br>"
 "5 category outside the 4-item whitelist<br>"
 "<b>it does not gate</b> — demo.js prints the issues<br>"
 "and continues to Step 2 unconditionally", 352, 544, 424, 96),
 ("card_appr","card.primitive",
 "<b>THE 4 EVALUATED APPROACHES — evaluate.js, in code order</b><br>"
 "1 Zero-Shot — categories + ticket, nothing else<br>"
 "2 Few-Shot — + 8 hand-picked examples<br>"
 "3 RAG — + top-5 TF-IDF neighbours of the 100<br>"
 "4 Fine-Tuned — persona prompt, ticket only<br>"
 "one shared testSet · one computeMetrics", 352, 656, 424, 96),
 ("card_mock","card.failure",
 "<b>SIMULATED, NOT REAL — the complete list</b><br>"
 "1 no fine-tuned model: a persona prompt stands in<br>"
 "2 its latency is the real API latency × 0.6<br>"
 "3 no vector DB: in-process TF-IDF maps<br>"
 "4 tokens are text.length / 4, never metered<br>"
 "5 no API key → generateSampleResults() invents them", 816, 656, 440, 96),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_load","n_corpus","n_demo","readFileSync","edge.data_in",(0.5,0),(0.5,1),[]),
 ("e_prep","n_demo","n_prep","100 training tickets","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_eval","n_prep","n_eval","runEvaluation","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_index","n_corpus","n_eval","re-read","edge.data_in",(1,0.5),(0,0.75),
 [(600,424),(600,336)]),
 ("e_zs","n_eval","n_prompt","zero-shot + few-shot","edge.primary",(1,0.25),(0,0.5),
 [(872,288),(872,224)]),
 ("e_rag","n_eval","n_rag","index 100 once","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_ft","n_eval","n_ft","ticket only","edge.primary",(1,0.75),(0,0.5),[(872,336),(872,400)]),
 ("e_api_p","n_prompt","n_gemini","prompt → category","edge.call",(1,0.5),(0,0.25),
 [(1240,224),(1240,288)]),
 ("e_api_r","n_rag","n_gemini","prompt + 5 neighbours","edge.call",(1,0.5),(0,0.5),[]),
 ("e_api_f","n_ft","n_gemini","persona prompt","edge.call",(1,0.5),(0,0.75),
 [(1200,400),(1200,336)]),
 ("e_train","n_prep","n_train","3 training files","edge.artifact",(0.5,1),(0,0.5),
 [(472,520),(1280,520),(1280,628)]),
 ("e_results","n_eval","n_results","allResults","edge.artifact",(0.25,1),(0,0.5),
 [(708,496),(1304,496),(1304,688)]),
 ("e_cmp","n_eval","n_compare","allResults","edge.primary",(0.75,1),(0,0.5),[(796,576)]),
 ("e_md","n_compare","n_md","writeFileSync","edge.artifact",(1,0.5),(0,0.5),
 [(1328,576),(1328,748)]),
]
