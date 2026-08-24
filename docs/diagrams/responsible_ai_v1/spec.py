"""Spec — 13-responsible-ai, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
    "id":      "hoa_responsible_ai_v1",
    "name":    "13 Responsible AI — Bias Audit Pipeline Architecture",
    "desc":    "The bias-audit pipeline that interrogates an opaque resume scorer: fixture-driven "
               "matched pairs, counterfactual testing across the system-under-test boundary, four "
               "from-scratch fairness tests, an optional intersectional branch, and the EU AI Act "
               "model card written as Markdown and JSON. Every element cites a source line in FACTS.md.",
    "theme":   "hoa-default.json",
    "drawio":  "HOA_ResponsibleAi_v1.drawio",
    "svg":     "responsible-ai.svg",
    "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_entry","③ Entry + fixtures","boundary.datasource",             40, 216,  176, 264),
 ("z_proc", "① 13-responsible-ai audit pipeline (Node ESM)","boundary.primary", 280, 96, 1016, 680),
 ("z_flow", "runDemo() — one pass, 5 numbered steps · demo.js:146","boundary.functional", 320, 200, 936, 296),
 ("z_sut",  "② System under test — opaque contract, MOCK scorer","boundary.external", 1360, 200, 296, 232),
 ("z_out",  "④ Artifacts written","boundary.observability",       1360, 560,  296, 200),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_cli","component.entry",
  "<b>demo.js</b><br>CLI · 3 modes<br>:147 :148 :149", 48, 248, 160, 64),
 ("n_templates","component.mock",
  "<b>resumeTemplates.js</b><br>5 templates :5<br>attributes :144<br>universities :215", 48, 364, 160, 72),

 ("n_builder","component.service",
  "<b>datasetBuilder.js</b><br>matched :38 · proxy :179<br>intersectional :126", 344, 248, 176, 64),
 ("n_cf","component.service",
  "<b>counterfactual.js</b><br>testPair :60 · agg :123<br>batch concurrency 5 :91", 576, 248, 176, 64),
 ("n_stats","component.service",
  "<b>statistics.js</b><br>analyzeResults :351<br>4 tests from scratch", 808, 248, 176, 64),
 ("n_card","component.service",
  "<b>modelCard.js</b><br>generateModelCard :34<br>renderMarkdown :177", 1040, 248, 176, 64),
 ("n_inter","component.service",
  "<b>intersectional.js</b><br>analyzeIntersections :24<br>--full only :234", 808, 396, 176, 64),

 ("n_scorer","component.external",
  "<b>scoringFn — the audited system</b><br>createBiasedScorer() demo.js:40<br>"
  "createFairScorer() --fair :116", 1384, 236, 240, 64),

 ("n_md","component.artifact",
  "<b>output/MODEL_CARD.md</b><br>renderMarkdown :380 :381", 1384, 596, 248, 56),
 ("n_json","component.artifact",
  "<b>output/model_card.json</b><br>JSON.stringify(card) :382", 1384, 676, 248, 56),

 ("card_tests","card.invariant",
  "<b>FAIRNESS TESTS — complete, in code order · analyzeResults :351</b><br>"
  "1 chiSquaredTest :365 — 2x2 flip-rate independence, df=1<br>"
  "2 welchTTest :368 · 3 cohensD :371 · 4 demographicParity :376<br>"
  "biasDetected = chiSq.sig OR t.sig OR NOT passes80PercentRule :391<br>"
  "significance is p &lt; 0.05 in both tests — :208 :269", 344, 528, 424, 104),

 ("card_findings","card.failure",
  "<b>FINDING LADDER — generateFindings :417, in code order</b><br>"
  "1 HIGH decision_flip_bias — chi-squared significant :420 :423<br>"
  "2 CRITICAL if effect large else HIGH · score_disparity :432 :433<br>"
  "3 CRITICAL disparate_impact — 80% rule fails :439 :442<br>"
  "4 INFO no_bias_detected — only if 1-3 all silent :448 :451<br>"
  "risk: CRITICAL → HIGH :419 · HIGH → MEDIUM :425 · else LOW :430<br>"
  "risk HIGH → NOT_APPROVED :133 — one CRITICAL is enough", 344, 656, 424, 116),

 ("card_sections","card.primitive",
  "<b>MODEL CARD — 10 sections, code order · generateModelCard :34</b><br>"
  "1 modelDetails :42 · 2 intendedUse :54 · 3 riskClassification :65<br>"
  "4 trainingData :75 · 5 metrics :83 · 6 biasAndFairness :93<br>"
  "7 ethicalConsiderations :101 · 8 limitations :112<br>"
  "9 recommendations :132 · 10 regulatoryCompliance :150", 800, 592, 456, 104),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_cli","n_cli","n_builder","attribute · 25 pairs (50 if --full) :152","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_tmpl","n_templates","n_builder","templates + demographic data :9","edge.data_in",
  (1,0.5),(0.5,1),[(432,400)]),
 ("e_pairs","n_builder","n_cf","resumeA / resumeB :106","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_score","n_cf","n_scorer","scoringFn(A) ‖ (B) :61-63","edge.call",
  (0.5,0),(0,0.5),[(664,160),(1328,160),(1328,268)]),
 ("e_ret","n_scorer","n_cf","score · decision · summary :105-108","edge.data_in",
  (0.75,0),(0.75,0),[(1564,136),(708,136)]),
 ("e_agg","n_cf","n_stats","aggregateResults() :207","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_stats","n_stats","n_card","combinedStats :216","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_ipairs","n_builder","n_inter","intersectional pairs :178","edge.analysis",
  (0.25,1),(0,0.5),[(388,428)]),
 ("e_iscore","n_scorer","n_inter","re-scores each resume :239","edge.call",
  (0.5,1),(1,0.5),[(1504,428)]),
 ("e_icard","n_inter","n_card","intersectionalReport :246","edge.analysis",
  (0.75,0),(0.25,1),[(940,356),(1084,356)]),
 ("e_md","n_card","n_md","writeModelCard() :374","edge.artifact",
  (0.75,1),(0,0.5),[(1172,492),(1304,492),(1304,624)]),
 ("e_json","n_card","n_json","same call, both formats :382","edge.artifact",
  (1,0.75),(0,0.5),[(1352,296),(1352,704)]),
]
