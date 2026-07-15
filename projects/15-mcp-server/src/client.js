/**
 * client.js — MCP Client with interactive CLI
 *
 * Connects to the MCP server via stdio transport and provides:
 *   1. Discovery: list available tools and resources
 *   2. Tool calling: invoke tools interactively
 *   3. Resource reading: fetch resource contents
 *   4. Protocol inspection: shows raw JSON-RPC messages
 *
 * This demonstrates the CLIENT side of MCP — how Claude Code, Cursor,
 * and other AI tools connect to MCP servers.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createInterface } from "readline";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Protocol logger ────────────────────────────────────────
// Intercepts and logs the JSON-RPC messages for educational purposes

function createProtocolLogger() {
  let messageCount = 0;

  return {
    log(direction, method, data) {
      messageCount++;
      const arrow = direction === "send" ? ">>>" : "<<<";
      const color = direction === "send" ? "\x1b[36m" : "\x1b[33m";
      const reset = "\x1b[0m";

      console.log(`\n${color}${arrow} [${messageCount}] ${direction.toUpperCase()} ${method}${reset}`);
      if (data && Object.keys(data).length > 0) {
        const json = JSON.stringify(data, null, 2);
        // Indent each line for readability
        const indented = json.split("\n").map(l => `    ${l}`).join("\n");
        console.log(`${color}${indented}${reset}`);
      }
    },
    getCount() {
      return messageCount;
    },
  };
}

// ── Client setup ───────────────────────────────────────────

async function createMCPClient() {
  const logger = createProtocolLogger();

  console.log("\x1b[1m=== MCP Client ===\x1b[0m");
  console.log("Connecting to sqlite-explorer server via stdio transport...\n");

  const serverPath = path.join(__dirname, "server.js");

  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
  });

  const client = new Client({
    name: "mcp-explorer-client",
    version: "1.0.0",
  });

  // Connect
  logger.log("send", "initialize", {
    clientInfo: { name: "mcp-explorer-client", version: "1.0.0" },
    capabilities: {},
  });

  await client.connect(transport);

  logger.log("recv", "initialize (response)", {
    serverInfo: { name: "sqlite-explorer", version: "1.0.0" },
    capabilities: { tools: true, resources: true },
  });

  console.log("\n\x1b[32m[Connected]\x1b[0m Server handshake complete.\n");

  return { client, logger, transport };
}

// ── Discovery ──────────────────────────────────────────────

async function listTools(client, logger) {
  console.log("\n\x1b[1m--- Available Tools ---\x1b[0m");
  logger.log("send", "tools/list", {});

  const { tools } = await client.listTools();

  logger.log("recv", "tools/list (response)", {
    toolCount: tools.length,
  });

  for (const tool of tools) {
    console.log(`\n  \x1b[1m${tool.name}\x1b[0m`);
    console.log(`    ${tool.description}`);
    if (tool.inputSchema?.properties) {
      const params = Object.entries(tool.inputSchema.properties);
      if (params.length > 0) {
        console.log("    Parameters:");
        for (const [name, schema] of params) {
          const required = tool.inputSchema.required?.includes(name) ? " (required)" : "";
          console.log(`      - ${name}: ${schema.type}${required} — ${schema.description || ""}`);
        }
      }
    }
  }

  return tools;
}

async function listResources(client, logger) {
  console.log("\n\x1b[1m--- Available Resources ---\x1b[0m");
  logger.log("send", "resources/list", {});

  const { resources } = await client.listResources();

  logger.log("recv", "resources/list (response)", {
    resourceCount: resources.length,
  });

  for (const resource of resources) {
    console.log(`\n  \x1b[1m${resource.uri}\x1b[0m`);
    console.log(`    ${resource.description || "(no description)"}`);
    console.log(`    MIME: ${resource.mimeType || "text/plain"}`);
  }

  return resources;
}

// ── Tool calling ───────────────────────────────────────────

async function callTool(client, logger, toolName, args) {
  console.log(`\n\x1b[1m--- Calling tool: ${toolName} ---\x1b[0m`);
  logger.log("send", "tools/call", { name: toolName, arguments: args });

  const result = await client.callTool({ name: toolName, arguments: args });

  const text = result.content?.[0]?.text || "(no content)";
  logger.log("recv", "tools/call (response)", {
    isError: result.isError || false,
    contentLength: text.length,
  });

  // Pretty-print the result
  try {
    const parsed = JSON.parse(text);
    console.log("\n\x1b[32mResult:\x1b[0m");
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log("\n\x1b[32mResult:\x1b[0m", text);
  }

  return result;
}

// ── Resource reading ───────────────────────────────────────

async function readResource(client, logger, uri) {
  console.log(`\n\x1b[1m--- Reading resource: ${uri} ---\x1b[0m`);
  logger.log("send", "resources/read", { uri });

  const result = await client.readResource({ uri });

  const text = result.contents?.[0]?.text || "(no content)";
  logger.log("recv", "resources/read (response)", {
    contentLength: text.length,
    mimeType: result.contents?.[0]?.mimeType,
  });

  try {
    const parsed = JSON.parse(text);
    console.log("\n\x1b[32mResource content:\x1b[0m");
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log("\n\x1b[32mResource content:\x1b[0m", text);
  }

  return result;
}

// ── Interactive CLI ────────────────────────────────────────

async function interactiveMode(client, logger) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => new Promise(resolve => rl.question("\n\x1b[1mmcp>\x1b[0m ", resolve));

  console.log("\n\x1b[1m=== Interactive MCP Explorer ===\x1b[0m");
  console.log("Commands:");
  console.log("  tools              — List available tools");
  console.log("  resources          — List available resources");
  console.log("  call <tool> <json> — Call a tool with JSON arguments");
  console.log("  read <uri>         — Read a resource by URI");
  console.log("  query <sql>        — Shortcut for the query tool");
  console.log("  tables             — Shortcut for list_tables");
  console.log("  describe <table>   — Shortcut for describe_table");
  console.log("  schema             — Read db://schema resource");
  console.log("  stats              — Read db://stats resource");
  console.log("  help               — Show this help");
  console.log("  quit               — Exit");

  while (true) {
    const input = await prompt();
    const trimmed = input.trim();
    if (!trimmed) continue;

    const [cmd, ...rest] = trimmed.split(/\s+/);
    const restStr = rest.join(" ");

    try {
      switch (cmd.toLowerCase()) {
        case "tools":
          await listTools(client, logger);
          break;

        case "resources":
          await listResources(client, logger);
          break;

        case "call": {
          const toolName = rest[0];
          const argsStr = rest.slice(1).join(" ") || "{}";
          if (!toolName) {
            console.log("Usage: call <tool_name> <json_arguments>");
            break;
          }
          const args = JSON.parse(argsStr);
          await callTool(client, logger, toolName, args);
          break;
        }

        case "read": {
          const uri = rest[0];
          if (!uri) {
            console.log("Usage: read <resource_uri>");
            break;
          }
          await readResource(client, logger, uri);
          break;
        }

        case "query":
          await callTool(client, logger, "query", { sql: restStr });
          break;

        case "tables":
          await callTool(client, logger, "list_tables", {});
          break;

        case "describe": {
          const tableName = rest[0];
          if (!tableName) {
            console.log("Usage: describe <table_name>");
            break;
          }
          await callTool(client, logger, "describe_table", { table_name: tableName });
          break;
        }

        case "schema":
          await readResource(client, logger, "db://schema");
          break;

        case "stats":
          await readResource(client, logger, "db://stats");
          break;

        case "help":
          console.log("Commands: tools, resources, call, read, query, tables, describe, schema, stats, quit");
          break;

        case "quit":
        case "exit":
        case "q":
          console.log("Disconnecting...");
          rl.close();
          return;

        default:
          console.log(`Unknown command: ${cmd}. Type 'help' for available commands.`);
      }
    } catch (err) {
      console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
    }
  }
}

// ── Main ───────────────────────────────────────────────────

async function main() {
  const { client, logger, transport } = await createMCPClient();

  const mode = process.argv[2];

  if (mode === "--demo") {
    // Non-interactive demo: show discovery + a few tool calls
    await listTools(client, logger);
    await listResources(client, logger);
    await callTool(client, logger, "list_tables", {});
    await callTool(client, logger, "describe_table", { table_name: "orders" });
    await callTool(client, logger, "query", {
      sql: "SELECT u.name, COUNT(o.id) as order_count, SUM(o.total_cents)/100.0 as total_spent FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.id ORDER BY total_spent DESC LIMIT 5",
    });
    await readResource(client, logger, "db://stats");
  } else {
    // Interactive mode
    await interactiveMode(client, logger);
  }

  console.log(`\n[Session complete. ${logger.getCount()} protocol messages exchanged.]`);
  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
