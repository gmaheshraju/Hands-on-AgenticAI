"""Spec — 28-compliance-audit, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
    "id":      "hoa_compliance_audit_v1",
    "name":    "28 Compliance-Audit — Tamper-Evident Audit Harness",
    "desc":    "One in-memory Node process that logs agent events into a SHA-256 hash chain, "
               "replays decisions for determinism, checks 12 rules across EU AI Act / SOC2 / GDPR, "
               "and emits a Markdown compliance report to stdout. EventLogger is the shared store "
               "the other subsystems read — not four flat siblings as the README ASCII implies. "
               "Every element cites a source line in FACTS.md.",
    "theme":   "hoa-default.json",
    "drawio":  "HOA_ComplianceAudit_v1.drawio",
    "svg":     "compliance-audit.svg",
    "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_in",   "③ Inputs — driver + audited agents", "boundary.datasource",
   40, 232, 216, 200),
 ("z_proc", "① AuditHarness process (Node ESM · in-memory, no network)", "boundary.primary",
   320, 96, 976, 684),
 ("z_pipe", "Audit pipeline — log → read → check → report", "boundary.functional",
   560, 224, 720, 272),
 ("z_out",  "④ Output — stdout", "boundary.observability",
   1360, 240, 296, 120),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_demo", "component.entry",
  "<b>demo.js</b><br>driver · 5 scenarios<br>:251", 64, 264, 176, 64),
 ("n_agents", "component.mock",
  "<b>Simulated agents</b><br>5 event producers<br>(labels, not code) :32", 64, 344, 176, 64),

 ("n_harness", "component.service",
  "<b>AuditHarness</b><br>orchestrator :13<br>4 public methods<br>logEvent→…→report :55",
  344, 256, 176, 160),

 ("n_logger", "component.service",
  "<b>EventLogger</b><br>SHA-256 hash chain<br>append-only store :47", 592, 264, 176, 64),
 ("n_framework", "component.service",
  "<b>ComplianceFramework</b><br>12 rules · 3 regs<br>check + risk :336", 832, 264, 176, 64),
 ("n_reporter", "component.service",
  "<b>ComplianceReporter</b><br>Markdown report<br>generate() :12", 1072, 264, 176, 64),
 ("n_replay", "component.service",
  "<b>DecisionReplay</b><br>reconstruct + replay<br>drift detect :94", 592, 408, 176, 64),

 ("n_report", "component.artifact",
  "<b>stdout output</b><br>Markdown report + export<br>+ replay summary :186", 1384, 264, 248, 64),

 ("card_chain", "card.invariant",
  "<b>TAMPER-EVIDENT HASH CHAIN — eventLogger.js</b><br>"
  "11 entry fields, in code order:<br>"
  " id·timestamp·agentId·action :73<br>"
  " input·output·decision·rationale :77<br>"
  " metadata·previousHash·hash :81-85<br>"
  "genesis prevHash = 64×'0' :70<br>"
  "hash = SHA-256(prevHash + entry) :40<br>"
  "entries Object.freeze on append :87<br>"
  "verifyChain → brokenAt index :135<br>"
  "redact 12 keys before hashing :33", 344, 592, 304, 176),

 ("card_rules", "card.invariant",
  "<b>12 RULES · 3 REGS — complianceFramework.js</b><br>"
  "EU AI Act :10 — 4 rules<br>"
  " explainability H:12 · audit-trail C:31<br>"
  " human-review H:51 · protected C:76<br>"
  "SOC2 :105 — 4 rules<br>"
  " agent-id H:107 · immutable-log C:126<br>"
  " redaction C:144 · config-change M:174<br>"
  "GDPR :196 — 4 rules<br>"
  " data-min H:198 · purpose M:229<br>"
  " erasure H:248 · retention M:269<br>"
  "check → score = passed/total :369<br>"
  "H high · C critical · M medium", 664, 592, 304, 176),

 ("card_risk", "card.failure",
  "<b>RISK ESCALATION — complianceFramework.js:387</b><br>"
  "overallRisk, first match wins:<br>"
  " critical if critical &gt; 0 :388<br>"
  " high if high &gt; 1 :389<br>"
  " medium if high&gt;0 or medium&gt;1 :390<br>"
  " low otherwise :387<br>"
  "fail tally by severity :383<br>"
  "critical → criticalFindings → P0 :396<br>"
  "report: summary · tables · matrix<br>"
  " · P0/P1/P2 roadmap :104<br>"
  "observed run: 92% · MEDIUM · 0 crit", 984, 592, 304, 176),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_demo",   "n_demo",   "n_harness", "5 scenarios :256", "edge.primary", (1, 0.5), (0, 0.25),
   []),
 ("e_events", "n_agents", "n_harness", "agent events",     "edge.data_in", (1, 0.5), (0, 0.75),
   []),

 ("e_log",    "n_harness",   "n_logger",    "logEvent() :55",   "edge.primary", (1, 0.25), (0, 0.5),
   []),
 ("e_check",  "n_logger",    "n_framework", "check(logger) :336", "edge.primary", (1, 0.5), (0, 0.5),
   []),
 ("e_report", "n_framework", "n_reporter",  "results :83",      "edge.primary", (1, 0.5), (0, 0.5),
   []),
 ("e_out",    "n_reporter",  "n_report",    "generate() :12",   "edge.artifact", (1, 0.5), (0, 0.5),
   []),

 ("e_replay", "n_harness", "n_replay", "replayDecision :62", "edge.call", (1, 0.75), (0, 0.5),
   [(556, 376), (556, 440)]),
 ("e_reads",  "n_logger",  "n_replay", "reads chain :32",    "edge.data_in", (0.5, 1), (0.5, 0),
   []),
 ("e_evid",   "n_replay",  "n_report", "audit summary :144", "edge.artifact", (1, 0.5), (0.5, 1),
   [(1508, 440)]),
]
