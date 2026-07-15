/**
 * demo.js — Non-interactive demo of MCP server + client interaction
 *
 * Runs through a complete MCP session showing:
 *   1. Connection handshake
 *   2. Capability discovery (tools + resources)
 *   3. Tool calls with results
 *   4. Resource reads
 *   5. Protocol message log
 *
 * Run: node src/demo.js
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Colors ─────────────────────────────────────────────────

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  cyan:   "\x1b[36m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  blue:   "\x1b[34m",
  magenta:"\x1b[35m",
  red:    "\x1b[31m",
};

function banner(text) {
  const line = "=".repeat(60);
  console.log(`\n${C.bold}${C.cyan}${line}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ${text}${C.reset}`);
  console.log(`${C.bold}${C.cyan}${line}${C.reset}\n`);
}

function section(text) {
  console.log(`\n${C.bold}${C.blue}--- ${text} ---${C.reset}\n`);
}

function protocol(direction, method, payload) {
  const arrow = direction === "CLIENT" ? ">>>" : "<<<";
  const color = direction === "CLIENT" ? C.cyan : C.yellow;
  console.log(`${color}${arrow} ${direction}: ${method}${C.reset}`);
  if (payload) {
    const json = JSON.stringify(payload, null, 2);
    const lines = json.split("\n").map(l => `${C.dim}    ${l}${C.reset}`).join("\n");
    console.log(lines);
  }
  console.log();
}

function result(label, data) {
  console.log(`${C.green}${label}:${C.reset}`);
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch {}
  }
  console.log(JSON.stringify(data, null, 2));
  console.log();
}

// ── Demo steps ─────────────────────────────────────────────

async function demo() {
  banner("MCP (Model Context Protocol) Demo");

  console.log("This demo shows how MCP works under the hood:");
  console.log("  - JSON-RPC 2.0 messages over stdio transport");
  console.log("  - Server declares capabilities (tools + resources)");
  console.log("  - Client discovers and calls them");
  console.log("  - Same protocol used by Claude Code, Cursor, Windsurf, etc.\n");

  // ── Step 1: Connect ──────────────────────────────────────

  section("Step 1: Connection Handshake");

  console.log("The client spawns the server as a child process.");
  console.log("Communication happens over stdin/stdout (stdio transport).\n");

  protocol("CLIENT", "initialize", {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      clientInfo: { name: "mcp-demo-client", version: "1.0.0" },
      capabilities: {},
    },
  });

  const serverPath = path.join(__dirname, "server.js");
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
  });

  const client = new Client({
    name: "mcp-demo-client",
    version: "1.0.0",
  });

  await client.connect(transport);

  protocol("SERVER", "initialize (response)", {
    jsonrpc: "2.0",
    id: 1,
    result: {
      protocolVersion: "2024-11-05",
      serverInfo: { name: "sqlite-explorer", version: "1.0.0" },
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false },
      },
    },
  });

  protocol("CLIENT", "notifications/initialized", {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });

  console.log(`${C.green}[Connected]${C.reset} Handshake complete.\n`);

  // ── Step 2: Discover tools ───────────────────────────────

  section("Step 2: Tool Discovery");
  console.log("Client asks: 'What tools do you have?'\n");

  protocol("CLIENT", "tools/list", {
    jsonrpc: "2.0", id: 2, method: "tools/list", params: {},
  });

  const { tools } = await client.listTools();

  protocol("SERVER", "tools/list (response)", {
    jsonrpc: "2.0",
    id: 2,
    result: {
      tools: tools.map(t => ({
        name: t.name,
        description: t.description?.substring(0, 60) + "...",
        inputSchema: t.inputSchema,
      })),
    },
  });

  console.log(`Found ${tools.length} tools:`);
  for (const t of tools) {
    console.log(`  ${C.bold}${t.name}${C.reset} — ${t.description}`);
  }

  // ── Step 3: Discover resources ───────────────────────────

  section("Step 3: Resource Discovery");
  console.log("Client asks: 'What resources can I read?'\n");

  protocol("CLIENT", "resources/list", {
    jsonrpc: "2.0", id: 3, method: "resources/list", params: {},
  });

  const { resources } = await client.listResources();

  protocol("SERVER", "resources/list (response)", {
    jsonrpc: "2.0",
    id: 3,
    result: {
      resources: resources.map(r => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      })),
    },
  });

  console.log(`Found ${resources.length} resources:`);
  for (const r of resources) {
    console.log(`  ${C.bold}${r.uri}${C.reset} — ${r.description || r.name}`);
  }

  // ── Step 4: Call tools ───────────────────────────────────

  section("Step 4: Tool Calls");

  // 4a: list_tables
  console.log(`${C.bold}4a. Calling list_tables${C.reset}\n`);
  protocol("CLIENT", "tools/call", {
    jsonrpc: "2.0", id: 4, method: "tools/call",
    params: { name: "list_tables", arguments: {} },
  });

  const tablesResult = await client.callTool({ name: "list_tables", arguments: {} });
  const tablesData = JSON.parse(tablesResult.content[0].text);
  result("Tables", tablesData);

  // 4b: describe_table
  console.log(`${C.bold}4b. Calling describe_table for "products"${C.reset}\n`);
  const descResult = await client.callTool({
    name: "describe_table",
    arguments: { table_name: "products" },
  });
  const descData = JSON.parse(descResult.content[0].text);
  console.log(`Table: ${descData.table} (${descData.rowCount} rows)`);
  console.log("Columns:");
  for (const col of descData.columns) {
    const pk = col.primaryKey ? " [PK]" : "";
    console.log(`  ${col.name} ${C.dim}${col.type}${pk}${C.reset}`);
  }
  console.log(`\nSample rows: ${descData.sampleRows.length} shown\n`);

  // 4c: query
  console.log(`${C.bold}4c. Running a SQL query${C.reset}\n`);
  const sql = `
    SELECT c.name as category,
           COUNT(oi.id) as items_sold,
           SUM(oi.quantity * oi.unit_price)/100.0 as revenue
    FROM categories c
    JOIN products p ON c.id = p.category_id
    JOIN order_items oi ON p.id = oi.product_id
    GROUP BY c.id
    ORDER BY revenue DESC
  `.trim();

  protocol("CLIENT", "tools/call", {
    jsonrpc: "2.0", id: 5, method: "tools/call",
    params: { name: "query", arguments: { sql } },
  });

  const queryResult = await client.callTool({
    name: "query",
    arguments: { sql },
  });
  const queryData = JSON.parse(queryResult.content[0].text);

  console.log("Revenue by category:");
  for (const row of queryData.rows) {
    const bar = "█".repeat(Math.min(Math.round(row.revenue / 5000), 40));
    console.log(`  ${row.category.padEnd(15)} ${C.green}${bar}${C.reset} ₹${row.revenue.toLocaleString()}`);
  }
  console.log();

  // 4d: Error handling
  console.log(`${C.bold}4d. Error handling — attempting a write query${C.reset}\n`);
  const writeResult = await client.callTool({
    name: "query",
    arguments: { sql: "DELETE FROM users WHERE id = 1" },
  });
  const errorData = JSON.parse(writeResult.content[0].text);
  console.log(`${C.red}Server blocked it:${C.reset} ${errorData.error}\n`);

  // ── Step 5: Read resources ───────────────────────────────

  section("Step 5: Resource Reading");

  console.log(`${C.bold}5a. Reading db://stats${C.reset}\n`);
  protocol("CLIENT", "resources/read", {
    jsonrpc: "2.0", id: 6, method: "resources/read",
    params: { uri: "db://stats" },
  });

  const statsResult = await client.readResource({ uri: "db://stats" });
  const statsData = JSON.parse(statsResult.contents[0].text);
  result("Database Stats", statsData);

  console.log(`${C.bold}5b. Reading db://schema${C.reset}\n`);
  const schemaResult = await client.readResource({ uri: "db://schema" });
  const schemaData = JSON.parse(schemaResult.contents[0].text);
  console.log(`Schema has ${schemaData.tables.length} tables and ${schemaData.indexes.length} indexes.`);
  for (const t of schemaData.tables) {
    console.log(`  ${C.bold}${t.name}${C.reset}`);
  }

  // ── Summary ──────────────────────────────────────────────

  banner("Demo Complete");

  console.log("What you just saw:");
  console.log("  1. Client spawned server as child process (stdio transport)");
  console.log("  2. JSON-RPC handshake established protocol version + capabilities");
  console.log("  3. Client discovered 3 tools and 2 resources");
  console.log("  4. Client called tools with typed arguments, got structured results");
  console.log("  5. Client read resources by URI");
  console.log("  6. Server enforced safety (blocked write queries)");
  console.log();
  console.log(`${C.bold}Key insight:${C.reset} MCP is just JSON-RPC over a transport.`);
  console.log("The server declares what it can do, the client discovers and calls it.");
  console.log("This is the EXACT protocol Claude Code uses to connect to databases,");
  console.log("file systems, APIs, and other tools.\n");

  await client.close();
  process.exit(0);
}

// ── Main ───────────────────────────────────────────────────

demo().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
