# Project 06: Model Router with Cost Dashboard

A model routing proxy that classifies query complexity and routes to the cheapest appropriate LLM, with fallback escalation and real-time cost tracking.

## Architecture

```
  ┌──────────────────────────────────────────────────────────────┐
  │                       USER QUERY                             │
  └──────────────────────────┬───────────────────────────────────┘
                             ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  classifier.js ── Complexity Scoring (0-1)                   │
  │  Heuristic: keywords×0.50 + length×0.30 + structure×0.20    │
  │  Zero cost, <1ms latency                                     │
  └───────┬──────────────────┬──────────────────┬────────────────┘
          ▼                  ▼                  ▼
    score < 0.30       0.30 - 0.55         score > 0.55
    ┌─────────┐       ┌──────────┐        ┌──────────┐
    │ SIMPLE  │       │  MEDIUM  │        │ COMPLEX  │
    └────┬────┘       └────┬─────┘        └────┬─────┘
         ▼                 ▼                   ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  router.js ── Fallback Chain                                 │
  │                                                              │
  │  Simple:  Haiku ──▸ Sonnet ──▸ Opus                          │
  │  Medium:  Sonnet ──▸ Opus                                    │
  │  Complex: Opus                                               │
  │                                                              │
  │  Escalation triggers: response too short, hedging,           │
  │  refusals, model errors                                      │
  └──────────────────────────┬───────────────────────────────────┘
                             ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  metrics.js ── SQLite Store (WAL mode)                       │
  │  Logs: model, tokens_in/out, cost, latency, escalation       │
  └──────────────────────────┬───────────────────────────────────┘
                             ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  dashboard.js ── Cost Dashboard (HTTP :3000)                 │
  │  Real-time: cost/model, tier distribution, escalation rate   │
  └──────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
npm install
npm run demo        # Run 50 queries, populate metrics DB
npm run dashboard   # Start dashboard at http://localhost:3000
```

## Files

| File | Purpose |
|------|---------|
| `src/classifier.js` | Complexity scoring (length + keywords + structure) |
| `src/router.js` | Model routing with fallback chain |
| `src/metrics.js` | SQLite metrics store + dashboard queries |
| `src/dashboard.js` | HTTP server for the dashboard |
| `src/demo.js` | Demo: 50 queries through the router |
| `public/dashboard.html` | Cost dashboard UI |

## Key Design Decisions

1. **Heuristic classifier over LLM classifier** — Zero cost, <1ms. A classifier LLM call would eat the routing savings.
2. **Fallback chain with quality detection** — If a cheap model returns a low-quality response (too short, hedging, refusals), escalate automatically.
3. **SQLite with WAL mode** — Handles concurrent reads (dashboard) and writes (router) without blocking.
4. **Mock models for demo** — Swap `mockModelCall` for real API calls in production. The router is model-agnostic.

