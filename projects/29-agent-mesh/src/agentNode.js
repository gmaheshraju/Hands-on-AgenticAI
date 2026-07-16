/**
 * AgentNode — A node in the self-healing mesh.
 *
 * Each node declares capabilities, tracks its own health via heartbeats,
 * maintains load metrics, and processes work items from an internal queue.
 */

import { EventEmitter } from 'node:events';

const HEALTH = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  FAILED: 'failed',
});

export { HEALTH };

let _idCounter = 0;

export class AgentNode extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string}   opts.name         Human-readable name
   * @param {string[]} opts.capabilities List of capability tags (e.g. ['nlp', 'vision'])
   * @param {number}   [opts.maxQueueDepth=50]    Queue depth that triggers degraded status
   * @param {number}   [opts.errorRateThreshold=0.5] Error rate that triggers degraded status
   * @param {number}   [opts.latencyThreshold=2000]  Avg latency (ms) that triggers degraded status
   * @param {function} [opts.processor]  Async function(workItem) => result. Default: identity.
   */
  constructor(opts = {}) {
    super();
    this.id = `node_${++_idCounter}`;
    this.name = opts.name || this.id;
    this._capabilities = new Set(opts.capabilities || []);
    this.maxQueueDepth = opts.maxQueueDepth ?? 50;
    this.errorRateThreshold = opts.errorRateThreshold ?? 0.5;
    this.latencyThreshold = opts.latencyThreshold ?? 2000;
    this._processor = opts.processor || (async (item) => item);

    // Health
    this._health = HEALTH.HEALTHY;
    this._lastHeartbeat = Date.now();
    this._manualFail = false;

    // Load metrics
    this._queue = [];
    this._processing = 0;
    this._totalProcessed = 0;
    this._totalErrors = 0;
    this._recentLatencies = []; // sliding window of last 100 latencies

    // Work tracking
    this._pendingWork = new Map(); // workId => workItem

    this._running = true;
  }

  /** Record a heartbeat, resetting the last-seen timestamp. */
  heartbeat() {
    this._lastHeartbeat = Date.now();
    if (this._manualFail) return; // don't auto-recover from manual fail
    const prev = this._health;
    this._health = this._computeHealth();
    if (prev !== this._health) {
      this.emit('health_change', { nodeId: this.id, from: prev, to: this._health });
    }
  }

  /** Force a health state (used by HealthMonitor for failure detection). */
  setHealth(status) {
    const prev = this._health;
    this._health = status;
    if (status === HEALTH.FAILED) this._manualFail = true;
    if (prev !== this._health) {
      this.emit('health_change', { nodeId: this.id, from: prev, to: this._health });
    }
  }

  /** Recover a previously failed node. */
  recover() {
    this._manualFail = false;
    this._totalErrors = 0;
    this._recentLatencies = [];
    this._health = HEALTH.HEALTHY;
    this._lastHeartbeat = Date.now();
    this.emit('health_change', { nodeId: this.id, from: HEALTH.FAILED, to: HEALTH.HEALTHY });
  }

  /** Report current health snapshot. */
  reportHealth() {
    return {
      nodeId: this.id,
      name: this.name,
      health: this._health,
      lastHeartbeat: this._lastHeartbeat,
      metrics: this.loadMetrics(),
    };
  }

  /** Return the declared capability set. */
  capabilities() {
    return [...this._capabilities];
  }

  /** Check if this node has a specific capability. */
  hasCapability(cap) {
    return this._capabilities.has(cap);
  }

  /** Current load metrics. */
  loadMetrics() {
    const total = this._totalProcessed + this._totalErrors;
    const errorRate = total === 0 ? 0 : this._totalErrors / total;
    const avgLatency =
      this._recentLatencies.length === 0
        ? 0
        : this._recentLatencies.reduce((a, b) => a + b, 0) / this._recentLatencies.length;

    return {
      queueDepth: this._queue.length + this._processing,
      totalProcessed: this._totalProcessed,
      totalErrors: this._totalErrors,
      errorRate: Math.round(errorRate * 1000) / 1000,
      avgLatency: Math.round(avgLatency),
    };
  }

  /** Enqueue a work item. Returns a promise that resolves when the item is processed. */
  enqueue(workItem) {
    if (!this._running || this._health === HEALTH.FAILED) {
      return Promise.reject(new Error(`Node ${this.id} is ${this._health}, cannot accept work`));
    }

    return new Promise((resolve, reject) => {
      const entry = { workItem, resolve, reject, enqueuedAt: Date.now() };
      this._queue.push(entry);
      this._pendingWork.set(workItem.id, workItem);
      this._drain();
    });
  }

  /** Get all pending (queued but not yet completed) work items. */
  getPendingWork() {
    return [...this._pendingWork.values()];
  }

  /** Shutdown the node gracefully. */
  shutdown() {
    this._running = false;
    this.setHealth(HEALTH.FAILED);
  }

  // --- Internal ---

  _computeHealth() {
    const metrics = this.loadMetrics();
    if (metrics.errorRate >= this.errorRateThreshold) return HEALTH.DEGRADED;
    if (metrics.queueDepth >= this.maxQueueDepth) return HEALTH.DEGRADED;
    if (metrics.avgLatency >= this.latencyThreshold) return HEALTH.DEGRADED;
    return HEALTH.HEALTHY;
  }

  async _drain() {
    // process one item at a time per drain call
    if (this._queue.length === 0) return;
    if (this._health === HEALTH.FAILED) return;

    const entry = this._queue.shift();
    this._processing++;
    const start = Date.now();

    try {
      const result = await this._processor(entry.workItem);
      const latency = Date.now() - start;
      this._recordLatency(latency);
      this._totalProcessed++;
      this._pendingWork.delete(entry.workItem.id);
      entry.resolve(result);
    } catch (err) {
      const latency = Date.now() - start;
      this._recordLatency(latency);
      this._totalErrors++;
      this._pendingWork.delete(entry.workItem.id);
      entry.reject(err);
    } finally {
      this._processing--;
      // update health after each item
      if (!this._manualFail) {
        const prev = this._health;
        this._health = this._computeHealth();
        if (prev !== this._health) {
          this.emit('health_change', { nodeId: this.id, from: prev, to: this._health });
        }
      }
      // continue draining
      if (this._queue.length > 0) {
        this._drain();
      }
    }
  }

  _recordLatency(ms) {
    this._recentLatencies.push(ms);
    if (this._recentLatencies.length > 100) {
      this._recentLatencies.shift();
    }
  }
}

/** Reset the internal ID counter (useful for tests). */
export function resetIdCounter() {
  _idCounter = 0;
}
