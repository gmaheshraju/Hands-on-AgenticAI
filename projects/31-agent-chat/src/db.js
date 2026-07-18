import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import crypto from 'node:crypto';
import config from './config.js';

export class DB {
  constructor(dbPath = config.db.path) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this._initSchema();
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        title TEXT,
        provider TEXT DEFAULT 'ollama',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads(id),
        parent_id TEXT REFERENCES messages(id),
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        reasoning TEXT,
        tool_calls TEXT,
        branch_point INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
      CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id);

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        thread_id TEXT,
        detail TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_log(type);
      CREATE INDEX IF NOT EXISTS idx_audit_thread ON audit_log(thread_id);

      CREATE TABLE IF NOT EXISTS context_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL UNIQUE REFERENCES threads(id),
        summary TEXT NOT NULL,
        message_count INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tool_lessons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_name TEXT NOT NULL,
        query_pattern TEXT NOT NULL,
        was_useful INTEGER NOT NULL DEFAULT 1,
        latency_ms INTEGER,
        context TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_tool_lessons_tool ON tool_lessons(tool_name);

      CREATE TABLE IF NOT EXISTS interrupted_contexts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL REFERENCES threads(id),
        user_message TEXT NOT NULL,
        reasoning TEXT,
        tool_calls TEXT,
        partial_answer TEXT,
        messages_snapshot TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_interrupted_thread ON interrupted_contexts(thread_id);

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        thread_id TEXT REFERENCES threads(id),
        user_message TEXT,
        outcome TEXT DEFAULT 'running',
        strategy TEXT,
        total_decisions INTEGER DEFAULT 0,
        productive_decisions INTEGER DEFAULT 0,
        wasted_decisions INTEGER DEFAULT 0,
        tool_roi_score REAL DEFAULT 0,
        reasoning_coherence REAL DEFAULT 0,
        tokens_in INTEGER DEFAULT 0,
        tokens_out INTEGER DEFAULT 0,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        duration_ms INTEGER,
        provider TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_agent_runs_thread ON agent_runs(thread_id);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_outcome ON agent_runs(outcome);

      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES agent_runs(id),
        sequence INTEGER NOT NULL,
        thought TEXT,
        action TEXT NOT NULL,
        input TEXT,
        tokens_in INTEGER DEFAULT 0,
        tokens_out INTEGER DEFAULT 0,
        latency_ms INTEGER DEFAULT 0,
        provider TEXT,
        tool_result TEXT,
        tool_duration_ms INTEGER,
        tool_error TEXT,
        tool_result_used INTEGER DEFAULT 0,
        productive INTEGER,
        confidence_signals TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_decisions_run ON decisions(run_id);
      CREATE INDEX IF NOT EXISTS idx_decisions_action ON decisions(action);

      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL REFERENCES messages(id),
        thread_id TEXT NOT NULL REFERENCES threads(id),
        run_id TEXT REFERENCES agent_runs(id),
        rating INTEGER NOT NULL CHECK(rating IN (-1, 1)),
        comment TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_feedback_message ON feedback(message_id);
      CREATE INDEX IF NOT EXISTS idx_feedback_thread ON feedback(thread_id);
      CREATE INDEX IF NOT EXISTS idx_feedback_run ON feedback(run_id);

      CREATE TABLE IF NOT EXISTS facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL,
        predicate TEXT NOT NULL,
        object TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
        subject, predicate, object,
        content=facts, content_rowid=id
      );

      CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
        INSERT INTO facts_fts(rowid, subject, predicate, object)
        VALUES (new.id, new.subject, new.predicate, new.object);
      END;

      CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
        INSERT INTO facts_fts(facts_fts, rowid, subject, predicate, object)
        VALUES ('delete', old.id, old.subject, old.predicate, old.object);
      END;
    `);

    try {
      this.db.exec('ALTER TABLE messages ADD COLUMN harness_meta TEXT');
    } catch { /* column already exists */ }
  }

  // ── Threads ──────────────────────────────────────────────────────

  createThread(provider = 'ollama') {
    const id = crypto.randomUUID();
    this.db.prepare('INSERT INTO threads (id, provider) VALUES (?, ?)').run(id, provider);
    return this.getThread(id);
  }

  getThread(id) {
    return this.db.prepare('SELECT * FROM threads WHERE id = ?').get(id);
  }

  listThreads(limit = config.db.defaultThreadLimit) {
    return this.db.prepare('SELECT * FROM threads ORDER BY updated_at DESC LIMIT ?').all(limit);
  }

  updateThreadTitle(id, title) {
    this.db.prepare('UPDATE threads SET title = ?, updated_at = datetime(\'now\') WHERE id = ?').run(title, id);
  }

  updateThreadProvider(id, provider) {
    this.db.prepare('UPDATE threads SET provider = ?, updated_at = datetime(\'now\') WHERE id = ?').run(provider, id);
  }

  // ── Messages ─────────────────────────────────────────────────────

  addMessage(threadId, role, content, opts = {}) {
    const id = crypto.randomUUID();
    const { parentId = null, reasoning = null, toolCalls = null, harnessMeta = null } = opts;
    let branchPoint = 0;

    if (parentId) {
      const siblings = this.db.prepare(
        'SELECT COUNT(*) as c FROM messages WHERE parent_id = ?'
      ).get(parentId);
      if (siblings.c > 0) {
        this.db.prepare('UPDATE messages SET branch_point = 1 WHERE id = ?').run(parentId);
      }
    } else {
      const rootSiblings = this.db.prepare(
        'SELECT COUNT(*) as c FROM messages WHERE parent_id IS NULL AND thread_id = ? AND role = ?'
      ).get(threadId, role);
      if (rootSiblings.c > 0) {
        this.db.prepare(
          'UPDATE messages SET branch_point = 1 WHERE parent_id IS NULL AND thread_id = ? AND role = ?'
        ).run(threadId, role);
        branchPoint = 1;
      }
    }

    this.db.prepare(`
      INSERT INTO messages (id, thread_id, parent_id, role, content, reasoning, tool_calls, branch_point, harness_meta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, threadId, parentId, role, content, reasoning, toolCalls, branchPoint, harnessMeta);

    this.db.prepare('UPDATE threads SET updated_at = datetime(\'now\') WHERE id = ?').run(threadId);

    return { id, threadId, parentId, role, content, reasoning, toolCalls };
  }

  getMessage(id) {
    return this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  }

  getThreadMessages(threadId) {
    return this.db.prepare(
      'SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC'
    ).all(threadId);
  }

  getActiveBranch(threadId) {
    const all = this.getThreadMessages(threadId);
    if (all.length === 0) return [];

    const childMap = new Map();
    const msgMap = new Map();
    for (const m of all) {
      msgMap.set(m.id, m);
      const key = m.parent_id || '__root__';
      if (!childMap.has(key)) childMap.set(key, []);
      childMap.get(key).push(m);
    }

    const branch = [];
    let currentParent = '__root__';
    while (true) {
      const children = childMap.get(currentParent);
      if (!children || children.length === 0) break;
      const latest = children[children.length - 1];
      branch.push(latest);
      currentParent = latest.id;
    }
    return branch;
  }

  getBranchChildren(messageId, threadId) {
    if (messageId === '__root__') {
      return this.db.prepare(
        'SELECT * FROM messages WHERE parent_id IS NULL AND thread_id = ? ORDER BY created_at ASC'
      ).all(threadId);
    }
    return this.db.prepare(
      'SELECT * FROM messages WHERE parent_id = ? ORDER BY created_at ASC'
    ).all(messageId);
  }

  getAncestorChain(messageId) {
    const chain = [];
    let current = this.getMessage(messageId);
    while (current) {
      chain.unshift(current);
      current = current.parent_id ? this.getMessage(current.parent_id) : null;
    }
    return chain;
  }

  // ── Audit Trail ──────────────────────────────────────────────────

  addAuditEntry({ type, threadId = null, detail = null }) {
    this.db.prepare(
      'INSERT INTO audit_log (type, thread_id, detail) VALUES (?, ?, ?)'
    ).run(type, threadId, detail);
  }

  getAuditEntries(type = null, limit = config.db.defaultAuditLimit) {
    if (type) {
      return this.db.prepare(
        'SELECT * FROM audit_log WHERE type = ? ORDER BY created_at DESC LIMIT ?'
      ).all(type, limit);
    }
    return this.db.prepare(
      'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
  }

  getAuditStats() {
    return this.db.prepare(`
      SELECT type, COUNT(*) as count,
        MIN(created_at) as first_at,
        MAX(created_at) as last_at
      FROM audit_log
      GROUP BY type
      ORDER BY count DESC
    `).all();
  }

  // ── Context Summaries ───────────────────────────────────────────

  getContextSummary(threadId) {
    return this.db.prepare(
      'SELECT * FROM context_summaries WHERE thread_id = ?'
    ).get(threadId);
  }

  saveContextSummary(threadId, summary, messageCount) {
    this.db.prepare(`
      INSERT INTO context_summaries (thread_id, summary, message_count)
      VALUES (?, ?, ?)
      ON CONFLICT(thread_id) DO UPDATE SET
        summary = excluded.summary,
        message_count = excluded.message_count,
        updated_at = datetime('now')
    `).run(threadId, summary, messageCount);
  }

  // ── Tool Lessons ─────────────────────────────────────────────────

  addToolLesson(toolName, queryPattern, wasUseful, latencyMs, context = '') {
    this.db.prepare(
      'INSERT INTO tool_lessons (tool_name, query_pattern, was_useful, latency_ms, context) VALUES (?, ?, ?, ?, ?)'
    ).run(toolName, queryPattern, wasUseful ? 1 : 0, latencyMs, context);
  }

  getToolLessons(toolName, limit = 5) {
    return this.db.prepare(
      'SELECT * FROM tool_lessons WHERE tool_name = ? ORDER BY created_at DESC LIMIT ?'
    ).all(toolName, limit);
  }

  getRelevantLessons(query, limit = 3) {
    const words = query.toLowerCase().split(/\s+/).slice(0, 4);
    const lessons = this.db.prepare(
      'SELECT tool_name, query_pattern, was_useful, latency_ms, context FROM tool_lessons ORDER BY created_at DESC LIMIT 50'
    ).all();

    return lessons
      .map(l => {
        const overlap = words.filter(w => l.query_pattern.toLowerCase().includes(w)).length;
        return { ...l, relevance: overlap };
      })
      .filter(l => l.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  getToolStats() {
    return this.db.prepare(`
      SELECT tool_name,
        COUNT(*) as total_calls,
        SUM(was_useful) as useful_calls,
        ROUND(AVG(latency_ms)) as avg_latency_ms,
        ROUND(100.0 * SUM(was_useful) / COUNT(*), 1) as success_rate
      FROM tool_lessons
      GROUP BY tool_name
      ORDER BY total_calls DESC
    `).all();
  }

  // ── Interrupted Contexts ────────────────────────────────────────

  saveInterruptedContext(threadId, userMessage, reasoning, toolCalls, partialAnswer, messagesSnapshot) {
    this.db.prepare(
      'INSERT INTO interrupted_contexts (thread_id, user_message, reasoning, tool_calls, partial_answer, messages_snapshot) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(threadId, userMessage, reasoning, toolCalls, partialAnswer, messagesSnapshot);
  }

  getInterruptedContext(threadId) {
    return this.db.prepare(
      'SELECT * FROM interrupted_contexts WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(threadId);
  }

  clearInterruptedContext(threadId) {
    this.db.prepare('DELETE FROM interrupted_contexts WHERE thread_id = ?').run(threadId);
  }

  // ── Agent Runs ───────────────────────────────────────────────────

  createAgentRun({ id, threadId, userMessage, startTime }) {
    this.db.prepare(
      'INSERT INTO agent_runs (id, thread_id, user_message, start_time) VALUES (?, ?, ?, ?)'
    ).run(id, threadId, userMessage, startTime);
  }

  endAgentRun(runId, { endTime, outcome, strategy, totalDecisions, productiveDecisions, wastedDecisions, toolRoiScore, reasoningCoherence, tokensIn, tokensOut, provider }) {
    const startTime = this.db.prepare('SELECT start_time FROM agent_runs WHERE id = ?').get(runId)?.start_time;
    const durationMs = startTime ? endTime - startTime : 0;
    this.db.prepare(`
      UPDATE agent_runs SET end_time = ?, duration_ms = ?, outcome = ?, strategy = ?,
        total_decisions = ?, productive_decisions = ?, wasted_decisions = ?,
        tool_roi_score = ?, reasoning_coherence = ?,
        tokens_in = ?, tokens_out = ?, provider = ?
      WHERE id = ?
    `).run(endTime, durationMs, outcome, strategy, totalDecisions, productiveDecisions, wastedDecisions, toolRoiScore, reasoningCoherence, tokensIn, tokensOut, provider, runId);
  }

  createDecision(d) {
    this.db.prepare(`
      INSERT INTO decisions (id, run_id, sequence, thought, action, input, tokens_in, tokens_out, latency_ms, provider, tool_result, tool_duration_ms, tool_error, tool_result_used, productive, confidence_signals)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(d.id, d.runId, d.sequence, d.thought, d.action, d.input, d.tokensIn, d.tokensOut, d.latencyMs, d.provider, d.toolResult, d.toolDurationMs || null, d.toolError || null, d.toolResultUsed ? 1 : 0, d.productive === null ? null : (d.productive ? 1 : 0), d.confidenceSignals);
  }

  getAgentRun(runId) {
    return this.db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(runId);
  }

  getRunWithDecisions(runId) {
    const run = this.getAgentRun(runId);
    if (!run) return null;
    const decisions = this.db.prepare(
      'SELECT * FROM decisions WHERE run_id = ? ORDER BY sequence ASC'
    ).all(runId);
    return {
      ...run,
      decisions: decisions.map(d => ({
        ...d,
        input: d.input ? JSON.parse(d.input) : {},
        confidenceSignals: d.confidence_signals ? JSON.parse(d.confidence_signals) : [],
        productive: d.productive === null ? null : !!d.productive,
        toolResultUsed: !!d.tool_result_used,
      })),
    };
  }

  listAgentRuns(threadId = null, limit = 20) {
    if (threadId) {
      return this.db.prepare(
        'SELECT * FROM agent_runs WHERE thread_id = ? ORDER BY start_time DESC LIMIT ?'
      ).all(threadId, limit);
    }
    return this.db.prepare(
      'SELECT * FROM agent_runs ORDER BY start_time DESC LIMIT ?'
    ).all(limit);
  }

  getAgentRunStats() {
    return this.db.prepare(`
      SELECT
        COUNT(*) as total_runs,
        ROUND(AVG(total_decisions), 1) as avg_decisions,
        ROUND(AVG(tool_roi_score), 2) as avg_tool_roi,
        ROUND(AVG(reasoning_coherence), 2) as avg_coherence,
        ROUND(100.0 * SUM(productive_decisions) / NULLIF(SUM(total_decisions), 0), 1) as productivity_rate,
        SUM(tokens_in + tokens_out) as total_tokens,
        ROUND(AVG(duration_ms)) as avg_duration_ms,
        SUM(CASE WHEN outcome = 'answered' THEN 1 ELSE 0 END) as answered,
        SUM(CASE WHEN outcome = 'blocked' THEN 1 ELSE 0 END) as blocked,
        SUM(CASE WHEN outcome = 'error' THEN 1 ELSE 0 END) as errored
      FROM agent_runs WHERE outcome != 'running'
    `).get();
  }

  getToolEffectiveness() {
    return this.db.prepare(`
      SELECT
        action as tool_name,
        COUNT(*) as times_called,
        SUM(tool_result_used) as times_used_in_answer,
        ROUND(100.0 * SUM(tool_result_used) / COUNT(*), 1) as roi_pct,
        ROUND(AVG(tool_duration_ms)) as avg_latency_ms,
        SUM(CASE WHEN productive = 1 THEN 1 ELSE 0 END) as productive_calls,
        SUM(CASE WHEN productive = 0 THEN 1 ELSE 0 END) as wasted_calls
      FROM decisions
      WHERE action != 'respond' AND tool_result IS NOT NULL
      GROUP BY action
      ORDER BY times_called DESC
    `).all();
  }

  getStrategyBreakdown() {
    return this.db.prepare(`
      SELECT
        strategy,
        COUNT(*) as count,
        ROUND(AVG(duration_ms)) as avg_duration_ms,
        ROUND(AVG(tokens_in + tokens_out)) as avg_tokens,
        ROUND(AVG(tool_roi_score), 2) as avg_tool_roi,
        ROUND(AVG(reasoning_coherence), 2) as avg_coherence
      FROM agent_runs WHERE outcome != 'running'
      GROUP BY strategy
      ORDER BY count DESC
    `).all();
  }

  // ── Feedback ─────────────────────────────────────────────────────

  addFeedback({ messageId, threadId, runId, rating, comment }) {
    const existing = this.db.prepare(
      'SELECT id FROM feedback WHERE message_id = ?'
    ).get(messageId);

    if (existing) {
      this.db.prepare(
        'UPDATE feedback SET rating = ?, comment = ?, created_at = datetime(\'now\') WHERE message_id = ?'
      ).run(rating, comment || null, messageId);
      return { id: existing.id, action: 'updated' };
    }

    const result = this.db.prepare(
      'INSERT INTO feedback (message_id, thread_id, run_id, rating, comment) VALUES (?, ?, ?, ?, ?)'
    ).run(messageId, threadId, runId || null, rating, comment || null);
    return { id: result.lastInsertRowid, action: 'created' };
  }

  getFeedback(messageId) {
    return this.db.prepare('SELECT * FROM feedback WHERE message_id = ?').get(messageId);
  }

  getFeedbackStats() {
    return this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END) as negative,
        ROUND(100.0 * SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) as satisfaction_pct
      FROM feedback
    `).get();
  }

  getFeedbackByRun() {
    return this.db.prepare(`
      SELECT
        ar.strategy,
        COUNT(f.id) as feedback_count,
        SUM(CASE WHEN f.rating = 1 THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN f.rating = -1 THEN 1 ELSE 0 END) as negative,
        ROUND(100.0 * SUM(CASE WHEN f.rating = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(f.id), 0), 1) as satisfaction_pct
      FROM feedback f
      LEFT JOIN agent_runs ar ON f.run_id = ar.id
      GROUP BY ar.strategy
      ORDER BY feedback_count DESC
    `).all();
  }

  // ── Facts ────────────────────────────────────────────────────────

  addFact(subject, predicate, object, confidence = 1.0) {
    const existing = this.db.prepare(
      'SELECT * FROM facts WHERE LOWER(subject) = LOWER(?) AND LOWER(predicate) = LOWER(?)'
    ).all(subject, predicate);

    for (const fact of existing) {
      if (fact.object.toLowerCase() === object.toLowerCase()) {
        this.db.prepare(
          'UPDATE facts SET confidence = MIN(1.0, confidence + 0.1) WHERE id = ?'
        ).run(fact.id);
        return { id: fact.id, action: 'reinforced' };
      }
    }

    const result = this.db.prepare(
      'INSERT INTO facts (subject, predicate, object, confidence) VALUES (?, ?, ?, ?)'
    ).run(subject, predicate, object, confidence);
    return { id: result.lastInsertRowid, action: 'created' };
  }

  searchFacts(query) {
    if (!query.trim()) return [];
    const terms = query.split(/\s+/).slice(0, 5).map(t => `"${t.replace(/"/g, '')}"`).join(' OR ');
    try {
      return this.db.prepare(`
        SELECT f.* FROM facts f
        JOIN facts_fts ON facts_fts.rowid = f.id
        WHERE facts_fts MATCH ? AND f.confidence > 0.1
        ORDER BY rank LIMIT 10
      `).all(terms);
    } catch {
      return [];
    }
  }

  close() {
    this.db.close();
  }
}
