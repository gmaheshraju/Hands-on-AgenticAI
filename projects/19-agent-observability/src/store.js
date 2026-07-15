import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY,
  agent TEXT,
  model TEXT,
  workflow TEXT,
  user_id TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  total_tokens INTEGER,
  total_cost REAL,
  status TEXT
);

CREATE TABLE IF NOT EXISTS spans (
  id TEXT PRIMARY KEY,
  trace_id TEXT REFERENCES traces(id),
  parent_span_id TEXT,
  name TEXT,
  model TEXT,
  provider TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  latency_ms REAL,
  cost REAL,
  status TEXT,
  tool_calls TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS cost_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id TEXT,
  span_id TEXT,
  agent TEXT,
  model TEXT,
  user_id TEXT,
  workflow TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost REAL,
  timestamp INTEGER
);

CREATE TABLE IF NOT EXISTS quality_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id TEXT,
  span_id TEXT,
  agent TEXT,
  model TEXT,
  score REAL,
  criteria TEXT,
  feedback TEXT,
  timestamp INTEGER
);

CREATE TABLE IF NOT EXISTS drift_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric TEXT,
  agent TEXT,
  model TEXT,
  severity TEXT,
  baseline_mean REAL,
  baseline_std REAL,
  current_value REAL,
  z_score REAL,
  message TEXT,
  timestamp INTEGER,
  resolved INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS metrics_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_name TEXT,
  value REAL,
  agent TEXT,
  model TEXT,
  timestamp INTEGER
);

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT,
  scope_value TEXT,
  daily_limit REAL,
  weekly_limit REAL,
  monthly_limit REAL
);

CREATE INDEX IF NOT EXISTS idx_spans_trace_id ON spans(trace_id);
CREATE INDEX IF NOT EXISTS idx_cost_records_timestamp ON cost_records(timestamp);
CREATE INDEX IF NOT EXISTS idx_cost_records_agent ON cost_records(agent);
CREATE INDEX IF NOT EXISTS idx_quality_scores_timestamp ON quality_scores(timestamp);
CREATE INDEX IF NOT EXISTS idx_drift_alerts_resolved ON drift_alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_metrics_snapshots_name ON metrics_snapshots(metric_name);
CREATE INDEX IF NOT EXISTS idx_traces_started_at ON traces(started_at);
`;

export class Store {
  constructor(dbPath = './observability.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this._runMigrations();
  }

  _runMigrations() {
    const statements = MIGRATIONS.split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    for (const stmt of statements) {
      this.db.exec(stmt + ';');
    }
  }

  // ─── Traces ───────────────────────────────────────────────

  insertTrace(trace) {
    const stmt = this.db.prepare(`
      INSERT INTO traces (id, agent, model, workflow, user_id, started_at, ended_at, total_tokens, total_cost, status)
      VALUES (@id, @agent, @model, @workflow, @user_id, @started_at, @ended_at, @total_tokens, @total_cost, @status)
    `);
    stmt.run({
      id: trace.id || randomUUID(),
      agent: trace.agent || null,
      model: trace.model || null,
      workflow: trace.workflow || null,
      user_id: trace.user_id || null,
      started_at: trace.started_at || Date.now(),
      ended_at: trace.ended_at || null,
      total_tokens: trace.total_tokens || 0,
      total_cost: trace.total_cost || 0,
      status: trace.status || 'running',
    });
    return trace.id;
  }

  updateTrace(id, updates) {
    const allowed = ['agent', 'model', 'workflow', 'user_id', 'started_at', 'ended_at', 'total_tokens', 'total_cost', 'status'];
    const setClauses = [];
    const params = { id };
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = @${key}`);
        params[key] = updates[key];
      }
    }
    if (setClauses.length === 0) return;
    const stmt = this.db.prepare(`UPDATE traces SET ${setClauses.join(', ')} WHERE id = @id`);
    stmt.run(params);
  }

  getTrace(id) {
    return this.db.prepare('SELECT * FROM traces WHERE id = ?').get(id);
  }

  getTraceSpans(traceId) {
    return this.db.prepare('SELECT * FROM spans WHERE trace_id = ? ORDER BY started_at ASC').all(traceId);
  }

  getTraces(filters = {}) {
    const conditions = [];
    const params = {};

    if (filters.agent) {
      conditions.push('agent = @agent');
      params.agent = filters.agent;
    }
    if (filters.model) {
      conditions.push('model = @model');
      params.model = filters.model;
    }
    if (filters.status) {
      conditions.push('status = @status');
      params.status = filters.status;
    }
    if (filters.timeRange) {
      if (filters.timeRange.start) {
        conditions.push('started_at >= @timeStart');
        params.timeStart = filters.timeRange.start;
      }
      if (filters.timeRange.end) {
        conditions.push('started_at <= @timeEnd');
        params.timeEnd = filters.timeRange.end;
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    return this.db.prepare(
      `SELECT * FROM traces ${where} ORDER BY started_at DESC LIMIT @limit OFFSET @offset`
    ).all({ ...params, limit, offset });
  }

  // ─── Spans ────────────────────────────────────────────────

  insertSpan(span) {
    const stmt = this.db.prepare(`
      INSERT INTO spans (id, trace_id, parent_span_id, name, model, provider, prompt_tokens, completion_tokens, total_tokens, latency_ms, cost, status, tool_calls, started_at, ended_at, metadata)
      VALUES (@id, @trace_id, @parent_span_id, @name, @model, @provider, @prompt_tokens, @completion_tokens, @total_tokens, @latency_ms, @cost, @status, @tool_calls, @started_at, @ended_at, @metadata)
    `);
    stmt.run({
      id: span.id || randomUUID(),
      trace_id: span.trace_id,
      parent_span_id: span.parent_span_id || null,
      name: span.name || null,
      model: span.model || null,
      provider: span.provider || null,
      prompt_tokens: span.prompt_tokens || 0,
      completion_tokens: span.completion_tokens || 0,
      total_tokens: span.total_tokens || 0,
      latency_ms: span.latency_ms || 0,
      cost: span.cost || 0,
      status: span.status || 'ok',
      tool_calls: typeof span.tool_calls === 'string' ? span.tool_calls : JSON.stringify(span.tool_calls || null),
      started_at: span.started_at || Date.now(),
      ended_at: span.ended_at || null,
      metadata: typeof span.metadata === 'string' ? span.metadata : JSON.stringify(span.metadata || null),
    });
    return span.id;
  }

  // ─── Cost Records ─────────────────────────────────────────

  insertCostRecord(record) {
    const stmt = this.db.prepare(`
      INSERT INTO cost_records (trace_id, span_id, agent, model, user_id, workflow, input_tokens, output_tokens, cost, timestamp)
      VALUES (@trace_id, @span_id, @agent, @model, @user_id, @workflow, @input_tokens, @output_tokens, @cost, @timestamp)
    `);
    stmt.run({
      trace_id: record.trace_id || null,
      span_id: record.span_id || null,
      agent: record.agent || null,
      model: record.model || null,
      user_id: record.user_id || null,
      workflow: record.workflow || null,
      input_tokens: record.input_tokens || 0,
      output_tokens: record.output_tokens || 0,
      cost: record.cost || 0,
      timestamp: record.timestamp || Date.now(),
    });
  }

  getCostAggregation(groupBy = 'day', timeRange = {}, filters = {}) {
    const bucketExpr = {
      hour:  `(timestamp / 3600000) * 3600000`,
      day:   `(timestamp / 86400000) * 86400000`,
      week:  `(timestamp / 604800000) * 604800000`,
    }[groupBy] || `(timestamp / 86400000) * 86400000`;

    const conditions = [];
    const params = {};

    if (timeRange.start) {
      conditions.push('timestamp >= @timeStart');
      params.timeStart = timeRange.start;
    }
    if (timeRange.end) {
      conditions.push('timestamp <= @timeEnd');
      params.timeEnd = timeRange.end;
    }
    if (filters.agent) {
      conditions.push('agent = @agent');
      params.agent = filters.agent;
    }
    if (filters.model) {
      conditions.push('model = @model');
      params.model = filters.model;
    }
    if (filters.user_id) {
      conditions.push('user_id = @user_id');
      params.user_id = filters.user_id;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return this.db.prepare(`
      SELECT
        ${bucketExpr} AS bucket,
        SUM(cost) AS total_cost,
        SUM(input_tokens) AS total_input_tokens,
        SUM(output_tokens) AS total_output_tokens,
        COUNT(*) AS record_count
      FROM cost_records
      ${where}
      GROUP BY bucket
      ORDER BY bucket ASC
    `).all(params);
  }

  getDailyCost(agent) {
    const now = Date.now();
    const startOfDay = now - (now % 86400000);
    const params = { startOfDay };
    let agentClause = '';
    if (agent) {
      agentClause = ' AND agent = @agent';
      params.agent = agent;
    }
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(cost), 0) AS total FROM cost_records WHERE timestamp >= @startOfDay${agentClause}`
    ).get(params);
    return row.total;
  }

  getWeeklyCost(agent) {
    const weekAgo = Date.now() - 7 * 86400000;
    const params = { weekAgo };
    let agentClause = '';
    if (agent) {
      agentClause = ' AND agent = @agent';
      params.agent = agent;
    }
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(cost), 0) AS total FROM cost_records WHERE timestamp >= @weekAgo${agentClause}`
    ).get(params);
    return row.total;
  }

  // ─── Quality Scores ───────────────────────────────────────

  insertQualityScore(score) {
    const stmt = this.db.prepare(`
      INSERT INTO quality_scores (trace_id, span_id, agent, model, score, criteria, feedback, timestamp)
      VALUES (@trace_id, @span_id, @agent, @model, @score, @criteria, @feedback, @timestamp)
    `);
    stmt.run({
      trace_id: score.trace_id || null,
      span_id: score.span_id || null,
      agent: score.agent || null,
      model: score.model || null,
      score: score.score,
      criteria: score.criteria || null,
      feedback: score.feedback || null,
      timestamp: score.timestamp || Date.now(),
    });
  }

  getQualityScores(filters = {}) {
    const conditions = [];
    const params = {};

    if (filters.agent) {
      conditions.push('agent = @agent');
      params.agent = filters.agent;
    }
    if (filters.model) {
      conditions.push('model = @model');
      params.model = filters.model;
    }
    if (filters.timeRange) {
      if (filters.timeRange.start) {
        conditions.push('timestamp >= @timeStart');
        params.timeStart = filters.timeRange.start;
      }
      if (filters.timeRange.end) {
        conditions.push('timestamp <= @timeEnd');
        params.timeEnd = filters.timeRange.end;
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const rows = this.db.prepare(
      `SELECT * FROM quality_scores ${where} ORDER BY timestamp DESC LIMIT @limit OFFSET @offset`
    ).all({ ...params, limit, offset });

    if (filters.rollingAverage && rows.length > 0) {
      const window = filters.rollingAverage;
      const averages = [];
      for (let i = 0; i < rows.length; i++) {
        const windowSlice = rows.slice(Math.max(0, i - window + 1), i + 1);
        const avg = windowSlice.reduce((sum, r) => sum + r.score, 0) / windowSlice.length;
        averages.push({ ...rows[i], rolling_avg: Math.round(avg * 1000) / 1000 });
      }
      return averages;
    }

    return rows;
  }

  // ─── Drift Alerts ─────────────────────────────────────────

  insertDriftAlert(alert) {
    const stmt = this.db.prepare(`
      INSERT INTO drift_alerts (metric, agent, model, severity, baseline_mean, baseline_std, current_value, z_score, message, timestamp, resolved)
      VALUES (@metric, @agent, @model, @severity, @baseline_mean, @baseline_std, @current_value, @z_score, @message, @timestamp, @resolved)
    `);
    const info = stmt.run({
      metric: alert.metric,
      agent: alert.agent || null,
      model: alert.model || null,
      severity: alert.severity || 'warning',
      baseline_mean: alert.baseline_mean || 0,
      baseline_std: alert.baseline_std || 0,
      current_value: alert.current_value || 0,
      z_score: alert.z_score || 0,
      message: alert.message || '',
      timestamp: alert.timestamp || Date.now(),
      resolved: alert.resolved || 0,
    });
    return info.lastInsertRowid;
  }

  resolveDriftAlert(id) {
    this.db.prepare('UPDATE drift_alerts SET resolved = 1 WHERE id = ?').run(id);
  }

  getDriftAlerts(filters = {}) {
    const conditions = [];
    const params = {};

    if (filters.resolved !== undefined) {
      conditions.push('resolved = @resolved');
      params.resolved = filters.resolved ? 1 : 0;
    }
    if (filters.severity) {
      conditions.push('severity = @severity');
      params.severity = filters.severity;
    }
    if (filters.metric) {
      conditions.push('metric = @metric');
      params.metric = filters.metric;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.db.prepare(
      `SELECT * FROM drift_alerts ${where} ORDER BY timestamp DESC`
    ).all(params);
  }

  // ─── Metrics Snapshots ────────────────────────────────────

  insertMetricsSnapshot(snapshot) {
    const stmt = this.db.prepare(`
      INSERT INTO metrics_snapshots (metric_name, value, agent, model, timestamp)
      VALUES (@metric_name, @value, @agent, @model, @timestamp)
    `);
    stmt.run({
      metric_name: snapshot.metric_name,
      value: snapshot.value,
      agent: snapshot.agent || null,
      model: snapshot.model || null,
      timestamp: snapshot.timestamp || Date.now(),
    });
  }

  getMetricsSnapshots(metricName, timeRange = {}) {
    const conditions = ['metric_name = @metric_name'];
    const params = { metric_name: metricName };

    if (timeRange.start) {
      conditions.push('timestamp >= @timeStart');
      params.timeStart = timeRange.start;
    }
    if (timeRange.end) {
      conditions.push('timestamp <= @timeEnd');
      params.timeEnd = timeRange.end;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    return this.db.prepare(
      `SELECT * FROM metrics_snapshots ${where} ORDER BY timestamp ASC`
    ).all(params);
  }

  // ─── Budgets ──────────────────────────────────────────────

  setBudget(scope, scopeValue, limits) {
    const existing = this.getBudget(scope, scopeValue);
    if (existing) {
      this.db.prepare(`
        UPDATE budgets SET daily_limit = @daily_limit, weekly_limit = @weekly_limit, monthly_limit = @monthly_limit
        WHERE scope = @scope AND scope_value = @scope_value
      `).run({
        scope,
        scope_value: scopeValue,
        daily_limit: limits.daily_limit || null,
        weekly_limit: limits.weekly_limit || null,
        monthly_limit: limits.monthly_limit || null,
      });
    } else {
      this.db.prepare(`
        INSERT INTO budgets (scope, scope_value, daily_limit, weekly_limit, monthly_limit)
        VALUES (@scope, @scope_value, @daily_limit, @weekly_limit, @monthly_limit)
      `).run({
        scope,
        scope_value: scopeValue,
        daily_limit: limits.daily_limit || null,
        weekly_limit: limits.weekly_limit || null,
        monthly_limit: limits.monthly_limit || null,
      });
    }
  }

  getBudget(scope, scopeValue) {
    return this.db.prepare(
      'SELECT * FROM budgets WHERE scope = ? AND scope_value = ?'
    ).get(scope, scopeValue);
  }

  // ─── Stats ────────────────────────────────────────────────

  getStats() {
    const traceStats = this.db.prepare(`
      SELECT
        COUNT(*) AS total_traces,
        COALESCE(SUM(total_cost), 0) AS total_cost,
        COALESCE(AVG(total_tokens), 0) AS avg_tokens
      FROM traces
    `).get();

    const latencyStats = this.db.prepare(`
      SELECT COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
      FROM spans
    `).get();

    const qualityStats = this.db.prepare(`
      SELECT COALESCE(AVG(score), 0) AS avg_quality
      FROM quality_scores
    `).get();

    const unresolvedAlerts = this.db.prepare(`
      SELECT COUNT(*) AS count FROM drift_alerts WHERE resolved = 0
    `).get();

    return {
      total_traces: traceStats.total_traces,
      total_cost: Math.round(traceStats.total_cost * 10000) / 10000,
      avg_tokens: Math.round(traceStats.avg_tokens),
      avg_latency_ms: Math.round(latencyStats.avg_latency_ms * 100) / 100,
      avg_quality: Math.round(qualityStats.avg_quality * 1000) / 1000,
      unresolved_drift_alerts: unresolvedAlerts.count,
    };
  }

  close() {
    this.db.close();
  }
}

export default Store;
