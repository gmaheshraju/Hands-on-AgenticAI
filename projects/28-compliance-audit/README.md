# P28: Compliance-Ready Audit Harness

A production-grade compliance audit system with tamper-evident event logging,
deterministic decision replay, and multi-regulation compliance checking
(EU AI Act, SOC2, GDPR).

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AuditHarness                                 │
│                     (Orchestrator)                                  │
│                                                                     │
│  logEvent()  replayDecision()  checkCompliance()  generateReport()  │
│      │              │                │                  │           │
│      ▼              ▼                ▼                  ▼           │
│ ┌──────────┐ ┌─────────────┐ ┌──────────────────┐ ┌──────────┐    │
│ │  Event   │ │  Decision   │ │   Compliance     │ │ Reporter │    │
│ │  Logger  │ │  Replay     │ │   Framework      │ │          │    │
│ │          │ │             │ │                  │ │ Markdown │    │
│ │ SHA-256  │ │ Reconstruct │ │ ┌──────────────┐ │ │ reports  │    │
│ │ hash     │ │ chain +     │ │ │ EU AI Act    │ │ │ with     │    │
│ │ chain    │ │ deterministic│ │ │ SOC2         │ │ │ evidence │    │
│ │          │ │ replay      │ │ │ GDPR         │ │ │ + risk   │    │
│ │ Redact   │ │             │ │ │ Custom rules │ │ │          │    │
│ │ + Index  │ │ Drift       │ │ └──────────────┘ │ │          │    │
│ │ + Query  │ │ detection   │ │                  │ │          │    │
│ └──────────┘ └─────────────┘ └──────────────────┘ └──────────┘    │
└─────────────────────────────────────────────────────────────────────┘

Hash Chain (tamper-evident):
  ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
  │Entry 0 │───▶│Entry 1 │───▶│Entry 2 │───▶│Entry N │
  │hash: H0│    │prev: H0│    │prev: H1│    │prev:HN-1│
  │        │    │hash: H1│    │hash: H2│    │hash: HN│
  └────────┘    └────────┘    └────────┘    └────────┘

  H(n) = SHA-256(H(n-1) + entry_data)
  Modifying any entry invalidates all subsequent hashes.
```

## Modules

### eventLogger.js — Immutable Event Log
- Append-only log with SHA-256 hash chain linking each entry to its predecessor
- Automatic redaction of sensitive fields (passwords, tokens, API keys)
- Indexed queries by agent, action, and time range
- Chain verification detects any retroactive tampering
- Export capability for external audit systems

### decisionReplay.js — Decision Reconstruction & Replay
- Reconstructs the full causal chain leading to any decision
- Deterministic replay: re-run a decision function against original context
- Drift detection when replayed decision differs from original
- Audit summaries with input hashes and chain integrity status

### complianceFramework.js — Multi-Regulation Compliance Rules
- **EU AI Act**: transparency (decision explainability, audit trail), human oversight
  for high-risk decisions, non-discrimination (protected attribute exclusion)
- **SOC2**: access control (agent identity), audit trail (immutable log, data redaction),
  change management (config change logging with before/after)
- **GDPR**: data minimization (PII field limits), purpose limitation (purpose documentation),
  erasure (right to be forgotten handling, retention limits)
- Each rule: check function, evidence collection, severity, remediation guidance
- Extensible with custom rules via `addRule()`

### reporter.js — Compliance Report Generator
- Full Markdown reports: executive summary, per-regulation tables, failure details
- Risk matrix by severity (critical/high/medium/low)
- Prioritized remediation roadmap (P0/P1/P2)
- Summary reports for quick status checks

### harness.js — Orchestrator
- Unified API: `logEvent()`, `replayDecision()`, `checkCompliance()`, `generateReport()`
- Dashboard method with regulation scores and active agent tracking
- Full audit combining chain integrity + compliance + risk + report + export

## File Structure

```
28-compliance-audit/
├── package.json
├── README.md
└── src/
    ├── eventLogger.js          # SHA-256 hash chain event log
    ├── decisionReplay.js       # Decision reconstruction + deterministic replay
    ├── complianceFramework.js  # EU AI Act, SOC2, GDPR rule engine
    ├── reporter.js             # Markdown compliance report generator
    ├── harness.js              # Orchestrator with dashboard
    ├── demo.js                 # 5 demo scenarios
    └── tests/
        └── compliance.test.js  # 42 tests across 6 suites
```

## Usage

```bash
# Run demo (5 scenarios)
node src/demo.js

# Run tests
node --test src/tests/compliance.test.js
```

## Interview Angles

### System Design
- **Tamper-evident logging**: How SHA-256 hash chains make retroactive modification
  detectable without a centralized authority. Trade-offs vs. Merkle trees vs. blockchain.
- **Append-only data structures**: Why immutability matters for audit trails and how
  `Object.freeze()` + private fields enforce it at the application layer.
- **Multi-regulation architecture**: Designing a pluggable rule engine that maps
  diverse regulatory requirements to a uniform check/evidence/remediation interface.

### Security
- **Cryptographic integrity**: Hash chain verification catches both accidental
  corruption and deliberate tampering. Discuss: what if an attacker replays the
  entire chain from a modified entry?
- **Data redaction at ingestion**: Sensitive fields are stripped before storage,
  not at read time — the raw values never reach the audit log.
- **Evidence preservation**: Each compliance check captures evidence at check time,
  creating a forensic record even if the underlying data later changes.

### AI/ML Governance
- **Decision explainability**: EU AI Act Article 13 requires transparency. Every
  decision must carry a rationale. The framework detects missing explanations.
- **Deterministic replay**: Can you prove an AI system would make the same decision
  given the same inputs? Replay + drift detection answers this.
- **Human oversight**: High-risk decisions require human review flags. The system
  enforces this and reports violations.
- **Non-discrimination**: Automated detection of protected attributes in decision inputs.

### Production Patterns
- **Pluggable compliance rules**: New regulations added without modifying existing code.
  Each rule is self-contained with its own check logic, severity, and remediation.
- **Risk aggregation**: Individual rule failures roll up into severity-weighted risk
  assessments (critical > high > medium) for executive reporting.
- **Audit export**: Structured export format for integration with GRC platforms
  (ServiceNow, Drata, Vanta).
