# FACTS — 23-long-running-agent, step lifecycle (L2, extracted 2026-08-25)

Source of truth: `projects/23-long-running-agent/src/executor.js` and
`src/recovery.js`. **Every state, transition and guard below cites code. The
diagram may contain nothing that is not on this page.**

Altitude: **L2 — legality.** Which transitions a step may make, what decides
each one, and where the machine can stop. The checkpoint store's serialisation
format, the budget accounting and the progress formatter are L1 and are
deliberately excluded.

Claims marked `[RAN]` were produced by executing the code, not by reading it.
The transcripts are at the bottom.

## The shape: one loop, three ways out

`execute()` at `executor.js:36` runs a single `for` loop over `steps`
(`executor.js:65`). Each pass is one step's lifecycle. The loop head is where
the machine decides, in this order:

1. `i < steps.length` — the loop condition at `executor.js:65`. False ends the
   loop and returns `completed` at `executor.js:188`.
2. `budget.check()` at `executor.js:69-70`. Not ok returns `budget_exceeded` at
   `executor.js:82`.
3. Otherwise the step runs.

## States

There is no status enum in this codebase. The set below is every string
assigned to a `status` field, found by enumerating every `status:` site in
`executor.js`.

### Step-level — none of these is terminal

| State | Class | Where |
|---|---|---|
| `running` | active | recorded at `executor.js:91`, and again on each retry at `executor.js:123` |
| `completed` | transitional | `executor.js:232` (recorded), `executor.js:238` (returned) |
| `failed` | transitional | `executor.js:244` (recorded), `executor.js:248` (returned) |
| `skipped` | transitional | `executor.js:144` (retries exhausted) and `executor.js:166` (classifier said skip) |

`failed` is **not** an end state. A failed step goes to the recovery classifier,
which decides whether the step retries, is skipped, or stops the task.

### Task-level — these three are terminal

| State | Class | Where |
|---|---|---|
| `completed` | **terminal** | `executor.js:188` — the loop ran out of steps |
| `aborted` | **terminal** | `executor.js:156` (critical step failed after retries), `executor.js:178` (classifier said abort) |
| `budget_exceeded` | **terminal** | `executor.js:82` |

## Transitions — the complete set

| From | To | Trigger | Where |
|---|---|---|---|
| loop head | `TASK completed` | no steps left | `executor.js:65`, `executor.js:188` |
| loop head | `BUDGET EXCEEDED` | `budget.check()` not ok | `executor.js:70`, `executor.js:82` |
| loop head | `running` | budget ok | `executor.js:91-94` |
| `running` | `completed` | handler resolved | `executor.js:216-217`, `executor.js:238` |
| `running` | `failed` | handler threw, or the timeout fired | `executor.js:211`, `executor.js:219`, `executor.js:248` |
| `completed` | loop head | `continue` — checkpoint at `i+1` | `executor.js:98-99` |
| `failed` | `running` | classifier returned `retry` | `executor.js:109`, `executor.js:126` |
| `failed` | `skipped` | classifier returned `skip`, or retries ran out on an optional step | `executor.js:165-166`, `executor.js:143-144` |
| `failed` | `TASK aborted` | classifier returned `abort`, or retries ran out on a critical step | `executor.js:174-178`, `executor.js:152-156` |
| `skipped` | loop head | `continue` — checkpoint at `i+1` | `executor.js:148`, `executor.js:170` |

## The recovery classifier — complete, in code order

`RecoveryManager.selectStrategy()` at `recovery.js:19-89`. It computes
`retriesLeft = (step.retries ?? 0) - context.retriesUsed` at `recovery.js:21`,
then tests six branches and returns the first that matches:

| # | Condition | Result | Where |
|---|---|---|---|
| 1 | timeout **and** `retriesLeft > 0` | retry; backoff `100ms × attempt`, step timeout doubled | `recovery.js:24-35` |
| 2 | rate limit **and** `retriesLeft > 0` | retry; exponential backoff capped at 16s | `recovery.js:38-49` |
| 3 | auth error | **abort, unconditionally** — never retried, never skipped | `recovery.js:52-56` |
| 4 | data / validation / parse error | skip if optional, abort if `critical` | `recovery.js:59-68` |
| 5 | any other error **and** `retriesLeft > 0` | retry; backoff `200ms × attempt` | `recovery.js:71-79` |
| 6 | retries exhausted | skip if optional, abort if `critical` | `recovery.js:81-89` |

**Branches 1 and 2 fall through.** Their `return` sits inside the
`retriesLeft > 0` test (`recovery.js:25`, `recovery.js:39`), so when retries are
gone the function keeps going and the error is re-classified by branches 3-6.
An exhausted timeout is therefore decided by branch 6, not branch 1.

`[RAN]` a step with no `retries` set that throws an unknown error is classified
by branch 6 immediately — `retriesLeft` is already 0, so branch 5 does not
match. The step is skipped and the task still returns `completed`.

### The timeout is matched by code, not by message

`recovery.js:24` tests `msg.includes('timeout')` first. The executor's own
timeout error says `Step "X" timed out after Nms` (`executor.js:209`), and
`"timed out"` does not contain the substring `"timeout"` — `[RAN]`, it is
`false`. The classification works because `executor.js:210` also sets
`err.code = 'TIMEOUT'`, which is the second half of the same test. The message
check is there for handler-thrown errors that say "timeout" themselves.

### `rollback` is declared but never selected

`recovery.js:17` documents the return type as
`'retry'|'skip'|'rollback'|'abort'` — four strategies. `selectStrategy` has
eight `return` sites and none of them produce `rollback`; the only occurrence is
inside `applyRollback()` at `recovery.js:119`, which is a separate method that
logs a history entry. `applyRollback` is called from
`src/tests/agent.test.js:161` and from nowhere else in the project. The executor
handles `retry` (`executor.js:109`) and `skip` (`executor.js:165`) and treats
everything else as abort (`executor.js:174-178`), so a `rollback` strategy — if
one were ever returned — would silently become an abort.

## Enforcement: the checkpoint index decides what a resume re-runs

`#saveCheckpoint(taskId, nextStepIndex, ...)` at `executor.js:255-266` stores
`currentStepIndex`, which `executor.js:46` reads back as the resume point.
Every call site passes one of two values, and which one it passes is the whole
durability contract:

| Saved as | Meaning | Call sites |
|---|---|---|
| `i + 1` | the step is finished; resume starts **after** it | `executor.js:98` (completed), `:138` (retry succeeded), `:148` (skipped, retries out), `:170` (skipped by classifier) |
| `i` | the step did not finish; resume **re-runs** it | `executor.js:79` (budget stop), `:153` (critical failure), `:175` (abort) |

Consequence: a step that ran halfway and then hit an abort will execute again
from the beginning when the task resumes. A handler with side effects that is
not idempotent will apply them twice.

## Findings — two statuses are reported but never stored `[RAN]`

**`retrying` never reaches the timeline.** On each retry the executor records
one status and streams a different one for the same event:

```js
progress.record({ ..., status: 'running',  message: `retry ${retriesUsed}` });  // executor.js:123
onProgress?.({    ..., status: 'retrying', retry: retriesUsed });               // executor.js:124
```

`[RAN]` with a step that fails twice then succeeds, the `onProgress` stream
reads `running, retrying, retrying, completed`, and the recorded timeline
contains no `retrying` at all.

**A budget stop is the mirror image.** The event built at `executor.js:71-74`
carries `status: 'aborted'` and is both recorded (`executor.js:75`) and streamed
(`executor.js:76`) — but the value returned to the caller at `executor.js:82` is
`budget_exceeded`. `[RAN]` return status `budget_exceeded`, last streamed status
`aborted`.

So the live stream, the stored timeline and the return value are three
different vocabularies for the same events. Anything built on one of them —
a dashboard, an alert, a test — will disagree with the other two.

## Deliberately NOT drawn

- `ProgressReporter` internals and `formatTimeline()` — presentation, L1.
- `ExecutionBudget` accounting (`budget.record`, `budget.report`) — the diagram
  shows only whether the gate passed.
- `CheckpointStore` serialisation. The *index* is on the diagram because it is
  the transition contract; the storage format is not.
- The resume replay at `executor.js:51-61`, which re-records already-finished
  steps into the progress reporter. It restores a view, not a state.

## Verification

```
$ node probe_status.mjs
onProgress stream  : ["running","retrying","retrying","completed"]
task status        : completed | step status: completed
timeline contains "retrying"?  false

returned status    : budget_exceeded
onProgress stream  : ["running","completed","aborted"]

$ node probe_exec.mjs          # step with no `retries`, unknown error
task status : completed
results     : [{"n":"flaky","s":"skipped","r":"Retries exhausted on non-critical step — skipping"}, ...]

$ node -e '...'                # the timeout message/substring check
executor timeout message : "step \"x\" timed out after 100ms"
msg.includes("timeout") : false
```
