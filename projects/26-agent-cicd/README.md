# P26: Agent CI/CD Pipeline — Automated Quality Gates for AI

A CI/CD pipeline purpose-built for AI agents. Run eval suites on every PR, compare against baselines, enforce quality gates, and auto-promote or block deployments. No frameworks, no dependencies — pure Node.js.

## Why This Exists

Traditional CI/CD checks syntax and tests. Agent CI/CD checks behavior — did the agent get dumber? Did it start leaking PII? Did costs spike? This project implements the quality gates that prevent regressions from reaching production.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Agent CI/CD Pipeline                            │
│                                                                     │
│  PR / Code Change                                                   │
│       │                                                             │
│       ▼                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│  │   Eval       │────▸│  Baseline    │────▸│   Quality    │        │
│  │   Suite      │     │  Comparator  │     │    Gate      │        │
│  └──────────────┘     └──────────────┘     └──────────────┘        │
│       │                     │                    │                   │
│   Scored dims          Save/compare         Threshold rules         │
│   Tag filtering        Regression detect    Warning vs block        │
│   Weighted cases       Improvement detect   Custom rules            │
│   Error handling       Pass rate delta      History tracking        │
│                                                                     │
│                              │                                      │
│                              ▼                                      │
│                    ┌──────────────────┐                              │
│                    │   Promotion      │                              │
│                    │   Decision       │                              │
│                    └──────────────────┘                              │
│                         │    │    │                                  │
│                    PROMOTE  WARN  BLOCK                              │
│                         │    │    │                                  │
│                    Auto-save │  Violations                           │
│                    baseline  │  in report                            │
│                              │                                      │
│                         Warnings                                    │
│                         in report                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
node src/demo.js         # Run all 5 scenarios
node --test src/tests/   # Run 22 tests across 4 suites
```

## Modules

### Eval Suite (`src/evalSuite.js`)
- Multi-dimensional scoring (faithfulness, safety, cost, latency — or custom)
- Pluggable scorer functions per dimension
- Tag-based filtering for targeted eval runs
- Weighted test cases for importance ranking
- Configurable pass/fail thresholds

### Baseline Comparator (`src/baseline.js`)
- Save named baselines from eval runs
- Compare current results against any baseline
- Detect regressions (configurable threshold, default 5%)
- Detect improvements (configurable threshold, default 10%)
- Per-case comparison for debugging

### Quality Gate (`src/qualityGate.js`)
- Threshold rules: dimension score >= value
- Regression rules: no degradation vs baseline
- Custom rules: arbitrary check functions
- Warning vs error severity (warn = promote with notes, error = block)
- Evaluation history for trend analysis

### Pipeline (`src/pipeline.js`)
- 4-stage pipeline: eval → baseline → gate → promote/block
- Auto-saves baseline on successful promotion
- Markdown report generation
- Run history tracking with pass rates

## File Structure

```
src/
├── evalSuite.js        # Multi-dimensional eval runner
├── baseline.js         # Baseline save/compare/regression detect
├── qualityGate.js      # Threshold + regression + custom rules
├── pipeline.js         # 4-stage CI/CD orchestrator
├── demo.js             # 5 production scenarios
└── tests/
    └── cicd.test.js    # 22 tests across 4 suites
```

## Interview Angles

**"How do you prevent AI regressions in production?"**
→ Eval suite runs on every PR. Baseline comparison catches score degradation. Quality gates block deployment if safety drops below threshold or accuracy regresses more than 5%.

**"How do you measure agent quality?"**
→ Multi-dimensional: faithfulness (does it answer correctly?), safety (does it leak PII?), cost (token efficiency), latency. Each dimension has pluggable scorers and independent thresholds.

**"What's the promotion workflow?"**
→ Four stages: run evals, compare to baseline, check quality gates, decide. Block on violations, warn on soft limits, auto-promote when everything passes. Baseline auto-updates on promotion so the bar keeps rising.
