/**
 * Coding Agent — Generates and applies code changes based on the plan.
 *
 * Capabilities:
 * - Generates code fixes from plan steps (rule-based for demo, LLM-backed in production)
 * - Creates unified diffs
 * - Applies patches to files
 * - Tracks all modifications for rollback
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createTwoFilesPatch } from 'diff';

/**
 * @typedef {object} CodeChange
 * @property {string} file — File path (relative to project root)
 * @property {'modify'|'create'} action
 * @property {string} originalContent — Original file content (empty for new files)
 * @property {string} newContent — Modified file content
 * @property {string} diff — Unified diff
 * @property {string} description — What changed and why
 */

/**
 * Create a coder instance bound to a project root.
 *
 * @param {string} projectRoot — Absolute path to the project
 * @returns {object} Coder API
 */
export function createCoder(projectRoot) {
  const root = resolve(projectRoot);
  /** @type {CodeChange[]} */
  const changes = [];

  /**
   * Execute a plan — generate and apply all code changes.
   *
   * @param {import('./planner.js').Plan} plan
   * @param {object} explorer — Repo explorer for reading files
   * @returns {Promise<CodeChange[]>}
   */
  async function executePlan(plan, explorer) {
    // Sort steps by priority
    const sortedSteps = [...plan.steps].sort((a, b) => (a.priority || 99) - (b.priority || 99));

    for (const step of sortedSteps) {
      const change = await executeStep(step, explorer, plan);
      if (change) {
        changes.push(change);
      }
    }

    return changes;
  }

  /**
   * Execute a single plan step.
   */
  async function executeStep(step, explorer, plan) {
    let originalContent = '';
    let newContent = '';

    if (step.action === 'modify') {
      // Read the current file
      try {
        const file = await explorer.readFile(step.file);
        originalContent = file.content;
      } catch (err) {
        console.error(`  [coder] Cannot read ${step.file}: ${err.message}`);
        return null;
      }

      // Generate the fix
      newContent = generateFix(originalContent, step, plan);

    } else if (step.action === 'create') {
      newContent = generateNewFile(step, plan);
    }

    if (!newContent || newContent === originalContent) {
      return null;
    }

    // Generate unified diff
    const diff = createTwoFilesPatch(
      `a/${step.file}`,
      `b/${step.file}`,
      originalContent,
      newContent,
      '', '',
      { context: 3 }
    );

    return {
      file: step.file,
      action: step.action,
      originalContent,
      newContent,
      diff,
      description: step.description,
    };
  }

  /**
   * Apply all generated changes to disk.
   */
  async function applyChanges() {
    const applied = [];
    for (const change of changes) {
      const absPath = resolve(root, change.file);
      // Ensure directory exists
      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, change.newContent, 'utf-8');
      applied.push(change.file);
    }
    return applied;
  }

  /**
   * Rollback all changes to their original state.
   */
  async function rollback() {
    for (const change of changes) {
      const absPath = resolve(root, change.file);
      if (change.action === 'modify') {
        await writeFile(absPath, change.originalContent, 'utf-8');
      }
      // For created files, we'd delete them, but keeping it simple
    }
  }

  /**
   * Apply a specific fix based on the step context.
   * Returns the modified file content.
   */
  function applyFix(content, oldCode, newCode) {
    if (!content.includes(oldCode)) {
      console.warn('  [coder] Warning: Could not find exact match for replacement');
      return content;
    }
    return content.replace(oldCode, newCode);
  }

  function getChanges() {
    return [...changes];
  }

  return { executePlan, applyChanges, rollback, applyFix, getChanges };
}

// ---------- Code generation (rule-based for demo) ----------

/**
 * Generate a fix for the given code based on the plan step.
 *
 * In production, this would call an LLM. Here we use pattern matching
 * for common bug types to keep the demo self-contained.
 */
function generateFix(originalContent, step, plan) {
  const ctx = step.context || {};

  switch (ctx.bugType) {
    case 'missing-null-check':
      return fixMissingNullCheck(originalContent, ctx);
    case 'unhandled-error':
      return fixUnhandledError(originalContent, ctx);
    default:
      // Attempt a generic fix if oldCode/newCode are provided
      if (step.oldCode && step.newCode) {
        return originalContent.replace(step.oldCode, step.newCode);
      }
      return originalContent;
  }
}

/**
 * Fix a missing null check pattern.
 *
 * Pattern: `const x = collection.find(...); ... x.prop ...`
 * Fix: Add `if (!x) return res.status(404).json({ error: "Not found" })`
 */
function fixMissingNullCheck(content, ctx) {
  const lines = content.split('\n');
  const { varName, lookupLine, accessLine } = ctx;

  if (!varName || !lookupLine || !accessLine) return content;

  // Find the lookup line (0-indexed)
  const lookupIdx = lookupLine - 1;
  if (lookupIdx < 0 || lookupIdx >= lines.length) return content;

  // Detect indentation
  const indent = lines[lookupIdx].match(/^(\s*)/)[1];

  // Build the null check — detect if it's an HTTP/Express route handler
  const isExpress = content.includes('res.json') || content.includes('res.status') || content.includes('res.send');
  const isRawHttp = content.includes('res.writeHead') || content.includes('res.end');
  let nullCheck;
  if (isExpress) {
    nullCheck = `${indent}if (!${varName}) {\n${indent}  return res.status(404).json({ error: '${capitalize(varName)} not found' });\n${indent}}`;
  } else if (isRawHttp) {
    nullCheck = `${indent}if (!${varName}) {\n${indent}  res.writeHead(404);\n${indent}  res.end(JSON.stringify({ error: '${capitalize(varName)} not found' }));\n${indent}  return;\n${indent}}`;
  } else {
    nullCheck = `${indent}if (!${varName}) {\n${indent}  throw new Error('${capitalize(varName)} not found');\n${indent}}`;
  }

  // Insert the null check after the lookup line
  lines.splice(lookupIdx + 1, 0, nullCheck);

  return lines.join('\n');
}

/**
 * Fix an unhandled error pattern.
 */
function fixUnhandledError(content, ctx) {
  // Wrap the problematic code in try-catch
  // This is a simplified version — production would use LLM
  return content;
}

/**
 * Generate content for a new file.
 */
function generateNewFile(step, plan) {
  const ctx = step.context || {};

  if (step.file.includes('test')) {
    return generateTestFile(step, plan);
  }

  return `// ${step.description}\n// Generated by AI Coding Agent\n\n`;
}

/**
 * Generate a test file for the fix.
 */
function generateTestFile(step, plan) {
  const isNodeTest = true; // Use Node.js built-in test runner

  // Determine what we're testing from the plan
  const routeMatch = plan.summary.match(/null reference|404|not found/i);
  const isApiTest = routeMatch !== null;

  if (isApiTest) {
    return `import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.js';

describe('API Error Handling', () => {
  let app;
  let server;

  // Helper to make requests to the test server
  async function request(path) {
    const port = server.address().port;
    const res = await fetch(\`http://localhost:\${port}\${path}\`);
    const body = await res.json();
    return { status: res.status, body };
  }

  it('should start the server', async () => {
    app = createApp();
    server = app.listen(0); // Random available port
  });

  it('should return 200 for existing resources', async () => {
    const { status, body } = await request('/users/1');
    assert.strictEqual(status, 200);
    assert.ok(body.name, 'Response should include a name');
  });

  it('should return 404 for non-existing resources', async () => {
    const { status, body } = await request('/users/999');
    assert.strictEqual(status, 404);
    assert.ok(body.error, 'Response should include an error message');
  });

  it('should not crash on invalid IDs', async () => {
    const { status } = await request('/users/abc');
    assert.ok([400, 404].includes(status), 'Should return 400 or 404, not 500');
  });

  it('should clean up', () => {
    server.close();
  });
});
`;
  }

  return `import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('${step.description}', () => {
  it('should pass a basic test', () => {
    assert.ok(true, 'Placeholder — add specific tests');
  });
});
`;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export { generateFix, fixMissingNullCheck, generateTestFile };
