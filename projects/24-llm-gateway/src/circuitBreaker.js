const STATE = { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half_open' };

export class CircuitBreaker {
  constructor(config = {}) {
    this.failureThreshold = config.failureThreshold || 5;
    this.recoveryTimeMs = config.recoveryTimeMs || 30000;
    this.halfOpenMaxAttempts = config.halfOpenMaxAttempts || 2;
    this.providers = new Map();
  }

  _getState(provider) {
    if (!this.providers.has(provider)) {
      this.providers.set(provider, {
        state: STATE.CLOSED,
        failures: 0,
        successes: 0,
        lastFailure: 0,
        halfOpenAttempts: 0,
        totalRequests: 0,
        totalFailures: 0,
      });
    }
    return this.providers.get(provider);
  }

  canRequest(provider) {
    const s = this._getState(provider);

    if (s.state === STATE.CLOSED) return { allowed: true, state: STATE.CLOSED };

    if (s.state === STATE.OPEN) {
      const elapsed = Date.now() - s.lastFailure;
      if (elapsed >= this.recoveryTimeMs) {
        s.state = STATE.HALF_OPEN;
        s.halfOpenAttempts = 0;
        return { allowed: true, state: STATE.HALF_OPEN };
      }
      return { allowed: false, state: STATE.OPEN, retryAfterMs: this.recoveryTimeMs - elapsed };
    }

    if (s.halfOpenAttempts < this.halfOpenMaxAttempts) {
      return { allowed: true, state: STATE.HALF_OPEN };
    }
    return { allowed: false, state: STATE.HALF_OPEN, reason: 'max_half_open_attempts' };
  }

  recordSuccess(provider) {
    const s = this._getState(provider);
    s.totalRequests++;
    s.successes++;

    if (s.state === STATE.HALF_OPEN) {
      s.halfOpenAttempts++;
      if (s.halfOpenAttempts >= this.halfOpenMaxAttempts) {
        s.state = STATE.CLOSED;
        s.failures = 0;
        s.halfOpenAttempts = 0;
      }
    } else {
      s.failures = Math.max(0, s.failures - 1);
    }
  }

  recordFailure(provider, error) {
    const s = this._getState(provider);
    s.totalRequests++;
    s.totalFailures++;
    s.failures++;
    s.lastFailure = Date.now();

    if (s.state === STATE.HALF_OPEN) {
      s.state = STATE.OPEN;
      s.halfOpenAttempts = 0;
    } else if (s.failures >= this.failureThreshold) {
      s.state = STATE.OPEN;
    }
  }

  status(provider) {
    const s = this._getState(provider);
    return {
      provider,
      state: s.state,
      consecutiveFailures: s.failures,
      totalRequests: s.totalRequests,
      failureRate: s.totalRequests > 0 ? Math.round((s.totalFailures / s.totalRequests) * 100) : 0,
    };
  }

  allStatus() {
    const result = {};
    for (const [provider] of this.providers) {
      result[provider] = this.status(provider);
    }
    return result;
  }
}
