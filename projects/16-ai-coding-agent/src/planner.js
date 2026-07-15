/**
 * Planning Agent — Analyzes the issue + codebase and produces a structured plan.
 *
 * The planner:
 * 1. Reads files mentioned in the issue
 * 2. Searches for related code patterns
 * 3. Identifies what needs to change
 * 4. Produces a step-by-step plan with file-level changes
 */

/**
 * @typedef {object} PlanStep
 * @property {string} file — File to modify or create
 * @property {'modify'|'create'|'delete'} action — What to do
 * @property {string} description — Human-readable description of the change
 * @property {string} [searchPattern] — Pattern to locate the code to change
 * @property {string} [oldCode] — Code to replace (for modify actions)
 * @property {string} [newCode] — Replacement code (for modify/create actions)
 * @property {number} [priority] — Execution order (lower = first)
 */

/**
 * @typedef {object} Plan
 * @property {string} summary — Overall description of the fix
 * @property {string} rootCause — Identified root cause
 * @property {PlanStep[]} steps — Ordered list of changes
 * @property {string[]} testsToUpdate — Test files that need changes
 * @property {string[]} risksAndAssumptions — Things that could go wrong
 */

/**
 * Analyze an issue and codebase to produce a fix plan.
 *
 * This is a rule-based planner that pattern-matches common bug types.
 * In production, this would be backed by an LLM for general reasoning.
 *
 * @param {object} issue — Parsed issue from issueParser
 * @param {object} explorer — Repo explorer instance
 * @returns {Promise<Plan>}
 */
export async function createPlan(issue, explorer) {
  const context = await gatherContext(issue, explorer);
  const analysis = analyzeIssue(issue, context);
  const steps = generateSteps(analysis, context);

  return {
    summary: analysis.summary,
    rootCause: analysis.rootCause,
    steps,
    testsToUpdate: analysis.testsToUpdate,
    risksAndAssumptions: analysis.risks,
  };
}

/**
 * Gather relevant context from the codebase.
 */
async function gatherContext(issue, explorer) {
  const context = {
    structure: null,
    fileContents: {},
    searchResults: [],
    gitHistory: [],
  };

  // 1. Get project structure
  try {
    context.structure = await explorer.getStructure(3);
  } catch { /* ok */ }

  // 2. Read all mentioned files
  for (const file of issue.mentionedFiles) {
    try {
      const result = await explorer.readFile(file);
      context.fileContents[file] = result;
    } catch {
      // File might not exist yet or path is wrong — that's fine
    }
  }

  // 3. Search for error-related patterns
  for (const error of issue.errors) {
    // Extract the most specific part of the error
    const keyParts = error.match(/Cannot read properties of (\w+)/);
    if (keyParts) {
      const results = await explorer.searchCode(keyParts[0]);
      context.searchResults.push(...results);
    }

    // Search for file references in stack traces
    const fileRefs = error.match(/at\s+.*?\/([^:]+):(\d+)/g);
    if (fileRefs) {
      for (const ref of fileRefs) {
        const fileMatch = ref.match(/\/([^:]+):(\d+)/);
        if (fileMatch) {
          try {
            const result = await explorer.readFile(fileMatch[1]);
            context.fileContents[fileMatch[1]] = result;
          } catch { /* ok */ }
        }
      }
    }
  }

  // 4. Search for patterns from the issue title
  const keywords = extractKeywords(issue.title);
  for (const kw of keywords.slice(0, 3)) {
    try {
      const results = await explorer.searchCode(kw);
      context.searchResults.push(...results);
    } catch { /* ok */ }
  }

  return context;
}

/**
 * Analyze the issue using gathered context.
 */
function analyzeIssue(issue, context) {
  const analysis = {
    summary: '',
    rootCause: '',
    bugType: 'unknown',
    testsToUpdate: [],
    risks: [],
  };

  // Detect bug type from error messages and issue content
  const bodyLower = issue.body.toLowerCase();
  const hasNullError = issue.errors.some(e =>
    /cannot read properties of (undefined|null)/.test(e.toLowerCase())
  );
  const has500 = bodyLower.includes('500') || bodyLower.includes('internal server error');
  const has404 = bodyLower.includes('404') || bodyLower.includes('not found');

  if (hasNullError && has500) {
    analysis.bugType = 'missing-null-check';
    analysis.rootCause = 'A variable is accessed without null/undefined checking, causing a crash when the lookup returns no result.';
    analysis.summary = `Fix null reference error: add proper null/undefined checking and return appropriate error response.`;
  } else if (has500) {
    analysis.bugType = 'unhandled-error';
    analysis.rootCause = 'An error condition is not handled, causing the server to crash or return 500.';
    analysis.summary = 'Add error handling for the failing code path.';
  } else if (has404) {
    analysis.bugType = 'missing-route';
    analysis.rootCause = 'Route handler is missing or not properly configured.';
    analysis.summary = 'Add or fix the route handler.';
  } else {
    analysis.bugType = 'general';
    analysis.rootCause = 'Bug identified from issue description. See steps for details.';
    analysis.summary = `Fix: ${issue.title}`;
  }

  // Identify test files
  for (const file of issue.mentionedFiles) {
    if (file.includes('test') || file.includes('spec')) {
      analysis.testsToUpdate.push(file);
    }
  }

  // If no test files mentioned, look for conventional test locations
  if (analysis.testsToUpdate.length === 0) {
    for (const file of issue.mentionedFiles) {
      if (file.endsWith('.js') || file.endsWith('.ts')) {
        const testFile = file.replace(/\.(js|ts)$/, '.test.$1');
        analysis.testsToUpdate.push(testFile);
      }
    }
  }

  analysis.risks = [
    'Changes may affect other routes that depend on similar patterns',
    'Test coverage should be verified after applying the fix',
  ];

  return analysis;
}

/**
 * Generate concrete fix steps from the analysis.
 */
function generateSteps(analysis, context) {
  const steps = [];

  if (analysis.bugType === 'missing-null-check') {
    // Look through file contents for the pattern
    for (const [filePath, fileData] of Object.entries(context.fileContents)) {
      if (filePath.includes('test')) continue; // Skip test files for code changes

      const lines = fileData.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Pattern: accessing .property on a lookup result without null check
        // e.g., const user = users.find(...); res.json({ name: user.name })
        // where user could be undefined
        if (line.match(/\.(find|get|lookup)\s*\(/) && !line.includes('if ')) {
          // Find the variable name
          const varMatch = line.match(/(const|let|var)\s+(\w+)\s*=/);
          if (varMatch) {
            const varName = varMatch[2];
            // Look for usage of this variable without null check
            for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
              if (lines[j].includes(varName + '.') && !hasNullGuard(lines, i, j, varName)) {
                steps.push({
                  file: filePath,
                  action: 'modify',
                  description: `Add null check for '${varName}' before accessing its properties (line ~${j + 1})`,
                  searchPattern: extractSearchBlock(lines, i, j + 1),
                  oldCode: extractSearchBlock(lines, i, j + 1),
                  newCode: null, // Will be generated by the coder
                  priority: 1,
                  context: {
                    varName,
                    lookupLine: i + 1,
                    accessLine: j + 1,
                    bugType: analysis.bugType,
                  },
                });
                break;
              }
            }
          }
        }
      }
    }
  }

  // Add test steps
  for (const testFile of analysis.testsToUpdate) {
    steps.push({
      file: testFile,
      action: context.fileContents[testFile] ? 'modify' : 'create',
      description: `Add test for the ${analysis.bugType} fix — verify both success and error paths`,
      priority: 2,
      context: { bugType: analysis.bugType },
    });
  }

  return steps;
}

/**
 * Check if there's already a null guard between two line positions.
 */
function hasNullGuard(lines, startLine, endLine, varName) {
  for (let i = startLine; i < endLine; i++) {
    if (lines[i].match(new RegExp(`if\\s*\\(\\s*!?${varName}\\b`))) return true;
    if (lines[i].includes(`${varName}?.`)) return true;
    if (lines[i].includes(`${varName} &&`)) return true;
  }
  return false;
}

/**
 * Extract a block of code lines as a single string.
 */
function extractSearchBlock(lines, startLine, endLine) {
  return lines.slice(startLine, endLine).join('\n');
}

/**
 * Extract meaningful keywords from text (skip common words).
 */
function extractKeywords(text) {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'must', 'shall',
    'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in',
    'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
    'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'out', 'off', 'over', 'under', 'again', 'further',
    'then', 'once', 'when', 'where', 'why', 'how', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
    'than', 'too', 'very', 'just', 'because', 'but', 'and',
    'or', 'if', 'while', 'returns', 'return', 'get', 'set',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

export { gatherContext, analyzeIssue, generateSteps, extractKeywords };
