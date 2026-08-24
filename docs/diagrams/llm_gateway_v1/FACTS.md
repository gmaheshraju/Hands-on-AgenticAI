# FACTS — 24-llm-gateway (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/24-llm-gateway/src/`, n=8 JS modules (932 lines) +
1 test file (474 lines). **Every element in the diagram appears below with a
`file:line` citation. The diagram may contain nothing that is not on this page,
and this page may contain nothing without a citation.** The project README ships
an ASCII architecture diagram; it was treated as a claim, not as evidence —
every fact below was read from source, and two README claims did not survive
that reading (see "README claims that did not verify").

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The token-bucket refill math, the
circuit-breaker state transitions, the complexity-scoring arithmetic and the
retry/backoff loop are L2 concerns and are deliberately NOT drawn here (see
"Deliberately NOT drawn").

---

## Entry point — `src/demo.js`

| Fact | Citation |
|---|---|
| `main()` — the demo driver, 6 scenarios | demo.js:15 |
| Constructs one `LLMGateway` with rate-limit + circuit-breaker config | demo.js:20 |
| Registers three provider handlers: anthropic, openai, google | demo.js:25, :26, :27 |
| The handlers are `mockProvider(...)` closures — **no network, no real model** | demo.js:3, :5, :11 |
| Sets per-team budgets and a team model override | demo.js:29, :30, :31 |
| Failure path: `main().catch(console.error)` | demo.js:144 |

`src/tests/gateway.test.js` also drives the gateway (46 `it()` blocks;
README states "41 tests across 7 suites"). Only `demo.js` is drawn as the entry
component.

## The orchestrator — `src/gateway.js`

`LLMGateway.request(req)` runs a fixed 7-stage pipeline. Each stage is drawn as
a box; each box cites the module it calls.

| Stage | What it calls | Citation |
|---|---|---|
| `async request(req)` — the pipeline entry | — | gateway.js:32 |
| 1 · Budget | `costTracker.checkBudget(teamId)` | gateway.js:38 |
| 2 · Rate limit | `rateLimiter.check(teamId, estTokens)` | gateway.js:46 |
| 3 · PII redact | `redactMessages(messages)` | gateway.js:56 |
| 4 · Route | `router.route({...req}, circuitBreaker)` | gateway.js:69 |
| 5 · Middleware | `for (const mw of this.middleware)` | gateway.js:76 |
| 6 · Execute | `_executeWithRetry(ctx, req, route)` | gateway.js:85 |
| 7 · Track | cost + rate consume + record + audit | gateway.js:88 |

Stage-7 detail: `router.estimateCost(...)` gateway.js:89, `rateLimiter.consume`
gateway.js:90, `costTracker.record` gateway.js:91, `auditLog.log` gateway.js:97.

The execution helper: `_executeWithRetry` gateway.js:114 → calls the registered
`provider(...)` handler gateway.js:128, records success gateway.js:129 / failure
gateway.js:133 on the breaker, and `_failover(...)` gateway.js:152 picks the next
provider from the fallback chain gateway.js:153. `use(fn)` gateway.js:28 pushes a
middleware; `registerProvider` gateway.js:24 stores a handler in `providers` Map
gateway.js:15. `dashboard()` gateway.js:177 aggregates breaker + cost + waste.

## Bookend modules — used at the START and END of the pipeline

Two modules are consulted before the request runs and mutated after it returns —
they are not single-point stages. The diagram places them as stages 1/2 (their
gate call) and folds their write-back into stage 7, noted here so the fold is
traceable.

| Module | Gate call (early) | Write-back (stage 7) |
|---|---|---|
| `CostTracker` | `checkBudget` gateway.js:38 → costTracker.js:54 | `record` gateway.js:91 → costTracker.js:13 |
| `TokenBucketLimiter` | `check` gateway.js:46 → rateLimit.js:40 | `consume` gateway.js:90 → rateLimit.js:56 |

## PII redactor — `src/pii.js`

| Fact | Citation |
|---|---|
| `PATTERNS` array — 10 entries | pii.js:1 |
| `luhnCheck` — Luhn validation for credit cards | pii.js:14 |
| `redact(text)` — scan + replace, returns findings | pii.js:28 |
| `redactMessages(messages)` — per-message redaction (the gateway's call) | pii.js:51 |
| `scanOnly(text)` — detect without redacting | pii.js:62 |

## Model router — `src/router.js`

| Fact | Citation |
|---|---|
| `MODEL_REGISTRY` — 7 models, hardcoded | router.js:1 |
| The 7 models (lines) | router.js:2, :3, :4, :5, :6, :7, :8 |
| 3 providers across them: anthropic, openai, google | router.js:2, :5, :7 |
| `classifyComplexity(request)` — token + tool + keyword scoring | router.js:23 |
| Tiers: premium ≥ 7, standard ≥ 4, else fast | router.js:43, :44, :45 |
| `route(request, circuitBreaker)` — the precedence ladder | router.js:48 |
| `fallbackChain` default | router.js:15 |
| `estimateCost(model, in, out)` | router.js:97 |

## Circuit breaker — `src/circuitBreaker.js`

| Fact | Citation |
|---|---|
| Three states: closed / open / half_open | circuitBreaker.js:1 |
| `failureThreshold` default 5, `recoveryTimeMs` default 30000 | circuitBreaker.js:5, :6 |
| `canRequest(provider)` — the pre-call gate (consulted by router) | circuitBreaker.js:26 |
| `recordSuccess(provider)` | circuitBreaker.js:47 |
| `recordFailure(provider, error)` | circuitBreaker.js:64 |
| `status` / `allStatus` — per-provider metrics for the dashboard | circuitBreaker.js:79, :90 |

## Provider handlers — external surface (MOCKED)

| Fact | Citation |
|---|---|
| Handlers stored in `this.providers` Map, keyed by provider name | gateway.js:15, :24 |
| Looked up and invoked inside the retry loop | gateway.js:119, :128 |
| In the demo/tests the handler is `mockProvider(...)` — throws or returns fake usage, no HTTP | demo.js:3, :7, :11 |

## Cost tracker — `src/costTracker.js`

| Fact | Citation |
|---|---|
| `record(entry)` — append a spend record | costTracker.js:13 |
| `checkBudget(teamId)` — daily budget gate | costTracker.js:54 |
| `alertThresholds` default [0.5, 0.8, 0.95] | costTracker.js:5 |
| `wasteReport()` — premium-for-simple + duplicate detection | costTracker.js:102 |
| `teamReport(teamId)` — cost-by-model breakdown | costTracker.js:71 |

## Audit log — `src/audit.js`

| Fact | Citation |
|---|---|
| `log(entry)` — append an audit record | audit.js:8 |
| Action vocabulary comment: request / response / blocked / failover / pii_detected | audit.js:14 |
| `query(filters)` — 8 filter dimensions | audit.js:40 |
| `complianceReport(teamId, start, end)` | audit.js:55 |
| `replayTrace(requestId)` — reconstruct one request | audit.js:85 |

---

### INVARIANT CARD 1 — PII: 10 patterns, redacted before routing

`redactMessages` (stage 3) runs before `router.route` (stage 4), so redacted
text is what gets classified and sent. The 10 patterns, complete and in code
order:

| # | Type | Note | Citation |
|---|---|---|---|
| 1 | SSN | — | pii.js:2 |
| 2 | CREDIT_CARD | Luhn-validated | pii.js:3 |
| 3 | EMAIL | — | pii.js:4 |
| 4 | PHONE_US | — | pii.js:5 |
| 5 | PHONE_IN | — | pii.js:6 |
| 6 | IP_ADDRESS | — | pii.js:7 |
| 7 | AWS_KEY | AKIA/ASIA | pii.js:8 |
| 8 | API_KEY | sk-/pk_live_/pk_test_/rk_live_ | pii.js:9 |
| 9 | AADHAAR | — | pii.js:10 |
| 10 | PAN | — | pii.js:11 |

Luhn gate: a candidate that fails `luhnCheck` is skipped, not redacted
(pii.js:35, :43). Ordering matters — patterns run top to bottom on the
already-partly-redacted string (pii.js:32, :42).

### INVARIANT CARD 2 — Routing precedence: 6 rungs, in code order

`route()` returns at the first rung that both matches AND whose provider passes
`circuitBreaker.canRequest(...)`. Complete ladder, in code order:

| # | Rung | reason string | Citation |
|---|---|---|---|
| 1 | team → exact model | `team_override` | router.js:51 |
| 2 | request.model set | `explicit_model` | router.js:58 |
| 3 | custom rules match | `rule:<name>` | router.js:65 |
| 4 | complexity tier → cheapest in tier | `complexity:<tier>` | router.js:74 |
| 5 | fallback chain | `fallback_chain` | router.js:85 |
| 6 | nothing available | `all_providers_down` → `{model:null}` | router.js:94 |

Every rung is circuit-breaker-aware: the guard `circuitBreaker.canRequest(...)`
is re-checked at rungs 1-5 (router.js:53, :60, :68, :80, :88). A `{model:null}`
return makes the gateway abort with `ALL_PROVIDERS_DOWN` (gateway.js:70, :72).

### INVARIANT CARD 3 — AuditLog is written at 7 call sites, not 1

This is the load-bearing correction to the README. The README ASCII draws
"Audit Log" as a single terminal box in the pipeline grid. In code `auditLog.log`
is called from 7 distinct points across `request()` and `_executeWithRetry` —
audit is **cross-cutting observability every stage writes to**, not a final step.
Complete enumeration, in file order:

| # | Where | action / status | Citation |
|---|---|---|---|
| 1 | budget block | blocked / budget_exceeded | gateway.js:40 |
| 2 | rate-limit block | blocked / rate_limited | gateway.js:48 |
| 3 | PII detected (non-blocking) | pii_detected / success | gateway.js:60 |
| 4 | no available provider | blocked / no_available_provider | gateway.js:71 |
| 5 | middleware block | blocked / <reason> | gateway.js:79 |
| 6 | successful response | response / success | gateway.js:97 |
| 7 | failover attempt (in retry loop) | failover / error | gateway.js:134 |

---

## Artifacts written

**None to disk.** Every output goes to stdout via `console.log`, and audit/cost
records live in-memory arrays (`this.entries` audit.js:31, `this.records`
costTracker.js:27). The observability surface is the AuditLog query/compliance
API plus `dashboard()` (gateway.js:177), consumed by the demo's console output
(demo.js:106, :129).

## README claims that did not verify

1. **The README ASCII draws "Audit Log" as one box, a single pipeline step.**
   In code it is written at 7 call sites (invariant card 3, gateway.js:40, :48,
   :60, :71, :79, :97, :134). The diagram draws audit as a cross-cutting sink
   and carries the count on the card. This is the single most load-bearing
   correction on this page.
2. **The README ASCII draws a "Provider Registry" holding Anthropic / OpenAI /
   Google as if the gateway ships real provider connectors.** Two things are
   conflated in code: the **model registry** is 7 hardcoded entries in
   `router.js` (router.js:1-8), while the **provider handlers** are functions
   injected at runtime via `registerProvider` (gateway.js:24) into a Map
   (gateway.js:15). In the demo and tests those handlers are `mockProvider`
   closures with no network (demo.js:3). The diagram draws the providers as an
   external, MOCKED surface and labels it so.

## Folded into one box (to hold the 6-15 component-box rule)

The page draws **11 component boxes**. Folds, each keeping both citations on the
surviving box:

| Folded | Into | Why it is legitimate |
|---|---|---|
| `costTracker.record` (costTracker.js:13) + `rateLimiter.consume` (rateLimit.js:56) | stage 7 "Track" | both are the write-back half of stages 1/2, executed only at gateway.js:90-91 |
| `router.estimateCost` (router.js:97) | stage 7 "Track" | called once, from stage 7 (gateway.js:89) |
| `AuditLog` query/compliance/replay + `dashboard()` (gateway.js:177) | one "AuditLog + dashboard" box | same role (observability read surface), consumed together |
| `_executeWithRetry` (gateway.js:114) + `_failover` (gateway.js:152) | stage 6 "Execute" | the retry/failover loop is one execution stage |

## Deliberately NOT drawn (L1 scope discipline)

- Token-bucket refill arithmetic (`_refill`, `_getBucket` — rateLimit.js:32, :16) — L2.
- Circuit-breaker state-transition logic (open↔half_open↔closed — circuitBreaker.js:29-44) — L2 state machine; the box carries the state names only.
- `classifyComplexity` scoring weights (router.js:29-42) — L2; the tiers are on the card.
- The retry/backoff timing loop (`_backoff`, exponential — gateway.js:118, :164) — L2.
- `wasteReport` pattern-matching internals (costTracker.js:102-152) — L2.

## Portability notes — vocabulary strains for this domain

The token set was built for a trading system; recorded because "rules bent per
new domain" is the portability metric.

1. **`component.external` has no honest occupant.** The "providers" are
   `mockProvider` closures (demo.js:3) — a hardcoded mock standing in for a real
   provider API. The token is used for its structural position (the network
   surface the gateway calls out to), and the box + an edge label carry the
   `MOCK` correction so the picture cannot mislead.
2. **`component.agent` was not used.** This system has no agent/LLM occupant of
   its own — the LLM is the external provider, which took `component.external`.
   Every internal box is a stateless service, so all seven pipeline stages plus
   the breaker took `component.service`.
3. **Two modules are bookends, not stages.** `CostTracker` and
   `TokenBucketLimiter` are each consulted at the start (gate) and mutated at the
   end (write-back) of one request. The stage-box model wants one box per point;
   they are drawn once (as stages 1/2) with the write-back folded into stage 7
   and enumerated in the fold table, because two boxes for one module would
   overstate the component count.
4. **`component.artifact` labels a box that persists nothing.** AuditLog +
   dashboard emit to stdout / in-memory arrays; the token over-promises
   durability but its role — "where the run becomes visible" — is exact.
5. **No `edge.data_out` token exists.** The stage-7 → observability edge borrows
   `edge.artifact`, as in `guardrails_v1`.
