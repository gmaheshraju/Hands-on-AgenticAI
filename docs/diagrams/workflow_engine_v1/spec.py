"""Spec — 18-workflow-engine, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
 "id": "hoa_workflow_engine_v1",
 "name": "18 Workflow Engine — DAG orchestrator (validate → Kahn layers → dispatch)",
 "desc": "One in-process Node ESM engine that validates a JSON workflow, sorts it into "
 "parallel layers with Kahn's algorithm, and dispatches each node — through a retry "
 "wrapper — to one of six node-type executors, recording every step on a WorkflowRun "
 "state machine and printing the result to stdout. No network, no real LLM. Every "
 "element cites a source line in FACTS.md.",
 "theme": "hoa-default.json",
 "drawio": "HOA_WorkflowEngine_v1.drawio",
 "svg": "workflow-engine.svg",
 "w": 1700, "h": 1160, "svg_h": 1120,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_in", "③ Inputs — CLI + workflow DSL", "boundary.datasource",
 40, 232, 232, 300),
 ("z_proc", "① Workflow engine (Node ESM · in-proc · no network, no real LLM)", "boundary.primary",
 336, 96, 1016, 772),
 ("z_exec", "Node-type executors", "boundary.functional",
 408, 384, 624, 476),
 ("z_out", "④ Reported output (stdout only)", "boundary.observability",
 1416, 240, 244, 180),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 # ── inputs ──────────────────────────────────────────────────────────
 ("n_demo", "component.entry",
 "<b>demo.js</b><br>CLI runner<br>runs 3 workflows", 56, 280, 200, 64),
 ("n_wf", "component.external",
 "<b>workflows/*.json</b><br>3 DSL defs<br>read by demo.js", 56, 408, 200, 64),

 # ── engine chain (main flow, left → right) ─────────────────────────
 ("n_exec", "component.service",
 "<b>execute()</b><br>orchestrator<br>validate &#8594; sort<br>+ _executeNode", 368, 168, 176, 64),
 ("n_val", "component.service",
 "<b>validateWorkflow()</b><br>engine.js<br>8 checks, collected", 616, 168, 176, 64),
 ("n_topo", "component.service",
 "<b>topologicalLayers()</b><br>Kahn · cycle<br>folds buildGraph", 864, 168, 176, 64),
 ("n_retry", "component.service",
 "<b>retryWithBackoff()</b><br>retry.js<br>2x exp backoff", 1112, 168, 176, 64),

 ("n_state", "component.service",
 "<b>WorkflowRun</b><br>state machine<br>+ summary()<br>+ trace", 368, 296, 176, 64),

 # ── dispatch + six executors (functional boundary) ─────────────────
 ("n_dispatch", "component.service",
 "<b>NODE_EXECUTORS</b><br>engine.js<br>dispatch table<br>by node.type<br><br><br>one of six<br>fires per node<br><br>unknown type<br>&#8658; validate<br>fails", 440, 424, 176, 420),

 ("n_llm", "component.agent",
 "<b>llm &#8594; executeLLMNode</b><br>llm.js<br>simulateLLM<br>MOCK — no API, no key", 688, 400, 240, 64),
 ("n_tool", "component.mock",
 "<b>tool &#8594; executeToolNode</b><br>tool.js · Map<br>7 mock tools", 688, 476, 240, 64),
 ("n_approval", "component.mock",
 "<b>approval &#8594; Approval</b><br>approval.js<br>autoApprove ONLY<br>reject &#8658; throw", 688, 552, 240, 64),
 ("n_condition", "component.service",
 "<b>condition &#8594; Condition</b><br>condition.js<br>10 operators<br>engine skips subtree", 688, 628, 240, 64),
 ("n_parallel", "component.service",
 "<b>parallel &#8594; Parallel</b><br>parallel.js<br>3 of 6 sub-types<br>allSettled", 688, 704, 240, 64),
 ("n_transform", "component.service",
 "<b>transform &#8594; Transform</b><br>transform.js<br>7 pure ops<br>unknown op throws", 688, 780, 240, 64),

 # ── output ─────────────────────────────────────────────────────────
 ("n_out", "component.artifact",
 "<b>stdout report</b><br>_printSummary<br>final tally demo.js", 1432, 296, 212, 64),

 # ── cards ──────────────────────────────────────────────────────────
 ("card_gate", "card.primitive",
 "<b>VALIDATION GATE — 9 rejections, code order</b><br>"
 "validateWorkflow — 8 checks, collected not short-circuit<br>"
 "1 id missing 2 nodes empty 3 no edges[]<br>"
 "4 edge.from unknown 5 edge.to unknown<br>"
 "6 node.id missing 7 node.type missing<br>"
 "8 type &#8713; NODE_EXECUTORS &#8594; all joined, thrown<br>"
 "9 CYCLE sortedCount&#8800;N — NOT in validate: Kahn<br>"
 "reached one line after validate ( then)",
 120, 896, 456, 200),

 ("card_layers", "card.invariant",
 "<b>LAYER BARRIER + STATE MACHINE</b><br>"
 "Kahn: in-degree-0 seeds a layer · whole queue = 1 layer<br>"
 "a layer is dispatched as a unit — Promise.allSettled<br>"
 "layer N+1 waits for layer N to settle<br>"
 "condition returns branchTaken &#8594; engine marks edges<br>"
 "_markBranchSkipped walks the subtree · checked first<br>"
 "── VALID_TRANSITIONS state.js · bad pair throws ──<br>"
 "PENDING&#8594;RUNNING · RUNNING&#8594;WAIT_APPROVAL|COMPLETED|FAILED<br>"
 "WAIT_APPROVAL&#8594;RUNNING|FAILED · COMPLETED/FAILED terminal",
 624, 896, 456, 200),

 ("card_seams", "card.failure",
 "<b>FAILURE SEAMS — run against the real modules</b><br>"
 "1 two approval nodes in one layer &#8658; run FAILS<br>"
 " both set WAITING_APPROVAL, no self-loop · state.js<br>"
 "2 a human 'no' is asked twice — approval runs in retry<br>"
 "3 maxRetries is an ATTEMPT count — loop &#8804; maxRetries<br>"
 "4 a failed node erases downstream from the trace<br>"
 "engine defaults 2/200ms/15s OVERRIDE retry 3/500/30s<br>"
 "no *.test.js exists — declared test surface is empty (pkg)",
 1128, 896, 456, 200),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_load", "n_wf", "n_demo", "read", "edge.data_in", (0.5, 0), (0.5, 1), []),
 ("e_run", "n_demo", "n_exec", "execute(wf)", "edge.primary", (1, 0.5), (0, 0.5),
 [(312, 312), (312, 200)]),
 ("e_val", "n_exec", "n_val", "validate", "edge.call", (1, 0.5), (0, 0.5), []),
 ("e_sort", "n_val", "n_topo", "sort", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_loop", "n_topo", "n_retry", "per node", "edge.primary", (1, 0.5), (0, 0.5), []),

 ("e_rec", "n_exec", "n_state", "new run", "edge.data_in", (0.5, 1), (0.5, 0), []),
 ("e_sum", "n_state","n_out", "summary", "edge.artifact",(1, 0.5), (0, 0.5), []),

 ("e_disp", "n_retry","n_dispatch","dispatch","edge.call", (0.5, 1), (0.90909091, 0),
 [(1200, 372), (600, 372)]),

 ("e_llm", "n_dispatch", "n_llm", "", "edge.call", (1, 0.01904762), (0, 0.5), []),
 ("e_tool", "n_dispatch", "n_tool", "", "edge.call", (1, 0.2), (0, 0.5), []),
 ("e_appr", "n_dispatch", "n_approval", "", "edge.call", (1, 0.38095238), (0, 0.5), []),
 ("e_cond", "n_dispatch", "n_condition", "", "edge.call", (1, 0.56190476), (0, 0.5), []),
 ("e_par", "n_dispatch", "n_parallel", "", "edge.call", (1, 0.74285714), (0, 0.5), []),
 ("e_tran", "n_dispatch", "n_transform", "", "edge.call", (1, 0.92380952), (0, 0.5), []),
]
