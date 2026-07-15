/**
 * Dashboard HTTP Server
 *
 * Serves the HTML dashboard at / and a JSON API at /api/metrics.
 * Pure Node.js — no Express dependency.
 */

import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  costByModel, avgLatencyByModel, escalationStats,
  requestsPerHour, tierDistribution, topExpensiveRequests,
  savingsVsFrontier, recentRequests, totalCost, getDb,
} from './metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT       = process.env.PORT || 3000;

function jsonResponse(res, data) {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function htmlResponse(res, filePath) {
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

// ── API routes ──────────────────────────────────────────────────────────

function handleApi(req, res) {
  const now = new Date();
  const todayStart    = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart     = new Date(now - 7 * 86400000).toISOString();
  const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const data = {
    cost_today:        totalCost(todayStart),
    cost_week:         totalCost(weekStart),
    cost_month:        totalCost(monthStart),
    cost_by_model:     costByModel(),
    latency_by_model:  avgLatencyByModel(),
    escalation:        escalationStats(),
    requests_per_hour: requestsPerHour(),
    tier_distribution: tierDistribution(),
    top_expensive:     topExpensiveRequests(10),
    savings:           savingsVsFrontier(),
    recent_requests:   recentRequests(30),
  };

  jsonResponse(res, data);
}

// ── Server ──────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.url === '/api/metrics') {
    handleApi(req, res);
  } else if (req.url === '/' || req.url === '/dashboard.html') {
    htmlResponse(res, join(PUBLIC_DIR, 'dashboard.html'));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Cost Dashboard running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.\n');
});
