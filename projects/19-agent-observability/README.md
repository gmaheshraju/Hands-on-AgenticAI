# Project 19: Agent Observability Dashboard

Production-grade observability for AI agents — traces, cost tracking, quality scoring, drift detection, and a live dashboard.

## What This Builds

An end-to-end observability system for deployed AI agents, answering the question: **"What happens AFTER you deploy an AI agent?"**

### Components

| Module | File | Purpose |
|--------|------|---------|
| **Trace Collector** | `src/tracer.js` | OpenTelemetry-inspired tracing for LLM calls (spans + traces) |
| **Cost Tracker** | `src/costTracker.js` | Real-time cost monitoring, aggregation, budget alerts |
| **Quality Scorer** | `src/qualityScorer.js` | LLM-as-judge quality monitoring (simulated for demo) |
| **Drift Detector** | `src/driftDetector.js` | Statistical drift detection using z-scores |
| **SQLite Store** | `src/store.js` | Persistent storage for all observability data |
| **Dashboard Server** | `src/dashboard.js` | Express REST API serving metrics and traces |
| **Dashboard UI** | `public/dashboard.html` | Live dashboard with charts, trace viewer, alerts |
| **Simulator** | `src/simulator.js` | Generates 500 realistic agent requests over 7 days |
| **Demo Runner** | `src/demo.js` | Orchestrates simulation + dashboard startup |

## Quick Start

```bash
npm install
npm start
```

This will:
1. Generate 500 simulated agent requests across 7 days
2. Inject drift in the last 2 days (token usage +40%, latency +60%, quality -0.5)
3. Run drift detection to generate alerts
4. Start the dashboard at http://localhost:3000

## Key Features

### Trace Collector
- Span: one LLM call with model, tokens, latency, cost, tool calls
- Trace: a full agent run (multiple spans forming a tree)
- OpenTelemetry-like API: `tracer.startTrace()` → `trace.startSpan()` → `span.end()`

### Cost Tracker
- Per-model cost calculation (7 models with input/output token pricing)
- Hourly/daily/weekly cost aggregation
- Budget alerts: warn at 80%, block at 100% of daily budget
- Cost attribution by agent, user, model, or workflow

### Quality Scorer
- Simulated LLM-as-judge scoring (1-5 scale, 5 criteria)
- Rolling 7-day average tracking
- Quality threshold alerts (default: 3.5)
- Score distribution analysis

### Drift Detector (Standout Feature)
- **Token usage drift** — avg tokens per response changing
- **Latency drift** — P50/P95 trending up
- **Cost drift** — avg cost per request changing
- **Tool usage drift** — tool call frequency changing
- **Quality drift** — scores trending down
- Detection method: z-score comparison of recent window vs baseline
  - |z| < 2.0 → normal
  - 2.0 ≤ |z| < 3.0 → warning
  - |z| ≥ 3.0 → critical

### Live Dashboard
- KPI cards: requests/min, avg latency, cost today, quality score
- Charts: cost over time, latency distribution, quality trend, token usage
- **Trace viewer**: click a request → see the full span tree with timing waterfall
- Alerts panel: active drift alerts with severity and z-scores
- Filterable by time range, agent, model

## Architecture

```
Agent Request
    ↓
┌─────────┐    ┌──────────────┐    ┌─────────────┐
│ Tracer  │───→│ SQLite Store │←───│  Dashboard  │
└─────────┘    └──────────────┘    └─────────────┘
    ↓               ↑                    ↑
┌──────────┐   ┌────────────┐    ┌──────────────┐
│Cost Track│   │Quality Score│   │Drift Detector│
└──────────┘   └────────────┘    └──────────────┘
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/stats` | Overview KPIs |
| `GET /api/traces` | List traces (filterable) |
| `GET /api/traces/:id` | Trace detail with span tree |
| `GET /api/costs` | Cost aggregation (hourly/daily/weekly) |
| `GET /api/costs/attribution` | Cost breakdown by agent/model/user |
| `GET /api/costs/budget` | Budget status with alerts |
| `GET /api/quality` | Quality scores and trends |
| `GET /api/quality/distribution` | Score histogram |
| `GET /api/drift/alerts` | Active drift alerts |
| `GET /api/drift/check` | Trigger drift detection |
| `GET /api/metrics/timeseries` | Generic timeseries data |

## Concepts Demonstrated

- **OpenTelemetry-style distributed tracing** for LLM pipelines
- **Statistical process control** (z-score drift detection)
- **Cost governance** with budget gates
- **Quality monitoring** at scale via sampling
- **Full-stack observability** from data collection to visualization
