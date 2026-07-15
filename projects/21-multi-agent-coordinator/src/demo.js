/**
 * Demo — Multi-Agent Coordinator in action.
 *
 * Shows:
 *   1. Agent registration with capability cards
 *   2. Task decomposition from natural language
 *   3. Dynamic delegation based on skills + load
 *   4. Parallel execution of independent tasks
 *   5. Escalation when junior agent fails
 *   6. Message bus activity trace
 *   7. Multiple request types exercised
 */

import { Coordinator } from './coordinator.js';
import { CapabilityRegistry } from './capability.js';
import { MessageBus } from './bus.js';
import { ALL_AGENTS } from './agents.js';

async function runDemo() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     Multi-Agent Coordinator — Dynamic Delegation       ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const registry = new CapabilityRegistry();
  const bus = new MessageBus();

  // ─── Step 1: Register agents ──────────────────────────────────

  console.log('Step 1: Registering agents with capability cards\n');

  for (const card of ALL_AGENTS) {
    registry.register(card);
    const skills = card.skills.map(s => s.name).join(', ');
    console.log(`  ✓ ${card.name} (${card.id})`);
    console.log(`    Skills: ${skills}`);
    console.log(`    Concurrency: ${card.maxConcurrency}${card.escalatesTo ? `, escalates → ${card.escalatesTo}` : ''}`);
  }

  // Show skill index
  console.log('\n  Skill → Agent mapping:');
  for (const [skill, agents] of registry.listSkills()) {
    console.log(`    ${skill}: ${agents.join(', ')}`);
  }

  const coordinator = new Coordinator({
    registry,
    bus,
    verbose: true,
    maxRetries: 1,
    taskTimeoutMs: 5000,
  });

  // ─── Step 2: Full-stack app request ───────────────────────────

  console.log('\n\n' + '━'.repeat(60));
  console.log('  REQUEST 1: Build a full-stack web application');
  console.log('━'.repeat(60));

  const run1 = await coordinator.processRequest(
    'Build a full-stack web application for task management'
  );

  // ─── Step 3: Deploy to production ─────────────────────────────

  console.log('\n\n' + '━'.repeat(60));
  console.log('  REQUEST 2: Deploy to production');
  console.log('━'.repeat(60));

  const run2 = await coordinator.processRequest(
    'Deploy the application to production'
  );

  // ─── Step 4: Write analysis report ────────────────────────────

  console.log('\n\n' + '━'.repeat(60));
  console.log('  REQUEST 3: Write a performance analysis report');
  console.log('━'.repeat(60));

  const run3 = await coordinator.processRequest(
    'Write a report analyzing Q3 performance metrics'
  );

  // ─── Step 5: Customer onboarding ──────────────────────────────

  console.log('\n\n' + '━'.repeat(60));
  console.log('  REQUEST 4: Onboard new customer');
  console.log('━'.repeat(60));

  const run4 = await coordinator.processRequest(
    'Onboard new customer Acme Corp'
  );

  // ─── Summary ──────────────────────────────────────────────────

  console.log('\n\n' + '═'.repeat(60));
  console.log('  FINAL SUMMARY');
  console.log('═'.repeat(60));

  const runs = [run1, run2, run3, run4];
  let totalTasks = 0;
  let completedTasks = 0;
  let failedTasks = 0;
  let totalEscalations = 0;

  for (const run of runs) {
    const completed = run.results.filter(r => r.status === 'completed').length;
    const failed = run.results.filter(r => r.status === 'failed').length;
    totalTasks += run.results.length;
    completedTasks += completed;
    failedTasks += failed;
    totalEscalations += run.escalations.length;

    const duration = run.completedAt - run.startedAt;
    console.log(`\n  ${run.request}`);
    console.log(`    Status: ${run.status.toUpperCase()} | ${duration}ms | ${completed}/${run.results.length} tasks`);
  }

  const busStats = bus.getStats();
  console.log('\n  ─── Totals ───');
  console.log(`    Tasks completed:  ${completedTasks}/${totalTasks}`);
  console.log(`    Escalations:      ${totalEscalations}`);
  console.log(`    Bus messages:     ${busStats.totalMessages}`);
  console.log(`    Message types:    ${Object.entries(busStats.channels).map(([k,v]) => `${k}(${v})`).join(', ')}`);

  // Agent utilization
  console.log('\n  ─── Agent Utilization ───');
  const stats = coordinator.getStats();
  for (const agent of stats.agents) {
    const tasksDone = bus.getHistory('TASK_RESULT')
      .filter(m => m.fromAgent === agent.id).length;
    const tasksFailed = bus.getHistory('TASK_FAILED')
      .filter(m => m.fromAgent === agent.id).length;
    if (tasksDone + tasksFailed > 0) {
      console.log(`    ${agent.name}: ${tasksDone} completed, ${tasksFailed} failed`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  Demo complete!');
  console.log('═'.repeat(60));
}

runDemo().catch(console.error);
