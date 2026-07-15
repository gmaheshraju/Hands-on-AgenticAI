/**
 * DAG Workflow Execution Engine
 *
 * Core responsibilities:
 *   1. Parse workflow definitions (nodes + edges)
 *   2. Topological sort to determine execution order
 *   3. Execute nodes in dependency order, parallelizing independent nodes
 *   4. Handle conditional branching
 *   5. Manage state transitions and execution traces
 *   6. Retry failed nodes with exponential backoff
 */

import { WorkflowRun } from './state.js';
import { retryWithBackoff } from './retry.js';
import { executeLLMNode } from './nodes/llm.js';
import { executeToolNode } from './nodes/tool.js';
import { executeApprovalNode } from './nodes/approval.js';
import { executeConditionNode } from './nodes/condition.js';
import { executeParallelNode } from './nodes/parallel.js';
import { executeTransformNode } from './nodes/transform.js';

// ─── Node type → executor mapping ──────────────────────────────────

const NODE_EXECUTORS = {
  llm:       executeLLMNode,
  tool:      executeToolNode,
  approval:  executeApprovalNode,
  condition: executeConditionNode,
  parallel:  executeParallelNode,
  transform: executeTransformNode,
};

// ─── DAG utilities ─────────────────────────────────────────────────

/**
 * Build adjacency list and in-degree map from edges.
 */
function buildGraph(nodes, edges) {
  const adj = new Map();       // nodeId → [{ target, conditionBranch? }]
  const inDegree = new Map();  // nodeId → number
  const nodeMap = new Map();   // nodeId → node definition

  for (const node of nodes) {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
    nodeMap.set(node.id, node);
  }

  for (const edge of edges) {
    adj.get(edge.from)?.push({
      target: edge.to,
      conditionBranch: edge.conditionBranch,  // 'true' or 'false' for condition edges
    });
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }

  return { adj, inDegree, nodeMap };
}

/**
 * Kahn's algorithm for topological sort.
 * Returns layers of nodes that can execute in parallel.
 */
function topologicalLayers(nodes, edges) {
  const { adj, inDegree } = buildGraph(nodes, edges);
  const layers = [];
  let queue = [];

  // Find all source nodes (in-degree 0)
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) queue.push(nodeId);
  }

  while (queue.length > 0) {
    layers.push([...queue]);
    const nextQueue = [];

    for (const nodeId of queue) {
      for (const { target } of adj.get(nodeId) || []) {
        const newDegree = inDegree.get(target) - 1;
        inDegree.set(target, newDegree);
        if (newDegree === 0) nextQueue.push(target);
      }
    }

    queue = nextQueue;
  }

  // Cycle detection
  const sortedCount = layers.reduce((sum, layer) => sum + layer.length, 0);
  if (sortedCount !== nodes.length) {
    throw new Error(`Cycle detected in workflow DAG. Sorted ${sortedCount} of ${nodes.length} nodes.`);
  }

  return layers;
}

/**
 * Validate a workflow definition.
 */
function validateWorkflow(workflow) {
  const errors = [];

  if (!workflow.id) errors.push('Workflow must have an "id"');
  if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    errors.push('Workflow must have at least one node');
  }
  if (!Array.isArray(workflow.edges)) {
    errors.push('Workflow must have an "edges" array');
  }

  const nodeIds = new Set(workflow.nodes?.map((n) => n.id) || []);
  for (const edge of workflow.edges || []) {
    if (!nodeIds.has(edge.from)) errors.push(`Edge references unknown source node: ${edge.from}`);
    if (!nodeIds.has(edge.to)) errors.push(`Edge references unknown target node: ${edge.to}`);
  }

  for (const node of workflow.nodes || []) {
    if (!node.id) errors.push('Every node must have an "id"');
    if (!node.type) errors.push(`Node "${node.id}" must have a "type"`);
    if (!NODE_EXECUTORS[node.type]) {
      errors.push(`Node "${node.id}" has unknown type: ${node.type}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Workflow validation failed:\n  - ${errors.join('\n  - ')}`);
  }
}

// ─── Engine ────────────────────────────────────────────────────────

export class WorkflowEngine {
  constructor(opts = {}) {
    this.defaultRetry = opts.retry || { maxRetries: 2, baseDelayMs: 200, timeoutMs: 15_000 };
    this.onNodeStart = opts.onNodeStart || null;
    this.onNodeComplete = opts.onNodeComplete || null;
    this.onNodeFailed = opts.onNodeFailed || null;
    this.verbose = opts.verbose ?? true;
  }

  /**
   * Execute a workflow with the given input data.
   *
   * @param {object} workflow — workflow definition { id, nodes, edges }
   * @param {object} inputData — initial data for the workflow
   * @returns {WorkflowRun} — completed run with full trace
   */
  async execute(workflow, inputData = {}) {
    validateWorkflow(workflow);

    const run = new WorkflowRun(workflow.id, inputData);
    const { adj, nodeMap } = buildGraph(workflow.nodes, workflow.edges);

    // Compute execution layers
    const layers = topologicalLayers(workflow.nodes, workflow.edges);

    if (this.verbose) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`  Workflow: ${workflow.id}`);
      console.log(`  Run ID:   ${run.id}`);
      console.log(`  Nodes:    ${workflow.nodes.length}`);
      console.log(`  Edges:    ${workflow.edges.length}`);
      console.log(`  Layers:   ${layers.length}`);
      console.log(`${'='.repeat(60)}`);
    }

    run.transition('RUNNING');

    // Data store: nodeId → output data
    const nodeOutputs = new Map();
    nodeOutputs.set('__input__', inputData);

    // Track which nodes are active (not skipped by conditions)
    const skippedNodes = new Set();

    try {
      for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
        const layer = layers[layerIdx];

        if (this.verbose) {
          console.log(`\n--- Layer ${layerIdx + 1} [${layer.join(', ')}] ---`);
        }

        // Execute all nodes in this layer in parallel
        const results = await Promise.allSettled(
          layer.map((nodeId) => this._executeNode(nodeId, nodeMap, adj, nodeOutputs, skippedNodes, run, workflow))
        );

        // Check for failures
        for (let i = 0; i < results.length; i++) {
          if (results[i].status === 'rejected') {
            const nodeId = layer[i];
            const err = results[i].reason;
            run.recordNodeFailure(nodeId, err.message);
            if (this.onNodeFailed) this.onNodeFailed(nodeId, err);

            // If node is not skipped and not optional, fail the workflow
            const node = nodeMap.get(nodeId);
            if (!node.optional) {
              throw err;
            }
          }
        }
      }

      run.transition('COMPLETED');
    } catch (err) {
      run.error = err.message;
      try { run.transition('FAILED'); } catch (_) { /* already failed */ }
    }

    if (this.verbose) {
      this._printSummary(run);
    }

    return run;
  }

  /**
   * Execute a single node, handling retries, conditions, and data flow.
   */
  async _executeNode(nodeId, nodeMap, adj, nodeOutputs, skippedNodes, run, workflow) {
    // Skip if this node was eliminated by a condition branch
    if (skippedNodes.has(nodeId)) {
      run.recordNodeSkipped(nodeId, 'Eliminated by upstream condition');
      if (this.verbose) console.log(`  [SKIP] ${nodeId} — condition branch not taken`);
      return;
    }

    const node = nodeMap.get(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);

    // Gather input: merge all upstream outputs
    const input = this._gatherInput(nodeId, workflow.edges, nodeOutputs);

    if (this.verbose) console.log(`  [START] ${nodeId} (${node.type})`);
    run.recordNodeStart(nodeId, input);
    if (this.onNodeStart) this.onNodeStart(nodeId, node.type);

    const executor = NODE_EXECUTORS[node.type];
    const config = { ...node.config, _nodeId: nodeId };
    const retryOpts = { ...this.defaultRetry, ...(node.retry || {}) };

    // Handle approval nodes — transition workflow to WAITING_APPROVAL
    if (node.type === 'approval') {
      run.transition('WAITING_APPROVAL');
    }

    const { result, attempts } = await retryWithBackoff(
      () => executor(config, input),
      retryOpts
    );

    // Store output
    nodeOutputs.set(nodeId, result);
    run.recordNodeSuccess(nodeId, result, attempts.length - 1);

    if (this.verbose) {
      const duration = run.nodeResults.get(nodeId)?.durationMs;
      console.log(`  [DONE]  ${nodeId} (${duration}ms${attempts.length > 1 ? `, ${attempts.length} attempts` : ''})`);
    }

    if (this.onNodeComplete) this.onNodeComplete(nodeId, result);

    // If this was an approval node, transition back to RUNNING
    if (node.type === 'approval') {
      run.transition('RUNNING');
    }

    // Handle condition branches: mark non-taken branches as skipped
    if (node.type === 'condition' && result._condition) {
      const downstreamEdges = adj.get(nodeId) || [];
      for (const edge of downstreamEdges) {
        if (edge.conditionBranch && edge.conditionBranch !== result._condition.branchTaken) {
          this._markBranchSkipped(edge.target, adj, skippedNodes);
        }
      }
    }
  }

  /**
   * Gather input for a node by merging all upstream node outputs.
   */
  _gatherInput(nodeId, edges, nodeOutputs) {
    const upstreamEdges = edges.filter((e) => e.to === nodeId);
    if (upstreamEdges.length === 0) {
      // Source node — use workflow input
      return { ...(nodeOutputs.get('__input__') || {}) };
    }

    let merged = { ...(nodeOutputs.get('__input__') || {}) };
    for (const edge of upstreamEdges) {
      const upstreamOutput = nodeOutputs.get(edge.from);
      if (upstreamOutput) {
        merged = { ...merged, ...upstreamOutput };
      }
    }
    return merged;
  }

  /**
   * Recursively mark a branch and all its downstream nodes as skipped.
   */
  _markBranchSkipped(nodeId, adj, skippedNodes) {
    if (skippedNodes.has(nodeId)) return;
    skippedNodes.add(nodeId);
    for (const edge of adj.get(nodeId) || []) {
      this._markBranchSkipped(edge.target, adj, skippedNodes);
    }
  }

  /**
   * Print a formatted summary of the run.
   */
  _printSummary(run) {
    const summary = run.summary();
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  Status: ${summary.status}`);
    console.log(`  Total:  ${summary.totalMs}ms`);
    console.log(`  Nodes:`);
    for (const node of summary.nodes) {
      const icon = node.status === 'completed' ? '+' : node.status === 'skipped' ? '~' : 'X';
      const extra = [];
      if (node.durationMs) extra.push(`${node.durationMs}ms`);
      if (node.retries > 0) extra.push(`${node.retries} retries`);
      if (node.reason) extra.push(node.reason);
      if (node.error) extra.push(`ERROR: ${node.error}`);
      console.log(`    [${icon}] ${node.node} — ${node.status}${extra.length ? ` (${extra.join(', ')})` : ''}`);
    }
    console.log(`${'─'.repeat(60)}\n`);
  }
}

export { topologicalLayers, validateWorkflow, buildGraph };
