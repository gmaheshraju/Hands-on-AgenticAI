# Project 15: MCP Server + Client

A hands-on implementation of the **Model Context Protocol (MCP)** — the protocol Anthropic created for tool connectivity in Claude Code, Cursor, Windsurf, and other AI development tools.

## What is MCP?

MCP is a standard protocol for connecting AI models to external tools and data sources. Think of it as **USB-C for AI tools** — a universal connector.

```
┌─────────────┐     JSON-RPC 2.0      ┌─────────────────┐
│  MCP Client │ ◄──────────────────►   │   MCP Server    │
│  (AI tool)  │   stdio / SSE / WS     │  (your service) │
│             │                        │                 │
│  - Claude   │  1. initialize         │  Capabilities:  │
│  - Cursor   │  2. tools/list         │  - Tools        │
│  - Custom   │  3. tools/call         │  - Resources    │
│             │  4. resources/read     │  - Prompts      │
└─────────────┘                        └─────────────────┘
```

### Core Concepts

| Concept      | What it is                                    | Example                          |
|-------------|-----------------------------------------------|----------------------------------|
| **Tool**    | A function the model can call                 | `query(sql)`, `search(term)`     |
| **Resource**| Read-only data the model can access           | `db://schema`, `file://config`   |
| **Prompt**  | Pre-built prompt templates                    | `summarize(topic)`               |
| **Transport**| How client and server communicate            | stdio, SSE, WebSocket            |

### Protocol Flow

```
CLIENT                              SERVER
  │                                    │
  │──── initialize ───────────────────►│  (1) Handshake + version negotiation
  │◄─── serverInfo + capabilities ─────│
  │──── initialized ─────────────────►│  (2) Client confirms
  │                                    │
  │──── tools/list ──────────────────►│  (3) Discovery
  │◄─── tool definitions ─────────────│
  │                                    │
  │──── tools/call { query, args } ──►│  (4) Execution
  │◄─── { content: [...] } ───────────│
  │                                    │
  │──── resources/read { uri } ──────►│  (5) Data access
  │◄─── { contents: [...] } ──────────│
```

## This Implementation

### Server (`src/server.js`)

An MCP server that wraps a SQLite e-commerce database:

**Tools:**
- `query` — Run a read-only SQL SELECT query
- `list_tables` — List all tables with row counts
- `describe_table` — Get columns, types, foreign keys, and sample data

**Resources:**
- `db://schema` — Full database schema (CREATE TABLE statements)
- `db://stats` — Database statistics (row counts, size)

### Client (`src/client.js`)

Interactive CLI that connects to the server:

```
mcp> tools              # List available tools
mcp> tables             # Call list_tables tool
mcp> describe orders    # Describe a specific table
mcp> query SELECT ...   # Run a SQL query
mcp> schema             # Read db://schema resource
mcp> stats              # Read db://stats resource
```

Shows the raw JSON-RPC messages being exchanged.

### Agent (`src/agent.js`)

Agent mode that takes natural language questions and uses MCP tools to answer:

```
question> Who are the top 5 customers?

[Planning] Analyzing question...
[Plan] Will execute 1 tool call(s):
  -> query: Finding top 5 customers by total spending

[Executing] query({"sql": "SELECT ..."})
[OK] Got 5 result(s)

Answer:
  Alice Smith          | 12 orders | ₹45,230
  ...
```

### Demo (`src/demo.js`)

Non-interactive walkthrough showing the complete protocol:

```bash
node src/demo.js
```

## Setup & Run

```bash
# Install dependencies
npm install

# Seed the database (optional — happens automatically)
npm run seed

# Run the interactive demo (recommended first)
npm run demo

# Start the interactive client
npm run client

# Start the agent mode
npm run agent
```

## Interview Angles

### "Explain MCP to me"

> MCP is a JSON-RPC 2.0 protocol for connecting AI models to tools and data. The server declares capabilities (tools with JSON Schema parameters, resources with URIs), and the client discovers and calls them. Transport-agnostic — works over stdio, SSE, or WebSocket. Think of it as an API standard specifically designed for AI-tool interaction, with built-in discovery, typed parameters, and structured responses.

### "How does it compare to function calling / tool use?"

> Function calling is the LLM-side concept — the model generates a tool call in its response. MCP is the infrastructure-side concept — how the client discovers what tools exist and actually executes them. They work together: the LLM uses function calling to decide WHICH tool to call, MCP handles HOW to call it.

### "Why not just use REST APIs?"

> You could, but MCP gives you:
> 1. **Discovery** — client auto-discovers tools, no hardcoded endpoints
> 2. **Typed parameters** — JSON Schema validation built in
> 3. **Structured responses** — content types (text, image, resource)
> 4. **Bidirectional** — server can send notifications to client
> 5. **Transport flexibility** — stdio for local, SSE/WS for remote
> 6. **Standard** — one protocol for all AI tools, not per-API integration

### "What's the security model?"

> MCP servers run locally (stdio) or behind auth (SSE). The client controls which servers to connect to. Tools can enforce read-only access (like our query tool blocking non-SELECT SQL). Resources are explicitly declared. The protocol itself doesn't handle auth — that's transport-layer (API keys, OAuth for SSE endpoints).

### "How would you deploy this in production?"

> 1. Switch from stdio to SSE/WebSocket transport for remote access
> 2. Add authentication middleware
> 3. Rate limiting on tool calls
> 4. Connection pooling for the database
> 5. Logging/monitoring of all tool invocations
> 6. Capability negotiation (different tools for different clients)

## Project Structure

```
15-mcp-server/
├── package.json          # Dependencies: @modelcontextprotocol/sdk, better-sqlite3
├── README.md             # This file
├── ecommerce.db          # SQLite database (auto-created)
└── src/
    ├── database.js       # Database setup + seeding (~800 rows)
    ├── server.js         # MCP server (3 tools, 2 resources)
    ├── client.js         # Interactive MCP client CLI
    ├── agent.js          # NL question → MCP tool calls → answer
    └── demo.js           # Non-interactive protocol walkthrough
```

## Key Code Patterns

### Defining a Tool (Server)

```javascript
server.tool(
  "query",                           // Tool name
  "Run a SQL SELECT query",          // Description (shown to LLM)
  { sql: z.string(), limit: z.number().optional() },  // Zod schema → JSON Schema
  async ({ sql, limit }) => {        // Handler
    const rows = db.prepare(sql).all();
    return {
      content: [{ type: "text", text: JSON.stringify(rows) }],
    };
  }
);
```

### Calling a Tool (Client)

```javascript
const result = await client.callTool({
  name: "query",
  arguments: { sql: "SELECT * FROM users LIMIT 5" },
});
// result.content[0].text → JSON string of rows
```

### The Protocol Message (What Goes Over the Wire)

```json
// Client → Server
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "query",
    "arguments": { "sql": "SELECT * FROM users LIMIT 5" }
  }
}

// Server → Client
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "[{\"id\": 1, \"name\": \"Alice\", ...}]"
      }
    ]
  }
}
```
