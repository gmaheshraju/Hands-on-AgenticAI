# Project 06: Model Router with Cost Dashboard

A model routing proxy that classifies query complexity and routes to the cheapest appropriate LLM, with fallback escalation and real-time cost tracking.

## Architecture

```
User Query → Classifier (0-1 score) → Router → Model Tier
                                         ↓
                                    Fallback Chain
                                         ↓
                                    SQLite Metrics → Dashboard
```

**Tier routing:**
- Simple (score < 0.30) → Haiku/GPT-4o-mini → Sonnet → Opus
- Medium (score 0.30-0.55) → Sonnet → Opus
- Complex (score > 0.55) → Opus

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

## Interview Talking Points

- The classifier must be nearly free — if it costs $0.01 per call, you've eaten your savings
- Fallback detection without an expensive LLM: response length, hedging phrases, format validation
- 80/20 rule: ~40% of traffic is simple, routed to a model 60x cheaper than frontier
- Cost tracking requires handling streaming (token counts arrive after response)
- Configuration-driven: add a new model to `MODEL_CONFIG` without code changes
