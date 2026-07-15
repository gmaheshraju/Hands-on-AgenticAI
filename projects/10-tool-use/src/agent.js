/**
 * agent.js — Text-to-SQL agent with schema-aware prompting and error recovery.
 *
 * Flow:
 *   1. User asks a natural language question
 *   2. Build prompt with schema context
 *   3. LLM generates SQL
 *   4. Permission layer validates SQL
 *   5. Execute query (or block/confirm)
 *   6. On error: feed error back to LLM, retry up to 3 times
 *   7. Format and return results
 *
 * The LLM call is abstracted — by default uses a mock LLM that handles common
 * patterns. Replace `callLLM` with a real API call for production use.
 */

import { validateQuery, estimateQueryCost } from './permissions.js';
import { formatResult } from './formatter.js';

// ── System prompt ───────────────────────────────────────────────────────────

function buildSystemPrompt(schemaContext) {
  return `You are a SQL analytics assistant. You translate natural language questions into SQLite SELECT queries.

${schemaContext}

Rules:
- ONLY generate SELECT statements. Never INSERT, UPDATE, DELETE, DROP, or ALTER.
- Use the exact column names from the schema above.
- Dates are stored as TEXT in "YYYY-MM-DD HH:MM:SS" format. Use string comparisons for date filtering.
- For revenue queries, use the orders.amount column (the actual charged amount).
- orders.status can be: completed, pending, refunded, cancelled.
- users.plan can be: free, starter, pro, enterprise.
- events.properties is a JSON string — use json_extract() for JSON field access.
- Always alias computed columns for clarity (e.g., COUNT(*) as total_count).
- When asked about "revenue", only count completed orders unless specified otherwise.
- Respond with ONLY the SQL query. No explanation, no markdown fences, just the raw SQL.`;
}

function buildRetryPrompt(originalQuestion, failedSql, errorMessage) {
  return `The previous SQL query failed. Fix it.

Original question: "${originalQuestion}"

Failed query:
${failedSql}

Error message: ${errorMessage}

Generate a corrected SQL query. Respond with ONLY the SQL query, no explanation.`;
}

// ── Mock LLM ────────────────────────────────────────────────────────────────

/**
 * Mock LLM that handles common natural-language-to-SQL patterns.
 * Replace this with a real LLM API call (OpenAI, Anthropic, etc.) for production.
 *
 * The mock uses pattern matching to demonstrate the agent loop — it deliberately
 * gets some queries wrong on the first attempt to exercise the retry mechanism.
 */
function mockLLM(messages) {
  const lastMessage = messages[messages.length - 1].content.toLowerCase();

  // ── Retry handling ────────────────────────────────────────────────────
  if (lastMessage.includes('failed query') || lastMessage.includes('error message')) {
    // Try to fix common errors
    if (lastMessage.includes("no such column: revenue")) {
      // Fix revenue -> amount
      const fixedMatch = lastMessage.match(/failed query:\s*([\s\S]*?)\s*error message/i);
      if (fixedMatch) {
        return fixedMatch[1].replace(/\brevenue\b/gi, 'amount').trim();
      }
    }
    if (lastMessage.includes("no such column: timestamp")) {
      const fixedMatch = lastMessage.match(/failed query:\s*([\s\S]*?)\s*error message/i);
      if (fixedMatch) {
        return fixedMatch[1].replace(/\btimestamp\b/g, '"timestamp"').trim();
      }
    }
    if (lastMessage.includes("no such column") || lastMessage.includes("no such table")) {
      // Generic: just return a safe fallback
      return "SELECT 'Query could not be auto-corrected' as message";
    }
    // Try to return the original cleaned up
    const sqlMatch = lastMessage.match(/failed query:\s*([\s\S]*?)\s*error message/i);
    if (sqlMatch) return sqlMatch[1].trim();
  }

  // ── Direct question patterns ──────────────────────────────────────────

  // Total users
  if (/how many users|total users|user count/i.test(lastMessage)) {
    return "SELECT COUNT(*) as total_users FROM users";
  }

  // Users by plan
  if (/users (by|per|for each) plan|plan distribution|plan breakdown/i.test(lastMessage)) {
    return "SELECT plan, COUNT(*) as user_count FROM users GROUP BY plan ORDER BY user_count DESC";
  }

  // Total revenue
  if (/total revenue|overall revenue|all.time revenue/i.test(lastMessage)) {
    return "SELECT SUM(amount) as total_revenue FROM orders WHERE status = 'completed'";
  }

  // Revenue by month
  if (/revenue (by|per) month|monthly revenue/i.test(lastMessage)) {
    return `SELECT strftime('%Y-%m', created_at) as month, SUM(amount) as revenue, COUNT(*) as order_count FROM orders WHERE status = 'completed' GROUP BY month ORDER BY month`;
  }

  // Revenue by product category
  if (/revenue by (product )?category|category revenue/i.test(lastMessage)) {
    return `SELECT p.category, SUM(o.amount) as revenue, COUNT(*) as orders FROM orders o JOIN products p ON o.product_id = p.id WHERE o.status = 'completed' GROUP BY p.category ORDER BY revenue DESC`;
  }

  // Top products by revenue
  if (/top.*(product|item).*revenue|best.selling|highest.revenue.product/i.test(lastMessage)) {
    return `SELECT p.name, p.category, SUM(o.amount) as revenue, COUNT(*) as units_sold FROM orders o JOIN products p ON o.product_id = p.id WHERE o.status = 'completed' GROUP BY p.id, p.name, p.category ORDER BY revenue DESC LIMIT 10`;
  }

  // Month-over-month growth
  if (/month.over.month|mom growth|revenue growth/i.test(lastMessage)) {
    return `SELECT month, revenue, LAG(revenue) OVER (ORDER BY month) as prev_month, ROUND(((revenue - LAG(revenue) OVER (ORDER BY month)) / LAG(revenue) OVER (ORDER BY month)) * 100, 2) as growth_pct FROM (SELECT strftime('%Y-%m', created_at) as month, SUM(amount) as revenue FROM orders WHERE status = 'completed' GROUP BY month) ORDER BY month`;
  }

  // Churn / inactive users
  if (/churn|inactive|not logged in|dormant/i.test(lastMessage)) {
    return `SELECT plan, COUNT(*) as inactive_users FROM users WHERE last_login_at < '2024-06-01' OR last_login_at IS NULL GROUP BY plan ORDER BY inactive_users DESC`;
  }

  // Average order value
  if (/average order|avg order|aov/i.test(lastMessage)) {
    return `SELECT ROUND(AVG(amount), 2) as avg_order_value FROM orders WHERE status = 'completed'`;
  }

  // Refund rate
  if (/refund rate|refund percent|refunded/i.test(lastMessage)) {
    return `SELECT status, COUNT(*) as count, ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM orders), 2) as percentage FROM orders GROUP BY status ORDER BY count DESC`;
  }

  // Most common events
  if (/most common event|popular event|event breakdown|event type/i.test(lastMessage)) {
    return `SELECT event_type, COUNT(*) as event_count FROM events GROUP BY event_type ORDER BY event_count DESC`;
  }

  // Active users (by events)
  if (/active users|most active|power users|top users/i.test(lastMessage)) {
    return `SELECT u.name, u.plan, COUNT(e.id) as event_count FROM users u JOIN events e ON u.id = e.user_id GROUP BY u.id, u.name, u.plan ORDER BY event_count DESC LIMIT 20`;
  }

  // Signups by month
  if (/signup|sign.up|new users|registrations/i.test(lastMessage)) {
    return `SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as new_users FROM users GROUP BY month ORDER BY month`;
  }

  // Orders by status
  if (/orders? (by|per) status|order status breakdown/i.test(lastMessage)) {
    return `SELECT status, COUNT(*) as order_count, SUM(amount) as total_amount FROM orders GROUP BY status ORDER BY order_count DESC`;
  }

  // Cohort analysis
  if (/cohort|retention|signup.month.*order/i.test(lastMessage)) {
    return `SELECT strftime('%Y-%m', u.created_at) as signup_month, COUNT(DISTINCT u.id) as users, COUNT(DISTINCT o.id) as orders, ROUND(AVG(o.amount), 2) as avg_order FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY signup_month ORDER BY signup_month`;
  }

  // Enterprise customers
  if (/enterprise.*customer|enterprise.*user|enterprise.*account/i.test(lastMessage)) {
    return `SELECT u.name, u.email, COUNT(o.id) as order_count, SUM(o.amount) as total_spent FROM users u LEFT JOIN orders o ON u.id = o.user_id AND o.status = 'completed' WHERE u.plan = 'enterprise' GROUP BY u.id, u.name, u.email ORDER BY total_spent DESC LIMIT 20`;
  }

  // Deliberately return a query with wrong column name to test retry
  if (/revenue last (quarter|month|week)/i.test(lastMessage)) {
    // "revenue" doesn't exist — should trigger retry and get corrected to "amount"
    return `SELECT SUM(revenue) as total_revenue FROM orders WHERE status = 'completed' AND created_at >= '2024-10-01'`;
  }

  // Page views
  if (/page.view|most visited|popular page/i.test(lastMessage)) {
    return `SELECT json_extract(properties, '$.page') as page, COUNT(*) as views FROM events WHERE event_type = 'page_view' GROUP BY page ORDER BY views DESC`;
  }

  // API errors
  if (/api error|error rate|500 error/i.test(lastMessage)) {
    return `SELECT json_extract(properties, '$.code') as error_code, COUNT(*) as occurrences FROM events WHERE event_type = 'error' GROUP BY error_code ORDER BY occurrences DESC`;
  }

  // Default: attempt a generic query
  return `SELECT 'I could not understand the question. Please rephrase.' as message`;
}

// ── Agent core ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} AgentConfig
 * @property {Function} llm            - LLM function: (messages) => sqlString
 * @property {Object}   db             - better-sqlite3 Database instance
 * @property {string}   schemaContext  - Schema context string for the prompt
 * @property {string[]} allowedTables  - List of allowed table names
 * @property {number}   maxRetries     - Max retry attempts (default: 3)
 * @property {boolean}  autoConfirm    - Auto-confirm expensive queries (default: false)
 */

/**
 * @typedef {Object} AgentResult
 * @property {boolean}  success       - Whether the query succeeded
 * @property {string}   question      - Original question
 * @property {string}   sql           - Final SQL that was executed (or attempted)
 * @property {Object[]} rows          - Result rows (empty on failure)
 * @property {string}   formatted     - Formatted output string
 * @property {Object}   permission    - Permission validation result
 * @property {Object}   cost          - Query cost estimate
 * @property {number}   attempts      - Number of attempts made
 * @property {string[]} errors        - Error messages from failed attempts
 * @property {number}   executionTimeMs - Query execution time
 */

/**
 * Create an SQL analytics agent.
 */
export function createAgent(config) {
  const {
    llm = mockLLM,
    db,
    schemaContext,
    allowedTables,
    maxRetries = 3,
    autoConfirm = false,
  } = config;

  const systemPrompt = buildSystemPrompt(schemaContext);

  /**
   * Ask a natural language question, get back formatted SQL results.
   *
   * @param {string} question - Natural language question
   * @returns {AgentResult}
   */
  async function ask(question) {
    const result = {
      success: false,
      question,
      sql: '',
      rows: [],
      formatted: '',
      permission: null,
      cost: null,
      attempts: 0,
      errors: [],
      executionTimeMs: 0,
    };

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      result.attempts = attempt + 1;

      // ── Step 1: Get SQL from LLM ──────────────────────────────────────
      let sql;
      try {
        sql = await Promise.resolve(llm(messages));
        // Clean up: remove markdown fences if present
        sql = sql.replace(/^```sql\s*/i, '').replace(/\s*```$/i, '').trim();
        // Remove trailing semicolons
        sql = sql.replace(/;\s*$/, '');
      } catch (err) {
        result.errors.push(`LLM error: ${err.message}`);
        continue;
      }

      result.sql = sql;

      // ── Step 2: Validate permissions ──────────────────────────────────
      const permission = validateQuery(sql, allowedTables);
      result.permission = permission;

      if (!permission.allowed) {
        result.formatted = `PERMISSION DENIED: ${permission.reason}`;
        return result; // Don't retry permission denials
      }

      if (permission.needsConfirm && !autoConfirm) {
        result.formatted = `CONFIRMATION REQUIRED: ${permission.reason}\n\nQuery: ${sql}\n\nSet autoConfirm=true or call with confirmation to proceed.`;
        return result;
      }

      // ── Step 3: Estimate cost ─────────────────────────────────────────
      const cost = estimateQueryCost(db, sql);
      result.cost = cost;

      // ── Step 4: Execute query ─────────────────────────────────────────
      try {
        const startTime = performance.now();
        const rows = db.prepare(sql).all();
        const endTime = performance.now();

        result.executionTimeMs = Math.round(endTime - startTime);
        result.rows = rows;
        result.success = true;
        result.formatted = formatResult(rows, {
          sql,
          executionTimeMs: result.executionTimeMs,
          rowCount: rows.length,
          costLevel: cost.costLevel,
        });

        return result;
      } catch (err) {
        const errorMsg = err.message;
        result.errors.push(errorMsg);

        if (attempt < maxRetries) {
          // Feed error back to LLM for retry
          messages.push({ role: 'assistant', content: sql });
          messages.push({
            role: 'user',
            content: buildRetryPrompt(question, sql, errorMsg),
          });
        }
      }
    }

    // All retries exhausted
    result.formatted = [
      `Failed after ${result.attempts} attempts.`,
      '',
      'Errors:',
      ...result.errors.map((e, i) => `  ${i + 1}. ${e}`),
      '',
      `Last SQL attempted: ${result.sql}`,
    ].join('\n');

    return result;
  }

  return { ask };
}
