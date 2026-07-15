# Capstone 12: Production Chat UI with Trust Signals

## The Problem

You've built an AI agent (any of the previous capstones). It works in the terminal. Now your product team says: "Make it usable by non-engineers." That means a chat UI with streaming, confidence indicators, source citations, human-in-the-loop approval for risky actions, and graceful error states. Not a wrapper around a text box — a product that builds trust.

## What You Build

A web-based chat interface that connects to any LLM-powered agent and demonstrates production UX patterns.

## Architecture Requirements

1. **Streaming responses** — Token-by-token display using Server-Sent Events (SSE). The user sees the response being generated in real time. Include a "stop generating" button.

2. **Confidence indicators** — When the agent cites sources or makes claims:
   - High confidence: solid citation with a clickable source link
   - Medium confidence: highlighted with "based on available information" qualifier
   - Low confidence: explicit disclaimer "I'm not certain about this"
   
   Implementation: the agent returns a confidence field per claim. The UI renders them differently.

3. **Source citations** — Inline citations that link to source documents. Hover to preview the relevant passage. Format: "According to [Source Title]^[1], the refund policy is 30 days."

4. **Human-in-the-loop (HITL)** — When the agent wants to perform a risky action (send an email, modify a record, execute code), it pauses and shows:
   - What action it wants to take
   - Preview of the action (email draft, SQL query, etc.)
   - "Approve" / "Reject" / "Edit" buttons
   - The agent only proceeds after approval

5. **Error states** — Not just "something went wrong":
   - Rate limit hit: "I'm getting a lot of requests. Retrying in 3 seconds..." (auto-retry with countdown)
   - Context too long: "This conversation is getting long. I'll summarize and continue."
   - Model timeout: "The AI is taking longer than expected. Would you like to wait or try a simpler question?"
   - Network error: "Connection lost. Your message was saved — I'll send it when reconnected."

6. **Thinking indicators** — While the agent is processing (before streaming starts):
   - Show what the agent is doing: "Searching knowledge base...", "Reading 3 documents...", "Generating response..."
   - Not a generic spinner — actual status updates from the agent's tool calls

7. **Message history** — Persist conversation in localStorage. Allow "new conversation" to reset context.

## What Makes This Not a Toy

- Streaming SSE is tricky: you need to handle partial JSON, network disconnects, and backpressure
- HITL requires the agent to pause mid-execution and resume after approval — this breaks the simple request-response model
- Error states must be specific and actionable, not generic error messages
- Thinking indicators require the backend to send progress events during tool execution, not just the final response
- Mobile responsiveness: chat UIs that only work on desktop are not products

## Evaluation Criteria

- Streaming: does the response appear token-by-token? Can you stop generation mid-response?
- HITL: trigger an action that requires approval. Does the flow work? Can you edit before approving?
- Error handling: simulate a rate limit (429 response). Does the UI handle it gracefully?
- Thinking indicators: trigger a multi-tool agent call. Do you see status updates?
- Mobile: does it work on a 375px viewport?
- Accessibility: can you navigate the chat with keyboard only? Do screen readers work?

## Stack

- React or vanilla JS for the frontend
- Node.js (Express) or Python (FastAPI) for the backend
- Server-Sent Events for streaming
- Any LLM API with streaming support
- localStorage for message persistence

## Staff+ Interview Angle

"I built a production chat UI with four trust-building patterns: streaming with stop-generation, inline source citations, human-in-the-loop approval for risky actions, and specific error states. The HITL flow was the hardest — the agent needs to pause mid-execution, serialize its state, wait for approval, then resume. I implemented it as a state machine: RUNNING → AWAITING_APPROVAL → APPROVED/REJECTED → RUNNING. The biggest UX insight: showing what the agent is doing ('Searching knowledge base...') during the thinking phase reduced perceived latency dramatically, even though actual latency didn't change."
