import { startServer } from "./server.js";

const PORT = process.env.PORT || 3000;

startServer(PORT).then(() => {
  console.log(`
  ┌─────────────────────────────────────────────────┐
  │  Production Chat UI with Trust Signals           │
  │                                                  │
  │  Open: http://localhost:${PORT}                     │
  │                                                  │
  │  Demo scenarios (type these in the chat):        │
  │                                                  │
  │  • "What is the refund policy?"                  │
  │    → Streaming + citations + confidence levels   │
  │                                                  │
  │  • "Send an email to the customer"               │
  │    → HITL approval flow (approve/reject/edit)    │
  │                                                  │
  │  • "Delete duplicate database records"           │
  │    → HITL with SQL preview                       │
  │                                                  │
  │  • "rate limit"                                  │
  │    → 429 auto-retry with countdown               │
  │                                                  │
  │  • "context too long"                            │
  │    → Context window error                        │
  │                                                  │
  │  • "timeout"                                     │
  │    → Model timeout recovery                      │
  │                                                  │
  │  • "network error"                               │
  │    → Network disconnection handler               │
  │                                                  │
  └─────────────────────────────────────────────────┘
  `);
});
