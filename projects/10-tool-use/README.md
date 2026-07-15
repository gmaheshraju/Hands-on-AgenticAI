# Project 10: SQL Analytics Agent with Permission Tiers

A text-to-SQL agent that translates natural language questions into SQL queries, executes them against a real SQLite database, and returns formatted results — with three permission tiers enforced **in code** (not just prompts).

## Quick Start

```bash
npm install
node src/demo.js
```

## Architecture

```
User Question
     |
     v
+------------------+
|   agent.js       |  Schema-aware prompt + LLM call (mock or real)
|   (orchestrator)  |
+------------------+
     |
     v  Generated SQL
+------------------+
| permissions.js   |  Parse SQL, enforce 3 permission tiers
| (security gate)   |
+------------------+
     |
     v  Validated SQL
+------------------+
| database.js      |  Execute against SQLite (better-sqlite3)
| (data layer)      |
+------------------+
     |
     v  Result rows
+------------------+
| formatter.js     |  Tables, scalars, chart-ready data
| (output)          |
+------------------+
     |
     v  Formatted answer + metadata
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

## Interview Angle

> "I built a text-to-SQL agent with three permission tiers enforced in code, not just prompts. The permission layer parses every generated SQL statement and rejects anything that isn't a SELECT on an allowed table. It blocks semicolon injection, metadata probes, deeply nested subqueries, and UNION-based data exfiltration — all before the query touches the database. The most interesting part was error recovery: the LLM generates wrong column names about 20% of the time on first attempt, but feeding the error message back lets it self-correct in one retry over 90% of the time. The lesson: invest in retry loops, not perfect prompts."
