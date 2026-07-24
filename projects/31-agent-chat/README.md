# Agent Observability from Scratch — Decision-Quality Tracing for LLM Agents (Zero Frameworks)

> **Most agent tracing tells you the run was *slow*. It can't tell you the run was *dumb*.**
> Span-and-waterfall tracing (the LangSmith / Langfuse / OpenTelemetry model) measures **latency** — how long each step took. It says nothing about whether the agent made **good decisions**. This project traces the thing that actually matters: **decision quality**. It scores whether each tool call earned its cost, whether the reasoning stayed coherent, and how confident the agent really was — in **pure Node.js + SQLite, no frameworks, no dependencies beyond Express and better-sqlite3.**

A full-stack AI agent chat app whose headline feature is **agent-first observability**: instead of infrastructure spans, it produces a per-run **report card** — Tool ROI, Reasoning Coherence, Decision Productivity, Confidence Signals, and Strategy Classification — persisted to SQLite and rendered in a run inspector. Built to be the reference implementation for *"how do I measure whether my agent is actually reasoning well?"*

---

## TL;DR

- **What it is:** An LLM agent (streaming reasoning + tool use) with a built-in **decision-quality observability layer**.
- **Why it's different:** It scores **decisions**, not spans. Tool ROI, coherence, and confidence — not just tokens and milliseconds.
- **Stack:** Pure Node.js, vanilla-JS frontend, SQLite (WAL + FTS5). Two runtime deps: `express`, `better-sqlite3`. Everything else — the observability engine, the rate limiter, the streaming adapter — is hand-rolled and readable.
- **LLM providers:** Ollama (local), NVIDIA, Gemini — hot-swappable per conversation.
- **Tested & hardened:** 39 tests. Per-IP rate limiting, CSP, input caps, graceful shutdown. Safe to expose publicly.

---

## How do you measure an AI agent's decision quality?

You measure it by scoring each **decision** the agent makes — not each span it emits. This project computes five signals per run:

| Metric | One-line definition | How it's computed |
|--------|---------------------|-------------------|
| **Tool ROI** | The fraction of tool calls whose results measurably informed the final answer. | Bigram (n-gram) overlap between each tool result and the final answer, with stop-word filtering. A tool that returned "No results found" scores 0; a tool whose content shows up in the answer scores high. |
| **Reasoning Coherence** | Whether each decision builds on the previous one instead of wandering. | Term-overlap between consecutive reasoning steps, normalized to 0–1. Sudden topic jumps drop the score. |
| **Decision Productivity** | Per decision: was it *productive* (advanced the answer) or *wasted* (dead end)? | A decision is productive if its tool result was used (ROI above threshold) or it produced the final answer; wasted otherwise. |
| **Confidence Signals** | The agent's own epistemic state, extracted from its reasoning text. | Pattern-matching the thought text for `hedging`, `confident`, `uncertain`, `seeking_info`, `ready_to_answer`. |
| **Strategy Classification** | The shape of the run: `direct`, `single_tool`, `multi_tool`, or `iterative`. | Derived from the count and repetition of tool calls. |

Every run ends with a persisted **report card** carrying these scores, plus tokens, latency, and outcome. A user feedback loop (👍/👎) is stored alongside, so you can correlate *measured* decision quality against *perceived* answer quality.

## Decision-quality observability vs. span-based tracing

This is the core distinction, and the reason this repo exists:

| | **Span-based tracing** (LangSmith, Langfuse, OTel) | **Decision-quality tracing** (this project) |
|---|---|---|
| Primary question | "How long did each step take?" | "How good was each decision?" |
| Unit of observation | Span (a timed operation) | Decision (a reasoning step + its action) |
| Tool calls | Recorded with duration | **Scored** — did the result actually get used? (Tool ROI) |
| Reasoning | Logged as text | **Scored** for coherence across steps |
| Confidence | Not captured | Extracted from the agent's own words |
| "Wasted work" | Invisible unless slow | Explicitly flagged (wasted vs. productive decisions) |
| Verdict | Tells you the run was slow | Tells you the run was **dumb** — and where |

Span tracing and decision-quality tracing are complementary. This project is the missing half.

## Why build agent observability without a framework?

Because the scoring logic is ~200 lines and reading it teaches you more than any dashboard. The entire observability engine lives in one file (`src/tracer.js`) as an `AgentObserver` → `AgentRun` → `DecisionHandle` chain. There's no vendor SDK, no OTel collector, no external service. You can read exactly how Tool ROI is computed, change the threshold, and see the number move. For learning — and for staff/principal-level system-design interviews on *"design an agent observability system"* — the from-scratch version is the point.

---

## Quick start

```bash
cd projects/31-agent-chat
npm install

# Local, free, no API key — start Ollama:
ollama serve &
ollama pull llama3.2:3b

node src/server.js
# → http://localhost:3001
```

No Ollama? Use a hosted provider instead — set `NVIDIA_API_KEY` or `GEMINI_API_KEY` and pick it from the sidebar dropdown.

```bash
npm test   # 39 tests, no network required
```

## What else it does (beyond observability)

The observability layer sits on top of a genuinely production-shaped agent:

- **Streaming reasoning** — two-phase loop: JSON-mode reasoning/tool-selection (Phase 1) streams as collapsible thinking blocks; the final answer streams token-by-token (Phase 2). Tool executions render as live cards in between.
- **Stream reconnection** — refresh the page mid-generation and it resumes. The server buffers SSE events per message and replays them to late-joining clients; thread state lives in SQLite and the URL hash.
- **Conversation branching** — every message has a `parent_id`, forming a git-like tree. Edit any message to fork; a `< 1/3 >` switcher walks the branches. No separate checkpoint table — the message *is* the checkpoint.
- **Cross-session memory** — facts extracted from tool results are stored in SQLite FTS5 and surfaced into later conversations.
- **Guardrails** — prompt-injection detection and PII redaction on input and output.
- **Tool intelligence** — the agent records which tools helped which query patterns, and feeds those lessons back into future runs.

## Production hardening

Safe to put on the public internet — all dependency-free:

| Concern | Mitigation |
|---------|-----------|
| Abuse / cost blowup | Per-IP fixed-window rate limiter; split buckets (300 reads/min, 20 writes/min — writes spawn LLM work) |
| Resource exhaustion | Global concurrency cap (20 simultaneous agent runs → `503`) |
| XSS | Frontend escapes **before** applying markdown; strict CSP |
| Header attacks | CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` |
| Oversized input | 8k-char message cap (`413`), 64kb JSON body cap |
| Data loss on deploy | SIGTERM/SIGINT graceful shutdown: drains in-flight streams, checkpoints SQLite WAL |

## Architecture

```
┌──────────────────────── BROWSER (vanilla JS) ────────────────────────┐
│  Chat UI · Streaming reasoning · Tool cards · Branch switcher         │
│  Run Inspector ── shows the decision report card (ROI / coherence)   │
│                          │ SSE (buffered + replayable)                │
└──────────────────────────┼───────────────────────────────────────────┘
┌──────────────────────────▼──── EXPRESS SERVER ───────────────────────┐
│  Rate limiter · CSP · Thread/branch CRUD · Stream manager             │
│  Agent (async generator: reason → tool → stream)                     │
│      └── AgentObserver ── scores every decision, writes report card  │
│  LLM Adapter (streaming) — Ollama NDJSON · NVIDIA/Gemini SSE         │
│  SQLite (WAL) — threads · messages(tree) · agent_runs · decisions    │
│                 · feedback · facts(FTS5)                              │
└───────────────────────────────────────────────────────────────────────┘
```

## File map

| File | Purpose |
|------|---------|
| `src/tracer.js` | **The observability engine** — `AgentObserver`/`AgentRun`/`DecisionHandle`, all five scores |
| `src/agent.js` | Two-phase agent loop as an async generator yielding SSE events |
| `src/llm.js` | Multi-provider streaming adapter: `chat()` + `chatStream()`, timeouts, fallback, JSON-retry |
| `src/db.js` | SQLite schema + CRUD: message tree, agent runs, decisions, feedback, FTS5 facts |
| `src/middleware.js` | Dependency-free security headers + per-IP rate limiter |
| `src/streams.js` | Stream manager: buffer, replay on reconnect, abort, concurrency count |
| `src/guardrails.js` | Prompt-injection detection + PII redaction |
| `src/server.js` | Express wiring, SSE endpoints, graceful shutdown |
| `public/app.js` | Chat UI, SSE handler, run inspector, branch switcher, feedback buttons |
| `tests/` | 39 tests: observer scoring, feedback, DB, rate limiter, headers |

## FAQ

**Is this a LangChain / LangGraph alternative?**
No — it's smaller and narrower on purpose. It's a from-scratch reference for the one thing those frameworks under-serve: measuring agent **decision quality**. You could port the `AgentObserver` scoring into a LangGraph app.

**How is Tool ROI actually calculated?**
Bigram overlap between each tool's result text and the final answer, after removing stop words. If the answer reuses the tool's content, ROI is high; if the tool returned nothing usable, ROI is 0. See `_computeToolRelevance()` in `src/tracer.js`. It replaced naive substring matching, which gave false zeros.

**Does it need a GPU or paid API?**
No. It runs fully local and free on Ollama with a 3B model. Hosted NVIDIA/Gemini free tiers work too.

**Why SQLite instead of Postgres/Redis?**
WAL mode handles concurrent reads during streaming; FTS5 powers fact search; zero config; survives crashes. The whole observability store is a couple of tables.

**Why no React?**
The frontend is vanilla JS with no build step. For a chat UI, the DOM API is enough, and it loads instantly.

**Can I use just the observability layer?**
Yes. `src/tracer.js` depends only on the DB interface. Wire `startRun` / `recordDecision` / `attachToolResult` / `end` around your own agent loop.

---

## Keywords

agent observability · LLM agent observability · agent decision quality · tool ROI · reasoning coherence · agent evaluation · agent tracing without a framework · decision-quality tracing vs span-based tracing · build an AI agent from scratch in Node.js · SQLite agent memory · streaming reasoning · SSE agent chat · conversation branching · LangGraph alternative · agent report card · confidence signal extraction
