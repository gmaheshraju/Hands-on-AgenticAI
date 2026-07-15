import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Store } from './store.js';
import { CostTracker } from './costTracker.js';
import { QualityScorer } from './qualityScorer.js';
import { DriftDetector } from './driftDetector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startDashboard(dbPath) {
  const store = new Store(dbPath);
  const costTracker = new CostTracker(store);
  const qualityScorer = new QualityScorer(store);
  const driftDetector = new DriftDetector(store);

  const app = express();
  const port = process.env.PORT || 3000;

  // Static files
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // JSON body parser
  app.use(express.json());

  // CORS headers
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  // ---------- API Endpoints ----------

  // 1. GET /api/stats — overview stats
  app.get('/api/stats', (req, res) => {
    try {
      const db = store.db;

      const totalTraces = db.prepare('SELECT COUNT(*) as cnt FROM traces').get().cnt;

      const avgLatencyRow = db.prepare('SELECT AVG(latency_ms) as avg FROM spans WHERE latency_ms IS NOT NULL').get();
      const avgLatency = avgLatencyRow.avg || 0;

      const totalCostRow = db.prepare('SELECT SUM(cost) as total FROM cost_records').get();
      const totalCost = totalCostRow.total || 0;

      const avgQualityRow = db.prepare('SELECT AVG(score) as avg FROM quality_scores').get();
      const avgQuality = avgQualityRow.avg || 0;

      const unresolvedAlerts = db.prepare('SELECT COUNT(*) as cnt FROM drift_alerts WHERE resolved = 0').get().cnt;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayMs = todayStart.getTime();

      const requestsToday = db.prepare('SELECT COUNT(*) as cnt FROM traces WHERE started_at >= ?').get(todayMs).cnt;
      const costTodayRow = db.prepare('SELECT SUM(cost) as total FROM cost_records WHERE timestamp >= ?').get(todayMs);
      const costToday = costTodayRow.total || 0;

      res.json({ totalTraces, avgLatency, totalCost, avgQuality, unresolvedAlerts, requestsToday, costToday });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. GET /api/traces — list traces with filtering
  app.get('/api/traces', (req, res) => {
    try {
      const db = store.db;
      const { agent, model, status, from, to } = req.query;
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      let where = [];
      let params = [];

      if (agent) { where.push('agent = ?'); params.push(agent); }
      if (model) { where.push('model = ?'); params.push(model); }
      if (status) { where.push('status = ?'); params.push(status); }
      if (from) { where.push('started_at >= ?'); params.push(Number(from)); }
      if (to) { where.push('started_at <= ?'); params.push(Number(to)); }

      const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

      const total = db.prepare(`SELECT COUNT(*) as cnt FROM traces ${whereClause}`).get(...params).cnt;
      const traces = db.prepare(`SELECT * FROM traces ${whereClause} ORDER BY started_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

      res.json({ traces, total });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. GET /api/traces/:id — single trace with all spans
  app.get('/api/traces/:id', (req, res) => {
    try {
      const db = store.db;
      const trace = db.prepare('SELECT * FROM traces WHERE trace_id = ?').get(req.params.id);
      if (!trace) return res.status(404).json({ error: 'Trace not found' });

      const spans = db.prepare('SELECT * FROM spans WHERE trace_id = ? ORDER BY started_at ASC').all(req.params.id);
      res.json({ trace, spans });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. GET /api/costs — cost data
  app.get('/api/costs', (req, res) => {
    try {
      const db = store.db;
      const { groupBy = 'day', agent, model, userId, from, to } = req.query;

      let where = [];
      let params = [];
      if (agent) { where.push('agent = ?'); params.push(agent); }
      if (model) { where.push('model = ?'); params.push(model); }
      if (userId) { where.push('user_id = ?'); params.push(userId); }
      if (from) { where.push('timestamp >= ?'); params.push(Number(from)); }
      if (to) { where.push('timestamp <= ?'); params.push(Number(to)); }

      const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

      // Determine time bucket expression based on groupBy
      let bucketExpr;
      if (groupBy === 'hour') {
        bucketExpr = "(timestamp / 3600000) * 3600000";
      } else if (groupBy === 'week') {
        bucketExpr = "(timestamp / 604800000) * 604800000";
      } else {
        bucketExpr = "(timestamp / 86400000) * 86400000";
      }

      const costs = db.prepare(
        `SELECT ${bucketExpr} as bucket, SUM(cost) as total_cost, COUNT(*) as count, AVG(cost) as avg_cost
         FROM cost_records ${whereClause}
         GROUP BY bucket ORDER BY bucket ASC`
      ).all(...params);

      const summaryRow = db.prepare(
        `SELECT SUM(cost) as total, AVG(cost) as avg, MAX(cost) as max FROM cost_records ${whereClause}`
      ).get(...params);

      res.json({
        costs,
        summary: {
          total: summaryRow.total || 0,
          avg: summaryRow.avg || 0,
          max: summaryRow.max || 0,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. GET /api/costs/attribution — cost breakdown
  app.get('/api/costs/attribution', (req, res) => {
    try {
      const db = store.db;
      const { by = 'agent', from, to } = req.query;

      let where = [];
      let params = [];
      if (from) { where.push('timestamp >= ?'); params.push(Number(from)); }
      if (to) { where.push('timestamp <= ?'); params.push(Number(to)); }
      const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

      const columnMap = { agent: 'agent', model: 'model', user: 'user_id', workflow: 'workflow' };
      const column = columnMap[by] || 'agent';

      const rows = db.prepare(
        `SELECT ${column} as name, SUM(cost) as cost, COUNT(*) as count
         FROM cost_records ${whereClause}
         GROUP BY ${column} ORDER BY cost DESC`
      ).all(...params);

      const grandTotal = rows.reduce((sum, r) => sum + r.cost, 0);
      const attribution = rows.map(r => ({
        name: r.name,
        cost: r.cost,
        percentage: grandTotal > 0 ? Math.round((r.cost / grandTotal) * 10000) / 100 : 0,
        count: r.count,
      }));

      res.json({ attribution });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. GET /api/costs/budget — budget status
  app.get('/api/costs/budget', (req, res) => {
    try {
      const { agent } = req.query;
      const budget = costTracker.getBudgetStatus('agent', agent);
      res.json(budget);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. GET /api/quality — quality scores
  app.get('/api/quality', (req, res) => {
    try {
      const db = store.db;
      const { agent, model, from, to } = req.query;

      let where = [];
      let params = [];
      if (agent) { where.push('agent = ?'); params.push(agent); }
      if (model) { where.push('model = ?'); params.push(model); }
      if (from) { where.push('timestamp >= ?'); params.push(Number(from)); }
      if (to) { where.push('timestamp <= ?'); params.push(Number(to)); }
      const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

      const scores = db.prepare(`SELECT * FROM quality_scores ${whereClause} ORDER BY timestamp DESC`).all(...params);

      const avgRow = db.prepare(`SELECT AVG(score) as avg FROM quality_scores ${whereClause}`).get(...params);
      const average = avgRow.avg || 0;

      // Trend: avg score per day
      const trend = db.prepare(
        `SELECT (timestamp / 86400000) * 86400000 as date, AVG(score) as avgScore
         FROM quality_scores ${whereClause}
         GROUP BY date ORDER BY date ASC`
      ).all(...params);

      res.json({ scores, average, trend });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8. GET /api/quality/distribution — score distribution
  app.get('/api/quality/distribution', (req, res) => {
    try {
      const db = store.db;
      const { agent, model, from, to } = req.query;

      let where = [];
      let params = [];
      if (agent) { where.push('agent = ?'); params.push(agent); }
      if (model) { where.push('model = ?'); params.push(model); }
      if (from) { where.push('timestamp >= ?'); params.push(Number(from)); }
      if (to) { where.push('timestamp <= ?'); params.push(Number(to)); }
      const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

      const rows = db.prepare(
        `SELECT score, COUNT(*) as cnt FROM quality_scores ${whereClause} GROUP BY score`
      ).all(...params);

      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const row of rows) {
        distribution[row.score] = row.cnt;
      }

      res.json({ distribution });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9. GET /api/drift/alerts — drift alerts
  app.get('/api/drift/alerts', (req, res) => {
    try {
      const db = store.db;
      const { resolved, severity, metric } = req.query;

      let where = [];
      let params = [];
      if (resolved !== undefined) { where.push('resolved = ?'); params.push(Number(resolved)); }
      if (severity) { where.push('severity = ?'); params.push(severity); }
      if (metric) { where.push('metric = ?'); params.push(metric); }
      const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

      const alerts = db.prepare(`SELECT * FROM drift_alerts ${whereClause} ORDER BY timestamp DESC`).all(...params);
      res.json({ alerts });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 10. GET /api/drift/check — run drift detection now
  app.get('/api/drift/check', (req, res) => {
    try {
      // Get distinct agents and models from the store
      const agents = store.db.prepare('SELECT DISTINCT agent FROM traces').all().map(r => r.agent);
      const models = store.db.prepare('SELECT DISTINCT model FROM traces').all().map(r => r.model);
      const result = driftDetector.runAllChecks(agents, models);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 11. GET /api/metrics/timeseries — generic timeseries
  app.get('/api/metrics/timeseries', (req, res) => {
    try {
      const db = store.db;
      const { metric = 'latency', agent, model, from, to, granularity = 'hour' } = req.query;

      const bucketMs = granularity === 'day' ? 86400000 : 3600000;
      const bucketExpr = `(timestamp_col / ${bucketMs}) * ${bucketMs}`;

      const data = buildTimeseries(store.db, { metric, agent, model, from, to, bucketExpr, bucketMs });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 12. GET /api/agents — list distinct agents
  app.get('/api/agents', (req, res) => {
    try {
      const db = store.db;
      const rows = db.prepare('SELECT DISTINCT agent FROM traces WHERE agent IS NOT NULL').all();
      res.json({ agents: rows.map(r => r.agent) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 13. GET /api/models — list distinct models
  app.get('/api/models', (req, res) => {
    try {
      const db = store.db;
      const rows = db.prepare('SELECT DISTINCT model FROM traces WHERE model IS NOT NULL').all();
      res.json({ models: rows.map(r => r.model) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- Start ----------

  return new Promise((resolve) => {
    app.listen(port, () => {
      console.log(`Dashboard running at http://localhost:${port}`);
      console.log('Open your browser to view the observability dashboard.');
      resolve(app);
    });
  });
}

// ---------- Timeseries Helper ----------

function buildTimeseries(db, { metric, agent, model, from, to, bucketExpr, bucketMs }) {
  let table, timestampCol, valueExpr;

  switch (metric) {
    case 'latency':
      table = 'spans';
      timestampCol = 'started_at';
      valueExpr = 'AVG(latency_ms)';
      break;
    case 'tokens':
      table = 'spans';
      timestampCol = 'started_at';
      valueExpr = 'AVG(total_tokens)';
      break;
    case 'cost':
      table = 'cost_records';
      timestampCol = 'timestamp';
      valueExpr = 'SUM(cost)';
      break;
    case 'quality':
      table = 'quality_scores';
      timestampCol = 'timestamp';
      valueExpr = 'AVG(score)';
      break;
    default:
      return { timeseries: [] };
  }

  const actualBucketExpr = `(${timestampCol} / ${bucketMs}) * ${bucketMs}`;

  let where = [];
  let params = [];

  if (agent) {
    if (table === 'spans') {
      where.push(`trace_id IN (SELECT id FROM traces WHERE agent = ?)`);
    } else {
      where.push(`agent = ?`);
    }
    params.push(agent);
  }
  if (model) { where.push('model = ?'); params.push(model); }
  if (from) { where.push(`${timestampCol} >= ?`); params.push(Number(from)); }
  if (to) { where.push(`${timestampCol} <= ?`); params.push(Number(to)); }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const rows = db.prepare(
    `SELECT ${actualBucketExpr} as bucket, ${valueExpr} as value, COUNT(*) as count
     FROM ${table} ${whereClause}
     GROUP BY bucket ORDER BY bucket ASC`
  ).all(...params);

  return { timeseries: rows };
}

// Auto-start if this is the main module
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const dbPath = process.argv[2] || './observability.db';
  startDashboard(dbPath);
}
