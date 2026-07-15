/**
 * server.js — MCP Server exposing a SQLite database
 *
 * Implements the Model Context Protocol (MCP) server using the official SDK.
 * Exposes:
 *   Tools:     query, list_tables, describe_table
 *   Resources: db://schema, db://stats
 *
 * Transport: stdio (JSON-RPC over stdin/stdout)
 *
 * Key MCP concepts demonstrated:
 *   - Server capability declaration (tools + resources)
 *   - Tool definitions with JSON Schema parameters
 *   - Resource URIs with MIME types
 *   - Proper error handling and content types
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getDatabase } from "./database.js";

// ── Database ───────────────────────────────────────────────

const db = getDatabase();

// ── MCP Server ─────────────────────────────────────────────

const server = new McpServer({
  name: "sqlite-explorer",
  version: "1.0.0",
  description: "Explore a SQLite e-commerce database via MCP tools and resources",
});

// ── Tools ──────────────────────────────────────────────────

/**
 * Tool: query
 * Run a read-only SQL query against the database.
 * Only SELECT statements are allowed for safety.
 */
server.tool(
  "query",
  "Run a read-only SQL SELECT query against the e-commerce database. Returns results as JSON rows. Only SELECT statements are allowed.",
  {
    sql: z.string().describe("The SQL SELECT query to execute"),
    limit: z.number().optional().default(100).describe("Maximum number of rows to return (default: 100, max: 1000)"),
  },
  async ({ sql, limit }) => {
    // Safety: only allow SELECT queries
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith("SELECT")) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Only SELECT queries are allowed. This is a read-only interface.",
          }),
        }],
        isError: true,
      };
    }

    try {
      const effectiveLimit = Math.min(limit || 100, 1000);
      // Wrap in a limited query if no LIMIT clause present
      let execSql = sql.trim();
      if (!trimmed.includes("LIMIT")) {
        execSql = `${execSql} LIMIT ${effectiveLimit}`;
      }

      const rows = db.prepare(execSql).all();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            rowCount: rows.length,
            rows,
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: err.message }),
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: list_tables
 * List all tables and their schemas in the database.
 */
server.tool(
  "list_tables",
  "List all tables in the database with their column definitions and row counts.",
  {},
  async () => {
    const tables = db.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all();

    const result = tables.map(t => {
      const count = db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get();
      return {
        name: t.name,
        rowCount: count.count,
        createStatement: t.sql,
      };
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2),
      }],
    };
  }
);

/**
 * Tool: describe_table
 * Get detailed information about a specific table: columns, types, and sample rows.
 */
server.tool(
  "describe_table",
  "Get column names, types, constraints, and 5 sample rows for a specific table.",
  {
    table_name: z.string().describe("Name of the table to describe"),
  },
  async ({ table_name }) => {
    try {
      // Validate table exists
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
      ).get(table_name);

      if (!exists) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: `Table "${table_name}" not found. Use list_tables to see available tables.`,
            }),
          }],
          isError: true,
        };
      }

      // Get column info
      const columns = db.prepare(`PRAGMA table_info("${table_name}")`).all();

      // Get foreign keys
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list("${table_name}")`).all();

      // Get indexes
      const indexes = db.prepare(`PRAGMA index_list("${table_name}")`).all();

      // Get sample rows
      const sampleRows = db.prepare(`SELECT * FROM "${table_name}" LIMIT 5`).all();

      // Get row count
      const count = db.prepare(`SELECT COUNT(*) as count FROM "${table_name}"`).get();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            table: table_name,
            rowCount: count.count,
            columns: columns.map(c => ({
              name: c.name,
              type: c.type,
              nullable: !c.notnull,
              defaultValue: c.dflt_value,
              primaryKey: !!c.pk,
            })),
            foreignKeys: foreignKeys.map(fk => ({
              column: fk.from,
              referencesTable: fk.table,
              referencesColumn: fk.to,
            })),
            indexes: indexes.map(idx => ({
              name: idx.name,
              unique: !!idx.unique,
            })),
            sampleRows,
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: err.message }),
        }],
        isError: true,
      };
    }
  }
);

// ── Resources ──────────────────────────────────────────────

/**
 * Resource: db://schema
 * The full database schema — all CREATE TABLE statements.
 */
server.resource(
  "db-schema",
  "db://schema",
  {
    description: "Full database schema (all CREATE TABLE statements)",
    mimeType: "application/json",
  },
  async (uri) => {
    const tables = db.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all();

    const indexes = db.prepare(
      "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY tbl_name"
    ).all();

    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({
          database: "ecommerce.db",
          tables: tables.map(t => ({
            name: t.name,
            sql: t.sql,
          })),
          indexes: indexes.map(i => ({
            name: i.name,
            table: i.tbl_name,
            sql: i.sql,
          })),
        }, null, 2),
      }],
    };
  }
);

/**
 * Resource: db://stats
 * Database statistics — row counts, approximate sizes, last modified.
 */
server.resource(
  "db-stats",
  "db://stats",
  {
    description: "Database statistics: row counts per table, total size",
    mimeType: "application/json",
  },
  async (uri) => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all();

    const stats = tables.map(t => {
      const count = db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get();
      return { table: t.name, rowCount: count.count };
    });

    const totalRows = stats.reduce((sum, s) => sum + s.rowCount, 0);

    // Get page count and page size for approximate DB size
    const pageCount = db.pragma("page_count")[0].page_count;
    const pageSize  = db.pragma("page_size")[0].page_size;
    const dbSizeBytes = pageCount * pageSize;

    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({
          database: "ecommerce.db",
          totalRows,
          approximateSizeBytes: dbSizeBytes,
          approximateSizeKB: Math.round(dbSizeBytes / 1024),
          tables: stats,
        }, null, 2),
      }],
    };
  }
);

// ── Start server ───────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol messages)
  console.error("[MCP Server] sqlite-explorer v1.0.0 started");
  console.error("[MCP Server] Transport: stdio");
  console.error("[MCP Server] Tools: query, list_tables, describe_table");
  console.error("[MCP Server] Resources: db://schema, db://stats");
}

main().catch((err) => {
  console.error("[MCP Server] Fatal error:", err);
  process.exit(1);
});
