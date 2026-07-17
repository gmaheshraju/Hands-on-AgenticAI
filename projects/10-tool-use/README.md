# Project 10: SQL Analytics Agent with Permission Tiers

A text-to-SQL agent that translates natural language questions into SQL queries, executes them against a real SQLite database, and returns formatted results — with three permission tiers enforced **in code** (not just prompts).

## Quick Start

```bash
npm install
node src/demo.js
```

## Architecture

```
  ┌──────────────────────────────────────────────────────────────┐
  │  "What is the monthly revenue by product category?"          │
  └──────────────────────────┬───────────────────────────────────┘
                             ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  agent.js ── Text-to-SQL Orchestrator                        │
  │  Schema context (DDL + sample rows) injected into prompt     │
  │  LLM generates raw SQL from natural language                 │
  └──────────────────────────┬───────────────────────────────────┘
                             ▼  generated SQL
  ┌──────────────────────────────────────────────────────────────┐
  │  permissions.js ── 3-Tier Security Gate (code, not prompts)  │
  │                                                              │
  │  Tier 1 ALLOW  : SELECT only, 14 destructive keywords blocked│
  │  Tier 2 CONFIRM: no WHERE clause, >3 JOINs                  │
  │  Tier 3 BLOCK  : unauthorized tables, semicolons,            │
  │                  metadata tables, nesting > 2, UNION+const   │
  └─────────┬───────────────────────────────┬────────────────────┘
            │ allowed                       │ blocked
            ▼                               ▼
  ┌───────────────────────┐    ┌──────────────────────────────┐
  │  EXPLAIN QUERY PLAN   │    │  PERMISSION DENIED response  │
  │  Cost estimation      │    └──────────────────────────────┘
  └───────────┬───────────┘
              ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  database.js ── SQLite Execution (better-sqlite3)            │
  │  15K rows: users(2K) + products(20) + orders(5K) + events(8K)│
  └─────────┬───────────────────────────────┬────────────────────┘
            │ success                       │ error
            ▼                               ▼
  ┌───────────────────────┐    ┌──────────────────────────────┐
  │  formatter.js         │    │  Error fed back to LLM       │
  │  ASCII tables, scalar │    │  Retry loop (up to 3x)       │
  │  values, chart-ready  │    └──────────────────────────────┘
  └───────────────────────┘
```

## Permission Tiers (Code-Enforced)

### Tier 1: Read-Only (Allowed)
- Only `SELECT` statements permitted
- SQL is parsed — the first keyword must be `SELECT`
- 14 destructive keywords blocked (INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, REPLACE, EXEC, ATTACH, DETACH, PRAGMA, GRANT, REVOKE)

### Tier 2: Confirm Before Execute
- Queries without `WHERE` clause (potential full table scan)
- Queries with more than 3 JOINs
- Returns `needsConfirm: true` — caller decides whether to proceed

### Tier 3: Blocked
- Multiple SQL statements (semicolon injection)
- Non-allowed tables (whitelist enforcement)
- Metadata tables (`information_schema`, `sqlite_master`, etc.)
- Subquery nesting depth > 2
- UNION with constant values (injection pattern)
- `load_extension` and other dangerous functions

## Key Design Decisions

1. **Permission in code, not prompts**: The LLM can generate any SQL it wants. The permission layer parses the output and rejects anything dangerous. Prompts are not security boundaries.

2. **Error recovery with retry**: When SQL fails, the error message is fed back to the LLM with context. The mock LLM demonstrates this — question #9 deliberately uses a wrong column name (`revenue` instead of `amount`), fails, and self-corrects on retry.

3. **Schema context in the prompt**: The LLM receives full DDL, sample rows, relationships, and field notes. This grounds generation in the actual schema rather than guessing.

4. **Cost estimation**: `EXPLAIN QUERY PLAN` runs before execution to detect full table scans and missing index usage.

## Files

| File | Purpose |
|------|---------|
| `src/database.js` | SQLite setup, schema creation, 15K rows of seeded e-commerce data |
| `src/permissions.js` | SQL parser and 3-tier permission enforcement |
| `src/agent.js` | Text-to-SQL orchestrator with retry loop |
| `src/formatter.js` | ASCII tables, scalar values, chart-ready export |
| `src/demo.js` | 10 analytics questions + 5 injection tests + tier demos |

## Database Schema

- **users** (2,000 rows): id, name, email, plan, created_at, last_login_at
- **products** (20 rows): id, name, category, price
- **orders** (5,000 rows): id, user_id, product_id, amount, status, created_at
- **events** (8,000 rows): id, user_id, event_type, properties (JSON), timestamp

## Using a Real LLM

Replace the `mockLLM` function in `agent.js` with a real API call:

```js
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic();

async function realLLM(messages) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: messages[0].content,
    messages: messages.slice(1),
  });
  return response.content[0].text;
}

const agent = createAgent({ llm: realLLM, db, schemaContext, allowedTables });
```

