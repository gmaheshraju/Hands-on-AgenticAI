/**
 * Task Decomposer — breaks complex requests into sub-tasks
 * and maps each sub-task to a required skill.
 *
 * In production, this would be an LLM call. In demo mode, uses
 * pattern matching to decompose known request types.
 */

const DECOMPOSITION_RULES = [
  {
    pattern: /(?:build|create|develop)\s+(?:a\s+)?(?:full[- ]?stack\s+)?(?:web\s+)?(?:app|application)/i,
    tasks: [
      { skill: 'design', description: 'Design system architecture and component hierarchy', priority: 1 },
      { skill: 'code', description: 'Implement backend API endpoints', priority: 2 },
      { skill: 'code', description: 'Implement frontend components', priority: 2 },
      { skill: 'test', description: 'Write integration tests', priority: 3 },
      { skill: 'review', description: 'Code review and security audit', priority: 4 },
    ],
  },
  {
    pattern: /(?:debug|fix|investigate)\s+(?:the\s+)?(?:performance|latency|slow)/i,
    tasks: [
      { skill: 'monitor', description: 'Gather performance metrics and identify bottleneck', priority: 1 },
      { skill: 'analyze', description: 'Analyze traces and identify root cause', priority: 2 },
      { skill: 'code', description: 'Implement performance fix', priority: 3 },
      { skill: 'test', description: 'Run load test to verify improvement', priority: 4 },
    ],
  },
  {
    pattern: /(?:deploy|ship|release)\s+(?:[\w\s]+\s+)?(?:to\s+)?(?:production|prod|staging)/i,
    tasks: [
      { skill: 'test', description: 'Run full test suite', priority: 1 },
      { skill: 'review', description: 'Final review and approval gate', priority: 2 },
      { skill: 'deploy', description: 'Execute deployment pipeline', priority: 3 },
      { skill: 'monitor', description: 'Post-deploy health check', priority: 4 },
    ],
  },
  {
    pattern: /(?:write|draft|create)\s+(?:a\s+)?(?:report|analysis|document)/i,
    tasks: [
      { skill: 'research', description: 'Gather data and references', priority: 1 },
      { skill: 'analyze', description: 'Analyze data and extract insights', priority: 2 },
      { skill: 'write', description: 'Draft the document', priority: 3 },
      { skill: 'review', description: 'Review for accuracy and clarity', priority: 4 },
    ],
  },
  {
    pattern: /(?:onboard|set\s*up)\s+(?:new\s+)?(?:customer|user|client)/i,
    tasks: [
      { skill: 'validate', description: 'Validate customer data and eligibility', priority: 1 },
      { skill: 'provision', description: 'Provision account and resources', priority: 2 },
      { skill: 'notify', description: 'Send welcome communications', priority: 3 },
      { skill: 'monitor', description: 'Verify onboarding completion', priority: 4 },
    ],
  },
];

export function decompose(request) {
  const requestStr = typeof request === 'string' ? request : request.description || '';

  for (const rule of DECOMPOSITION_RULES) {
    if (rule.pattern.test(requestStr)) {
      return {
        originalRequest: requestStr,
        tasks: rule.tasks.map((t, i) => ({
          id: `task_${i + 1}`,
          ...t,
          status: 'pending',
          assignedTo: null,
          result: null,
        })),
        decomposedAt: Date.now(),
      };
    }
  }

  // Fallback: single task with generic skill
  return {
    originalRequest: requestStr,
    tasks: [{
      id: 'task_1',
      skill: 'general',
      description: requestStr,
      priority: 1,
      status: 'pending',
      assignedTo: null,
      result: null,
    }],
    decomposedAt: Date.now(),
  };
}

/**
 * Determine which tasks can run in parallel based on priority levels.
 * Tasks at the same priority level can run concurrently.
 */
export function getExecutionPlan(tasks) {
  const byPriority = new Map();
  for (const task of tasks) {
    const p = task.priority || 1;
    if (!byPriority.has(p)) byPriority.set(p, []);
    byPriority.get(p).push(task);
  }

  const waves = [];
  for (const priority of [...byPriority.keys()].sort((a, b) => a - b)) {
    waves.push({
      priority,
      tasks: byPriority.get(priority),
      parallel: byPriority.get(priority).length > 1,
    });
  }

  return waves;
}
