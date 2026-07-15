/**
 * Demo runner — executes all three workflow definitions and prints traces.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WorkflowEngine } from './engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workflowsDir = join(__dirname, '..', 'workflows');

async function loadWorkflow(name) {
  const raw = await readFile(join(workflowsDir, `${name}.json`), 'utf-8');
  return JSON.parse(raw);
}

// ─── Demo 1: Content Pipeline ──────────────────────────────────────

async function demoContentPipeline(engine) {
  console.log('\n' + '#'.repeat(70));
  console.log('#  DEMO 1: Content Publishing Pipeline');
  console.log('#'.repeat(70));

  const workflow = await loadWorkflow('content-pipeline');
  const run = await engine.execute(workflow, {
    topic: 'The Rise of Agentic AI in Software Engineering',
    audience: 'senior software engineers',
    tone: 'professional yet accessible',
  });

  // Show key outputs
  const publishResult = run.nodeResults.get('publish');
  if (publishResult?.output?.publishContent) {
    console.log('  Published URL:', publishResult.output.publishContent.url);
  }

  return run;
}

// ─── Demo 2: Customer Onboarding ───────────────────────────────────

async function demoCustomerOnboarding(engine) {
  console.log('\n' + '#'.repeat(70));
  console.log('#  DEMO 2: Customer Onboarding Pipeline');
  console.log('#'.repeat(70));

  const workflow = await loadWorkflow('customer-onboarding');
  const run = await engine.execute(workflow, {
    email: 'newcustomer@example.com',
    customerId: 'CUST-2026-0042',
    customerName: 'Jane Smith',
  });

  // Show what happened
  const condResult = run.nodeResults.get('check-credit-score');
  if (condResult?.output?._condition) {
    const cond = condResult.output._condition;
    console.log(`  Credit approved: ${cond.result} (branch: ${cond.branchTaken})`);
  }

  return run;
}

// ─── Demo 3: Incident Response ─────────────────────────────────────

async function demoIncidentResponse(engine) {
  console.log('\n' + '#'.repeat(70));
  console.log('#  DEMO 3: Incident Response Pipeline');
  console.log('#'.repeat(70));

  const workflow = await loadWorkflow('incident-response');
  const run = await engine.execute(workflow, {
    alertMessage: 'API error rate exceeded 12.5%, threshold is 5.0%',
  });

  // Show incident report
  const report = run.nodeResults.get('create-report');
  if (report?.output?.incidentReport) {
    console.log('  Incident Report:', JSON.stringify(report.output.incidentReport, null, 4));
  }

  return run;
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('Agentic Workflow Engine — Demo Runner');
  console.log('=====================================\n');

  const engine = new WorkflowEngine({ verbose: true });

  const results = [];

  try {
    results.push(await demoContentPipeline(engine));
    results.push(await demoCustomerOnboarding(engine));
    results.push(await demoIncidentResponse(engine));
  } catch (err) {
    console.error('Fatal error:', err);
  }

  // ─── Final Summary ───────────────────────────────────────────────

  console.log('\n' + '='.repeat(70));
  console.log('  FINAL SUMMARY');
  console.log('='.repeat(70));

  for (const run of results) {
    const s = run.summary();
    const completed = s.nodes.filter((n) => n.status === 'completed').length;
    const skipped = s.nodes.filter((n) => n.status === 'skipped').length;
    const failed = s.nodes.filter((n) => n.status === 'failed').length;
    console.log(`\n  ${s.workflowId}`);
    console.log(`    Status: ${s.status} | ${s.totalMs}ms`);
    console.log(`    Nodes:  ${completed} completed, ${skipped} skipped, ${failed} failed`);
    console.log(`    Trace:  ${s.traceCount} events`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('  All demos completed.');
  console.log('='.repeat(70) + '\n');
}

main().catch(console.error);
