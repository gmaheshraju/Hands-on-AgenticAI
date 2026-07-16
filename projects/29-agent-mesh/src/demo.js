/**
 * Demo — Five scenarios showcasing the self-healing agent mesh.
 */

import { Mesh } from './mesh.js';
import { HEALTH } from './agentNode.js';
import { STRATEGY } from './meshRouter.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function header(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`  SCENARIO: ${title}`);
  console.log('='.repeat(60));
}

// Helper: create a processor that takes a variable amount of time
function makeProcessor(name, latencyMs = 10, failRate = 0) {
  return async (workItem) => {
    if (Math.random() < failRate) {
      throw new Error(`${name} processing error`);
    }
    await sleep(latencyMs);
    return { processedBy: name, payload: workItem.payload, at: Date.now() };
  };
}

// ─────────────────────────────────────────────
// Scenario 1: Normal routing across healthy nodes
// ─────────────────────────────────────────────
async function scenario1_normalRouting() {
  header('1 — Normal Routing');

  const mesh = new Mesh({ strategy: STRATEGY.LEAST_LOADED });

  const nlp1 = mesh.addNode({ name: 'nlp-worker-1', capabilities: ['nlp', 'text'], processor: makeProcessor('nlp1', 5) });
  const nlp2 = mesh.addNode({ name: 'nlp-worker-2', capabilities: ['nlp', 'text'], processor: makeProcessor('nlp2', 5) });
  const vision = mesh.addNode({ name: 'vision-worker', capabilities: ['vision', 'image'], processor: makeProcessor('vision', 8) });

  // Submit mixed work
  const results = await Promise.all([
    mesh.submitWork({ capability: 'nlp', payload: 'Analyze sentiment' }),
    mesh.submitWork({ capability: 'nlp', payload: 'Extract entities' }),
    mesh.submitWork({ capability: 'nlp', payload: 'Summarize text' }),
    mesh.submitWork({ capability: 'vision', payload: 'Detect objects' }),
    mesh.submitWork({ capability: 'vision', payload: 'Classify image' }),
  ]);

  console.log(`  Submitted 5 work items across 3 nodes`);
  for (const r of results) {
    console.log(`    [${r.workId}] processed by ${r.result.processedBy}: "${r.result.payload}"`);
  }

  const d = mesh.dashboard();
  console.log(`  Completed: ${d.completedWork} | Failed: ${d.failedWork}`);
  console.log('  All work routed by capability and load. No failures.');
}

// ─────────────────────────────────────────────
// Scenario 2: Node failure + work redistribution
// ─────────────────────────────────────────────
async function scenario2_failureRedistribution() {
  header('2 — Node Failure + Redistribution');

  const mesh = new Mesh({ strategy: STRATEGY.ROUND_ROBIN, maxRetries: 2 });

  let failAfter = 2;
  const fragileProcessor = async (workItem) => {
    failAfter--;
    if (failAfter <= 0) throw new Error('Node crashed!');
    await sleep(5);
    return { processedBy: 'fragile', payload: workItem.payload };
  };

  const fragile = mesh.addNode({ name: 'fragile-node', capabilities: ['compute'], processor: fragileProcessor });
  const stable1 = mesh.addNode({ name: 'stable-node-1', capabilities: ['compute'], processor: makeProcessor('stable1', 5) });
  const stable2 = mesh.addNode({ name: 'stable-node-2', capabilities: ['compute'], processor: makeProcessor('stable2', 5) });

  // First two succeed on fragile, third will fail and retry on stable
  const results = [];
  for (let i = 0; i < 5; i++) {
    try {
      const r = await mesh.submitWork({ capability: 'compute', payload: `task-${i}` });
      results.push({ workId: r.workId, node: r.result.processedBy, status: 'ok' });
    } catch (err) {
      results.push({ workId: `task-${i}`, status: 'failed', error: err.message });
    }
  }

  for (const r of results) {
    const tag = r.status === 'ok' ? '[OK]' : '[!!]';
    console.log(`  ${tag} ${r.workId} -> ${r.node || r.error}`);
  }

  console.log('\n  Fragile node failed mid-stream. Mesh retried on stable nodes.');
}

// ─────────────────────────────────────────────
// Scenario 3: Cascading failure + degraded mode
// ─────────────────────────────────────────────
async function scenario3_cascadingFailure() {
  header('3 — Cascading Failure + Degraded Mode');

  const mesh = new Mesh({
    strategy: STRATEGY.LEAST_LOADED,
    degradedThreshold: 0.5,
    maxRetries: 1,
  });

  mesh.on('mesh_degraded', (evt) => {
    console.log(`  ** MESH DEGRADED: ${evt.failedCount}/${evt.total} nodes failed **`);
  });

  const nodes = [];
  for (let i = 0; i < 4; i++) {
    nodes.push(mesh.addNode({
      name: `worker-${i}`,
      capabilities: ['general'],
      processor: makeProcessor(`worker-${i}`, 5),
    }));
  }

  console.log(`  Registered 4 nodes. Failing 2 to trigger degraded mode...`);

  // Fail two nodes
  mesh.failNode(nodes[0].id);
  mesh.failNode(nodes[1].id);

  await sleep(10);

  const d1 = mesh.dashboard();
  console.log(`  Dashboard: ${d1.healthy} healthy, ${d1.failed} failed, degraded=${d1.degradedMode}`);

  // Submit work — should still route to remaining healthy nodes
  let completed = 0;
  let failed = 0;
  for (let i = 0; i < 6; i++) {
    try {
      await mesh.submitWork({ capability: 'general', payload: `degraded-task-${i}` });
      completed++;
    } catch {
      failed++;
    }
  }

  console.log(`  Work in degraded mode: ${completed} completed, ${failed} failed`);
  console.log('  Mesh reduced throughput rather than failing completely.');
}

// ─────────────────────────────────────────────
// Scenario 4: Node recovery
// ─────────────────────────────────────────────
async function scenario4_nodeRecovery() {
  header('4 — Node Recovery');

  const mesh = new Mesh({ strategy: STRATEGY.LEAST_LOADED, degradedThreshold: 0.5 });

  mesh.on('node_recovered', (evt) => {
    console.log(`  ** NODE RECOVERED: ${evt.nodeId} **`);
  });
  mesh.on('mesh_recovered', () => {
    console.log(`  ** MESH RECOVERED — back to normal mode **`);
  });

  const n1 = mesh.addNode({ name: 'alpha', capabilities: ['api'], processor: makeProcessor('alpha', 5) });
  const n2 = mesh.addNode({ name: 'beta', capabilities: ['api'], processor: makeProcessor('beta', 5) });
  const n3 = mesh.addNode({ name: 'gamma', capabilities: ['api'], processor: makeProcessor('gamma', 5) });

  console.log('  3 nodes running. Failing alpha and beta...');
  mesh.failNode(n1.id);
  mesh.failNode(n2.id);

  await sleep(10);
  const d1 = mesh.dashboard();
  console.log(`  After failure: ${d1.healthy}H ${d1.degraded}D ${d1.failed}F | degraded=${d1.degradedMode}`);

  console.log('  Recovering alpha...');
  mesh.recoverNode(n1.id);
  await sleep(10);
  const d2 = mesh.dashboard();
  console.log(`  After alpha recovery: ${d2.healthy}H ${d2.degraded}D ${d2.failed}F | degraded=${d2.degradedMode}`);

  console.log('  Recovering beta...');
  mesh.recoverNode(n2.id);
  await sleep(10);
  const d3 = mesh.dashboard();
  console.log(`  After beta recovery: ${d3.healthy}H ${d3.degraded}D ${d3.failed}F | degraded=${d3.degradedMode}`);

  // Verify work flows again
  const r = await mesh.submitWork({ capability: 'api', payload: 'post-recovery-task' });
  console.log(`  Post-recovery work completed on ${r.result.processedBy}`);
}

// ─────────────────────────────────────────────
// Scenario 5: Full mesh dashboard
// ─────────────────────────────────────────────
async function scenario5_dashboard() {
  header('5 — Mesh Dashboard');

  const mesh = new Mesh({ strategy: STRATEGY.LEAST_LOADED });

  mesh.addNode({ name: 'nlp-primary', capabilities: ['nlp'], processor: makeProcessor('nlp-primary', 3) });
  mesh.addNode({ name: 'nlp-secondary', capabilities: ['nlp'], processor: makeProcessor('nlp-secondary', 3) });
  mesh.addNode({ name: 'vision-gpu-1', capabilities: ['vision'], processor: makeProcessor('vision-gpu-1', 10) });
  mesh.addNode({ name: 'compute-heavy', capabilities: ['compute', 'ml'], processor: makeProcessor('compute-heavy', 15) });

  // Submit a batch of work
  const promises = [];
  for (let i = 0; i < 8; i++) {
    const cap = ['nlp', 'nlp', 'vision', 'compute'][i % 4];
    promises.push(
      mesh.submitWork({ capability: cap, payload: `batch-item-${i}` }).catch(() => null)
    );
  }
  await Promise.all(promises);

  // Fail one node to show mixed state
  const nodes = [...mesh._nodes.values()];
  mesh.failNode(nodes[2].id);

  console.log(mesh.dashboardString());
}

// ─────────────────────────────────────────────
// Run all scenarios
// ─────────────────────────────────────────────
async function main() {
  console.log('\n  SELF-HEALING AGENT MESH — DEMO');
  console.log('  ' + '-'.repeat(40));

  await scenario1_normalRouting();
  await scenario2_failureRedistribution();
  await scenario3_cascadingFailure();
  await scenario4_nodeRecovery();
  await scenario5_dashboard();

  console.log('\n  All 5 scenarios completed.\n');
}

main().catch(console.error);
