# Projects

29 production-grade projects — one per topic. Not toy demos. Real problems, real APIs, real evaluation criteria.

Each project solves a real infrastructure problem end-to-end. No frameworks, no toy demos — pure Node.js with full test suites.

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
| 15 | [MCP Server](15-mcp-server/) | Model Context Protocol server with tools, resources, and SQLite |
| 16 | [AI Coding Agent](16-ai-coding-agent/) | Mini Claude Code — issue → fix → test → self-correct → PR |
| 17 | [Voice Agent](17-voice-agent/) | Real-time voice pipeline with WebSocket streaming + turn management |
| 18 | [Workflow Engine](18-workflow-engine/) | DAG execution engine with 6 node types + conditional branching |
| 19 | [Agent Observability](19-agent-observability/) | Traces, cost tracking, quality scoring, drift detection + dashboard |
| 20 | [AI CLI Tool](20-ai-cli-tool/) | Zero-dependency CLI with commit/review/explain + token budget tracking |
| 21 | [Multi-Agent Coordinator](21-multi-agent-coordinator/) | Dynamic delegation with capability cards, message bus, escalation chains |
| 22 | [Context Window Optimizer](22-context-engineering/) | Token budgeting, source prioritization, assembly strategies for LLM context |
| 23 | [Long-Running Agent](23-long-running-agent/) | Durable execution with checkpoint/resume, crash recovery, budget enforcement |
| 24 | [LLM Gateway](24-llm-gateway/) | Production gateway with PII redaction, rate limiting, circuit breaker, cost tracking |
| 25 | [Zero-Trust Agent Executor](25-agent-executor/) | IAM-style policies for agent actions, sandboxed execution, audit trail |
| 26 | [Agent CI/CD Pipeline](26-agent-cicd/) | Eval suite on PR, faithfulness/safety/cost scoring, auto-promote/block |
| 27 | [Cost Attribution Engine](27-cost-attribution/) | Cost-per-outcome tracking, waste detection, ROI reporting per agent |
| 28 | [Compliance Audit Harness](28-compliance-audit/) | Every agent decision logged and replayable, EU AI Act ready, SOC2 traceable |
| 29 | [Self-Healing Agent Mesh](29-agent-mesh/) | Multi-agent failover, work redistribution, degraded mode fallback |

## How to Use

1. Pick a project that maps to your target role
2. Build it end-to-end — the evaluation criteria tell you when you're done
3. Put it on GitHub with a clear README

## Cross-References

Projects build on each other:
- **05 → 08**: Build the RAG pipeline first, then evaluate it with the eval harness
- **01/03 → 11**: Build an agent first, then optimize its cost
- **Any agent → 12**: Wrap any backend agent in the production chat UI
- **Any system → 07**: Test any LLM system against the injection test suite
- **Any model → 13**: Audit any model for bias before shipping
- **15 → 01/10**: MCP server pattern connects tools to any agent project
- **16 → 03/05**: Coding agent uses harness + RAG patterns from earlier projects
- **19 → 06/11**: Observability dashboard feeds into LLMOps and cost optimization
- **21 → 04/18**: Multi-agent coordinator builds on multi-agent patterns and workflow engine
- **22 → 02/05/11**: Context engineering integrates memory, RAG, and cost optimization into one pipeline
- **23 → 03/18/19**: Long-running agent uses harness patterns, workflow execution, and observability
