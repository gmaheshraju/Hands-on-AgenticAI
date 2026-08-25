# FACTS — 12-ai-ux, Stop during a HITL pause (L2b, extracted 2026-08-25)

Source of truth: `projects/12-ai-ux/src/server.js`. **Every participant, message
and note below cites code. The diagram may contain nothing that is not on this
page.**

Altitude: **L2b — time.** Which endpoints exist is L1; `aborted` is a boolean
with no transition table, so there is no L2. The defect is entirely about *when*
the flag is written relative to when it is read.

Claims marked `[RAN]` were produced by starting the real server, driving it over
HTTP, and reading the SSE event stream. Transcript at the bottom.

## Why this project earned an L2b

The stop mechanism is a flag, and every read of it is correct. What is wrong is
that between the two reads there is an `await` that may never resolve — so the
window in which a stop is honoured has a hole in it, and the hole is exactly
where the user is most likely to press the button.

## Participants

| Lifeline | What it is | Where |
|---|---|---|
| `browser` | the chat client holding the SSE connection | `server.js:19` |
| `SSE handler` | the async loop writing events | `server.js:40-136` |
| `streamState` | `{ scenarioName, aborted }`, one per message | `server.js:35`, `server.js:36` |
| `pendingApprovals` | actionId → the parked `resolve` | `server.js:16`, `server.js:72` |
| `POST /stop` | the stop endpoint, a separate request | `server.js:145-154` |

## Where `aborted` is read, and where it is not

`streamState.aborted` starts false (`server.js:35`) and is read in exactly two
places:

| Read | Where | When it runs |
|---|---|---|
| top of the main event loop | `server.js:42` | once per event, before each event is sent |
| top of the continuation loop | `server.js:84` | only **after** the HITL promise resolves |

The `hitl` case at `server.js:68-97` sends `hitl_request` (`server.js:69`) and
then parks on a promise whose `resolve` is stored in `pendingApprovals`
(`server.js:71-76`). That promise is resolved in one place only:
`POST /api/hitl/resolve` at `server.js:163`.

**While parked, no read of `aborted` is reachable.** `server.js:42` has already
run for this event; `server.js:84` is behind the await.

## What the stop endpoint does, and does not do

`POST /api/chat/stop` (`server.js:145-154`) looks the stream up in
`activeStreams`, sets `stream.aborted = true` (`server.js:149`), and replies
`{ ok: true }` (`server.js:150`).

It does **not** resolve the pending approval, does not write to the SSE
response, and does not delete anything. So when the handler is parked at
`server.js:71`, the entire effect of pressing Stop is one boolean nobody will
read.

## The measurement `[RAN]`

Real server, real HTTP, a message matching the `send_email` scenario
(`agent.js:53`) so the stream reaches a HITL pause:

```
reached the HITL await          : true
events so far                   : stream_start, thinking, token, hitl_request

POST /api/chat/stop replied     : 200 {"ok":true}
  stream_stop event received?   : false
  done event received?          : false
  SSE connection closed?        : false
  events after stop             : stream_start, thinking, token, hitl_request
  second stop still finds it    : true (activeStreams still holds it)
```

The endpoint reports success. Two and a half seconds later nothing has changed,
and a second stop for the same id still returns 200 — so the entry is still in
`activeStreams`.

## What is left behind

Because the handler never leaves the await:

- `send("stream_stop", ...)` at `server.js:43` never runs, so the client is
  never told the stream ended.
- `res.end()` never runs — neither the HITL exit at `server.js:96` nor the
  normal one at `server.js:135`. The SSE connection stays open.
- `activeStreams.delete(messageId)` never runs — not at `server.js:95`, not at
  `server.js:134`. Confirmed above by the second stop returning 200.
- `pendingApprovals.delete(actionId)` never runs; it is deleted only at
  `server.js:164`, inside the resolve handler that was never called.

The one path that does clean up is `req.on("close")` at `server.js:138-141`,
which fires if the *browser* disconnects. It sets `aborted` and removes the
stream from `activeStreams` — but it cannot unpark the promise either, so the
async function and its `pendingApprovals` entry survive the client that created
them. After that, a stop for the same id returns 404 (`server.js:152`) while the
handler is still parked.

## Deliberately NOT drawn

- The other six scenarios (`agent.js:47-77`). Only the two HITL ones reach the
  parking await; the rest are the case that works.
- Token pacing, citations and confidence (`server.js:53-66`). They are events
  inside the loop that reads `aborted` correctly.
- The rate-limit retry at `server.js:103-110`, which sleeps for seconds inside
  the loop. Its sleep is not a parking await — the next iteration reads
  `aborted` at `server.js:42` — so a stop during it IS honoured, late.
- The browser's own state. The client is out of scope here; the server-side
  facts are enough to establish that no terminal event is ever sent.

## Verification

```
$ npm ci --ignore-scripts     # lockfile sha256 unchanged
$ node probe_ux.mjs
reached the HITL await          : true
POST /api/chat/stop replied     : 200 {"ok":true}
  stream_stop event received?   : false
  done event received?          : false
  SSE connection closed?        : false
  second stop still finds it    : true
```
