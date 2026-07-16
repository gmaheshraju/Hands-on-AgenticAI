/**
 * WorkRedistributor — When a node fails, reassigns its pending work
 * to healthy nodes that have the required capabilities.
 *
 * Guards against cascading failures by capping per-node redistribution load
 * and tracking redistribution history for observability.
 */

import { HEALTH } from './agentNode.js';

export class WorkRedistributor {
  /**
   * @param {object} opts
   * @param {number} [opts.maxRedistPerNode=10] Max items to redistribute to a single node in one pass
   */
  constructor(opts = {}) {
    this.maxRedistPerNode = opts.maxRedistPerNode ?? 10;
    this._history = []; // { timestamp, fromNodeId, toNodeId, workItemId, capability }
    this._failedItems = []; // items that could not be redistributed
  }

  /**
   * Redistribute pending work from a failed node across healthy nodes.
   *
   * @param {AgentNode}   failedNode   The node that failed
   * @param {AgentNode[]} healthyNodes All candidate healthy nodes
   * @returns {{ redistributed: number, failed: number, assignments: Array }}
   */
  redistribute(failedNode, healthyNodes) {
    const pendingWork = failedNode.getPendingWork();
    const assignments = [];
    let redistributed = 0;
    let failed = 0;

    // Track how many items each healthy node has received in this pass
    const loadMap = new Map();
    for (const node of healthyNodes) {
      loadMap.set(node.id, 0);
    }

    for (const workItem of pendingWork) {
      const capable = healthyNodes.filter((n) => {
        if (n._health === HEALTH.FAILED || n._health === HEALTH.DEGRADED) return false;
        if (workItem.capability && !n.hasCapability(workItem.capability)) return false;
        if ((loadMap.get(n.id) || 0) >= this.maxRedistPerNode) return false;
        return true;
      });

      if (capable.length === 0) {
        failed++;
        this._failedItems.push({
          workItem,
          reason: 'no_capable_healthy_node',
          timestamp: Date.now(),
        });
        continue;
      }

      // Pick the least-loaded capable node (current queue + redistribution load)
      let best = capable[0];
      let bestScore = best.loadMetrics().queueDepth + (loadMap.get(best.id) || 0);
      for (let i = 1; i < capable.length; i++) {
        const score = capable[i].loadMetrics().queueDepth + (loadMap.get(capable[i].id) || 0);
        if (score < bestScore) {
          best = capable[i];
          bestScore = score;
        }
      }

      loadMap.set(best.id, (loadMap.get(best.id) || 0) + 1);

      const record = {
        timestamp: Date.now(),
        fromNodeId: failedNode.id,
        toNodeId: best.id,
        workItemId: workItem.id,
        capability: workItem.capability || null,
      };
      this._history.push(record);
      assignments.push(record);
      redistributed++;

      // Actually enqueue (fire-and-forget — the mesh handles results)
      best.enqueue(workItem).catch(() => {
        // If the target also fails, cascading failure handling kicks in
      });
    }

    return { redistributed, failed, assignments };
  }

  /** Get full redistribution history. */
  history() {
    return [...this._history];
  }

  /** Get items that could not be redistributed. */
  failedItems() {
    return [...this._failedItems];
  }

  /** Clear history (useful for testing). */
  clearHistory() {
    this._history = [];
    this._failedItems = [];
  }
}
