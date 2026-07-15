# Project 04: Multi-Agent Content Pipeline

A multi-agent system that produces a technical blog post through four specialized agents orchestrated by a supervisor.

## Architecture

```
                    +------------+
                    | Supervisor |
                    +-----+------+
                          |
          +---------+-----+-----+-----------+
          |         |           |           |
     Researcher   Writer     Editor    Fact-Checker
     (search,     (generate  (review,  (verify claims
      fetch)       draft)    accept/   against sources)
                             reject)
```

**Pipeline flow:**

1. **Researcher** decomposes the topic, searches sources, produces structured notes
2. **Writer** takes research notes and produces a blog post draft
3. **Editor** reviews the draft — ACCEPT or REJECT with feedback
4. If rejected, the **Supervisor** sends feedback back to the Writer (up to 2 retries)
5. Once accepted, **Fact-Checker** verifies every technical claim against sources
6. Supervisor assembles the final report

## Message Bus

All inter-agent communication flows through a shared message bus. Every message is logged with sender, receiver, type, and timestamp for full observability.

Message types:
- `RESEARCH_NOTES` — Researcher to Supervisor
- `DRAFT` — Writer to Supervisor
- `EDIT_REVIEW` — Editor to Supervisor
- `REVISION_REQ` — Supervisor to Writer (retry with feedback)
- `FACT_CHECK` — Fact-Checker to Supervisor
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

5. **Retry with feedback** — When the editor rejects, the supervisor extracts the major issues and sends them as revision feedback to the writer. The writer's system prompt includes instructions for handling revision requests.

## Interview Angle

"I built a 4-agent content pipeline: researcher, writer, editor, fact-checker. The most interesting finding was that agent handoff quality depends almost entirely on the output schema of the upstream agent. When the researcher returned structured notes with source URLs and key claims, the writer produced dramatically better drafts than when it got freeform text. Inter-agent contracts matter more than individual agent quality."
