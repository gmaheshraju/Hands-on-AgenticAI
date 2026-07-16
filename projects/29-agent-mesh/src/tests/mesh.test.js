/**
 * Comprehensive tests for the Self-Healing Agent Mesh.
 * 25+ tests across 6 suites using node:test and node:assert/strict.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { AgentNode, HEALTH, resetIdCounter } from '../agentNode.js';
import { MeshRouter, STRATEGY } from '../meshRouter.js';
import { HealthMonitor } from '../healthMonitor.js';
import { WorkRedistributor } from '../workRedistributor.js';
import { CircuitBreaker, CircuitBreakerRegistry, STATE } from '../circuitBreaker.js';
import { Mesh } from '../mesh.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ═══════════════════════════════════════════
// Suite 1: AgentNode
// ═══════════════════════════════════════════
describe('AgentNode', () => {
  beforeEach(() => resetIdCounter());

  it('should initialize with healthy status and correct capabilities', () => {
    const node = new AgentNode({ name: 'test', capabilities: ['nlp', 'vision'] });
    assert.equal(node._health, HEALTH.HEALTHY);
    assert.deepStrictEqual(node.capabilities(), ['nlp', 'vision']);
    assert.equal(node.hasCapability('nlp'), true);
    assert.equal(node.hasCapability('audio'), false);
  });

  it('should process work items and track metrics', async () => {
    const node = new AgentNode({
      name: 'worker',
      capabilities: ['compute'],
      processor: async (item) => ({ result: item.payload * 2 }),
    });

    const result = await node.enqueue({ id: 'w1', payload: 21 });
    assert.deepStrictEqual(result, { result: 42 });

    const metrics = node.loadMetrics();
    assert.equal(metrics.totalProcessed, 1);
    assert.equal(metrics.totalErrors, 0);
    assert.equal(metrics.errorRate, 0);
  });

  it('should track errors and compute error rate', async () => {
    let callCount = 0;
    const node = new AgentNode({
      name: 'flaky',
      capabilities: ['compute'],
      processor: async () => {
        callCount++;
        if (callCount <= 2) throw new Error('fail');
        return 'ok';
      },
    });

    // Two failures
    await assert.rejects(() => node.enqueue({ id: 'w1', payload: 1 }));
    await assert.rejects(() => node.enqueue({ id: 'w2', payload: 2 }));

    // One success
    await node.enqueue({ id: 'w3', payload: 3 });

    const metrics = node.loadMetrics();
    assert.equal(metrics.totalErrors, 2);
    assert.equal(metrics.totalProcessed, 1);
    assert.ok(metrics.errorRate > 0.6); // 2/3 ~ 0.667
  });

  it('should report health correctly', () => {
    const node = new AgentNode({ name: 'reporter', capabilities: ['api'] });
    const report = node.reportHealth();
    assert.equal(report.name, 'reporter');
    assert.equal(report.health, HEALTH.HEALTHY);
    assert.ok(report.metrics);
  });

  it('should reject work when failed', async () => {
    const node = new AgentNode({ name: 'dead', capabilities: ['x'] });
    node.setHealth(HEALTH.FAILED);
    await assert.rejects(
      () => node.enqueue({ id: 'w1', payload: 1 }),
      /failed/
    );
  });

  it('should recover from failed state', () => {
    const node = new AgentNode({ name: 'phoenix', capabilities: ['x'] });
    node.setHealth(HEALTH.FAILED);
    assert.equal(node._health, HEALTH.FAILED);
    node.recover();
    assert.equal(node._health, HEALTH.HEALTHY);
  });
});

// ═══════════════════════════════════════════
// Suite 2: MeshRouter
// ═══════════════════════════════════════════
describe('MeshRouter', () => {
  beforeEach(() => resetIdCounter());

  it('should route via round-robin across healthy nodes', () => {
    const router = new MeshRouter();
    const n1 = new AgentNode({ name: 'a', capabilities: ['x'] });
    const n2 = new AgentNode({ name: 'b', capabilities: ['x'] });
    router.registerNode(n1);
    router.registerNode(n2);

    const first = router.selectNode({ capability: 'x' }, STRATEGY.ROUND_ROBIN);
    const second = router.selectNode({ capability: 'x' }, STRATEGY.ROUND_ROBIN);
    assert.notEqual(first.id, second.id);
  });

  it('should route via least-loaded', async () => {
    const router = new MeshRouter();
    const n1 = new AgentNode({ name: 'busy', capabilities: ['x'], processor: async () => { await sleep(100); return 'ok'; } });
    const n2 = new AgentNode({ name: 'idle', capabilities: ['x'] });
    router.registerNode(n1);
    router.registerNode(n2);

    // Load up n1
    n1.enqueue({ id: 'w1', payload: 1 }).catch(() => {});
    n1.enqueue({ id: 'w2', payload: 2 }).catch(() => {});

    const selected = router.selectNode({ capability: 'x' }, STRATEGY.LEAST_LOADED);
    assert.equal(selected.id, n2.id);
  });

  it('should filter by capability', () => {
    const router = new MeshRouter();
    const nlp = new AgentNode({ name: 'nlp', capabilities: ['nlp'] });
    const vision = new AgentNode({ name: 'vision', capabilities: ['vision'] });
    router.registerNode(nlp);
    router.registerNode(vision);

    const selected = router.selectNode({ capability: 'vision' }, STRATEGY.CAPABILITY);
    assert.equal(selected.id, vision.id);
  });

  it('should exclude failed nodes', () => {
    const router = new MeshRouter();
    const n1 = new AgentNode({ name: 'dead', capabilities: ['x'] });
    const n2 = new AgentNode({ name: 'alive', capabilities: ['x'] });
    n1.setHealth(HEALTH.FAILED);
    router.registerNode(n1);
    router.registerNode(n2);

    const selected = router.selectNode({ capability: 'x' }, STRATEGY.LEAST_LOADED);
    assert.equal(selected.id, n2.id);
  });

  it('should return null when no capable node is available', () => {
    const router = new MeshRouter();
    const n1 = new AgentNode({ name: 'nlp-only', capabilities: ['nlp'] });
    router.registerNode(n1);

    const selected = router.selectNode({ capability: 'vision' }, STRATEGY.LEAST_LOADED);
    assert.equal(selected, null);
  });

  it('should handle affinity-sticky routing', () => {
    const router = new MeshRouter();
    const n1 = new AgentNode({ name: 'a', capabilities: ['x'] });
    const n2 = new AgentNode({ name: 'b', capabilities: ['x'] });
    router.registerNode(n1);
    router.registerNode(n2);

    const first = router.selectNode({ capability: 'x', affinityKey: 'user-123' }, STRATEGY.AFFINITY);
    const second = router.selectNode({ capability: 'x', affinityKey: 'user-123' }, STRATEGY.AFFINITY);
    assert.equal(first.id, second.id, 'same affinity key should route to same node');
  });
});

// ═══════════════════════════════════════════
// Suite 3: HealthMonitor
// ═══════════════════════════════════════════
describe('HealthMonitor', () => {
  beforeEach(() => resetIdCounter());

  it('should detect node failure from missed heartbeats', () => {
    const monitor = new HealthMonitor({
      heartbeatInterval: 10,
      failureThreshold: 2,
    });

    const node = new AgentNode({ name: 'quiet', capabilities: ['x'] });
    // Simulate old heartbeat
    node._lastHeartbeat = Date.now() - 100;
    monitor.watch(node);

    const events = [];
    monitor.on('node_failed', (e) => events.push(e));

    // Run enough checks to exceed threshold
    monitor.check();
    monitor.check();

    assert.ok(events.length > 0, 'should emit node_failed');
    assert.equal(node._health, HEALTH.FAILED);
  });

  it('should declare failure manually', () => {
    const monitor = new HealthMonitor();
    const node = new AgentNode({ name: 'target', capabilities: ['x'] });
    monitor.watch(node);

    const events = [];
    monitor.on('node_failed', (e) => events.push(e));

    monitor.declareFailure(node.id);
    assert.equal(node._health, HEALTH.FAILED);
    assert.equal(events.length, 1);
  });

  it('should declare recovery manually', () => {
    const monitor = new HealthMonitor();
    const node = new AgentNode({ name: 'target', capabilities: ['x'] });
    monitor.watch(node);
    monitor.declareFailure(node.id);

    const events = [];
    monitor.on('node_recovered', (e) => events.push(e));

    monitor.declareRecovery(node.id);
    assert.equal(node._health, HEALTH.HEALTHY);
    assert.equal(events.length, 1);
  });
});

// ═══════════════════════════════════════════
// Suite 4: WorkRedistributor
// ═══════════════════════════════════════════
describe('WorkRedistributor', () => {
  beforeEach(() => resetIdCounter());

  it('should redistribute work from failed node to healthy nodes', async () => {
    const redist = new WorkRedistributor();

    const failed = new AgentNode({ name: 'failed', capabilities: ['compute'] });
    const healthy1 = new AgentNode({ name: 'h1', capabilities: ['compute'], processor: async (item) => item });
    const healthy2 = new AgentNode({ name: 'h2', capabilities: ['compute'], processor: async (item) => item });

    // Simulate pending work on the failed node
    failed._pendingWork.set('w1', { id: 'w1', capability: 'compute', payload: 'a' });
    failed._pendingWork.set('w2', { id: 'w2', capability: 'compute', payload: 'b' });
    failed.setHealth(HEALTH.FAILED);

    const result = redist.redistribute(failed, [healthy1, healthy2]);
    assert.equal(result.redistributed, 2);
    assert.equal(result.failed, 0);
    assert.equal(redist.history().length, 2);
  });

  it('should respect capability constraints during redistribution', () => {
    const redist = new WorkRedistributor();

    const failed = new AgentNode({ name: 'failed', capabilities: ['vision'] });
    const healthy = new AgentNode({ name: 'nlp-only', capabilities: ['nlp'], processor: async (item) => item });

    failed._pendingWork.set('w1', { id: 'w1', capability: 'vision', payload: 'img' });
    failed.setHealth(HEALTH.FAILED);

    const result = redist.redistribute(failed, [healthy]);
    assert.equal(result.redistributed, 0);
    assert.equal(result.failed, 1, 'should fail because no node has vision capability');
  });

  it('should cap redistribution per node to prevent overload', () => {
    const redist = new WorkRedistributor({ maxRedistPerNode: 2 });

    const failed = new AgentNode({ name: 'failed', capabilities: ['x'] });
    const sole = new AgentNode({ name: 'sole', capabilities: ['x'], processor: async (item) => item });

    // 5 pending items, but max 2 per node
    for (let i = 0; i < 5; i++) {
      failed._pendingWork.set(`w${i}`, { id: `w${i}`, capability: 'x', payload: i });
    }
    failed.setHealth(HEALTH.FAILED);

    const result = redist.redistribute(failed, [sole]);
    assert.equal(result.redistributed, 2);
    assert.equal(result.failed, 3);
  });
});

// ═══════════════════════════════════════════
// Suite 5: CircuitBreaker
// ═══════════════════════════════════════════
describe('CircuitBreaker', () => {
  it('should start in closed state', () => {
    const cb = new CircuitBreaker();
    assert.equal(cb.state, STATE.CLOSED);
    assert.equal(cb.allowRequest(), true);
  });

  it('should open after consecutive failures exceed threshold', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });

    cb.recordFailure();
    cb.recordFailure();
    assert.equal(cb.state, STATE.CLOSED);

    cb.recordFailure();
    assert.equal(cb.state, STATE.OPEN);
    assert.equal(cb.allowRequest(), false);
  });

  it('should reset failure count on success', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });

    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();

    // Failure count reset — need 3 more to trip
    cb.recordFailure();
    cb.recordFailure();
    assert.equal(cb.state, STATE.CLOSED);
  });

  it('should transition to half-open after cooldown', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 10 });

    cb.recordFailure(); // trips to open
    assert.equal(cb.state, STATE.OPEN);

    // Manually set lastFailureTime to the past
    cb._lastFailureTime = Date.now() - 20;
    assert.equal(cb.state, STATE.HALF_OPEN);
    assert.equal(cb.allowRequest(), true);
  });

  it('should close on successful probe in half-open', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 0 });

    cb.recordFailure();
    // cooldown=0 means immediate transition to half-open
    cb._lastFailureTime = Date.now() - 1;
    assert.equal(cb.state, STATE.HALF_OPEN);

    cb.recordSuccess();
    assert.equal(cb.state, STATE.CLOSED);
  });

  it('should re-open on failed probe in half-open', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 60000 });

    cb.recordFailure();
    // Force into half-open by backdating, but use a long cooldown so it stays OPEN after re-trip
    cb._lastFailureTime = Date.now() - 70000;
    assert.equal(cb.state, STATE.HALF_OPEN);

    cb.recordFailure(); // probe fails — re-opens, and _lastFailureTime is set to now()
    assert.equal(cb.state, STATE.OPEN);
  });

  it('should provide stats snapshot', () => {
    const cb = new CircuitBreaker();
    cb.recordSuccess();
    cb.recordFailure();
    const stats = cb.stats();
    assert.equal(stats.totalRequests, 2);
    assert.equal(stats.successCount, 1);
    assert.equal(stats.consecutiveFailures, 1);
  });
});

// ═══════════════════════════════════════════
// Suite 6: Mesh (integration)
// ═══════════════════════════════════════════
describe('Mesh (integration)', () => {
  beforeEach(() => resetIdCounter());

  it('should register nodes and submit work', async () => {
    const mesh = new Mesh();
    mesh.addNode({ name: 'worker', capabilities: ['x'], processor: async (item) => ({ v: item.payload }) });

    const r = await mesh.submitWork({ capability: 'x', payload: 42 });
    assert.equal(r.result.v, 42);
  });

  it('should retry on different node after failure', async () => {
    const mesh = new Mesh({ maxRetries: 2 });

    mesh.addNode({
      name: 'bad',
      capabilities: ['x'],
      processor: async () => { throw new Error('always fails'); },
    });
    mesh.addNode({
      name: 'good',
      capabilities: ['x'],
      processor: async (item) => ({ ok: true }),
    });

    const r = await mesh.submitWork({ capability: 'x', payload: 1 });
    assert.equal(r.result.ok, true);
  });

  it('should throw when all nodes fail and retries exhausted', async () => {
    const mesh = new Mesh({ maxRetries: 1 });

    mesh.addNode({
      name: 'bad1',
      capabilities: ['x'],
      processor: async () => { throw new Error('fail'); },
    });
    mesh.addNode({
      name: 'bad2',
      capabilities: ['x'],
      processor: async () => { throw new Error('fail'); },
    });

    await assert.rejects(() => mesh.submitWork({ capability: 'x', payload: 1 }), /fail/);
  });

  it('should enter degraded mode when enough nodes fail', async () => {
    const mesh = new Mesh({ degradedThreshold: 0.5 });

    const n1 = mesh.addNode({ name: 'a', capabilities: ['x'], processor: async () => 'ok' });
    const n2 = mesh.addNode({ name: 'b', capabilities: ['x'], processor: async () => 'ok' });

    const events = [];
    mesh.on('mesh_degraded', (e) => events.push(e));

    mesh.failNode(n1.id);

    assert.ok(events.length > 0, 'should emit mesh_degraded');
    assert.equal(mesh.dashboard().degradedMode, true);
  });

  it('should recover from degraded mode when nodes recover', async () => {
    const mesh = new Mesh({ degradedThreshold: 0.5 });

    const n1 = mesh.addNode({ name: 'a', capabilities: ['x'], processor: async () => 'ok' });
    mesh.addNode({ name: 'b', capabilities: ['x'], processor: async () => 'ok' });

    mesh.failNode(n1.id);
    assert.equal(mesh.dashboard().degradedMode, true);

    mesh.recoverNode(n1.id);
    assert.equal(mesh.dashboard().degradedMode, false);
  });

  it('should produce a dashboard with correct counts', async () => {
    const mesh = new Mesh();
    mesh.addNode({ name: 'a', capabilities: ['x'], processor: async () => 'ok' });
    mesh.addNode({ name: 'b', capabilities: ['y'], processor: async () => 'ok' });

    await mesh.submitWork({ capability: 'x', payload: 1 });
    await mesh.submitWork({ capability: 'y', payload: 2 });

    const d = mesh.dashboard();
    assert.equal(d.totalNodes, 2);
    assert.equal(d.healthy, 2);
    assert.equal(d.completedWork, 2);
  });

  it('should produce a dashboard string', () => {
    const mesh = new Mesh();
    mesh.addNode({ name: 'test-node', capabilities: ['x'] });

    const str = mesh.dashboardString();
    assert.ok(str.includes('AGENT MESH DASHBOARD'));
    assert.ok(str.includes('test-node'));
  });

  it('should remove nodes from the mesh', () => {
    const mesh = new Mesh();
    const n = mesh.addNode({ name: 'temp', capabilities: ['x'] });
    assert.equal(mesh.dashboard().totalNodes, 1);

    mesh.removeNode(n.id);
    assert.equal(mesh.dashboard().totalNodes, 0);
  });
});
