"""Spec — 27-cost-attribution, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
    "id":      "hoa_cost_attribution_v1",
    "name":    "27 Cost Attribution — Facade over one event store, four read-models",
    "desc":    "One in-memory process that records simulated LLM-call events into a single "
               "CostCollector store, then reports over it four ways: cost attribution (4 "
               "dimensions), waste detection (6 patterns), ROI, and budget alerts checked on "
               "every record. No network, no real LLM. Every element cites a source line in FACTS.md.",
    "theme":   "hoa-default.json",
    "drawio":  "HOA_CostAttribution_v1.drawio",
    "svg":     "cost-attribution.svg",
    "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_in",   "③ Inputs — demo CLI + simulated events", "boundary.datasource",
   40, 220, 216, 240),
 ("z_proc", "① CostAttributionEngine (Node ESM · no network, no real LLM)", "boundary.primary",
   320, 96, 976, 684),
 ("z_analysis", "Reporting — reads one store", "boundary.functional",
   856, 200, 240, 336),
 ("z_out",  "④ Reported output (stdout only)", "boundary.observability",
   1360, 300, 296, 160),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_demo", "component.entry",
  "<b>demo.js</b><br>CLI · main() :3<br>records + prints", 64, 252, 160, 64),
 ("n_scenarios", "component.mock",
  "<b>12 sim. events</b><br>no real LLM<br>demo.js:18-31", 64, 372, 160, 64),

 ("n_engine", "component.service",
  "<b>CostAttributionEngine</b><br>engine.js — facade<br>record + dashboard :16", 344, 236, 176, 96),
 ("n_budget", "component.service",
  "<b>Budget monitor</b><br>_checkBudget :26<br>budgets + alerts :12", 344, 372, 176, 64),

 ("n_pricing", "component.external",
  "<b>Pricing table</b><br>7 models :4-12<br>hardcoded · no API", 600, 140, 176, 64),
 ("n_collector", "component.service",
  "<b>CostCollector</b><br>events[] store :3<br>query() :45", 600, 252, 176, 64),

 ("n_attr", "component.service",
  "<b>CostAttribution</b><br>4 dimensions :6", 888, 236, 176, 64),
 ("n_waste", "component.service",
  "<b>WasteDetector</b><br>6 patterns :7", 888, 340, 176, 64),
 ("n_roi", "component.service",
  "<b>ROICalculator</b><br>ROI + efficiency :11", 888, 444, 176, 64),

 ("n_out", "component.artifact",
  "<b>stdout report</b><br>console.log — demo.js:36-81", 1384, 340, 248, 64),

 ("card_attr", "card.invariant",
  "<b>4 ATTRIBUTION DIMENSIONS — attribution.js</b><br>"
  "1 byAgent :6 — cost·reqs·successRate·avg<br>"
  "2 byTeam :30 — cost·uniqueAgents·models<br>"
  "3 byTaskType :58 — costPerSuccess·rate<br>"
  "4 byModel :85 — tokens·cacheHitRate·avg<br>"
  "each reads collector.query() :7 :31 :59<br>"
  "sorted by totalCost desc :27 :55 :82 :106", 344, 576, 304, 184),

 ("card_waste", "card.invariant",
  "<b>6 WASTE PATTERNS — waste.analyze() :7</b><br>"
  "1 overpowered_model :21 — opus/gpt4o 85%<br>"
  "2 duplicate_requests :40 — within 60s<br>"
  "3 excessive_retries :65 — &gt;1 fail/task<br>"
  "4 low_cache_hit_rate :93 — &gt;10 &amp; &lt;10%<br>"
  "5 high_failure_rate :110 — &gt;5 &amp; &gt;30%<br>"
  "6 idle_agent :135 — &gt;1h idle, cost&gt;$.01<br>"
  "sorted by savingsUsd desc :18", 664, 576, 304, 184),

 ("card_budget", "card.failure",
  "<b>BUDGET ALERTS — engine._checkBudget :26</b><br>"
  "fires inside every record() :18<br>"
  "no budget set ⇒ skip :28<br>"
  "spend = today's team cost :30-34<br>"
  "thresholds 0.5 · 0.8 · 0.95 · 1.0 :36<br>"
  "level: ≥1.0 crit · ≥0.8 warn · info :45<br>"
  "deduped per team·threshold·day :39-40<br>"
  "alerts accrue on this.alerts[] :13", 984, 576, 304, 184),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_demo", "n_demo", "n_engine", "record + report", "edge.primary", (1, 0.5), (0, 0.5),
   []),
 ("e_scen", "n_scenarios", "n_engine", "12 events", "edge.data_in", (1, 0.5), (0, 0.75),
   [(284, 404), (284, 308)]),

 ("e_rec", "n_engine", "n_collector", "record()", "edge.primary", (1, 0.5), (0, 0.5),
   []),
 ("e_price", "n_pricing", "n_collector", "calculateCost", "edge.data_in", (0.5, 1), (0.5, 0),
   []),
 ("e_budget", "n_engine", "n_budget", "_checkBudget", "edge.call", (0.5, 1), (0.5, 0),
   []),

 ("e_attr", "n_collector", "n_attr", "query()", "edge.data_in", (1, 0.5), (0, 0.5),
   [(832, 284), (832, 268)]),
 ("e_waste", "n_collector", "n_waste", "query()", "edge.data_in", (0.5, 1), (0, 0.5),
   [(688, 372)]),
 ("e_roi", "n_collector", "n_roi", "query()", "edge.data_in", (0.25, 1), (0, 0.5),
   [(644, 476)]),

 ("e_out_a", "n_attr", "n_out", "byAgent…byModel", "edge.artifact", (1, 0.5), (0.5, 0),
   [(1508, 268)]),
 ("e_out_w", "n_waste", "n_out", "6 patterns", "edge.artifact", (1, 0.5), (0, 0.5),
   []),
 ("e_out_r", "n_roi", "n_out", "ROI + eff.", "edge.artifact", (1, 0.5), (0.5, 1),
   [(1508, 476)]),
]
