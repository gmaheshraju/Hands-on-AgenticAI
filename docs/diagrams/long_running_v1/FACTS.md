# FACTS — 23-long-running-agent (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/23-long-running-agent/src/`, n=7 JS modules (971 lines)
+ 1 test file (388 lines). **Every element in the diagram appears below with a
`file:line` citation. The diagram may contain nothing that is not on this page,
and this page may contain nothing without a citation.** The project README ships
an ASCII architecture diagram and a design-decisions section; both were treated
as CLAIMS, not as evidence. Three of those claims did not survive the reading
(see "README claims that did not verify") and the diagram draws the code, not
the README.

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The retry while-loop, the seven-branch
strategy tree, and the timeline/ETA string formatting are L2 concerns; the
strategy tree is enumerated on a card because it is the executor's only decision
table, but it is not drawn as boxes.

---

## Entry points

| Fact | Citation |
|---|---|
| `demo.js` — no CLI flags, no `process.argv`; `main()` runs all four scenarios unconditionally | demo.js:171, :179, :180, :181, :182 |
| Scenario 1 Deep Research (8 steps, mixed criticality) | demo.js:44 |
| Scenario 2 CI Pipeline (deploy fails once, retries, succeeds) | demo.js:70 |
| Scenario 3 Crash Recovery (abort at step 3, resume from checkpoint) | demo.js:100 |
| Scenario 4 Budget Enforcement ($0.10 cap) | demo.js:143 |
| Failure path: `main().catch` → `process.exit(1)` | demo.js:196, :198 |
| `package.json` wires `demo` → `node src/demo.js` and `test` → `node --test src/tests/*.test.js` | package.json:7, :8 |
| `src/tests/agent.test.js` — 27 `it()` cases across 6 `describe()` suites | agent.test.js:12, :68, :115, :169, :197, :349 |
| Observed on an actual run (`node --test`, 2026-08-24): tests 27, suites 6, pass 27, fail 0 | run output, not a source line |

## Task definitions — `src/tasks.js`

| Fact | Citation |
|---|---|
| `simulateWork(name, opts)` returns an async closure: `setTimeout` delay, optional random failure, then a literal `{tokens, cost, message}` | tasks.js:8, :10, :11, :14 |
| `deepResearchTask()` — 8 steps, `budget {maxCost 0.50, maxDuration 300}` | tasks.js:22, :26, :33, :35 |
| `ciPipelineTask()` — 6 steps, deploy throws on attempt 1 | tasks.js:43, :48, :60, :69 |
| `dataMigrationTask({crashAtStep})` — 5 steps, transform throws `SIMULATED CRASH` | tasks.js:77, :82, :90, :100 |
| `expensiveTask()` — 5 steps × $0.04 against a $0.10 cap | tasks.js:108, :112, :116, :118 |
| Total: **4 task definitions, 24 steps**, every handler produced by `simulateWork` or an inline async closure | tasks.js:26-33, :48-67, :82-98, :112-116 |
| **No network, no filesystem, no child process, no LLM anywhere in the repo** — the only async primitive in a handler is `setTimeout` | tasks.js:10, :57, :88 |

## The engine — `src/executor.js`

| Fact | Citation |
|---|---|
| `class DurableExecutor` | executor.js:14 |
| Constructor injects `checkpointStore` and `recoveryManager`, defaulting to fresh instances — these two **outlive** a run | executor.js:18, :19, :20 |
| `async execute(task, {onProgress})` — the single public entry | executor.js:36 |
| `ExecutionBudget` and `ProgressReporter` are constructed **inside** `execute()` — they are per-run, not injected | executor.js:38, :39 |
| Resume: `checkpointStore.load(id)` → `startIndex`, `results`, `budget.restore` | executor.js:44, :46, :47, :48 |
| Completed steps are replayed into the reporter so the timeline is whole | executor.js:51, :53 |
| The step loop `for (let i = startIndex; i < steps.length; i++)` | executor.js:65 |
| Budget checked **before** each step | executor.js:69 |
| `#executeStep()` — 2 call sites (first attempt, retry) | executor.js:94, :126, :200 |
| Failure → `recoveryManager.selectStrategy(...)` (2 call sites: first failure, re-select inside the retry loop) | executor.js:103, :130 |
| Retry loop bounded by `step.retries ?? 0`, sleeps `recovery.backoffMs` | executor.js:113, :115, :117, :118 |
| `#executeStep` wraps the handler in a promise with an optional `setTimeout` | executor.js:200, :205, :207, :208 |
| `await step.handler()` — the only place user work is invoked | executor.js:216 |
| `clearTimeout` on the success path and on the failure path | executor.js:224, :240 |
| `budget.record(cost, tokens, elapsed)` after a successful step | executor.js:229 |
| `progress.record(event)` + `onProgress?.(...)` inside `#executeStep` | executor.js:235, :236 |
| `#saveCheckpoint(taskId, nextStepIndex, completedSteps, budget)` | executor.js:255, :256 |
| `sleep()` helper at module scope | executor.js:275 |
| Getters expose the two injected collaborators | executor.js:269, :272 |

### `progress.record` / `onProgress` call sites

`progress.record` — 10 sites: executor.js:53, :75, :91, :123, :146, :154, :168,
:176, :235, :243. `onProgress?.()` — 6 sites: executor.js:76, :92, :124, :147,
:169, :236. The demo supplies the callback in all four scenarios: demo.js:53,
:80, :110, :128, :152.

## Collaborators

| Module | Fact | Citation |
|---|---|---|
| `CheckpointStore` | `class`, backed by `#store = new Map()` — process memory only | checkpoint.js:7, :9 |
| | `save()` auto-versions: `version = history.length + 1`, deep-clones via `JSON.parse(JSON.stringify(...))` | checkpoint.js:17, :22, :25 |
| | `load()` returns the latest state, deep-cloned, or `null` | checkpoint.js:35, :37, :38 |
| | `listCheckpoints()`, `clear()`, `count()` | checkpoint.js:46, :59, :68 |
| `ExecutionBudget` | `class`; limits default to `Infinity` | budget.js:7, :21 |
| | `#startTime = Date.now()` set once, in the constructor | budget.js:25 |
| | `record()` adds cost/tokens/duration and `+= 1` API call | budget.js:34, :38 |
| | `check()` → `{ok, violations[]}` | budget.js:45 |
| | `report()` — the human-readable block the demo prints | budget.js:64 |
| | `restore()` — used on resume | budget.js:87 |
| `RecoveryManager` | `class`, keeps a `#recoveries` audit list | recovery.js:8, :9 |
| | `selectStrategy(error, step, context)` | recovery.js:19 |
| | `applyRollback(store, taskId, rollbackCount)` | recovery.js:101 |
| | `history` / `count` getters — the demo prints them | recovery.js:127, :130, demo.js:92, :93 |
| `ProgressReporter` | `class`, `#events` array | progress.js:4, :5 |
| | `record(event)` stamps `timestamp` | progress.js:19, :20 |
| | `formatProgress()` — done/total, %, ETA from mean completed `elapsed` | progress.js:27, :34, :39, :41 |
| | `formatTimeline(steps)` — 6 status icons | progress.js:54, :55-62 |
| | `events` getter (copy) | progress.js:79 |

## Output

**No file is written anywhere in the project.** Every output is `console.log`
from `demo.js`.

| Output | Written by | Citation |
|---|---|---|
| Per-step live ticks (`✓ name (Nms)`) | the `onProgress` callbacks | demo.js:55, :82, :111, :130, :154 |
| Timeline block | `result.timeline` ← `progress.formatTimeline` | demo.js:61, :138, :164; executor.js:85 |
| Budget report | `result.budget` ← `budget.report()` | demo.js:63, :162; executor.js:84, budget.js:64 |
| Checkpoint count | `store.count(task.id)` | demo.js:65, checkpoint.js:68 |
| Recovery list | `recovery.history` | demo.js:93, recovery.js:127 |
| Result box (`status` + `formatProgress`) | `box()` | demo.js:67, :97, :140, :166 |

---

### INVARIANT CARD 1 — `selectStrategy()`: 7 branches, complete, in code order

The executor has exactly one decision table and this is it. Nothing else in the
system chooses what to do with a failure.

| # | Condition | Result | Citation |
|---|---|---|---|
| 1 | `timeout` in message **or** `code === 'TIMEOUT'`, **and** retries left | `retry`, backoff `100 × (n+1)`, timeout doubled | recovery.js:24, :25, :27, :29, :30 |
| 2 | `rate limit` / `429` / `code === 'RATE_LIMIT'`, **and** retries left | `retry`, backoff `min(1000 × 2ⁿ, 16000)` | recovery.js:38, :39, :40, :42, :43 |
| 3 | `auth` / `401` / `403` / `code === 'AUTH'` | `abort` — the only unconditional return | recovery.js:52, :53 |
| 4 | `data` / `validation` / `parse` / `code === 'DATA'`, non-critical step | `skip` | recovery.js:59, :60, :61 |
| 5 | same, critical step | `abort` | recovery.js:59, :65 |
| 6 | anything else, retries left | `retry`, backoff `200 × (n+1)` | recovery.js:71, :73, :75 |
| 7 | retries exhausted → `skip` if non-critical, else `abort` | terminal | recovery.js:81, :82, :87 |

**The fall-through.** Branches 1 and 2 open with an outer `if` on the error text
and an inner `if (retriesLeft > 0)`. When retries are exhausted the inner test
fails and **nothing returns** — control leaves the outer block and continues down
the ladder, landing in branch 7. So a timed-out step with no retries left is
classified by criticality, not by "timeout". Outer/inner tests: recovery.js:24
+ :25, and :38 + :39; the ladder continues at :52.

`retriesLeft = (step.retries ?? 0) - context.retriesUsed` (recovery.js:21).
`#executeStep` always returns `retriesUsed: 0` (executor.js:248), so the count
that matters is the loop's own counter, passed at executor.js:131.

**`rollback` is declared but never selected.** The JSDoc return type lists
`'rollback'` (recovery.js:17) and the README's ASCII lists it as a Recovery
Manager capability, but `selectStrategy` never returns it and `applyRollback`
(recovery.js:101) has **no caller in `src/`** — the only invocation in the repo
is a unit test (agent.test.js:154). The executor handles exactly `retry`
(executor.js:109), `skip` (executor.js:165), and an unlabelled else-branch that
aborts (executor.js:174, :177).

### INVARIANT CARD 2 — what actually survives a crash

| Fact | Citation |
|---|---|
| The store is a `Map` in the **same process** as the executor | checkpoint.js:9 |
| Nothing is serialised to disk, and no database is opened — the repo has zero dependencies | package.json:1-10 (no `dependencies` key) |
| `save()` is called from **7 sites**, all inside `execute()` | executor.js:79, :98, :138, :148, :153, :170, :175 |
| Saved on abort as well as on success — the budget-abort path saves before returning | executor.js:79, :81 |
| Checkpointed state is exactly 3 keys: `currentStepIndex`, `completedSteps`, `budget` (4 counters) | executor.js:256, :257, :258, :259-264 |
| Step payloads are **dropped**: `{...s, result: undefined}`, then `JSON.stringify` removes the key | executor.js:258, checkpoint.js:25 |
| Resume reads `currentStepIndex`, `completedSteps`, `budget` back | executor.js:46, :47, :48 |
| `budget.restore()` resets four counters but **not** `#startTime` | budget.js:87, :88-91, :25 |
| ⇒ the `maxDuration` clock restarts at zero on every resume | budget.js:50, :51 |
| The demo's "crash" is a thrown `Error`, caught in-process — no process ever exits | tasks.js:90, executor.js:218, :248 |
| ⇒ a real `SIGKILL` would take the `Map` with it; resume works only within one process | checkpoint.js:9 |
| Observed run: Deep Research reports **8 checkpoints saved** for 8 steps | demo.js:65 (observed output, 2026-08-24) |

### INVARIANT CARD 3 — the budget is a floor, not a ceiling

| Fact | Citation |
|---|---|
| `check()` runs **before** a step | executor.js:69 |
| `record()` runs **after** the handler returns | executor.js:229 |
| ⇒ the step that breaches the limit runs to completion and is billed in full | executor.js:69 + :229 |
| Three limits, all `>=` comparisons: cost, elapsed seconds, API calls | budget.js:47, :51, :54 |
| `apiCalls` is incremented once per recorded step — it counts steps, not HTTP calls | budget.js:38 |
| All three default to `Infinity` — a task with no `budget` key is ungated | budget.js:21, executor.js:37 |
| Breach → status `budget_exceeded`, checkpoint saved first | executor.js:79, :81, :82 |
| Observed run: `$0.1200` spent against a `$0.1000` cap, 3 steps billed, abort raised before step 4 | demo.js:145 + observed output, 2026-08-24 |

`execute()` has exactly **4 exits**: `budget_exceeded` (executor.js:81),
`aborted` after a critical step exhausts retries (executor.js:155), `aborted` on
a non-retry strategy (executor.js:177), and `completed` (executor.js:187).

---

## README claims that did not verify

1. **"Recovery Manager — retry/skip/rollback/abort"** (README.md:26-28) and the
   JSDoc return type at recovery.js:17. `selectStrategy` never returns
   `rollback`; `applyRollback` (recovery.js:101) is called by no module in
   `src/` — its only caller in the repo is agent.test.js:154. The diagram draws
   that edge from the test file, labelled as the sole caller, rather than from
   the executor.
2. **The ASCII draws Checkpoint Store, Execution Budget, Recovery Manager and
   Progress Reporter as four peer boxes nested inside DurableExecutor**
   (README.md:22-33). In code they split two-and-two on lifetime: the store and
   the recovery manager are constructor-injected and survive across runs
   (executor.js:19, :20 — demo 3 depends on exactly this, reusing one store
   across two executors, demo.js:106, :123), while the budget and the reporter
   are constructed fresh inside every `execute()` call (executor.js:38, :39).
   The diagram carries that lifetime split on the box labels.
3. **"Budget … violations halt execution immediately"** (README.md:52). The
   check is a pre-step gate (executor.js:69), and usage is recorded post-step
   (executor.js:229), so a run overshoots its cap by up to one step's cost —
   measured at $0.1200 against a $0.1000 cap on the shipped demo. "Immediately"
   is true only of the *next* step. This is invariant card 3.

A fourth claim was checked and **held**: "Every `setTimeout` for step timeouts is
paired with a `clearTimeout` on both success and failure paths" (README.md:56) —
verified at executor.js:208 (set), :224 (success), :240 (failure). Note the
handler itself is not cancelled by the timeout: `step.handler()` keeps running
after the wrapper promise rejects (executor.js:216, :221), and the `sleep()`
timer (executor.js:276) is never cleared. Both are L2 details, excluded from the
drawing. The "27 tests" claim (README.md:11) also held: 27 pass, 0 fail.

## Folded into one box (to hold the 6-12 component-box rule)

The page draws **11 component boxes**. Each fold keeps both citations on the
surviving box.

| Folded | Into | Why it is legitimate |
|---|---|---|
| `#saveCheckpoint()` (executor.js:255) | the `CheckpointStore` box | it is a private one-line adapter whose entire body is a `store.save()` call (executor.js:256); it is not a separate address |
| the four task factories (tasks.js:22, :43, :77, :108) | one `tasks.js` box | same module, same shape, same consumer; the counts (4 tasks, 24 steps) are on the box |
| `sleep()` (executor.js:275) and the retry while-loop (executor.js:115) | the `DurableExecutor` box | L2 control flow inside one function |
| the six `console.log` sites in the demo's scenario bodies | one `stdout` box | same destination, same phase |

## Deliberately NOT drawn (L1 scope discipline)

- The retry while-loop and its re-selection of strategy (executor.js:115-134) —
  L2; its outcome (retry / skip / abort) is on card 1.
- `formatTimeline` / `formatProgress` string building and the 6-icon map
  (progress.js:54-76) — L2 presentation.
- `applyRollback`'s version arithmetic (recovery.js:102-116) — L2, and the
  function is unreachable from `src/` anyway.
- The 24 individual step definitions — data, not architecture; the counts are on
  the `tasks.js` box.
- The four demo scenarios as separate boxes — they are four calls to the same
  `execute()`; the count is on the `demo.js` box.

## Portability notes — tokens that needed bending for this domain

The token vocabulary was built for a trading system. Recorded because "rules
bent per new domain" is the tracked portability metric.

1. **`component.external` has no legitimate occupant at all — it is unused on
   this page.** This project makes zero network calls, opens zero files, spawns
   zero processes and calls zero models; `grep` for `fetch|http|fs|require` in
   `src/` returns nothing. The recurring "external surface is a hardcoded mock"
   strain is at its extreme here: there is no external surface to mock.
2. **`component.agent` occupies a position, not an occupant.** The structural
   agent slot is `step.handler()` (executor.js:216) — an opaque async closure the
   engine awaits without knowing what it does. In production that is the LLM or
   tool call; in this repo every one of the 24 handlers is `simulateWork`
   (tasks.js:8), a `setTimeout` plus a literal return value. The token was used
   for that slot and the correction is carried on the box label
   (**SIMULATED**) so the picture cannot mislead.
3. **`boundary.external` labels a zone that never leaves the process.** Used for
   the work surface for the same reason as (2); the zone label says SIMULATED,
   in-process.
4. **`component.artifact` over-promises durability, twice.** It was used for
   `CheckpointStore` — which is a `Map` (checkpoint.js:9), the single most
   important correction on this page — and for stdout, which persists nothing.
   Both labels carry the correction. A `component.store` / `component.stdout`
   pair would be honest; `component.store` is exactly the token this theme
   *renamed away* (hoa-default.json `_meta.renames`), and this project is the
   case that wanted it back.
5. **`boundary.datasource` labels source code, not data.** The entry zone holds
   `demo.js`, the test file and `tasks.js`; the nearest token was reused.
6. **No `edge.data_out` token exists** (same gap as guardrails_v1): results →
   stdout borrowed `edge.artifact`.
7. **`edge.analysis` was borrowed for a return value.** The recovery strategy
   travelling back from `RecoveryManager` to the executor is a decision, not an
   analysis pass; it is the nearest dashed, non-primary token.
