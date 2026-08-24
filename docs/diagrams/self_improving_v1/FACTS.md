# FACTS — 30-self-improving-agent (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/30-self-improving-agent/src/`, n=11 JS modules (1569
lines, ESM, one runtime dependency: `better-sqlite3`). **Every element in the
diagram appears below with a `file:line` citation. The diagram may contain
nothing that is not on this page, and this page may contain nothing without a
citation.** The project README ships an ASCII diagram; it was treated as a
claim, not evidence — every fact below was read from source, and three README
claims did not survive that reading (see "README claims that did not verify").

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The per-iteration observe/think/act branch
tree inside `agent.step`, the regex fact-extraction, the SQLite trigger/FTS5
internals, and the branch logic of each postmortem detector are L2 concerns and
are deliberately NOT drawn here.

---

## Entry point — `src/demo.js`

| Fact | Citation |
|---|---|
| CLI `main()` — the whole self-improvement driver | demo.js:89 |
| `parseArgs()` — `--rounds` (default 3), `--question`, `--provider`, `--check`, `--verbose` | demo.js:30, :36 |
| Constructs `LLMAdapter`, then health-checks providers before running | demo.js:98, :101 |
| Opens one `Memory('./data/agent.db')` for the whole session | demo.js:127 |
| `loadHistory()` — resumes from the latest prompt version on disk if present | demo.js:133-137 |
| `saveVersion(v1 base)` on a cold start | demo.js:140 |
| The round loop `for round = 1..rounds` | demo.js:148 |
| Per round: new `Scratchpad`, new `ResearchAgent`, new `Harness` | demo.js:151, :152, :160 |
| Runs the agent through the harness: `harness.run(i => agent.step(i))` | demo.js:168 |
| Then `evaluate(...)` the answer + trace | demo.js:180 |
| Stores the episode + each research fact into `Memory` | demo.js:189, :198 |
| Postmortem + improvement, **skipped on the last round** | demo.js:210 |
| `analyzeRun(runResult, traceEntries)` | demo.js:212 |
| `generatePatch({currentPrompt, postmortem, evaluation, llm})` | demo.js:224 |
| `applyPatch(currentPrompt, improvement.patch)` → next prompt | demo.js:231 |
| `saveVersion(...)` writes the new prompt version to disk | demo.js:234 |
| Fatal path: `main().catch` → `process.exit(1)` | demo.js:271-275 |

## The observable harness — `src/harness.js`

The harness is the **run wrapper / loop controller**, not the agent. It owns the
iteration cap, cost accounting, convergence detection and the JSONL trace. It
does NOT know about LLMs, tools or Wikipedia.

| Fact | Citation |
|---|---|
| `async run(stepFn)` — the loop; caller passes the step function | harness.js:15 |
| Body invocation each iteration: `step = await stepFn(i)` | harness.js:31 |
| Defaults: `maxIterations 15`, `maxCostUsd 0.50`, `convergenceWindow 3` | harness.js:6, :7, :8 |
| demo overrides to `maxIterations: 12`, `convergenceWindow: 3` | demo.js:161, :162 |
| Per-iteration trace entry pushed to `this.entries[]` | harness.js:42-57 |
| Writes one JSONL file `trace-<runId>.jsonl` at the end | harness.js:88-90 |
| Cost is **simulated**: `(in + out) * 0.4 / 1e6` — no real billing | harness.js:102-104 |

### INVARIANT CARD 1 — stop conditions of `harness.run()`, complete, in code order

The loop can end exactly four ways. Enumerated in the order the code tests them
each iteration.

| # | stopReason | Trigger | Citation |
|---|---|---|---|
| 1 | `AGENT_DONE` | `step.done` true (agent called `synthesize`) | harness.js:67-69 |
| 2 | `COST_CAP` | `totalCost >= maxCostUsd` ($0.50) | harness.js:72-74 |
| 3 | `CONVERGENCE` | `zeroFactStreak >= convergenceWindow` (3) | harness.js:77-82 |
| 4 | `MAX_ITERATIONS` | `for i = 1..maxIterations` falls through (default value) | harness.js:19, :26 |

`step.done` is set only when the agent's chosen tool is `synthesize`
(agent.js:89). A step that throws is logged and skipped, not fatal
(harness.js:32-36).

## The agent loop body — `src/agent.js`

| Fact | Citation |
|---|---|
| `class ResearchAgent` — holds `facts[]`, `sourcesConsulted`, message history | agent.js:3, :11, :12 |
| `async step(iteration)` — one observe→think→act cycle | agent.js:18 |
| Calls the LLM with system prompt + last 8 messages, `jsonMode` | agent.js:28-32 |
| Parses the JSON action (or `_extractAction` fallback) | agent.js:34, :163 |
| De-dupes identical tool calls via `_toolHistory` | agent.js:52-70 |
| Dispatches through `executeTool(name, input, {scratchpad})` | agent.js:72-73 |
| Extracts up to 5 facts per article read | agent.js:80-83, :158 |
| Iteration 1 pulls **prior** facts from `Memory.searchFacts` | agent.js:128 |
| Reads the scratchpad index into context each step | agent.js:148 |
| `synthesize` marks the run done and sets `finalReport` | agent.js:89-92 |

## Multi-provider LLM adapter — `src/llm.js`

| Fact | Citation |
|---|---|
| `class LLMAdapter`, provider order `['nvidia','ollama','gemini']` | llm.js:5, :7 |
| `chat()` tries each provider in turn, first success wins | llm.js:18, :21 |
| Ollama call — local `fetch` to `localhost:11434` | llm.js:99, :107 |
| NVIDIA call — `fetch` to `integrate.api.nvidia.com` (needs key) | llm.js:125, :134 |
| Gemini call — `fetch` to `generativelanguage.googleapis.com` (needs key) | llm.js:159, :176 |
| `healthCheck()` probes all three | llm.js:73 |
| JSON-mode: parse, and one `_retryJSON` round-trip if it fails | llm.js:46-56, :213 |
| Rate-limit gate: min 500 ms between requests | llm.js:233-239 |

These are **real network calls** via `fetch()` — there is no mock LLM in this
project (unlike 07-guardrails). At least one provider must be reachable or the
run aborts (demo.js:121-125).

## Tools — `src/tools.js`

| Fact | Citation |
|---|---|
| `TOOLS` registry | tools.js:3 |
| `executeTool(name, input, ctx)` — dispatch + error wrap | tools.js:93 |

### The five tools, complete, in registry order

| # | Tool | Real dependency | Citation |
|---|---|---|---|
| 1 | `wikipedia_search` | `fetch` opensearch API | tools.js:4, :8 |
| 2 | `wikipedia_article` | `fetch` REST summary API | tools.js:23, :27 |
| 3 | `calculator` | in-process `new Function` (sanitised) | tools.js:45, :53 |
| 4 | `note` | writes `ctx.scratchpad` | tools.js:65, :70 |
| 5 | `synthesize` | returns the final answer (sets run done) | tools.js:78, :81 |

## Cross-session memory — `src/memory.js`

| Fact | Citation |
|---|---|
| `class Memory` over `better-sqlite3`, `journal_mode = WAL` | memory.js:5, :8, :9 |
| `episodes` table | memory.js:15 |
| `facts` table (subject/predicate/object/confidence) | memory.js:27 |
| `facts_fts` FTS5 virtual table + sync triggers | memory.js:38-58 |
| `addEpisode(...)` — one row per run (written by demo) | memory.js:62 |
| `addFact(...)` — reinforce / contradict / create | memory.js:74 |
| `searchFacts(query)` — FTS5 match, confidence > 0.1 | memory.js:95 |
| `decayMemories()` — exponential half-life (180 d default) | memory.js:116 |

Memory **writes happen in `demo.js` after the run** (addEpisode demo.js:189,
addFact demo.js:198), not inside `agent.step`. The agent only **reads** prior
facts, at iteration 1 (agent.js:128). The SQLite file `data/agent.db` is what
makes the second run start with the first run's facts.

## Scratchpad — `src/scratchpad.js`

| Fact | Citation |
|---|---|
| `class Scratchpad` — in-memory `Map`, ephemeral (per round) | scratchpad.js:1, :4 |
| `write(key, content)` — the "Write move", token-counted | scratchpad.js:9 |
| `formatIndex()` — compact index read into agent context | scratchpad.js:62 |

Constructed fresh each round (demo.js:151) — it is **not** persisted; nothing is
written to disk from here.

## Evaluator — `src/evaluator.js`

### INVARIANT CARD 2 — `evaluate()`: 4 dimensions → weighted composite

| # | Dimension | Weight | How scored | Citation |
|---|---|---|---|---|
| 1 | `factCount` | 0.25 | heuristic (regex over answer) | evaluator.js:31 |
| 2 | `sourceDiversity` | 0.20 | heuristic (distinct article titles in trace) | evaluator.js:46 |
| 3 | `coherence` | 0.25 | **LLM-as-judge** (0–10 → /10) | evaluator.js:53 |
| 4 | `completeness` | 0.30 | **LLM-as-judge** (0–10 → /10) | evaluator.js:72 |

`composite = 0.25·factCount + 0.20·sourceDiversity + 0.25·coherence +
0.30·completeness` — weights sum to 1.00 (evaluator.js:15). A run with no answer
scores all zeros (evaluator.js:2-8). Two of the four dimensions are graded by a
real LLM call; two are pure heuristics.

## Postmortem — `src/postmortem.js`

### INVARIANT CARD 3 — self-diagnosis: 7 findings + 6 primitive scores → the patch

This is the project's whole thesis: the run grades itself, the weakest primitive
and the findings are handed to an LLM, and the LLM writes ONE prompt patch that
becomes the next version. All enumerations complete, in code order.

Seven finding detectors, in call order:

| # | Finding | Citation |
|---|---|---|
| 1 | `single_source` | postmortem.js:30 |
| 2 | `premature_synthesis` | postmortem.js:46 |
| 3 | `repeated_action` | postmortem.js:65 |
| 4 | `tool_failure` | postmortem.js:83 |
| 5 | `convergence_stall` | postmortem.js:97 |
| 6 | `no_synthesis` | postmortem.js:109 |
| 7 | `context_bloat` | postmortem.js:121 |

Six primitive scores (the lowest is picked as `weakestPrimitive`,
postmortem.js:13):

| # | Primitive | Citation |
|---|---|---|
| 1 | `instructions` | postmortem.js:142 |
| 2 | `contextDelivery` | postmortem.js:146 |
| 3 | `contextManagement` | postmortem.js:150 |
| 4 | `toolInterface` | postmortem.js:156 |
| 5 | `orchestration` | postmortem.js:158 |
| 6 | `verification` | postmortem.js:162 |

## Improver — `src/improver.js`

| Fact | Citation |
|---|---|
| `generatePatch(...)` — LLM writes ONE concrete patch (JSON) | improver.js:1, :11 |
| Deterministic fallback if the LLM returns no JSON | improver.js:50, :65 |
| `applyPatch(prompt, patch)` — add / replace / remove a section | improver.js:82 |

## Prompt version store — `src/prompts.js` + `data/prompt-history/`

| Fact | Citation |
|---|---|
| `getBasePrompt()` — the intentionally-bare v1 prompt | prompts.js:5 |
| `loadHistory()` — reads `v{N}.json`, sorted by version | prompts.js:27 |
| `saveVersion(entry)` — writes `data/prompt-history/v{N}.json` | prompts.js:44 |

On disk today: `v1.json`, `v2.json`, `v3.json` (the recorded evolution).

---

## Artifacts persisted to `data/`

| Artifact | Written by | Citation |
|---|---|---|
| `data/prompt-history/v{N}.json` — the prompt lineage (the loop's output) | `saveVersion` | prompts.js:44 |
| `data/agent.db` — SQLite episodes + facts (cross-session memory) | `Memory` | memory.js:8 |
| `data/traces/trace-<runId>.jsonl` — one line per iteration | `Harness` | harness.js:88-90 |

## README claims that did not verify

1. **The README ASCII labels the loop box "Agent Loop (harness.js)"** and packs
   the LLM, JSON parse, tool execution, memory and scratchpad inside it. In code
   the loop **body** is `agent.js` (`ResearchAgent.step`, agent.js:18);
   `harness.js` is only the **wrapper** — it calls an opaque `stepFn`
   (harness.js:31) that `demo.js` happens to bind to `agent.step` (demo.js:168).
   The harness owns iteration/cost/convergence/trace and nothing else. The
   diagram draws harness and agent as two separate boxes and puts the functional
   boundary around `agent.step`, not around the harness. This is the
   which-module-owns-the-loop correction and is the most load-bearing one here.
2. **The README ASCII shows "Execute Tool → store facts → Memory" inside the
   loop**, implying the agent writes facts to SQLite mid-run. In code the agent
   only accumulates facts in an in-process array (`this.facts`, agent.js:83) and
   **`demo.js` persists them after the run** (addFact demo.js:198). The only
   in-loop Memory access is a **read** at iteration 1 (agent.js:128). The
   diagram draws memory access from the agent labelled "prior facts / addFact"
   and the FACTS note records that the write is demo-orchestrated post-run.
3. **The README "Files" table lists four tools** ("Wikipedia search + article,
   calculator, scratchpad note") and gives `tools.js` as 95 lines. There are
   **five** tools — `synthesize` (tools.js:78) is the fifth and is the one that
   ends the run — and the file is 102 lines. The diagram's tools box and card
   say five.

## Drawn as a legibility pipeline (documented abstraction)

`demo.js` calls `evaluate` (:180), then `analyzeRun` (:212), then `generatePatch`
(:224) in sequence each round; `analyzeRun` reads `runResult`, and
`generatePatch` reads **both** the postmortem and the evaluation. Rather than
draw three separate feeds from the run plus a cross-link, the diagram renders
them as the left-to-right pipeline `evaluate → postmortem → improver` (the exact
call order in `main()`), with the run output entering at `evaluate`. The
edge into `evaluate` carries `runResult.traceEntries` (from the harness) and
`agent.finalReport` (from the agent), wired by `demo.js:180-185`.

## Deliberately NOT drawn (L1 scope discipline)

- The observe/think/act branch logic and JSON-repair inside `agent.step`
  (agent.js:34-119) — L2.
- The per-detector heuristics inside the 7 postmortem functions — L2; the card
  carries their names and line numbers, which is the L1-relevant fact.
- SQLite FTS5 triggers, decay math, confidence reinforcement (memory.js:38-58,
  :74-93, :116-138) — L2 mechanism; the box names the tables.
- The three provider request/response shapes (llm.js:99-198) — folded into one
  "LLM providers" box; the card-worthy fact is the fallback order.
- The comparison-table / banner formatting in `demo.js` (:52-87, :250-266).

## Portability notes — vocabulary strain recorded per new domain

The token set was built for a trading system; this is the 25th diagram on it.

1. **`component.agent` has an HONEST occupant here.** `ResearchAgent`
   (agent.js:3) is a genuine stateful agent — it holds accumulated facts, a
   consulted-sources set, and a running message history, and drives an
   observe→think→act loop. This is the first strain-free use of the token
   recorded; noted because the tracked failure mode is the opposite (the "agent"
   being a stateless function).
2. **`component.external` also has HONEST occupants.** Both external boxes — the
   LLM providers (NVIDIA/Ollama/Gemini, llm.js:125/99/159) and the Wikipedia
   REST API (tools.js:8, :27) — are reached by **real `fetch()`**, not a
   hardcoded mock. The recurring "external surface is a mock" strain does not
   apply to this project, and the zone label says "real fetch(), no mock" so the
   picture cannot be misread as mocked.
3. **No `component.datastore` / `component.state` token exists.** `Memory`
   (SQLite) and `Scratchpad` (in-memory Map) are both stateful stores; both took
   `component.service`. The zone (`boundary.observability`, labelled "State &
   persistence") and the box labels (`SQLite agent.db (WAL)` vs `Write move
   (Map)`) carry the persistent-vs-ephemeral distinction that the node token
   cannot.
4. **`component.mock` is unused.** There is nothing fake to stand in for a
   network here; every dependency is real.
5. **`boundary.datasource` on the entry zone** is a mild stretch: the zone holds
   the CLI entry point *and* the prompt-history store. It was chosen because the
   prompt store is the data that seeds each round; the CLI is labelled inside.
