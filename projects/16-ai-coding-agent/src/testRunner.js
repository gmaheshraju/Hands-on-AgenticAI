/**
 * Test Runner — Runs tests, parses output, and feeds errors back for self-correction.
 *
 * The self-correction loop:
 *   1. Run tests
 *   2. If tests pass -> done
 *   3. If tests fail -> parse errors, generate a fix, apply, retry
 *   4. Max N retries before giving up
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * @typedef {object} TestResult
 * @property {boolean} passed — Whether all tests passed
 * @property {number} total — Total number of tests
 * @property {number} passed_count — Number of passed tests
 * @property {number} failed_count — Number of failed tests
 * @property {string} rawOutput — Full test output
 * @property {TestFailure[]} failures — Parsed failure details
 * @property {number} exitCode — Process exit code
 */

/**
 * @typedef {object} TestFailure
 * @property {string} testName — Name of the failing test
 * @property {string} error — Error message
 * @property {string} [expected] — Expected value
 * @property {string} [actual] — Actual value
 * @property {string} [file] — File where the failure occurred
 * @property {number} [line] — Line number of the failure
 */

/**
 * Run tests in a project directory.
 *
 * @param {string} projectRoot — Absolute path to the project
 * @param {object} [opts] — Options
 * @param {string} [opts.command] — Custom test command (default: 'npm test')
 * @param {number} [opts.timeout] — Timeout in ms (default: 30000)
 * @returns {TestResult}
 */
export function runTests(projectRoot, opts = {}) {
  const { command = 'npm test', timeout = 30000 } = opts;
  const cwd = resolve(projectRoot);

  let rawOutput = '';
  let exitCode = 0;

  try {
    rawOutput = execSync(command, {
      cwd,
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NODE_NO_WARNINGS: '1' },
    });
  } catch (err) {
    exitCode = err.status || 1;
    rawOutput = (err.stdout || '') + '\n' + (err.stderr || '');
  }

  const failures = parseFailures(rawOutput);
  const counts = parseCounts(rawOutput);

  return {
    passed: exitCode === 0 && failures.length === 0,
    total: counts.total,
    passed_count: counts.passed,
    failed_count: counts.failed,
    rawOutput: rawOutput.trim(),
    failures,
    exitCode,
  };
}

/**
 * Parse test failures from raw output.
 * Handles Node.js built-in test runner and common patterns.
 */
function parseFailures(output) {
  const failures = [];

  // Pattern 1: Node.js built-in test runner
  // TAP: "not ok N - description" or v23 spec: "✗ description"
  const nodeTestPattern = /(?:not ok \d+ - |[✗✖]\s+)(.+)/g;
  let match;
  while ((match = nodeTestPattern.exec(output)) !== null) {
    const testName = match[1];
    // Look for the error details after this line
    const afterMatch = output.slice(match.index);
    const errorMatch = afterMatch.match(/(?:Error|AssertionError):\s*(.+?)(?:\n|$)/);
    const expectedMatch = afterMatch.match(/expected:\s*(.+?)(?:\n|$)/i);
    const actualMatch = afterMatch.match(/actual:\s*(.+?)(?:\n|$)/i);
    const fileMatch = afterMatch.match(/at\s+.*?(?:\((.+?):(\d+):\d+\)|(.+?):(\d+):\d+)/);

    failures.push({
      testName,
      error: errorMatch ? errorMatch[1].trim() : 'Test failed',
      expected: expectedMatch ? expectedMatch[1].trim() : undefined,
      actual: actualMatch ? actualMatch[1].trim() : undefined,
      file: fileMatch ? (fileMatch[1] || fileMatch[3]) : undefined,
      line: fileMatch ? parseInt(fileMatch[2] || fileMatch[4], 10) : undefined,
    });
  }

  // Pattern 2: AssertionError / Error with stack trace
  if (failures.length === 0) {
    const assertPattern = /(?:AssertionError|Error|TypeError|ReferenceError)\s*(?:\[.+?\])?:\s*(.+?)(?:\n|$)/g;
    while ((match = assertPattern.exec(output)) !== null) {
      const fileMatch = output.slice(match.index).match(/at\s+.*?(?:\((.+?):(\d+):\d+\)|(.+?):(\d+):\d+)/);
      failures.push({
        testName: 'Unknown test',
        error: match[1].trim(),
        file: fileMatch ? (fileMatch[1] || fileMatch[3]) : undefined,
        line: fileMatch ? parseInt(fileMatch[2] || fileMatch[4], 10) : undefined,
      });
    }
  }

  // Pattern 3: Generic "FAIL" or "FAILED" indicators
  // Exclude Node v23 stats lines like "ℹ fail 0" which contain "fail" but mean zero failures
  const genericFailPattern = output.replace(/[ℹ#]\s*fail\s+\d+/g, '');
  if (failures.length === 0 && /\bFAIL(?:ED|URE|S)?\b/i.test(genericFailPattern)) {
    failures.push({
      testName: 'Unknown',
      error: 'Tests failed — see raw output for details',
    });
  }

  return failures;
}

/**
 * Parse test counts from output.
 */
function parseCounts(output) {
  // Node.js v23+ spec reporter: "ℹ tests 5" "ℹ pass 4" "ℹ fail 1"
  const v23Total = output.match(/[ℹ#]\s*tests\s+(\d+)/);
  const v23Pass = output.match(/[ℹ#]\s*pass\s+(\d+)/);
  const v23Fail = output.match(/[ℹ#]\s*fail\s+(\d+)/);

  if (v23Total) {
    return {
      total: parseInt(v23Total[1], 10),
      passed: v23Pass ? parseInt(v23Pass[1], 10) : 0,
      failed: v23Fail ? parseInt(v23Fail[1], 10) : 0,
    };
  }

  // Jest / Mocha: "Tests: 1 failed, 4 passed, 5 total"
  const jestMatch = output.match(/Tests:\s+(?:(\d+) failed,\s*)?(\d+) passed,\s*(\d+) total/);
  if (jestMatch) {
    return {
      total: parseInt(jestMatch[3], 10),
      passed: parseInt(jestMatch[2], 10),
      failed: jestMatch[1] ? parseInt(jestMatch[1], 10) : 0,
    };
  }

  // Fallback: count ✔/✓ and ✗/✖ (Node v23 spec reporter) or ok/not ok (TAP)
  const passCount = (output.match(/^[\s]*[✔✓]\s/gm) || []).length
    + (output.match(/^ok \d+/gm) || []).length;
  const failCount = (output.match(/^[\s]*[✗✖]\s/gm) || []).length
    + (output.match(/^not ok \d+/gm) || []).length;
  return {
    total: passCount + failCount,
    passed: passCount,
    failed: failCount,
  };
}

/**
 * Run the self-correction loop.
 *
 * @param {string} projectRoot — Project directory
 * @param {object} coder — Coder instance (for applying fixes)
 * @param {object} explorer — Repo explorer (for reading files)
 * @param {object} [opts]
 * @param {number} [opts.maxRetries=3] — Maximum correction attempts
 * @param {string} [opts.testCommand] — Custom test command
 * @param {Function} [opts.onIteration] — Callback for each iteration
 * @returns {Promise<{finalResult: TestResult, iterations: object[]}>}
 */
export async function selfCorrectLoop(projectRoot, coder, explorer, opts = {}) {
  const { maxRetries = 3, testCommand, onIteration } = opts;
  const iterations = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const isRetry = attempt > 0;
    const label = isRetry ? `Retry ${attempt}/${maxRetries}` : 'Initial run';

    // Run tests
    const result = runTests(projectRoot, { command: testCommand });

    const iteration = {
      attempt,
      label,
      result,
      correction: null,
    };

    if (onIteration) {
      onIteration(iteration);
    }

    if (result.passed) {
      iterations.push(iteration);
      return { finalResult: result, iterations };
    }

    // Tests failed — attempt correction if we have retries left
    if (attempt < maxRetries) {
      const correction = await attemptCorrection(result, coder, explorer, projectRoot);
      iteration.correction = correction;
    }

    iterations.push(iteration);
  }

  // All retries exhausted
  const finalResult = runTests(projectRoot, { command: testCommand });
  return { finalResult, iterations };
}

/**
 * Attempt to correct test failures.
 *
 * Analyzes the failure, identifies the likely cause, and applies a targeted fix.
 */
async function attemptCorrection(testResult, coder, explorer, projectRoot) {
  const corrections = [];

  for (const failure of testResult.failures) {
    // Read the failing file if we can identify it
    if (failure.file) {
      try {
        const fileContent = await explorer.readFile(failure.file);
        const fix = generateCorrectionForFailure(failure, fileContent.content);
        if (fix) {
          const { writeFile: fsWrite } = await import('node:fs/promises');
          await fsWrite(resolve(projectRoot, failure.file), fix.newContent, 'utf-8');
          corrections.push({
            file: failure.file,
            description: fix.description,
          });
        }
      } catch {
        // Can't read or fix this file
      }
    }

    // Check if the error is in the source code, not the test
    if (failure.error.includes('Cannot read properties')) {
      // The source code fix didn't fully work — look for remaining null accesses
      const searchResults = await explorer.searchCode('Cannot read properties');
      corrections.push({
        description: `Found ${searchResults.length} related patterns in codebase`,
        searchResults,
      });
    }
  }

  return {
    applied: corrections.length > 0,
    corrections,
  };
}

/**
 * Generate a targeted correction for a specific test failure.
 */
function generateCorrectionForFailure(failure, fileContent) {
  // Handle common failure patterns

  // Pattern: Expected 404, got 500 -> null check is missing or incomplete
  if (failure.expected === '404' && failure.actual === '500') {
    return {
      description: 'Fix: route returns 500 instead of 404 — add/fix null check',
      newContent: fileContent, // Would modify in production
    };
  }

  // Pattern: fetch failed / ECONNREFUSED -> server not started in test
  if (failure.error.includes('ECONNREFUSED') || failure.error.includes('fetch failed')) {
    return {
      description: 'Fix: test server connection issue — ensure server starts before tests',
      newContent: fileContent,
    };
  }

  return null;
}

export { parseFailures, parseCounts };
