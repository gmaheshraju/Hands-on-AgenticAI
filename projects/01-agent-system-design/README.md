# PR Review Agent

A ReAct-pattern agent that reviews GitHub Pull Requests and produces structured code review findings.

## Architecture

```
PR URL → Agent Loop (ReAct) → Structured Findings (JSON)
              ↕
         Tool Layer
    ┌────────────────────┐
    │ fetchPR            │  PR metadata (title, author, files)
    │ fetchDiff          │  Unified diff of all changes
    │ fetchFile          │  Full file contents for context
    │ searchCode         │  Grep for symbols/callers/patterns
    │ postComment        │  Post findings back to the PR
    └────────────────────┘
```

### ReAct Loop

The agent follows the Observe-Think-Act cycle:

1. **Observe** — tool results are injected as observations
2. **Think** — the LLM reasons about what to investigate next
3. **Act** — the LLM calls a tool or emits FINISH with findings

Safety rails:
- **Iteration cap** (default 15) prevents runaway loops
- **Stall detection** stops after 2 identical consecutive observations
- **Token tracking** estimates cost per review
- **Output validation** ensures findings match the schema
- **Deduplication** groups identical issues across files

### Structured Output

Every finding has: `file`, `line`, `severity`, `category`, `issue`, `suggestion`, and optional `groupedFiles` for deduplicated patterns.

## Quick Start

### Demo Mode (no API keys needed)

```bash
node src/demo.js
```

Runs the full ReAct loop with mock data simulating a PR that adds an authentication endpoint. The mock LLM walks through 7 tool calls and produces 8 findings including hardcoded secrets, plaintext passwords, and null reference bugs.

### Live Mode

```bash
export GITHUB_TOKEN=ghp_your_token
export LLM_API_KEY=sk-your-key
export LLM_PROVIDER=anthropic  # or openai

node src/review.js https://github.com/org/repo/pull/42
```

## File Structure

```
src/
  agent.js      — ReAct loop: parse responses, execute tools, track iterations
  tools.js      — Tool definitions with GitHub API implementations
  schema.js     — Finding schema, validation, deduplication, sorting
  mock-data.js  — Realistic mock PR data (auth endpoint with planted bugs)
  demo.js       — Demo runner (mock LLM, no API keys)
  review.js     — Live runner (real GitHub API + real LLM)
```

## Design Decisions

**Why build the ReAct loop from scratch?**
Frameworks like LangChain add abstraction that hides the interesting parts. The loop is ~150 lines — the parsing, stall detection, and iteration cap are the design, not boilerplate to hide.

**Why prioritize files?**
A 50-file PR can't be fully read within 15 tool calls. The agent's system prompt teaches it to prioritize security-critical files, skip generated code, and use the diff to identify which files need full-context reads.

**Why structured output?**
JSON findings can be posted as PR comments, fed into dashboards, or used to block CI. Free-text reviews can't be acted on programmatically.

**Why deduplication?**
"Missing error handling" in 4 files is one finding with `groupedFiles`, not four findings. This matches how a human reviewer thinks.

## Interview Talking Points

- The ReAct loop is the core pattern for tool-using agents. Understanding observation→thought→action is more valuable than knowing any framework.
- Iteration caps and stall detection are production concerns that separate toy demos from real systems.
- The tool layer is a clean abstraction boundary — swap GitHub for GitLab by changing tool implementations, not the agent logic.
- Structured schemas let findings flow into CI/CD pipelines, not just chat windows.
- Token tracking enables cost budgets per review — essential when running on every PR in a busy repo.
