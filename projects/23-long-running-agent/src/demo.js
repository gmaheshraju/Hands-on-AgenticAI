/**
 * Demo — showcases durable agent execution with checkpoint/resume,
 * crash recovery, retry, and budget enforcement.
 */

import { CheckpointStore } from './checkpoint.js';
import { DurableExecutor } from './executor.js';
import { RecoveryManager } from './recovery.js';
import { deepResearchTask, ciPipelineTask, dataMigrationTask, expensiveTask } from './tasks.js';

// ── Formatting helpers ──────────────────────────────────────────────

function box(title, content) {
  const lines = content.split('\n');
  const maxLen = Math.max(title.length + 2, ...lines.map(l => stripAnsi(l).length));
  const pad = (s) => s + ' '.repeat(Math.max(0, maxLen - stripAnsi(s).length));

  console.log(`\n┌─${'─'.repeat(maxLen)}─┐`);
  console.log(`│ ${pad(title)} │`);
  console.log(`├─${'─'.repeat(maxLen)}─┤`);
  for (const line of lines) {
    console.log(`│ ${pad(line)} │`);
  }
  console.log(`└─${'─'.repeat(maxLen)}─┘`);
}

function stripAnsi(s) {
  return s.replace(/\[[0-9;]*m/g, '');
}

function header(text) {
  const line = '═'.repeat(text.length + 4);
  console.log(`\n╔${line}╗`);
  console.log(`║  ${text}  ║`);
  console.log(`╚${line}╝`);
}

function section(text) {
  console.log(`\n── ${text} ${'─'.repeat(Math.max(0, 56 - text.length))}`);
}

// ── Demo scenarios ──────────────────────────────────────────────────

async function demo1_deepResearch() {
  header('Demo 1: Deep Research Task (8 steps, mixed criticality)');
  console.log('Running a multi-step research agent with checkpointing...\n');

  const store = new CheckpointStore();
  const executor = new DurableExecutor({ checkpointStore: store });
  const task = deepResearchTask();

  const result = await executor.execute(task, {
    onProgress: (e) => {
      if (e.status === 'completed') {
        console.log(`  ✓ ${e.name} (${e.elapsed}ms)`);
      }
    },
  });

  section('Timeline');
  console.log(result.timeline);
  section('Budget');
  console.log(result.budget);
  section('Checkpoints');
  console.log(`  ${store.count(task.id)} checkpoints saved`);

  box('Result', `Status: ${result.status.toUpperCase()}\n${result.progress}`);
}

async function demo2_ciPipeline() {
  header('Demo 2: CI Pipeline (deploy fails, retries, succeeds)');
  console.log('Running CI pipeline — deploy step will fail on first attempt...\n');

  const store = new CheckpointStore();
  const recovery = new RecoveryManager();
  const executor = new DurableExecutor({ checkpointStore: store, recoveryManager: recovery });
  const task = ciPipelineTask();

  const result = await executor.execute(task, {
    onProgress: (e) => {
      if (e.status === 'completed') {
        console.log(`  ✓ ${e.name} (${e.elapsed}ms)`);
      } else if (e.status === 'retrying') {
        console.log(`  ↻ ${e.name} — retry ${e.retry}`);
      }
    },
  });

  section('Timeline');
  console.log(result.timeline);
  section('Recoveries');
  console.log(`  ${recovery.count} recovery action(s) taken`);
  for (const r of recovery.history) {
    console.log(`    → ${r.step}: ${r.reason}`);
  }

  box('Result', `Status: ${result.status.toUpperCase()}`);
}

async function demo3_crashRecovery() {
  header('Demo 3: Crash Recovery (crash at step 3, resume from checkpoint)');

  // Phase 1: Run until crash
  section('Phase 1: Initial run (will crash at Transform step)');
  const store = new CheckpointStore();
  const executor1 = new DurableExecutor({ checkpointStore: store });
  const task1 = dataMigrationTask({ crashAtStep: 2 });

  const result1 = await executor1.execute(task1, {
    onProgress: (e) => {
      if (e.status === 'completed') console.log(`  ✓ ${e.name}`);
      else if (e.status === 'running') { /* quiet */ }
    },
  });

  console.log(`\n  ✗ Task aborted: ${result1.error ?? 'crash'}`);
  console.log(`  Checkpoint saved at step ${store.load(task1.id)?.currentStepIndex ?? '?'}`);

  // Phase 2: Resume from checkpoint (no crash this time)
  section('Phase 2: Resuming from checkpoint');
  console.log('  Loading checkpoint... skipping completed steps.\n');

  const executor2 = new DurableExecutor({ checkpointStore: store });
  const task2 = dataMigrationTask(); // no crash this time
  task2.id = task1.id; // same task ID to load the checkpoint

  const result2 = await executor2.execute(task2, {
    onProgress: (e) => {
      if (e.status === 'completed') {
        console.log(`  ✓ ${e.name} (${e.elapsed}ms) — ${e.message}`);
      } else if (e.status === 'running' && e.name) {
        // Show resumed steps
      }
    },
  });

  section('Timeline (resumed run)');
  console.log(result2.timeline);

  box('Result', `Status: ${result2.status.toUpperCase()}\nSteps 1-2 loaded from checkpoint, resumed from step 3`);
}

async function demo4_budgetEnforcement() {
  header('Demo 4: Budget Enforcement ($0.10 limit on expensive task)');
  console.log('Each step costs $0.04 — budget should abort around step 3...\n');

  const store = new CheckpointStore();
  const executor = new DurableExecutor({ checkpointStore: store });
  const task = expensiveTask();

  const result = await executor.execute(task, {
    onProgress: (e) => {
      if (e.status === 'completed') {
        console.log(`  ✓ ${e.name} ($${e.cost?.toFixed(4) ?? '0.0000'})`);
      } else if (e.status === 'aborted') {
        console.log(`  ✗ ${e.name} — ${e.message}`);
      }
    },
  });

  section('Budget Report');
  console.log(result.budget);
  section('Timeline');
  console.log(result.timeline);

  box('Result', `Status: ${result.status.toUpperCase()}\nTask stopped to protect cost budget`);
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Project 23: Durable Long-Running Agent Execution       ║');
  console.log('║     Checkpoint/Resume · Crash Recovery · Budget Control     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const startTime = Date.now();

  await demo1_deepResearch();
  await demo2_ciPipeline();
  await demo3_crashRecovery();
  await demo4_budgetEnforcement();

  // ── Final summary ──
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  header('Final Summary');
  console.log(`  Tasks executed:       4`);
  console.log(`  Total demo time:      ${elapsed}s`);
  console.log(`  Checkpoints saved:    across all tasks`);
  console.log(`  Crash recoveries:     1 (Data Migration resumed)`);
  console.log(`  Retry recoveries:     1 (CI deploy retry)`);
  console.log(`  Budget enforcements:  1 (expensive task capped at $0.10)`);
  console.log(`\n  All demos completed successfully.\n`);
}

main().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
