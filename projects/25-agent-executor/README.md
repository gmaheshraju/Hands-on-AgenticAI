# P25: Zero-Trust Agent Executor — IAM for AI Agents

A production-grade execution framework that applies zero-trust security principles to AI agent actions. IAM-style policies, sandboxed execution, human-in-the-loop approvals, and complete audit trails. No frameworks, no dependencies — pure Node.js.

## Why This Exists

Agents that can read databases, call APIs, and deploy code need the same security model as human users — maybe stricter. This project implements the permission layer that sits between an agent's intent and the system's resources. The same patterns AWS IAM, Kubernetes RBAC, and enterprise access control use, applied to AI agents.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Agent Executor                                 │
│                                                                     │
│  Agent Request                                                      │
│       │                                                             │
│       ▼                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│  │   Schema     │────▸│   Policy     │────▸│  Approval    │        │
│  │  Validator   │     │   Engine     │     │   Queue      │        │
│  └──────────────┘     └──────────────┘     └──────────────┘        │
│       │                     │                    │                   │
│   Type checks          IAM-style            Human-in-loop          │
│   Required fields      Allow/Deny           Escalation chain       │
│   Enum validation      Conditions           Auto-approve rules     │
│   Min/Max bounds       Priority             Timeout + expiry       │
│                        Wildcards                                    │
│                                                    │                │
│       ┌────────────────────────────────────────────┘                │
│       ▼                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│  │   Sandbox    │────▸│   Action     │────▸│   Audit      │        │
│  │  Enforcer    │     │  Executor    │     │   Trail      │        │
│  └──────────────┘     └──────────────┘     └──────────────┘        │
│       │                     │                    │                   │
│   File path blocks     Timeout guard       Full replay             │
│   Network allow list   Retry logic         Security reports        │
│   Resource limits      Error capture       Agent behavior          │
│   Dir restrictions     Output capture      Denial analysis         │
│   Auto-suspend                                                     │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Trust Levels                              │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │   │
│  │  │Untrusted │ │  Basic   │ │ Elevated │ │  Admin   │       │   │
│  │  │ No write │ │ Read     │ │ Read +   │ │ Full     │       │   │
│  │  │ No net   │ │ only     │ │ Write    │ │ access   │       │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
node src/demo.js         # Run all 6 scenarios
node --test src/tests/   # Run 38 tests across 6 suites
```

## The 5-Gate Pipeline

Every agent action passes through these gates in order:

1. **Schema Validation** — Are the parameters valid? Required fields, types, enums, bounds.
2. **Policy Evaluation** — Does this agent have permission? IAM-style allow/deny with conditions.
3. **Approval Check** — Does this action require human approval? Auto-approve rules, escalation chains.
4. **Sandbox Enforcement** — Is this operation within resource limits? File paths, network, ops count.
5. **Audit Recording** — Log everything. Success, denial, error, duration, output.

## Modules

### Policy Engine (`src/policy.js`)
IAM-style access control with:
- Allow/deny policies with priority ordering (deny always wins at equal priority)
- Wildcard matching for principals, actions, and resources
- Condition operators: equals, notEquals, in, notIn, lessThan, greaterThan, exists, matches
- Role-based policy assignment

### Action Registry (`src/actionRegistry.js`)
Typed action definitions with:
- Risk levels (low/medium/high/critical)
- JSON Schema-style validation (required, types, enums, min/max, patterns)
- Category grouping and risk-level filtering
- Timeout, retry, and reversibility metadata

### Sandbox (`src/sandbox.js`)
Resource isolation and enforcement:
- Per-session permissions (file read/write, network, exec, database)
- Blocked paths (/etc, .env, .ssh, secrets)
- Allowed directory restrictions
- Allowed host lists for network calls
- Resource limits (file ops, network calls)
- Auto-suspend after 3 violations

### Approval Queue (`src/approvals.js`)
Human-in-the-loop governance:
- Auto-approve rules (by risk level, agent, action)
- Multi-level escalation chains
- Configurable timeouts with expiry
- Full approval/denial history with notes

### Audit Trail (`src/auditTrail.js`)
Complete action history:
- Query by agent, session, action, result, risk level, time range
- Per-agent behavior reports (deny rate, risk breakdown)
- Session replay (reconstruct exact action sequence)
- Security reports (denial patterns, high-risk actions)

### Executor (`src/executor.js`)
Orchestrates the full pipeline:
- Agent registration with trust levels
- Session lifecycle management
- 5-gate execution pipeline
- Security dashboard

## What You'll Learn

- **IAM policy evaluation** — the same allow/deny/condition model AWS uses, applied to agent actions
- **Zero-trust architecture** — every action verified, nothing implicitly trusted
- **Sandbox design** — resource isolation without containers or VMs
- **Approval workflows** — how to build human-in-the-loop gates with escalation
- **Audit trail design** — building replayable, queryable action logs for compliance

## File Structure

```
src/
├── policy.js           # IAM-style policy engine
├── actionRegistry.js   # Typed action definitions + validation
├── sandbox.js          # Resource isolation + enforcement
├── approvals.js        # Human-in-the-loop approval queue
├── auditTrail.js       # Queryable audit trail + reports
├── executor.js         # Full pipeline orchestrator
├── demo.js             # 6 production scenarios
└── tests/
    └── executor.test.js # 38 tests across 6 suites
```

## Interview Angles

**"How do you secure agent actions in production?"**
→ Zero-trust: every action goes through schema validation, policy check, optional human approval, and sandbox enforcement. Trust levels gate what each agent can do. Full audit trail for compliance.

**"How do you handle the tension between agent autonomy and safety?"**
→ Trust levels + conditional policies. A data-analyst agent reads freely but can't write. An elevated agent writes but can't deploy. Critical actions always require human approval. The sandbox auto-suspends agents that accumulate violations.

**"How would you build an approval workflow for AI actions?"**
→ Three tiers: auto-approve (low risk, configured rules), human approval (queued with timeout), and escalation chain (lead → manager → CTO). Expired requests are auto-denied. Full history for audit.
