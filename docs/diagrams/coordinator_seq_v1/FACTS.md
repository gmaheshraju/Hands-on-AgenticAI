# FACTS — 21-multi-agent-coordinator, a timeout that frees a busy slot (L2b, 2026-08-25)

Source of truth: `projects/21-multi-agent-coordinator/src/coordinator.js` and
`src/capability.js`. **Every participant, message and note below cites code. The
diagram may contain nothing that is not on this page.**

Altitude: **L2b — time.** Which module holds the counter is L1; `load` is an
integer with no transition table, so there is no L2. The defect is that a
decrement is issued for work that has not stopped.

Claims marked `[RAN]` were produced by driving the real `Coordinator` against a
registered agent. Transcript at the bottom.

## Why this project earned an L2b

The concurrency cap is checked correctly and reserved correctly, with no gap
between them. What goes wrong is the *release*: it is issued on a timeout, and a
timeout here does not stop anything.

## Participants

| Lifeline | What it is | Where |
|---|---|---|
| `Coordinator` | the retry loop in `_executeTask` | `coordinator.js:137`, `coordinator.js:140` |
| `Registry` | holds each agent's `load` | `capability.js:26`, `capability.js:95` |
| `handler, attempt 0` | the skill handler started on the first pass | `coordinator.js:174` |
| `handler, attempt 1` | started on the second pass | `coordinator.js:174` |
| `handler, attempt 2` | started on the third | `coordinator.js:174` |

## The check and the reserve are fine

`selectAgent` (`capability.js:80-88`) refuses when
`best.load >= (best.maxConcurrency || 5)` (`capability.js:85`), and
`_executeTask` calls `incrementLoad` (`coordinator.js:152`) immediately after
`selectAgent` returns (`coordinator.js:142`). **There is no `await` between
them**, so on a single-threaded runtime the check-and-reserve pair cannot be
interleaved. This is the part that works, and it is why the defect is not the
usual check-then-act.

## The release is the defect

The handler is awaited through `_withTimeout` (`coordinator.js:173-176`), which
is a `Promise.race` between the handler and a timer
(`coordinator.js:287-297`, the race at `coordinator.js:293`). When the timer wins
(`coordinator.js:290`), the race settles — **and the handler promise keeps
running.** `Promise.race` cannot cancel its loser; nothing in this file attempts
to.

The rejection lands in the catch at `coordinator.js:196`, which calls
`decrementLoad(agent.id)` at `coordinator.js:198`.

So the sequence is: reserve a slot, abandon the work, release the slot, and the
work is still running. The loop then goes round again (`coordinator.js:140`),
`selectAgent` reads the freed counter, and a second handler starts on an agent
that never stopped doing the first job.

`taskTimeoutMs` defaults to 10 seconds (`coordinator.js:29`) and wraps **every**
skill invocation, so this path is on the ordinary route, not an exotic
configuration.

## The measurement `[RAN]`

One agent declaring `maxConcurrency: 1`, one skill whose handler takes 900ms,
`taskTimeoutMs: 200`, `maxRetries: 2`. The handler increments a counter on entry
and decrements on exit, so "live handlers" is counted directly rather than
inferred:

```
task ended with : Task timed out after 200ms
agent declared maxConcurrency : 1
PEAK concurrent live handlers : 3
load values the registry showed: 1, 0
max load ever observed        : 1
```

Three handlers ran at once on an agent that declared one. **The registry's `load`
never read above 1 at any point.**

That second fact is the one that matters. The cap is not merely exceeded — the
overage is invisible. Every routing decision that consults `load`, including the
sort at `capability.js:70` and the refusal at `capability.js:85`, is reading a
number that does not describe the system.

Three, rather than two, because `maxRetries: 2` gives three passes
(`coordinator.js:140`), and each pass leaves its handler behind.

## What the diagram does NOT claim

- **Not that the timeout is wrong.** Abandoning slow work is a legitimate policy.
  What is wrong is reporting the slot free while the work continues.
- **No fix is drawn.** Cancelling the handler needs a cancellation channel the
  skill interface does not have; holding the slot until the handler settles
  changes what a timeout means. Both are design decisions.
- **Not a claim about the escalation path.** `_tryEscalation`
  (`coordinator.js:256-282`) has the same shape around `seniorAgent`, but it is a
  separate flow and belongs on its own page.

## Deliberately NOT drawn

- The message bus publishes (`coordinator.js:160`, `coordinator.js:184`,
  `coordinator.js:200`). They report; they do not gate.
- Wave scheduling and `Promise.all` over a wave (`coordinator.js:100`). It is a
  real second source of concurrency against the same counter, and drawing two
  sources at once would blur which one produces the effect measured here.
- The success path's `decrementLoad` (`coordinator.js:178`), which is correct —
  it runs only after the handler actually resolved.

## Verification

```
$ node probe_coord.mjs
task ended with : Task timed out after 200ms
agent declared maxConcurrency : 1
PEAK concurrent live handlers : 3
load values the registry showed: 1, 0
max load ever observed        : 1
```
