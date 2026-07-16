/**
 * CircuitBreaker — Per-node circuit breaker with three states:
 *   CLOSED   — normal operation, requests flow through
 *   OPEN     — node is failing, all requests blocked
 *   HALF_OPEN — probing: allow one test request to decide recovery
 *
 * Tracks consecutive failures. Opens after threshold. Auto-probes after
 * a cooldown period. Closes on successful probe; re-opens on probe failure.
 */

const STATE = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
});

export { STATE };

export class CircuitBreaker {
  /**
   * @param {object} opts
   * @param {number} [opts.failureThreshold=5]   Consecutive failures to trip open
   * @param {number} [opts.cooldownMs=10000]      Time before probing in half-open
   * @param {number} [opts.halfOpenMax=1]          Max concurrent probe requests
   */
  constructor(opts = {}) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.cooldownMs = opts.cooldownMs ?? 10000;
    this.halfOpenMax = opts.halfOpenMax ?? 1;

    this._state = STATE.CLOSED;
    this._failures = 0;
    this._lastFailureTime = 0;
    this._halfOpenAttempts = 0;
    this._successCount = 0;
    this._totalRequests = 0;
  }

  /** Current state. */
  get state() {
    // Auto-transition from OPEN to HALF_OPEN after cooldown
    if (this._state === STATE.OPEN) {
      if (Date.now() - this._lastFailureTime >= this.cooldownMs) {
        this._state = STATE.HALF_OPEN;
        this._halfOpenAttempts = 0;
      }
    }
    return this._state;
  }

  /** Check if a request is allowed through. */
  allowRequest() {
    const s = this.state; // triggers auto-transition
    if (s === STATE.CLOSED) return true;
    if (s === STATE.HALF_OPEN) {
      return this._halfOpenAttempts < this.halfOpenMax;
    }
    return false; // OPEN
  }

  /** Record a successful request. */
  recordSuccess() {
    this._totalRequests++;
    this._successCount++;

    if (this._state === STATE.HALF_OPEN) {
      // Probe succeeded — close the circuit
      this._state = STATE.CLOSED;
      this._failures = 0;
      this._halfOpenAttempts = 0;
    } else {
      // Reset consecutive failure count on success
      this._failures = 0;
    }
  }

  /** Record a failed request. */
  recordFailure() {
    this._totalRequests++;
    this._failures++;
    this._lastFailureTime = Date.now();

    if (this._state === STATE.HALF_OPEN) {
      // Probe failed — re-open
      this._state = STATE.OPEN;
      this._halfOpenAttempts = 0;
      return;
    }

    if (this._failures >= this.failureThreshold) {
      this._state = STATE.OPEN;
    }
  }

  /** Mark a half-open probe attempt. */
  recordProbeAttempt() {
    this._halfOpenAttempts++;
  }

  /** Force-trip the breaker open. */
  trip() {
    this._state = STATE.OPEN;
    this._lastFailureTime = Date.now();
  }

  /** Force-close the breaker (manual recovery). */
  reset() {
    this._state = STATE.CLOSED;
    this._failures = 0;
    this._halfOpenAttempts = 0;
  }

  /** Stats snapshot. */
  stats() {
    return {
      state: this.state,
      consecutiveFailures: this._failures,
      totalRequests: this._totalRequests,
      successCount: this._successCount,
      lastFailureTime: this._lastFailureTime,
    };
  }
}

/**
 * CircuitBreakerRegistry — Manages per-node circuit breakers.
 */
export class CircuitBreakerRegistry {
  /**
   * @param {object} opts  Default options passed to each CircuitBreaker
   */
  constructor(opts = {}) {
    this._defaults = opts;
    this._breakers = new Map(); // nodeId => CircuitBreaker
  }

  /** Get or create a breaker for a node. */
  getBreaker(nodeId) {
    if (!this._breakers.has(nodeId)) {
      this._breakers.set(nodeId, new CircuitBreaker(this._defaults));
    }
    return this._breakers.get(nodeId);
  }

  /** Remove a breaker. */
  removeBreaker(nodeId) {
    this._breakers.delete(nodeId);
  }

  /** Check if a node's circuit allows requests. */
  allowRequest(nodeId) {
    return this.getBreaker(nodeId).allowRequest();
  }

  /** Record success for a node. */
  recordSuccess(nodeId) {
    this.getBreaker(nodeId).recordSuccess();
  }

  /** Record failure for a node. */
  recordFailure(nodeId) {
    this.getBreaker(nodeId).recordFailure();
  }

  /** Dashboard: all breaker states. */
  allStats() {
    const result = {};
    for (const [nodeId, breaker] of this._breakers) {
      result[nodeId] = breaker.stats();
    }
    return result;
  }
}
