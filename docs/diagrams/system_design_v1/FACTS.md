# FACTS — 01-agent-system-design (L1 — space, extracted 2026-08-24)

Source of truth: `projects/01-agent-system-design/`. **Every element in the diagram appears below with a `file:line` citation. The diagram may contain nothing that is not on this page, and this page may contain nothing without a citation.** Any README ASCII diagram in the project was treated as a CLAIM, not as evidence.

**Generated** from the structured extraction, not transcribed. All citations machine-verified by `_harness/verify_facts.py` against the source tree.

## What this project is

A ReAct-pattern agent (Observe/Think/Act) that walks a set of PR-inspection tools — fetchPR, fetchDiff, fetchFile, searchCode, postComment — either against mock fixtures (demo.js) or the real GitHub + LLM APIs (review.js), and emits a validated, deduplicated, severity-sorted JSON array of code-review findings.

## Altitude

L1 = the modules/processes and the external services they cross a network boundary to reach (demo.js, review.js, agent.js, tools.js, schema.js, mock-data.js, GitHub API, Anthropic API, OpenAI API, the JSON findings artifact). The internal Observe-Think-Act state transitions inside runReActLoop (agent.js:157-309) — FINISH vs ACTION vs parse-error vs stall vs cap-out — are a state machine, i.e. L2/L2b, and are EXCLUDED from the box diagram; I surfaced them only as an invariant card per the harness's own carve-out for decision points.

## Components (the boxes)

| Component | Kind | Role | Citation |
|---|---|---|---|
| **Demo Runner** | `entry` | Entry point — builds a scripted mock LLM + mock PR data, drives the loop with zero external calls | `src/demo.js:166` |
| **Live Runner** | `entry` | Entry point — reads PR URL + env creds, drives the loop against real GitHub/LLM APIs | `src/review.js:87` |
| **ReAct Agent Loop** | `service` | Core orchestrator: builds system prompt, calls the LLM, parses THOUGHT/ACTION/FINISH, dispatches tool calls, validates+dedupes+sorts final findings | `src/agent.js:157` |
| **Tool Registry** | `service` | Defines the 5 callable tools (fetchPR, fetchDiff, fetchFile, searchCode, postComment); each branches on ctx.mockData vs real GitHub call | `src/tools.js:64` |
| **Schema / Validation module** | `service` | FINDING_SCHEMA + REVIEW_OUTPUT_SCHEMA contracts, validateFinding, deduplicateFindings, sortFindings | `src/schema.js:39` |
| **Mock PR Data** | `mock` | Fixture: PR metadata, diff, file contents, search results for demo mode | `src/mock-data.js:5` |
| **Simulated (Mock) LLM** | `mock` | Pre-scripted 8-step response sequence standing in for a real LLM call in demo mode | `src/demo.js:16` |
| **GitHub API** | `external` | Live-mode target for PR metadata, diff, file contents, code search, and posting review comments | `src/tools.js:5` |
| **Anthropic API** | `external` | Live-mode LLM reasoning engine (default provider) | `src/review.js:26` |
| **OpenAI API** | `external` | Live-mode LLM reasoning engine (alternate provider, LLM_PROVIDER=openai) | `src/review.js:59` |
| **Structured Findings JSON** | `artifact` | Final output artifact: findings[] + summary + filesReviewed + filesSkipped, printed to console | `src/demo.js:228` |

## Flows (the edges)

| From | To | Label | Kind | Citation |
|---|---|---|---|---|
| Demo Runner | Tool Registry | createTools() | `call` | `src/demo.js:176` |
| Demo Runner | Mock PR Data | import fixture | `data_in` | `src/demo.js:10` |
| Demo Runner | ReAct Agent Loop | runReActLoop(mockLLM, tools, mockData) | `primary` | `src/demo.js:179` |
| ReAct Agent Loop | Simulated (Mock) LLM | llmCall(messages) | `call` | `src/agent.js:184` |
| ReAct Agent Loop | Tool Registry | tool.execute(input, ctx) | `call` | `src/agent.js:248` |
| ReAct Agent Loop | Schema / Validation module | validate/dedup/sort | `call` | `src/agent.js:219` |
| ReAct Agent Loop | Structured Findings JSON | return output | `artifact` | `src/agent.js:222` |
| Live Runner | Tool Registry | createTools() | `call` | `src/review.js:117` |
| Live Runner | ReAct Agent Loop | runReActLoop(llmCall, tools, {owner,repo,number,token}) | `primary` | `src/review.js:119` |
| Live Runner | Anthropic API | POST /v1/messages | `call` | `src/review.js:26` |
| Live Runner | OpenAI API | POST /v1/chat/completions | `call` | `src/review.js:59` |
| Tool Registry | GitHub API | fetch PR/diff/file/comment | `call` | `src/tools.js:30` |
| Tool Registry | GitHub API | fetch raw diff | `call` | `src/tools.js:48` |
| Live Runner | Structured Findings JSON | print JSON.stringify(output) | `artifact` | `src/review.js:131` |

## Invariant cards — COMPLETE enumerations, in code order

Per `DIAGRAM_RULES.md`: a card lists the REAL enumeration from code, complete and in code order. Never a summary, never "etc.". If an enumeration changes in code, the card is WRONG, not stale.

### How the ReAct loop can exit each iteration (in code order inside runReActLoop's for-loop)

Source: `src/agent.js:179`

- FINISH with unparseable JSON → push retry message, continue loop — agent.js:197-206
- FINISH with valid output → validate/dedupe/sort findings, return result — agent.js:208-231
- ACTION names an unknown tool → push error observation, continue loop — agent.js:234-242 (guard at agent.js:236)
- ACTION executes and observation is identical length to the previous one staleThreshold times in a row → force-finish message pushed, continue loop — agent.js:262-273 (guard at agent.js:263)
- Response matches neither FINISH nor ACTION → push parse-failure retry message — agent.js:284-292 (guard at agent.js:285)
- Loop reaches cfg.maxIterations without a FINISH → forced empty-findings output with cappedOut:true — agent.js:295-308 (log line at agent.js:296)

### Tool registry — mock vs live branch, in registration order (createTools)

Source: `src/tools.js:64`

- fetchPR — mockData.pr, else GET /repos/{owner}/{repo}/pulls/{number} — tools.js:67
- fetchDiff — mockData.diff, else raw diff fetch — tools.js:93
- fetchFile — mockData.files[path] or '[File not found]', else GET repo contents — tools.js:108
- searchCode — mockData.search[query] or '[No results for]', else GitHub code search API — tools.js:133
- postComment — logs to console + {posted:false,reason:'demo mode'}, else POST issue comment — tools.js:161

### Findings sort order (sortFindings)

Source: `src/schema.js:138`

- bug — order 0
- security — order 1
- suggestion — order 2
- nit — order 3

## Artifacts written

| Artifact | Written by | Citation |
|---|---|---|
| `Structured review output JSON` | runReActLoop (agent.js:222-230), printed by demo.js:228 or review.js:131 | `src/schema.js:68 (REVIEW_OUTPUT_SCHEMA: findings, summary, filesReviewed, filesSkipped)` |

## Deliberately NOT drawn

- Internal ReAct state transitions (FINISH/ACTION/stall/parse-error/cap-out branching) — L2 state machine, summarized instead as an invariant card per instructions
- parseAgentResponse() regex parsing internals (agent.js:99-145) — implementation detail, not a space boundary
- buildSystemPrompt() prompt-string construction (agent.js:35-91) — content, not a component
- Full contents of mock-data.js beyond the pr/diff shape already cited — it is one fixture blob, not multiple components
- node:test unit tests (schema.test.js, tools.test.js) — verification tooling, not runtime architecture

## Portability notes — semantic tokens under strain

Recorded because the vocabulary was built for a trading system. "Rules bent per new domain" is the portability metric for the harness.

- 'mock' kind fits cleanly here (Mock PR Data, Simulated Mock LLM) — this project is itself demo/live dual-mode, closer to the FTS paper/live split than a generic app
- No natural fit for an 'agent' kind distinct from 'service': the ReAct loop is arguably the one true 'agent' in the trading-system sense, but it is implemented as a plain orchestrator function (runReActLoop) with no autonomous scheduling/state of its own — classified as 'service' since it is invoked synchronously by an entry point, not because 'agent' didn't fit conceptually
- 'stop' edge kind (used in FTS for circuit breakers / kill switches) has no direct analogue here — the closest is the iteration cap / stall-detection forced-finish, which I placed in the invariant card rather than as an edge, since it's an internal control-flow branch, not a cross-boundary signal

