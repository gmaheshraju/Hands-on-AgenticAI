/**
 * MeshRouter — Routes work items to agent nodes using pluggable strategies.
 *
 * Strategies:
 *   round-robin       — cycle through healthy capable nodes
 *   least-loaded      — pick the node with lowest queue depth
 *   capability-based  — filter by required capability, then least-loaded
 *   affinity-sticky   — route to same node if possible (by affinity key)
 *
 * All strategies automatically exclude failed and degraded nodes.
 */

import { HEALTH } from './agentNode.js';

const STRATEGY = Object.freeze({
  ROUND_ROBIN: 'round-robin',
  LEAST_LOADED: 'least-loaded',
  CAPABILITY: 'capability-based',
  AFFINITY: 'affinity-sticky',
});

export { STRATEGY };

export class MeshRouter {
  constructor() {
    this._nodes = new Map(); // nodeId => AgentNode
    this._rrIndex = 0;
    this._affinityMap = new Map(); // affinityKey => nodeId
    this._excludedNodes = new Set(); // nodeIds excluded by circuit breaker
  }

  /** Register a node with the router. */
  registerNode(node) {
    this._nodes.set(node.id, node);
  }

  /** Remove a node from the router. */
  removeNode(nodeId) {
    this._nodes.delete(nodeId);
    // clean up affinity entries pointing to this node
    for (const [key, id] of this._affinityMap) {
      if (id === nodeId) this._affinityMap.delete(key);
    }
  }

  /** Mark a node as excluded (e.g. circuit breaker open). */
  excludeNode(nodeId) {
    this._excludedNodes.add(nodeId);
  }

  /** Remove exclusion (e.g. circuit breaker closed/half-open). */
  includeNode(nodeId) {
    this._excludedNodes.delete(nodeId);
  }

  /**
   * Select a node for the given work item.
   *
   * @param {object}  workItem
   * @param {string}  [workItem.capability]   Required capability
   * @param {string}  [workItem.affinityKey]  Sticky routing key
   * @param {string}  strategy  One of STRATEGY values
   * @returns {AgentNode|null}
   */
  selectNode(workItem, strategy = STRATEGY.LEAST_LOADED) {
    const candidates = this._healthyCandidates(workItem.capability);
    if (candidates.length === 0) return null;

    switch (strategy) {
      case STRATEGY.ROUND_ROBIN:
        return this._roundRobin(candidates);
      case STRATEGY.LEAST_LOADED:
        return this._leastLoaded(candidates);
      case STRATEGY.CAPABILITY:
        return this._leastLoaded(candidates); // already filtered by capability
      case STRATEGY.AFFINITY:
        return this._affinitySticky(candidates, workItem);
      default:
        return this._leastLoaded(candidates);
    }
  }

  /** Get all healthy nodes that can handle a given capability. */
  _healthyCandidates(capability) {
    const result = [];
    for (const node of this._nodes.values()) {
      if (this._excludedNodes.has(node.id)) continue;
      if (node._health === HEALTH.FAILED || node._health === HEALTH.DEGRADED) continue;
      if (capability && !node.hasCapability(capability)) continue;
      result.push(node);
    }
    return result;
  }

  _roundRobin(candidates) {
    this._rrIndex = this._rrIndex % candidates.length;
    const node = candidates[this._rrIndex];
    this._rrIndex++;
    return node;
  }

  _leastLoaded(candidates) {
    let best = candidates[0];
    let bestLoad = best.loadMetrics().queueDepth;

    for (let i = 1; i < candidates.length; i++) {
      const load = candidates[i].loadMetrics().queueDepth;
      if (load < bestLoad) {
        best = candidates[i];
        bestLoad = load;
      }
    }
    return best;
  }

  _affinitySticky(candidates, workItem) {
    const key = workItem.affinityKey;
    if (key && this._affinityMap.has(key)) {
      const prevId = this._affinityMap.get(key);
      const prev = candidates.find((n) => n.id === prevId);
      if (prev) return prev;
      // previous affinity node unavailable, fall through
    }

    const chosen = this._leastLoaded(candidates);
    if (key) {
      this._affinityMap.set(key, chosen.id);
    }
    return chosen;
  }
}
