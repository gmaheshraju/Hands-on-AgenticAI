# FACTS — 18-workflow-engine (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/18-workflow-engine/src/`, n=9 JS modules (1108 lines)
+ 3 workflow definitions in `workflows/` (259 lines JSON). **Every element in the
diagram appears below with a `file:line` citation. The diagram may contain
nothing that is not on this page, and this page may contain nothing without a
citation.** The project README ships an ASCII diagram, a node-type table and a
"Key Design Decisions" list; all three were treated as CLAIMS, not evidence.
Six claims were checked against source and five did not survive (see "README
and manifest claims that did not verify").

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. Kahn's inner relaxation loop, the backoff
arithmetic, the 10 comparison operators and the 7 transform bodies are L2 and
are deliberately NOT drawn — their COUNTS and citations are carried instead.

---

## Entry point — `src/demo.js`

| Fact | Citation |
|---|---|
| `main()` — no CLI flags, no `process.argv` anywhere in the repo | demo.js:88, :126 |
| Constructs one engine, `{ verbose: true }`, reused for all three runs | demo.js:92 |
| Runs three demos in sequence, awaited one at a time | demo.js:97, :98, :99 |
| `loadWorkflow(name)` → `readFile(join(workflowsDir, name.json))` → `JSON.parse` | demo.js:13, :14, :15 |
| Workflows dir resolved from `import.meta.url` | demo.js:10, :11 |
| Final tally printed per run: completed / skipped / failed / trace count | demo.js:106-119 |
| Top-level failure path: `main().catch(console.error)` | demo.js:126 |
| The three engine callbacks (`onNodeStart`/`onNodeComplete`/`onNodeFailed`) exist but demo.js never passes them | engine.js:136, :137, :138 vs demo.js:92 |

## Inputs — the three workflow definitions

| Fact | Citation |
|---|---|
| `content-pipeline` — 6 nodes, 5 edges, strictly linear | workflows/content-pipeline.json:5, :70 |
| `customer-onboarding` — 7 nodes, 6 edges, one condition with 2 branches | workflows/customer-onboarding.json:5, :79, :82, :83 |
| `incident-response` — 5 nodes, 4 edges, one `parallel` node with 2 sub-tasks | workflows/incident-response.json:5, :89, :32 |
| DSL shape: `{ id, nodes[], edges[] }`; conditional edges carry `conditionBranch` | engine.js:104, :105, :108, :52 |
| Node types used across the three files: `llm`, `tool`, `approval`, `condition`, `parallel`, `transform` — all six appear | engine.js:24-31 |

## The engine — `src/engine.js`

| Fact | Citation |
|---|---|
| `NODE_EXECUTORS` — the type→function dispatch table, 6 entries | engine.js:24-31 |
| `buildGraph(nodes, edges)` — adjacency + in-degree + id→node map | engine.js:38, :39, :40, :41 |
| Called TWICE per run: once by `execute` for `adj`/`nodeMap`, once inside `topologicalLayers` for a fresh in-degree map | engine.js:153 and engine.js:65 |
| `topologicalLayers(nodes, edges)` — Kahn; in-degree 0 seeds the first layer | engine.js:64, :70, :71 |
| Each pass pushes the whole queue as one layer, then relaxes successors | engine.js:75, :78-82 |
| Cycle detection: `sortedCount !== nodes.length` → throw | engine.js:90, :91, :92 |
| `validateWorkflow(workflow)` — 8 rejection conditions (enumerated on card 1) | engine.js:101 |
| `class WorkflowEngine` — `defaultRetry = { maxRetries: 2, baseDelayMs: 200, timeoutMs: 15_000 }` | engine.js:133, :135 |
| `execute()` — validate, build graph, compute layers, then loop | engine.js:149, :150, :153, :156 |
| Verbose header block (workflow id, run id, node/edge/layer counts) | engine.js:158-166 |
| `nodeOutputs` Map seeded with the workflow input under `__input__` | engine.js:171, :172 |
| `skippedNodes` Set — the condition-branch elimination set | engine.js:175 |
| Layer loop; whole layer dispatched with `Promise.allSettled` | engine.js:178, :186, :187 |
| Rejected member → `recordNodeFailure`, then rethrow unless `node.optional` | engine.js:192, :195, :200, :201 |
| `run.transition('COMPLETED')` on clean exit; catch sets `run.error` then FAILED | engine.js:207, :209, :210 |
| `_executeNode()` — skip check FIRST, before anything else | engine.js:223, :225, :226 |
| Input gathering: merge `__input__` then every upstream node's output, in edge order | engine.js:235, :285, :286, :292-298 |
| Executor resolved from the table; `_nodeId` injected into config | engine.js:241, :242 |
| Per-node retry options: engine defaults spread, then `node.retry` overrides | engine.js:243 |
| Approval nodes bracket the call with `WAITING_APPROVAL` → back to `RUNNING` | engine.js:246, :247, :267, :268 |
| The executor is invoked **through** `retryWithBackoff` | engine.js:250, :251 |
| Output stored in `nodeOutputs`; success recorded with `attempts.length - 1` | engine.js:256, :257 |
| Condition post-step: non-taken `conditionBranch` edges have their subtree skipped | engine.js:272, :273, :275, :276 |
| `_markBranchSkipped` — recursive, guarded by set membership | engine.js:305, :306, :307, :309 |
| `_printSummary(run)` — per-node status/duration/retries to stdout | engine.js:316, :317, :329 |
| Module exports `topologicalLayers`, `validateWorkflow`, `buildGraph` | engine.js:335 |

## Retry — `src/retry.js`

| Fact | Citation |
|---|---|
| `retryWithBackoff(fn, opts)`; own defaults 3 / 500ms / 10s cap / 30s timeout | retry.js:12, :13-18 |
| Loop is `attempt = 1 .. maxRetries` — so `maxRetries` is the ATTEMPT count | retry.js:23 |
| Per-attempt timeout via `Promise.race` against a `setTimeout` reject | retry.js:27, :29, :30 |
| Success returns `{ result, attempts }` — the attempts array is the audit trail | retry.js:34, :35 |
| Backoff `baseDelayMs * 2^(attempt-1) * jitter`, capped at `maxDelayMs` | retry.js:48 |
| Jitter band `0.85–1.15` | retry.js:47 |
| Exhaustion throws `All ${maxRetries} attempts failed: ...` with `.attempts` attached | retry.js:54, :55, :56 |

## State + trace — `src/state.js`

| Fact | Citation |
|---|---|
| `VALID_TRANSITIONS` — 5 states, adjacency written out (card 2) | state.js:12-18 |
| `class WorkflowRun`; run id `run_<epoch>_<rand>` | state.js:20, :22 |
| `transition()` throws `Invalid transition: A → B` on any pair not listed | state.js:33, :34, :35, :36 |
| `startedAt` set on first RUNNING; `completedAt` on COMPLETED or FAILED | state.js:42, :43, :45, :46 |
| Four record methods: start / success / failure / skipped | state.js:50, :63, :74, :85 |
| Inputs and outputs are `structuredClone`d into the record | state.js:53, :67 |
| Every state change and every node event appends to `trace[]` | state.js:40, :60, :71, :82, :95, :98 |
| `summary()` — flattens `nodeResults` and computes `totalMs` | state.js:109, :111, :122 |

## The six executors — `src/nodes/`

| Node type | Module + entry | The L1-relevant fact | Citation |
|---|---|---|---|
| `llm` | `executeLLMNode` | calls `simulateLLM` — a `setTimeout` plus 5 keyword branches and a default. No API, no key, no network. | llm.js:81, :92, :21, :23, :28, :35, :42, :49, :57, :65 |
| `tool` | `executeToolNode` | module-level `Map` registry; 7 tools registered at import time; unknown name throws | tool.js:35, :9, :16, :41, and :54, :66, :78, :89, :102, :114, :126 |
| `approval` | `executeApprovalNode` | `approvalHandler` is `null`, so `autoApprove` always runs; `!approved` throws | approval.js:61, :14, :27, :64, :67, :68 |
| `condition` | `executeConditionNode` | 10 operators; returns `_condition.branchTaken` — the engine, not this node, does the skipping | condition.js:45, :18, :20-29, :53, :58 |
| `parallel` | `executeParallelNode` | its OWN executor table has only 3 of the 6 types; unknown sub-type throws | parallel.js:26, :12-16, :33, :37, :55 |
| `transform` | `executeTransformNode` | 7 pure operations; unknown operation throws with the list | transform.js:102, :17, :19, :33, :45, :55, :68, :79, :88, :112 |

The 7 registered tools, in registration order: `verifyEmail` (tool.js:54),
`creditCheck` (:66), `sendEmail` (:78), `detectIncident` (:89), `routeToTeam`
(:102), `notifyTeam` (:114), `publishContent` (:126). All seven are local
`async` closures with a `setTimeout`; none makes a network call.

The 7 transform operations, in declaration order: `pick` (transform.js:19),
`merge` (:33), `format` (:45), `map` (:55), `filter` (:68), `compose` (:79),
`passthrough` (:88).

The 10 condition operators, in `switch` order: `eq`, `neq`, `gt`, `gte`, `lt`,
`lte`, `in`, `contains`, `exists`, `truthy` — condition.js:20-29, default throws
at condition.js:30.

---

### INVARIANT CARD 1 — the pre-execution gate: 9 rejections, complete, in code order

Eight live in `validateWorkflow` and are **collected, not short-circuited** — every
check runs, the messages accumulate in one array, and a single Error carries all of
them. The ninth is not in `validateWorkflow` at all.

| # | Rejection | Citation |
|---|---|---|
| 1 | `workflow.id` missing | engine.js:104 |
| 2 | `nodes` not an array, or empty | engine.js:105 |
| 3 | `edges` not an array | engine.js:108 |
| 4 | `edge.from` is not a known node id | engine.js:114 |
| 5 | `edge.to` is not a known node id | engine.js:115 |
| 6 | `node.id` missing | engine.js:119 |
| 7 | `node.type` missing | engine.js:120 |
| 8 | `node.type` not a key of `NODE_EXECUTORS` | engine.js:121 |
| — | all 8 joined and thrown as ONE error | engine.js:126, :127 |
| 9 | **CYCLE** — `sortedCount !== nodes.length` | engine.js:90, :91, :92 |

Check 9 lives inside `topologicalLayers` (engine.js:64), which `execute` calls at
engine.js:156 — one statement AFTER `validateWorkflow` at engine.js:150. A cyclic
workflow therefore passes "validation" and dies at the next line with a different
error class. The README's ASCII puts cycle detection inside the Validation box.

### INVARIANT CARD 2 — the layer barrier, and the condition skip that rides on it

| Fact | Citation |
|---|---|
| Kahn seeds the queue with every in-degree-0 node | engine.js:70, :71 |
| The whole queue becomes ONE layer before relaxation | engine.js:75 |
| A layer is dispatched as a unit: `Promise.allSettled(layer.map(...))` | engine.js:186, :187 |
| Layer N+1 begins only after layer N settles (the `for` awaits) | engine.js:178, :186 |
| Condition node returns `_condition` with `branchTaken` | condition.js:53, :58 |
| Engine marks every non-taken `conditionBranch` edge | engine.js:272, :275 |
| `_markBranchSkipped` walks the whole downstream subtree | engine.js:305, :309 |
| The next layer's `_executeNode` consults `skippedNodes` as its first act | engine.js:225, :226 |
| Safe ONLY because a condition's targets have in-degree ≥ 1, so Kahn cannot place them in the same layer as the condition | engine.js:54, :80, :81, :82 |

**Complete state machine** (`VALID_TRANSITIONS`, state.js:12-18, in declaration order):

| From | To (complete) | Citation |
|---|---|---|
| `PENDING` | `RUNNING` | state.js:13 |
| `RUNNING` | `WAITING_APPROVAL`, `COMPLETED`, `FAILED` | state.js:14 |
| `WAITING_APPROVAL` | `RUNNING`, `FAILED` | state.js:15 |
| `COMPLETED` | — terminal | state.js:16 |
| `FAILED` | — terminal | state.js:17 |

Any pair not in that table throws (state.js:35, :36).

Observed on an actual run (`node src/demo.js`, 2026-08-24): content-pipeline
6 layers of width 1; customer-onboarding 6 layers, layer 4 = `[manager-approval,
rejection-email]` — width 2, one executed and one skipped; incident-response
5 layers of width 1. Max layer width across all three shipped workflows is **2**,
and it occurs exactly once.

### INVARIANT CARD 3 — four seams, probed against this code

Each was reproduced by running the real modules on 2026-08-24, not inferred.

| # | Seam | Mechanism | Citation |
|---|---|---|---|
| 1 | Two `approval` nodes in ONE layer fails the run | both call `transition('WAITING_APPROVAL')` while already in it; `WAITING_APPROVAL` has no self-loop | engine.js:246, :247; state.js:15, :35 |
| 2 | A human "no" is asked twice | the approval executor runs inside `retryWithBackoff`, so a rejection is a retryable error | engine.js:250; approval.js:67, :68; retry.js:23 |
| 3 | `maxRetries` is an ATTEMPT count | loop is `attempt <= maxRetries`; the exhaustion message says "attempts" | retry.js:23, :54 |
| 4 | A failed node erases its downstream from the trace | the throw exits the layer loop; nodes in later layers never reach `recordNodeStart` | engine.js:200, :201, :208; state.js:50 |

Also on this card: the engine's own defaults (2 attempts / 200 ms / 15 s,
engine.js:135) **override** `retry.js`'s stated defaults (3 / 500 ms / 30 s,
retry.js:13-18), so the module's own JSDoc numbers (retry.js:6, :7, :9) never
apply in this system.

Probe transcripts (both run against the unmodified modules):

- two `approval` nodes fanned from one `transform` →
  `STATUS= FAILED | ERROR= Invalid transition: WAITING_APPROVAL → WAITING_APPROVAL`
- `setApprovalHandler` returning `{approved:false}` → `handlerCalls= 2`,
  `STATUS= FAILED`, `ERROR= All 2 attempts failed: Approval rejected by human: nope`,
  and `nodeResults` contains only `ap:failed` — the downstream `after` node has
  no record at all.

---

## Artifacts written

**None.** This project persists nothing; every output goes to stdout.

| Output | Written by | Citation |
|---|---|---|
| Per-workflow header (run id, node/edge/layer counts) | `execute()` | engine.js:158-166 |
| Per-layer `--- Layer N [ids] ---` and per-node START/DONE/SKIP lines | `execute()` / `_executeNode()` | engine.js:182, :227, :237, :261 |
| Per-run summary block with status, totalMs and per-node rows | `_printSummary()` | engine.js:316, :329 |
| Final three-run tally + trace-event counts | demo `main()` | demo.js:106-119 |
| Demo-specific echoes (published URL, credit branch, incident report) | demo helpers | demo.js:35, :59, :80 |

## README and manifest claims that did not verify

1. **README ASCII: "Validation — verify nodes, edges, types, cycle detection".**
   Cycle detection is not in `validateWorkflow` (engine.js:101-129). It is at
   engine.js:91, inside `topologicalLayers`, reached one statement later
   (engine.js:150 then :156). Two different gates, two different error classes.
2. **README Key Design Decisions: "State machine with explicit transitions:
   PENDING -> RUNNING -> WAITING_APPROVAL -> COMPLETED/FAILED".** The arrow
   `WAITING_APPROVAL -> COMPLETED` does not exist. `VALID_TRANSITIONS`
   (state.js:15) allows only `RUNNING` and `FAILED` out of `WAITING_APPROVAL`.
   The code round-trips back through `RUNNING` (engine.js:268) to reach
   `COMPLETED` (engine.js:207) — the README's chain, taken literally, throws.
3. **README node table: "`approval` — Pause workflow for human approval
   (auto-approves in demo)".** There is no non-demo path in this repository.
   `approvalHandler` initialises to `null` (approval.js:14), the only setter
   `setApprovalHandler` (approval.js:20) is exported and **never called** in
   `src/` or `workflows/`, and `autoApprove` is therefore always the handler
   (approval.js:64). Nor does it pause: engine.js:247 and :268 bracket a
   synchronous `await`.
4. **README node table: "`parallel` — Fan out to multiple sub-tasks".** The
   sub-task table (parallel.js:12-16) holds 3 of the 6 types — `llm`, `tool`,
   `transform`. `approval`, `condition` and a nested `parallel` throw
   `Unknown sub-task type` (parallel.js:33). Sub-tasks also bypass both
   `retryWithBackoff` and `WorkflowRun` entirely (parallel.js:37).
5. **`package.json:9` declares `"test": "node --test src/**/*.test.js"`.** The
   repository contains no `*.test.js` file. The declared test surface is empty.

The one claim that DID verify, with a caveat worth drawing: **"Kahn's algorithm
produces natural parallel layers"** is true of the code (engine.js:74-87), but
the three shipped workflows exercise it once, at width 2 (see card 2).

## Folded into one box (box-count discipline)

The six executor boxes are the project's core domain enumeration — the DSL's six
`node.type` values (engine.js:24-31) — not an incidental call graph, so they are
drawn individually rather than collapsed. That puts the page at 15 boxes; the
folds below hold everything else to a single box each.

The page draws **15 component boxes** (the six executors + `NODE_EXECUTORS`
dispatch box + `execute`, `validateWorkflow`, `topologicalLayers`,
`retryWithBackoff`, `WorkflowRun`, `demo.js`, `workflows/*.json`, `stdout`).
`NODE_EXECUTORS` is drawn as its own box because it is the anchor of the
functional boundary and the source of the six dispatch edges — the one place in
the code where `node.type` becomes a called function (engine.js:241). Two folds
remain; each keeps its citation on the surviving box, so nothing became
untraceable.

| Folded | Into | Why it is legitimate |
|---|---|---|
| `buildGraph()` (engine.js:38) | the `topologicalLayers` box | it has no independent caller in the running system — `execute` (engine.js:153) and `topologicalLayers` (engine.js:65) are its only two call sites, both in the same file, both on the same code path |
| `_executeNode()` (engine.js:223) | the `execute()` box | it is a private method of `WorkflowEngine`, only ever reached from `execute`'s layer loop (engine.js:187); its retry wrap, its dispatch lookup and its condition post-step are drawn as the `retryWithBackoff` box, the `NODE_EXECUTORS` box and card 2 respectively |
| the six executors' RETURN path (`{...input, ...}` → `nodeOutputs`, engine.js:256) | the `execute() → WorkflowRun` edge | six identical return arrows carry no information the dispatch arrows do not; the merge rule is cited above at engine.js:292-298 |

## Deliberately NOT drawn (L1 scope discipline)

- Kahn's relaxation loop body (engine.js:78-83) — L2.
- The backoff formula and the `Promise.race` timeout (retry.js:27-30, :48) —
  the numbers are on card 3; the mechanism is L2.
- `simulateLLM`'s 5-branch keyword tree (llm.js:28-65) and `interpolate`'s
  regex (llm.js:11) — L2.
- The bodies of the 7 transforms, the 10 operators, and the 7 tools —
  enumerated above, counted on the boxes.
- `WorkflowRun.trace[]`'s event shapes (state.js:98-104) — L2b (time), not L1.
- Three exported-but-unused affordances: `hasTool` (tool.js:23),
  `custom` transform (transform.js:107), and `node.optional` (engine.js:200) —
  no workflow JSON sets any of them. Recorded, not drawn.

## Portability notes — where the token vocabulary did not fit this domain

Fourth codebase measured against this harness; "rules bent per new domain" is the
tracked metric, so these are recorded rather than quietly worked around.

1. **`component.external` has no honest occupant — second confirmed instance.**
   This project makes no network call of any kind: the only "outside" is three
   JSON files read from a sibling directory with `readFile` (demo.js:14). The
   token went to `workflows/*.json` because it is the nearest fit (data crossing
   into the process from outside the code), and the box carries the correction on
   its LABEL — `readFile :14` — so it cannot be misread as a remote service. A
   `component.input` or `component.definition` token would be honest.
2. **`component.agent` has no honest occupant — third confirmed instance.** The
   `llm` node is `simulateLLM` (llm.js:21): a `setTimeout` and five
   `promptLower.includes(...)` branches. It occupies the agent's structural
   position (it IS the model call site the DSL exposes), so `component.agent` was
   used and the label says `simulateLLM :21 — MOCK`. Same strain the 07-guardrails
   page recorded for `simulateNaiveLLM`.
3. **The human-in-the-loop gate has no token at all.** `approval` is the one node
   type whose whole purpose is to leave the process. In this repo it never does
   (approval.js:14, :20, :64), so `component.mock` is literally correct for the
   shipped behaviour — but it would be the wrong token the moment a real handler
   is registered, and there is no `component.human` to move to. The label carries
   both halves: `autoApprove ONLY :27` and `setApprovalHandler :20 / exported,
   never called`.
4. **`component.artifact` used for stdout — second confirmed instance.** Nothing
   is persisted (see "Artifacts written"). The token over-promises durability;
   `component.report` or `component.stdout` would be honest. Carried forward
   unchanged from the 07-guardrails note so the count is comparable.
5. **`boundary.functional` labels a TYPE boundary, not a flow.** `NODE_EXECUTORS`
   is a dispatch table, not a pipeline: the six boxes inside the boundary are
   alternatives, not stages. The token is still the nearest one, and the zone
   label names the table and its citation so the picture reads correctly.
6. **No token for a fan-out.** The six dispatch edges took `edge.call`, which is
   right; but there is no token that says "exactly one of these six fires per
   node", and no `edge.data_out` for the return path — which is why the returns
   were folded (see the fold table) rather than drawn in a borrowed colour.
