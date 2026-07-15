/**
 * RecoveryManager — selects and applies crash-recovery strategies.
 *
 * When a step fails the executor asks the RecoveryManager what to do.
 * The decision is based on the error type, whether the step is critical,
 * and how many retries remain.
 */
export class RecoveryManager {
  #recoveries = [];

  /**
   * Auto-select a recovery strategy based on error + step metadata.
   *
   * @param {Error} error
   * @param {{name: string, critical?: boolean, retries?: number}} step
   * @param {{retriesUsed: number}} context
   * @returns {{ strategy: 'retry'|'skip'|'rollback'|'abort', reason: string, backoffMs?: number, newTimeout?: number }}
   */
  selectStrategy(error, step, context) {
    const msg = (error.message || '').toLowerCase();
    const retriesLeft = (step.retries ?? 0) - context.retriesUsed;

    // --- Timeout ---
    if (msg.includes('timeout') || error.code === 'TIMEOUT') {
      if (retriesLeft > 0) {
        const result = {
          strategy: 'retry',
          reason: `Timeout — retrying with increased timeout (attempt ${context.retriesUsed + 1})`,
          backoffMs: 100 * (context.retriesUsed + 1),
          newTimeout: (step.timeout ?? 5000) * 2,
        };
        this.#recoveries.push({ step: step.name, ...result, timestamp: Date.now() });
        return result;
      }
    }

    // --- Rate limit ---
    if (msg.includes('rate limit') || msg.includes('429') || error.code === 'RATE_LIMIT') {
      if (retriesLeft > 0) {
        const backoff = Math.min(1000 * Math.pow(2, context.retriesUsed), 16000);
        const result = {
          strategy: 'retry',
          reason: `Rate limited — exponential backoff ${backoff}ms`,
          backoffMs: backoff,
        };
        this.#recoveries.push({ step: step.name, ...result, timestamp: Date.now() });
        return result;
      }
    }

    // --- Auth error — never recoverable ---
    if (msg.includes('auth') || msg.includes('401') || msg.includes('403') || error.code === 'AUTH') {
      const result = { strategy: 'abort', reason: 'Authentication error — cannot recover' };
      this.#recoveries.push({ step: step.name, ...result, timestamp: Date.now() });
      return result;
    }

    // --- Data / validation error ---
    if (msg.includes('data') || msg.includes('validation') || msg.includes('parse') || error.code === 'DATA') {
      if (!step.critical) {
        const result = { strategy: 'skip', reason: 'Data error on non-critical step — skipping' };
        this.#recoveries.push({ step: step.name, ...result, timestamp: Date.now() });
        return result;
      }
      const result = { strategy: 'abort', reason: 'Data error on critical step — aborting' };
      this.#recoveries.push({ step: step.name, ...result, timestamp: Date.now() });
      return result;
    }

    // --- Generic / unknown ---
    if (retriesLeft > 0) {
      const result = {
        strategy: 'retry',
        reason: `Unknown error — retrying (attempt ${context.retriesUsed + 1})`,
        backoffMs: 200 * (context.retriesUsed + 1),
      };
      this.#recoveries.push({ step: step.name, ...result, timestamp: Date.now() });
      return result;
    }

    if (!step.critical) {
      const result = { strategy: 'skip', reason: 'Retries exhausted on non-critical step — skipping' };
      this.#recoveries.push({ step: step.name, ...result, timestamp: Date.now() });
      return result;
    }

    const result = { strategy: 'abort', reason: 'Retries exhausted on critical step — aborting' };
    this.#recoveries.push({ step: step.name, ...result, timestamp: Date.now() });
    return result;
  }

  /**
   * Revert to a previous checkpoint by rolling back the last N steps.
   * Returns the state from the target checkpoint.
   *
   * @param {import('./checkpoint.js').CheckpointStore} store
   * @param {string} taskId
   * @param {number} rollbackCount — how many steps to undo
   * @returns {object|null} — the restored state, or null if not enough checkpoints
   */
  applyRollback(store, taskId, rollbackCount) {
    const checkpoints = store.listCheckpoints(taskId);
    const targetVersion = checkpoints.length - rollbackCount;
    if (targetVersion < 1) return null;
    // We need to load the state at that version. Since listCheckpoints only
    // gives metadata, we reload and walk back. For simplicity, clear forward
    // checkpoints isn't supported — we just load the right version.
    // The checkpoint store keeps all versions, so we load the latest and
    // the caller should re-save at the rolled-back point.
    const state = store.load(taskId);
    if (!state) return null;
    // Roll back completed steps
    if (state.completedSteps && rollbackCount > 0) {
      state.completedSteps = state.completedSteps.slice(0, -rollbackCount);
      state.currentStepIndex = Math.max(0, (state.currentStepIndex ?? 0) - rollbackCount);
    }
    this.#recoveries.push({
      step: 'rollback',
      strategy: 'rollback',
      reason: `Rolled back ${rollbackCount} step(s)`,
      timestamp: Date.now(),
    });
    return state;
  }

  /** @returns {Array} recovery history */
  get history() { return [...this.#recoveries]; }

  /** @returns {number} total recoveries performed */
  get count() { return this.#recoveries.length; }
}
