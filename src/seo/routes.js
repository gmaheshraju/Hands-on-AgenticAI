// Single source of truth for per-route SEO metadata.
// Consumed at build time by scripts/prerender.mjs to emit a distinct HTML
// document, canonical URL and sitemap entry for every route.

export const SITE_URL = 'https://curiousengineers.in';
export const AUTHOR = 'Mahesh Guntumadugu';
export const OG_IMAGE =
  'https://raw.githubusercontent.com/gmaheshraju/Hands-on-AgenticAI/main/docs/diagrams/agent-architecture.png';

const suffix = ` | ${AUTHOR}`;

// `priority` and `changefreq` feed sitemap.xml. Blog posts rank highest
// because they carry the agentic-AI positioning.
export const ROUTES = [
  {
    path: '/',
    title: 'Agentic AI Playbook — Production Architecture for AI Agents',
    description:
      'Production architecture patterns for AI agents, RAG pipelines, and LLM systems — with real-world architecture diagrams and decision frameworks.',
    priority: '1.0',
    changefreq: 'weekly',
  },
  {
    path: '/blog',
    title: 'Agentic AI Playbook — All Posts',
    description:
      'Sixteen deep-dive posts on production AI engineering: agent design, memory, RAG, LLMOps, guardrails, evaluation, and cost engineering.',
    priority: '0.9',
    changefreq: 'weekly',
  },

  // ── Agentic AI posts ────────────────────────────────────────────────────
  {
    path: '/blog/ai-agent-system-design',
    title: 'AI Agent System Design',
    description:
      'RAG pipelines, vector databases, function calling, evaluation loops — the full architecture of a production AI agent from ingestion to response.',
  },
  {
    path: '/blog/agent-memory-architecture',
    title: 'Agent Memory Architecture',
    description:
      'Semantic vs episodic memory, context window management, retrieval patterns — how agents remember across sessions.',
  },
  {
    path: '/blog/agent-harness-loop-engineering',
    title: 'Agent Harness & Loop Engineering',
    description:
      'Orchestration loops, tracing, self-improvement, error recovery — the infrastructure that turns a prompt into a reliable agent.',
  },
  {
    path: '/blog/multi-agent-systems',
    title: 'Multi-Agent Systems',
    description:
      'Agent teams vs swarms, delegation patterns, shared memory, and when a single agent beats multi-agent — and vice versa.',
  },
  {
    path: '/blog/rag-pipeline-deep-dive',
    title: 'RAG Pipeline Deep Dive',
    description:
      'Chunking strategies, embedding models, hybrid search, reranking — building retrieval that actually works in production.',
  },
  {
    path: '/blog/llm-ops',
    title: 'LLMOps — Production LLM Infrastructure',
    description:
      'Model serving, cost routing, token budgeting, latency SLOs — the infrastructure that turns an LLM prototype into a system handling 10M requests a day.',
  },
  {
    path: '/blog/ai-guardrails',
    title: 'AI Guardrails & Safety',
    description:
      'Prompt injection defense, PII filtering, output validation, content moderation — the security layer that separates a demo from production.',
  },
  {
    path: '/blog/evaluation-engineering',
    title: 'Evaluation Engineering',
    description:
      'LLM-as-judge, golden datasets, regression testing, human-in-the-loop — how to know if your AI system works, and catch when it silently breaks.',
  },
  {
    path: '/blog/fine-tuning-vs-rag',
    title: 'Fine-tuning vs Prompting vs RAG',
    description:
      'The decision framework every AI architect needs — when to prompt engineer, when to retrieve, when to fine-tune, and when to combine them.',
  },
  {
    path: '/blog/tool-use-function-calling',
    title: 'Tool Use & Function Calling Patterns',
    description:
      'The engineering of reliable tool dispatch — schema design, validation, retry logic, permission models, and sandboxing.',
  },
  {
    path: '/blog/cost-latency-engineering',
    title: 'Cost & Latency Engineering for LLM Systems',
    description:
      'Your agent costs $2 per conversation and your boss wants $0.15. Model routing, semantic caching, prompt compression, and the metrics that matter.',
  },
  {
    path: '/blog/ai-ux-patterns',
    title: 'AI UX Patterns',
    description:
      'Streaming, confidence indicators, human-in-the-loop flows, error states — the product engineering that makes AI feel trustworthy.',
  },
  {
    path: '/blog/responsible-ai',
    title: 'Responsible AI & Governance',
    description:
      'Bias detection, fairness metrics, red-teaming, model cards, EU AI Act — the governance that lets you ship AI without legal landmines.',
  },
  {
    path: '/blog/forward-deployed-engineering',
    title: 'Forward Deployed Engineering',
    description:
      'The Palantir-pioneered model reshaping AI delivery — embedded engineers, demo-driven development, and the gravel-to-highway playbook.',
  },
  {
    path: '/blog/context-engineering',
    title: 'Context Engineering',
    description:
      'The discipline replacing prompt engineering — what goes into the context window, in what order, with what token budget, and why getting it wrong silently kills performance.',
  },
  {
    path: '/blog/solo-developer-advantage',
    title: 'The Solo Developer Advantage',
    description:
      'Why one developer with AI beats a team of twenty — and how engineers anywhere in the world are building products that compete with giants.',
  },

  // ── System design playbook ──────────────────────────────────────────────
  {
    path: '/home',
    title: 'System Design Playbook',
    description:
      'Battle-tested decision frameworks and architectural patterns for building production systems at scale.',
    priority: '0.8',
  },
  {
    path: '/database-selection',
    title: 'Database Selection',
    description:
      'The 6-question decision tree that reflects deep systems understanding. Each question narrows the field until one database is left standing.',
  },
  {
    path: '/rate-limiter',
    title: 'Rate Limiter Design',
    description:
      'Before picking an algorithm, answer: what are you protecting, who are you limiting, and what happens when a request is rejected?',
  },
  {
    path: '/caching',
    title: 'Caching Strategies',
    description:
      "Caching is easy to add and hard to get right. The question isn't whether to cache — it's what to cache, when to invalidate, and who wins on a miss.",
  },
  {
    path: '/message-queues',
    title: 'Message Queue Selection',
    description:
      '"Just use Kafka" is the queue equivalent of "just use DynamoDB." Answer the ordering, durability, and replay questions first.',
  },
  {
    path: '/scaling',
    title: 'Scaling Playbook',
    description:
      'Scaling is a progression, not a choice. Each step adds complexity and solves one specific bottleneck — in a specific order.',
  },
  {
    path: '/event-driven',
    title: 'Event-Driven Architecture',
    description:
      "Events decouple producers from consumers, but they don't decouple you from thinking about ordering, idempotency, and delivery guarantees.",
  },
  {
    path: '/state-machines',
    title: 'State Machines & Workflows',
    description:
      'Every production outage you remember involved state. A payment stuck in "processing," an order both "cancelled" and "shipped."',
  },
  {
    path: '/api-design',
    title: 'API Design',
    description:
      'An API is a published promise. Once a client depends on it, every field name, status code, and error shape becomes a contract you own.',
  },
  {
    path: '/resilience',
    title: 'Resilience Patterns',
    description:
      'Distributed systems fail constantly. The question is never "will it break?" but "when it breaks, does the user notice?"',
  },
  {
    path: '/observability',
    title: 'Self-Healing & Observability',
    description:
      'Observability is not dashboards. It is the ability to ask arbitrary questions about production without shipping new code to answer them.',
  },
  {
    path: '/auth',
    title: 'Auth Architecture',
    description:
      'Authentication and authorization are the two pillars every system rests on, yet most engineers conflate them until something breaks.',
  },
  {
    path: '/deployment',
    title: 'Deployment Strategies',
    description:
      'Deployment is where engineering meets organizational maturity. The question is not "how do we push code" but "how do we push it safely."',
  },
  {
    path: '/concurrency',
    title: 'Concurrency & Performance',
    description:
      'Performance work without concurrency control is just faster bugs. The hard problems are correctness under parallelism, not raw speed.',
  },
  {
    path: '/distributed-systems',
    title: 'Distributed Systems',
    description:
      'Distributed systems fail in ways monoliths never will. The network is unreliable, clocks drift, and nodes crash mid-write.',
  },
];

// Full <title> for a route: bare title on the homepage, suffixed elsewhere so
// every SERP entry still carries the name being searched for.
export function fullTitle(route) {
  return route.path === '/'
    ? `${AUTHOR} — Agentic AI Engineer | 31 Production LLM & Agent Projects`
    : `${route.title}${suffix}`;
}

export function canonicalFor(route) {
  return route.path === '/' ? `${SITE_URL}/` : `${SITE_URL}${route.path}`;
}
