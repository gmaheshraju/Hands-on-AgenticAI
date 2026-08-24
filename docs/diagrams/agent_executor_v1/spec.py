"""Spec — 25-agent-executor, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
 "id": "hoa_agent_executor_v1",
 "name": "25 Agent Executor — Zero-Trust IAM Pipeline for AI Agents",
 "desc": "One in-memory Node process that runs every agent action through a 5-gate execute() "
 "pipeline — schema, IAM policy, human approval, sandboxed execution — and records "
 "every branch to an audit trail. The sandbox's permission checks are demonstrated "
 "but NOT wired into gate 4. Every element cites a source line in FACTS.md.",
 "theme": "hoa-default.json",
 "drawio": "HOA_AgentExecutor_v1.drawio",
 "svg": "agent-executor.svg",
 "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_in", "③ Entry + registrations", "boundary.datasource",
 40, 232, 200, 300),
 ("z_proc", "① AgentExecutor process (Node ESM · in-memory · no network, no real LLM)", "boundary.primary",
 304, 96, 992, 680),
 ("z_pipe", "execute() — 5-gate pipeline · first failing gate returns", "boundary.functional",
 500, 216, 784, 148),
 ("z_ext", "② Mocked external surface", "boundary.external",
 1360, 200, 300, 152),
 ("z_out", "④ In-memory record → stdout", "boundary.observability",
 1360, 560, 300, 160),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_demo", "component.entry",
 "<b>demo.js</b><br>6 actions · 4 policies<br>3 agents · 6 scenarios<br>", 64, 268, 176, 80),
 ("n_agents", "component.agent",
 "<b>Agents</b><br>3 records<br>basic/elev/admin<br>(perm records)", 64, 392, 176, 72),

 ("n_exec", "component.service",
 "<b>AgentExecutor</b><br>.execute()<br>guards<br>audit each branch", 328, 240, 160, 80),

 ("n_validate", "component.service",
 "<b>Gate 1 · schema</b><br>validate()<br>req·type·enum<br>min/max·pattern", 516, 248, 176, 64),
 ("n_policy", "component.service",
 "<b>Gate 2 · policy</b><br>evaluate()<br>IAM deny-wins<br>policy.js", 708, 248, 176, 64),
 ("n_approval", "component.service",
 "<b>Gate 3 · approval</b><br>submit()<br>auto / pending<br>approvals.js", 900, 248, 176, 64),
 ("n_sbexec", "component.service",
 "<b>Gate 4 · sandbox</b><br>_sandboxedExec<br>TIMEOUT RACE ONLY<br>no perm check", 1092, 248, 176, 64),

 ("n_handler", "component.external",
 "<b>action.handler(s)</b><br>demo.js · MOCKED<br>canned data — no real DB/API/FS", 1384, 248, 256, 64),

 ("n_sandbox", "component.service",
 "<b>Sandbox</b><br>createSession (WIRED)<br>checkPermission<br>UNWIRED — demo only", 344, 400, 208, 88),
 ("n_audit", "component.artifact",
 "<b>AuditTrail.record</b><br>in-memory ring<br>allowed/denied/error", 608, 400, 208, 88),
 ("n_dash", "component.artifact",
 "<b>dashboard()</b><br>securityReport → stdout", 1384, 592, 256, 64),

 ("card_pipe", "card.invariant",
 "<b>5-GATE PIPELINE — execute() code order</b><br>"
 "0 session active?<br>"
 "1 validate schema → VALIDATION_FAILED<br>"
 "2 policy evaluate → POLICY_DENIED<br>"
 "3 approval (if req) → APPROVAL_REQ<br>"
 "4 _sandboxedExecute → EXEC_FAILED<br>"
 "5 audit.record — every branch<br>"
 "first failing gate returns; rest skip", 320, 536, 300, 200),

 ("card_policy", "card.primitive",
 "<b>POLICY evaluate() — deny wins</b><br>"
 "no matching policy → deny<br>"
 "sort by priority, descending<br>"
 "deny pass first → explicit_deny<br>"
 "allow pass → explicit_allow<br>"
 "default → deny<br>"
 "8 ops: equals notEquals in notIn<br>"
 " lessThan greaterThan exists matches", 636, 536, 300, 200),

 ("card_sandbox", "card.failure",
 "<b>SANDBOX — DEMONSTRATED, NOT WIRED</b><br>"
 "createSession · getSession — WIRED<br>"
 "checkPermission — demo / tests ONLY<br>"
 "gate 4 runs handler + timeout only<br>"
 "5 ops file_read file_write<br>"
 " network exec db<br>"
 "blocked-path · auto-suspend @3<br>"
 "README calls this 'gate 4' — it is not", 952, 536, 300, 200),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_drive", "n_demo", "n_exec", "6 scenarios", "edge.primary", (1, 0.5), (0, 0.25),
 [(276, 308), (276, 260)]),
 ("e_princ", "n_agents", "n_exec", "startSession", "edge.call", (1, 0.5), (0, 0.75),
 [(300, 428), (300, 300)]),

 ("e_g1", "n_exec", "n_validate", "gate 1", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_g2", "n_validate", "n_policy", "gate 2", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_g3", "n_policy", "n_approval", "gate 3", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_g4", "n_approval", "n_sbexec", "gate 4", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_run","n_sbexec", "n_handler", "handler()", "edge.call", (1, 0.5), (0, 0.5), []),

 ("e_sess", "n_sandbox", "n_exec", "session (wired)", "edge.data_in", (0.5, 0), (0.75, 1),
 []),
 ("e_check", "n_demo", "n_sandbox", "checkPermission — demo only", "edge.stop", (1, 0.75), (0, 0.5),
 [(324, 328), (324, 444)]),

 ("e_audit", "n_exec", "n_audit", "record every branch", "edge.artifact", (0.9, 1), (0.5, 0),
 [(472, 372), (712, 372)]),
 ("e_dash", "n_audit", "n_dash", "dashboard()", "edge.artifact", (1, 0.5), (0, 0.5),
 [(1336, 444), (1336, 624)]),
]
