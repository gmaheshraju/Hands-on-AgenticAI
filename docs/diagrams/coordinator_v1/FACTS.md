# FACTS — 21-multi-agent-coordinator, L1 architecture

Source root: `projects/21-multi-agent-coordinator`
Extracted 2026-08-24 by reading every file in `src/` with `cat -n` and cross-checking
with `grep -n`. Every element that appears in `spec.py` is cited below. Nothing appears
on the diagram that is not in this file.

The project ships an ASCII architecture block in `README.md:14-101`. It was treated as a
**claim set**, not as source. Four of its claims are contradicted by the code — see
§ CLAIMS CHECKED. This is the third recorded instance of a README/header being false about
its own bus wiring.

---

## 0. Shape of the system, in one paragraph

`21-multi-agent-coordinator` is a **single Node ESM process with no I/O**. It has no
network calls, no filesystem access, and no LLM: `grep -rn "require(\|fetch(\|node:fs\|writeFile\|readFile\|http" src/`
returns nothing. `package.json:4` sets `"type": "module"`; `package.json:7-8` define the
only two run modes. A request string is pattern-matched into skill-tagged sub-tasks,
sub-tasks are grouped into priority waves, each task is routed to the least-loaded
capability card that declares the skill, and the card's `handler` — an async closure over
`setTimeout` — is invoked **directly**. A message bus records five kinds of envelope for
audit; it carries no work.

---

## 1. Components

| # | Node id | Element | Token | Citation |
|---|---|---|---|---|
| 1 | `n_demo` | `demo.js` CLI — `runDemo()` and its four `processRequest` calls | `component.entry` | `src/demo.js:19`, `src/demo.js:143`, `src/demo.js:59`, `src/demo.js:69`, `src/demo.js:79`, `src/demo.js:89` |
| 2 | `n_cards` | `ALL_AGENTS` — 6 capability cards, module constant | `component.mock` | `src/agents.js:309-316` |
| 3 | `n_rules` | `DECOMPOSITION_RULES` — 5 regex rules, module constant | `component.mock` | `src/decomposer.js:9-56`, fallback `src/decomposer.js:78-90` |
| 4 | `n_test` | `src/tests/coordinator.test.js` — second entry point, 15 `it()` cases in 4 `describe()` blocks | `component.entry` | `src/tests/coordinator.test.js:27`, `:71`, `:105`, `:133` |
| 5 | `n_registry` | `CapabilityRegistry` — `register()` builds `agents` Map + `skillIndex` Map | `component.service` | `src/capability.js:13`, `src/capability.js:19`, `src/capability.js:16`, `src/capability.js:33-38` |
| 6 | `n_decomp` | `decomposer.js` — `decompose()` and `getExecutionPlan()`; waves grouped by `priority` | `component.service` | `src/decomposer.js:58`, `src/decomposer.js:97`, `src/decomposer.js:106`, `src/decomposer.js:110` |
| 7 | `n_exec` | `Coordinator.processRequest()` — the wave loop, `Promise.allSettled` per wave | `component.service` | `src/coordinator.js:47`, `src/coordinator.js:94`, `src/coordinator.js:99` |
| 8 | `n_task` | `Coordinator._executeTask()` — the per-task retry loop; `maxRetries` default 2 | `component.service` | `src/coordinator.js:137`, `src/coordinator.js:140`, `src/coordinator.js:28` |
| 9 | `n_select` | `CapabilityRegistry.selectAgent()` — load-then-cost routing under a concurrency cap | `component.service` | `src/capability.js:80`, `src/capability.js:70`, `src/capability.js:85` |
| 10 | `n_handler` | the skill `handler` — an async closure built by `createHandler()`, work simulated by `delay()` | `component.mock` | `src/agents.js:17`, `src/agents.js:20`, `src/agents.js:9`, header `src/agents.js:4-5` |
| 11 | `n_escalate` | `Coordinator._tryEscalation()` — follows the card's `escalatesTo` | `component.service` | `src/coordinator.js:225`, `src/coordinator.js:227` |
| 12 | `n_bus` | `MessageBus` — `publish()` appends to `history[]`, capped at 500 | `component.service` | `src/bus.js:13`, `src/bus.js:28`, `src/bus.js:17`, `src/bus.js:36-39` |
| 13 | `n_summary` | run summary — `_printRunSummary()` plus the demo's cross-run totals | `component.service` | `src/coordinator.js:299`, `src/demo.js:118` |
| 14 | `n_stdout` | stdout — the only output surface; no file is written and no socket opened | `component.artifact` | `src/coordinator.js:305-320`, `src/demo.js:138-140`; absence proven by the `grep -rn` in § 0 |

14 component boxes. Zones: `boundary.datasource` (inputs), `boundary.primary` (the process),
`boundary.functional` (the per-task pipeline), `boundary.observability` (output).

---

## 2. Flows (edges)

| Edge | From → To | What actually happens | Citation |
|---|---|---|---|
| `e_demo_reg` | demo → registry | `for (const card of ALL_AGENTS) registry.register(card)` | `src/demo.js:31`, `src/demo.js:32` |
| `e_cards_reg` | ALL_AGENTS → registry | the 6 cards are the register argument | `src/agents.js:309`, `src/capability.js:19` |
| `e_demo_dec` | demo → decomposer | `processRequest()` calls `decompose(request)` as step 1 | `src/coordinator.js:47`, `src/coordinator.js:71` |
| `e_rules_dec` | rules → decomposer | first `rule.pattern.test(requestStr)` that matches wins | `src/decomposer.js:61`, `src/decomposer.js:62` |
| `e_test_exec` | tests → processRequest | the test suite drives the same public entry | `src/tests/coordinator.test.js:140` |
| `e_dec_exec` | decomposer → processRequest | `run.executionPlan = getExecutionPlan(tasks)` | `src/coordinator.js:82` |
| `e_exec_task` | processRequest → \_executeTask | one `_executeTask` per task in the wave, all launched together | `src/coordinator.js:99`, `src/coordinator.js:100` |
| `e_task_sel` | \_executeTask → selectAgent | `this.registry.selectAgent(task.skill)` each attempt | `src/coordinator.js:142` |
| `e_sel_handler` | selectAgent → handler | `skillDef.handler(...)` wrapped in `_withTimeout` | `src/coordinator.js:170`, `src/coordinator.js:173`, `src/coordinator.js:174` |
| `e_handler_back` | handler → \_executeTask | resolved value becomes the task result | `src/coordinator.js:181`, `src/coordinator.js:194` |
| `e_task_esc` | \_executeTask → \_tryEscalation | two call sites: no agent available, and last retry failed | `src/coordinator.js:146`, `src/coordinator.js:213` |
| `e_esc_handler` | \_tryEscalation → handler | escalation invokes the **target's** handler directly | `src/coordinator.js:259` |
| `e_reg_sel` | registry → selectAgent | `skillIndex` is the lookup table `selectAgent` reads | `src/capability.js:65`, `src/capability.js:81` |
| `e_task_bus` | \_executeTask → bus | 3 publish sites inside the retry loop | `src/coordinator.js:160`, `src/coordinator.js:184`, `src/coordinator.js:200` |
| `e_esc_bus` | \_tryEscalation → bus | 2 publish sites inside escalation | `src/coordinator.js:245`, `src/coordinator.js:269` |
| `e_exec_sum` | processRequest → summary | the `run` object is what the summary prints | `src/coordinator.js:125`, `src/coordinator.js:128`, `src/coordinator.js:131` |
| `e_bus_sum` | bus → summary | `bus.getStats()` and `bus.getHistory()` feed the demo totals | `src/demo.js:118`, `src/demo.js:129`, `src/demo.js:131`, `src/bus.js:54`, `src/bus.js:61` |
| `e_sum_out` | summary → stdout | `console.log` only | `src/coordinator.js:305`, `src/demo.js:138` |

18 edges.

---

## 3. INVARIANT CARD 1 — the bus is an audit log, not a transport

Complete enumeration of every publish and every subscribe in `src/`, obtained with
`grep -rn "\.publish(\|\.subscribe(" src/`.

**Publish sites — 5, all of them inside `coordinator.js`:**

| # | Channel | Citation |
|---|---|---|
| 1 | `TASK_REQUEST` | `src/coordinator.js:160` |
| 2 | `TASK_RESULT` | `src/coordinator.js:184` |
| 3 | `TASK_FAILED` | `src/coordinator.js:200` |
| 4 | `ESCALATION` | `src/coordinator.js:245` |
| 5 | `TASK_RESULT` (escalated) | `src/coordinator.js:269` |

**Subscribe sites in `src/` (excluding tests) — exactly 1:**

- `src/coordinator.js:37` — `this.bus.subscribe('ESCALATION', …)`, whose whole body is a
  `console.log` at `src/coordinator.js:39`. It is registered from the constructor at
  `src/coordinator.js:33`.

**Therefore:**

- `src/agents.js` contains **zero** `import` statements and **zero** references to the bus.
  The agents cannot receive a message; nothing delivers one to them.
- The coordinator calls handlers **directly**: `src/coordinator.js:174` and
  `src/coordinator.js:259`. `publish('TASK_REQUEST')` at `src/coordinator.js:160` is
  fire-and-forget bookkeeping that precedes the direct call.
- `src/bus.js:9` and `src/bus.js:10` document `HEARTBEAT` and `BROADCAST`. Neither string
  appears anywhere else in the project — `grep -rn "HEARTBEAT\|BROADCAST" src/` returns
  only those two comment lines. Likewise `CapabilityRegistry.heartbeat()`
  (`src/capability.js:90`) has no caller.
- Handler exceptions are swallowed per subscriber at `src/bus.js:45` and `src/bus.js:48`,
  so a subscriber failure is invisible even if one existed.
- `history[]` is the durable artifact: appended at `src/bus.js:36`, trimmed to
  `maxHistory = 500` at `src/bus.js:17` and `src/bus.js:37`.

**README claim refuted:** `README.md:90` — "connects ALL components via publish/subscribe".
False. One component publishes, one subscriber exists, and it only logs.

---

## 4. INVARIANT CARD 2 — `selectAgent()`, the 7 checks in code order

`src/capability.js:80-88`, delegating to `findProviders()` at `src/capability.js:64-75`.

| # | Check | Citation |
|---|---|---|
| 1 | `skillIndex.get(skillName) \|\| []` — provider ids in **registration order** | `src/capability.js:65` |
| 2 | map id → card, `.filter(Boolean)` drops deregistered ids | `src/capability.js:67`, `src/capability.js:68` |
| 3 | sort: lower `load` wins | `src/capability.js:70` |
| 4 | tie → lower `cost` **for that skill specifically** | `src/capability.js:71`, `src/capability.js:72`, `src/capability.js:73` |
| 5 | no providers → `null` | `src/capability.js:82` |
| 6 | `best = providers[0]` | `src/capability.js:84` |
| 7 | `best.load >= (best.maxConcurrency \|\| 5)` → `null` | `src/capability.js:85` |

**The load counter moves before the await.** `this.registry.incrementLoad(agent.id)` is at
`src/coordinator.js:152`; the first `await` in `_executeTask` is at `src/coordinator.js:173`.
Because a wave dispatches every task synchronously up to its first await
(`src/coordinator.js:99-101`), the second parallel task of a wave sees the first task's
load already counted.

**Observed, `node src/demo.js`, Wave 2 of request 1** — the two `code` tasks at priority 2
(`src/decomposer.js:14`, `src/decomposer.js:15`):

```
  --- Wave 2 ---
    [ASSIGN] task_2 → Junior Developer
    [ASSIGN] task_3 → Senior Developer
```

**README claim refuted:** `README.md:108` — `Wave 2 (priority 2): [code, code] → Junior Dev (parallel)`.
False. `junior-dev` declares `cost: 0.02` for `code` (`src/agents.js:35`) and `senior-dev`
`cost: 0.08` (`src/agents.js:80`), so junior wins the first slot on cost; the second task
then finds junior at `load: 1` and senior at `load: 0`, and check 3 sends it to senior.

**Registration-order fact:** the skill index is append-only per register
(`src/capability.js:37`), so `ALL_AGENTS` order (`src/agents.js:309-316`) fixes the tie
ordering. 6 cards declare 15 skill entries over 12 distinct skill names — observed
`registry.listSkills()` output (`src/demo.js:41`):
`code, test, review, design, analyze, research, monitor, deploy, write, validate, provision, notify`.

---

## 5. INVARIANT CARD 3 — escalation has 4 null exits and fires 0 times in the demo

`_tryEscalation()` is `src/coordinator.js:225-285`. It is called from exactly two places:

- `src/coordinator.js:146` — no agent available for the skill
- `src/coordinator.js:213` — the last retry failed (`attempt === this.maxRetries`, `src/coordinator.js:212`)

**Complete enumeration of its bail-outs, in code order — all four return `null`:**

| # | Guard | Citation |
|---|---|---|
| a | the assigned card has no `escalatesTo` (or `task.assignedTo` is unset) | `src/coordinator.js:226`, `src/coordinator.js:227`, `src/coordinator.js:229` |
| b | the `escalatesTo` id is not registered | `src/coordinator.js:231`, `src/coordinator.js:232` |
| c | the target card lacks that skill, or the skill lacks a `handler` | `src/coordinator.js:234`, `src/coordinator.js:235` |
| d | the target's handler throws or times out | `src/coordinator.js:281`, `src/coordinator.js:282`, `src/coordinator.js:283` |

**Only 2 of the 6 cards declare an escalation target:**

| Card | `escalatesTo` | Citation |
|---|---|---|
| `junior-dev` | `'senior-dev'` | `src/agents.js:31` |
| `senior-dev` | `null` | `src/agents.js:76` |
| `data-analyst` | `null` | `src/agents.js:146` |
| `devops` | `'senior-dev'` | `src/agents.js:198` |
| `writer` | `null` | `src/agents.js:238` |
| `ops` | `null` | `src/agents.js:263` |

**Why site `:213` is unreachable in the demo.** The demo constructs the coordinator with
`maxRetries: 1` (`src/demo.js:49`). Exactly one handler in the whole project throws:
`junior-dev`'s `code` handler, and it is guarded by `input.attempt === 0`
(`src/agents.js:40`). `attempt` is threaded into the handler input at
`src/coordinator.js:174`. So attempt 0 may fail, attempt 1 cannot, and the
`attempt === this.maxRetries` branch at `src/coordinator.js:212` is only ever reached with
a handler that has already been proven not to throw.

**Why site `:146` is unreachable in the demo.** Every skill produced by the five
decomposition rules (`src/decomposer.js:13-17`, `:23-26`, `:32-35`, `:41-44`, `:50-53`) has
at least one provider, and all four demo requests match a rule. The unrouted `general`
skill of the fallback (`src/decomposer.js:83`) is never produced, because all four demo
strings match (`src/demo.js:60`, `:70`, `:80`, `:90`).

**Observed:** 13 runs of `node src/demo.js` — `Escalations:      0` on every run, and
`[ESCALATE]` (`src/coordinator.js:253`) never printed. `Message types:` showed only
`TASK_REQUEST` and `TASK_RESULT`, plus `TASK_FAILED(1)` on the 6 runs where junior's
30% failure fired. `ESCALATION` never appeared, so the coordinator's single subscriber
(`src/coordinator.js:37`) never fired either.

**Escalation is exercised only by the test suite,** with a synthetic always-failing agent
and `maxRetries: 0`: `src/tests/coordinator.test.js:146`, `src/tests/coordinator.test.js:150`,
`src/tests/coordinator.test.js:153`.

---

## 6. CLAIMS CHECKED against code

| Claim | Source | Verdict |
|---|---|---|
| "MessageBus … connects ALL components via publish/subscribe" | `README.md:89-90` | **FALSE** — 1 subscriber, log-only; handlers invoked directly (`src/coordinator.js:174`) |
| `HEARTBEAT` and `BROADCAST` are message types | `README.md:96-97`, `src/bus.js:9-10` | **FALSE in practice** — never published anywhere in `src/` |
| Wave 2 sends both `code` tasks to Junior Dev | `README.md:108` | **FALSE** — observed Junior then Senior; caused by `src/coordinator.js:152` preceding `src/coordinator.js:173` |
| "13 tests covering routing, escalation, bus" | `README.md:9`, `README.md:151` | **FALSE count** — 15 `it()` cases; `node --test` reports `tests 15 / suites 4 / pass 15` |
| "If the agent fails, retries with another agent" | `README.md:136` | **MISLEADING** — the retry re-runs `selectAgent` (`src/coordinator.js:142`); with load decremented at `src/coordinator.js:198` it may return the *same* agent |
| `escalatesTo` declared in cards, not hardcoded | `README.md:158` | **TRUE** — `src/coordinator.js:227` reads the card field |
| Tasks at the same priority run concurrently | `README.md:159` | **TRUE** — `src/coordinator.js:99` |
| Skill index maps `"monitor" → [data-analyst, devops]` | `README.md:48` | **TRUE** — `src/agents.js:176`, `src/agents.js:216`, ordering from `src/agents.js:309-316` |

---

## 7. Artifacts produced

| Artifact | Where | Citation |
|---|---|---|
| per-run summary block | stdout | `src/coordinator.js:299`, `src/coordinator.js:305-320` |
| cross-run totals, bus stats, agent utilisation | stdout | `src/demo.js:118-136` |
| in-memory `bus.history[]` (max 500), readable via `getHistory`/`getStats` | process memory only | `src/bus.js:36`, `src/bus.js:54`, `src/bus.js:61` |
| in-memory `coordinator.runs[]` | process memory only | `src/coordinator.js:31`, `src/coordinator.js:60` |

**No file is written and no socket is opened.** Proven by absence:
`grep -rn "require(\|fetch(\|node:fs\|writeFile\|readFile\|http" src/` → no matches.

---

## 8. Excluded from this L1 (and why)

- **The retry loop's internal state machine** (`attempt` counter, claim/release of load,
  `src/coordinator.js:140-219`). That is L2 — legality of transitions, not space.
- **The timeout race** `Promise.race([promise, timeout])` at `src/coordinator.js:287-297`.
  L2b — ordering over time.
- **Individual agents and their skills.** 6 cards × 15 skills would be a call graph, not an
  architecture. They enter the diagram as one `ALL_AGENTS` input box plus one generic
  handler box; the routing card carries the enumeration that matters.
- **The five decomposition rules' task lists** (`src/decomposer.js:13-17` etc.). Content,
  not structure.
- **`deregister()`** (`src/capability.js:43`) — reachable only from
  `src/tests/coordinator.test.js:64`; no production caller.
- **The wildcard `'*'` channel** (`src/bus.js:42`) — exercised only at
  `src/tests/coordinator.test.js:86`.

---

## 9. Portability notes — token vocabulary vs. this system

The token set was built for a trading system. Two of the recurring strains reappear here,
and one new one.

1. **`component.external` has no legitimate occupant — again.** This project makes no
   network call, opens no file, and calls no model. Every surface a trading diagram would
   put outside the process is here a module-level constant. The token is left **unused**
   rather than mis-assigned to something in-process.

2. **`component.agent` has no honest occupant — again, and this project is literally named
   after agents.** The six "agents" are object literals (`src/agents.js:27`, `:72`, `:142`,
   `:194`, `:234`, `:259`) whose handlers are async closures over `setTimeout`
   (`src/agents.js:9`, `src/agents.js:17`, `src/agents.js:20`). They hold no state between
   calls, run in the caller's event loop, and cannot receive a message. The file's own
   header admits it: `src/agents.js:4-5`, "In production, these would be separate processes
   or containers. Here they're simulated with async functions." Using `component.agent`
   would make the picture assert a process boundary that does not exist. **Nearest token
   used: `component.mock`**, and the correction is carried on the node label itself —
   `SIMULATED closure` / `setTimeout only` — so the box cannot be misread even if the
   legend is lost.

3. **`component.mock` is doing double duty as "in-module constant table".** `ALL_AGENTS`
   and `DECOMPOSITION_RULES` are the corpora of this system, but unlike the guardrails
   pilot's on-disk corpora there is no file to point at, so `component.external` (which
   guardrails used for exactly this role) would be a lie. `component.mock` is the nearest
   honest token; the labels name the module and line so the reader can tell a constant from
   a stub.

4. **`edge.analysis` is standing in for "observability / audit write".** The two bus edges
   are not analysis; they are telemetry appended to `history[]` (`src/bus.js:36`). There is
   no `edge.observe` in the vocabulary and `edge.data_in` points the wrong way, so
   `edge.analysis` is the nearest fit. Edge labels say `3 publishes` / `2 publishes` to
   keep the meaning unambiguous.

5. **`boundary.datasource` labels a zone containing no datastore.** Its occupants are a CLI,
   a test file, and two module constants. Label made explicit: "no files, no network".

No new tokens were invented; the build rejects them.
