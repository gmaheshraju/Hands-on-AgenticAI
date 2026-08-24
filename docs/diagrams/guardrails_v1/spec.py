"""Spec — 07-guardrails, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
 "id": "hoa_guardrails_v1",
 "name": "07 Guardrails — Prompt Injection Test Suite + Defense Layer",
 "desc": "One process that replays 88 attack prompts and 50 benign control queries through a "
 "three-layer prompt-injection defense, keeps the training and held-out sets apart "
 "end to end, and grades itself on the held-out rate alone. Every element cites a "
 "source line in FACTS.md.",
 "theme": "hoa-default.json",
 "drawio": "HOA_Guardrails_v1.drawio",
 "svg": "guardrails.svg",
 "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_in", "③ Inputs — CLI + corpora", "boundary.datasource",
 40, 240, 216, 376),
 ("z_proc", "① 07-guardrails process (Node ESM · no network, no real LLM)", "boundary.primary",
 320, 96, 976, 684),
 ("z_pipe", "Per-input defense pipeline — L1 → target → L3", "boundary.functional",
 528, 216, 752, 256),
 ("z_out", "④ Reported output (stdout only)", "boundary.observability",
 1360, 504, 296, 144),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_cli", "component.entry",
 "<b>demo.js</b><br>CLI · default / --e2e<br>/ --verbose", 64, 272, 168, 64),
 ("n_train", "component.external",
 "<b>Training corpora</b><br>5 files · 59 attacks<br>runner.js", 64, 368, 168, 64),
 ("n_held", "component.external",
 "<b>Held-out corpora</b><br>held-out.json · 29<br>runner.js", 64, 448, 168, 64),
 ("n_legit", "component.mock",
 "<b>LEGITIMATE_QUERIES</b><br>50 control queries<br>defense.js", 64, 528, 168, 64),

 ("n_runner", "component.service",
 "<b>runAllAttacks()</b><br>runner.js<br>88 attacks + 50 queries<br>tagged training/held-out",
 336, 256, 176, 96),

 ("n_defend", "component.service",
 "<b>L1 defend()</b><br>scanInput 156 regex<br>block ≥ 0.5 · warn ≥ 0.3", 560, 272, 176, 64),
 ("n_llm", "component.agent",
 "<b>simulateNaiveLLM()</b><br>runner.js — SIMULATED<br>no API call, 6 branches", 800, 272, 176, 64),
 ("n_validate", "component.service",
 "<b>L3 validateOutput()</b><br>defense.js<br>5 violation checks", 1040, 272, 176, 64),
 ("n_sandwich", "component.service",
 "<b>L2 sandwich prompt</b><br>defense.js<br>canary token", 800, 384, 176, 64),

 ("n_summary", "component.service",
 "<b>buildSummary()</b><br>runner.js<br>bySource split", 560, 520, 176, 64),
 ("n_scores", "component.service",
 "<b>calculateScores()</b><br>scorer.js · gaps, p95<br>computeGrade", 840, 520, 176, 64),

 ("n_out", "component.artifact",
 "<b>stdout report</b><br>printResults runner.js<br>printScoreReport scorer.js",
 1384, 544, 248, 64),

 ("card_scan", "card.primitive",
 "<b>scanInput() — 9 checks · normalize</b><br>"
 "1 direct_override w1.00 · 37 regex<br>"
 "2 role_hijacking w1.00 · 33 regex<br>"
 "3 extraction w0.95 · 36 regex<br>"
 "4 encoding w0.95 · 21 regex<br>"
 "5 indirect_inject. w1.00 · 29 regex<br>"
 "6 context flooding &gt;2000ch, &gt;20 nl → 0.40<br>"
 "7 zero-width chars &gt;3 → 0.70<br>"
 "8 base64 decode + rescan → 0.85<br>"
 "9 hex decode + rescan → 0.85<br>"
 "conf = 0.65 + 0.15/extra match, cap 1.0", 336, 616, 304, 160),

 ("card_layers", "card.invariant",
 "<b>THREE LAYERS — defense.js, in call order</b><br>"
 "L1 input defend() → scanInput<br>"
 " block if conf &gt;= 0.5, warn &gt;= 0.3<br>"
 " blocked ⇒ target never called<br>"
 "L2 prompt buildSandwichedPrompt()<br>"
 " USER INPUT START/END markers<br>"
 " reminder block + canary<br>"
 "L3 output validateOutput()<br>"
 " canary · prompt leak n-gram<br>"
 " PII 5 kinds · markers<br>"
 " topic drift → safe", 656, 616, 304, 160),

 ("card_grade", "card.failure",
 "<b>GRADED ON HELD-OUT ONLY — scorer.js</b><br>"
 "training 59 — the regexes were tuned on them<br>"
 "held-out 29 — never shown<br>"
 "both run the SAME defend()<br>"
 "split kept apart in buildSummary<br>"
 "grade = f(held-out, FP, latency)<br>"
 " detect 0-50 · FP 0-30<br>"
 " latency 0-20 → A/B/C/D/F<br>"
 "verdict gates runner.js<br>"
 " held-out &gt;=70% · FP &lt;5% · avg &lt;100ms<br>"
 "observed run: 100.0% / 86.2% · 0 FP · 0.25ms", 976, 616, 304, 160),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_cli", "n_cli", "n_runner", "3 modes", "edge.primary", (1, 0.5), (0, 0.5),
 [(296, 304)]),
 ("e_train", "n_train", "n_runner", "59 tuned", "edge.data_in", (1, 0.5), (0, 0.25),
 [(288, 400), (288, 280)]),
 ("e_held", "n_held", "n_runner", "29 unseen", "edge.data_in", (1, 0.5), (0, 0.75),
 [(264, 480), (264, 328)]),
 ("e_legit", "n_legit", "n_runner", "50 benign controls", "edge.data_in", (1, 0.5), (0.5, 1),
 [(424, 560)]),

 ("e_run", "n_runner", "n_defend", "prompt", "edge.primary", (1, 0.5), (0, 0.5),
 [(520, 304)]),
 ("e_allow", "n_defend", "n_llm", "allow", "edge.primary", (1, 0.5), (0, 0.5),
 [(740, 304)]),
 ("e_sand", "n_sandwich", "n_llm", "demo-only", "edge.call", (0.5, 0), (0.5, 1),
 [(888, 360)]),
 ("e_resp", "n_llm", "n_validate", "response", "edge.primary", (1, 0.5), (0, 0.5),
 [(980, 304)]),
 ("e_back", "n_validate", "n_runner", "outputCheck → result", "edge.primary", (0.5, 0), (0.5, 0),
 [(1128, 192), (424, 192)]),

 ("e_block", "n_defend", "n_summary", "blocked", "edge.stop", (0.25, 1), (0.25, 0),
 [(604, 440)]),
 ("e_res", "n_runner", "n_summary", "results[]", "edge.primary", (0.75, 1), (0, 0.25),
 [(468, 536)]),
 ("e_score", "n_summary", "n_scores", "runResults", "edge.primary", (1, 0.5), (0, 0.5),
 [(748, 552)]),

 ("e_print", "n_summary", "n_out", "printResults", "edge.artifact", (0.5, 0), (0, 0.25),
 [(648, 496), (1312, 496), (1312, 560)]),
 ("e_rep", "n_scores", "n_out", "grade + gates", "edge.artifact", (1, 0.5), (0, 0.75),
 [(1056, 552), (1056, 592)]),
]
