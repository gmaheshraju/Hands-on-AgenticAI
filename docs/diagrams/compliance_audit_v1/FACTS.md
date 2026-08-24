# FACTS — 28-compliance-audit (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/28-compliance-audit/src/`, n=5 JS modules
(1163 lines) + 1 test suite (444 lines) + `demo.js` (269 lines). **Every element
in the diagram appears below with a `file:line` citation. The diagram may contain
nothing that is not on this page, and this page may contain nothing without a
citation.** The project README ships an ASCII architecture diagram; it was
treated as a claim, not as evidence — every fact below was read from source, and
the ASCII's implied topology did not survive that reading (see "README claims").

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The regex/branch internals of each compliance
`check` function, the causal-relevance predicate inside `reconstruct`, and the
Markdown line-assembly inside the reporter are L2 concerns and are deliberately
NOT drawn here.

---

## Entry / driver — `src/demo.js`

| Fact | Citation |
|---|---|
| `main()` constructs one `AuditHarness({ retentionDays: 365 })` and runs 5 scenarios | demo.js:251, :256, :269 |
| Imports `AuditHarness` from the orchestrator | demo.js:12 |
| Scenario 1 logs 3 events for a `loan-assessment-agent` (context_load, tool_call, decision) | demo.js:31, :40, :49 |
| Scenario 3 logs a high-risk `hiring-agent` decision with no `humanReviewed` flag (triggers a finding) | demo.js:125, :133 |
| Scenario 4 logs a `system-admin` `config_change` with before/after metadata | demo.js:160 |
| Scenario 5 logs a `data-pipeline-agent` retrieval and a `compliance-bot` erasure_request | demo.js:200, :208 |
| The five agentIds are string labels on logged events, not running processes | demo.js:32, :126, :162, :201, :209 |

`demo.js` is the only executable entry; it is drawn as the `component.entry`
box. The five simulated agents it logs on behalf of are drawn as one
`component.mock` box (they have no code of their own — see Portability note 1).

## Orchestrator — `src/harness.js`

| Fact | Citation |
|---|---|
| `class AuditHarness` owns four private members | harness.js:13, :14-18 |
| Constructor instantiates `EventLogger`, then `DecisionReplay(this.#logger)`, `ComplianceFramework`, `ComplianceReporter` | harness.js:21, :22, :23, :24 |
| `DecisionReplay` is constructed **with the logger** — it is a consumer of the log, not an independent peer | harness.js:22 |
| `logEvent()` delegates to `#logger.log()` | harness.js:55, :56 |
| `replayDecision()` delegates to `#replay.replay()` / `#replay.reconstruct()` | harness.js:62, :64, :66 |
| `checkCompliance()` delegates to `#framework.check(this.#logger, …)` | harness.js:72, :73 |
| `generateReport()` calls `#framework.check` + `#framework.riskAssessment`, then feeds both into `#reporter.generate()` | harness.js:79, :80, :81, :83 |
| `dashboard()` reads chain integrity, per-regulation scores, active agents, risk | harness.js:119, :120, :135, :143 |
| `fullAudit()` combines chain integrity + compliance + risk + report + export | harness.js:101, :102-113 |
| `exportAuditData()` returns `#logger.export()` | harness.js:158, :159 |

## Immutable event log — `src/eventLogger.js`

| Fact | Citation |
|---|---|
| `class EventLogger` — append-only entries + three indexes | eventLogger.js:47, :49-53 |
| `log({agentId, action, input, output, decision, rationale, metadata})` requires agentId + action | eventLogger.js:64 |
| Each entry links to the previous entry's `hash`; first entry uses genesis `'0'.repeat(64)` | eventLogger.js:68, :70 |
| `entry.hash = computeHash(previousHash, entry)` then `Object.freeze` | eventLogger.js:85, :87 |
| `computeHash` = `SHA-256(JSON.stringify({ previousHash, ...data }))` | eventLogger.js:40, :41, :42 |
| Sensitive input/output redacted via `deepRedact` before hashing | eventLogger.js:77, :78, :25, :33 |
| `verifyChain()` walks every entry, recomputes hash, returns `{ valid, brokenAt }` | eventLogger.js:135, :148, :153 |
| `export()` emits entryCount + chainValid + all entries | eventLogger.js:159, :163 |
| Query indexes: `getById` / `queryByAgent` / `queryByAction` | eventLogger.js:102, :107, :112 |

## Decision replay — `src/decisionReplay.js`

| Fact | Citation |
|---|---|
| `class DecisionReplay(logger)` requires an EventLogger | decisionReplay.js:11, :14, :15 |
| `reconstruct(decisionId)` walks the log via `getById` / `getAll` to collect the causal chain | decisionReplay.js:26, :27, :32 |
| `replay(decisionId, decisionFn)` re-runs the decision function on the reconstructed context | decisionReplay.js:94, :116 |
| Match = replayed `decision` **and** `rationale` equal the original | decisionReplay.js:125, :126, :127 |
| On mismatch, returns a `drift` object (decisionChanged / rationaleChanged) | decisionReplay.js:133, :134, :135 |
| `auditSummary()` produces compliance-ready evidence (input hash, chain integrity, timeline) | decisionReplay.js:144, :156, :158 |

## Compliance rule engine — `src/complianceFramework.js`

| Fact | Citation |
|---|---|
| `class ComplianceFramework` registers all built-in rules into a Map | complianceFramework.js:293, :298 |
| `check(logger, regulation, config)` runs each rule's `check(logger, config)`, tallies pass/fail, computes score | complianceFramework.js:336, :343, :369 |
| `riskAssessment(logger, config)` tallies failures by severity and escalates overall risk | complianceFramework.js:378, :387 |
| `addRule()` accepts custom rules (needs id, regulation, check) | complianceFramework.js:304 |
| `getRegulations()` returns the distinct regulation set | complianceFramework.js:324 |

## Report generator — `src/reporter.js`

| Fact | Citation |
|---|---|
| `class ComplianceReporter` | reporter.js:8 |
| `generate({complianceResults, riskAssessment, auditMeta})` builds a full Markdown report | reporter.js:12 |
| Sections: executive summary, per-regulation tables, failure detail, risk matrix, remediation roadmap | reporter.js:26, :43, :74, :92, :104 |
| Remediation buckets P0 / P1 / P2 by severity | reporter.js:112, :119, :125 |
| `generateSummary()` builds a compact per-regulation score table | reporter.js:143 |

## Output — stdout (no file persistence)

| Fact | Citation |
|---|---|
| The report is a Markdown **string**; the demo prints it (and dashboard/summary) to stdout | demo.js:186, :188, :218, :244 |
| `harness.export()` / `fullAudit().exportedLog` returns a JSON-serializable object, also printed, never written to disk | harness.js:112, :158; demo.js:237 |

**No file is written.** Like `07-guardrails`, this project's deliverable is
stdout; the output box is drawn `component.artifact` with a label saying stdout.

---

### INVARIANT CARD 1 — tamper-evident hash chain (`eventLogger.js`)

Each entry carries **11 fields**, complete and in code order, then a hash that
seals it to its predecessor.

| Field (code order) | Citation |
|---|---|
| id | eventLogger.js:73 |
| timestamp | eventLogger.js:74 |
| agentId | eventLogger.js:75 |
| action | eventLogger.js:76 |
| input (redacted) | eventLogger.js:77 |
| output (redacted) | eventLogger.js:78 |
| decision | eventLogger.js:79 |
| rationale | eventLogger.js:80 |
| metadata | eventLogger.js:81 |
| previousHash | eventLogger.js:82 |
| hash | eventLogger.js:85 |

- Genesis `previousHash` = 64 zeros for the first entry (eventLogger.js:70), and
  `verifyChain` uses the same genesis to check index 0 (eventLogger.js:139).
- `hash = SHA-256(JSON.stringify({ previousHash, ...data }))` (eventLogger.js:40-42).
- Entries are frozen on append (eventLogger.js:87); `verifyChain` recomputes each
  hash and returns the first `brokenAt` index (eventLogger.js:148, :150).
- Redaction runs before hashing over 12 keys (see card note below).

### INVARIANT CARD 2 — 12 compliance rules across 3 regulations, complete, in registration order

Registered in one loop `[...EU_AI_ACT_RULES, ...SOC2_RULES, ...GDPR_RULES]`
(complianceFramework.js:298). All 12 listed, in code order, with severity.

**EU AI Act** (complianceFramework.js:10)

| # | Rule id | Name | Severity | Citation |
|---|---|---|---|---|
| 1 | eu-ai-transparency-001 | Decision Explainability | high | complianceFramework.js:12, :17 |
| 2 | eu-ai-transparency-002 | Audit Trail Completeness | critical | complianceFramework.js:31, :36 |
| 3 | eu-ai-oversight-001 | Human Review for High-Risk | high | complianceFramework.js:51, :56 |
| 4 | eu-ai-nondiscrimination-001 | Protected Attribute Exclusion | critical | complianceFramework.js:76, :81 |

**SOC2** (complianceFramework.js:105)

| # | Rule id | Name | Severity | Citation |
|---|---|---|---|---|
| 5 | soc2-access-001 | Agent Identity Tracking | high | complianceFramework.js:107, :112 |
| 6 | soc2-audit-001 | Immutable Audit Log | critical | complianceFramework.js:126, :131 |
| 7 | soc2-audit-002 | Sensitive Data Redaction | critical | complianceFramework.js:144, :149 |
| 8 | soc2-change-001 | Configuration Change Logging | medium | complianceFramework.js:174, :179 |

**GDPR** (complianceFramework.js:196)

| # | Rule id | Name | Severity | Citation |
|---|---|---|---|---|
| 9 | gdpr-minimization-001 | Input Data Minimization | high | complianceFramework.js:198, :203 |
| 10 | gdpr-purpose-001 | Purpose Documentation | medium | complianceFramework.js:229, :234 |
| 11 | gdpr-erasure-001 | Erasure Request Handling | high | complianceFramework.js:248, :253 |
| 12 | gdpr-retention-001 | Data Retention Limits | medium | complianceFramework.js:269, :274 |

`check()` runs all rules; `score = round(passed / total × 100)`
(complianceFramework.js:369). `addRule()` extends the set (complianceFramework.js:304).

### INVARIANT CARD 3 — risk escalation ladder, complete, in code order (`complianceFramework.js:387`)

`overallRisk` starts `'low'` and is raised by the first matching condition, in
this exact order:

| Order | Condition | Result | Citation |
|---|---|---|---|
| default | — | low | complianceFramework.js:387 |
| 1 | `bySeverity.critical > 0` | critical | complianceFramework.js:388 |
| 2 | else `bySeverity.high > 1` | high | complianceFramework.js:389 |
| 3 | else `high > 0` or `medium > 1` | medium | complianceFramework.js:390 |

Failures are tallied by severity (complianceFramework.js:383-385); critical
failures become `criticalFindings` → P0 roadmap (complianceFramework.js:396;
reporter.js:112). The reporter emits exec summary, per-regulation tables, a risk
matrix, and a P0/P1/P2 roadmap (reporter.js:26, :92, :104).

**Observed on an actual run** (`node src/demo.js`, 2026-08-24): 7 events, chain
VALID, 12 rules checked → EU AI Act 75% (3/4), SOC2 100%, GDPR 100%, combined
92%, overall risk MEDIUM, 0 critical findings. These are outputs, not source
lines; they are drawn on the card labelled as an observed run, and the formulas
that produce them are cited above.

---

## Artifacts written

**None.** Every output goes to stdout via `console.log`; the export object is
returned in memory, never persisted (harness.js:158; demo.js:237).

## README claims that did not verify cleanly

1. **The README ASCII draws the four modules (EventLogger, DecisionReplay,
   ComplianceFramework, Reporter) as flat siblings hanging off the orchestrator.**
   In code the topology is a pipeline around a hub, not four peers:
   - `EventLogger` is the shared immutable store. Both `DecisionReplay`
     (decisionReplay.js:27, :32) and `ComplianceFramework.check`
     (complianceFramework.js:336, called harness.js:73, :80) **read from it** —
     they are consumers, not independent siblings.
   - `ComplianceReporter` never touches the logger; it consumes the
     **framework's output** (harness.js:83-87, reporter.js:12) — it is downstream
     of `ComplianceFramework`, not a peer of `EventLogger`.
   The diagram draws EventLogger as the central store, DecisionReplay and
   ComplianceFramework as two readers of it, and the Reporter downstream of the
   framework. This is the load-bearing correction on this page.
2. **The README's `## Modules` header says the test suite has "42 tests across 6
   suites."** This one **verified TRUE**: 6 `describe` blocks, 42 `it` blocks
   (compliance.test.js:12, :134, :158, :246, :325, :369; 42 `it(` occurrences).
   Recorded because a claim that checks out is still a claim that was checked.

## Deliberately NOT drawn (L1 scope discipline)

- The internals of each of the 12 `check` functions (regex sets, PII field
  lists, protected-attribute sets) — L2; the card carries the rule catalog and
  severities, which is the L1-relevant fact.
- `reconstruct`'s causal-relevance predicate (same agent / sessionId / parentId,
  decisionReplay.js:42-46) — L2.
- The Markdown line-assembly loops inside the reporter (reporter.js:47-137) — L2.
- `deepRedact`'s recursion and the exact 12-key `REDACT_KEYS` set
  (eventLogger.js:15-19) — enumerated here, folded into the chain card as a count.
- The 42 unit tests — verification scaffolding, not runtime architecture.

## Portability notes — vocabulary built for a trading system, bent per this domain

1. **`component.agent` has no honest occupant.** The five "agents"
   (loan-assessment-agent, hiring-agent, system-admin, data-pipeline-agent,
   compliance-bot) are **string labels on logged events** (demo.js:32, :126,
   :162, :201, :209), not running agent processes. They are drawn as one
   `component.mock` box ("simulated agents") with a label saying so, rather than
   inventing an agent that does not exist. This is the recurring
   `component.agent`-has-no-occupant strain flagged for the harness.
2. **`component.external` has no real occupant either.** There is no network,
   no database, no third-party service — the whole system is in-memory Node ESM.
   No box takes `component.external`; the "inputs" surface is the mock agent set
   above. Recorded as the recurring `component.external`-is-a-mock strain.
3. **`component.artifact` over-promises durability.** The output box is stdout,
   not a file; the token is reused for the emitter because no `component.stdout`
   token exists, and the label says "stdout" to keep the picture honest — same
   bend recorded on `07-guardrails`.
4. **`boundary.observability` labels a zone that persists nothing.** Kept because
   the semantic role — "where the run becomes visible" — is exactly right; the
   token name over-promises durability.
5. **`EventLogger` occupies the store position but takes `component.service`.**
   It is an in-memory class with methods (a live service), not a durable
   artifact; the durable-store role is carried on invariant card 1, not by a
   token. Same choice as `MemoryStore` in `agent_memory_v1`.
