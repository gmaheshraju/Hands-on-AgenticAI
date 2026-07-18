import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import config from './config.js';
import { DB } from './db.js';
import { LLMAdapter } from './llm.js';
import { StreamManager } from './streams.js';
import { runAgent } from './agent.js';
import { Guardrails } from './guardrails.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const db = new DB(config.db.path);
const llm = new LLMAdapter({ verbose: true });
const streams = new StreamManager();

// ── Threads ────────────────────────────────────────────────────────

app.post('/api/threads', (req, res) => {
  const thread = db.createThread(req.body.provider || 'ollama');
  res.json(thread);
});

app.get('/api/threads', (_req, res) => {
  res.json(db.listThreads());
});

app.get('/api/threads/:id', (req, res) => {
  const thread = db.getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const messages = db.getActiveBranch(thread.id);
  const activeStream = streams.getActiveMessageForThread(thread.id);

  res.json({
    ...thread,
    messages: messages.map(formatMessage),
    streaming: activeStream ? streams.isStreaming(activeStream) : false,
    activeStreamMsgId: activeStream,
  });
});

app.patch('/api/threads/:id', (req, res) => {
  if (req.body.provider) db.updateThreadProvider(req.params.id, req.body.provider);
  if (req.body.title) db.updateThreadTitle(req.params.id, req.body.title);
  res.json(db.getThread(req.params.id));
});

// ── Branches ───────────────────────────────────────────────────────

app.get('/api/threads/:id/branches/:msgId', (req, res) => {
  const children = db.getBranchChildren(req.params.msgId, req.params.id);
  res.json(children.map(formatMessage));
});

app.get('/api/threads/:id/chain/:msgId', (req, res) => {
  const chain = db.getAncestorChain(req.params.msgId);
  res.json(chain.map(formatMessage));
});

// ── Messages ───────────────────────────────────────────────────────

app.post('/api/threads/:id/messages', (req, res) => {
  const thread = db.getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const { content, parentId } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Content required' });

  let resolvedParent;
  if (parentId === null || parentId === '__root__') {
    resolvedParent = null;
  } else if (parentId) {
    resolvedParent = parentId;
  } else {
    const branch = db.getActiveBranch(thread.id);
    resolvedParent = branch.length > 0 ? branch[branch.length - 1].id : null;
  }

  const msgId = crypto.randomUUID();
  startAgentStream(thread, content, resolvedParent, msgId);

  res.json({ messageId: msgId, threadId: thread.id });
});

app.post('/api/threads/:id/regenerate/:msgId', (req, res) => {
  const thread = db.getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const origMsg = db.getMessage(req.params.msgId);
  if (!origMsg || origMsg.role !== 'assistant') {
    return res.status(400).json({ error: 'Can only regenerate assistant messages' });
  }

  const userMsg = db.getMessage(origMsg.parent_id);
  if (!userMsg) return res.status(400).json({ error: 'Parent user message not found' });

  const msgId = crypto.randomUUID();
  startAgentStream(thread, userMsg.content, userMsg.parent_id, msgId);

  res.json({ messageId: msgId, threadId: thread.id });
});

// ── SSE Stream ─────────────────────────────────────────────────────

app.get('/api/threads/:id/stream', (req, res) => {
  const threadId = req.params.id;
  const msgId = req.query.msgId;
  const afterId = req.query.after;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ threadId })}\n\n`);

  let targetMsgId = msgId;

  if (!targetMsgId && afterId) {
    targetMsgId = streams.getActiveMessageForThread(threadId);
    if (targetMsgId) {
      const thread = db.getThread(threadId);
      if (thread) {
        const messages = db.getActiveBranch(threadId);
        res.write(`event: history\ndata: ${JSON.stringify({ messages: messages.map(formatMessage) })}\n\n`);
      }
    }
  }

  if (!targetMsgId) {
    targetMsgId = streams.getActiveMessageForThread(threadId);
  }

  if (targetMsgId) {
    const result = streams.subscribe(targetMsgId, res);
    if (result === 'completed') {
      res.write(`event: stream_end\ndata: {}\n\n`);
      res.end();
      return;
    }
    if (result) {
      req.on('close', () => streams.unsubscribe(targetMsgId, res));
      return;
    }
  }

  res.write(`event: no_stream\ndata: {}\n\n`);
  res.end();
});

// ── Stop ───────────────────────────────────────────────────────────

app.post('/api/chat/stop', (req, res) => {
  const { messageId } = req.body;
  if (messageId && streams.isStreaming(messageId)) {
    streams.abort(messageId);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'No active stream' });
  }
});

// ── Providers ──────────────────────────────────────────────────────

app.get('/api/providers', async (_req, res) => {
  const health = await llm.healthCheck();
  res.json(health);
});

// ── Harness Stats ─────────────────────────────────────────────────

app.get('/api/harness/stats', (_req, res) => {
  const toolStats = db.getToolStats();
  const totalLessons = toolStats.reduce((s, t) => s + t.total_calls, 0);
  res.json({ tools: toolStats, totalLessons });
});

app.get('/api/harness/lessons', (req, res) => {
  const query = req.query.q || '';
  if (query) {
    res.json(db.getRelevantLessons(query, 10));
  } else {
    const all = db.getToolStats();
    res.json(all);
  }
});

// ── Audit Trail ──────────────────────────────────────────────────────

app.get('/api/audit', (req, res) => {
  const type = req.query.type || null;
  const limit = parseInt(req.query.limit, 10) || 50;
  res.json(db.getAuditEntries(type, limit));
});

app.get('/api/audit/stats', (_req, res) => {
  res.json(db.getAuditStats());
});

// ── Guardrail Stats ─────────────────────────────────────────────────

app.get('/api/guardrails/stats', (_req, res) => {
  const guardrails = new Guardrails(db);
  res.json(guardrails.getStats());
});

// ── Agent Observability ─────────────────────────────────────────────

app.get('/api/runs', (req, res) => {
  const threadId = req.query.threadId || null;
  const limit = parseInt(req.query.limit, 10) || 20;
  res.json(db.listAgentRuns(threadId, limit));
});

app.get('/api/runs/stats', (_req, res) => {
  res.json(db.getAgentRunStats());
});

app.get('/api/runs/tools', (_req, res) => {
  res.json(db.getToolEffectiveness());
});

app.get('/api/runs/strategies', (_req, res) => {
  res.json(db.getStrategyBreakdown());
});

app.get('/api/runs/:id', (req, res) => {
  const run = db.getRunWithDecisions(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

// ── Feedback ────────────────────────────────────────────────────────

app.post('/api/feedback', (req, res) => {
  const { messageId, threadId, runId, rating, comment } = req.body;
  if (!messageId || !threadId || ![1, -1].includes(rating)) {
    return res.status(400).json({ error: 'messageId, threadId, and rating (1 or -1) required' });
  }
  const result = db.addFeedback({ messageId, threadId, runId: runId || null, rating, comment });
  res.json(result);
});

app.get('/api/feedback/stats', (_req, res) => {
  res.json({
    overall: db.getFeedbackStats(),
    byStrategy: db.getFeedbackByRun(),
  });
});

// ── Config ──────────────────────────────────────────────────────────

app.get('/api/config', (_req, res) => {
  res.json({
    features: config.features,
    agent: {
      maxToolRounds: config.agent.maxToolRounds,
      reasoningTemperature: config.agent.reasoningTemperature,
      answerTemperature: config.agent.answerTemperature,
    },
    context: {
      maxMessages: config.context.maxMessages,
      summaryThreshold: config.context.summaryThreshold,
    },
    llm: {
      ollama: { model: config.llm.ollama.model },
      nvidia: { model: config.llm.nvidia.model },
      gemini: { model: config.llm.gemini.model },
    },
  });
});

// ── Health ──────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ── Agent orchestration ────────────────────────────────────────────

function startAgentStream(thread, content, parentMsgId, streamMsgId) {
  streams.start(streamMsgId, thread.id);
  streams.emit(streamMsgId, 'stream_start', { messageId: streamMsgId, threadId: thread.id });

  const threadMessages = db.getActiveBranch(thread.id);

  const providerLlm = new LLMAdapter({
    providers: [thread.provider || 'ollama'],
    verbose: true,
  });

  const agentGen = runAgent(content, threadMessages, {
    llm: providerLlm,
    db,
    threadId: thread.id,
    parentMsgId,
    abortSignal: () => streams.isAborted(streamMsgId),
  });

  (async () => {
    try {
      for await (const evt of agentGen) {
        if (streams.isAborted(streamMsgId)) break;
        streams.emit(streamMsgId, evt.event, evt.data);
      }
    } catch (err) {
      console.error(`[agent] Error in stream ${streamMsgId}:`, err.message);
      streams.emit(streamMsgId, 'error', { code: 'agent_error', message: err.message });
    } finally {
      streams.finish(streamMsgId);
    }
  })();
}

function formatMessage(m) {
  return {
    id: m.id,
    threadId: m.thread_id,
    parentId: m.parent_id,
    role: m.role,
    content: m.content,
    reasoning: m.reasoning ? JSON.parse(m.reasoning) : null,
    toolCalls: m.tool_calls ? JSON.parse(m.tool_calls) : null,
    harness: m.harness_meta ? JSON.parse(m.harness_meta) : null,
    branchPoint: !!m.branch_point,
    createdAt: m.created_at,
  };
}

// ── Start ──────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT, 10) || config.server.port;
app.listen(PORT, () => {
  console.log(`Agent Chat server running at http://localhost:${PORT}`);
});
