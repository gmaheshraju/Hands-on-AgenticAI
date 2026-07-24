/**
 * Pilot Dashboard Server
 *
 * Express server that serves a pilot tracking dashboard.
 * Tracks: documents ingested, eval scores, usage metrics, blockers, pilot timeline.
 *
 * In production, this would connect to a real database.
 * Here we use in-memory state that can be populated from the onboarding pipeline.
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In-memory pilot state — populated by the API or by running the pipeline
let pilotState = {
  customer: 'Legal Tech Solutions (Demo)',
  pilotStart: new Date().toISOString().split('T')[0],
  pilotDays: 14,
  documents: {
    total: 0,
    succeeded: 0,
    failed: 0,
    warnings: 0,
    avgQuality: 0,
    details: [],
  },
  domain: {
    vocabularyCount: 0,
    categories: [],
    fewShotCount: 0,
    systemPromptLength: 0,
  },
  eval: {
    totalCandidates: 0,
    accepted: 0,
    rejected: 0,
    baselineScore: null,
  },
  checklist: {
    passed: 0,
    failed: 0,
    warnings: 0,
    ready: false,
    checks: [],
  },
  issues: [],
  activity: [],
};

export function createDashboardServer(state) {
  if (state) pilotState = { ...pilotState, ...state };

  const app = express();
  app.use(express.json());

  // Serve dashboard HTML
  app.get('/', async (req, res) => {
    const htmlPath = path.join(__dirname, '..', 'public', 'dashboard.html');
    try {
      const html = await fs.readFile(htmlPath, 'utf-8');
      res.type('html').send(html);
    } catch {
      res.status(500).send('Dashboard HTML not found');
    }
  });

  // API: Get pilot state
  app.get('/api/state', (req, res) => {
    const now = new Date();
    const start = new Date(pilotState.pilotStart);
    const end = new Date(start);
    end.setDate(end.getDate() + pilotState.pilotDays);
    const daysRemaining = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
    const daysElapsed = pilotState.pilotDays - daysRemaining;

    res.json({
      ...pilotState,
      daysRemaining,
      daysElapsed,
      pilotEnd: end.toISOString().split('T')[0],
      progressPercent: Math.round((daysElapsed / pilotState.pilotDays) * 100),
    });
  });

  // API: Update pilot state (from pipeline)
  app.post('/api/state', (req, res) => {
    pilotState = { ...pilotState, ...req.body };
    res.json({ ok: true });
  });

  // API: Add issue
  app.post('/api/issues', (req, res) => {
    const issue = {
      id: `issue-${Date.now()}`,
      text: req.body.text,
      severity: req.body.severity || 'medium',
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    pilotState.issues.push(issue);
    res.json(issue);
  });

  // API: Update issue status
  app.patch('/api/issues/:id', (req, res) => {
    const issue = pilotState.issues.find((i) => i.id === req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    issue.status = req.body.status || issue.status;
    issue.text = req.body.text || issue.text;
    res.json(issue);
  });

  // API: Add activity log
  app.post('/api/activity', (req, res) => {
    const entry = {
      timestamp: new Date().toISOString(),
      action: req.body.action,
      detail: req.body.detail,
    };
    pilotState.activity.push(entry);
    res.json(entry);
  });

  return app;
}

// --- Start server if run directly ---
if (process.argv[1] && process.argv[1].endsWith('dashboard.js')) {
  const port = process.env.PORT || 3014;
  const app = createDashboardServer();
  app.listen(port, () => {
    console.log(`Pilot dashboard running at http://localhost:${port}`);
  });
}
