import express from "express";
import { fileURLToPath } from "url";
import path from "path";
import { matchScenario, getHITLContinuation, SOURCES } from "./agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// ── In-memory state ──────────────────────────────────────────────────
// Maps messageId -> { scenarioName, events (remaining), aborted }
const activeStreams = new Map();
// Maps actionId -> { scenarioName, resolve }
const pendingApprovals = new Map();

// ── SSE: stream a response ──────────────────────────────────────────
app.get("/api/chat/stream", (req, res) => {
  const userMessage = req.query.message;
  const messageId = req.query.id || crypto.randomUUID();

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const { name: scenarioName, events } = matchScenario(userMessage);
  const streamState = { scenarioName, aborted: false };
  activeStreams.set(messageId, streamState);

  send("stream_start", { messageId });

  (async () => {
    for (const evt of events) {
      if (streamState.aborted) {
        send("stream_stop", { messageId, reason: "user_stopped" });
        break;
      }

      switch (evt.type) {
        case "thinking":
          send("thinking", { step: evt.step });
          await sleep(evt.duration || 500);
          break;

        case "token":
          send("token", {
            text: evt.text,
            confidence: evt.confidence
          });
          await sleep(30 + Math.random() * 40); // 30-70ms per token chunk
          break;

        case "citation":
          const source = SOURCES.find(s => s.id === evt.sourceId);
          if (source) {
            send("citation", source);
          }
          break;

        case "hitl": {
          send("hitl_request", evt.action);
          // Wait for approval
          const result = await new Promise(resolve => {
            pendingApprovals.set(evt.action.id, {
              scenarioName,
              resolve
            });
          });
          // Stream continuation
          const contEvents = getHITLContinuation(
            scenarioName,
            result.approved,
            result.edits
          );
          for (const contEvt of contEvents) {
            if (streamState.aborted) break;
            if (contEvt.type === "token") {
              send("token", { text: contEvt.text, confidence: contEvt.confidence });
              await sleep(30 + Math.random() * 40);
            } else if (contEvt.type === "thinking") {
              send("thinking", { step: contEvt.step });
              await sleep(contEvt.duration || 500);
            } else if (contEvt.type === "done") {
              send("done", { messageId });
            }
          }
          activeStreams.delete(messageId);
          res.end();
          return; // HITL scenario already sent "done"
        }

        case "error":
          send("error", evt.error);
          // For rate limit, simulate retry after delay
          if (evt.error.code === "rate_limit") {
            await sleep((evt.error.retry_after || 5) * 1000);
            // Retry with default scenario
            send("thinking", { step: "Retrying request..." });
            await sleep(500);
            send("thinking", { step: "Generating response..." });
            await sleep(400);
            const retryTokens = [
              { type: "token", text: "I'm back! ", confidence: null },
              { type: "token", text: "The rate limit has cleared. ", confidence: null },
              { type: "token", text: "How can I help you?", confidence: null }
            ];
            for (const t of retryTokens) {
              send("token", { text: t.text, confidence: t.confidence });
              await sleep(50);
            }
            send("done", { messageId });
            activeStreams.delete(messageId);
            res.end();
            return;
          }
          activeStreams.delete(messageId);
          res.end();
          return;

        case "done":
          send("done", { messageId });
          break;
      }
    }

    activeStreams.delete(messageId);
    res.end();
  })();

  req.on("close", () => {
    streamState.aborted = true;
    activeStreams.delete(messageId);
  });
});

// ── Stop generation ──────────────────────────────────────────────────
app.post("/api/chat/stop", (req, res) => {
  const { messageId } = req.body;
  const stream = activeStreams.get(messageId);
  if (stream) {
    stream.aborted = true;
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: "Stream not found" });
  }
});

// ── HITL: approve / reject ──────────────────────────────────────────
app.post("/api/hitl/resolve", (req, res) => {
  const { actionId, approved, edits } = req.body;
  const pending = pendingApprovals.get(actionId);
  if (!pending) {
    return res.status(404).json({ error: "No pending action with that ID" });
  }
  pending.resolve({ approved, edits });
  pendingApprovals.delete(actionId);
  res.json({ ok: true, approved });
});

// ── Sources endpoint (for hover preview) ─────────────────────────────
app.get("/api/sources/:id", (req, res) => {
  const source = SOURCES.find(s => s.id === parseInt(req.params.id));
  if (source) {
    res.json(source);
  } else {
    res.status(404).json({ error: "Source not found" });
  }
});

// ── Health ────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export { app };

export function startServer(port = 3000) {
  return new Promise(resolve => {
    const server = app.listen(port, () => {
      console.log(`Chat UI server running at http://localhost:${port}`);
      resolve(server);
    });
  });
}
