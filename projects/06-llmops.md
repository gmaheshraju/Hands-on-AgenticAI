# Project 06: Model Router with Cost Dashboard

## The Problem

Your AI product uses Claude Opus for everything. It costs $8 per 1,000 conversations. Your CEO wants it under $1. Most requests are simple ("what's my order status?") and don't need a frontier model. But some are complex ("analyze this contract for liability risks") and absolutely do. You need a router that sends each request to the right model at the right price.

## What You Build

A model routing proxy that sits between your application and multiple LLM APIs, routing based on complexity.

**Architecture:**
```
App → Router Proxy (localhost:3000) → Claude Haiku / Sonnet / Opus
                                    → GPT-4o-mini / GPT-4o
                                    → Local model (Ollama)
```

**Plus:** A simple dashboard showing cost, latency, and routing decisions per request.

## Architecture Requirements

1. **Complexity classifier** — Before routing, classify each request:
   - **Simple** (FAQ, status checks, simple formatting) → cheapest model
   - **Medium** (summarization, basic analysis, code explanation) → mid-tier model
   - **Complex** (reasoning, multi-step analysis, creative writing) → frontier model
   
   Use a fast, cheap classifier (Haiku-class model, or a local model via Ollama) to classify. The classifier call must cost less than the savings from routing.

2. **Fallback chain** — If the cheap model's response quality is low (detected by a simple heuristic: response too short, contains "I don't know", or fails a format check), escalate to the next tier. Track escalations.

3. **Cost tracking** — Every request logs:
   - Model used, tokens in/out, cost in USD
   - Whether it escalated (and why)
   - Latency (time to first token, total time)
   - Write to a SQLite database

4. **Dashboard** — A simple HTML page served by the proxy:
   - Total cost today / this week / this month
   - Cost breakdown by model
   - Average latency by model
   - Escalation rate
   - Top 10 most expensive conversations

5. **Configuration** — Model tiers, cost thresholds, and escalation rules in a YAML/JSON config file. No code changes to add a new model.

## Evaluation Criteria

Run 100 diverse requests through the router (mix of simple, medium, complex). Compare:
- Cost vs. sending everything to the frontier model (should be 60-80% cheaper)
- Quality: did any simple-routed requests produce bad answers?
- Escalation rate: what percentage escalated? (should be under 15%)
- Classifier accuracy: sample 20 requests and check if routing was correct
- Dashboard accuracy: do the numbers match your logs?

## Stack

- Node.js (Express) or Python (FastAPI) for the proxy
- Multiple LLM APIs (at least 2 providers or tiers)
- SQLite for cost/metrics storage
- Simple HTML + vanilla JS for the dashboard (no framework needed)

