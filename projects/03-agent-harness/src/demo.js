/**
 * Demo — run the research agent through the observable harness.
 *
 * Usage:
 *   node src/demo.js
 *   node src/demo.js "Your research question here"
 *   node src/demo.js --convergence   (demo convergence detection)
 *   node src/demo.js --cost-cap      (demo cost cap termination)
 */

import { AgentHarness } from './harness.js';
import { ResearchAgent } from './agent.js';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'traces');

// Ensure traces directory exists
import { mkdirSync } from 'node:fs';
mkdirSync(outDir, { recursive: true });

// ── Parse CLI args ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
const mode = args.find((a) => a.startsWith('--'));
const question = args.find((a) => !a.startsWith('--'))
  ?? 'Compare Pinecone vs Weaviate vs Qdrant for production RAG at 10M+ documents';

// ── Run demos ───────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(70));
  console.log('PROJECT 03: Research Agent with Observable Harness');
  console.log('='.repeat(70));

  if (mode === '--convergence') {
    await demoConvergence();
  } else if (mode === '--cost-cap') {
    await demoCostCap();
  } else {
    await demoFullResearch(question);
  }
}

// ── Demo 1: Full research run ───────────────────────────────────────────

async function demoFullResearch(question) {
  console.log(`\nResearch question: "${question}"\n`);

  const agent = new ResearchAgent(question);
  const harness = new AgentHarness({
    maxIterations: 25,
    maxCostUsd: 1.0,
    convergenceWindow: 3,
    traceDir: outDir,
    verbose: true,
  });

  const result = await harness.run((iter, h) => agent.step(iter));

  // Write the final report
  if (agent.finalReport) {
    const reportPath = join(outDir, `report-${harness.tracer.runId}.md`);
    writeFileSync(reportPath, agent.finalReport);
    console.log(`Report written to: ${reportPath}`);
  }

  printResult(result);
}

// ── Demo 2: Convergence detection ───────────────────────────────────────

async function demoConvergence() {
  console.log('\n--- DEMO: Convergence Detection ---');
  console.log('Agent will repeat the same search, adding no new facts.\n');

  let callCount = 0;
  const harness = new AgentHarness({
    maxIterations: 10,
    maxCostUsd: 1.0,
    convergenceWindow: 3,
    traceDir: outDir,
    verbose: true,
  });

  // Simulate an agent that stops finding new information
  const result = await harness.run(async (iter) => {
    callCount++;
    const newFacts = callCount <= 3 ? 2 : 0;  // productive for 3 iters, then stalls

    return {
      thought: callCount <= 3
        ? `Iteration ${iter}: found ${newFacts} new facts`
        : `Iteration ${iter}: searching again but finding nothing new`,
      tool: 'webSearch',
      toolInput: { query: 'same query repeated' },
      tokensIn: 100,
      tokensOut: 50,
      newFactsAdded: newFacts,
      done: false,
    };
  });

  printResult(result);
}

// ── Demo 3: Cost cap ────────────────────────────────────────────────────

async function demoCostCap() {
  console.log('\n--- DEMO: Cost Cap Termination ---');
  console.log('Setting a very low cost cap ($0.001) to trigger early stop.\n');

  const harness = new AgentHarness({
    maxIterations: 20,
    maxCostUsd: 0.001,  // Very low cap
    convergenceWindow: 3,
    traceDir: outDir,
    verbose: true,
  });

  const result = await harness.run(async (iter) => ({
    thought: `Iteration ${iter}: doing expensive work`,
    tool: 'webSearch',
    toolInput: { query: 'expensive query' },
    tokensIn: 500,
    tokensOut: 200,
    newFactsAdded: 1,
    done: false,
  }));

  printResult(result);
}

// ── Helpers ──────────────────────────────────────────────────────────────

function printResult(result) {
  console.log('\nFinal result:');
  console.log(`  Stop reason:      ${result.stopReason}`);
  console.log(`  Total iterations: ${result.totalIterations}`);
  console.log(`  Total cost:       $${result.totalCost.toFixed(6)}`);
  console.log(`  Trace file:       ${result.traceFile}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
