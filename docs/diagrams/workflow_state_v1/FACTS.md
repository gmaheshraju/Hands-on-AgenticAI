# FACTS — 18-workflow-engine, WorkflowRun state machine (L2, extracted 2026-08-25)

Source of truth: `projects/18-workflow-engine/src/state.js` and `src/engine.js`.
**Every state, transition and guard below cites code. The diagram may contain
nothing that is not on this page.**

Altitude: **L2 — legality.** Which transitions exist, which are guarded, which
states are terminal. The workflow's node-execution flow (DAG walk, retries,
parallel fan-out) is L1 and is deliberately excluded — it is a different
question and belongs on a different page.

## States — the complete enum, frozen

`VALID_TRANSITIONS` at `state.js:12-18` defines the entire legal universe.
A run is born `PENDING` at `state.js:24`.

| State | Class | Meaning |
|---|---|---|
| `PENDING` | initial | run constructed, not started — `state.js:24` |
| `RUNNING` | active | walking the DAG, executing nodes |
| `WAITING_APPROVAL` | transitional | paused at an approval node, awaiting a decision |
| `COMPLETED` | **terminal** | `VALID_TRANSITIONS.COMPLETED = []` — `state.js:16` |
| `FAILED` | **terminal** | `VALID_TRANSITIONS.FAILED = []` — `state.js:17` |

## Transitions — the complete legal set, and every call site

The table permits six moves. All six have a call site; there are no orphan rows.

| From | To | Trigger | Where |
|---|---|---|---|
| `PENDING` | `RUNNING` | run starts | `engine.js:168` |
| `RUNNING` | `WAITING_APPROVAL` | the next node has `type === 'approval'` | `engine.js:246-247` |
| `WAITING_APPROVAL` | `RUNNING` | that approval node completed | `engine.js:267-268` |
| `RUNNING` | `COMPLETED` | DAG walk finished without an unhandled error | `engine.js:207` |
| `RUNNING` | `FAILED` | a non-optional node threw | `engine.js:200-201`, `:210` |
| `WAITING_APPROVAL` | `FAILED` | same catch — a run can fail while paused | `state.js:15`, `engine.js:210` |

## Enforcement — the mechanism, not a convention

`transition(newStatus)` at `state.js:33-37` reads `VALID_TRANSITIONS[this.status]`
and **throws** `Invalid transition: <from> → <to>` when the target is not in that
list. An illegal move cannot be performed; it raises. Every successful move is
recorded as a `state_change` trace entry carrying `{from, to}` — `state.js:38-40`.

## The one swallowed failure — `engine.js:210`

```js
try { run.transition('FAILED'); } catch (_) { /* already failed */ }
```

This is the only `transition()` call in the codebase wrapped in a bare catch.
Because `FAILED` is terminal (`VALID_TRANSITIONS.FAILED = []`), a second attempt
to fail an already-failed run throws, and that throw is deliberately discarded.
Every other call site lets the error propagate.

Consequence worth stating plainly: the guard still holds — the run does not
re-enter `FAILED`, and no illegal state is ever reached. What is lost is the
*signal*. If this line ever fires for a reason other than "already failed", the
evidence is discarded with it.

## Deliberately NOT drawn

- The DAG walk, node executors, retry policy and parallel fan-out — L1 concerns.
- `nodeResults` and per-node status (`state.js:60-95`); that is a second, nested
  state machine over nodes, not over the run, and mixing altitudes is the thing
  the rules forbid.

## Portability notes

- `state.stable` was renamed `state.active` in the theme. "Stable (money-on)"
  is trading vocabulary; the portable meaning is "the state where work happens".
- `transition.doorway` has **no occupant here** and is unused. This machine has
  no sanctioned exception — the closest thing is the swallowed catch at
  `engine.js:210`, which is an error being discarded, not a state move. Drawing
  it as a doorway would imply a transition that does not exist.
