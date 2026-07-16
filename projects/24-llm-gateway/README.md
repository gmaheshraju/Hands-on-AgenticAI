# P24: LLM Gateway — Production-Grade Model Routing & Governance

A complete LLM gateway that sits between your application and model providers, handling routing, rate limiting, PII redaction, cost tracking, circuit breaking, and audit logging. No frameworks, no dependencies — pure Node.js.

## Why This Exists

Every company running LLMs in production eventually builds this. The alternative is scattered API calls with no visibility into costs, no PII protection, no failover, and no audit trail. This project implements the core infrastructure that platform teams build at companies like Stripe, Anthropic, and OpenAI.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LLM Gateway                                 │
│                                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐    │
│  │  Budget   │──▸│   Rate   │──▸│   PII    │──▸│    Model     │    │
│  │  Check    │   │  Limiter │   │ Redactor │   │   Router     │    │
│  └──────────┘   └──────────┘   └──────────┘   └──────┬───────┘    │
│       │              │              │                 │             │
│       │         Token Bucket    10 Patterns     Complexity         │
│       │         Per-team       SSN, PAN, CC     Classifier         │
│       │         Burst support  Aadhaar, AWS     3 Tiers            │
│       │                        Email, Phone                        │
│       │                                               │             │
│       ▼                                               ▼             │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐    │
│  │  Custom   │──▸│ Execute  │──▸│   Cost   │──▸│   Audit      │    │
│  │Middleware │   │ + Retry  │   │ Tracker  │   │    Log       │    │
│  └──────────┘   └──────────┘   └──────────┘   └──────────────┘    │
│       │              │              │                 │             │
│    SQL injection  Exp backoff   Per-team         Queryable         │
│    Content filter Circuit break  Budgets         Compliance        │
│    Custom rules   Auto failover  Waste detect    Request trace     │
│                                  Alert thresholds                  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Provider Registry                         │   │
│  │  ┌───────────┐   ┌───────────┐   ┌───────────┐             │   │
│  │  │ Anthropic  │   │  OpenAI   │   │  Google   │   + custom  │   │
│  │  │ Claude     │   │  GPT-4o   │   │  Gemini   │             │   │
│  │  └───────────┘   └───────────┘   └───────────┘             │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
node src/demo.js         # Run all 6 scenarios
node --test src/tests/   # Run 41 tests across 7 suites
```

## The 7-Step Pipeline

Every request flows through these steps in order:

1. **Budget Check** — Is this team over their daily spend limit?
2. **Rate Limit** — Token bucket with per-team limits and burst support
3. **PII Redaction** — Scan and redact 10 PII patterns before data leaves your network
4. **Model Routing** — Classify complexity, pick the cheapest model that fits
5. **Custom Middleware** — Your rules (SQL injection filter, content policy, etc.)
6. **Execute + Retry** — Send to provider with exponential backoff and automatic failover
7. **Cost Track + Audit** — Record cost, log everything, check alert thresholds

## Modules

### PII Redactor (`src/pii.js`)
Detects and redacts 10 PII patterns before prompts leave your infrastructure:
- SSN, Credit Card (with Luhn validation), Email, US Phone, Indian Phone
- IP Address, AWS Access Keys, API Keys (sk-/pk_live_/pk_test_/rk_live_)
- Aadhaar Number, PAN Number

### Rate Limiter (`src/rateLimit.js`)
Token bucket algorithm with:
- Per-team request and token limits
- Burst multiplier (1.5x default)
- Token refill rate calculation
- Retry-after headers

### Circuit Breaker (`src/circuitBreaker.js`)
Three-state machine (closed → open → half_open → closed):
- Configurable failure threshold and recovery time
- Half-open probing with max attempt limit
- Per-provider failure tracking and rate calculation

### Model Router (`src/router.js`)
Complexity-based routing across 7 models and 3 providers:
- Scoring: token count + tool count + keyword analysis
- 3 tiers: premium (opus/gpt-4o), standard (sonnet/gemini-pro), fast (haiku/mini/flash)
- Team overrides and explicit model selection
- Circuit-breaker-aware fallback chains

### Cost Tracker (`src/costTracker.js`)
Per-team budget enforcement and waste detection:
- Daily budget limits with configurable alert thresholds (50%/80%/95%)
- Waste patterns: premium models for simple tasks, duplicate requests within 60s
- Cost-by-model breakdown and savings recommendations

### Audit Log (`src/audit.js`)
Queryable audit trail for compliance:
- Filter by team, user, action, status, model, PII detection, time range
- Compliance report generation (success rate, PII events, blocked requests)
- Request trace replay by requestId

### Gateway (`src/gateway.js`)
Orchestrates the full pipeline:
- Provider registration with pluggable handlers
- Custom middleware support via `use()`
- Exponential backoff retries with automatic failover
- Dashboard aggregating all metrics

## What You'll Learn

- **Token bucket rate limiting** — not just "count requests per minute" but proper token-based limits with burst support
- **Circuit breaker pattern** — the same pattern Netflix uses to prevent cascade failures
- **PII detection at scale** — regex patterns with validation (Luhn algorithm for credit cards)
- **Complexity-based routing** — how to save 85% on LLM costs by routing simple queries to cheaper models
- **Cost attribution** — tracking spend per team, detecting waste, enforcing budgets
- **Audit logging** — building compliance-ready logs that can reconstruct any request

## File Structure

```
src/
├── pii.js              # PII detection + redaction (10 patterns)
├── rateLimit.js         # Token bucket rate limiter
├── circuitBreaker.js    # Three-state circuit breaker
├── router.js            # Complexity classifier + model routing
├── costTracker.js       # Budget enforcement + waste detection
├── audit.js             # Queryable audit log + compliance reports
├── gateway.js           # Full pipeline orchestrator
├── demo.js              # 6 production scenarios
└── tests/
    └── gateway.test.js  # 41 tests across 7 suites
```

## Interview Angles

**"How would you handle PII in LLM requests?"**
→ Scan before the data leaves your network. Regex + validation (Luhn for CC). Log that PII was found without logging the PII itself.

**"How do you manage costs across teams?"**
→ Per-team budgets with alert thresholds. Route by complexity — 80% of requests don't need the premium model. Detect waste patterns (opus for "summarize this in one line").

**"What happens when a provider goes down?"**
→ Circuit breaker opens after N failures, stops sending traffic. After recovery time, half-open state probes with limited requests. Automatic failover to alternative providers in the same tier.

**"How do you handle rate limiting for multiple teams?"**
→ Token bucket per team with configurable limits. Separate request count and token count buckets. Burst multiplier allows short spikes without blocking.
