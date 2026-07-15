// ─── Structured Output Schemas ───────────────────────────────────────────────
// Defines the shape of every finding the agent produces, plus validation helpers.

/**
 * Severity levels, ordered by importance.
 */
export const SEVERITY = Object.freeze({
  BUG: 'bug',
  SECURITY: 'security',
  SUGGESTION: 'suggestion',
  NIT: 'nit',
});

/**
 * Categories a finding can belong to.
 */
export const CATEGORY = Object.freeze({
  LOGIC_ERROR: 'logic_error',
  NULL_REFERENCE: 'null_reference',
  SECURITY: 'security',
  ERROR_HANDLING: 'error_handling',
  PERFORMANCE: 'performance',
  TYPE_SAFETY: 'type_safety',
  CODE_STYLE: 'code_style',
  NAMING: 'naming',
  DESIGN: 'design',
  DUPLICATION: 'duplication',
  MISSING_TEST: 'missing_test',
  API_MISUSE: 'api_misuse',
  RACE_CONDITION: 'race_condition',
  RESOURCE_LEAK: 'resource_leak',
  OTHER: 'other',
});

/**
 * JSON Schema for a single review finding.
 * Used both for validation and as a prompt-level contract with the LLM.
 */
export const FINDING_SCHEMA = {
  type: 'object',
  required: ['file', 'line', 'severity', 'category', 'issue', 'suggestion'],
  properties: {
    file: { type: 'string', description: 'Relative file path in the repo' },
    line: { type: 'integer', description: 'Line number (0 if file-level)' },
    severity: {
      type: 'string',
      enum: Object.values(SEVERITY),
      description: 'How critical the issue is',
    },
    category: {
      type: 'string',
      enum: Object.values(CATEGORY),
      description: 'Classification of the issue',
    },
    issue: { type: 'string', description: 'What is wrong and why it matters' },
    suggestion: { type: 'string', description: 'How to fix it (code or prose)' },
    groupedFiles: {
      type: 'array',
      items: { type: 'string' },
      description: 'Other files with the same issue (for deduplication)',
    },
  },
};

/**
 * JSON Schema for the full review output.
 */
export const REVIEW_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['findings', 'summary', 'filesReviewed', 'filesSkipped'],
  properties: {
    findings: {
      type: 'array',
      items: FINDING_SCHEMA,
    },
    summary: { type: 'string', description: 'One-paragraph review summary' },
    filesReviewed: {
      type: 'array',
      items: { type: 'string' },
      description: 'Files the agent actually reviewed',
    },
    filesSkipped: {
      type: 'array',
      items: { type: 'string' },
      description: 'Files the agent chose to skip and why',
    },
  },
};

/**
 * Validate a finding object against the schema.
 * Returns { valid: boolean, errors: string[] }.
 */
export function validateFinding(finding) {
  const errors = [];
  for (const field of FINDING_SCHEMA.required) {
    if (finding[field] === undefined || finding[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  if (finding.severity && !Object.values(SEVERITY).includes(finding.severity)) {
    errors.push(`Invalid severity: ${finding.severity}`);
  }
  if (finding.category && !Object.values(CATEGORY).includes(finding.category)) {
    errors.push(`Invalid category: ${finding.category}`);
  }
  if (finding.line !== undefined && (typeof finding.line !== 'number' || finding.line < 0)) {
    errors.push(`Invalid line number: ${finding.line}`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Deduplicate findings: group identical issues across files.
 */
export function deduplicateFindings(findings) {
  const groups = new Map();

  for (const f of findings) {
    // Key on issue text + severity + category (same bug in multiple files = one finding)
    const key = `${f.severity}::${f.category}::${f.issue.toLowerCase().trim()}`;
    if (groups.has(key)) {
      const existing = groups.get(key);
      if (!existing.groupedFiles) existing.groupedFiles = [];
      existing.groupedFiles.push(`${f.file}:${f.line}`);
    } else {
      groups.set(key, { ...f });
    }
  }

  return [...groups.values()];
}

/**
 * Sort findings by severity (bugs first, nits last).
 */
export function sortFindings(findings) {
  const order = { bug: 0, security: 1, suggestion: 2, nit: 3 };
  return [...findings].sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4));
}
