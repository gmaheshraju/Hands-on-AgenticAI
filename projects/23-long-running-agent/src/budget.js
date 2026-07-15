/**
 * ExecutionBudget — tracks and enforces cost/time/call limits for agent tasks.
 *
 * Every step records its usage. The executor checks the budget before starting
 * a new step and aborts if any hard limit is exceeded.
 */
export class ExecutionBudget {
  #maxCost;
  #maxDuration;
  #maxApiCalls;
  #startTime;

  #totalCost = 0;
  #totalTokens = 0;
  #totalDuration = 0;
  #apiCalls = 0;

  /**
   * @param {{maxCost?: number, maxDuration?: number, maxApiCalls?: number}} limits
   */
  constructor({ maxCost = Infinity, maxDuration = Infinity, maxApiCalls = Infinity } = {}) {
    this.#maxCost = maxCost;
    this.#maxDuration = maxDuration;
    this.#maxApiCalls = maxApiCalls;
    this.#startTime = Date.now();
  }

  /**
   * Record usage from a completed step.
   * @param {number} cost — dollar cost
   * @param {number} tokens — tokens consumed
   * @param {number} duration — wall-clock ms for this step
   */
  record(cost, tokens, duration) {
    this.#totalCost += cost;
    this.#totalTokens += tokens;
    this.#totalDuration += duration;
    this.#apiCalls += 1;
  }

  /**
   * Check whether the budget is still within limits.
   * @returns {{ok: boolean, violations: string[]}}
   */
  check() {
    const violations = [];
    if (this.#totalCost >= this.#maxCost) {
      violations.push(`Cost $${this.#totalCost.toFixed(4)} >= limit $${this.#maxCost.toFixed(4)}`);
    }
    const elapsed = (Date.now() - this.#startTime) / 1000;
    if (elapsed >= this.#maxDuration) {
      violations.push(`Duration ${elapsed.toFixed(1)}s >= limit ${this.#maxDuration}s`);
    }
    if (this.#apiCalls >= this.#maxApiCalls) {
      violations.push(`API calls ${this.#apiCalls} >= limit ${this.#maxApiCalls}`);
    }
    return { ok: violations.length === 0, violations };
  }

  /**
   * Human-readable budget summary.
   * @returns {string}
   */
  report() {
    const elapsed = ((Date.now() - this.#startTime) / 1000).toFixed(1);
    const lines = [
      `Cost:      $${this.#totalCost.toFixed(4)} / $${this.#maxCost === Infinity ? '∞' : this.#maxCost.toFixed(4)}`,
      `Tokens:    ${this.#totalTokens.toLocaleString()}`,
      `Duration:  ${elapsed}s / ${this.#maxDuration === Infinity ? '∞' : this.#maxDuration + 's'}`,
      `API calls: ${this.#apiCalls} / ${this.#maxApiCalls === Infinity ? '∞' : this.#maxApiCalls}`,
    ];
    return lines.join('\n');
  }

  /** @returns {number} */
  get totalCost() { return this.#totalCost; }
  /** @returns {number} */
  get totalTokens() { return this.#totalTokens; }
  /** @returns {number} */
  get apiCalls() { return this.#apiCalls; }
  /** @returns {number} */
  get totalDuration() { return this.#totalDuration; }

  /**
   * Restore accumulated state (used when resuming from checkpoint).
   */
  restore({ totalCost = 0, totalTokens = 0, totalDuration = 0, apiCalls = 0 } = {}) {
    this.#totalCost = totalCost;
    this.#totalTokens = totalTokens;
    this.#totalDuration = totalDuration;
    this.#apiCalls = apiCalls;
  }
}
