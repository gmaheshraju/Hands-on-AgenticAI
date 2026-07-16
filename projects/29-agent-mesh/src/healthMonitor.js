/**
 * HealthMonitor — Watches all registered nodes for missed heartbeats
 * and health degradation. Emits events so the mesh can react.
 *
 * Events:
 *   node_degraded  { nodeId, metrics }
 *   node_failed    { nodeId, missedBeats }
 *   node_recovered { nodeId }
 */

import { EventEmitter } from 'node:events';
import { HEALTH } from './agentNode.js';

export class HealthMonitor extends EventEmitter {
  /**
   * @param {object} opts
   * @param {number} [opts.heartbeatInterval=3000]  Expected ms between heartbeats
   * @param {number} [opts.failureThreshold=3]      Missed heartbeats before declaring failure
   * @param {number} [opts.checkInterval=1000]       How often the monitor polls (ms)
   * @param {function} [opts.healthCheckFn]          Optional custom health check (node => boolean)
   */
  constructor(opts = {}) {
    super();
    this.heartbeatInterval = opts.heartbeatInterval ?? 3000;
    this.failureThreshold = opts.failureThreshold ?? 3;
    this.checkInterval = opts.checkInterval ?? 1000;
    this._healthCheckFn = opts.healthCheckFn || null;
    this._nodes = new Map(); // nodeId => AgentNode
    this._missedBeats = new Map(); // nodeId => count
    this._timer = null;
  }

  /** Register a node for monitoring. */
  watch(node) {
    this._nodes.set(node.id, node);
    this._missedBeats.set(node.id, 0);
  }

  /** Stop watching a node. */
  unwatch(nodeId) {
    this._nodes.delete(nodeId);
    this._missedBeats.delete(nodeId);
  }

  /** Start the monitoring loop. */
  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._check(), this.checkInterval);
  }

  /** Stop the monitoring loop. */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /** Run a single check pass (also useful for testing without timers). */
  check() {
    this._check();
  }

  _check() {
    const now = Date.now();

    for (const [nodeId, node] of this._nodes) {
      const sinceLastBeat = now - node._lastHeartbeat;
      const expectedBeats = Math.floor(sinceLastBeat / this.heartbeatInterval);

      // Custom health check
      if (this._healthCheckFn && !this._healthCheckFn(node)) {
        if (node._health !== HEALTH.FAILED) {
          node.setHealth(HEALTH.FAILED);
          this.emit('node_failed', { nodeId, reason: 'custom_health_check' });
        }
        continue;
      }

      if (expectedBeats > 0 && node._health !== HEALTH.FAILED) {
        const missed = this._missedBeats.get(nodeId) + 1;
        this._missedBeats.set(nodeId, missed);

        if (missed >= this.failureThreshold) {
          if (node._health !== HEALTH.FAILED) {
            node.setHealth(HEALTH.FAILED);
            this.emit('node_failed', { nodeId, missedBeats: missed });
          }
        } else if (missed >= Math.ceil(this.failureThreshold / 2)) {
          if (node._health === HEALTH.HEALTHY) {
            node.setHealth(HEALTH.DEGRADED);
            this.emit('node_degraded', { nodeId, metrics: node.loadMetrics() });
          }
        }
      }

      // Detect recovery: if a previously failed node sent a heartbeat recently
      if (
        node._health === HEALTH.HEALTHY &&
        this._missedBeats.get(nodeId) > 0
      ) {
        this._missedBeats.set(nodeId, 0);
        this.emit('node_recovered', { nodeId });
      }
    }
  }

  /** Manually trigger failure detection for a node (for testing / instant detection). */
  declareFailure(nodeId) {
    const node = this._nodes.get(nodeId);
    if (!node) return;
    if (node._health !== HEALTH.FAILED) {
      node.setHealth(HEALTH.FAILED);
      this._missedBeats.set(nodeId, this.failureThreshold);
      this.emit('node_failed', { nodeId, missedBeats: this.failureThreshold });
    }
  }

  /** Manually declare recovery for a node. */
  declareRecovery(nodeId) {
    const node = this._nodes.get(nodeId);
    if (!node) return;
    node.recover();
    this._missedBeats.set(nodeId, 0);
    this.emit('node_recovered', { nodeId });
  }
}
