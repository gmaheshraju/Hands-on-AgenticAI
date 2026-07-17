# Capstone 10: SQL Analytics Agent with Permission Tiers

## The Problem

Your data team gets 50 Slack messages a day: "What was our revenue last quarter?" "How many users signed up this week?" "Show me churn by cohort." Each question takes a data analyst 10 minutes to write the SQL, run it, and format the answer. You need an agent that can query your database, but with real access controls — it can read analytics tables but must never touch production data or run destructive queries.

## What You Build

A chat agent that translates natural language questions into SQL, executes queries against a real database, and returns formatted answers.

**Input:** "What were our top 10 products by revenue last month?"

**Output:**
```
Top 10 Products by Revenue (June 2024):

| Rank | Product          | Revenue    | Units Sold |
|------|-----------------|------------|------------|
| 1    | Enterprise Plan  | $142,500   | 95         |
| 2    | Pro Annual       | $89,400    | 298        |
| ...

Query: SELECT p.name, SUM(o.amount) as revenue, COUNT(*) as units
       FROM orders o JOIN products p ON o.product_id = p.id  
       WHERE o.created_at >= '2024-06-01' AND o.created_at < '2024-07-01'
       GROUP BY p.name ORDER BY revenue DESC LIMIT 10;
       
Execution time: 45ms | Rows scanned: 12,847
```

## Architecture Requirements

1. **Database setup** — Create a SQLite database with realistic sample data:
   - `users` (id, name, email, plan, created_at)
   - `orders` (id, user_id, product_id, amount, status, created_at)
   - `products` (id, name, category, price)
   - `events` (id, user_id, event_type, properties, timestamp)
   - Populate with 10,000+ rows of realistic data

2. **Schema-aware prompting** — Feed the agent the database schema (table names, column names, types, sample values). The agent must understand the schema to write correct SQL.

3. **Permission tiers** — Three tiers, enforced in code (not just in the prompt):
   - **Read-only analytics:** SELECT only. No INSERT, UPDATE, DELETE, DROP, ALTER. Parse the SQL and reject any non-SELECT statement.
   - **Confirm before executing:** Queries that scan more than 100K rows or join more than 3 tables require user confirmation before execution.
   - **Blocked:** Any query touching tables not in the allowed list. Any query with subqueries that could be used for data exfiltration.

4. **SQL validation** — Before execution:
   - Parse the SQL to verify it's a SELECT statement
   - Check that all referenced tables are in the allowed list
   - Check for dangerous patterns (UNION with information_schema, nested subqueries beyond depth 2)
   - Estimate query cost (EXPLAIN) and warn if expensive

5. **Error recovery** — When the generated SQL fails:
   - Capture the error message
   - Send it back to the LLM with the original question: "This query failed with: column 'revenue' not found. The correct column name is 'amount'. Fix the query."
   - Max 3 retries per question

6. **Output formatting** — Results as formatted tables for tabular data, single values for scalar queries, with the actual SQL shown for transparency.

## What Makes This Not a Toy

- SQL injection through the LLM: a user could ask "show me all users; DROP TABLE users" — the agent might generate valid destructive SQL
- Permission enforcement must be in code, not just in the prompt — prompts are not security boundaries
- Real databases have ambiguous schemas: is revenue in the `orders` table or the `invoices` table? The agent must handle ambiguity
- Error recovery is where agents prove their value: a bad SQL query with a good retry loop beats a perfect query generator that gives up on errors
- Query cost estimation prevents accidental full-table scans on large datasets

## Evaluation Criteria

Write 20 test questions ranging from simple ("how many users?") to complex ("month-over-month revenue growth by product category"). For each:
- Did the agent generate correct SQL?
- Did the permission layer block dangerous queries?
- Did error recovery work when the first query failed?
- Was the output correctly formatted?
- Test 5 intentional injection attempts — did the permission layer catch them all?

## Stack

- Node.js or Python
- SQLite (with realistic sample data)
- Any LLM API
- SQL parser for permission enforcement (better-sqlite3 in Node, or sqlparse in Python)

