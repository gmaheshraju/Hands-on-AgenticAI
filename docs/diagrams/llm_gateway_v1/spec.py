"""Spec — 24-llm-gateway, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
 "id": "hoa_llm_gateway_v1",
 "name": "24 LLM Gateway — Routing & Governance Pipeline",
 "desc": "One request() call threads every LLM request through a fixed 7-stage governance "
 "pipeline — budget, rate, PII, route, middleware, execute, track — over a hardcoded "
 "7-model registry and runtime-injected (mocked) provider handlers, with the circuit "
 "breaker gating provider calls and the audit log written at every stage. Every "
 "element cites a source line in FACTS.md.",
 "theme": "hoa-default.json",
 "drawio": "HOA_LlmGateway_v1.drawio",
 "svg": "llm-gateway.svg",
 "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_entry", "③ Entry — CLI", "boundary.datasource",
 40, 200, 196, 140),
 ("z_proc", "① LLMGateway — request() orchestrator · gateway.js", "boundary.primary",
 300, 96, 1356, 396),
 ("z_pipe", "request() — 7 ordered stages · each stage cites the module it calls", "boundary.functional",
 312, 176, 1320, 180),
 ("z_ext", "② Provider handlers (MOCKED)", "boundary.external",
 1040, 552, 320, 128),
 ("z_obs", "④ Observability", "boundary.observability",
 1420, 552, 236, 128),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_demo", "component.entry",
 "<b>demo.js</b><br>CLI · 6 scenarios<br>main", 52, 236, 176, 64),

 # --- the 7-stage pipeline, left to right ---
 ("n_s1", "component.service",
 "<b>1 · Budget</b><br>CostTracker<br>checkBudget", 344, 236, 160, 64),
 ("n_s2", "component.service",
 "<b>2 · Rate limit</b><br>TokenBucket<br>check", 520, 236, 160, 64),
 ("n_s3", "component.service",
 "<b>3 · PII redact</b><br>pii.js<br>redactMessages", 696, 236, 160, 64),
 ("n_s4", "component.service",
 "<b>4 · Route</b><br>ModelRouter<br>route", 872, 236, 160, 64),
 ("n_s5", "component.service",
 "<b>5 · Middleware</b><br>use() chain<br>(empty by default)", 1048, 236, 160, 64),
 ("n_s6", "component.service",
 "<b>6 · Execute</b><br>+retry / failover<br>gateway", 1224, 236, 160, 64),
 ("n_s7", "component.service",
 "<b>7 · Track</b><br>cost record + audit<br>gateway", 1400, 236, 160, 64),

 # --- gateway-internal dependency ---
 ("n_cb", "component.service",
 "<b>CircuitBreaker</b><br>per-provider gate<br>closed / open / half<br>circuitBreaker.js",
 1048, 400, 176, 64),

 # --- external surface (mocked) ---
 ("n_prov", "component.external",
 "<b>Provider handlers</b><br>anthropic · openai<br>· google — MOCK<br>demo.js",
 1064, 580, 176, 64),

 # --- observability sink ---
 ("n_obs", "component.artifact",
 "<b>AuditLog + dash</b><br>query / compliance<br>replayTrace<br>dashboard",
 1436, 580, 176, 64),

 # --- cards ---
 ("card_pii", "card.primitive",
 "<b>PII — 10 patterns, redacted before route</b><br>"
 "1 SSN · 2 CREDIT_CARD (Luhn)<br>"
 "3 EMAIL · 4 PHONE_US<br>"
 "5 PHONE_IN · 6 IP_ADDRESS<br>"
 "7 AWS_KEY · 8 API_KEY<br>"
 "9 AADHAAR · 10 PAN<br>"
 "Luhn-fail skipped, not redacted",
 40, 520, 300, 200),

 ("card_route", "card.invariant",
 "<b>ROUTING — 6 rungs, code order (router.js)</b><br>"
 "1 team → exact model team_override<br>"
 "2 request.model set explicit_model<br>"
 "3 custom rule rule:&lt;name&gt;<br>"
 "4 complexity tier complexity<br>"
 "5 fallback chain fallback_chain<br>"
 "6 none left → all_providers_down<br>"
 "each rung gates on canRequest()",
 360, 520, 300, 200),

 ("card_audit", "card.invariant",
 "<b>AUDIT — 7 write sites, not 1 (README: 1)</b><br>"
 "1 budget block<br>"
 "2 rate-limit block<br>"
 "3 PII detected<br>"
 "4 no provider<br>"
 "5 middleware block<br>"
 "6 response ok<br>"
 "7 failover / retry<br>"
 "cross-cutting sink — every stage logs",
 680, 520, 300, 200),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_demo", "n_demo", "n_s1", "request()", "edge.primary", (1, 0.5), (0, 0.5), []),

 # the pipeline chain
 ("e12", "n_s1", "n_s2", "", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e23", "n_s2", "n_s3", "", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e34", "n_s3", "n_s4", "", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e45", "n_s4", "n_s5", "", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e56", "n_s5", "n_s6", "", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e67", "n_s6", "n_s7", "", "edge.primary", (1, 0.5), (0, 0.5), []),

 # circuit breaker consulted by route and execute (enter from top so labels
 # land in the clear band below the functional boundary, not on the dashed line)
 ("e_route_cb", "n_s4", "n_cb", "canRequest", "edge.call", (0.5, 1), (0.25, 0),
 [(952, 388), (1092, 388)]),
 ("e_exec_cb", "n_s6", "n_cb", "record", "edge.call", (0.5, 1), (0.75, 0),
 [(1304, 388), (1180, 388)]),

 # execute reaches the external providers
 ("e_exec_prov", "n_s6", "n_prov", "execute", "edge.primary", (0.75, 1), (0.5, 0),
 [(1344, 520), (1152, 520)]),

 # track writes to the observability sink
 ("e_track_obs", "n_s7", "n_obs", "log() x7", "edge.artifact", (0.5, 1), (0.5, 0),
 [(1480, 540), (1524, 540)]),
]
