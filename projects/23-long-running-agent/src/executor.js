/**
 * DurableExecutor — the core engine for long-running agent tasks.
 *
 * Executes steps sequentially, checkpointing after each. Supports resume
 * from checkpoint, per-step retry with backoff, budget enforcement,
 * critical/non-critical failure handling, and progress streaming.
 */

import { CheckpointStore } from './checkpoint.js';
import { ExecutionBudget } from './budget.js';
import { RecoveryManager } from './recovery.js';
import { ProgressReporter } from './progress.js';

export class DurableExecutor {
  #checkpointStore;
  #recoveryManager;

  constructor({ checkpointStore, recoveryManager } = {}) {
    this.#checkpointStore = checkpointStore ?? new CheckpointStore();
    this.#recoveryManager = recoveryManager ?? new RecoveryManager();
  }

  /**
   * Execute a task definition with durable checkpointing.
   *
   * @param {{
   *   id: string,
   *   steps: Array<{name: string, handler: Function, retries?: number, timeout?: number, critical?: boolean}>,
   *   budget?: {maxCost?: number, maxDuration?: number, maxApiCalls?: number}
   * }} task
   * @param {{
   *   onProgress?: (event: object) => void
   * }} options
   * @returns {Promise<{status: 'completed'|'aborted'|'budget_exceeded', results: Array, budget: object, timeline: string}>}
   */
  async execute(task, { onProgress } = {}) {
    const { id, steps, budget: budgetLimits = {} } = task;
    const budget = new ExecutionBudget(budgetLimits);
    const progress = new ProgressReporter(steps.length);
    const results = [];

    // --- Resume from checkpoint ---
    let startIndex = 0;
    const checkpoint = this.#checkpointStore.load(id);
    if (checkpoint) {
      startIndex = checkpoint.currentStepIndex ?? 0;
      results.push(...(checkpoint.completedSteps ?? []));
      budget.restore(checkpoint.budget ?? {});

      // Record completed steps into progress reporter
      for (let i = 0; i < startIndex; i++) {
        const r = results[i];
        progress.record({
          step: i,
          name: steps[i].name,
          status: r?.status === 'skipped' ? 'skipped' : 'completed',
          elapsed: r?.elapsed ?? 0,
          cost: r?.cost ?? 0,
          message: r?.status === 'skipped' ? 'skipped (previous run)' : 'loaded from checkpoint',
        });
      }
    }

    // --- Execute steps ---
    for (let i = startIndex; i < steps.length; i++) {
      const step = steps[i];

      // Budget check before each step
      const budgetCheck = budget.check();
      if (!budgetCheck.ok) {
        const event = {
          step: i, name: step.name, status: 'aborted',
          message: `Budget exceeded: ${budgetCheck.violations.join(', ')}`,
        };
        progress.record(event);
        onProgress?.(event);

        // Save checkpoint at current position so we can inspect later
        this.#saveCheckpoint(id, i, results, budget);

        return {
          status: 'budget_exceeded',
          results,
          budget: budget.report(),
          timeline: progress.formatTimeline(steps),
          progress: progress.formatProgress(),
        };
      }

      // Signal step starting
      progress.record({ step: i, name: step.name, status: 'running', message: 'starting' });
      onProgress?.({ step: i, total: steps.length, name: step.name, status: 'running' });

      const stepResult = await this.#executeStep(step, i, budget, progress, onProgress);

      if (stepResult.status === 'completed' || stepResult.status === 'skipped') {
        results.push(stepResult);
        this.#saveCheckpoint(id, i + 1, results, budget);
        continue;
      }

      // Step failed — ask recovery manager
      const recovery = this.#recoveryManager.selectStrategy(
        stepResult.error,
        step,
        { retriesUsed: stepResult.retriesUsed ?? 0 }
      );

      if (recovery.strategy === 'retry') {
        // Retry loop
        let retryResult = null;
        let retriesUsed = stepResult.retriesUsed ?? 0;
        const maxRetries = step.retries ?? 0;

        while (retriesUsed < maxRetries) {
          retriesUsed++;
          if (recovery.backoffMs) {
            await sleep(recovery.backoffMs);
          }
          const retryStep = { ...step };
          if (recovery.newTimeout) retryStep.timeout = recovery.newTimeout;

          progress.record({ step: i, name: step.name, status: 'running', message: `retry ${retriesUsed}` });
          onProgress?.({ step: i, total: steps.length, name: step.name, status: 'retrying', retry: retriesUsed });

          retryResult = await this.#executeStep(retryStep, i, budget, progress, onProgress);
          if (retryResult.status === 'completed') break;

          // Re-select strategy for next retry
          const nextRecovery = this.#recoveryManager.selectStrategy(
            retryResult.error, step, { retriesUsed }
          );
          if (nextRecovery.strategy !== 'retry') break;
        }

        if (retryResult?.status === 'completed') {
          results.push(retryResult);
          this.#saveCheckpoint(id, i + 1, results, budget);
          continue;
        }

        // Retries exhausted
        if (!step.critical) {
          const skipped = { status: 'skipped', name: step.name, reason: 'retries exhausted' };
          results.push(skipped);
          progress.record({ step: i, name: step.name, status: 'skipped', message: 'retries exhausted' });
          onProgress?.({ step: i, total: steps.length, name: step.name, status: 'skipped' });
          this.#saveCheckpoint(id, i + 1, results, budget);
          continue;
        }

        // Critical step failed after retries — abort
        this.#saveCheckpoint(id, i, results, budget);
        progress.record({ step: i, name: step.name, status: 'failed', message: 'critical step failed — aborting' });
        return {
          status: 'aborted',
          results,
          budget: budget.report(),
          timeline: progress.formatTimeline(steps),
          progress: progress.formatProgress(),
          error: retryResult?.error?.message ?? 'Unknown error',
        };
      }

      if (recovery.strategy === 'skip') {
        const skipped = { status: 'skipped', name: step.name, reason: recovery.reason };
        results.push(skipped);
        progress.record({ step: i, name: step.name, status: 'skipped', message: recovery.reason });
        onProgress?.({ step: i, total: steps.length, name: step.name, status: 'skipped' });
        this.#saveCheckpoint(id, i + 1, results, budget);
        continue;
      }

      // abort (auth error, critical data error, etc.)
      this.#saveCheckpoint(id, i, results, budget);
      progress.record({ step: i, name: step.name, status: 'failed', message: recovery.reason });
      return {
        status: 'aborted',
        results,
        budget: budget.report(),
        timeline: progress.formatTimeline(steps),
        progress: progress.formatProgress(),
        error: stepResult.error?.message ?? recovery.reason,
      };
    }

    return {
      status: 'completed',
      results,
      budget: budget.report(),
      timeline: progress.formatTimeline(steps),
      progress: progress.formatProgress(),
    };
  }

  /**
   * Execute a single step with timeout.
   * @returns {Promise<{status: string, name: string, result?: any, elapsed?: number, cost?: number, tokens?: number, error?: Error, retriesUsed?: number}>}
   */
  async #executeStep(step, index, budget, progress, onProgress) {
    const start = Date.now();
    let timer = null;

    try {
      const result = await new Promise(async (resolve, reject) => {
        // Set up timeout if configured
        if (step.timeout && step.timeout > 0) {
          timer = setTimeout(() => {
            const err = new Error(`Step "${step.name}" timed out after ${step.timeout}ms`);
            err.code = 'TIMEOUT';
            reject(err);
          }, step.timeout);
        }

        try {
          const r = await step.handler();
          resolve(r);
        } catch (err) {
          reject(err);
        }
      });

      // Clear timeout on success
      if (timer) { clearTimeout(timer); timer = null; }

      const elapsed = Date.now() - start;
      const cost = result?.cost ?? 0;
      const tokens = result?.tokens ?? 0;
      budget.record(cost, tokens, elapsed);

      const event = {
        step: index, name: step.name, status: 'completed',
        elapsed, cost, message: result?.message ?? 'done',
      };
      progress.record(event);
      onProgress?.({ ...event, total: progress.events.length });

      return { status: 'completed', name: step.name, result, elapsed, cost, tokens };
    } catch (error) {
      if (timer) { clearTimeout(timer); timer = null; }
      const elapsed = Date.now() - start;

      progress.record({
        step: index, name: step.name, status: 'failed',
        elapsed, message: error.message,
      });

      return { status: 'failed', name: step.name, error, elapsed, retriesUsed: 0 };
    }
  }

  /**
   * Save a checkpoint with the current execution state.
   */
  #saveCheckpoint(taskId, nextStepIndex, completedSteps, budget) {
    this.#checkpointStore.save(taskId, {
      currentStepIndex: nextStepIndex,
      completedSteps: completedSteps.map(s => ({ ...s, result: undefined })),
      budget: {
        totalCost: budget.totalCost,
        totalTokens: budget.totalTokens,
        totalDuration: budget.totalDuration,
        apiCalls: budget.apiCalls,
      },
    });
  }

  /** @returns {CheckpointStore} */
  get checkpointStore() { return this.#checkpointStore; }

  /** @returns {RecoveryManager} */
  get recoveryManager() { return this.#recoveryManager; }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
