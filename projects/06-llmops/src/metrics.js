/**
 * SQLite Metrics Store
 *
 * Logs every routed request: model, tokens, latency, cost, success, escalation.
 * Provides aggregate queries for the dashboard.
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const DB_PATH    = join(__dirname, '..', 'metrics.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    migrate();
  }
  return db;
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp     TEXT    NOT NULL DEFAULT (datetime('now')),
      query_preview TEXT,
      complexity    REAL,
      tier          TEXT,
      model         TEXT    NOT NULL,
      tokens_in     INTEGER DEFAULT 0,
      tokens_out    INTEGER DEFAULT 0,
      cost_usd      REAL    DEFAULT 0,
      latency_ms    INTEGER DEFAULT 0,
      success       INTEGER DEFAULT 1,
      escalated     INTEGER DEFAULT 0,
      escalation_reason TEXT,
      response_preview  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp);
    CREATE INDEX IF NOT EXISTS idx_requests_model     ON requests(model);
  `);
}

// ── write ───────────────────────────────────────────────────────────────

const insertStmt = () => getDb().prepare(`
  INSERT INTO requests
    (query_preview, complexity, tier, model, tokens_in, tokens_out,
     cost_usd, latency_ms, success, escalated, escalation_reason, response_preview)
  VALUES
    (@query_preview, @complexity, @tier, @model, @tokens_in, @tokens_out,
     @cost_usd, @latency_ms, @success, @escalated, @escalation_reason, @response_preview)
`);

let _insert;
export function logRequest(params) {
  if (!_insert) _insert = insertStmt();
  return _insert.run({
    query_preview:     (params.query_preview || '').slice(0, 200),
    complexity:        params.complexity ?? 0,
    tier:              params.tier ?? 'unknown',
    model:             params.model ?? 'unknown',
    tokens_in:         params.tokens_in ?? 0,
    tokens_out:        params.tokens_out ?? 0,
    cost_usd:          params.cost_usd ?? 0,
    latency_ms:        params.latency_ms ?? 0,
    success:           params.success ? 1 : 0,
    escalated:         params.escalated ? 1 : 0,
    escalation_reason: params.escalation_reason ?? null,
    response_preview:  (params.response_preview || '').slice(0, 300),
  });
}

// ── read (dashboard queries) ────────────────────────────────────────────

export function totalCost(sinceDatetime) {
  const row = getDb()
    .prepare(`SELECT COALESCE(SUM(cost_usd), 0) as total FROM requests WHERE timestamp >= ?`)
    .get(sinceDatetime);
  return row.total;
}

export function costByModel() {
  return getDb()
    .prepare(`
      SELECT model,
             COUNT(*)               as request_count,
             COALESCE(SUM(cost_usd), 0)  as total_cost,
             COALESCE(AVG(cost_usd), 0)  as avg_cost,
             COALESCE(SUM(tokens_in + tokens_out), 0) as total_tokens
      FROM requests
      GROUP BY model
      ORDER BY total_cost DESC
    `)
    .all();
}

export function avgLatencyByModel() {
  return getDb()
    .prepare(`
      SELECT model,
             ROUND(AVG(latency_ms), 0) as avg_latency_ms,
             ROUND(MIN(latency_ms), 0) as min_latency_ms,
             ROUND(MAX(latency_ms), 0) as max_latency_ms
      FROM requests
      GROUP BY model
    `)
    .all();
}

export function escalationStats() {
  const row = getDb()
    .prepare(`
      SELECT COUNT(*) as total,
             SUM(escalated) as escalated_count,
             ROUND(100.0 * SUM(escalated) / MAX(COUNT(*), 1), 1) as escalation_pct
      FROM requests
    `)
    .get();
  return row;
}

export function requestsPerHour() {
  return getDb()
    .prepare(`
      SELECT strftime('%Y-%m-%d %H:00', timestamp) as hour,
             COUNT(*) as count,
             COALESCE(SUM(cost_usd), 0) as cost
      FROM requests
      GROUP BY hour
      ORDER BY hour DESC
      LIMIT 24
    `)
    .all();
}

export function tierDistribution() {
  return getDb()
    .prepare(`
      SELECT tier,
             COUNT(*) as count,
             ROUND(100.0 * COUNT(*) / (SELECT MAX(COUNT(*), 1) FROM requests), 1) as pct
      FROM requests
      GROUP BY tier
    `)
    .all();
}

export function topExpensiveRequests(limit = 10) {
  return getDb()
    .prepare(`
      SELECT id, timestamp, query_preview, model, cost_usd, tokens_in, tokens_out, latency_ms, escalated
      FROM requests
      ORDER BY cost_usd DESC
      LIMIT ?
    `)
    .all(limit);
}

export function savingsVsFrontier() {
  // Compare actual cost to what it would have cost if everything went to the most expensive model
  const row = getDb()
    .prepare(`
      SELECT COALESCE(SUM(cost_usd), 0) as actual_cost,
             COUNT(*) as total_requests,
             COALESCE(SUM(tokens_in + tokens_out), 0) as total_tokens
      FROM requests
    `)
    .get();

  // Frontier model pricing: ~$15/1M input + ~$75/1M output (Opus-class)
  // Approximate: use avg $0.045 per 1K tokens as frontier cost
  const frontierCostPer1k = 0.045;
  const hypotheticalCost  = (row.total_tokens / 1000) * frontierCostPer1k;

  return {
    actual_cost:       row.actual_cost,
    frontier_cost:     Math.round(hypotheticalCost * 10000) / 10000,
    savings_usd:       Math.round((hypotheticalCost - row.actual_cost) * 10000) / 10000,
    savings_pct:       hypotheticalCost > 0
      ? Math.round((1 - row.actual_cost / hypotheticalCost) * 1000) / 10
      : 0,
    total_requests:    row.total_requests,
  };
}

export function recentRequests(limit = 50) {
  return getDb()
    .prepare(`
      SELECT id, timestamp, query_preview, complexity, tier, model,
             tokens_in, tokens_out, cost_usd, latency_ms, success, escalated, escalation_reason
      FROM requests
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(limit);
}
