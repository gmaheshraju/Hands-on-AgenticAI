/**
 * permissions.js — SQL parser and permission enforcement.
 *
 * Three tiers enforced in CODE (not prompts):
 *   1. Read-only: only SELECT allowed
 *   2. Confirm-before-execute: warns on expensive queries (full scans, >3 joins)
 *   3. Blocked: non-allowed tables, information_schema, dangerous patterns
 *
 * The parser uses regex + token analysis (not a full SQL AST) — good enough
 * for the security boundary because we DENY by default and whitelist patterns.
 */

// ── Result types ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} allowed      - Whether the query can execute
 * @property {boolean} needsConfirm - Whether user confirmation is required
 * @property {string}  reason       - Human-readable explanation
 * @property {string}  tier         - Which tier triggered: 'allowed' | 'confirm' | 'blocked'
 * @property {Object}  details      - Extra info (tables found, join count, etc.)
 */

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip SQL comments and string literals to avoid false positives.
 * Replaces string contents with empty strings and removes comments entirely.
 */
function stripCommentsAndStrings(sql) {
  // Remove block comments
  let cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Remove line comments
  cleaned = cleaned.replace(/--[^\n]*/g, ' ');
  // Replace string literals with placeholders (so table names inside strings don't trigger blocks)
  cleaned = cleaned.replace(/'[^']*'/g, "''");
  cleaned = cleaned.replace(/"[^"]*"/g, '""');
  return cleaned;
}

/**
 * Extract table names referenced in the SQL.
 * Looks for FROM, JOIN, INTO, UPDATE, and table-name patterns.
 */
function extractTableNames(sql) {
  const cleaned = stripCommentsAndStrings(sql);
  const tables = new Set();

  // FROM table, FROM table alias
  const fromPattern = /\bFROM\s+([a-zA-Z_]\w*)/gi;
  let match;
  while ((match = fromPattern.exec(cleaned)) !== null) {
    tables.add(match[1].toLowerCase());
  }

  // JOIN table
  const joinPattern = /\bJOIN\s+([a-zA-Z_]\w*)/gi;
  while ((match = joinPattern.exec(cleaned)) !== null) {
    tables.add(match[1].toLowerCase());
  }

  // INSERT INTO table
  const insertPattern = /\bINTO\s+([a-zA-Z_]\w*)/gi;
  while ((match = insertPattern.exec(cleaned)) !== null) {
    tables.add(match[1].toLowerCase());
  }

  // UPDATE table
  const updatePattern = /\bUPDATE\s+([a-zA-Z_]\w*)/gi;
  while ((match = updatePattern.exec(cleaned)) !== null) {
    tables.add(match[1].toLowerCase());
  }

  // DELETE FROM table
  const deletePattern = /\bDELETE\s+FROM\s+([a-zA-Z_]\w*)/gi;
  while ((match = deletePattern.exec(cleaned)) !== null) {
    tables.add(match[1].toLowerCase());
  }

  return tables;
}

/**
 * Count the number of JOIN clauses in the SQL.
 */
function countJoins(sql) {
  const cleaned = stripCommentsAndStrings(sql);
  const matches = cleaned.match(/\bJOIN\b/gi);
  return matches ? matches.length : 0;
}

/**
 * Count subquery depth (nested SELECT statements).
 */
function countSubqueryDepth(sql) {
  const cleaned = stripCommentsAndStrings(sql);
  // Count by tracking parenthesized SELECTs
  let maxDepth = 0;
  let currentDepth = 0;
  const tokens = cleaned.split(/(\(|\))/);

  for (const token of tokens) {
    if (token === '(') {
      // Check if next meaningful token is SELECT
      currentDepth++;
    } else if (token === ')') {
      currentDepth = Math.max(0, currentDepth - 1);
    } else if (/\bSELECT\b/i.test(token) && currentDepth > 0) {
      maxDepth = Math.max(maxDepth, currentDepth);
    }
  }

  return maxDepth;
}

/**
 * Check if query lacks a WHERE clause (potential full table scan).
 */
function lacksWhereClause(sql) {
  const cleaned = stripCommentsAndStrings(sql);
  // Simple heuristic: has FROM but no WHERE, and no aggregation without GROUP BY
  const hasFrom = /\bFROM\b/i.test(cleaned);
  const hasWhere = /\bWHERE\b/i.test(cleaned);
  const hasGroupBy = /\bGROUP\s+BY\b/i.test(cleaned);
  const hasLimit = /\bLIMIT\b/i.test(cleaned);
  const hasCount = /\bCOUNT\s*\(/i.test(cleaned);

  // Aggregations without WHERE are fine (e.g., SELECT COUNT(*) FROM users)
  if (hasCount && !hasFrom) return false;
  if (hasGroupBy || hasLimit) return false;

  return hasFrom && !hasWhere;
}

// ── Main validation ─────────────────────────────────────────────────────────

/**
 * Validate an SQL query against the permission tiers.
 *
 * @param {string}   sql           - The SQL query to validate
 * @param {string[]} allowedTables - List of table names the agent can access
 * @returns {ValidationResult}
 */
export function validateQuery(sql, allowedTables) {
  const trimmed = sql.trim();
  const cleaned = stripCommentsAndStrings(trimmed);
  const upperCleaned = cleaned.toUpperCase();
  const allowedSet = new Set(allowedTables.map(t => t.toLowerCase()));

  // ── TIER 3: BLOCKED — destructive statements ───────────────────────────

  // Check for multiple statements (SQL injection via semicolons)
  const statements = trimmed.split(';').filter(s => s.trim().length > 0);
  if (statements.length > 1) {
    return {
      allowed: false,
      needsConfirm: false,
      reason: 'BLOCKED: Multiple SQL statements detected. Only single SELECT queries are allowed.',
      tier: 'blocked',
      details: { statementCount: statements.length },
    };
  }

  // Must start with SELECT (after stripping whitespace and comments)
  const firstKeyword = cleaned.trim().split(/\s+/)[0]?.toUpperCase();
  if (firstKeyword !== 'SELECT') {
    return {
      allowed: false,
      needsConfirm: false,
      reason: `BLOCKED: Only SELECT statements are allowed. Found: ${firstKeyword || 'empty query'}`,
      tier: 'blocked',
      details: { foundKeyword: firstKeyword },
    };
  }

  // Block destructive keywords anywhere in the query
  const destructivePatterns = [
    { pattern: /\bINSERT\b/i, name: 'INSERT' },
    { pattern: /\bUPDATE\b/i, name: 'UPDATE' },
    { pattern: /\bDELETE\b/i, name: 'DELETE' },
    { pattern: /\bDROP\b/i, name: 'DROP' },
    { pattern: /\bALTER\b/i, name: 'ALTER' },
    { pattern: /\bCREATE\b/i, name: 'CREATE' },
    { pattern: /\bTRUNCATE\b/i, name: 'TRUNCATE' },
    { pattern: /\bREPLACE\b/i, name: 'REPLACE' },
    { pattern: /\bEXEC\b/i, name: 'EXEC' },
    { pattern: /\bATTACH\b/i, name: 'ATTACH' },
    { pattern: /\bDETACH\b/i, name: 'DETACH' },
    { pattern: /\bPRAGMA\b/i, name: 'PRAGMA' },
    { pattern: /\bGRANT\b/i, name: 'GRANT' },
    { pattern: /\bREVOKE\b/i, name: 'REVOKE' },
  ];

  for (const { pattern, name } of destructivePatterns) {
    if (pattern.test(cleaned)) {
      return {
        allowed: false,
        needsConfirm: false,
        reason: `BLOCKED: Destructive keyword "${name}" detected. Only pure SELECT queries are allowed.`,
        tier: 'blocked',
        details: { blockedKeyword: name },
      };
    }
  }

  // Block information_schema and sqlite_master access
  const metadataPatterns = [
    /\binformation_schema\b/i,
    /\bsqlite_master\b/i,
    /\bsqlite_schema\b/i,
    /\bsqlite_temp_master\b/i,
    /\bpg_catalog\b/i,
    /\bpg_tables\b/i,
  ];

  for (const pattern of metadataPatterns) {
    if (pattern.test(cleaned)) {
      return {
        allowed: false,
        needsConfirm: false,
        reason: 'BLOCKED: Access to database metadata tables is not allowed.',
        tier: 'blocked',
        details: { pattern: pattern.source },
      };
    }
  }

  // Block LOAD_EXTENSION and other dangerous SQLite functions
  if (/\bload_extension\b/i.test(cleaned)) {
    return {
      allowed: false,
      needsConfirm: false,
      reason: 'BLOCKED: load_extension is not allowed.',
      tier: 'blocked',
      details: {},
    };
  }

  // ── TIER 3: BLOCKED — unauthorized tables ──────────────────────────────

  const referencedTables = extractTableNames(trimmed);
  const unauthorizedTables = [];
  for (const table of referencedTables) {
    if (!allowedSet.has(table)) {
      unauthorizedTables.push(table);
    }
  }

  if (unauthorizedTables.length > 0) {
    return {
      allowed: false,
      needsConfirm: false,
      reason: `BLOCKED: Query references unauthorized table(s): ${unauthorizedTables.join(', ')}. Allowed tables: ${allowedTables.join(', ')}`,
      tier: 'blocked',
      details: { unauthorizedTables, referencedTables: [...referencedTables] },
    };
  }

  // ── TIER 3: BLOCKED — dangerous subquery depth ────────────────────────

  const subqueryDepth = countSubqueryDepth(trimmed);
  if (subqueryDepth > 2) {
    return {
      allowed: false,
      needsConfirm: false,
      reason: `BLOCKED: Subquery nesting depth ${subqueryDepth} exceeds maximum of 2. This pattern can be used for data exfiltration.`,
      tier: 'blocked',
      details: { subqueryDepth },
    };
  }

  // ── TIER 3: BLOCKED — UNION with suspicious patterns ──────────────────

  if (/\bUNION\b/i.test(cleaned)) {
    // UNION is allowed but only between allowed tables — already checked above
    // Extra check: UNION ALL with constants (common injection pattern)
    if (/\bUNION\b\s+(?:ALL\s+)?SELECT\s+\d/i.test(cleaned) ||
        /\bUNION\b\s+(?:ALL\s+)?SELECT\s+'/i.test(trimmed)) {
      return {
        allowed: false,
        needsConfirm: false,
        reason: 'BLOCKED: UNION with constant values detected — potential SQL injection pattern.',
        tier: 'blocked',
        details: {},
      };
    }
  }

  // ── TIER 2: CONFIRM — expensive queries ───────────────────────────────

  const joinCount = countJoins(trimmed);
  const noWhere = lacksWhereClause(trimmed);

  const warnings = [];

  if (joinCount > 3) {
    warnings.push(`Query has ${joinCount} JOINs (threshold: 3). This may be slow on large datasets.`);
  }

  if (noWhere && referencedTables.size > 0) {
    warnings.push('Query has no WHERE clause — may cause a full table scan.');
  }

  if (warnings.length > 0) {
    return {
      allowed: true,
      needsConfirm: true,
      reason: `CONFIRM REQUIRED: ${warnings.join(' ')}`,
      tier: 'confirm',
      details: { joinCount, noWhere, warnings, referencedTables: [...referencedTables] },
    };
  }

  // ── TIER 1: ALLOWED ───────────────────────────────────────────────────

  return {
    allowed: true,
    needsConfirm: false,
    reason: 'Query is allowed.',
    tier: 'allowed',
    details: { referencedTables: [...referencedTables], joinCount, subqueryDepth },
  };
}

/**
 * Estimate query cost using SQLite's EXPLAIN QUERY PLAN.
 * Returns an object with scan type info and estimated cost level.
 */
export function estimateQueryCost(db, sql) {
  try {
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all();
    const planText = plan.map(r => r.detail).join('\n');

    const hasFullScan = planText.includes('SCAN');
    const usesIndex = planText.includes('USING INDEX') || planText.includes('USING COVERING INDEX');

    let costLevel = 'low';
    if (hasFullScan && !usesIndex) costLevel = 'medium';
    if (hasFullScan && planText.split('SCAN').length > 2) costLevel = 'high';

    return { plan: planText, costLevel, hasFullScan, usesIndex };
  } catch {
    return { plan: 'Unable to estimate', costLevel: 'unknown', hasFullScan: false, usesIndex: false };
  }
}
