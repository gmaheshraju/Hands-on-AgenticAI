/**
 * AI Coding Agent — Orchestrates the full pipeline.
 *
 * Pipeline:
 *   1. Parse the issue
 *   2. Explore the codebase
 *   3. Create a fix plan
 *   4. Execute the plan (generate + apply code)
 *   5. Run tests with self-correction loop
 *   6. Generate a PR description
 *
 * Usage:
 *   import { runAgent } from './agent.js';
 *   const result = await runAgent({ issue: 1, projectRoot: './sample-project' });
 */

import { parseIssue } from './issueParser.js';
import { createExplorer } from './repoExplorer.js';
import { createPlan } from './planner.js';
import { createCoder } from './coder.js';
import { runTests, selfCorrectLoop } from './testRunner.js';
import { generatePR, formatPRForDisplay } from './prGenerator.js';
import { resolve } from 'node:path';

/**
 * @typedef {object} AgentConfig
 * @property {string|number|object} issue — Issue number (mock), GitHub URL, or issue object
 * @property {string} projectRoot — Path to the project to fix
 * @property {number} [maxRetries=3] — Max self-correction attempts
 * @property {string} [testCommand='npm test'] — Command to run tests
 * @property {boolean} [dryRun=false] — If true, don't apply changes
 * @property {boolean} [verbose=true] — Print progress to console
 */

/**
 * Run the full AI Coding Agent pipeline.
 *
 * @param {AgentConfig} config
 * @returns {Promise<object>} Full result with issue, plan, changes, testResult, pr
 */
export async function runAgent(config) {
  const {
    issue: issueInput,
    projectRoot,
    maxRetries = 3,
    testCommand = 'npm test',
    dryRun = false,
    verbose = true,
  } = config;

  const absRoot = resolve(projectRoot);
  const log = verbose ? console.log.bind(console) : () => {};
  const startTime = Date.now();

  log('\n' + '='.repeat(60));
  log('  AI CODING AGENT');
  log('='.repeat(60));

  // ---------- Step 1: Parse the issue ----------
  log('\n[1/6] Parsing issue...');
  const issue = await parseIssue(issueInput);
  log(`  Title: ${issue.title}`);
  log(`  Labels: ${issue.labels.join(', ')}`);
  log(`  Mentioned files: ${issue.mentionedFiles.join(', ') || 'none'}`);
  log(`  Error snippets: ${issue.errors.length}`);

  // ---------- Step 2: Explore the codebase ----------
  log('\n[2/6] Exploring codebase...');
  const explorer = createExplorer(absRoot);
  const structure = await explorer.getStructure(2);
  log(`  Project structure:\n${indent(structure, '    ')}`);

  // ---------- Step 3: Create a plan ----------
  log('\n[3/6] Planning fix...');
  const plan = await createPlan(issue, explorer);
  log(`  Summary: ${plan.summary}`);
  log(`  Root cause: ${plan.rootCause}`);
  log(`  Steps: ${plan.steps.length}`);
  for (const step of plan.steps) {
    log(`    - [${step.action}] ${step.file}: ${step.description}`);
  }
  log(`  Tests to update: ${plan.testsToUpdate.join(', ') || 'none identified'}`);

  // ---------- Step 4: Generate and apply code changes ----------
  log('\n[4/6] Generating code changes...');
  const coder = createCoder(absRoot);
  const changes = await coder.executePlan(plan, explorer);

  if (changes.length === 0) {
    log('  No changes generated — the planner could not identify a concrete fix.');
    log('  This can happen when the bug pattern is unusual.');
  } else {
    for (const change of changes) {
      log(`  [${change.action}] ${change.file}`);
      log(`    ${change.description}`);
      // Show a compact diff preview
      const diffLines = change.diff.split('\n');
      const addedLines = diffLines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
      const removedLines = diffLines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;
      log(`    +${addedLines} -${removedLines} lines`);
    }
  }

  if (!dryRun && changes.length > 0) {
    log('\n  Applying changes to disk...');
    const applied = await coder.applyChanges();
    log(`  Applied: ${applied.join(', ')}`);
  }

  // ---------- Step 5: Run tests with self-correction ----------
  log('\n[5/6] Running tests (with self-correction)...');
  let testResult = null;
  let iterations = [];

  try {
    const loopResult = await selfCorrectLoop(absRoot, coder, explorer, {
      maxRetries,
      testCommand,
      onIteration: (iter) => {
        const icon = iter.result.passed ? 'PASS' : 'FAIL';
        log(`  [${iter.label}] ${icon} — ${iter.result.passed_count}/${iter.result.total} tests passed`);
        if (!iter.result.passed && iter.result.failures.length > 0) {
          for (const f of iter.result.failures) {
            log(`    FAIL: ${f.testName} — ${f.error}`);
          }
        }
        if (iter.correction && iter.correction.applied) {
          log(`    Self-correction applied: ${iter.correction.corrections.length} fix(es)`);
        }
      },
    });
    testResult = loopResult.finalResult;
    iterations = loopResult.iterations;
  } catch (err) {
    log(`  Test execution error: ${err.message}`);
    testResult = {
      passed: false,
      total: 0,
      passed_count: 0,
      failed_count: 0,
      rawOutput: err.message,
      failures: [{ testName: 'Test execution', error: err.message }],
      exitCode: 1,
    };
  }

  // ---------- Step 6: Generate PR ----------
  log('\n[6/6] Generating PR description...');
  const pr = generatePR({ issue, plan, changes, testResult, iterations });
  log(formatPRForDisplay(pr));

  // ---------- Summary ----------
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log('\n' + '-'.repeat(60));
  log(`  Agent completed in ${elapsed}s`);
  log(`  Changes: ${changes.length} file(s)`);
  log(`  Tests: ${testResult ? (testResult.passed ? 'ALL PASSED' : 'SOME FAILED') : 'NOT RUN'}`);
  log(`  Self-corrections: ${Math.max(0, iterations.length - 1)}`);
  log('-'.repeat(60) + '\n');

  return {
    issue,
    plan,
    changes,
    testResult,
    iterations,
    pr,
    elapsed,
  };
}

function indent(text, prefix) {
  return text.split('\n').map(l => prefix + l).join('\n');
}
