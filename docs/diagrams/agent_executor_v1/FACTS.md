# FACTS — 25-agent-executor (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/25-agent-executor/src/`, n=7 JS modules (776 lines) +
1 test file (444 lines). **Every element in the diagram appears below with a
`file:line` citation. The diagram may contain nothing that is not on this page,
and this page may contain nothing without a citation.** The project README ships
an ASCII architecture diagram; it was treated as a claim, not as evidence —
every fact below was read from source, and two README claims did not survive
that reading (see "README claims that did not verify").

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The regex/wildcard matching inside
`_matchPattern`, the 8-operator condition tree inside `_checkConditions`, and
the per-field loop inside `validate()` are L2 concerns and are deliberately NOT
drawn here (their counts and roles are carried on cards instead).

---

## Entry point — `src/demo.js`

| Fact | Citation |
|---|---|
| `main()` — the only entry; runs 6 scenarios, then `main().catch` | demo.js:3, :194 |
| Constructs one `AgentExecutor` with sandbox + approvals config | demo.js:8 |
| Registers **6 actions** (db:query, db:write, db:delete, api:call, deploy:production, file:read) | demo.js:20-56 |
| Registers **4 policies** (allow-reads, allow-writes-elevated, allow-deploy-admin, deny-suspicious) | demo.js:59-80 |
| Registers **3 agents** (data-analyst/basic, backend-worker/elevated, deploy-bot/admin) | demo.js:83-96 |
| Scenarios 1-4 + 6 drive the pipeline via `executor.execute(...)` | demo.js:103, :117, :131, :148, :175 |
| Scenario 5 calls `executor.sandbox.checkPermission(...)` **directly**, NOT through `execute()` | demo.js:157, :160, :163, :166 |
| `package.json` wires `demo` and `test` scripts | package.json:7, :8 |

## The orchestrator — `src/executor.js`

| Fact | Citation |
|---|---|
| `class AgentExecutor` owns all 5 subsystems (policy, actions, sandbox, approvals, audit) | executor.js:7, :9-13 |
| `registerAgent()` — stores id, roles, trustLevel (default `untrusted`), permissions | executor.js:18, :23 |
| `startSession()` → `sandbox.createSession(agentId, permissions)` | executor.js:31, :35 |
| `async execute(sessionId, actionId, params)` — the pipeline | executor.js:40 |
| Pre-gate guards: `SESSION_NOT_FOUND` / `SESSION_NOT_ACTIVE` / `UNKNOWN_ACTION` | executor.js:42, :43, :47 |
| Gate 1 — `this.actions.validate(actionId, params)` | executor.js:50 |
| Gate 2 — `this.policy.evaluate({principal, action, resource, context})` | executor.js:62 |
| Gate 3 — `if (action.requiresApproval)` → `this.approvals.submit(...)` | executor.js:86, :87 |
| Gate 4 — `await this._sandboxedExecute(session, action, params)` | executor.js:107 |
| `_sandboxedExecute` runs the handler in a **timeout race only** — no permission check | executor.js:129, :131, :136 |
| Every terminal branch calls `this.audit.record(...)` | executor.js:52, :76, :95, :110, :120 |
| `endSession()` → `sandbox.terminateSession()` | executor.js:139, :140 |
| `dashboard()` — merges audit securityReport + actions summary | executor.js:144, :152, :153 |

## Gate 1 — schema validation — `src/actionRegistry.js`

| Fact | Citation |
|---|---|
| `class ActionRegistry` — typed action definitions | actionRegistry.js:1 |
| `register()` defaults: riskLevel `low`, requiresApproval `false`, timeout `30000ms` | actionRegistry.js:12, :13, :16 |
| `validate(actionId, params)` — required fields, then per-property rules | actionRegistry.js:38, :47, :55 |
| Property checks: type (string/number/boolean), enum, maxLength, minimum, maximum, pattern | actionRegistry.js:60, :63, :66, :69, :72, :75, :78, :81 |
| `summary()` — totals by category + by risk | actionRegistry.js:99 |

## Gate 2 — policy engine — `src/policy.js`

| Fact | Citation |
|---|---|
| `class PolicyEngine`, default effect `deny` | policy.js:1, :5 |
| `addPolicy()` — effect, principals, actions, resources, conditions, priority | policy.js:8 |
| `evaluate(request)` — the IAM decision | policy.js:28 |
| No matching policy → `deny` | policy.js:32 |
| `_matchPattern` — `*`, exact, and `prefix*` wildcard | policy.js:91, :93, :95 |
| `_checkConditions` — 8 operators (see card 2) | policy.js:102 |

## Gate 3 — approval queue — `src/approvals.js`

| Fact | Citation |
|---|---|
| `class ApprovalQueue` — auto-approve rules, timeout (default 300000ms), escalation chain | approvals.js:1, :5, :6, :7 |
| `submit()` — auto-approve check first, else `pending` with `expiresAt` | approvals.js:10, :13, :39 |
| `approve()` / `deny()` — move pending → history | approvals.js:42, :57 |
| `escalate()` — walk the escalation chain by level | approvals.js:72, :77 |
| `checkExpired()` — expire pending past `expiresAt` | approvals.js:89 |
| `_checkAutoApprove()` — by action, maxRisk, agents | approvals.js:106 |

## Gate 4 — sandbox — `src/sandbox.js`

| Fact | Citation |
|---|---|
| `class Sandbox`, default blockedPaths `/etc /sys /proc /root .ssh .env` | sandbox.js:1, :9 |
| `createSession()` — per-session permissions + usage counters + violations | sandbox.js:14 |
| `checkPermission(sessionId, operation)` — 5 op types (see card 3) | sandbox.js:44 |
| `_isBlockedPath()` — substring match against blockedPaths | sandbox.js:128 |
| `_recordViolation()` — auto-suspend at 3 violations | sandbox.js:132, :135 |
| `terminateSession()` / `getSession()` | sandbox.js:148, :156 |

## The action handlers — `src/demo.js` (the mocked external surface)

| Fact | Citation |
|---|---|
| Each registered action carries an `async handler` returning **canned data** — no real DB / API / filesystem / deploy | demo.js:23, :29, :36, :42, :49, :55 |
| The handler is invoked by `_sandboxedExecute` as `action.handler(params, ctx)` | executor.js:132, :136 |

## Reported output — `src/auditTrail.js` + `dashboard()`

| Fact | Citation |
|---|---|
| `class AuditTrail`, ring-buffer capped at `maxEntries` (default 50000) | auditTrail.js:1, :4, :29 |
| `record(event)` — result ∈ allowed/denied/error/timeout/approval_required | auditTrail.js:7, :16 |
| `query()` — filter by agent/session/action/result/risk/time | auditTrail.js:36 |
| `agentReport()` — deny rate, avg duration, risk breakdown | auditTrail.js:50 |
| `sessionReplay()` — time-ordered reconstruction | auditTrail.js:81 |
| `securityReport()` — denials by agent, high-risk count | auditTrail.js:85 |
| `dashboard()` prints to stdout in scenario 6 | demo.js:175, :180-182 |

---

### INVARIANT CARD 1 — the 5-gate pipeline, complete, in `execute()` code order

Every action passes these gates in order; the first failing gate returns and the
rest never run. A session-state guard runs before gate 1.

| # | Gate | Delegates to | Fail return | Citation |
|---|---|---|---|---|
| 0 | session active? | (executor) | SESSION_NOT_ACTIVE | executor.js:43 |
| 1 | schema validate | ActionRegistry.validate | VALIDATION_FAILED | executor.js:50, :57 |
| 2 | policy evaluate | PolicyEngine.evaluate | POLICY_DENIED | executor.js:62, :82 |
| 3 | approval (if `requiresApproval`) | ApprovalQueue.submit | APPROVAL_REQUIRED | executor.js:86, :100 |
| 4 | sandboxed execute | `_sandboxedExecute` → handler | EXECUTION_FAILED | executor.js:107, :125 |
| 5 | audit record | AuditTrail.record | (every branch) | executor.js:52, :76, :95, :110, :120 |

**Gate 4 enforces a timeout race and nothing else** (executor.js:129-137). It
does not consult the Sandbox's `checkPermission` — see card 3.

### INVARIANT CARD 2 — policy decision order (deny-wins), `evaluate()` in code order

| Step | Rule | Citation |
|---|---|---|
| 1 | no applicable policy → `deny` (`no_matching_policy`) | policy.js:32 |
| 2 | sort applicable by `priority` descending | policy.js:36 |
| 3 | scan for `deny` whose conditions hold → `explicit_deny` (wins) | policy.js:38, :42 |
| 4 | scan for `allow` whose conditions hold → `explicit_allow` | policy.js:47, :51 |
| 5 | default → `deny` (`no_allow_policy`) | policy.js:56 |

The 8 condition operators, complete and in `_checkConditions` code order:
equals :106 · notEquals :107 · in :108 · notIn :109 · lessThan :110 ·
greaterThan :111 · exists :112 · matches :113.

### INVARIANT CARD 3 — sandbox enforcement is DEMONSTRATED, NOT WIRED

This is the project's load-bearing correction, and it is enforced in code, not
prose. The Sandbox has two roles; only the lifecycle role is on the pipeline.

| Sandbox role | Wired into `execute()`? | Citation |
|---|---|---|
| session lifecycle — create / get / terminate | **YES** | executor.js:35, :41, :140 |
| `checkPermission()` — path / host / limit / permission | **NO** — only demo.js + tests call it | demo.js:157-166; sandbox.js:44 |

`checkPermission`'s 5 operation types, complete and in code order:
file_read :51 · file_write :74 · network :90 · exec :109 · db :117. Auxiliary
guards: blocked-path substring match (`_isBlockedPath` :128), allowedDirs prefix
(:60), allowedHosts (:95), per-session op limits (:67, :83, :102), auto-suspend
after 3 violations (:135). None of this is reachable through `executor.execute()`
— the gate-4 box runs `action.handler` behind a timeout only (executor.js:136).

---

## README claims that did not verify

1. **The README "5-Gate Pipeline" lists gate 4 as "Sandbox Enforcement — file
   paths, network, ops count".** In code gate 4 (`_sandboxedExecute`,
   executor.js:129-137) runs the action handler inside a `Promise.race` timeout
   and performs **no** file-path, host, or ops-count check. Those checks live in
   `sandbox.checkPermission` (sandbox.js:44), which `execute()` never calls —
   only demo.js:157-166 and the test file invoke it. The diagram draws the
   sandbox permission check as a demonstrated-but-unwired capability and labels
   the edge accordingly. **This is the single most load-bearing correction on
   this page.**
2. **The README ASCII draws a single linear flow Schema → Policy → Approval →
   Sandbox → Executor → Audit**, implying the Sandbox Enforcer sits between the
   Approval Queue and the Action Executor in the runtime path. It does not (see
   #1). The runtime path from approval goes straight to `_sandboxedExecute` →
   `action.handler` (executor.js:107, :136); the Sandbox box's only pipeline
   contribution is the session it created at `startSession` (executor.js:35).

## Artifacts written

**None to disk.** Every output goes to stdout via `console.log` (the AuditTrail
and dashboard live in-memory). The audit ring buffer is capped in memory
(auditTrail.js:29), never persisted.

| Output | Written by | Citation |
|---|---|---|
| Per-scenario ALLOWED/DENIED/error lines | demo `console.log` | demo.js:104, :107, :132 |
| Security dashboard (sessions, approvals, denial rate) | `dashboard()` | executor.js:144; demo.js:180-182 |

## Deliberately NOT drawn (L1 scope discipline)

- The per-field validation loop in `validate()` (actionRegistry.js:55-84) — L2;
  its rule set is carried on the entry description, not drawn.
- `_matchPattern` wildcard logic and `_findApplicable` role expansion
  (policy.js:59-100) — L2; folded into the policy box, enumerated here.
- The 8-operator `_checkConditions` tree (policy.js:102-116) — L2; its complete
  operator list is on card 2.
- `escalate` / `checkExpired` / `getHistory` internals of the approval queue —
  L2 lifecycle, not L1 space.
- AuditTrail query/report method internals (auditTrail.js:36-105) — folded into
  one output box; the method names are enumerated above.

## Folded into one box (to hold the 6-15 component-box rule)

The page draws **10 component boxes**. Two folds keep both citations on the
surviving box, so nothing became untraceable.

| Folded | Into | Why it is legitimate |
|---|---|---|
| the 6 `action.handler` closures (demo.js:23-55) | one "action handlers (mocked)" box | identical structural role — canned effects invoked only via `_sandboxedExecute` (executor.js:136); the count is on the box |
| `AuditTrail` query/report methods (auditTrail.js:36-105) + `dashboard()` (executor.js:144) | one "audit + dashboard" output box | same destination (in-memory log → stdout), same phase; the split is a module boundary, not an architectural one |

## Portability notes — vocabulary built for a trading system, bent per this domain

Recorded because "rules bent per new domain" is the portability metric.

1. **`component.agent` has no honest executable occupant.** The system's
   "agents" (data-analyst, backend-worker, deploy-bot — demo.js:83-96) are
   **permission records** in a Map, not running processes or LLM calls. The
   token was applied to the registered-agent input, carrying a LABEL that says
   "permission records, not processes", so the picture cannot mislead.
2. **`component.external` has no real occupant — the external surface is
   mocked.** Every `action.handler` returns canned data (demo.js:23-55); there
   is no real database, API, filesystem, or deployment target. The token was
   applied to the "action handlers" box with a SIMULATED/MOCKED label. This is
   the recurring strain the harness README predicts for this vocabulary.
3. **`component.artifact` over-promises durability.** This project persists
   nothing; the audit trail is an in-memory ring buffer (auditTrail.js:29) and
   the dashboard is stdout. The token was reused for the audit+dashboard output
   box because its semantic role — "where the run becomes the record" — is
   right, even though nothing is written to disk. A `component.stdout` token
   would be more honest.
4. **`boundary.observability` labels a zone that writes no file.** Kept for the
   same reason as #3 — the role ("where the run becomes visible") is exactly
   right; the token name implies durability the code does not deliver.

## Observed run (outputs, not source)

`node src/demo.js` (2026-08-24): analyst db:query ALLOWED, db:write
POLICY_DENIED (no_allow_policy), deploy POLICY_DENIED; worker db:write + api:call
ALLOWED, deploy POLICY_DENIED; deploy-bot db:delete APPROVAL_REQUIRED → escalated
to team-lead → approved; two VALIDATION_FAILED; sandbox scenario blocked
/etc/passwd, .env, and network, session suspended after 3 violations. Test suite:
39 `it()` tests across 6 `describe` suites (executor.test.js:12, :74, :136, :219,
:277, :325). README claims "38 tests" — off by one; the suite count (6) matches.
These are outputs; the source lines that produce them are cited above.
