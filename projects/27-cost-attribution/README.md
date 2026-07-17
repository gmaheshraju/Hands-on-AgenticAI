# P27: Cost Attribution Engine — Know Where Every Dollar Goes

Track cost-per-outcome across agents, detect waste patterns, enforce budgets, and calculate ROI per agent. The CFO dashboard for AI spend. No frameworks, no dependencies — pure Node.js.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Cost Attribution Engine                          │
│                                                                     │
│  ┌──────────────┐                                                   │
│  │    Cost      │  Records every LLM call with:                     │
│  │  Collector   │  agent, team, task type, model, tokens,           │
│  │              │  outcome, value, latency                          │
│  └──────┬───────┘                                                   │
│         │                                                           │
│    ┌────┴────┬──────────────┬──────────────┐                        │
│    ▼         ▼              ▼              ▼                        │
│  ┌─────┐  ┌─────┐    ┌──────────┐   ┌──────────┐                   │
│  │ By  │  │ By  │    │  Waste   │   │   ROI    │                   │
│  │Agent│  │Team │    │ Detector │   │Calculator│                   │
│  │     │  │     │    │          │   │          │                   │
│  │By   │  │By   │    │Overpowered│  │Per agent │                   │
│  │Task │  │Model│    │Duplicates│   │Per team  │                   │
│  │Type │  │     │    │Retries   │   │Efficiency│                   │
│  │     │  │     │    │Cache miss│   │Value/$   │                   │
│  │     │  │     │    │Failures  │   │          │                   │
│  └─────┘  └─────┘    └──────────┘   └──────────┘                   │
│                                                                     │
│  Budget Alerts ───▸ 50% │ 80% │ 95% │ 100% thresholds              │
│  Executive Summary ───▸ Total cost, savings %, top waste            │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
node src/demo.js         # Run all 6 scenarios
node --test src/tests/   # Run 20 tests across 5 suites
```

## Modules

### Cost Collector (`src/collector.js`)
- Auto-calculates cost from model pricing tables (7 models supported)
- Records: agent, team, task type, model, tokens, outcome, latency, cache status
- Queryable by any dimension

### Cost Attribution (`src/attribution.js`)
- **By Agent**: cost, requests, success rate, avg cost per request
- **By Team**: cost breakdown by model, unique agent count
- **By Task Type**: cost per success, success rate, avg latency
- **By Model**: total tokens, cost per request, cache hit rate

### Waste Detector (`src/waste.js`)
6 waste patterns with dollar-value savings estimates:
- **Overpowered Model**: Opus/GPT-4o for simple tasks — 85% savings available
- **Duplicate Requests**: Near-identical calls within 60s — cache would eliminate
- **Excessive Retries**: Multiple failures on same task — early-exit saves tokens
- **Low Cache Hit Rate**: Cold requests when caching would save 15%+
- **High Failure Rate**: Agent burning tokens with >30% failure rate
- **Idle Agents**: Still provisioned but inactive — resource waste

### ROI Calculator (`src/roi.js`)
- Pluggable value functions per task type
- Per-agent ROI: cost vs value generated
- Per-team ROI with top/worst performer identification
- Cost efficiency metrics: cost/token, cost/success, tokens/request

### Engine (`src/engine.js`)
- Unified recording with auto-budget checking
- Dashboard aggregating all dimensions
- Executive summary for leadership (total cost, savings %, top waste)
- Budget alerts at configurable thresholds

## File Structure

```
src/
├── collector.js        # Event recording + pricing + queries
├── attribution.js      # 4-dimension cost breakdown
├── waste.js            # 6-pattern waste detector
├── roi.js              # ROI + cost efficiency calculator
├── engine.js           # Unified engine + dashboard + alerts
├── demo.js             # 6 production scenarios
└── tests/
    └── cost.test.js    # 20 tests across 5 suites
```

