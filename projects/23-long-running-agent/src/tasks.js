/**
 * Pre-built task definitions for the demo.
 *
 * Each step handler is a simulated async function with realistic delays,
 * token/cost tracking, and configurable failure rates.
 */

function simulateWork(name, { delayMs = 100, tokens = 500, cost = 0.005, failRate = 0, message } = {}) {
  return async () => {
    await new Promise(r => setTimeout(r, delayMs));
    if (failRate > 0 && Math.random() < failRate) {
      throw new Error(`${name} failed (simulated)`);
    }
    return { tokens, cost, message: message ?? `${name} complete` };
  };
}

/**
 * Deep Research Task — 8 steps.
 * Steps 1-4 critical, 5-8 non-critical.
 */
export function deepResearchTask() {
  return {
    id: 'deep-research',
    steps: [
      { name: 'Search sources',       handler: simulateWork('Search', { delayMs: 80, tokens: 200, cost: 0.002, message: 'Found 12 sources' }), retries: 2, critical: true },
      { name: 'Fetch documents',      handler: simulateWork('Fetch',  { delayMs: 120, tokens: 1500, cost: 0.015, message: 'Fetched 12 documents (48KB)' }), retries: 2, critical: true },
      { name: 'Extract key facts',    handler: simulateWork('Extract', { delayMs: 150, tokens: 2000, cost: 0.020, message: 'Extracted 34 facts' }), retries: 1, critical: true },
      { name: 'Cross-reference',      handler: simulateWork('CrossRef', { delayMs: 100, tokens: 1000, cost: 0.010, message: '28 facts verified' }), retries: 1, critical: true },
      { name: 'Identify gaps',        handler: simulateWork('Gaps', { delayMs: 60, tokens: 400, cost: 0.004, message: '3 gaps identified' }), retries: 1, critical: false },
      { name: 'Deep dive on gaps',    handler: simulateWork('DeepDive', { delayMs: 100, tokens: 800, cost: 0.008, message: '2 of 3 gaps filled' }), retries: 1, critical: false },
      { name: 'Synthesize findings',  handler: simulateWork('Synth', { delayMs: 130, tokens: 1200, cost: 0.012, message: 'Synthesized 2,400 word draft' }), retries: 0, critical: false },
      { name: 'Format report',        handler: simulateWork('Format', { delayMs: 70, tokens: 600, cost: 0.006, message: 'Markdown report ready' }), retries: 0, critical: false },
    ],
    budget: { maxCost: 0.50, maxDuration: 300 },
  };
}

/**
 * CI Pipeline Task — 6 steps, all critical.
 * Deploy has 30% failure rate to demonstrate retry.
 */
export function ciPipelineTask() {
  let deployAttempt = 0;
  return {
    id: 'ci-pipeline',
    steps: [
      { name: 'Checkout code',    handler: simulateWork('Checkout', { delayMs: 50, tokens: 0, cost: 0, message: 'Cloned repo (sha: a1b2c3d)' }), critical: true },
      { name: 'Install deps',     handler: simulateWork('Install', { delayMs: 100, tokens: 0, cost: 0, message: '1,247 packages installed' }), critical: true },
      { name: 'Lint',             handler: simulateWork('Lint', { delayMs: 80, tokens: 0, cost: 0, message: '0 errors, 2 warnings' }), critical: true },
      { name: 'Run tests',        handler: simulateWork('Tests', { delayMs: 150, tokens: 0, cost: 0, message: '342 passed, 0 failed' }), critical: true },
      { name: 'Build artifacts',  handler: simulateWork('Build', { delayMs: 120, tokens: 0, cost: 0, message: 'Built in 1.2s (4.3MB)' }), critical: true },
      {
        name: 'Deploy to staging',
        handler: async () => {
          deployAttempt++;
          await new Promise(r => setTimeout(r, 80));
          // Fail first attempt, succeed on retry
          if (deployAttempt === 1) {
            throw new Error('Deploy failed: connection timeout to staging server');
          }
          return { tokens: 0, cost: 0, message: `Deployed to staging (attempt ${deployAttempt})` };
        },
        retries: 3,
        timeout: 5000,
        critical: true,
      },
    ],
    budget: { maxCost: 1.00, maxDuration: 300 },
  };
}

/**
 * Data Migration Task — 5 steps.
 * Import is slow (simulated 200ms), verify is non-critical.
 */
export function dataMigrationTask({ crashAtStep = -1 } = {}) {
  let stepCount = 0;
  return {
    id: 'data-migration',
    steps: [
      { name: 'Validate schema', handler: simulateWork('Validate', { delayMs: 60, tokens: 100, cost: 0.001, message: 'Schema valid (v3.2)' }), retries: 1, critical: true },
      { name: 'Export data',      handler: simulateWork('Export', { delayMs: 100, tokens: 300, cost: 0.003, message: 'Exported 15,000 records' }), retries: 2, critical: true },
      {
        name: 'Transform records',
        handler: async () => {
          stepCount++;
          await new Promise(r => setTimeout(r, 120));
          if (crashAtStep === 2) {
            throw new Error('SIMULATED CRASH: process killed during transform');
          }
          return { tokens: 800, cost: 0.008, message: 'Transformed 15,000 → 14,892 records' };
        },
        retries: 1,
        critical: true,
      },
      { name: 'Import to target', handler: simulateWork('Import', { delayMs: 200, tokens: 500, cost: 0.005, message: 'Imported 14,892 records' }), retries: 2, critical: true },
      { name: 'Verify integrity',  handler: simulateWork('Verify', { delayMs: 80, tokens: 200, cost: 0.002, message: 'Checksums match, 0 discrepancies' }), retries: 1, critical: false },
    ],
    budget: { maxCost: 0.50, maxDuration: 300 },
  };
}

/**
 * Expensive task for budget enforcement demo.
 * Each step costs $0.04 — with a $0.10 budget, should abort around step 3.
 */
export function expensiveTask() {
  return {
    id: 'expensive-task',
    steps: [
      { name: 'Expensive step 1', handler: simulateWork('Step1', { delayMs: 50, tokens: 4000, cost: 0.04, message: 'Heavy computation 1' }), critical: true },
      { name: 'Expensive step 2', handler: simulateWork('Step2', { delayMs: 50, tokens: 4000, cost: 0.04, message: 'Heavy computation 2' }), critical: true },
      { name: 'Expensive step 3', handler: simulateWork('Step3', { delayMs: 50, tokens: 4000, cost: 0.04, message: 'Heavy computation 3' }), critical: true },
      { name: 'Expensive step 4', handler: simulateWork('Step4', { delayMs: 50, tokens: 4000, cost: 0.04, message: 'Heavy computation 4' }), critical: true },
      { name: 'Expensive step 5', handler: simulateWork('Step5', { delayMs: 50, tokens: 4000, cost: 0.04, message: 'Heavy computation 5' }), critical: true },
    ],
    budget: { maxCost: 0.10, maxDuration: 300 },
  };
}
