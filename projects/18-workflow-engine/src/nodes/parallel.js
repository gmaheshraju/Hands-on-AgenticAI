/**
 * Parallel fan-out / fan-in node.
 *
 * Executes multiple sub-tasks concurrently and collects results.
 * Each sub-task is a mini-node with its own type and config.
 */

import { executeLLMNode } from './llm.js';
import { executeToolNode } from './tool.js';
import { executeTransformNode } from './transform.js';

const NODE_EXECUTORS = {
  llm: executeLLMNode,
  tool: executeToolNode,
  transform: executeTransformNode,
};

/**
 * Execute a parallel node.
 *
 * Config:
 *   - tasks: Array<{ id, type, config }> — sub-tasks to run in parallel
 *   - outputKey: string — key for collected results (default "parallelResults")
 *   - failFast: boolean — fail immediately if any task fails (default false)
 */
export async function executeParallelNode(config, input) {
  const { tasks = [], outputKey = 'parallelResults', failFast = false } = config;

  if (!tasks.length) throw new Error('Parallel node requires at least one task');

  const promises = tasks.map(async (task) => {
    const executor = NODE_EXECUTORS[task.type];
    if (!executor) throw new Error(`Unknown sub-task type: ${task.type}`);

    const start = Date.now();
    try {
      const result = await executor(task.config, input);
      return {
        id: task.id,
        status: 'completed',
        result,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      if (failFast) throw err;
      return {
        id: task.id,
        status: 'failed',
        error: err.message,
        durationMs: Date.now() - start,
      };
    }
  });

  const results = await (failFast ? Promise.all(promises) : Promise.allSettled(promises));

  // Normalize allSettled results
  const collected = failFast
    ? results
    : results.map((r) => (r.status === 'fulfilled' ? r.value : { status: 'failed', error: r.reason?.message }));

  // Merge results into a keyed object
  const merged = {};
  for (const r of collected) {
    if (r.id) merged[r.id] = r;
  }

  return {
    ...input,
    [outputKey]: merged,
    _parallelMeta: {
      totalTasks: tasks.length,
      completed: collected.filter((r) => r.status === 'completed').length,
      failed: collected.filter((r) => r.status === 'failed').length,
    },
  };
}
