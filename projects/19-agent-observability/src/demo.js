// demo.js — Simulate 500 agent requests over "7 days" then start the dashboard
import { simulate } from './simulator.js';
import { startDashboard } from './dashboard.js';
import fs from 'fs';

const DB_PATH = './observability.db';

async function main() {
  // Remove old DB if exists for a clean demo
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('Removed existing database for fresh demo.\n');
  }

  console.log('=== Agent Observability Dashboard Demo ===\n');
  console.log('Phase 1: Simulating 500 agent requests over 7 days...\n');

  const stats = await simulate({
    totalRequests: 500,
    daysBack: 7,
    dbPath: DB_PATH,
  });

  console.log('\n--- Simulation Summary ---');
  console.log(`  Traces generated:  ${stats.traces}`);
  console.log(`  Spans generated:   ${stats.spans}`);
  console.log(`  Quality scores:    ${stats.qualityScores}`);
  console.log(`  Drift alerts:      ${stats.driftAlerts}`);
  console.log(`  Total cost:        $${stats.totalCost.toFixed(2)}`);
  console.log('');

  console.log('Phase 2: Starting dashboard server...\n');
  await startDashboard(DB_PATH);
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
