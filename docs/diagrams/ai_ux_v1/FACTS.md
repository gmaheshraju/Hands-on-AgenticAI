# FACTS — 12-ai-ux (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/12-ai-ux/`, n=6 code files (`src/server.js` 198,
`src/agent.js` 361, `src/demo.js` 37, `public/chat.js` 681, `public/index.html` 58,
`public/styles.css` 833) = 2168 lines plus `package.json`.
**Every element in the diagram appears below with a `file:line` citation. The
diagram may contain nothing that is not on this page, and this page may contain
nothing without a citation.** The project README ships an ASCII diagram; it was
treated as a claim, not as evidence — every fact below was read from source. The
README's claim was checked and one drift was found (see *README drift* below).

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The HITL state machine the README draws
(`STREAMING → AWAITING_APPROVAL → APPROVED/REJECTED → STREAMING`) is an **L2**
concern and is deliberately NOT drawn here.

---

## Entry point — `src/demo.js`

| Fact | Citation |
|---|---|
| Imports `startServer` from the server module | demo.js:1 |
| `PORT = process.env.PORT \|\| 3000` | demo.js:3 |
| Calls `startServer(PORT)` then prints the scenario menu | demo.js:5 |
| `npm run demo` → `node src/demo.js`; `npm start` → `node src/server.js` | package.json:9, :8 |
| Single runtime dependency: `express ^4.18.2`; `"type": "module"` (ESM) | package.json:12, :4 |

## The server process — `src/server.js`

| Fact | Citation |
|---|---|
| `express()` app; `express.json()` body parsing | server.js:7, :9 |
| Serves `public/` statically — this is how the browser gets the whole UI | server.js:10 |
| `startServer(port)` resolves once `app.listen` fires; PORT default 3000 | server.js:191, :189 |

### In-memory state — the only server state that exists

| Fact | Citation |
|---|---|
| `activeStreams = new Map()` — messageId → `{ scenarioName, aborted }` | server.js:14, :35, :36 |
| `pendingApprovals = new Map()` — actionId → `{ scenarioName, resolve }` | server.js:16, :72 |
| Nothing is written to disk or to a database anywhere in the process | absence: no `fs`/`writeFile`/DB import in server.js:1-4 |

### The SSE handler — `GET /api/chat/stream`

| Fact | Citation |
|---|---|
| Route declared; reads `req.query.message` and `req.query.id` | server.js:19, :20, :21 |
| `writeHead(200, …)` with `text/event-stream`, `no-cache`, `keep-alive`, `X-Accel-Buffering: no` | server.js:23-28 |
| `send(event, data)` writes the raw SSE frame `event: …\ndata: …\n\n` | server.js:30-32 |
| `matchScenario(userMessage)` is called **synchronously in-process** here | server.js:34 |
| The event pump: `for (const evt of events)` then `switch (evt.type)` | server.js:41, :47 |
| Abort is checked at the top of every pump iteration | server.js:42 |
| `req.on("close")` sets `aborted` and drops the map entry | server.js:138-141 |

### The HITL park — why the connection stays open

| Fact | Citation |
|---|---|
| `send("hitl_request", evt.action)` then `await new Promise(resolve => …)` | server.js:69, :71 |
| The resolver is parked in `pendingApprovals` keyed by `evt.action.id` | server.js:72-75 |
| On resume, `getHITLContinuation(scenarioName, result.approved, result.edits)` | server.js:78-82 |
| Continuation events are streamed on the **same** connection, then `res.end()` | server.js:83-96 |
| The HITL branch `return`s early — the outer pump never resumes | server.js:97 |

### The two POST endpoints

| Fact | Citation |
|---|---|
| `POST /api/chat/stop` → `stream.aborted = true`, else 404 | server.js:145, :149, :152 |
| `POST /api/hitl/resolve` → `pendingApprovals.get(actionId)`, 404 if absent | server.js:157, :159, :161 |
| Wakes the parked Promise with `{ approved, edits }`, then deletes the entry | server.js:163, :164 |
| `GET /api/sources/:id` (hover preview) and `GET /api/health` also exist | server.js:169, :179 |

### SSE EVENT TYPES — the complete set, in first-emission order (invariant card)

Eight, and they match the README's list. Order below is the order the `send()`
calls appear in `server.js`, which is also the order a reader hits them.

| # | Event | Emitted at | Citation |
|---|---|---|---|
| 1 | `stream_start` | immediately after headers | server.js:38 |
| 2 | `stream_stop` | top of pump when `aborted` | server.js:43 |
| 3 | `thinking` | `thinking` case (+ retry path) | server.js:49 (also :106, :108) |
| 4 | `token` | `token` case, carries `text` + `confidence` | server.js:54-57 |
| 5 | `citation` | `citation` case, after `SOURCES.find` | server.js:64 |
| 6 | `hitl_request` | `hitl` case, before the park | server.js:69 |
| 7 | `done` | HITL continuation / rate-limit retry / `done` case | server.js:92, :119, :129 |
| 8 | `error` | `error` case, typed payload | server.js:101 |

**Asymmetry found in code:** the client registers a listener for `error_event`
at chat.js:147 with the comment that it was "renamed to avoid SSE built-in
error" — **no server code path ever emits `error_event`.** The live path is the
`error` listener at chat.js:153, which parses the payload and falls through to
connection-loss handling when it is not JSON.

## The mock agent module — `src/agent.js` (in-process, no LLM, no network)

| Fact | Citation |
|---|---|
| `SOURCES` — exactly 5 mock documents, each `{ id, title, url, passage }` | agent.js:9-40 |
| Exported at the bottom of the file | agent.js:361 |
| `SCENARIOS` — the router table | agent.js:47 |
| `matchScenario(userMessage)` iterates the table, first regex match wins | agent.js:335, :338-340 |
| `getHITLContinuation(scenarioName, approved, edits)` | agent.js:348 |
| `tokenize(text, confidence)` chunks 2-4 words per token event | agent.js:306, :316 |
| Nothing in the file performs I/O — every scenario is a literal array | agent.js:82-300 |

### SCENARIO ROUTER — all 8 entries, in code order (invariant card)

`matchScenario` walks `Object.entries(SCENARIOS)` in declaration order and
returns on the **first** regex that tests true. `default` is explicitly skipped
inside the loop and only returned as the fallback after the loop.

| # | Key | Trigger | Builder | Citation |
|---|---|---|---|---|
| 1 | `refund_policy` | `/refund\|return\|money back/i` | `buildRefundScenario` | agent.js:49, :82 |
| 2 | `send_email` | `/send.*email\|email.*customer\|notify/i` | `buildEmailScenario` | agent.js:55, :135 |
| 3 | `database_query` | `/database\|sql\|query\|records\|delete/i` | `buildDatabaseScenario` | agent.js:58, :177 |
| 4 | `rate_limit` | `/rate.?limit\|too many\|429/i` | `buildRateLimitScenario` | agent.js:61, :223 |
| 5 | `context_long` | `/context.*long\|too long\|summarize/i` | `buildContextLongScenario` | agent.js:65, :237 |
| 6 | `timeout` | `/timeout\|slow\|taking long/i` | `buildTimeoutScenario` | agent.js:69, :251 |
| 7 | `network_error` | `/network\|disconnect\|offline/i` | `buildNetworkErrorScenario` | agent.js:73, :266 |
| 8 | `default` | `/.*/` | `buildDefaultScenario` | agent.js:77, :279 |

Loop skips `default` — agent.js:337. Fallback return — agent.js:342.
Only entries 2 and 3 emit a `hitl` event (agent.js:144-158, :186-201) and only
those two have named continuation builders (agent.js:163, :205); every other
scenario falls through to the generic continuation at agent.js:355-358.

## The browser client — `public/chat.js` and `public/index.html`

| Fact | Citation |
|---|---|
| Loaded by the static shell as a plain `<script>` — no bundler, no framework | index.html:56, :7 |
| `startStreaming` opens `new EventSource(url)` with message + id in the query | chat.js:67, :72, :73 |
| Nine `addEventListener` registrations on the EventSource | chat.js:80, :88, :107, :122, :131, :147, :153, :172, :182 |
| `stopGeneration()` POSTs `{ messageId }` to `/api/chat/stop` | chat.js:208, :210-214 |
| `resolveHITL(actionId, approved)` POSTs `{ actionId, approved, edits }` | chat.js:432, :461-465 |
| `toggleHITLEdit` swaps the `<pre>` preview for a `<textarea>` | chat.js:407, :421-426 |

### The trust renderers

| Signal | Renderer | Citation |
|---|---|---|
| Confidence | `appendToken` — badge only on transition INTO medium/low; `high` renders plain | chat.js:246, :253, :257 |
| Citation | `appendCitation` — numbered `<a>` with hover tooltip (title + passage) | chat.js:279, :290-296 |
| Sources footer | `appendSourcesList` on `done`, only when citations were collected | chat.js:302, :187 |
| Thinking | `createThinkingIndicator` with `role="status"`, replaced on each event | chat.js:331, :91 |
| HITL | `createHITLCard` with `role="dialog"`; per-type preview for email vs SQL | chat.js:344, :351, :364 |
| Errors | `handleAgentError` — one branch per code | chat.js:472, :479 |

### TYPED ERROR BRANCHES — the complete switch, in code order (invariant card)

`handleAgentError` switches on `error.code`; five branches exist, no more.

| # | Code | UI treatment | Citation |
|---|---|---|---|
| 1 | `rate_limit` | live countdown, 1s interval; server also auto-retries | chat.js:480, :495-503 (server.js:103-122) |
| 2 | `context_too_long` | "Summarize and Continue" / "Start New Chat" | chat.js:507, :515-516 |
| 3 | `timeout` | "Try Again" / "Dismiss", prints `elapsed` seconds | chat.js:523, :529-532 |
| 4 | `network_error` | "Retry Now"; header status flips to Disconnected | chat.js:539, :547, :551 |
| 5 | `default` | generic "Something Went Wrong" + "Try Again" | chat.js:556, :564 |

Note the asymmetry: branch 1 does **not** call `finishStreaming()` (the stream
is still alive server-side, server.js:103-122); branches 2-5 all do —
chat.js:520, :536, :553, :568.

## Artifact written

| Artifact | Written by | Citation |
|---|---|---|
| `localStorage["chat_history_v1"]` — the raw `#messages` innerHTML | `saveHistory()` | chat.js:13, :636, :638 |
| Restored on load, then streaming cursors and thinking indicators are stripped | `loadHistory()` | chat.js:642, :644, :648-649 |
| Cleared by "New Chat" | `newChat()` | chat.js:606, :609 |

This is the **only** durable state in the whole system. The server keeps
everything in two Maps that die with the process (server.js:14, :16).

## README drift (claim vs code)

The README's ASCII shows `Mock Agent (agent.js)` containing the
`pendingApprovals Map`. In code the Map lives in **server.js:16** — `agent.js`
holds no state at all. The diagram follows the code.

---

## Deliberately NOT drawn (L1 scope discipline)

- The HITL state machine (`STREAMING → AWAITING_APPROVAL → APPROVED/REJECTED`,
  README:88-89) — **L2**, a different altitude, per `DIAGRAM_RULES_LLD.md`.
- The per-event ordering of one stream (thinking → token → citation → done) —
  **L2b sequence**, not space.
- `GET /api/sources/:id` (server.js:169) and `GET /api/health` (server.js:179) —
  real routes, but neither is on the trust-signal path; drawing them would push
  the box count past the L1 ceiling.
- `public/styles.css` (833 lines, including the confidence underline treatments
  and the 480px mobile breakpoint) — presentation, not architecture.
- `tokenize()` (agent.js:306) and `processMarkdown()` (chat.js:662) — function
  level detail, excluded by the L1 content rules.

## Portability notes — rules that needed bending for this domain

Recorded because "rules bent per new domain" is the harness's portability metric.
This is the theme's second non-FTS codebase, after `agent_harness_v1`.

1. **`component.mock` was not used, though this project is entirely mocked.**
   The mock-ness here is not a separate *place* — `agent.js` IS the mock, so it
   carries `component.agent` and the boundary label states MOCK. A token that
   describes a property rather than a place does not survive contact with a
   codebase whose mock is a first-class module.
2. **`component.artifact` = browser `localStorage`, not a file.** The token held
   (durable output), but the zone had to be labelled *browser-side* and drawn
   under the browser boundary, not in a server-side artifact zone. The exemplar's
   layout convention ("④ artifacts, bottom right") assumes the process that
   writes durable state is the process the diagram centres on. Here it is not.
3. **`boundary.datasource` for the browser.** The browser is the request origin,
   not a data source. `boundary.entry`/`boundary.client` is missing from the
   vocabulary; `datasource` was the least wrong of the five.
4. **`edge.stop` generalised cleanly** — it was minted for a trading kill switch
   and lands exactly on the user's Stop button and the `aborted` flag. Keep it.
5. **No `edge.data_in` consumer for a network fetch.** Every "data in" here is a
   literal in the same process. The token was still used (agent.js lookups), but
   its meaning shifted from *crosses the network* to *reads a corpus*.
