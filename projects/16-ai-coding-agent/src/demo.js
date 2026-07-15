#!/usr/bin/env node

/**
 * Demo — End-to-end demonstration of the AI Coding Agent.
 *
 * Runs the agent against the sample-project with mock issue #1:
 *   "GET /users/:id returns 500 when user not found"
 *
 * The agent will:
 *   1. Parse the issue
 *   2. Explore the sample project
 *   3. Plan a fix (add null check + 404 response)
 *   4. Apply the fix
 *   5. Run tests with self-correction
 *   6. Generate a PR description
 *
 * Usage:
 *   node src/demo.js
 */

import { runAgent } from './agent.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { cpSync, rmSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, '..', 'sample-project');
const BACKUP_DIR = resolve(__dirname, '..', '.sample-project-backup');

/**
 * Create a clean copy of the sample project so the demo is repeatable.
 */
async function setupCleanProject() {
  // Back up original if not already backed up
  if (!existsSync(BACKUP_DIR)) {
    cpSync(PROJECT_DIR, BACKUP_DIR, { recursive: true });
    console.log('[setup] Backed up sample-project for repeatability');
  } else {
    // Restore from backup
    rmSync(PROJECT_DIR, { recursive: true, force: true });
    cpSync(BACKUP_DIR, PROJECT_DIR, { recursive: true });
    console.log('[setup] Restored sample-project from backup');
  }
}

/**
 * Run the full demo.
 */
async function main() {
  console.log('\n');
  console.log('*'.repeat(60));
  console.log('  AI CODING AGENT — DEMO');
  console.log('  Issue: GET /users/:id returns 500 when user not found');
  console.log('*'.repeat(60));
  console.log('');

  // Step 0: Ensure clean state
  await setupCleanProject();

  // Step 1: Show the bug
  console.log('\n--- BEFORE FIX: The bug in action ---');
  console.log('File: sample-project/src/app.js');
  const originalCode = await readFile(resolve(PROJECT_DIR, 'src/app.js'), 'utf-8');
  const buggyLines = originalCode.split('\n');
  const bugLineIdx = buggyLines.findIndex(l => l.includes('BUG: This line crashes'));
  if (bugLineIdx >= 0) {
    console.log('');
    for (let i = Math.max(0, bugLineIdx - 3); i <= Math.min(buggyLines.length - 1, bugLineIdx + 3); i++) {
      const marker = i === bugLineIdx || i === bugLineIdx + 1 ? '>>>' : '   ';
      console.log(`  ${marker} ${String(i + 1).padStart(3)}: ${buggyLines[i]}`);
    }
    console.log('');
    console.log('  When user is not found, users.find() returns undefined,');
    console.log('  and accessing user.id crashes with TypeError.');
  }

  // Step 2: Run the agent
  console.log('\n--- RUNNING AI CODING AGENT ---\n');

  const result = await runAgent({
    issue: 1,                   // Mock issue #1
    projectRoot: PROJECT_DIR,
    maxRetries: 3,
    testCommand: 'node --test tests/*.test.js',
    verbose: true,
  });

  // Step 3: Show the fix
  console.log('\n--- AFTER FIX ---');
  const fixedCode = await readFile(resolve(PROJECT_DIR, 'src/app.js'), 'utf-8');
  if (fixedCode !== originalCode) {
    console.log('\nThe agent modified src/app.js:');
    const fixedLines = fixedCode.split('\n');
    const diffStart = findFirstDiff(buggyLines, fixedLines);
    if (diffStart >= 0) {
      console.log('');
      for (let i = Math.max(0, diffStart - 2); i < Math.min(fixedLines.length, diffStart + 8); i++) {
        const isNew = i >= diffStart && (i >= buggyLines.length || buggyLines[i] !== fixedLines[i]);
        const marker = isNew ? ' + ' : '   ';
        console.log(`  ${marker} ${String(i + 1).padStart(3)}: ${fixedLines[i]}`);
      }
    }
  } else {
    console.log('  (No changes were made to app.js — planner could not identify the pattern)');
  }

  // Step 4: Summary
  console.log('\n' + '='.repeat(60));
  console.log('  DEMO COMPLETE');
  console.log('='.repeat(60));
  console.log(`\n  Files changed: ${result.changes.length}`);
  console.log(`  Tests: ${result.testResult?.passed ? 'ALL PASSED' : 'SOME FAILURES'}`);
  console.log(`  Self-corrections: ${Math.max(0, result.iterations.length - 1)}`);
  console.log(`  Time: ${result.elapsed}s`);
  console.log('');
  console.log('  The PR description above shows what would be submitted.');
  console.log('  Run the demo again — it restores the buggy project each time.');
  console.log('');
}

function findFirstDiff(linesA, linesB) {
  const maxLen = Math.max(linesA.length, linesB.length);
  for (let i = 0; i < maxLen; i++) {
    if (linesA[i] !== linesB[i]) return i;
  }
  return -1;
}

main().catch(err => {
  console.error('\nDemo failed:', err);
  process.exit(1);
});
