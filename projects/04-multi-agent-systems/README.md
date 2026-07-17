# Project 04: Multi-Agent Content Pipeline

A multi-agent system that produces a technical blog post through four specialized agents orchestrated by a supervisor.

## Architecture

```
  Topic
    │
    ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  Supervisor                               supervisor.js     │
  │  orchestrate, retry (max 2), cost tracking ($2 budget)      │
  └──────┬───────────────────────────────────────────────────────┘
         │ RESEARCH_REQUEST
         ▼
  ┌──────────────────────┐
  │  Researcher          │  web_search, fetch_url
  │  → structured notes  │  { key_claim, source_url, confidence }
  └──────┬───────────────┘
         │ RESEARCH_COMPLETE
         ▼
  ┌──────────────────────┐    REVISION_REQ     ┌────────────────┐
  │  Writer              │◂────────────────────┤  Supervisor    │
  │  → blog post draft   │   (feedback from    │  (retry gate)  │
  └──────┬───────────────┘    rejected review)  └───────▲────────┘
         │ DRAFT_COMPLETE                               │
         ▼                                              │
  ┌──────────────────────┐                              │
  │  Editor              │  score 7+/10 → ACCEPT        │
  │  accept / reject     │  score <7   → REJECT ────────┘
  └──────┬───────────────┘         REVIEW_COMPLETE
         │ ACCEPT
         ▼
  ┌──────────────────────┐
  │  Fact-Checker        │  verify claims vs. sources
  │  → PASS / FAIL       │
  └──────┬───────────────┘
         │ FACT_CHECK_COMPLETE
         ▼
  ┌──────────────────────┐
  │  Supervisor          │  assemble final report + cost breakdown
  │  → FINAL output      │
  └──────────────────────┘
         │
    ─────┼───────────────────────────────────
    Message Bus (messageBus.js)
    pub/sub by agent name, full ordered log
```

## Message Bus

Agents do not call each other's functions directly. Each agent (and the
supervisor) registers a handler with `bus.subscribe(channel, handler)`,
keyed by its own name. The supervisor only ever *publishes* — the bus
routes each message to whichever agent subscribed to `msg.to`, and that
agent's handler runs, does its work, and publishes the next message in
the chain. Every message is logged with sender, receiver, type, and
timestamp for full observability, regardless of which channel it went to.

Message types (and the subscriber they wake up):
- `RESEARCH_REQUEST` — Supervisor to Researcher (kicks off the pipeline)
- `RESEARCH_COMPLETE` — Researcher to Writer
- `DRAFT_COMPLETE` — Writer to Editor
- `REVIEW_COMPLETE` — Editor to Supervisor (carries the accept/reject verdict)
- `REVISION_REQ` — Supervisor to Writer (retry with feedback)
- `FACT_CHECK_REQUEST` — Supervisor to Fact-Checker
- `FACT_CHECK_COMPLETE` — Fact-Checker to Supervisor
- `FINAL` — Supervisor to output

## Running the Demo

```bash
# No dependencies required — pure Node.js
node src/demo.js

# Or with a custom topic
node src/demo.js "Write about WebSocket connection management in distributed systems"
```

The demo uses mock LLM responses to show the full pipeline flow including:
- The editor rejecting the first draft (score 5/10)
- The supervisor sending revision feedback to the writer
- The writer producing an improved second draft
- The editor accepting the revision (score 8/10)
- The fact-checker verifying 6/7 claims

## File Structure

```
src/
  supervisor.js       — Orchestrator with retry logic and cost tracking
  messageBus.js       — Inter-agent communication layer
  demo.js             — End-to-end demo runner
  agents/
    researcher.js     — Research agent (tools: web_search, fetch_url)
    writer.js         — Writing agent (no tools, pure generation)
    editor.js         — Editing agent (accept/reject with feedback)
    factChecker.js    — Verification agent (tool: fetch_url)
```

## Key Design Decisions

1. **Sequential pipeline, not parallel** — Each agent's output is the next agent's input. Parallelism is explored in the brief but deliberately avoided here because the agents have data dependencies.

2. **Supervisor as coordinator, not generator** — The supervisor never produces content. It decides when to retry and when to accept. This separation keeps the orchestration logic clean.

3. **Structured inter-agent contracts** — The researcher returns structured notes with `{ key_claim, source_url, confidence }`. This schema is what makes the writer's job tractable. Freeform text between agents breaks down fast.

4. **Cost tracking per agent** — Each agent reports token usage. The supervisor tracks cumulative cost and aborts if it exceeds the $2.00 budget.

5. **Retry with feedback** — When the editor rejects, the supervisor extracts the major issues and sends them as revision feedback to the writer over the bus (`REVISION_REQ`). The writer's system prompt includes instructions for handling revision requests.

6. **Pub/sub, not direct calls** — Agents never call each other's functions. Each agent (and the supervisor) calls `bus.subscribe(channelName, handler)` once at pipeline start. The supervisor only ever `bus.publish()`s; the bus looks up `msg.to` and invokes whichever handler(s) subscribed to that channel. This means the bus is load-bearing — remove a `subscribe` call and that stage of the pipeline goes silent, rather than the bus being a passive log sink beside direct calls.

7. **Content-derived editor scoring** — The editor's ACCEPT/REJECT verdict is computed from the draft itself: word count vs. the 800-1200 target, number of code blocks, number of section headers, presence of concrete before/after benchmark numbers, and whether the draft has both an intro and a takeaways/conclusion section. A draft scoring 7+/10 is accepted; anything lower is rejected with the specific issues that dragged the score down. There is no dependency on which attempt number it is.

