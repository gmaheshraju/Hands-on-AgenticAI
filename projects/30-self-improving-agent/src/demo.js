/**
 * Self-Improving Research Agent — Demo
 *
 * Usage:
 *   node src/demo.js                                          # Full 3-round improvement loop
 *   node src/demo.js --rounds 5                               # Custom number of rounds
 *   node src/demo.js --question "How does CRISPR work?"       # Custom question
 *   node src/demo.js --provider ollama                        # Force a specific LLM provider
 *   node src/demo.js --check                                  # Just check LLM connectivity
 *   node src/demo.js --verbose                                # Show LLM call details
 *
 * Environment:
 *   NVIDIA_API_KEY=nvapi-xxx    # For NVIDIA build.nvidia.com (free tier)
 *   GEMINI_API_KEY=AIza...      # For Google Gemini (free tier)
 *   (Ollama needs no key — just run `ollama serve` locally)
 */

import { LLMAdapter } from './llm.js';
import { ResearchAgent } from './agent.js';
import { Harness } from './harness.js';
import { Memory } from './memory.js';
import { Scratchpad } from './scratchpad.js';
import { getBasePrompt, saveVersion, loadHistory } from './prompts.js';
import { evaluate } from './evaluator.js';
import { analyzeRun } from './postmortem.js';
import { generatePatch, applyPatch } from './improver.js';

const DEFAULT_QUESTION = 'How does CRISPR gene editing work and what are its applications?';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { rounds: 3, question: DEFAULT_QUESTION, provider: null, check: false, verbose: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--rounds': opts.rounds = parseInt(args[++i]) || 3; break;
      case '--question': opts.question = args[++i]; break;
      case '--provider': opts.provider = args[++i]; break;
      case '--check': opts.check = true; break;
      case '--verbose': opts.verbose = true; break;
    }
  }
  return opts;
}

function banner(text) {
  console.log('\n' + '═'.repeat(70));
  console.log('  ' + text);
  console.log('═'.repeat(70));
}

function printScores(scores, composite) {
  console.log(`\n  Scores:`);
  console.log(`    Facts:        ${bar(scores.factCount)} ${scores.factCount.toFixed(2)}`);
  console.log(`    Sources:      ${bar(scores.sourceDiversity)} ${scores.sourceDiversity.toFixed(2)}`);
  console.log(`    Coherence:    ${bar(scores.coherence)} ${scores.coherence.toFixed(2)}`);
  console.log(`    Completeness: ${bar(scores.completeness)} ${scores.completeness.toFixed(2)}`);
  console.log(`    ─────────────────────────────`);
  console.log(`    Composite:    ${bar(composite)} ${composite.toFixed(2)}`);
}

function bar(value) {
  const filled = Math.round(value * 20);
  return '█'.repeat(filled) + '░'.repeat(20 - filled);
}

function printComparisonTable(results) {
  console.log('\n  ┌─────────┬───────┬─────────┬───────────┬──────────────┬───────────┐');
  console.log('  │ Version │ Facts │ Sources │ Coherence │ Completeness │ Composite │');
  console.log('  ├─────────┼───────┼─────────┼───────────┼──────────────┼───────────┤');
  for (const r of results) {
    console.log(
      `  │ v${String(r.version).padEnd(6)}│ ${r.scores.factCount.toFixed(2).padEnd(6)}│ ` +
      `${r.scores.sourceDiversity.toFixed(2).padEnd(8)}│ ${r.scores.coherence.toFixed(2).padEnd(10)}│ ` +
      `${r.scores.completeness.toFixed(2).padEnd(13)}│ ${r.composite.toFixed(2).padEnd(10)}│`
    );
  }
  console.log('  └─────────┴───────┴─────────┴───────────┴──────────────┴───────────┘');

  if (results.length >= 2) {
    const first = results[0].composite;
    const last = results[results.length - 1].composite;
    const delta = last - first;
    const pct = first > 0 ? ((delta / first) * 100).toFixed(0) : '∞';
    console.log(`\n  Improvement: ${first.toFixed(2)} → ${last.toFixed(2)} (${delta > 0 ? '+' : ''}${pct}%)`);
  }
}

async function main() {
  const opts = parseArgs();

  banner('PROJECT 30: Self-Improving Research Agent');
  console.log(`  Question: ${opts.question}`);
  console.log(`  Rounds:   ${opts.rounds}`);

  const llmOpts = { verbose: opts.verbose };
  if (opts.provider) llmOpts.providers = [opts.provider];
  const llm = new LLMAdapter(llmOpts);

  // Health check
  const health = await llm.healthCheck();
  console.log('\n  LLM Providers:');
  for (const [provider, available] of Object.entries(health)) {
    console.log(`    ${available ? '✓' : '✗'} ${provider}`);
  }

  if (opts.check) {
    if (Object.values(health).some(v => v)) {
      console.log('\n  Testing a simple chat...');
      try {
        const test = await llm.chat([{ role: 'user', content: 'Say "hello" in JSON: { "message": "hello" }' }], { jsonMode: true });
        console.log(`  ✓ ${test.provider}/${test.model} responded in ${test.latencyMs}ms`);
        console.log(`  Response: ${JSON.stringify(test.parsed)}`);
      } catch (err) {
        console.log(`  ✗ Chat failed: ${err.message}`);
      }
    }
    return;
  }

  if (!Object.values(health).some(v => v)) {
    console.error('\n  ERROR: No LLM providers available.');
    console.error('  Set NVIDIA_API_KEY or GEMINI_API_KEY, or start Ollama (`ollama serve`).');
    process.exit(1);
  }

  const memory = new Memory('./data/agent.db');
  const allResults = [];
  let currentPrompt = getBasePrompt();
  let currentVersion = 1;

  // Check for existing history
  const history = loadHistory();
  if (history.length > 0) {
    const latest = history[history.length - 1];
    currentPrompt = latest.prompt;
    currentVersion = latest.version + 1;
    console.log(`\n  Resuming from prompt v${latest.version} (score: ${latest.score?.toFixed(2) || '?'})`);
  } else {
    saveVersion({ version: 1, prompt: currentPrompt, score: null, patch: null, postmortemSummary: 'Initial base prompt' });
  }

  const memHealth = memory.getHealth();
  if (memHealth.episodes > 0) {
    console.log(`  Memory: ${memHealth.active} facts from ${memHealth.episodes} prior runs`);
  }

  for (let round = 1; round <= opts.rounds; round++) {
    banner(`Round ${round} / ${opts.rounds}  |  Prompt v${currentVersion}`);

    const scratchpad = new Scratchpad();
    const agent = new ResearchAgent({
      question: opts.question,
      llm,
      memory,
      scratchpad,
      systemPrompt: currentPrompt,
    });

    const harness = new Harness({
      maxIterations: 12,
      convergenceWindow: 3,
      verbose: true,
      traceDir: './data/traces',
    });

    console.log('\n  Running agent...\n');
    const runResult = await harness.run(i => agent.step(i));

    console.log(`\n  Stop: ${runResult.stopReason} | Iterations: ${runResult.totalIterations} | Cost: $${runResult.totalCost.toFixed(4)}`);
    console.log(`  Facts: ${agent.factCount} | Sources: ${agent.sourceCount} | Trace: ${runResult.traceFile}`);

    if (agent.finalReport) {
      console.log(`\n  Answer preview (first 300 chars):`);
      console.log(`  ${agent.finalReport.slice(0, 300).replace(/\n/g, '\n  ')}...`);
    }

    // Evaluate
    console.log('\n  Evaluating...');
    const evalResult = await evaluate({
      question: opts.question,
      answer: agent.finalReport,
      traceEntries: runResult.traceEntries,
      llm,
    });
    printScores(evalResult.scores, evalResult.composite);

    // Store episode
    memory.addEpisode(
      runResult.runId, opts.question, agent.finalReport || '',
      evalResult.composite, currentVersion, runResult.stopReason, runResult.totalIterations
    );

    // Store research facts in persistent memory
    for (const fact of agent.facts || []) {
      const match = fact.match(/^\[([^\]]+)\]\s*(.+)/);
      if (match) {
        memory.addFact(match[1], 'states', match[2].slice(0, 200), 0.8, runResult.runId);
      }
    }

    allResults.push({
      version: currentVersion,
      scores: evalResult.scores,
      composite: evalResult.composite,
      stopReason: runResult.stopReason,
    });

    // Postmortem + improvement (skip on last round)
    if (round < opts.rounds) {
      console.log('\n  Running postmortem...');
      const pm = analyzeRun(runResult, runResult.traceEntries);

      if (pm.findings.length > 0) {
        console.log(`\n  Findings (${pm.findings.length}):`);
        for (const f of pm.findings.slice(0, 3)) {
          console.log(`    [${f.severity.toUpperCase()}] ${f.type}: ${f.description}`);
        }
      }

      console.log(`  Weakest primitive: ${pm.weakestPrimitive} (${pm.primitiveScores[pm.weakestPrimitive]?.toFixed(2)})`);

      console.log('\n  Generating prompt improvement...');
      const improvement = await generatePatch({
        currentPrompt,
        postmortem: pm,
        evaluation: evalResult,
        llm,
      });

      currentPrompt = applyPatch(currentPrompt, improvement.patch);
      currentVersion++;

      saveVersion({
        version: currentVersion,
        prompt: currentPrompt,
        score: evalResult.composite,
        patch: improvement.patch,
        reasoning: improvement.reasoning,
        postmortemSummary: pm.summary,
      });

      console.log(`\n  Patch v${currentVersion - 1} → v${currentVersion}:`);
      console.log(`    Action: ${improvement.patch.action} to [${improvement.patch.section}]`);
      console.log(`    Reasoning: ${improvement.reasoning}`);
      console.log(`    Content: ${improvement.patch.content.slice(0, 150).replace(/\n/g, ' ')}...`);
    }
  }

  // Final comparison
  banner('IMPROVEMENT SUMMARY');
  printComparisonTable(allResults);

  // Prompt evolution
  console.log('\n  Prompt evolution:');
  const finalHistory = loadHistory();
  for (const v of finalHistory) {
    const scoreStr = v.score !== null ? v.score.toFixed(2) : 'base';
    const patchStr = v.patch ? `← ${v.patch.action}: ${v.patch.content?.slice(0, 80).replace(/\n/g, ' ')}` : '(initial)';
    console.log(`    v${v.version} [${scoreStr}] ${patchStr}`);
  }

  // Memory stats
  const finalHealth = memory.getHealth();
  console.log(`\n  Memory: ${finalHealth.active} facts, ${finalHealth.episodes} episodes`);
  console.log(`  Run again to see cross-session memory in action.\n`);

  memory.close();
}

main().catch(err => {
  console.error(`\nFatal: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
