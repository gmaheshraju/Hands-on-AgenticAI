import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CheckpointStore } from '../checkpoint.js';
import { ExecutionBudget } from '../budget.js';
import { RecoveryManager } from '../recovery.js';
import { ProgressReporter } from '../progress.js';
import { DurableExecutor } from '../executor.js';

// ── CheckpointStore ─────────────────────────────────────────────────

describe('CheckpointStore', () => {
  it('save and load returns the latest state', () => {
    const store = new CheckpointStore();
    store.save('t1', { currentStepIndex: 0, completedSteps: [] });
    store.save('t1', { currentStepIndex: 1, completedSteps: [{ name: 's1' }] });
    const state = store.load('t1');
    assert.equal(state.currentStepIndex, 1);
    assert.equal(state.completedSteps.length, 1);
  });

  it('load returns null for unknown task', () => {
    const store = new CheckpointStore();
    assert.equal(store.load('nonexistent'), null);
  });

  it('listCheckpoints returns version history', () => {
    const store = new CheckpointStore();
    store.save('t1', { x: 1 });
    store.save('t1', { x: 2 });
    store.save('t1', { x: 3 });
    const list = store.listCheckpoints('t1');
    assert.equal(list.length, 3);
    assert.equal(list[0].version, 1);
    assert.equal(list[2].version, 3);
    assert.ok(list[0].timestamp); // ISO string
  });

  it('clear removes all checkpoints', () => {
    const store = new CheckpointStore();
    store.save('t1', { x: 1 });
    store.save('t1', { x: 2 });
    store.clear('t1');
    assert.equal(store.load('t1'), null);
    assert.equal(store.count('t1'), 0);
  });

  it('versioning increments correctly', () => {
    const store = new CheckpointStore();
    const r1 = store.save('t1', { a: 1 });
    const r2 = store.save('t1', { a: 2 });
    assert.equal(r1.version, 1);
    assert.equal(r2.version, 2);
  });

  it('save deep-clones state (mutations do not affect stored data)', () => {
    const store = new CheckpointStore();
    const state = { items: [1, 2, 3] };
    store.save('t1', state);
    state.items.push(4); // mutate original
    const loaded = store.load('t1');
    assert.equal(loaded.items.length, 3); // stored copy unaffected
  });
});

// ── ExecutionBudget ─────────────────────────────────────────────────

describe('ExecutionBudget', () => {
  it('tracks accumulated cost and tokens', () => {
    const b = new ExecutionBudget({ maxCost: 1.0 });
    b.record(0.10, 500, 100);
    b.record(0.20, 1000, 200);
    assert.ok(Math.abs(b.totalCost - 0.30) < 1e-10);
    assert.equal(b.totalTokens, 1500);
    assert.equal(b.apiCalls, 2);
  });

  it('check() returns violation when cost exceeded', () => {
    const b = new ExecutionBudget({ maxCost: 0.05 });
    b.record(0.06, 100, 50);
    const result = b.check();
    assert.equal(result.ok, false);
    assert.equal(result.violations.length, 1);
    assert.ok(result.violations[0].includes('Cost'));
  });

  it('check() returns ok when within budget', () => {
    const b = new ExecutionBudget({ maxCost: 1.0, maxApiCalls: 100 });
    b.record(0.01, 100, 50);
    const result = b.check();
    assert.equal(result.ok, true);
    assert.equal(result.violations.length, 0);
  });

  it('report() returns human-readable string', () => {
    const b = new ExecutionBudget({ maxCost: 1.0 });
    b.record(0.05, 500, 100);
    const report = b.report();
    assert.ok(report.includes('Cost'));
    assert.ok(report.includes('Tokens'));
    assert.ok(report.includes('API calls'));
  });

  it('restore() loads accumulated state', () => {
    const b = new ExecutionBudget({ maxCost: 1.0 });
    b.restore({ totalCost: 0.30, totalTokens: 2000, totalDuration: 500, apiCalls: 5 });
    assert.equal(b.totalCost, 0.30);
    assert.equal(b.totalTokens, 2000);
    assert.equal(b.apiCalls, 5);
  });
});

// ── RecoveryManager ─────────────────────────────────────────────────

describe('RecoveryManager', () => {
  it('selects retry for timeout errors', () => {
    const rm = new RecoveryManager();
    const err = new Error('Step timed out: timeout exceeded');
    const result = rm.selectStrategy(err, { name: 's1', retries: 3, critical: true }, { retriesUsed: 0 });
    assert.equal(result.strategy, 'retry');
    assert.ok(result.backoffMs > 0);
  });

  it('selects retry with exponential backoff for rate limit', () => {
    const rm = new RecoveryManager();
    const err = new Error('429 rate limit exceeded');
    const r1 = rm.selectStrategy(err, { name: 's1', retries: 3 }, { retriesUsed: 0 });
    assert.equal(r1.strategy, 'retry');
    const r2 = rm.selectStrategy(err, { name: 's1', retries: 3 }, { retriesUsed: 1 });
    assert.ok(r2.backoffMs > r1.backoffMs); // exponential
  });

  it('selects abort for auth errors', () => {
    const rm = new RecoveryManager();
    const err = new Error('401 authentication failed');
    const result = rm.selectStrategy(err, { name: 's1', retries: 3, critical: true }, { retriesUsed: 0 });
    assert.equal(result.strategy, 'abort');
  });

  it('selects skip for data error on non-critical step', () => {
    const rm = new RecoveryManager();
    const err = new Error('Data validation failed');
    const result = rm.selectStrategy(err, { name: 's1', retries: 0, critical: false }, { retriesUsed: 0 });
    assert.equal(result.strategy, 'skip');
  });

  it('selects abort for data error on critical step', () => {
    const rm = new RecoveryManager();
    const err = new Error('Data validation failed');
    const result = rm.selectStrategy(err, { name: 's1', retries: 0, critical: true }, { retriesUsed: 0 });
    assert.equal(result.strategy, 'abort');
  });

  it('rollback reverts completed steps', () => {
    const rm = new RecoveryManager();
    const store = new CheckpointStore();
    // Save 3 checkpoints so rollback by 2 is valid (3 - 2 = 1 >= 1)
    store.save('t1', { currentStepIndex: 1, completedSteps: [{ name: 's1' }] });
    store.save('t1', { currentStepIndex: 2, completedSteps: [{ name: 's1' }, { name: 's2' }] });
    store.save('t1', { currentStepIndex: 3, completedSteps: [{ name: 's1' }, { name: 's2' }, { name: 's3' }] });
    const state = rm.applyRollback(store, 't1', 2);
    assert.equal(state.currentStepIndex, 1);
    assert.equal(state.completedSteps.length, 1);
  });
});

// ── ProgressReporter ────────────────────────────────────────────────

describe('ProgressReporter', () => {
  it('formatProgress shows completion percentage and ETA', () => {
    const pr = new ProgressReporter(4);
    pr.record({ step: 0, name: 's1', status: 'completed', elapsed: 100 });
    pr.record({ step: 1, name: 's2', status: 'completed', elapsed: 200 });
    const text = pr.formatProgress();
    assert.ok(text.includes('2/4'));
    assert.ok(text.includes('50%'));
    assert.ok(text.includes('ETA'));
  });

  it('formatTimeline renders icons for each status', () => {
    const steps = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }];
    const pr = new ProgressReporter(4);
    pr.record({ step: 0, name: 'A', status: 'completed', elapsed: 50 });
    pr.record({ step: 1, name: 'B', status: 'failed', elapsed: 30 });
    pr.record({ step: 2, name: 'C', status: 'skipped' });
    // step 3 = pending (no event)
    const timeline = pr.formatTimeline(steps);
    assert.ok(timeline.includes('✓'));
    assert.ok(timeline.includes('✗'));
    assert.ok(timeline.includes('⊘'));
    assert.ok(timeline.includes('○'));
  });
});

// ── DurableExecutor ─────────────────────────────────────────────────

describe('DurableExecutor', () => {
  it('executes all steps sequentially', async () => {
    const order = [];
    const task = {
      id: 'test-seq',
      steps: [
        { name: 'a', handler: async () => { order.push('a'); return { tokens: 10, cost: 0.001 }; }, critical: true },
        { name: 'b', handler: async () => { order.push('b'); return { tokens: 20, cost: 0.002 }; }, critical: true },
        { name: 'c', handler: async () => { order.push('c'); return { tokens: 30, cost: 0.003 }; }, critical: true },
      ],
    };
    const executor = new DurableExecutor();
    const result = await executor.execute(task);
    assert.deepEqual(order, ['a', 'b', 'c']);
    assert.equal(result.status, 'completed');
    assert.equal(result.results.length, 3);
  });

  it('resumes from checkpoint, skipping completed steps', async () => {
    const store = new CheckpointStore();
    // Simulate a previous run that completed steps 0 and 1
    store.save('test-resume', {
      currentStepIndex: 2,
      completedSteps: [
        { status: 'completed', name: 'a' },
        { status: 'completed', name: 'b' },
      ],
      budget: { totalCost: 0.003, totalTokens: 30, totalDuration: 100, apiCalls: 2 },
    });

    const executed = [];
    const task = {
      id: 'test-resume',
      steps: [
        { name: 'a', handler: async () => { executed.push('a'); return {}; }, critical: true },
        { name: 'b', handler: async () => { executed.push('b'); return {}; }, critical: true },
        { name: 'c', handler: async () => { executed.push('c'); return { tokens: 10, cost: 0.001 }; }, critical: true },
      ],
    };

    const executor = new DurableExecutor({ checkpointStore: store });
    const result = await executor.execute(task);
    // Only step 'c' should have been executed
    assert.deepEqual(executed, ['c']);
    assert.equal(result.status, 'completed');
    assert.equal(result.results.length, 3);
  });

  it('retries a failed step and succeeds', async () => {
    let attempts = 0;
    const task = {
      id: 'test-retry',
      steps: [
        {
          name: 'flaky',
          handler: async () => {
            attempts++;
            if (attempts < 2) throw new Error('Transient failure');
            return { tokens: 10, cost: 0.001, message: 'ok' };
          },
          retries: 3,
          critical: true,
        },
      ],
    };
    const executor = new DurableExecutor();
    const result = await executor.execute(task);
    assert.equal(result.status, 'completed');
    assert.ok(attempts >= 2);
  });

  it('skips non-critical step on failure', async () => {
    const task = {
      id: 'test-skip',
      steps: [
        { name: 'good', handler: async () => ({ tokens: 10, cost: 0.001 }), critical: true },
        {
          name: 'bad-noncritical',
          handler: async () => { throw new Error('Data validation error'); },
          retries: 0,
          critical: false,
        },
        { name: 'after', handler: async () => ({ tokens: 10, cost: 0.001 }), critical: true },
      ],
    };
    const executor = new DurableExecutor();
    const result = await executor.execute(task);
    assert.equal(result.status, 'completed');
    assert.equal(result.results.length, 3);
    assert.equal(result.results[1].status, 'skipped');
  });

  it('aborts on critical step failure', async () => {
    const task = {
      id: 'test-abort',
      steps: [
        { name: 'good', handler: async () => ({ tokens: 10, cost: 0.001 }), critical: true },
        {
          name: 'bad-critical',
          handler: async () => { throw new Error('Auth error: 401'); },
          retries: 0,
          critical: true,
        },
        { name: 'never', handler: async () => ({ tokens: 10, cost: 0.001 }), critical: true },
      ],
    };
    const executor = new DurableExecutor();
    const result = await executor.execute(task);
    assert.equal(result.status, 'aborted');
    // 'never' should not have run
    assert.equal(result.results.length, 1);
  });

  it('enforces budget and aborts when exceeded', async () => {
    const task = {
      id: 'test-budget',
      steps: [
        { name: 's1', handler: async () => ({ tokens: 1000, cost: 0.05 }), critical: true },
        { name: 's2', handler: async () => ({ tokens: 1000, cost: 0.05 }), critical: true },
        { name: 's3', handler: async () => ({ tokens: 1000, cost: 0.05 }), critical: true },
      ],
      budget: { maxCost: 0.08 },
    };
    const executor = new DurableExecutor();
    const result = await executor.execute(task);
    // s1 completes (cost 0.05), s2 should see budget exceeded (0.05+0.05=0.10 >= 0.08...
    // actually s1 records 0.05, budget check before s2 sees 0.05 < 0.08 → s2 runs,
    // records 0.10, budget check before s3 sees 0.10 >= 0.08 → aborts)
    assert.equal(result.status, 'budget_exceeded');
    assert.equal(result.results.length, 2); // s1 and s2 completed
  });

  it('calls onProgress callback for each step', async () => {
    const events = [];
    const task = {
      id: 'test-progress',
      steps: [
        { name: 'a', handler: async () => ({ tokens: 10, cost: 0.001 }), critical: true },
        { name: 'b', handler: async () => ({ tokens: 20, cost: 0.002 }), critical: true },
      ],
    };
    const executor = new DurableExecutor();
    await executor.execute(task, { onProgress: (e) => events.push(e) });
    // Should have running + completed events for each step
    assert.ok(events.length >= 4);
    assert.ok(events.some(e => e.status === 'running'));
    assert.ok(events.some(e => e.status === 'completed'));
  });
});

// ── Integration ─────────────────────────────────────────────────────

describe('Integration: crash + resume', () => {
  it('full task crashes at step 2, resumes and completes', async () => {
    const store = new CheckpointStore();

    // Run 1: crashes at step 2
    let callCount = 0;
    const task1 = {
      id: 'integration-crash',
      steps: [
        { name: 'step1', handler: async () => ({ tokens: 10, cost: 0.001 }), critical: true },
        { name: 'step2', handler: async () => { throw new Error('CRASH'); }, retries: 0, critical: true },
        { name: 'step3', handler: async () => ({ tokens: 30, cost: 0.003 }), critical: true },
      ],
    };
    const exec1 = new DurableExecutor({ checkpointStore: store });
    const r1 = await exec1.execute(task1);
    assert.equal(r1.status, 'aborted');

    // Verify checkpoint exists
    const cp = store.load('integration-crash');
    assert.ok(cp);
    assert.equal(cp.currentStepIndex, 1); // failed at step index 1

    // Run 2: same task ID, step 2 now succeeds
    const executedSteps = [];
    const task2 = {
      id: 'integration-crash',
      steps: [
        { name: 'step1', handler: async () => { executedSteps.push(1); return { tokens: 10, cost: 0.001 }; }, critical: true },
        { name: 'step2', handler: async () => { executedSteps.push(2); return { tokens: 20, cost: 0.002 }; }, critical: true },
        { name: 'step3', handler: async () => { executedSteps.push(3); return { tokens: 30, cost: 0.003 }; }, critical: true },
      ],
    };
    const exec2 = new DurableExecutor({ checkpointStore: store });
    const r2 = await exec2.execute(task2);
    assert.equal(r2.status, 'completed');
    // step1 was already completed — only step2 and step3 should run
    assert.deepEqual(executedSteps, [2, 3]);
  });
});
