/**
 * Mesh — Top-level orchestrator for the self-healing agent mesh.
 *
 * Ties together: AgentNode, MeshRouter, HealthMonitor,
 * WorkRedistributor, and CircuitBreakerRegistry.
 *
 * Provides:
 *   - Node registration / deregistration
 *   - Work submission with automatic routing, failover, and circuit breaking
 *   - Health monitoring with automatic failure detection and work redistribution
 *   - Degraded mode: when most nodes are down, throttle rather than reject
 *   - Dashboard: mesh-wide health overview
 */

import { EventEmitter } from 'node:events';
import { AgentNode, HEALTH } from './agentNode.js';
import { MeshRouter, STRATEGY } from './meshRouter.js';
import { HealthMonitor } from './healthMonitor.js';
import { WorkRedistributor } from './workRedistributor.js';
import { CircuitBreakerRegistry } from './circuitBreaker.js';

export class Mesh extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} [opts.strategy='least-loaded']  Default routing strategy
   * @param {number} [opts.heartbeatInterval=3000]
   * @param {number} [opts.failureThreshold=3]
   * @param {number} [opts.monitorCheckInterval=1000]
   * @param {number} [opts.cbFailureThreshold=5]      Circuit breaker failure threshold
   * @param {number} [opts.cbCooldownMs=10000]         Circuit breaker cooldown
   * @param {number} [opts.degradedThreshold=0.5]      Fraction of failed nodes to enter degraded mode
   * @param {number} [opts.maxRetries=2]               Retries on routing failure
   */
  constructor(opts = {}) {
    super();
    this.strategy = opts.strategy || STRATEGY.LEAST_LOADED;
    this.maxRetries = opts.maxRetries ?? 2;
    this.degradedThreshold = opts.degradedThreshold ?? 0.5;

    this._nodes = new Map(); // nodeId => AgentNode
    this._router = new MeshRouter();
    this._monitor = new HealthMonitor({
      heartbeatInterval: opts.heartbeatInterval ?? 3000,
      failureThreshold: opts.failureThreshold ?? 3,
      checkInterval: opts.monitorCheckInterval ?? 1000,
    });
    this._redistributor = new WorkRedistributor();
    this._cbRegistry = new CircuitBreakerRegistry({
      failureThreshold: opts.cbFailureThreshold ?? 5,
      cooldownMs: opts.cbCooldownMs ?? 10000,
    });

    this._degradedMode = false;
    this._workIdCounter = 0;
    this._completedWork = [];
    this._failedWork = [];

    // Wire up monitor events
    this._monitor.on('node_failed', (evt) => this._onNodeFailed(evt));
    this._monitor.on('node_degraded', (evt) => this.emit('node_degraded', evt));
    this._monitor.on('node_recovered', (evt) => this._onNodeRecovered(evt));
  }

  /** Register a new agent node into the mesh. */
  registerNode(node) {
    this._nodes.set(node.id, node);
    this._router.registerNode(node);
    this._monitor.watch(node);
    this.emit('node_registered', { nodeId: node.id, name: node.name });
    return node;
  }

  /** Create and register a node in one call. */
  addNode(opts) {
    const node = new AgentNode(opts);
    return this.registerNode(node);
  }

  /** Remove a node from the mesh. */
  removeNode(nodeId) {
    this._nodes.delete(nodeId);
    this._router.removeNode(nodeId);
    this._monitor.unwatch(nodeId);
    this._cbRegistry.removeBreaker(nodeId);
    this.emit('node_removed', { nodeId });
  }

  /** Start health monitoring. */
  startMonitoring() {
    this._monitor.start();
  }

  /** Stop health monitoring. */
  stopMonitoring() {
    this._monitor.stop();
  }

  /** Run a single health check pass (useful for testing). */
  healthCheck() {
    this._monitor.check();
  }

  /**
   * Submit work to the mesh. The mesh routes it, handles failures,
   * retries on different nodes, and tracks results.
   *
   * @param {object}  workItem
   * @param {string}  [workItem.capability]   Required capability
   * @param {string}  [workItem.affinityKey]  Sticky routing key
   * @param {*}       [workItem.payload]       Work payload
   * @param {string}  [strategy]               Override default strategy
   * @returns {Promise<{ result: *, nodeId: string, workId: string }>}
   */
  async submitWork(workItem, strategy) {
    const workId = `work_${++this._workIdCounter}`;
    const item = { ...workItem, id: workId };
    const usedStrategy = strategy || this.strategy;

    let lastError;
    const triedNodes = new Set();

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const node = this._selectAvailableNode(item, usedStrategy, triedNodes);
      if (!node) break;

      triedNodes.add(node.id);

      // Circuit breaker gate
      if (!this._cbRegistry.allowRequest(node.id)) {
        this._router.excludeNode(node.id);
        continue;
      }

      try {
        const result = await node.enqueue(item);
        this._cbRegistry.recordSuccess(node.id);
        const record = { workId, nodeId: node.id, result, completedAt: Date.now() };
        this._completedWork.push(record);
        this.emit('work_completed', record);
        return record;
      } catch (err) {
        lastError = err;
        this._cbRegistry.recordFailure(node.id);
      }
    }

    // All retries exhausted
    const failRecord = { workId, error: lastError?.message || 'no healthy node available', item };
    this._failedWork.push(failRecord);
    this.emit('work_failed', failRecord);
    throw new Error(failRecord.error);
  }

  /** Manually trigger failure for a node (testing / admin). */
  failNode(nodeId) {
    this._monitor.declareFailure(nodeId);
  }

  /** Manually recover a node (testing / admin). */
  recoverNode(nodeId) {
    this._monitor.declareRecovery(nodeId);
    this._router.includeNode(nodeId);
    this._cbRegistry.getBreaker(nodeId).reset();
  }

  /** Dashboard: mesh-wide health overview. */
  dashboard() {
    const nodes = [];
    let healthyCount = 0;
    let degradedCount = 0;
    let failedCount = 0;

    for (const node of this._nodes.values()) {
      const health = node.reportHealth();
      const cb = this._cbRegistry.getBreaker(node.id).stats();
      nodes.push({ ...health, circuitBreaker: cb });

      if (node._health === HEALTH.HEALTHY) healthyCount++;
      else if (node._health === HEALTH.DEGRADED) degradedCount++;
      else failedCount++;
    }

    const total = this._nodes.size;

    return {
      totalNodes: total,
      healthy: healthyCount,
      degraded: degradedCount,
      failed: failedCount,
      degradedMode: this._degradedMode,
      completedWork: this._completedWork.length,
      failedWork: this._failedWork.length,
      redistributionHistory: this._redistributor.history().length,
      nodes,
    };
  }

  /** Pretty-print the dashboard to a string. */
  dashboardString() {
    const d = this.dashboard();
    const lines = [];
    lines.push('');
    lines.push('='.repeat(60));
    lines.push('  AGENT MESH DASHBOARD');
    lines.push('='.repeat(60));
    lines.push(`  Nodes: ${d.totalNodes} total | ${d.healthy} healthy | ${d.degraded} degraded | ${d.failed} failed`);
    lines.push(`  Mode:  ${d.degradedMode ? 'DEGRADED' : 'NORMAL'}`);
    lines.push(`  Work:  ${d.completedWork} completed | ${d.failedWork} failed | ${d.redistributionHistory} redistributed`);
    lines.push('-'.repeat(60));

    for (const n of d.nodes) {
      const healthTag = n.health === 'healthy' ? '[OK]' : n.health === 'degraded' ? '[!!]' : '[XX]';
      const cb = n.circuitBreaker.state === 'closed' ? 'CB:closed' : n.circuitBreaker.state === 'open' ? 'CB:OPEN' : 'CB:half';
      lines.push(`  ${healthTag} ${n.name.padEnd(20)} | q:${n.metrics.queueDepth} err:${n.metrics.errorRate} lat:${n.metrics.avgLatency}ms | ${cb}`);
    }

    lines.push('='.repeat(60));
    lines.push('');
    return lines.join('\n');
  }

  // --- Internal ---

  _selectAvailableNode(workItem, strategy, triedNodes) {
    // Temporarily exclude already-tried nodes
    for (const id of triedNodes) {
      this._router.excludeNode(id);
    }
    const node = this._router.selectNode(workItem, strategy);
    // Re-include (they might be needed for other work)
    for (const id of triedNodes) {
      const n = this._nodes.get(id);
      if (n && n._health === HEALTH.HEALTHY) {
        this._router.includeNode(id);
      }
    }
    return node;
  }

  _onNodeFailed(evt) {
    const node = this._nodes.get(evt.nodeId);
    if (!node) return;

    // Exclude from routing
    this._router.excludeNode(evt.nodeId);
    this._cbRegistry.getBreaker(evt.nodeId).trip();

    // Redistribute pending work
    const healthyNodes = [...this._nodes.values()].filter(
      (n) => n.id !== evt.nodeId && n._health === HEALTH.HEALTHY
    );
    const result = this._redistributor.redistribute(node, healthyNodes);

    // Check for degraded mode
    const total = this._nodes.size;
    const failedCount = [...this._nodes.values()].filter((n) => n._health === HEALTH.FAILED).length;
    if (total > 0 && failedCount / total >= this.degradedThreshold) {
      this._degradedMode = true;
      this.emit('mesh_degraded', { failedCount, total });
    }

    this.emit('node_failed', { ...evt, redistributed: result.redistributed });
  }

  _onNodeRecovered(evt) {
    this._router.includeNode(evt.nodeId);
    this._cbRegistry.getBreaker(evt.nodeId).reset();

    // Check if we can exit degraded mode
    const total = this._nodes.size;
    const failedCount = [...this._nodes.values()].filter((n) => n._health === HEALTH.FAILED).length;
    if (total > 0 && failedCount / total < this.degradedThreshold) {
      this._degradedMode = false;
      this.emit('mesh_recovered', { failedCount, total });
    }

    this.emit('node_recovered', evt);
  }
}
