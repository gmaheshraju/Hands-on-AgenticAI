import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Coordinator } from '../coordinator.js';
import { CapabilityRegistry } from '../capability.js';
import { MessageBus } from '../bus.js';
import { decompose, getExecutionPlan } from '../decomposer.js';

function makeAgent(id, skills, opts = {}) {
  return {
    id,
    name: opts.name || id,
    maxConcurrency: opts.maxConcurrency || 5,
    escalatesTo: opts.escalatesTo || null,
    skills: skills.map(s => ({
      name: s,
      cost: 0.01,
      latencyMs: 10,
      handler: async (input) => {
        await new Promise(r => setTimeout(r, 5));
        if (opts.failSkill === s) throw new Error('Simulated failure');
        return { output: `${id} handled ${s}`, _durationMs: 5 };
      },
    })),
  };
}

describe('CapabilityRegistry', () => {
  it('registers and finds agents by skill', () => {
    const reg = new CapabilityRegistry();
    reg.register(makeAgent('a1', ['code', 'test']));
    reg.register(makeAgent('a2', ['code', 'review']));

    const codeProviders = reg.findProviders('code');
    assert.strictEqual(codeProviders.length, 2);

    const testProviders = reg.findProviders('test');
    assert.strictEqual(testProviders.length, 1);
    assert.strictEqual(testProviders[0].id, 'a1');
  });

  it('selects lowest-load agent', () => {
    const reg = new CapabilityRegistry();
    reg.register(makeAgent('a1', ['code']));
    reg.register(makeAgent('a2', ['code']));
    reg.incrementLoad('a1');
    reg.incrementLoad('a1');

    const selected = reg.selectAgent('code');
    assert.strictEqual(selected.id, 'a2');
  });

  it('returns null when all agents at max concurrency', () => {
    const reg = new CapabilityRegistry();
    reg.register(makeAgent('a1', ['code'], { maxConcurrency: 1 }));
    reg.incrementLoad('a1');

    const selected = reg.selectAgent('code');
    assert.strictEqual(selected, null);
  });

  it('deregisters and removes from skill index', () => {
    const reg = new CapabilityRegistry();
    reg.register(makeAgent('a1', ['code']));
    reg.deregister('a1');

    assert.strictEqual(reg.findProviders('code').length, 0);
    assert.strictEqual(reg.agents.size, 0);
  });
});

describe('MessageBus', () => {
  it('delivers messages to subscribers', () => {
    const bus = new MessageBus();
    const received = [];
    bus.subscribe('TEST', msg => received.push(msg));

    bus.publish('TEST', { data: 'hello' });
    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].data, 'hello');
    assert.strictEqual(received[0].channel, 'TEST');
  });

  it('wildcard subscriber receives all messages', () => {
    const bus = new MessageBus();
    const received = [];
    bus.subscribe('*', msg => received.push(msg));

    bus.publish('A', { x: 1 });
    bus.publish('B', { x: 2 });
    assert.strictEqual(received.length, 2);
  });

  it('unsubscribe stops delivery', () => {
    const bus = new MessageBus();
    const received = [];
    const unsub = bus.subscribe('X', msg => received.push(msg));

    bus.publish('X', {});
    unsub();
    bus.publish('X', {});
    assert.strictEqual(received.length, 1);
  });
});

describe('Decomposer', () => {
  it('decomposes full-stack request into 5 tasks', () => {
    const result = decompose('Build a full-stack web application');
    assert.strictEqual(result.tasks.length, 5);
    assert.ok(result.tasks.some(t => t.skill === 'design'));
    assert.ok(result.tasks.some(t => t.skill === 'code'));
    assert.ok(result.tasks.some(t => t.skill === 'test'));
    assert.ok(result.tasks.some(t => t.skill === 'review'));
  });

  it('falls back to single task for unknown requests', () => {
    const result = decompose('Do something random');
    assert.strictEqual(result.tasks.length, 1);
    assert.strictEqual(result.tasks[0].skill, 'general');
  });

  it('execution plan groups tasks by priority into waves', () => {
    const result = decompose('Build a full-stack web application');
    const plan = getExecutionPlan(result.tasks);
    assert.ok(plan.length >= 3);
    assert.strictEqual(plan[0].priority, 1);
    // Wave 2 has two parallel code tasks
    const wave2 = plan.find(w => w.priority === 2);
    assert.ok(wave2.parallel);
    assert.strictEqual(wave2.tasks.length, 2);
  });
});

describe('Coordinator', () => {
  it('routes tasks to capable agents', async () => {
    const registry = new CapabilityRegistry();
    const bus = new MessageBus();
    registry.register(makeAgent('coder', ['code', 'test', 'design', 'review']));
    const coordinator = new Coordinator({ registry, bus, verbose: false, maxRetries: 0 });

    const run = await coordinator.processRequest('Build a full-stack web app');
    assert.strictEqual(run.status, 'completed');
    const completed = run.results.filter(r => r.status === 'completed');
    assert.strictEqual(completed.length, 5);
  });

  it('escalates to senior agent on failure', async () => {
    const registry = new CapabilityRegistry();
    const bus = new MessageBus();
    // Junior always fails code — will escalate to senior after retries
    registry.register(makeAgent('junior', ['code'], { name: 'junior', escalatesTo: 'senior', failSkill: 'code' }));
    registry.register(makeAgent('senior', ['code'], { name: 'senior' }));
    registry.register(makeAgent('other', ['design', 'test', 'review'], { name: 'other' }));
    const coordinator = new Coordinator({ registry, bus, verbose: false, maxRetries: 0 });

    const run = await coordinator.processRequest('Build a full-stack web app');
    assert.ok(run.escalations.length > 0);
    assert.strictEqual(run.escalations[0].from, 'junior');
    assert.strictEqual(run.escalations[0].to, 'senior');
  });

  it('fails gracefully when no agent has the skill', async () => {
    const registry = new CapabilityRegistry();
    const bus = new MessageBus();
    registry.register(makeAgent('coder', ['code']));
    const coordinator = new Coordinator({ registry, bus, verbose: false, maxRetries: 0 });

    const run = await coordinator.processRequest('Build a full-stack web app');
    assert.strictEqual(run.status, 'partial');
    const failed = run.results.filter(r => r.status === 'failed');
    assert.ok(failed.length > 0);
  });

  it('bus records all task lifecycle events', async () => {
    const registry = new CapabilityRegistry();
    const bus = new MessageBus();
    registry.register(makeAgent('all', ['code', 'test', 'design', 'review']));
    const coordinator = new Coordinator({ registry, bus, verbose: false, maxRetries: 0 });

    await coordinator.processRequest('Build a full-stack web app');
    const requests = bus.getHistory('TASK_REQUEST');
    const results = bus.getHistory('TASK_RESULT');
    assert.ok(requests.length >= 5);
    assert.ok(results.length >= 5);
  });

  it('respects task timeout', async () => {
    const registry = new CapabilityRegistry();
    const bus = new MessageBus();
    registry.register({
      id: 'slow',
      name: 'Slow Agent',
      maxConcurrency: 5,
      skills: [{
        name: 'general',
        cost: 0.01,
        latencyMs: 10,
        handler: async () => { await new Promise(r => setTimeout(r, 5000)); },
      }],
    });
    const coordinator = new Coordinator({ registry, bus, verbose: false, maxRetries: 0, taskTimeoutMs: 50 });

    const run = await coordinator.processRequest('Do something slow');
    const failed = run.results.filter(r => r.status === 'failed');
    assert.ok(failed.length > 0);
  });
});
