/**
 * agent.js — Agent that uses MCP tools to answer natural language questions
 *
 * Demonstrates the "agent loop" pattern:
 *   1. User asks a question in natural language
 *   2. Agent plans which MCP tools to call
 *   3. Agent calls tools, collects results
 *   4. Agent synthesizes a final answer
 *
 * Uses a rule-based planner (no LLM required) to keep this self-contained.
 * In production, you'd replace the planner with an LLM call (Claude, GPT, etc.)
 * that generates tool calls from the conversation.
 *
 * The MCP layer is identical — the protocol doesn't care what drives the tool calls.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createInterface } from "readline";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Colors ─────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold:  "\x1b[1m",
  dim:   "\x1b[2m",
  cyan:  "\x1b[36m",
  green: "\x1b[32m",
  yellow:"\x1b[33m",
  blue:  "\x1b[34m",
  red:   "\x1b[31m",
};

// ── Rule-based planner ─────────────────────────────────────
// Maps natural language patterns to MCP tool call sequences.
// In a real system, an LLM would generate these tool calls.

function planToolCalls(question) {
  const q = question.toLowerCase();

  // Table/schema questions
  if (q.includes("what tables") || q.includes("list tables") || q.includes("show tables") || q.includes("database structure")) {
    return [{ tool: "list_tables", args: {}, reason: "Listing all tables to see the database structure" }];
  }

  if (q.match(/describe|columns|schema|structure/) && q.match(/(\w+)\s*table/)) {
    const match = q.match(/(\w+)\s*table/);
    return [{ tool: "describe_table", args: { table_name: match[1] }, reason: `Describing the ${match[1]} table` }];
  }

  // Top customers / spending questions
  if (q.includes("top") && (q.includes("customer") || q.includes("spender") || q.includes("buyer"))) {
    const limitMatch = q.match(/top\s+(\d+)/);
    const limit = limitMatch ? parseInt(limitMatch[1]) : 5;
    return [{
      tool: "query",
      args: {
        sql: `SELECT u.name, u.email, u.city, COUNT(o.id) as order_count, SUM(o.total_cents)/100.0 as total_spent_rupees FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.id ORDER BY total_spent_rupees DESC LIMIT ${limit}`,
      },
      reason: `Finding top ${limit} customers by total spending`,
    }];
  }

  // Product / category questions
  if (q.includes("popular") && q.includes("product")) {
    return [{
      tool: "query",
      args: {
        sql: "SELECT p.name, c.name as category, COUNT(oi.id) as times_ordered, SUM(oi.quantity) as total_qty FROM products p JOIN order_items oi ON p.id = oi.product_id JOIN categories c ON p.category_id = c.id GROUP BY p.id ORDER BY total_qty DESC LIMIT 10",
      },
      reason: "Finding most popular products by quantity ordered",
    }];
  }

  if (q.includes("category") && (q.includes("revenue") || q.includes("sales") || q.includes("breakdown"))) {
    return [{
      tool: "query",
      args: {
        sql: "SELECT c.name as category, COUNT(DISTINCT o.id) as orders, SUM(oi.quantity * oi.unit_price)/100.0 as revenue_rupees FROM categories c JOIN products p ON c.id = p.category_id JOIN order_items oi ON p.id = oi.product_id JOIN orders o ON oi.order_id = o.id GROUP BY c.id ORDER BY revenue_rupees DESC",
      },
      reason: "Getting revenue breakdown by category",
    }];
  }

  // Order status
  if (q.includes("order") && q.includes("status")) {
    return [{
      tool: "query",
      args: {
        sql: "SELECT status, COUNT(*) as count, SUM(total_cents)/100.0 as total_rupees, ROUND(AVG(total_cents)/100.0, 2) as avg_order_rupees FROM orders GROUP BY status ORDER BY count DESC",
      },
      reason: "Getting order count and value by status",
    }];
  }

  // Revenue / total sales
  if (q.includes("revenue") || q.includes("total sales") || q.includes("how much")) {
    return [{
      tool: "query",
      args: {
        sql: "SELECT COUNT(*) as total_orders, SUM(total_cents)/100.0 as total_revenue_rupees, ROUND(AVG(total_cents)/100.0, 2) as avg_order_rupees, MIN(total_cents)/100.0 as min_order, MAX(total_cents)/100.0 as max_order FROM orders WHERE status != 'cancelled'",
      },
      reason: "Calculating total revenue from non-cancelled orders",
    }];
  }

  // City-based questions
  if (q.includes("city") || q.includes("cities") || q.includes("where") && q.includes("customer")) {
    return [{
      tool: "query",
      args: {
        sql: "SELECT u.city, COUNT(DISTINCT u.id) as customers, COUNT(o.id) as orders, SUM(o.total_cents)/100.0 as total_rupees FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.city ORDER BY total_rupees DESC",
      },
      reason: "Analyzing customer distribution and spending by city",
    }];
  }

  // Stats / overview
  if (q.includes("overview") || q.includes("stats") || q.includes("summary") || q.includes("how many")) {
    return [
      { tool: "list_tables", args: {}, reason: "Getting table overview" },
      {
        tool: "query",
        args: {
          sql: "SELECT (SELECT COUNT(*) FROM users) as users, (SELECT COUNT(*) FROM products) as products, (SELECT COUNT(*) FROM orders) as orders, (SELECT COUNT(*) FROM order_items) as order_items, (SELECT SUM(total_cents)/100.0 FROM orders WHERE status != 'cancelled') as total_revenue_rupees",
        },
        reason: "Getting aggregate statistics",
      },
    ];
  }

  // Recent orders
  if (q.includes("recent") && q.includes("order")) {
    return [{
      tool: "query",
      args: {
        sql: "SELECT o.id, u.name as customer, o.status, o.total_cents/100.0 as total_rupees, o.created_at FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC LIMIT 10",
      },
      reason: "Getting the 10 most recent orders",
    }];
  }

  // Fallback: try to build a query from the question, or explore tables
  if (q.includes("user") || q.includes("customer")) {
    return [{ tool: "describe_table", args: { table_name: "users" }, reason: "Exploring the users table to answer the question" }];
  }
  if (q.includes("product")) {
    return [{ tool: "describe_table", args: { table_name: "products" }, reason: "Exploring the products table" }];
  }
  if (q.includes("order")) {
    return [{ tool: "describe_table", args: { table_name: "orders" }, reason: "Exploring the orders table" }];
  }

  // Ultimate fallback
  return [{ tool: "list_tables", args: {}, reason: "Starting with a table overview to understand the database" }];
}

function synthesizeAnswer(question, results) {
  const parts = [`\n${C.green}${C.bold}Answer:${C.reset}\n`];

  for (const r of results) {
    if (r.error) {
      parts.push(`  Error from ${r.tool}: ${r.error}`);
      continue;
    }

    try {
      const data = JSON.parse(r.content);

      if (data.rows && Array.isArray(data.rows)) {
        if (data.rows.length === 0) {
          parts.push("  No results found.");
        } else {
          // Format as a simple table
          const keys = Object.keys(data.rows[0]);
          const header = keys.map(k => k.padEnd(20)).join(" | ");
          parts.push(`  ${header}`);
          parts.push(`  ${"-".repeat(header.length)}`);
          for (const row of data.rows) {
            const line = keys.map(k => String(row[k] ?? "").padEnd(20)).join(" | ");
            parts.push(`  ${line}`);
          }
          parts.push(`\n  (${data.rowCount} row${data.rowCount !== 1 ? "s" : ""})`);
        }
      } else if (Array.isArray(data)) {
        // list_tables result
        parts.push("  Tables in database:");
        for (const t of data) {
          parts.push(`    - ${t.name} (${t.rowCount} rows)`);
        }
      } else {
        parts.push(`  ${JSON.stringify(data, null, 2)}`);
      }
    } catch {
      parts.push(`  ${r.content}`);
    }
  }

  return parts.join("\n");
}

// ── Agent loop ─────────────────────────────────────────────

async function runAgent() {
  // Connect to MCP server
  const serverPath = path.join(__dirname, "server.js");
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
  });

  const client = new Client({
    name: "mcp-agent",
    version: "1.0.0",
  });

  await client.connect(transport);

  console.log(`${C.bold}=== MCP Agent Mode ===${C.reset}`);
  console.log("Ask natural language questions about the e-commerce database.");
  console.log("The agent will use MCP tools to find answers.\n");

  // Show available tools
  const { tools } = await client.listTools();
  console.log(`${C.dim}Connected to MCP server with ${tools.length} tools:${C.reset}`);
  for (const t of tools) {
    console.log(`${C.dim}  - ${t.name}: ${t.description}${C.reset}`);
  }

  console.log(`\n${C.dim}Example questions:${C.reset}`);
  console.log(`${C.dim}  "Who are the top 5 customers?"${C.reset}`);
  console.log(`${C.dim}  "What's the revenue breakdown by category?"${C.reset}`);
  console.log(`${C.dim}  "Show me the order status distribution"${C.reset}`);
  console.log(`${C.dim}  "What are the most popular products?"${C.reset}`);
  console.log(`${C.dim}  "Give me a database overview"${C.reset}`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => new Promise(resolve => rl.question(`\n${C.bold}question>${C.reset} `, resolve));

  while (true) {
    const question = await prompt();
    if (!question.trim()) continue;
    if (["quit", "exit", "q"].includes(question.trim().toLowerCase())) break;

    // Step 1: Plan
    console.log(`\n${C.blue}${C.bold}[Planning]${C.reset} Analyzing question...`);
    const plan = planToolCalls(question);

    console.log(`${C.blue}[Plan]${C.reset} Will execute ${plan.length} tool call(s):`);
    for (const step of plan) {
      console.log(`  ${C.cyan}-> ${step.tool}${C.reset}: ${step.reason}`);
    }

    // Step 2: Execute tool calls
    const results = [];
    for (const step of plan) {
      console.log(`\n${C.yellow}[Executing]${C.reset} ${step.tool}(${JSON.stringify(step.args)})`);

      try {
        const result = await client.callTool({
          name: step.tool,
          arguments: step.args,
        });

        const text = result.content?.[0]?.text || "";
        results.push({ tool: step.tool, content: text, error: result.isError ? text : null });

        if (result.isError) {
          console.log(`${C.red}[Error]${C.reset} ${text}`);
        } else {
          const parsed = JSON.parse(text);
          const rowCount = parsed.rowCount ?? (Array.isArray(parsed) ? parsed.length : 1);
          console.log(`${C.green}[OK]${C.reset} Got ${rowCount} result(s)`);
        }
      } catch (err) {
        console.log(`${C.red}[Error]${C.reset} ${err.message}`);
        results.push({ tool: step.tool, content: "", error: err.message });
      }
    }

    // Step 3: Synthesize answer
    console.log(synthesizeAnswer(question, results));
  }

  console.log("\nDisconnecting...");
  rl.close();
  await client.close();
  process.exit(0);
}

// ── Main ───────────────────────────────────────────────────

runAgent().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
