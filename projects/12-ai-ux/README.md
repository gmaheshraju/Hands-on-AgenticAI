# Project 12: Production Chat UI with Trust Signals

A chat interface demonstrating seven UX patterns that build user trust in AI systems: streaming responses, confidence indicators, source citations, human-in-the-loop approval, specific error states, thinking indicators, and persistent message history.

## Quick Start

```bash
npm install
npm run demo
# Open http://localhost:3000
```

## Demo Scenarios

Type these messages in the chat to trigger each pattern:

| Message | Pattern Demonstrated |
|---------|---------------------|
| `What is the refund policy?` | Streaming + confidence levels + inline citations |
| `Send an email to the customer` | HITL approval flow (approve / reject / edit) |
| `Delete duplicate database records` | HITL with SQL preview + warning |
| `rate limit` | Auto-retry countdown (429 handling) |
| `context too long` | Context window error with summarize option |
| `timeout` | Timeout recovery with retry |
| `network error` | Connection lost with reconnect |

## Architecture

```
Client (vanilla JS)          Server (Express)
  |                              |
  |--- GET /api/chat/stream ---->|  SSE connection
  |<--- event: thinking ---------|  "Searching knowledge base..."
  |<--- event: token ------------|  Token-by-token streaming
  |<--- event: citation ---------|  Inline source reference
  |<--- event: hitl_request -----|  Pause for approval
  |                              |
  |--- POST /api/hitl/resolve -->|  User approves/rejects
  |<--- event: token ------------|  Agent continues
  |<--- event: done -------------|  Stream complete
  |                              |
  |--- POST /api/chat/stop ----->|  Stop generation
```

### SSE Event Types

- `stream_start` — stream initialized
- `thinking` — agent status update (tool calls in progress)
- `token` — text chunk with optional confidence level
- `citation` — source reference with title, URL, passage
- `hitl_request` — action requiring user approval
- `error` — typed error (rate_limit, context_too_long, timeout, network_error)
- `stream_stop` — user stopped generation
- `done` — stream complete

### HITL State Machine

```
STREAMING --> AWAITING_APPROVAL --> APPROVED --> STREAMING (continuation)
                                --> REJECTED --> STREAMING (cancellation message)
```

The server holds the SSE connection open during HITL. A Promise in the stream handler awaits resolution via `POST /api/hitl/resolve`. The agent then streams continuation events on the same connection.

## Files

```
src/
  server.js    Express server with SSE streaming + HITL endpoints
  agent.js     Mock agent producing scripted scenarios
  demo.js      Entry point
public/
  index.html   Chat UI shell
  styles.css   Responsive styles (375px mobile support, dark mode)
  chat.js      Client-side SSE handling, HITL flow, error states
```

## Key Design Decisions

1. **SSE over WebSocket** — unidirectional server-to-client streaming is all we need; SSE reconnects automatically and works through proxies.

2. **Typed errors** — each error code gets a specific UI treatment (countdown, retry button, summarize option) instead of a generic "something went wrong."

3. **Confidence rendering** — high confidence renders normally, medium gets a dotted underline, low gets a dashed underline + italic + "uncertain" badge. The visual hierarchy communicates trustworthiness without interrupting reading flow.

4. **HITL as Promise** — the server's stream handler awaits a Promise that resolves when the approval endpoint is hit. This keeps the SSE connection alive and avoids complex state management.

5. **localStorage persistence** — conversation survives page refresh. "New Chat" clears it.
