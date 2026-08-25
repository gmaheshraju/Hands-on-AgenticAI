# FACTS — 24-llm-gateway, two requests against one budget (L2b, extracted 2026-08-25)

Source of truth: `projects/24-llm-gateway/src/gateway.js`, `src/costTracker.js`,
`src/rateLimit.js`. **Every participant, message and note below cites code. The
diagram may contain nothing that is not on this page.**

Altitude: **L2b — time.** The gateway's module layout is L1; the circuit
breaker's own states are L2. This page is about one thing: where the reads and
the writes to a shared counter sit relative to two `await`s.

Claims marked `[RAN]` were produced by executing the gateway against a mock
provider. Transcripts are at the bottom.

## Why this project earned an L2b, and why the case is unusually clean

Because the same eight requests behave differently depending only on their
interleaving, the experiment falsifies the lower altitude directly. **Run
sequentially, the cap logic is correct** — it refuses everything after the
threshold is crossed. Run concurrently, the identical code with the identical
inputs overspends. Nothing about which transitions are legal has changed, so
this is not an L2 defect; the only variable is order.

## Participants

| Lifeline | What it is | Where |
|---|---|---|
| `Request A` | one call to `request()` | `gateway.js:32` |
| `Request B` | a second concurrent call to the same method | `gateway.js:32` |
| `CostTracker` | holds `records`, derives `todaySpend` | `costTracker.js:13`, `costTracker.js:64` |
| `RateLimiter` | holds per-team token and request buckets | `rateLimit.js:40`, `rateLimit.js:56` |
| `provider` | the awaited model call | `gateway.js:85` |

## The gap

`request()` reads both counters at the top and writes both at the bottom, with
two `await`s in between:

| Step | What | Where |
|---|---|---|
| read | `costTracker.checkBudget(teamId)` | `gateway.js:38` |
| refuse | returns `BUDGET_EXCEEDED` when not allowed | `gateway.js:39-41` |
| read | `rateLimiter.check(teamId, estimatedTokens)` | `gateway.js:45-46` |
| refuse | returns `RATE_LIMITED` when not allowed | `gateway.js:47-49` |
| **await** | custom middleware | `gateway.js:77` |
| **await** | `_executeWithRetry` — the provider call | `gateway.js:85` |
| write | `rateLimiter.consume(teamId, actualTokens)` | `gateway.js:90` |
| write | `costTracker.record({ costUsd, ... })` | `gateway.js:91` |

Nothing between the read and the write reserves anything. A second request
entering during either await reads counters that do not yet include the first.

## What the guard actually says

`checkBudget` at `costTracker.js:54-62` reads `todaySpend(teamId)`
(`costTracker.js:57`) and refuses only when `spent >= budget.daily`
(`costTracker.js:58`). `todaySpend` sums `costUsd` over today's records
(`costTracker.js:64-69`), and a record exists only after `record()` at
`costTracker.js:13` has run — which is `gateway.js:91`, after both awaits.

Two consequences, and the second is the one that makes concurrency expensive:

1. The cap is **crossed, then enforced.** A request that takes the team over is
   allowed; the *next* one is refused. Even serialised, spend ends above the cap
   by up to the cost of one request. `[RAN]` sequential, n=8, cap $0.10, one
   request costing $0.18: 1 executed, 7 blocked, final spend $0.18.
2. Concurrently, **no request is the "next" one.** All of them read before any of
   them writes.

## The measurement `[RAN]`

Same gateway, same mock provider, same 8 requests, same $0.10/day cap. The only
difference is `Promise.all` versus a `for` loop.

| Ordering | executed | blocked | final spend |
|---|---|---|---|
| concurrent, n=8 | **8** | **0** | **$1.44** |
| sequential, n=8 | 1 | 7 | $0.18 |

Eight times the spend, and seven refusals became none.

The absolute dollar figure is **not** a property of the code — it scales with
whatever the mock provider reports as usage, and a different probe would produce
a different headline. The reproducible quantity is the **ratio**: with n
concurrent requests that each individually exceed the cap, n execute where 1
should. Stated as a number, spend goes up by a factor of n.

## The same shape, twice, in the same function `[RAN]`

The rate limiter has the identical gap — `check` at `gateway.js:46`, `consume`
at `gateway.js:90`, the same two awaits in between.

`[RAN]` 12,000 tokens/minute, each call consuming 10,000:

| Ordering | rate-limited | executed |
|---|---|---|
| concurrent, n=6 | **0** | **6** |
| sequential, n=6 | 4 | 2 |

There is also an asymmetry that survives serialisation: the check is made
against `_estimateTokens(req)` (`gateway.js:45`, `gateway.js:169`) while the
debit is the **actual** usage the provider returned (`gateway.js:90`). The
amount tested and the amount charged are different numbers by construction.

## What this diagram does NOT claim

- **Not that the cap logic is wrong.** It is correct, and the sequential run is
  the proof. Only the placement of the write relative to the await is at fault.
- **No fix is proposed.** Reserving at check time, or making check-and-consume
  atomic, changes refund and failure semantics for requests that error after
  reserving. That is a design decision.
- **Nothing about a real provider's latency.** The mock awaits 60ms; the gap
  exists at any latency above zero, and grows with it.

## Deliberately NOT drawn

- PII redaction (`gateway.js:52-66`), routing (`gateway.js:68-73`), the circuit
  breaker and failover inside `_executeWithRetry` (`gateway.js:114`). All are
  between the read and the write, and all are irrelevant to the defect — the
  awaits are what matter, not what happens during them.
- The audit log writes. They record what happened; they do not gate anything.
- `_checkBudget` at `costTracker.js:32`, which raises threshold *alerts* after a
  record lands. It notifies, it does not refuse.

## Verification

```
$ node probe_gateway2.mjs        # cap $0.10/day, one request costs $0.18
  CONCURRENT  executed=8  blocked=0  spend=$1.44   14x over cap
  SEQUENTIAL  executed=1  blocked=7  spend=$0.18   2x over cap
  ratio concurrent/sequential spend: 8.0x

$ node probe_rate.mjs            # 12,000 tokens/min, each call uses 10,000
  CONCURRENT n=6  rate_limited=0  executed=6
  SEQUENTIAL n=6  rate_limited=4  executed=2
```
