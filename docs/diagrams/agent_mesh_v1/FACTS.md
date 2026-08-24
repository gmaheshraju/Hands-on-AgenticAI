# FACTS — 29-agent-mesh (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/29-agent-mesh/src/`, n=7 JS modules (1270 lines) +
1 test suite. **Every element in the diagram appears below with a `file:line`
citation. The diagram may contain nothing that is not on this page, and this
page may contain nothing without a citation.** The README ships an ASCII
diagram and per-module design descriptions; both were treated as CLAIMS, not
evidence, and one README claim did not survive the reading (see "README claims
that did not verify").

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The three-state transition tree inside
`CircuitBreaker`, the missed-heartbeat counting inside `HealthMonitor._check`,
and the four routing-strategy internals are L2 concerns — their *enumerations*
are carried on cards, their step logic is not drawn.

Everything here runs in **one Node.js process, in memory, with no network, no
database, and no real LLM**. The mesh is `EventEmitter`-based wiring between
seven in-process objects.

---

## Entry / driver — `src/demo.js`

| Fact | Citation |
|---|---|
| `async function main()` runs five scenarios in sequence | demo.js:227, :231 |
| Scenario 1 normal routing constructs a `Mesh` and calls `submitWork` | demo.js:31, :34, :42 |
| Scenarios 2–5: failure+redistribution, cascading+degraded, recovery, dashboard | demo.js:62, :101, :153, :197 |
| The dashboard is printed by the driver, not the mesh: `console.log(mesh.dashboardString())` | demo.js:221 |
| Failure path: `main().catch(console.error)` | demo.js:240 |

`src/runner`-style CLIs do not exist here; `demo.js` is the sole entry. It is
drawn as `component.entry`. `console.log` output is drawn as one
`component.artifact` (stdout), emitted by the driver.

## The orchestrator — `src/mesh.js`

| Fact | Citation |
|---|---|
| `class Mesh extends EventEmitter` — the top-level hub | mesh.js:22 |
| Owns one instance each of MeshRouter, HealthMonitor, WorkRedistributor, CircuitBreakerRegistry | mesh.js:41, :42, :47, :48 |
| **Owns the event bus**: subscribes to the monitor's `node_failed` / `node_degraded` / `node_recovered` | mesh.js:59, :60, :61 |
| `registerNode` fans a node into router + monitor; `addNode` creates then registers | mesh.js:65, :67, :74, :76 |
| `async submitWork(workItem, strategy)` — the work path, retry loop | mesh.js:114 |
| Circuit-breaker gate before dispatch: `if (!this._cbRegistry.allowRequest(node.id))` | mesh.js:129 |
| Dispatch to node: `const result = await node.enqueue(item)` | mesh.js:135 |
| `dashboard()` aggregates node health + breaker stats; `dashboardString()` renders it | mesh.js:167, :199, :200 |

## The router — `src/meshRouter.js`

| Fact | Citation |
|---|---|
| `class MeshRouter` — pure selection, holds no work | meshRouter.js:24 |
| `selectNode(workItem, strategy = LEAST_LOADED)` | meshRouter.js:65 |
| Every strategy filters through `_healthyCandidates` first (excludes FAILED + DEGRADED + excluded) | meshRouter.js:66, :84, :88 |
| `excludeNode` / `includeNode` — the circuit-breaker exclusion set | meshRouter.js:47, :52 |

## The health monitor — `src/healthMonitor.js`

| Fact | Citation |
|---|---|
| `class HealthMonitor extends EventEmitter` | healthMonitor.js:14 |
| `watch(node)` registers a node; `_check()` polls all watched nodes | healthMonitor.js:34, :64 |
| Reads node state directly: `now - node._lastHeartbeat`, then `node.setHealth(...)` | healthMonitor.js:68, :74, :86, :91 |
| Emits `node_failed` / `node_degraded` / `node_recovered` — consumed only by the Mesh | healthMonitor.js:87, :92, :103 |
| `declareFailure(nodeId)` — instant failure for tests/admin | healthMonitor.js:109, :115 |

## The redistributor — `src/workRedistributor.js`

| Fact | Citation |
|---|---|
| `class WorkRedistributor` | workRedistributor.js:11 |
| `redistribute(failedNode, healthyNodes)` reassigns the failed node's pending work | workRedistributor.js:29 |
| Cascade guard: skips a target once it has taken `maxRedistPerNode` (default 10) this pass | workRedistributor.js:17, :45 |
| Capability guard: `workItem.capability && !n.hasCapability(...)` → not a candidate | workRedistributor.js:44 |
| **Talks to nodes directly**: `best.enqueue(workItem)` (fire-and-forget) | workRedistributor.js:84 |

## The worker nodes — `src/agentNode.js`

| Fact | Citation |
|---|---|
| `class AgentNode extends EventEmitter` — capabilities, queue, health, metrics | agentNode.js:20 |
| Work is a pluggable async fn: `this._processor = opts.processor \|\| (async (item) => item)` | agentNode.js:38 |
| `enqueue(workItem)` — rejects if FAILED, else queues and drains | agentNode.js:129 |
| `getPendingWork()` — what the redistributor reassigns on failure | agentNode.js:143 |
| Emits `health_change` — **emitted but not consumed by any other module** | agentNode.js:65, :75, :192 |

## The circuit breaker — `src/circuitBreaker.js`

| Fact | Citation |
|---|---|
| `class CircuitBreaker` — per-node, three states | circuitBreaker.js:19 |
| `class CircuitBreakerRegistry` — one breaker per nodeId, lazily created | circuitBreaker.js:128, :138 |
| Registry facade used by the mesh: `allowRequest`, `recordSuccess`, `recordFailure` | circuitBreaker.js:152, :157, :162 |

---

### INVARIANT CARD 1 — routing strategies: 4, complete, in code order

The `STRATEGY` enum (meshRouter.js:15-19) and the `selectNode` switch
(meshRouter.js:69-79) enumerate exactly four strategies. Every one runs on the
output of `_healthyCandidates`, so FAILED and DEGRADED nodes are never routed to.

| # | Strategy value | Implementation | Citation |
|---|---|---|---|
| 1 | `round-robin` | `_roundRobin` — cycle index | meshRouter.js:16, :71, :95 |
| 2 | `least-loaded` (**default**) | `_leastLoaded` — min `queueDepth` | meshRouter.js:17, :73, :102 |
| 3 | `capability-based` | filtered by capability, then `_leastLoaded` | meshRouter.js:18, :75 |
| 4 | `affinity-sticky` | `_affinitySticky` — same node by key, else `_leastLoaded` | meshRouter.js:19, :77, :116 |

Candidate filter: excluded set, then `FAILED || DEGRADED`, then required
capability (meshRouter.js:87, :88, :89). Unknown strategy falls back to
`_leastLoaded` (meshRouter.js:79).

### INVARIANT CARD 2 — circuit breaker: 3 states, complete, in code order

`STATE` (circuitBreaker.js:11-14) has exactly three members. Transitions,
complete:

| From → To | Trigger | Citation |
|---|---|---|
| CLOSED → OPEN | consecutive `_failures >= failureThreshold` (default 5) | circuitBreaker.js:27, :90, :91 |
| OPEN → HALF_OPEN | `now - _lastFailureTime >= cooldownMs` (default 10000) | circuitBreaker.js:28, :42, :43 |
| HALF_OPEN → CLOSED | probe `recordSuccess` | circuitBreaker.js:66, :67, :68 |
| HALF_OPEN → OPEN | probe `recordFailure` | circuitBreaker.js:83, :84, :85 |
| any → OPEN | `trip()` (mesh forces this on node_failed) | circuitBreaker.js:101 |
| any → CLOSED | `reset()` (mesh forces this on recovery) | circuitBreaker.js:107 |

Request admission: CLOSED allows, OPEN blocks, HALF_OPEN allows up to
`halfOpenMax` probes (circuitBreaker.js:52, :54, :55, :58).

### INVARIANT CARD 3 — self-healing on `node_failed`: 6 steps, complete, in code order

This is the project's thesis and it lives in `Mesh._onNodeFailed`
(mesh.js:240-263). The **Mesh** — not the HealthMonitor — orchestrates the
reaction; the monitor only emits the event the mesh subscribed to
(mesh.js:59).

| # | Step | Citation |
|---|---|---|
| 1 | `_router.excludeNode(nodeId)` — stop routing to it | mesh.js:245 |
| 2 | `_cbRegistry.getBreaker(nodeId).trip()` — force breaker OPEN | mesh.js:246 |
| 3 | collect healthy nodes (exclude self, `_health === HEALTHY`) | mesh.js:249, :250 |
| 4 | `_redistributor.redistribute(node, healthyNodes)` | mesh.js:252 |
| 5 | if `failedCount / total >= degradedThreshold` (0.5): set degraded, emit `mesh_degraded` | mesh.js:257, :258, :259 |
| 6 | re-emit `node_failed` with `redistributed` count | mesh.js:262 |

Recovery mirrors it in `_onNodeRecovered` (mesh.js:265): include node, reset
breaker, and exit degraded mode if `failedCount / total < degradedThreshold`
(mesh.js:272).

---

## Artifacts written

**None to disk.** Every output goes to stdout via `console.log`. The dashboard
string is built by `Mesh.dashboardString` (mesh.js:199) and printed by the
driver (demo.js:221); per-scenario progress lines are also `console.log`
(demo.js:49, :90, :132).

## README claims that did not verify

1. **The README ASCII draws an arrow `HealthMonitor ──► WorkRedistributor`**,
   implying the monitor hands failed-node work to the redistributor directly.
   **FALSE.** `HealthMonitor` never references `WorkRedistributor`; it only
   `emit`s `node_failed` (healthMonitor.js:87). The **Mesh** subscribes
   (mesh.js:59) and its `_onNodeFailed` handler is what calls
   `_redistributor.redistribute` (mesh.js:252). The bus and the orchestration
   are owned by the Mesh. The diagram routes the failure signal
   monitor → **Mesh** → redistributor, and labels the correction on the
   self-healing card. This is the single most load-bearing correction on the
   page.
2. The README's per-module table is otherwise accurate (module → file →
   purpose all verified against the classes above).

## Deliberately NOT drawn (L1 scope discipline)

- The `CircuitBreaker` state-getter auto-transition logic and probe counting
  (circuitBreaker.js:40-59) — L2; the states/transitions are enumerated on
  card 2.
- `HealthMonitor._check`'s missed-heartbeat arithmetic and degraded/failed
  thresholds (healthMonitor.js:64-105) — L2.
- The four routing internals (`_roundRobin`, `_leastLoaded`,
  `_affinitySticky` tie-breaks) — L2; enumerated on card 1.
- `AgentNode`'s internal `_drain` loop, latency window, and `_computeHealth`
  (agentNode.js:155-207) — L2.
- `AgentNode.health_change` events — emitted (agentNode.js:65) but no module
  subscribes, so no edge is drawn; noted above.
- The mesh's retry loop counter and `triedNodes` bookkeeping
  (mesh.js:122-126) — L2 control flow inside the one `submitWork` edge.

## Portability notes — rules that needed bending for this domain

The diagram vocabulary was built for a trading system; this is a distributed-
systems demo. Recorded because "rules bent per new domain" is the portability
metric.

1. **`component.agent` has no honest LLM occupant.** The "agents" (`AgentNode`)
   are work-queue objects whose processor defaults to the identity function
   `async (item) => item` (agentNode.js:38); in the demo they are `sleep`+return
   closures. They occupy the agent's *structural* position (autonomous workers
   with capabilities and health), so `component.agent` is the nearest token —
   carried with a **LABEL** ("processor = async fn") so the picture cannot imply
   real model calls.
2. **`component.external` has no occupant at all.** There is no network, broker,
   database, or external service in this project — it is entirely in-process.
   The token is not used; the absence is stated on the process boundary label
   ("in-memory, no network").
3. **`boundary.datasource` labels the driver, not a data source.** `demo.js` is
   an entry/driver, not a corpus; the token is reused for "where the run
   originates," the nearest structural fit.
4. **`boundary.observability` labels a zone that persists nothing.** stdout is
   ephemeral; the semantic role ("where the run becomes visible") is exactly
   right, but the token name over-promises durability — same bend recorded on
   07-guardrails.
5. **No `edge.data_out` token exists.** The dashboard (mesh/driver → stdout)
   borrowed `edge.artifact`; the failure signal (monitor → mesh) borrowed
   `edge.stop` (it is the failure trigger); consultations borrowed `edge.call`.
