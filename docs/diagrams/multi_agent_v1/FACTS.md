# FACTS — 04-multi-agent-systems (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/04-multi-agent-systems/`, n=7 source files, 1096 lines
(`src/demo.js` 85, `src/supervisor.js` 312, `src/messageBus.js` 81,
`src/agents/researcher.js` 128, `src/agents/writer.js` 190, `src/agents/editor.js` 173,
`src/agents/factChecker.js` 127).
**Every element in the diagram appears below with a `file:line` citation. The
diagram may contain nothing that is not on this page, and this page may contain
nothing without a citation.** The project README ships an ASCII architecture
diagram; it was treated as a CLAIM, not as evidence — and it is wrong in one
load-bearing way (see "The README's claim, refuted" below).

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The supervisor's three-way retry decision and
the editor's additive scoring algorithm are L2 concerns — they appear only as
invariant cards, never as extra boxes.

---

## What this project is

One Node ESM process, zero npm dependencies (`package.json:4` `"type": "module"`,
no `dependencies` key), that produces a technical blog post through four
specialised agent functions coordinated by a supervisor over a synchronous
in-process pub/sub bus. Every LLM call, web search and page fetch is a hardcoded
mock; nothing leaves the process.

---

## The README's claim, refuted

The README states that "Each agent (and the supervisor) registers a handler with
`bus.subscribe(channel, handler)`, keyed by its own name" (`README.md:53-55`), and
`supervisor.js`'s own file header repeats it: "every agent is a *subscriber* on
the message bus" (`supervisor.js:13-20`).

**Both are false.** All five `bus.subscribe` calls and all ten `bus.publish` calls
live in `supervisor.js`:

| Call | Sites | Citation |
|---|---|---|
| `bus.subscribe` | 5, all in `runPipeline`'s closure | supervisor.js:81, :102, :140, :162, :182 |
| `bus.publish` | 10, all in `runPipeline`'s closure | supervisor.js:89, :114, :127, :150, :169, :192, :206, :216, :233, :290 |
| any bus reference inside `src/agents/*.js` | **0** | `grep -rn "bus\.\|subscribe\|publish" src/agents/` returns only two false hits, both the English word "publish" inside a summary string — factChecker.js:118, editor.js:163 |

The four agent modules are pure, bus-unaware `async` functions. The supervisor
imports them directly (`supervisor.js:33-36`) and `await`s them inside its own
channel handlers. **The diagram draws that, not the README's picture.**

---

## Components (the boxes)

| Box | Kind | What it is | Citation |
|---|---|---|---|
| `demo.js` — CLI | entry | reads `process.argv[2]` for the topic, calls `runPipeline`, prints the draft, fact-check, edit history | demo.js:16, :24, :85 |
| `runPipeline()` — supervisor | service | creates the bus, registers all 5 handlers, `await`s every agent function directly, tracks cost, assembles the report, resolves the Promise | supervisor.js:48, :57, :243, :282 |
| `createMessageBus()` | service | synchronous pub/sub router + ordered log | messageBus.js:22, :24, :31, :37 |
| ① Researcher | agent | `runResearcher(topic)` → sub-questions, mock search, 5 structured notes, hardcoded `tokenUsage` | researcher.js:58, :119 |
| ② Writer | agent | `runWriter(notes, feedback, attempt)`; **no tools** — two hardcoded draft generators | writer.js:25, :41, :56, :100, :47 |
| ③ Editor | agent | `runEditor(draft, attempt)`; **no tools** — `scoreDraft()` derives 0–10 from the draft text | editor.js:147, :46, :167 |
| ④ Fact-Checker | agent | `runFactChecker(draft, research)`; `fetch_url` only | factChecker.js:40, :121 |
| Researcher `mockTools` | mock | `web_search(query)` returns 3 canned hits; `fetch_url(url)` returns a canned page | researcher.js:26, :27, :47 |
| Fact-Checker `mockTools` | mock | its own separate object — `fetch_url(url)` only | factChecker.js:28, :29 |
| Pipeline report | artifact | `{topic, status, draftAttempts, editorAccepted, factCheckPassed, costs, elapsed, messageCount}` → `resolve()` → printed by `demo.js` | supervisor.js:243, :258, :282, demo.js:24 |
| `FINAL` → channel `'Output'` | artifact | published, logged, and delivered to nobody | supervisor.js:233, :235 |
| Bus log | artifact | full ordered message log; `getLog()` / `printSummary()` — stdout only, no file written | messageBus.js:52, :69, supervisor.js:280 |

12 component boxes. The `'Output'` box is a message destination, not a module —
it is drawn because the absence of a subscriber behind it is an architectural
fact (see card 2).

---

## Flows (the edges)

| From | To | Label | Kind | Citation |
|---|---|---|---|---|
| `demo.js` | supervisor | `runPipeline(topic)` | primary | demo.js:24 |
| supervisor | `demo.js` | budget throw → `catch` | stop | supervisor.js:308, demo.js:79 |
| supervisor | bus | `bus.publish()` ×10 | call | supervisor.js:89, :290 |
| bus | supervisor | routes `msg.to` → handler | data_in | messageBus.js:46, :47 |
| supervisor | ① Researcher | `await runResearcher()` | primary | supervisor.js:85 |
| supervisor | ② Writer | `await runWriter()` ×2 sites | primary | supervisor.js:110, :123 |
| supervisor | ③ Editor | `await runEditor()` | primary | supervisor.js:147 |
| supervisor | ④ Fact-Checker | `await runFactChecker()` | primary | supervisor.js:166 |
| ① Researcher | Researcher `mockTools` | `web_search` ×4, `fetch_url` ×4 | call | researcher.js:78, :86 |
| ④ Fact-Checker | Fact-Checker `mockTools` | `fetch_url` on first 3 sources | call | factChecker.js:58, :59 |
| supervisor | Pipeline report | assemble + `resolve()` | artifact | supervisor.js:243, :282 |
| bus | `FINAL` → `'Output'` | last hop, no subscriber | artifact | supervisor.js:233 |
| bus | Bus log | every message, in order | artifact | messageBus.js:43, :69 |

Note the shape this produces: **no agent-to-agent edge exists.** Every agent is
reached only by an `await` from the supervisor, and every message hop is
supervisor → bus → supervisor.

---

## CARD 1 — MESSAGE TYPES: all 8, in publish order

Complete. Derived by reading every `bus.publish` site in `supervisor.js` in file
order. The `messageBus.js` header docstring lists a **different, stale** set
(`RESEARCH_NOTES`, `DRAFT`, `EDIT_REVIEW`, `REVISION_REQ`, `FACT_CHECK`, `FINAL`
— messageBus.js:11-17); three of those names exist nowhere in the code. The
enumeration below is the code's, not the comment's.

| # | Type | From → To | Publish site |
|---|---|---|---|
| 1 | `RESEARCH_REQUEST` | Supervisor → Researcher | supervisor.js:290-295 |
| 2 | `RESEARCH_COMPLETE` | Researcher → Writer | supervisor.js:89-94 |
| 3 | `DRAFT_COMPLETE` | Writer → Editor | supervisor.js:114-119 (attempt 1), :127-132 (revision) |
| 4 | `REVIEW_COMPLETE` | Editor → Supervisor | supervisor.js:150-155 |
| 5 | `REVISION_REQ` | Supervisor → Writer | supervisor.js:206-211 |
| 6 | `FACT_CHECK_REQUEST` | Supervisor → FactChecker | supervisor.js:192-197 (on ACCEPT), :216-221 (retries exhausted) |
| 7 | `FACT_CHECK_COMPLETE` | FactChecker → Supervisor | supervisor.js:169-174 (triggers final assembly, supervisor.js:227) |
| 8 | `FINAL` | Supervisor → `'Output'` | supervisor.js:233-238 |

The kick-off publish (#1) is the **last** statement in `runPipeline`, after all
five handlers are registered — supervisor.js:290. `RESEARCH_COMPLETE` is
published by the `'Researcher'` handler after it awaits the agent function
(supervisor.js:85 then :89), which is why type #2 reads "Researcher → Writer"
while the code that emits it is the supervisor's.

## CARD 2 — BUS CHANNELS: all 5 subscribers, in code order

Complete. `subscribe(channel, handler)` keys on an **agent name**, not a topic
(messageBus.js:31-34); `publish` looks up `subscribers.get(full.to)` and invokes
each handler synchronously in registration order (messageBus.js:46-47).

| # | Channel | Message types the handler accepts | Citation |
|---|---|---|---|
| 1 | `'Researcher'` | `RESEARCH_REQUEST` only (early-returns otherwise) | supervisor.js:81, guard :82 |
| 2 | `'Writer'` | `RESEARCH_COMPLETE` or `REVISION_REQ` | supervisor.js:102, :104, :120 |
| 3 | `'Editor'` | `DRAFT_COMPLETE` only | supervisor.js:140, guard :141 |
| 4 | `'FactChecker'` | `FACT_CHECK_REQUEST` only | supervisor.js:162, guard :163 |
| 5 | `'Supervisor'` | `REVIEW_COMPLETE` or `FACT_CHECK_COMPLETE` | supervisor.js:182, :184, :223 |

**`'Output'` is published to (supervisor.js:235) but never subscribed.** The
`FINAL` message is stamped, logged and printed (messageBus.js:43-44) and then
`subscribers.get('Output')` yields `[]` (messageBus.js:46). That hop exists only
in the log — which is the reason the box is drawn.

## CARD 3 — SUPERVISOR VERDICT BRANCH + BUDGET GATE, in code order

Complete. The `'Supervisor'` handler's `REVIEW_COMPLETE` arm has exactly three
outcomes (supervisor.js:184-222):

| # | Condition | Action | Citation |
|---|---|---|---|
| 1 | `verdict === 'ACCEPT'` | publish `FACT_CHECK_REQUEST` | supervisor.js:188, :192 |
| 2 | else if `attempt <= MAX_RETRIES` (2) | join the `major`-severity issues, publish `REVISION_REQ` | supervisor.js:198, :199-202, :206 |
| 3 | else | stop revising; fact-check the best draft anyway | supervisor.js:212, :216 |

Budget gate, checked on every inbound token bill: `trackCost(tokenUsage)` at
`PRICE_PER_1K_TOKENS = 0.01` (supervisor.js:39, :301-303); `checkBudget` **throws**
above `MAX_BUDGET = 2.0` (supervisor.js:40, :305-311, throw at :308). It is called
four times — supervisor.js:106, :144, :186, :225 — once per agent's token
report. The throw rejects the pipeline Promise (supervisor.js:77) and lands in
`demo.js`'s catch (demo.js:79-82).

---

## Artifacts written

| Artifact | Written by | Citation |
|---|---|---|
| Pipeline report object (topic, status, draftAttempts, editorAccepted, factCheckPassed, costs, elapsed, messageCount) | supervisor, resolved to the caller | supervisor.js:243-259, :282 |
| `FINAL` bus message addressed to `'Output'` | supervisor, via the bus | supervisor.js:233-238 |
| Ordered message log, printed as a table | bus | messageBus.js:43, :69-78, invoked supervisor.js:280 |

**No file is written anywhere in this project.** There is no `fs` import in any
source file (`grep -rn "require\|^import" src/` returns only the six ESM imports
at demo.js:10 and supervisor.js:32-36). Every output is stdout.

---

## Deliberately NOT drawn (L1 scope discipline)

- **The editor's `scoreDraft` rubric** — five additive criteria totalling 10
  (length 5 pts editor.js:57-83, code blocks 2 pts :85-101, headers 1 pt
  :103-112, benchmark evidence 1 pt :114-123, intro+conclusion 1 pt :125-136;
  `PASS_THRESHOLD` 7 at editor.js:33, verdict at :157). Algorithm, not space.
- **The retry loop over time** — attempt 1 → REJECT → REVISION_REQ → attempt 2 →
  ACCEPT is ordering, which is **L2b**; it belongs in a sequence diagram.
- **Message payload shapes** — `{key_claim, source_url, confidence}`
  (researcher.js:91-117), `{verdict, score, issues, summary}` (editor.js:165),
  `{claims, overall, summary}` (factChecker.js:126). Data shape, not space.
- **The mock corpora's contents** — the canned search hits (researcher.js:28-44),
  the two hardcoded drafts (writer.js:56-98, :100-189), the seven hardcoded
  claims and verdicts (factChecker.js:46-54, :64-107).
- **Hardcoded per-agent `tokenUsage` constants** (researcher.js:119, writer.js:47,
  editor.js:167, factChecker.js:121) — bookkeeping inputs, not components.
- **`demo.js`'s console formatting** (demo.js:69-77) — narration.

---

## Portability notes — semantic tokens under strain

Recorded because "rules bent per new domain" is the harness's portability metric.
This is the harness's third codebase and its second in `Hands-on-AgenticAI`.

1. **`component.external` had no legitimate occupant — again.** Both tool
   surfaces are hardcoded objects inside the agent modules
   (researcher.js:26-50, factChecker.js:28-32). Used `component.mock`, and
   labelled the boundary MOCK, as `agent_harness_v1` did. Two projects in a row:
   the token vocabulary needs a first-class "simulated dependency" boundary
   rather than an external boundary you have to caveat.
2. **`component.agent` is the project's word, not the structure's.** The four
   "agents" are stateless async functions with zero bus awareness; the only thing
   agentic about them is the system prompt string each carries
   (researcher.js:12, writer.js:9, editor.js:14, factChecker.js:9). Kept the
   token because the domain's own vocabulary should win at L1, but the functional
   boundary label carries the correction so the picture cannot mislead.
3. **`edge.stop` generalises cleanly.** In FTS it is a kill switch; here it is
   `checkBudget`'s throw (supervisor.js:308). "The edge that ends the run" is the
   portable meaning — no rename needed.
4. **`component.artifact` covers a non-file.** Two of the three artifacts here
   are a resolved JS object and a console table, not durable output. The token
   read as "durable output" in `agent_harness_v1`; here it has to mean "the thing
   the run produces". Flagged rather than renamed.
