# Capstone Projects

14 production-grade projects — one per topic. Not toy demos. Real problems, real APIs, real evaluation criteria.

Each project is designed to produce a portfolio piece you can walk through in a staff/principal-level interview. The "Staff+ Interview Angle" section gives you the opening line.

## The Projects

| # | Project | What You Build |
|---|---------|---------------|
| 01 | [PR Review Agent](01-agent-system-design.md) | GitHub PR reviewer with ReAct loop and structured findings |
| 02 | [Personal CRM](02-agent-memory.md) | Cross-session memory system with episodic/semantic/procedural layers |
| 03 | [Research Agent](03-agent-harness.md) | Observable agent harness with iteration/cost/convergence caps |
| 04 | [Content Pipeline](04-multi-agent-systems.md) | Multi-agent system: researcher → writer → editor → verifier |
| 05 | [Codebase Q&A](05-rag-pipeline.md) | Hybrid RAG with code-aware chunking, BM25+vector, RRF |
| 06 | [Model Router](06-llmops.md) | Complexity classifier + fallback chain + cost dashboard |
| 07 | [Injection Test Suite](07-guardrails.md) | 50+ prompt injection attacks + layered defense system |
| 08 | [RAG Eval Harness](08-eval-engineering.md) | Golden dataset + 3-dimension eval + LLM-as-judge + CI regression |
| 09 | [3-Way Comparison](09-fine-tuning-vs-rag.md) | Same problem solved with prompting vs RAG vs fine-tuning |
| 10 | [SQL Analytics Agent](10-tool-use.md) | Text-to-SQL with 3 permission tiers enforced in code |
| 11 | [Cost Optimizer](11-cost-latency.md) | Take an agent from $2 → $0.15 per conversation |
| 12 | [Production Chat UI](12-ai-ux.md) | Streaming + confidence indicators + HITL approval + error states |
| 13 | [Bias Audit Pipeline](13-responsible-ai.md) | Counterfactual testing + model card generator (EU AI Act) |
| 14 | [FDE Onboarding Toolkit](14-forward-deployed-engineering.md) | Customer data connector + domain adaptation + eval set builder |

## How to Use

1. Pick a project that maps to your target role
2. Build it end-to-end — the evaluation criteria tell you when you're done
3. Write up the "Staff+ Interview Angle" in your own words
4. Put it on GitHub with a clear README

## Cross-References

Projects build on each other:
- **05 → 08**: Build the RAG pipeline first, then evaluate it with the eval harness
- **01/03 → 11**: Build an agent first, then optimize its cost
- **Any agent → 12**: Wrap any backend agent in the production chat UI
- **Any system → 07**: Test any LLM system against the injection test suite
- **Any model → 13**: Audit any model for bias before shipping
