/**
 * Multi-Agent Coordinator — the brain.
 *
 * Responsibilities:
 *   1. Accept a high-level request
 *   2. Decompose into sub-tasks (via decomposer)
 *   3. Match each sub-task to an agent (via capability registry)
 *   4. Dispatch tasks through the message bus
 *   5. Handle results, failures, and escalations
 *   6. Produce a final aggregated result
 *
 * Patterns demonstrated:
 *   - Dynamic delegation based on capability cards
 *   - Load-aware routing (pick least-loaded agent)
 *   - Escalation chains (agent → senior agent → coordinator)
 *   - Retry with re-routing to alternate agents
 *   - Parallel execution of independent sub-tasks
 */

import { CapabilityRegistry } from './capability.js';
import { MessageBus } from './bus.js';
import { decompose, getExecutionPlan } from './decomposer.js';

export class Coordinator {
  constructor(opts = {}) {
    this.registry = opts.registry || new CapabilityRegistry();
    this.bus = opts.bus || new MessageBus();
    this.maxRetries = opts.maxRetries || 2;
    this.taskTimeoutMs = opts.taskTimeoutMs || 10_000;
    this.verbose = opts.verbose ?? true;
    this.runs = [];

    this._setupBusHandlers();
  }

  _setupBusHandlers() {
    this.bus.subscribe('ESCALATION', (msg) => {
      if (this.verbose) {
        console.log(`  [ESCALATION] ${msg.fromAgent} → escalating task ${msg.taskId}: ${msg.reason}`);
      }
    });
  }

  /**
   * Process a high-level request end-to-end.
   */
  async processRequest(request) {
    const run = {
      id: `run_${Date.now().toString(36)}`,
      request: typeof request === 'string' ? request : request.description,
      startedAt: Date.now(),
      status: 'running',
      decomposition: null,
      executionPlan: null,
      results: [],
      escalations: [],
      completedAt: null,
    };

    this.runs.push(run);

    if (this.verbose) {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`  Coordinator: Processing request`);
      console.log(`  "${run.request}"`);
      console.log(`  Run: ${run.id}`);
      console.log(`${'═'.repeat(60)}`);
    }

    // Step 1: Decompose
    run.decomposition = decompose(request);
    const tasks = run.decomposition.tasks;

    if (this.verbose) {
      console.log(`\n  Decomposed into ${tasks.length} sub-tasks:`);
      for (const t of tasks) {
        console.log(`    ${t.id}: [${t.skill}] ${t.description}`);
      }
    }

    // Step 2: Build execution plan (waves of parallel tasks)
    run.executionPlan = getExecutionPlan(tasks);

    if (this.verbose) {
      console.log(`\n  Execution plan: ${run.executionPlan.length} waves`);
      for (const wave of run.executionPlan) {
        const ids = wave.tasks.map(t => t.id).join(', ');
        console.log(`    Wave ${wave.priority}: [${ids}]${wave.parallel ? ' (parallel)' : ''}`);
      }
    }

    // Step 3: Execute wave by wave
    try {
      for (const wave of run.executionPlan) {
        if (this.verbose) {
          console.log(`\n  --- Wave ${wave.priority} ---`);
        }

        const waveResults = await Promise.allSettled(
          wave.tasks.map(task => this._executeTask(task, run))
        );

        for (let i = 0; i < waveResults.length; i++) {
          const task = wave.tasks[i];
          const result = waveResults[i];

          if (result.status === 'fulfilled') {
            run.results.push(result.value);
          } else {
            run.results.push({
              taskId: task.id,
              status: 'failed',
              error: result.reason?.message || 'Unknown error',
            });
          }
        }
      }

      run.status = run.results.every(r => r.status === 'completed') ? 'completed' : 'partial';
    } catch (err) {
      run.status = 'failed';
      run.error = err.message;
    }

    run.completedAt = Date.now();

    if (this.verbose) {
      this._printRunSummary(run);
    }

    return run;
  }

  /**
   * Execute a single task with routing, retries, and escalation.
   */
  async _executeTask(task, run) {
    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      // Find an agent for this skill
      const agent = this.registry.selectAgent(task.skill);

      if (!agent) {
        // No agent available — try escalation
        const escalated = await this._tryEscalation(task, run, 'No agent available');
        if (escalated) return escalated;
        throw new Error(`No agent available for skill "${task.skill}"`);
      }

      task.assignedTo = agent.id;
      this.registry.incrementLoad(agent.id);

      if (this.verbose) {
        const retryTag = attempt > 0 ? ` (retry ${attempt})` : '';
        console.log(`    [ASSIGN] ${task.id} → ${agent.name}${retryTag}`);
      }

      // Dispatch via bus
      this.bus.publish('TASK_REQUEST', {
        taskId: task.id,
        toAgent: agent.id,
        skill: task.skill,
        description: task.description,
        attempt,
      });

      try {
        // Execute the agent's skill handler
        const skillDef = agent.skills.find(s => s.name === task.skill);
        if (!skillDef?.handler) throw new Error(`Agent ${agent.id} has no handler for ${task.skill}`);

        const result = await this._withTimeout(
          skillDef.handler({ description: task.description, attempt }),
          this.taskTimeoutMs,
        );

        this.registry.decrementLoad(agent.id);

        task.status = 'completed';
        task.result = result;

        // Report success via bus
        this.bus.publish('TASK_RESULT', {
          taskId: task.id,
          fromAgent: agent.id,
          result,
        });

        if (this.verbose) {
          console.log(`    [DONE]   ${task.id} ← ${agent.name} (${result._durationMs || 0}ms)`);
        }

        return { taskId: task.id, status: 'completed', agentId: agent.id, result };

      } catch (err) {
        lastError = err;
        this.registry.decrementLoad(agent.id);

        this.bus.publish('TASK_FAILED', {
          taskId: task.id,
          fromAgent: agent.id,
          error: err.message,
          attempt,
        });

        if (this.verbose) {
          console.log(`    [FAIL]   ${task.id} ← ${agent.name}: ${err.message}`);
        }

        // Try escalation on last retry
        if (attempt === this.maxRetries) {
          const escalated = await this._tryEscalation(task, run, err.message);
          if (escalated) return escalated;
        }
      }
    }

    throw lastError || new Error(`Task ${task.id} failed after ${this.maxRetries + 1} attempts`);
  }

  /**
   * Attempt to escalate a task to a more capable agent.
   */
  async _tryEscalation(task, run, reason) {
    const currentAgent = this.registry.agents.get(task.assignedTo);
    const escalateTo = currentAgent?.escalatesTo;

    if (!escalateTo) return null;

    const seniorAgent = this.registry.agents.get(escalateTo);
    if (!seniorAgent) return null;

    const seniorSkill = seniorAgent.skills.find(s => s.name === task.skill);
    if (!seniorSkill?.handler) return null;

    run.escalations.push({
      taskId: task.id,
      from: currentAgent.id,
      to: seniorAgent.id,
      reason,
      timestamp: Date.now(),
    });

    this.bus.publish('ESCALATION', {
      taskId: task.id,
      fromAgent: currentAgent.id,
      toAgent: seniorAgent.id,
      reason,
    });

    if (this.verbose) {
      console.log(`    [ESCALATE] ${task.id}: ${currentAgent.name} → ${seniorAgent.name}`);
    }

    this.registry.incrementLoad(seniorAgent.id);
    try {
      const result = await this._withTimeout(
        seniorSkill.handler({ description: task.description, escalatedFrom: currentAgent.id, reason }),
        this.taskTimeoutMs,
      );

      this.registry.decrementLoad(seniorAgent.id);

      task.status = 'completed';
      task.assignedTo = seniorAgent.id;
      task.result = result;

      this.bus.publish('TASK_RESULT', {
        taskId: task.id,
        fromAgent: seniorAgent.id,
        result,
        escalated: true,
      });

      if (this.verbose) {
        console.log(`    [DONE]   ${task.id} ← ${seniorAgent.name} (escalated, ${result._durationMs || 0}ms)`);
      }

      return { taskId: task.id, status: 'completed', agentId: seniorAgent.id, result, escalated: true };
    } catch (err) {
      this.registry.decrementLoad(seniorAgent.id);
      return null;
    }
  }

  async _withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Task timed out after ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  _printRunSummary(run) {
    const durationMs = run.completedAt - run.startedAt;
    const completed = run.results.filter(r => r.status === 'completed').length;
    const failed = run.results.filter(r => r.status === 'failed').length;
    const escalated = run.escalations.length;

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  Run:         ${run.id}`);
    console.log(`  Status:      ${run.status.toUpperCase()}`);
    console.log(`  Duration:    ${durationMs}ms`);
    console.log(`  Tasks:       ${completed} completed, ${failed} failed`);
    console.log(`  Escalations: ${escalated}`);
    console.log(`  Messages:    ${this.bus.history.length} bus messages`);

    if (run.escalations.length > 0) {
      console.log(`\n  Escalation chain:`);
      for (const esc of run.escalations) {
        console.log(`    ${esc.taskId}: ${esc.from} → ${esc.to} (${esc.reason})`);
      }
    }

    console.log(`${'─'.repeat(60)}`);
  }

  getStats() {
    return {
      totalRuns: this.runs.length,
      agents: this.registry.listAgents().map(a => ({
        id: a.id,
        name: a.name,
        load: a.load,
        skills: a.skills.map(s => s.name),
      })),
      skills: Object.fromEntries(this.registry.listSkills()),
      busStats: this.bus.getStats(),
    };
  }
}
