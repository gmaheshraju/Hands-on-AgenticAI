"""Spec — 11-cost-latency, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
    "id":      "hoa_cost_latency_v1",
    "name":    "11 Cost & Latency — Architecture",
    "desc":    "The cost-optimization pipeline for a simulated support agent: two CLI entries over a "
               "50-conversation fixture, five per-turn stages with the semantic cache first and "
               "short-circuiting, a MOCK model boundary carrying the price table and the canned "
               "response corpus, and the stdout comparison table. Every element cites a source line "
               "in FACTS.md.",
    "theme":   "hoa-default.json",
    "drawio":  "HOA_CostLatency_v1.drawio",
    "svg":     "cost-latency.svg",
    "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_entry", "③ Entry & fixture (CLI)", "boundary.datasource",              40, 128,  176, 296),
 ("z_proc",  "① 11-cost-latency process (Node ESM, no network)", "boundary.primary",
                                                                                280,  96, 1016, 680),
 ("z_flow",  "② Per-turn pipeline — runOptimizedPipeline benchmark.js:27",
             "boundary.functional",                                             320, 200,  936, 176),
 ("z_model", "④ Simulated model boundary (in-process, MOCK)", "boundary.external",
                                                                               1360, 280,  296, 216),
 ("z_out",   "⑤ Deliverable — stdout", "boundary.observability",      1360, 560,  296, 200),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 # -- entry & fixture --------------------------------------------------------
 ("n_demo", "component.entry",
  "<b>demo.js</b><br>CLI · 3 demos :19<br>ablation :135-153",                 56, 168, 144, 56),
 ("n_bench", "component.entry",
  "<b>benchmark.js</b><br>runOptimized :27<br>CLI main :281",                      56, 252, 144, 56),
 ("n_convs", "component.mock",
  "<b>conversations.json</b><br>50 fixtures :307<br>1–4 user turns each",     56, 336, 144, 56),

 # -- the per-turn pipeline, left to right, in code order --------------------
 ("n_cache", "component.service",
  "<b>SemanticCache</b><br>lookup() :101<br>cos ≥ 0.60 · TTL 1h",       344, 248, 160, 64),
 ("n_compress", "component.service",
  "<b>summarizeHistory</b><br>promptCompress :26<br>keep last 2 :35",             528, 248, 160, 64),
 ("n_route", "component.service",
  "<b>classifyComplexity</b><br>modelRouter :15<br>routeToModel :77",             712, 248, 160, 64),
 ("n_llm", "component.agent",
  "<b>simulateLLMCall</b><br>baseline.js :35<br>tool ctx ×4 :39",            896, 248, 160, 64),
 ("n_term", "component.service",
  "<b>applyEarlyTermination</b><br>earlyTermination :70<br>perceivedLatency :117",
                                                                                 1080, 248, 160, 64),

 # -- the MOCK model boundary ------------------------------------------------
 ("n_pricing", "component.external",
  "<b>MODEL_PRICING</b><br>baseline.js:18 — 3 tiers<br>frontier · mid · cheap",
                                                                                 1384, 312, 248, 64),
 ("n_gen", "component.mock",
  "<b>generateResponse()</b><br>baseline.js:89 — 5 canned corpora<br>category matched, no network",
                                                                                 1384, 400, 248, 64),

 # -- the deliverable --------------------------------------------------------
 ("n_stats", "component.artifact",
  "<b>stats + summary</b><br>benchmark.js:174-193<br>cacheHitRate · terminationRate",
                                                                                 1384, 600, 248, 64),
 ("n_table", "component.artifact",
  "<b>Comparison table</b><br>formatComparisonTable :227<br>5 stages :202-206 → stdout",
                                                                                 1384, 684, 248, 64),

 # -- cards: the executable truth -------------------------------------------
 ("card_pipe", "card.invariant",
  "<b>PER-TURN PIPELINE — complete, in code order · benchmark.js:27</b><br>"
  "1 cache.lookup :66 — HIT ⇒ cost 0, 2ms, continue :80<br>"
  "2 summarizeHistory :88 — no-op unless &gt;4 msgs :27; prompt swap :33<br>"
  "3 classifyComplexity :95 → routeToModel :96 — tier chosen<br>"
  "4 simulateLLMCall :103 — the only token spend in the loop<br>"
  "5 applyEarlyTermination :113 — cost × (0.5 + 0.5·ratio) :118<br>"
  "6 perceivedLatency :127 — TTFT replaces total latency<br>"
  "7 cache.store :131 — every miss is written back<br>"
  "README's ASCII draws compression 1st; the code checks the cache 1st.",         320, 448, 456, 136),

 ("card_tiers", "card.primitive",
  "<b>MODEL TIERS — all three, complete · MODEL_PRICING baseline.js:18</b><br>"
  "frontier · gpt-4 · $0.03 in / $0.06 out per 1K :19<br>"
  "mid · claude-sonnet · $0.003 / $0.015 per 1K :20<br>"
  "cheap · gpt-4o-mini · $0.00015 / $0.0006 per 1K :21<br>"
  "latency 800/400/200ms base + 15/8/5ms per token :61-62, jitter :66<br>"
  "routeToModel :79-81 — simple→cheap, medium→mid, complex→frontier<br>"
  "TTFT floor 300/150/100ms feeds perceivedLatency :120",                         808, 448, 456, 136),

 ("card_qual", "card.failure",
  "<b>QUALITY LEDGER — every debit, complete · benchmark.js:165-169</b><br>"
  "0.92 start — frontier model + full system prompt :165<br>"
  "− 0.03 promptCompression :166<br>"
  "− 0.02 modelRouting :167<br>"
  "− 0.03 earlyTermination :168<br>"
  "− 0.00 semanticCaching — cached replies are frontier replies :169<br>"
  "0.84 end — assigned, never measured: scoreQuality :278 is never called.",  564, 616, 456, 116),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_demo",  "n_demo",  "n_bench", "runIncremental :124", "edge.primary", (0.5, 1), (0.5, 0), []),
 ("e_conv",  "n_convs", "n_bench", "50 convs :285",       "edge.data_in", (0.5, 0), (0.5, 1), []),
 ("e_pipe",  "n_bench", "n_cache", "per user turn :61",   "edge.primary", (1, 0.5), (0, 0.5), []),

 ("e_miss",  "n_cache",    "n_compress", "miss", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_hist",  "n_compress", "n_route",    "msgs", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_tier",  "n_route",    "n_llm",      "tier", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_text",  "n_llm",      "n_term",     "text", "edge.primary", (1, 0.5), (0, 0.5), []),

 ("e_price", "n_llm", "n_pricing", "$ per 1K :69", "edge.call",
  (0.5, 1), (0, 0.5), [(976, 344)]),
 ("e_gen",   "n_llm", "n_gen",     "canned body :57", "edge.data_in",
  (0.75, 1), (0, 0.5), [(1016, 432)]),

 ("e_hit",   "n_cache", "n_stats", "HIT ⇒ cost 0 · 2ms · continue :80", "edge.stop",
  (0.5, 0), (0, 0.75), [(424, 160), (1340, 160), (1340, 648)]),
 ("e_stats", "n_term",  "n_stats", "adjusted cost + latency :144", "edge.artifact",
  (1, 0.5), (0, 0.25), [(1316, 280), (1316, 616)]),
 ("e_roll",  "n_stats", "n_table", "per-stage :213", "edge.artifact", (0.5, 1), (0.5, 0), []),
]
