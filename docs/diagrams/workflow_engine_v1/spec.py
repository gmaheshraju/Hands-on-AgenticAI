"""Spec — 18-workflow-engine, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
    "id":      "hoa_workflow_engine_v1",
    "name":    "18 Workflow Engine — DAG orchestrator (validate → Kahn layers → dispatch)",
    "desc":    "One in-process Node ESM engine that validates a JSON workflow, sorts it into "
               "parallel layers with Kahn's algorithm, and dispatches each node — through a retry "
               "wrapper — to one of six node-type executors, recording every step on a WorkflowRun "
               "state machine and printing the result to stdout. No network, no real LLM. Every "
               "element cites a source line in FACTS.md.",
    "theme":   "hoa-default.json",
    "drawio":  "HOA_WorkflowEngine_v1.drawio",
    "svg":     "workflow-engine.svg",
    "w": 1700, "h": 1160, "svg_h": 1120,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_in",   "③ Inputs — CLI + workflow DSL", "boundary.datasource",
   40, 232, 232, 300),
 ("z_proc", "① Workflow engine (Node ESM · in-proc · no network, no real LLM)", "boundary.primary",
   336, 96, 1016, 772),
 ("z_exec", "Node-type executors", "boundary.functional",
   408, 384, 624, 476),
 ("z_out",  "④ Reported output (stdout only)", "boundary.observability",
   1416, 240, 244, 180),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 # ── inputs ──────────────────────────────────────────────────────────
 ("n_demo", "component.entry",
  "<b>demo.js</b><br>CLI runner :88<br>runs 3 workflows :97", 56, 280, 200, 64),
 ("n_wf", "component.external",
  "<b>workflows/*.json</b><br>3 DSL defs<br>read by demo.js:14", 56, 408, 200, 64),

 # ── engine chain (main flow, left → right) ─────────────────────────
 ("n_exec", "component.service",
  "<b>execute() :149</b><br>orchestrator<br>validate &#8594; sort<br>+ _executeNode :223", 368, 168, 176, 64),
 ("n_val", "component.service",
  "<b>validateWorkflow()</b><br>engine.js:101<br>8 checks, collected", 616, 168, 176, 64),
 ("n_topo", "component.service",
  "<b>topologicalLayers()</b><br>Kahn :64 · cycle :92<br>folds buildGraph :38", 864, 168, 176, 64),
 ("n_retry", "component.service",
  "<b>retryWithBackoff()</b><br>retry.js:12<br>2x exp backoff :48", 1112, 168, 176, 64),

 ("n_state", "component.service",
  "<b>WorkflowRun :20</b><br>state machine<br>+ summary() :109<br>+ trace :98", 368, 296, 176, 64),

 # ── dispatch + six executors (functional boundary) ─────────────────
 ("n_dispatch", "component.service",
  "<b>NODE_EXECUTORS</b><br>engine.js:24<br>dispatch table<br>by node.type<br>:241<br><br>one of six<br>fires per node<br><br>unknown type<br>&#8658; validate<br>fails :121", 440, 424, 176, 420),

 ("n_llm", "component.agent",
  "<b>llm &#8594; executeLLMNode</b><br>llm.js:81<br>simulateLLM :21<br>MOCK — no API, no key", 688, 400, 240, 64),
 ("n_tool", "component.mock",
  "<b>tool &#8594; executeToolNode</b><br>tool.js:35 · Map :9<br>7 mock tools :54-126", 688, 476, 240, 64),
 ("n_approval", "component.mock",
  "<b>approval &#8594; Approval</b><br>approval.js:61<br>autoApprove ONLY :27<br>reject &#8658; throw :67", 688, 552, 240, 64),
 ("n_condition", "component.service",
  "<b>condition &#8594; Condition</b><br>condition.js:45<br>10 operators :20-29<br>engine skips subtree :272", 688, 628, 240, 64),
 ("n_parallel", "component.service",
  "<b>parallel &#8594; Parallel</b><br>parallel.js:26<br>3 of 6 sub-types :12<br>allSettled :55", 688, 704, 240, 64),
 ("n_transform", "component.service",
  "<b>transform &#8594; Transform</b><br>transform.js:102<br>7 pure ops :17<br>unknown op throws :112", 688, 780, 240, 64),

 # ── output ─────────────────────────────────────────────────────────
 ("n_out", "component.artifact",
  "<b>stdout report</b><br>_printSummary :316<br>final tally demo.js:106", 1432, 296, 212, 64),

 # ── cards ──────────────────────────────────────────────────────────
 ("card_gate", "card.primitive",
  "<b>VALIDATION GATE — 9 rejections, code order</b><br>"
  "validateWorkflow :101 — 8 checks, collected not short-circuit<br>"
  "1 id missing :104  2 nodes empty :105  3 no edges[] :108<br>"
  "4 edge.from unknown :114  5 edge.to unknown :115<br>"
  "6 node.id missing :119  7 node.type missing :120<br>"
  "8 type &#8713; NODE_EXECUTORS :121 &#8594; all joined, thrown :126<br>"
  "9 CYCLE sortedCount&#8800;N :92 — NOT in validate: Kahn :64<br>"
  "reached one line after validate (:150 then :156)",
  120, 896, 456, 200),

 ("card_layers", "card.invariant",
  "<b>LAYER BARRIER + STATE MACHINE</b><br>"
  "Kahn: in-degree-0 seeds a layer :70 · whole queue = 1 layer :75<br>"
  "a layer is dispatched as a unit — Promise.allSettled :186<br>"
  "layer N+1 waits for layer N to settle :178<br>"
  "condition returns branchTaken :53 &#8594; engine marks edges :272<br>"
  "_markBranchSkipped walks the subtree :305 · checked first :225<br>"
  "── VALID_TRANSITIONS state.js:12-18 · bad pair throws :35 ──<br>"
  "PENDING&#8594;RUNNING · RUNNING&#8594;WAIT_APPROVAL|COMPLETED|FAILED<br>"
  "WAIT_APPROVAL&#8594;RUNNING|FAILED · COMPLETED/FAILED terminal",
  624, 896, 456, 200),

 ("card_seams", "card.failure",
  "<b>FAILURE SEAMS — run against the real modules</b><br>"
  "1 two approval nodes in one layer &#8658; run FAILS<br>"
  "  both set WAITING_APPROVAL, no self-loop :247 · state.js:15<br>"
  "2 a human 'no' is asked twice — approval runs in retry :250<br>"
  "3 maxRetries is an ATTEMPT count — loop &#8804; maxRetries :23 :54<br>"
  "4 a failed node erases downstream from the trace :200 :208<br>"
  "engine defaults 2/200ms/15s :135 OVERRIDE retry 3/500/30s :13<br>"
  "no *.test.js exists — declared test surface is empty (pkg :9)",
  1128, 896, 456, 200),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_load", "n_wf",   "n_demo",  "read :14",       "edge.data_in", (0.5, 0), (0.5, 1), []),
 ("e_run",  "n_demo", "n_exec",  "execute(wf)",    "edge.primary", (1, 0.5), (0, 0.5),
   [(312, 312), (312, 200)]),
 ("e_val",  "n_exec", "n_val",   "validate",  "edge.call",    (1, 0.5), (0, 0.5), []),
 ("e_sort", "n_val",  "n_topo",  "sort",      "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_loop", "n_topo", "n_retry", "per node",  "edge.primary", (1, 0.5), (0, 0.5), []),

 ("e_rec",  "n_exec", "n_state", "new run :152",   "edge.data_in", (0.5, 1), (0.5, 0), []),
 ("e_sum",  "n_state","n_out",   "summary :316",   "edge.artifact",(1, 0.5), (0, 0.5), []),

 ("e_disp", "n_retry","n_dispatch","dispatch :241","edge.call",    (0.5, 1), (0.90909091, 0),
   [(1200, 372), (600, 372)]),

 ("e_llm",  "n_dispatch", "n_llm",       "", "edge.call", (1, 0.01904762), (0, 0.5), []),
 ("e_tool", "n_dispatch", "n_tool",      "", "edge.call", (1, 0.2),        (0, 0.5), []),
 ("e_appr", "n_dispatch", "n_approval",  "", "edge.call", (1, 0.38095238), (0, 0.5), []),
 ("e_cond", "n_dispatch", "n_condition", "", "edge.call", (1, 0.56190476), (0, 0.5), []),
 ("e_par",  "n_dispatch", "n_parallel",  "", "edge.call", (1, 0.74285714), (0, 0.5), []),
 ("e_tran", "n_dispatch", "n_transform", "", "edge.call", (1, 0.92380952), (0, 0.5), []),
]
