/**
 * demo.js — 10 sample analytics questions + 5 injection attempts.
 *
 * Demonstrates the full agent pipeline:
 *   - Schema-aware SQL generation (mock LLM)
 *   - Permission enforcement in code
 *   - Error recovery with retry loop
 *   - Output formatting
 *
 * Run: node src/demo.js
 */

import { openDatabase, getSchemaContext, getAllowedTables } from './database.js';
import { createAgent } from './agent.js';
import { validateQuery } from './permissions.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function divider(title) {
  const line = '='.repeat(70);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

function subDivider(num, title) {
  console.log(`\n--- [${num}] ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('SQL Analytics Agent — Demo\n');

  // ── Setup ───────────────────────────────────────────────────────────────
  const db = openDatabase();
  const schemaContext = getSchemaContext(db);
  const allowedTables = getAllowedTables();

  const agent = createAgent({
    db,
    schemaContext,
    allowedTables,
    autoConfirm: true,  // Auto-confirm expensive queries for demo
  });

  // ── Quick DB stats ──────────────────────────────────────────────────────
  divider('DATABASE STATS');
  for (const table of allowedTables) {
    const count = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c;
    console.log(`  ${table}: ${count.toLocaleString()} rows`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PART 1: 10 ANALYTICS QUESTIONS
  // ═══════════════════════════════════════════════════════════════════════

  divider('PART 1: ANALYTICS QUESTIONS (10)');

  const questions = [
    // Simple scalar
    'How many users do we have?',
    // Grouped aggregation
    'Show me users by plan',
    // Revenue with filter
    'What is our total revenue?',
    // Time series
    'Show monthly revenue',
    // Join query
    'What are our top products by revenue?',
    // Complex: month-over-month
    'Show month-over-month revenue growth',
    // JSON extraction
    'What are the most common events?',
    // Multi-table join with grouping
    'Who are our most active users?',
    // Error recovery test: uses wrong column name on first try
    'What was our revenue last quarter?',
    // Cohort analysis
    'Show cohort analysis by signup month',
  ];

  let passCount = 0;
  let failCount = 0;

  for (let i = 0; i < questions.length; i++) {
    subDivider(i + 1, questions[i]);

    const result = await agent.ask(questions[i]);

    console.log(`  Status:   ${result.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`  Attempts: ${result.attempts}`);
    if (result.errors.length > 0) {
      console.log(`  Retries:  ${result.errors.length} error(s) recovered`);
      for (const err of result.errors) {
        console.log(`    -> ${err}`);
      }
    }
    console.log(`  SQL:      ${result.sql}`);
    console.log('');
    console.log(result.formatted);

    if (result.success) passCount++;
    else failCount++;
  }

  console.log(`\n  Results: ${passCount} passed, ${failCount} failed out of ${questions.length}`);

  // ═══════════════════════════════════════════════════════════════════════
  // PART 2: 5 INJECTION ATTEMPTS
  // ═══════════════════════════════════════════════════════════════════════

  divider('PART 2: INJECTION ATTEMPTS (5)');
  console.log('  Testing permission layer enforcement...\n');

  const injections = [
    {
      name: 'DROP TABLE via semicolon',
      sql: "SELECT 1; DROP TABLE users;",
    },
    {
      name: 'INSERT disguised as analytics',
      sql: "INSERT INTO users (name, email, plan, created_at) VALUES ('hacker', 'h@h.com', 'enterprise', '2024-01-01')",
    },
    {
      name: 'information_schema probe',
      sql: "SELECT * FROM information_schema.tables",
    },
    {
      name: 'UNION injection with constants',
      sql: "SELECT name FROM users UNION ALL SELECT 'admin_password_hash_here'",
    },
    {
      name: 'Unauthorized table access',
      sql: "SELECT * FROM admin_credentials WHERE role = 'admin'",
    },
  ];

  let blockedCount = 0;

  for (let i = 0; i < injections.length; i++) {
    const inj = injections[i];
    subDivider(i + 1, `INJECTION: ${inj.name}`);

    const result = validateQuery(inj.sql, allowedTables);

    console.log(`  SQL:      ${inj.sql}`);
    console.log(`  Tier:     ${result.tier}`);
    console.log(`  Allowed:  ${result.allowed}`);
    console.log(`  Reason:   ${result.reason}`);

    if (!result.allowed) {
      blockedCount++;
      console.log('  RESULT:   BLOCKED (correct)');
    } else {
      console.log('  RESULT:   ALLOWED (SECURITY FAILURE!)');
    }
  }

  console.log(`\n  Blocked: ${blockedCount}/${injections.length} injection attempts`);
  if (blockedCount === injections.length) {
    console.log('  All injection attempts were correctly blocked.');
  } else {
    console.log('  WARNING: Some injection attempts were not blocked!');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PART 3: PERMISSION TIER DEMO
  // ═══════════════════════════════════════════════════════════════════════

  divider('PART 3: PERMISSION TIERS');

  const tierTests = [
    {
      name: 'TIER 1 — Allowed (simple SELECT with WHERE)',
      sql: "SELECT name, email FROM users WHERE plan = 'enterprise'",
    },
    {
      name: 'TIER 2 — Confirm (no WHERE clause, full scan)',
      sql: "SELECT * FROM orders",
    },
    {
      name: 'TIER 2 — Confirm (>3 JOINs)',
      sql: "SELECT u.name FROM users u JOIN orders o ON u.id = o.user_id JOIN products p ON o.product_id = p.id JOIN events e ON u.id = e.user_id JOIN orders o2 ON u.id = o2.user_id WHERE u.plan = 'pro'",
    },
    {
      name: 'TIER 3 — Blocked (UPDATE statement)',
      sql: "UPDATE users SET plan = 'enterprise' WHERE id = 1",
    },
    {
      name: 'TIER 3 — Blocked (deeply nested subquery)',
      sql: "SELECT * FROM users WHERE id IN (SELECT user_id FROM orders WHERE product_id IN (SELECT id FROM products WHERE category IN (SELECT DISTINCT category FROM products WHERE price > 100)))",
    },
    {
      name: 'TIER 3 — Blocked (PRAGMA)',
      sql: "PRAGMA table_info(users)",
    },
    {
      name: 'TIER 3 — Blocked (ATTACH database)',
      sql: "ATTACH DATABASE '/etc/passwd' AS pwn",
    },
  ];

  for (let i = 0; i < tierTests.length; i++) {
    const test = tierTests[i];
    subDivider(i + 1, test.name);

    const result = validateQuery(test.sql, allowedTables);

    console.log(`  SQL:      ${test.sql.slice(0, 80)}${test.sql.length > 80 ? '...' : ''}`);
    console.log(`  Tier:     ${result.tier}`);
    console.log(`  Allowed:  ${result.allowed}`);
    console.log(`  Confirm:  ${result.needsConfirm}`);
    console.log(`  Reason:   ${result.reason}`);

    // Run cost estimate for allowed queries
    if (result.allowed) {
      const cost = estimateQueryCost(db, test.sql);
      console.log(`  Cost:     ${cost.costLevel} (scan: ${cost.hasFullScan}, index: ${cost.usesIndex})`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════

  divider('SUMMARY');
  console.log(`  Analytics questions:  ${passCount}/${questions.length} succeeded`);
  console.log(`  Injection attempts:   ${blockedCount}/${injections.length} blocked`);
  console.log(`  Permission tiers:     All 3 tiers demonstrated`);
  console.log(`  Error recovery:       Retry loop exercised (question #9)`);
  console.log(`  Output formatting:    Tables, scalars, and metadata shown`);
  console.log('');

  db.close();
}

// We need estimateQueryCost for the tier demo
import { estimateQueryCost } from './permissions.js';

main().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
