# FACTS — 29-agent-mesh, submitWork over time (L2b, extracted 2026-08-25)

Source of truth: `projects/29-agent-mesh/src/mesh.js`, `src/meshRouter.js`,
`src/circuitBreaker.js`. **Every participant, message and note below cites code.
The diagram may contain nothing that is not on this page.**

Altitude: **L2b — time.** What happens in what order, and where the order itself
is the defect. The mesh's structure (which module owns what) is L1; the circuit
breaker's own three-state machine is L2. Both are deliberately excluded — see
*Deliberately NOT drawn*.

Claims marked `[RAN]` were produced by executing the code with the router's
`excludeNode` / `includeNode` / `selectNode` instrumented to log every call. The
transcripts are at the bottom.

## Why this project earned an L2b

Of the 31 projects, this is the one whose defect is invisible at the other two
altitudes. `mesh.js:130` and `mesh.js:234` are both calls from `Mesh` to
`MeshRouter`, so on an L1 map they are the same arrow. Neither drives an illegal
state, so an L2 machine shows nothing wrong. Only the ORDER — one undoing the
other, one attempt later — makes the defect visible.

## Participants

| Lifeline | What it is | Where |
|---|---|---|
| `caller` | whoever awaits `submitWork` | `mesh.js:114` |
| `Mesh` | owns the retry loop and the work records | `mesh.js:22` — `class Mesh extends EventEmitter` |
| `MeshRouter` | holds `_excludedNodes` and picks a node | `meshRouter.js:29`, `meshRouter.js:65` |
| `CircuitBreakerRegistry` | one breaker per node | `circuitBreaker.js:138`, `circuitBreaker.js:151` |
| `AgentNode` | actually runs the work | `mesh.js:135` — `await node.enqueue(item)` |

## The sequence — `submitWork`, one attempt

`submitWork` at `mesh.js:114` loops `attempt` from 0 to `maxRetries` inclusive
(`mesh.js:122`). Each pass sends these messages, in this order:

| # | From → To | Message | Where |
|---|---|---|---|
| 1 | caller → Mesh | `submitWork(item, strategy)` | `mesh.js:114` |
| 2 | Mesh → MeshRouter | `excludeNode(id)` for every already-tried node | `mesh.js:226-228` |
| 3 | Mesh → MeshRouter | `selectNode(item, strategy)` | `mesh.js:229` |
| 4 | Mesh → MeshRouter | `includeNode(id)` for every tried node **still HEALTHY** | `mesh.js:231-236` |
| 5 | Mesh → Registry | `allowRequest(node.id)` | `mesh.js:129` |
| 6a | Mesh → MeshRouter | `excludeNode(node.id)` — **only when the breaker refused** | `mesh.js:130` |
| 6b | Mesh → AgentNode | `await node.enqueue(item)` — when the breaker allowed | `mesh.js:135` |
| 7 | Mesh → Registry | `recordSuccess(id)` or `recordFailure(id)` | `mesh.js:136`, `mesh.js:143` |

On success the mesh pushes to `_completedWork`, emits `work_completed` and
returns (`mesh.js:137-140`). When the loop ends without returning, it pushes to
`_failedWork`, emits `work_failed` and throws (`mesh.js:148-151`).

## THE FINDING — message 4 undoes message 6a, one attempt later `[RAN]`

Message 6a excludes a node from routing because its circuit breaker refused the
request (`mesh.js:129-131`). On the **next** attempt, message 4 puts it straight
back — because the re-inclusion predicate at `mesh.js:233` tests
`n._health === HEALTH.HEALTHY` and knows nothing about breaker state.

`[RAN]` the instrumented call sequence for a single `submitWork`, against a node
whose breaker is OPEN but whose health is still `healthy`:

```
select -> node_1
exclude node_1        <- mesh.js:130, the breaker refused it
exclude node_1        <- mesh.js:227, it is now a tried node
select -> node_2
include node_1        <- mesh.js:234, re-included because it is HEALTHY
```

Final state: the breaker is still OPEN, and `_excludedNodes` is **empty**.

### The consequence, measured

Because the exclusion never survives one attempt, every later `submitWork` finds
the condemned node routable again, selects it first (it is least-loaded, having
done no work), and burns attempt 0 on a breaker that refuses it.

`[RAN]` four consecutive `submitWork` calls with one condemned node: the first
selection is the condemned node **every time**, four times out of four, and it
completes zero units of work.

That is a wasted attempt, not a wrong result — the breaker gate at `mesh.js:129`
still holds, so no work is ever sent to the condemned node. But the retry budget
is finite, and the waste is per-attempt:

`[RAN]` with `maxRetries: 1` (two attempts) and **two** condemned nodes plus one
healthy idle node, `submitWork` **throws**:

```
RESULT: submitWork THREW -> no healthy node available
        healthy node node_3 health = healthy , work done = 0
```

Both attempts were spent on nodes the breakers had already condemned; the
healthy node was never selected. The thrown message comes from `mesh.js:148`,
and in this case it is false — a healthy node was available.

### Why the fix is not "remove the re-include"

Message 4 exists for a reason: `_selectAvailableNode` excludes tried nodes only
to keep `selectNode` from returning them again within this call
(`mesh.js:225-228`), and must undo that so other work can still route to them.
The bug is that one method's temporary exclusion and another's durable exclusion
are stored in **the same `_excludedNodes` set** (`meshRouter.js:29`) with no
record of who excluded a node or why. This diagram does not propose a fix; the
distinction between the two kinds of exclusion is the finding.

## Where the breaker state comes from

A breaker opens after `failureThreshold` consecutive failures
(`circuitBreaker.js:90-91`), and `recordFailure` is called from the `catch` at
`mesh.js:143`. It reopens on a failed probe (`circuitBreaker.js:83-86`). It
leaves OPEN only through the cooldown check inside the `state` getter
(`circuitBreaker.js:41-47`), which moves it to HALF_OPEN — so an OPEN breaker on
a HEALTHY node persists until that cooldown elapses. `allowRequest` returns false
for OPEN at `circuitBreaker.js:58`.

Health is a separate signal, owned by the health monitor and applied at
`mesh.js:240-263`, which excludes the node (`mesh.js:245`) **and** trips its
breaker (`mesh.js:246`). That path is not affected by the finding: a node whose
health is FAILED fails the test at `mesh.js:233` and is never re-included.

## Deliberately NOT drawn

- The circuit breaker's own CLOSED / OPEN / HALF_OPEN machine
  (`circuitBreaker.js:12-14`). That is L2 — a different question on a different
  page. Only the yes/no answer it gives to `allowRequest` appears here.
- The node-failure choreography `_onNodeFailed` (`mesh.js:240-263`) and work
  redistribution (`workRedistributor.js`). A second sequence, worth its own
  diagram; mixing two sequences on one page destroys the ordering claim.
- Routing strategies (`meshRouter.js:65-87`). Which node `selectNode` returns is
  L1; that it was asked, and when, is what this page is about.
- `dashboard()` and the emitted events, except where an emit is the last thing
  that happens on a path (`mesh.js:139`, `mesh.js:150`).

## Verification

```
$ node probe_mesh3.mjs          # instrumented single submitWork
bad = node_1 (breaker OPEN, health healthy)  good = node_2
router excluded before: []
call sequence inside submitWork:
     select -> node_1
   exclude node_1
   exclude node_1
     select -> node_2
   include node_1
routed to: node_2
router excluded after : []
breaker still OPEN    : true

$ node probe_mesh4.mjs          # four consecutive calls
submitWork #1: selections=["node_1","node_2"] -> node_2  | wasted attempt: true
submitWork #2: selections=["node_1","node_2"] -> node_2  | wasted attempt: true
submitWork #3: selections=["node_1","node_2"] -> node_2  | wasted attempt: true
submitWork #4: selections=["node_1","node_2"] -> node_2  | wasted attempt: true
work actually done by bad node: 0

$ node probe_mesh5.mjs          # maxRetries 1, two condemned nodes, one healthy
RESULT: submitWork THREW -> no healthy node available
        healthy node node_3 health = healthy , work done = 0
```
