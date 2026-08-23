# Improvement Backlog

Prioritized findings from the 2026-08-23 full-content review (3 parallel reviewers, all 16 posts).
The daily-playbook-improvement task should pick the TOP unchecked item that fits its rotation rule,
do it well, check it off in the same commit. One item per day. P0 items were fixed 2026-08-23
(commits 373309c..fedca88).

## P1 — Stale content (2024-era presented as current)

- [ ] **RagDeepDive** embeddings section (~L325-347): `text-embedding-3-large` as "the default choice", Cohere embed-v3, BGE-large. Refresh to current MTEB leaders (gemini-embedding-001, voyage-3-large, voyage-code-3, Qwen3-Embedding, Cohere embed-v4) + note code/multimodal-specific embedders.
- [ ] **RagDeepDive** reranker section (~L435-443): Cohere Rerank pricing stale, "Claude/GPT-4" as LLM-reranker. Refresh to Rerank 3.5, bge-reranker-v2-m3, ColBERT-style late interaction.
- [ ] **FineTuningVsRag** — stalest post overall: "student can't exceed teacher" (~L554) is wrong in 2026 (distillation + RL beats teacher on narrow tasks); decision tree has no long-context/prompt-caching branch; A100-era hardware; GPT-4o-mini pricing; overstates Anthropic API fine-tuning availability (~L534). No DPO/GRPO coverage.
- [ ] **AgentMemory** (~L305): "128K-200K tokens for modern models" — 1M windows ship now. Also L554 pricing. Reconcile the soft-delete (L471) vs GDPR hard-delete (L576) contradiction with one clause on tombstoning vs erasure.
- [ ] **AiUxPatterns**: TTFT table names GPT-4o/Claude 3.5/Gemini 1.5/Llama 3 (code L88-92); "GPT-4 hallucinates 3-5%" (L621); hardcoded Anthropic rate limits (L729); per-model timeouts ignore extended thinking (L727). Replace model tables with tier-based rules.
- [ ] **ResponsibleAi**: two sections datestamped "as of mid-2025" (L438, L466-469); EU AI Act timeline missing GPAI Code of Practice + Digital Omnibus delay proposal (L426-430); model card example claims "Claude Sonnet fine-tuned with LoRA" — not offered on first-party API (L107-128, switch to an open-weights model).
- [ ] **AgentSystemDesign**: GPT-4-as-current in diagram (L289), anti-pattern (L807), parallel-tool-calls claim (L622). Reframe around reasoning-vs-fast tiering.
- [ ] **ContextEngineering**: "2027" future-tense framing (L616, L638) reads stale-in-reverse; ContextBudgetPanel built on GPT-4 128K example (L408) while another tab discusses 1M. Rebase example on 200K/1M.
- [ ] **LlmOps**: bare model aliases ('claude-haiku') contradict the post's own pin-your-snapshots advice (L675-686 vs L30/L68/L100/L145); self-hosting math on 8xA100 + Llama 70B (L507-511); 200K hardcoded context for all models (L100).
- [ ] **MultiAgentSystems**: L590 contradicts L367/L413 on whether Deep-Research-style systems fear missing vs fear being wrong; refresh swarm exemplar to 2026 systems.
- [ ] **SoloDeveloperAdvantage**: Midjourney "$200M / 40 employees" 2023 stat (L241, L585); AI-team grid names no actual 2026 tooling (Claude Code, Cursor, agent SDKs, MCP).

## P2 — Content gaps (highest interview value first)

- [ ] **MCP — the #1 site-wide gap** (named once meaningfully across 16 posts). Split across days:
  - [ ] ToolUseFunctionCalling: "MCP & tool distribution" Decision on Schema Design tab (server vs client, tools/list drift, tool poisoning, confused deputy).
  - [ ] AgentSystemDesign: MCP as the tool-interface layer + code-mode/programmatic tool calling in architecture.
  - [ ] MultiAgentSystems: capability cards → MCP discovery / A2A agent cards Decision.
  - [ ] AiGuardrails: MCP supply-chain trust (third-party servers, tool-description poisoning).
- [ ] **Prompt injection depth** (AiGuardrails + ToolUseFunctionCalling): lethal trifecta (private data + untrusted content + exfiltration channel), indirect injection via tool results, CaMeL/dual-LLM patterns. ToolUse subtitle promises this and never delivers.
- [ ] **EvalEngineering**: judge biases beyond position (self-enhancement, verbosity); "what if judge = generator" answer; named frameworks (Braintrust, LangSmith, Ragas, DeepEval, Inspect); pin judge model snapshots; reasoning-model-as-judge tradeoff.
- [ ] **ContextEngineering**: prompt-cache mechanics CodeBlock (breakpoints, TTL, cache-write vs read pricing, frozen prefix + moving tail). ProductionPatternsPanel has no CodeBlock.
- [ ] **CostLatencyEngineering**: Batch API (50% off), cache-write premium + TTL choice, context editing/compaction, distillation levers; `latency-budget.js` CodeBlock for Tab 4; reconcile the three inconsistent headline savings numbers (83%/77%/66%).
- [ ] **AiUxPatterns**: reasoning-model UX (thinking disclosure, interruptibility), long-running/async agent UX, streaming tool-use UI.
- [ ] **AgentSystemDesign**: extended-thinking-vs-more-iterations Decision; hybrid-search CodeBlock for RagPanel; LLM-judge rubric CodeBlock for EvalsPanel; cross-link RagDeepDive + EvalEngineering instead of restating them.
- [ ] **AgentHarness**: retry/fallback-chain CodeBlock for ErrorPanel; promote hooks + MCP into the harness-components list.
- [ ] **RagDeepDive**: sparse-vector hybrid (SPLADE), pre- vs post-filtering Decision; promote agentic RAG to its own tab with multi-hop CodeBlock.
- [ ] **ForwardDeployedEngineering**: frontier-lab FDE orgs (OpenAI/Anthropic stood up their own — the reason the role is hot); MCP-as-connector + VPC/BYOC/zero-retention deployment mechanics.
- [ ] **ResponsibleAi**: runtime guardrail stack Decision (NeMo Guardrails, Llama Guard, Guardrails AI, Bedrock/Azure guardrails, OWASP LLM Top 10, NIST AI 600-1) + cross-links to /blog/ai-guardrails.
- [ ] **MultiAgentSystems**: `checkpointed-orchestrator.js` CodeBlock for the durable-execution Decision.
- [ ] **SoloDeveloperAdvantage**: cost-model CodeBlock backing the $1M-team vs $2K-stack comparison.

## P3 — Quality polish

- [ ] Unsourced precision numbers across ToolUse ("95%", "30%+", "6x", "99.99%"), AgentSystemDesign ("15-30%", "60%"), AgentHarness ("80-90%") — mark as illustrative or cite a benchmark (τ-bench, BFCL, BEIR).
- [ ] LlmOps ↔ CostLatency heavy duplication (both define MODEL_ROUTER_CODE): make LlmOps the infra/serving post, delegate cost detail, add cross-links.
- [ ] AiGuardrails: regex Layer-1 false-positive cost (`/jailbreak/i` blocks legitimate queries on an AI blog); split sandboxing into its own tab; align L618 judge models with the code at L281.
- [ ] AgentMemory: dedupe the three-pillars framing (stated 3x in one tab); verify Claude Code memory description against current docs; replace the obscure "Hermes/SOUL.MD" reference.
- [ ] SoloDeveloperAdvantage L598: "31 projects" count unlinked — link the GitHub repo.
- [ ] AgentSystemDesign L788: "his 107k-view video" — drop the view count.
