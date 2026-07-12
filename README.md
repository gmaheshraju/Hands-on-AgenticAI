# Agentic Engineering

**Decision frameworks and architectural patterns for staff, principal, and CTO-level system design interviews.**

Built by [Mahesh Guntumadugu](https://curiousengineers.in) — battle-tested patterns from 60+ real interviews at Uber, Google, Amazon and 100+ mock system design rounds.

> Not theory. Not slides. Interactive decision trees with the exact reasoning chains that signal senior+ thinking.

---

## What's Inside

### System Design Frameworks (14)

Each framework is a **decision tree** — the structured thinking process that interviewers look for at staff+ level.

| # | Framework | Key Decisions |
|---|-----------|--------------|
| 01 | **Database Selection** | Scale → Access pattern → Joins → Consistency → Writes → Profiles |
| 02 | **Rate Limiter Design** | Token bucket vs sliding window vs leaky bucket, distributed coordination |
| 03 | **Caching Strategies** | Cache-aside vs write-through, invalidation, thundering herd |
| 04 | **Message Queues** | At-least-once vs exactly-once, ordering, dead letter queues |
| 05 | **Scaling Patterns** | Vertical vs horizontal, sharding strategies, read replicas |
| 06 | **Event-Driven Architecture** | Event sourcing, CQRS, saga patterns, idempotency |
| 07 | **State Machines** | Workflow orchestration, distributed state, compensation |
| 08 | **API Design** | REST vs GraphQL vs gRPC, versioning, pagination, rate limiting |
| 09 | **Resilience Patterns** | Circuit breakers, bulkheads, retries with backoff, chaos engineering |
| 10 | **Observability** | Metrics vs logs vs traces, SLOs, alerting strategies |
| 11 | **Auth Architecture** | OAuth2, JWT, session management, RBAC vs ABAC |
| 12 | **Deployment Strategies** | Blue-green, canary, feature flags, rollback patterns |
| 13 | **Concurrency** | Locks, optimistic concurrency, actor model, async patterns |
| 14 | **Distributed Systems** | CAP theorem, consensus, vector clocks, CRDTs |

### AI Engineering Playbook (5 deep dives)

Production architecture patterns for building AI agents, RAG pipelines, and LLM systems.

| # | Topic | What You'll Learn |
|---|-------|-------------------|
| 01 | **AI Agent System Design** | ReAct loops, tool dispatch, RAG pipelines, eval harnesses |
| 02 | **Agent Memory Architecture** | Procedural/semantic/episodic memory, consolidation gates, context management |
| 03 | **Agent Harness & Loop Engineering** | Orchestration loops, tracing, convergence detection, cost caps |
| 04 | **Multi-Agent Systems** | Teams vs swarms, supervisor patterns, delegation, coordination |
| 05 | **RAG Pipeline Deep Dive** | Chunking, embeddings, hybrid search, RRF scoring, reranking |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React 19 + Vite                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Home   │  │  14 Framework│  │  5 AI Engg   │  │
│  │   Page   │  │    Pages     │  │  Blog Posts   │  │
│  └──────────┘  └──────────────┘  └──────────────┘  │
│        │              │                │            │
│  ┌─────┴──────────────┴────────────────┴──────┐     │
│  │          Shared Components                  │     │
│  │  Decision · Insight · CodeBlock · TabNav   │     │
│  │  PageTransition · TabTransition · FadeIn   │     │
│  └────────────────────────────────────────────┘     │
│                                                     │
│  ┌────────────────────────────────────────────┐     │
│  │           Design System (CSS)              │     │
│  │  Fluid typography · Responsive grid        │     │
│  │  Dark/Light theme · Page transitions       │     │
│  │  Micro-interactions · prefers-reduced-motion│     │
│  └────────────────────────────────────────────┘     │
│                                                     │
├─────────────────────────────────────────────────────┤
│  Cloudflare Pages · SPA routing · Global CDN        │
└─────────────────────────────────────────────────────┘
```

---

## Tech Stack

- **React 19** — latest React with automatic batching
- **Vite** — sub-second HMR, optimized builds
- **React Router v7** — client-side routing with page transitions
- **CSS Custom Properties** — full design system with fluid typography via `clamp()`
- **Zero dependencies** — no UI library, no CSS framework, no syntax highlighter
- **Responsive** — mobile (375px) → tablet (768px) → desktop (1400px+)
- **Dark/Light theme** — system preference detection + manual toggle
- **Cloudflare Pages** — global CDN, auto-deploy from GitHub

## Design Highlights

- **Page transitions** — fade/slide animation on route changes
- **Tab crossfade** — smooth content transitions when switching tabs
- **Staggered animations** — Decision cards animate in with nth-child delays
- **Fluid typography** — titles scale from 28px to 44px via `clamp()`
- **Animated hover states** — cards lift, underlines slide, arrows shift
- **`prefers-reduced-motion`** — all animations respect user preference

---

## Run Locally

```bash
git clone https://github.com/gmaheshraju/Hands-on-AgenticAI.git
cd Hands-on-AgenticAI
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Deploy

Connected to **Cloudflare Pages** with auto-deploy:

- Build command: `npm run build`
- Output directory: `dist`
- SPA routing handled by `public/_redirects`

---

## License

MIT

---

**Built by Mahesh Guntumadugu** — [curiousengineers.in](https://curiousengineers.in)
