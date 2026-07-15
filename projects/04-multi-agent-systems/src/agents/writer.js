/**
 * Writer Agent
 *
 * Personality: concise, engaging, technically accurate.
 * Takes research notes and produces a blog post draft.
 * No tools — pure generation.
 */

const SYSTEM_PROMPT = `You are a technical blog writer. Your style guide:
1. Open with a concrete problem the reader recognises.
2. Explain the concept with an analogy before diving into details.
3. Include code snippets where they clarify the point.
4. Keep paragraphs short (3-4 sentences max).
5. End with actionable takeaways.
6. Target length: 800-1200 words.
Never pad. Every sentence should earn its place.`;

/**
 * Run the writer agent.
 * @param {object}  researchNotes  — output from the researcher
 * @param {string|null} revisionFeedback — if non-null, the editor's rejection feedback
 * @param {number}  attempt        — which attempt this is (1-based)
 * @returns {object} { draft, tokenUsage }
 */
export async function runWriter(researchNotes, revisionFeedback = null, attempt = 1) {
  console.log('\n--- Writer Agent ---');
  console.log(`System prompt: "${SYSTEM_PROMPT.slice(0, 80)}..."`);
  console.log(`Attempt: ${attempt}`);

  if (revisionFeedback) {
    console.log(`  Revision feedback received: "${revisionFeedback.slice(0, 100)}..."`);
  }

  const claims = researchNotes.notes.map((n) => n.key_claim);
  // Extract the actual subject from the prompt (strip "Write a ... on" prefix)
  const rawTopic = researchNotes.sub_questions?.[0]?.replace(/^What is\s+/i, '').replace(/\s+and why.*/, '') || 'the topic';
  const topic = rawTopic.replace(/^write a.*?(?:on|about)\s+/i, '') || rawTopic;

  // Simulate a weaker first draft on attempt 1 to demonstrate the retry flow
  let draft;
  if (attempt === 1 && !revisionFeedback) {
    draft = generateFirstDraft(topic, claims, researchNotes.sources);
  } else {
    draft = generateRevisedDraft(topic, claims, researchNotes.sources, revisionFeedback);
  }

  const tokenUsage = { prompt: 1400, completion: 950, total: 2350 };
  console.log(`  Draft length: ${draft.length} chars`);
  console.log(`  Tokens used: ${tokenUsage.total}`);

  return { draft, tokenUsage };
}

// --------------- mock generation helpers ---------------

function generateFirstDraft(topic, claims, sources) {
  return `# ${topic}

## The Problem

Every time your app handles a request, it opens a database connection, runs a query, and closes the connection. That sounds fine — until you have 500 requests per second. Suddenly you are drowning in TCP handshakes, TLS negotiations, and authentication round-trips.

## How It Works

${claims[0]}

Think of it like a taxi stand at an airport. Instead of calling a new cab for every passenger, you keep a fleet waiting. When a passenger arrives, they grab the next available taxi. When they are done, the taxi returns to the stand.

${claims[1]}

## Configuration

${claims[2]}

A simple configuration in Node.js looks like this:

\`\`\`js
const pool = new Pool({
  host: 'localhost',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
\`\`\`

## Performance

${claims[3]}

## Pitfalls

${claims[4]}

## Sources

${sources.map((s) => `- ${s}`).join('\n')}
`;
}

function generateRevisedDraft(topic, claims, sources, feedback) {
  return `# ${topic}: A Deep Dive

## Why This Matters

Every Node.js application that talks to a database faces the same bottleneck: connection overhead. Each new connection requires a TCP handshake, TLS negotiation, and authentication — work that adds 5-20ms of latency per query. Under load, this overhead dominates your response times.

${topic} solves this by maintaining a pool of pre-established connections that your application reuses.

## The Mental Model

Think of a library's reading desks. The library does not build a new desk every time a student walks in and demolish it when they leave. It maintains a fixed number of desks. Students check one out, use it, and return it. The pool manager handles the inventory.

## Under the Hood

${claims[0]}

When your application calls \`pool.query()\`, three things happen:
1. The pool manager checks for an idle connection.
2. If one exists, it is handed to the caller immediately.
3. If none exist and the pool is below \`max\`, a new connection is created.
4. If the pool is at capacity, the request waits in a queue.

${claims[1]}

\`\`\`js
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: 5432,
  database: 'myapp',
  max: 20,                    // max connections in pool
  idleTimeoutMillis: 30000,   // close idle connections after 30s
  connectionTimeoutMillis: 2000, // fail fast if pool is exhausted
});

// Usage — connection is automatically returned to pool
const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
\`\`\`

## Sizing the Pool

${claims[2]}

A good starting formula:

\`\`\`
pool_size = (CPU_cores * 2) + effective_spindle_count
\`\`\`

For a typical 4-core server with SSD storage, start with 10 and measure from there.

## Performance Impact

${claims[3]}

In our benchmarks:
- **Without pooling**: p50 = 45ms, p99 = 320ms (1000 concurrent users)
- **With pooling (max=20)**: p50 = 12ms, p99 = 85ms (same load)

That is a 73% improvement at the median and a 3.7x improvement at the tail.

## Common Pitfalls

${claims[4]}

Other traps to avoid:
- **Connection leaks**: Always use try/finally or a helper that returns connections automatically.
- **Pool per request**: Creating a new pool inside a request handler defeats the purpose.
- **Ignoring errors**: Listen for the pool's \`error\` event to catch background connection failures.

\`\`\`js
pool.on('error', (err) => {
  console.error('Unexpected pool error', err);
  // Do not crash — the pool will remove the broken connection
});
\`\`\`

## Takeaways

1. Always use connection pooling in production.
2. Size the pool based on your hardware and workload, not a magic number.
3. Set idle timeouts to prevent stale connections.
4. Monitor pool metrics (active, idle, waiting) in your observability stack.

## Sources

${sources.map((s) => `- ${s}`).join('\n')}
`;
}
