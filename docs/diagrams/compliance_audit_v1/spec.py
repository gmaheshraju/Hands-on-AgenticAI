"""Spec — 28-compliance-audit, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
 "id": "hoa_compliance_audit_v1",
 "name": "28 Compliance-Audit — Tamper-Evident Audit Harness",
 "desc": "One in-memory Node process that logs agent events into a SHA-256 hash chain, "
 "replays decisions for determinism, checks 12 rules across EU AI Act / SOC2 / GDPR, "
 "and emits a Markdown compliance report to stdout. EventLogger is the shared store "
 "the other subsystems read — not four flat siblings as the README ASCII implies. "
 "Every element cites a source line in FACTS.md.",
 "theme": "hoa-default.json",
 "drawio": "HOA_ComplianceAudit_v1.drawio",
 "svg": "compliance-audit.svg",
 "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_in", "③ Inputs — driver + audited agents", "boundary.datasource",
 40, 232, 216, 200),
 ("z_proc", "① AuditHarness process (Node ESM · in-memory, no network)", "boundary.primary",
 320, 96, 976, 684),
 ("z_pipe", "Audit pipeline — log → read → check → report", "boundary.functional",
 560, 224, 720, 272),
 ("z_out", "④ Output — stdout", "boundary.observability",
 1360, 240, 296, 120),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_demo", "component.entry",
 "<b>demo.js</b><br>driver · 5 scenarios<br>", 64, 264, 176, 64),
 ("n_agents", "component.mock",
 "<b>Simulated agents</b><br>5 event producers<br>(labels, not code)", 64, 344, 176, 64),

 ("n_harness", "component.service",
 "<b>AuditHarness</b><br>orchestrator<br>4 public methods<br>logEvent→…→report",
 344, 256, 176, 160),

 ("n_logger", "component.service",
 "<b>EventLogger</b><br>SHA-256 hash chain<br>append-only store", 592, 264, 176, 64),
 ("n_framework", "component.service",
 "<b>ComplianceFramework</b><br>12 rules · 3 regs<br>check + risk", 832, 264, 176, 64),
 ("n_reporter", "component.service",
 "<b>ComplianceReporter</b><br>Markdown report<br>generate()", 1072, 264, 176, 64),
 ("n_replay", "component.service",
 "<b>DecisionReplay</b><br>reconstruct + replay<br>drift detect", 592, 408, 176, 64),

 ("n_report", "component.artifact",
 "<b>stdout output</b><br>Markdown report + export<br>+ replay summary", 1384, 264, 248, 64),

 ("card_chain", "card.invariant",
 "<b>TAMPER-EVIDENT HASH CHAIN — eventLogger.js</b><br>"
 "11 entry fields, in code order:<br>"
 " id·timestamp·agentId·action<br>"
 " input·output·decision·rationale<br>"
 " metadata·previousHash·hash<br>"
 "genesis prevHash = 64×'0'<br>"
 "hash = SHA-256(prevHash + entry)<br>"
 "entries Object.freeze on append<br>"
 "verifyChain → brokenAt index<br>"
 "redact 12 keys before hashing", 344, 592, 304, 176),

 ("card_rules", "card.invariant",
 "<b>12 RULES · 3 REGS — complianceFramework.js</b><br>"
 "EU AI Act — 4 rules<br>"
 " explainability H · audit-trail C<br>"
 " human-review H · protected C<br>"
 "SOC2 — 4 rules<br>"
 " agent-id H · immutable-log C<br>"
 " redaction C · config-change M<br>"
 "GDPR — 4 rules<br>"
 " data-min H · purpose M<br>"
 " erasure H · retention M<br>"
 "check → score = passed/total<br>"
 "H high · C critical · M medium", 664, 592, 304, 176),

 ("card_risk", "card.failure",
 "<b>RISK ESCALATION — complianceFramework.js</b><br>"
 "overallRisk, first match wins:<br>"
 " critical if critical &gt; 0<br>"
 " high if high &gt; 1<br>"
 " medium if high&gt;0 or medium&gt;1<br>"
 " low otherwise<br>"
 "fail tally by severity<br>"
 "critical → criticalFindings → P0<br>"
 "report: summary · tables · matrix<br>"
 " · P0/P1/P2 roadmap<br>"
 "observed run: 92% · MEDIUM · 0 crit", 984, 592, 304, 176),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_demo", "n_demo", "n_harness", "5 scenarios", "edge.primary", (1, 0.5), (0, 0.25),
 []),
 ("e_events", "n_agents", "n_harness", "agent events", "edge.data_in", (1, 0.5), (0, 0.75),
 []),

 ("e_log", "n_harness", "n_logger", "logEvent()", "edge.primary", (1, 0.25), (0, 0.5),
 []),
 ("e_check", "n_logger", "n_framework", "check(logger)", "edge.primary", (1, 0.5), (0, 0.5),
 []),
 ("e_report", "n_framework", "n_reporter", "results", "edge.primary", (1, 0.5), (0, 0.5),
 []),
 ("e_out", "n_reporter", "n_report", "generate()", "edge.artifact", (1, 0.5), (0, 0.5),
 []),

 ("e_replay", "n_harness", "n_replay", "replayDecision", "edge.call", (1, 0.75), (0, 0.5),
 [(556, 376), (556, 440)]),
 ("e_reads", "n_logger", "n_replay", "reads chain", "edge.data_in", (0.5, 1), (0.5, 0),
 []),
 ("e_evid", "n_replay", "n_report", "audit summary", "edge.artifact", (1, 0.5), (0.5, 1),
 [(1508, 440)]),
]
