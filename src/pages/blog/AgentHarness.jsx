import { useState } from 'react';
import { Link } from 'react-router-dom';
import Decision, { Pill } from '../../components/Decision';
import Insight from '../../components/Insight';
import CodeBlock from '../../components/CodeBlock';
import FadeIn from '../../components/FadeIn';

const HARNESS_CODE = `async function runAgent(userMessage, config = {}) {
  const {
    maxIterations = 10,
    maxCostUsd = 2.0,
    tools = {},
    memory = null,
  } = config;

  let totalCost = 0;
  const lastToolCalls = [];  // track for convergence detection

  // OBSERVE: build initial context
  const messages = [{ role: 'system', content: await buildSystemPrompt(memory) }];
  if (memory) {
    const relevant = await memory.retrieve(userMessage);
    messages[0].content += '\\n\\nRelevant memories:\\n' +
      relevant.map(m => \`- \${m.text}\`).join('\\n');
  }
  messages.push({ role: 'user', content: userMessage });

  for (let i = 0; i < maxIterations; i++) {
    // THINK: LLM inference
    const response = await callLLM(messages, { tools: Object.keys(tools) });
    totalCost += response.usage.cost;

    // EVALUATE: check termination conditions
    if (totalCost > maxCostUsd) {
      return { text: response.text || 'Cost limit reached.', cost: totalCost, iterations: i + 1 };
    }
    if (!response.toolCalls?.length) {
      return { text: response.text, cost: totalCost, iterations: i + 1 };
    }

    // Convergence detection: same tool + args 3x = stuck
    const callKey = JSON.stringify(response.toolCalls.map(c => [c.name, c.args]));
    lastToolCalls.push(callKey);
    if (lastToolCalls.length >= 3 && lastToolCalls.slice(-3).every(k => k === callKey)) {
      messages.push({ role: 'system', content: 'You are repeating the same action. Try a different approach.' });
      continue;
    }

    // ACT: execute tools
    for (const call of response.toolCalls) {
      const result = await executeWithRetry(tools[call.name], call.args);
      messages.push(
        { role: 'assistant', content: null, tool_calls: [call] },
        { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) }
      );
    }
  }
  return { text: 'Max iterations reached.', cost: totalCost, iterations: maxIterations };
}`;

const HARNESS_OUTPUT = `> await runAgent("Find and fix the failing test in auth.test.js", {
    maxIterations: 10, maxCostUsd: 2.0,
    tools: { readFile, editFile, runTests },
    memory
  })

[iter 1] Retrieved 2 relevant memories
  → "Project uses Jest with --coverage flag"
  → "Auth module was refactored last week"
[iter 1] Tool: readFile({ path: "auth.test.js" })
  → 142 lines read

[iter 2] Tool: readFile({ path: "src/auth.js" })
  → 89 lines read

[iter 3] Tool: editFile({ path: "src/auth.js", line: 47 })
  → Fixed: validateToken() missing await

[iter 4] Tool: runTests({ file: "auth.test.js" })
  → 12 passed, 0 failed ✓

[iter 5] No tool calls — returning response.

{ text: "Fixed the failing test. The issue was a missing await
  on validateToken() at line 47 of auth.js.",
  cost: 0.047, iterations: 5 }`;

const TRACING_CODE = `function createTracer(queryId) {
  const spans = [];
  const start = Date.now();

  return {
    // Wrap an LLM call with automatic tracing
    async traceLLM(messages, opts) {
      const spanStart = Date.now();
      const response = await callLLM(messages, opts);

      spans.push({
        type: 'llm',
        model: opts.model || 'default',
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        cost: response.usage.cost,
        latencyMs: Date.now() - spanStart,
        toolCalls: response.toolCalls?.map(c => c.name) || [],
      });
      return response;
    },

    // Wrap a tool call with tracing
    async traceTool(name, args, fn) {
      const spanStart = Date.now();
      try {
        const result = await fn(args);
        spans.push({ type: 'tool', name, latencyMs: Date.now() - spanStart, status: 'ok' });
        return result;
      } catch (err) {
        spans.push({ type: 'tool', name, latencyMs: Date.now() - spanStart, status: 'error', error: err.message });
        throw err;
      }
    },

    // Flush trace at end of query
    flush() {
      const trace = {
        queryId,
        totalMs: Date.now() - start,
        totalCost: spans.filter(s => s.cost).reduce((sum, s) => sum + s.cost, 0),
        iterations: spans.filter(s => s.type === 'llm').length,
        toolErrors: spans.filter(s => s.status === 'error').length,
        spans,
      };
      console.log(JSON.stringify(trace));  // → your logging pipeline
      return trace;
    },
  };
}`;

const TRACING_OUTPUT = `> const tracer = createTracer("query-8f3a")

> await tracer.traceLLM(messages, { model: "claude-sonnet" })
  span: { type: "llm", promptTokens: 1847, completionTokens: 234,
          cost: 0.012, latencyMs: 1340, toolCalls: ["readFile"] }

> await tracer.traceTool("readFile", { path: "index.js" }, readFile)
  span: { type: "tool", name: "readFile", latencyMs: 12, status: "ok" }

> await tracer.traceTool("runTests", { suite: "all" }, runTests)
  span: { type: "tool", name: "runTests", latencyMs: 4521, status: "error",
          error: "3 tests failed" }

> tracer.flush()
{
  "queryId": "query-8f3a",
  "totalMs": 6204,
  "totalCost": 0.031,
  "iterations": 2,
  "toolErrors": 1,
  "spans": [ ...5 spans ]
}`;

const TABS = ['The Loop', 'Tracing & Observability', 'Error Recovery', 'Self-Improvement', 'Production Ops'];

export default function AgentHarness() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <Link to="/blog" style={styles.back}>&larr; AI Engineering</Link>
      <p style={styles.eyebrow}>Post 03</p>
      <h1 style={styles.h1}>Agent Harness & Loop Engineering</h1>
      <p style={styles.subtitle}>
        The orchestration loop is the beating heart of every agent. How to build loops
        that are observable, recoverable, and self-improving — the infrastructure that
        turns a prompt into a reliable system.
      </p>

      <div style={styles.tabWrap}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{ ...styles.tabBtn, ...(tab === i ? styles.tabActive : {}) }}>{t}</button>
        ))}
      </div>

      {tab === 0 && <LoopPanel />}
      {tab === 1 && <TracingPanel />}
      {tab === 2 && <ErrorPanel />}
      {tab === 3 && <SelfImprovePanel />}
      {tab === 4 && <ProdOpsPanel />}
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

function AgentLoopDiagram() {
  const f = 'var(--font-body)';
  const fm = 'var(--font-mono)';

  return (
    <div style={{ overflowX: 'auto', margin: '20px 0' }}>
      <svg viewBox="0 0 720 360" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', display: 'block' }}>
        <defs>
          <marker id="lah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="var(--text-muted)" opacity="0.7" />
          </marker>
          <marker id="lahA" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="var(--text-accent)" opacity="0.8" />
          </marker>
        </defs>

        <text x="360" y="22" textAnchor="middle" fontSize="14" fontWeight="400" fill="var(--text-h)" fontFamily="var(--font-display)">Agent Loop — The Core Execution Cycle</text>

        {/* Main loop box */}
        <rect x="40" y="44" width="640" height="220" rx="12" fill="var(--text-accent)" opacity="0.04" stroke="var(--text-accent)" strokeWidth="1.2" strokeDasharray="8 4" />
        <text x="60" y="64" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.1em">AGENT LOOP (max N iterations)</text>

        {/* Step 1: Observe */}
        <rect x="70" y="80" width="110" height="56" rx="8" fill="#3F8624" opacity="0.08" stroke="#3F8624" strokeWidth="1.2" />
        <rect x="76" y="86" width="14" height="14" rx="3" fill="#3F8624" opacity="0.9" />
        <text x="125" y="104" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Observe</text>
        <text x="125" y="120" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>gather context</text>
        <text x="125" y="132" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>user msg + tool results</text>

        {/* Step 2: Think */}
        <rect x="220" y="80" width="110" height="56" rx="8" fill="var(--text-accent)" opacity="0.08" stroke="var(--text-accent)" strokeWidth="1.2" />
        <rect x="226" y="86" width="14" height="14" rx="3" fill="var(--text-accent)" opacity="0.9" />
        <text x="275" y="104" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Think</text>
        <text x="275" y="120" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>reason about next step</text>
        <text x="275" y="132" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>LLM inference</text>

        {/* Step 3: Act */}
        <rect x="370" y="80" width="110" height="56" rx="8" fill="#ED7100" opacity="0.08" stroke="#ED7100" strokeWidth="1.2" />
        <rect x="376" y="86" width="14" height="14" rx="3" fill="#ED7100" opacity="0.9" />
        <text x="425" y="104" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Act</text>
        <text x="425" y="120" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>call tool or respond</text>
        <text x="425" y="132" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>function execution</text>

        {/* Step 4: Evaluate */}
        <rect x="520" y="80" width="130" height="56" rx="8" fill="#3949AB" opacity="0.08" stroke="#3949AB" strokeWidth="1.2" />
        <rect x="526" y="86" width="14" height="14" rx="3" fill="#3949AB" opacity="0.9" />
        <text x="585" y="104" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Evaluate</text>
        <text x="585" y="120" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>check: done? error? retry?</text>
        <text x="585" y="132" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>termination check</text>

        {/* Forward arrows */}
        <line x1="182" y1="108" x2="218" y2="108" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#lah)" />
        <line x1="332" y1="108" x2="368" y2="108" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#lah)" />
        <line x1="482" y1="108" x2="518" y2="108" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#lah)" />

        {/* Loop-back arrow */}
        <path d="M585,138 L585,170 L125,170 L125,138" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" strokeDasharray="6 3" markerEnd="url(#lahA)" />
        <text x="355" y="186" textAnchor="middle" fontSize="8" fontWeight="600" fill="var(--text-accent)" fontFamily={fm}>not done → next iteration</text>

        {/* Exit path */}
        <line x1="585" y1="170" x2="585" y2="210" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" />
        <rect x="520" y="210" width="130" height="40" rx="8" fill="var(--bg-card)" stroke="var(--border-strong)" strokeWidth="1.2" />
        <text x="585" y="234" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Response</text>
        <text x="548" y="204" fontSize="7" fontWeight="600" fill="var(--text-muted)" fontFamily={fm}>done ↓</text>

        {/* Observability sidebar */}
        <text x="60" y="290" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.1em">OBSERVABILITY LAYER</text>

        <rect x="60" y="300" width="100" height="34" rx="6" fill="#C925D1" opacity="0.08" stroke="#C925D1" strokeWidth="0.8" />
        <text x="110" y="320" textAnchor="middle" fontSize="9" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Traces</text>

        <rect x="180" y="300" width="100" height="34" rx="6" fill="#C925D1" opacity="0.08" stroke="#C925D1" strokeWidth="0.8" />
        <text x="230" y="320" textAnchor="middle" fontSize="9" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Metrics</text>

        <rect x="300" y="300" width="100" height="34" rx="6" fill="#C925D1" opacity="0.08" stroke="#C925D1" strokeWidth="0.8" />
        <text x="350" y="320" textAnchor="middle" fontSize="9" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Logs</text>

        <rect x="420" y="300" width="100" height="34" rx="6" fill="#C925D1" opacity="0.08" stroke="#C925D1" strokeWidth="0.8" />
        <text x="470" y="320" textAnchor="middle" fontSize="9" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Cost Tracking</text>

        <rect x="540" y="300" width="100" height="34" rx="6" fill="#C925D1" opacity="0.08" stroke="#C925D1" strokeWidth="0.8" />
        <text x="590" y="320" textAnchor="middle" fontSize="9" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Eval Pipeline</text>

        {/* Key bar */}
        <rect x="18" y="346" width="684" height="8" rx="4" fill="var(--text-accent)" opacity="0.15" />
      </svg>
    </div>
  );
}

function LoopPanel() {
  return (
    <div>
      <SectionHead
        title="The agent loop: observe → think → act → evaluate"
        desc={<>Mahesh's metaphor: <strong>"A harness is what keeps the horse on course."</strong> The LLM is the horse — powerful but directionless without structure. The harness is the loop that constrains, observes, and corrects. Every agent runs the same cycle. The quality difference is in the harness engineering — termination conditions, memory injection, and the evaluation gate.</>}
      />

      <AgentLoopDiagram />

      <div style={{ background: 'var(--bg-code)', borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)', borderRightWidth: 1, borderRightStyle: 'solid', borderRightColor: 'var(--border)', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: 'var(--bg-accent-strong)', borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-accent)', marginBottom: 6, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>MAHESH'S HARNESS COMPONENTS</p>
        <p style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.65, marginBottom: 6 }}>
          The harness isn't just a loop — it's the complete runtime that wraps the LLM. Mahesh breaks it into layers:
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.65, marginBottom: 4 }}>
          <strong>1. Memory System</strong> — Procedural (SKILL.md), Semantic (vector DB), Episodic (conversation log). Injected into context at the Observe step.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.65, marginBottom: 4 }}>
          <strong>2. Tool Execution Layer</strong> — Sandboxed function calls with timeout and retry logic. The harness executes tools, not the LLM.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.65, marginBottom: 4 }}>
          <strong>3. Evaluation Gate</strong> — "Ship the fix or fix the bug." After each iteration, the harness checks: did this action move us closer to the goal? If not, inject corrective context and re-run.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.65, marginBottom: 4 }}>
          <strong>4. Observability Layer</strong> — Traces, metrics, cost tracking. Mahesh specifically calls out Langfuse and LangSmith for LLM-specific tracing.
        </p>
      </div>

      <FadeIn><CodeBlock filename="agent-harness.js" code={HARNESS_CODE} output={HARNESS_OUTPUT} /></FadeIn>

      <FadeIn><Decision question="Observe — what goes into the context?">
        The observe step assembles the context window: system prompt + conversation history + retrieved memories + tool results from the last iteration.
        <br /><br />
        <strong>Key engineering decisions:</strong>
        <br />
        — How much conversation history to include (all? last N? summarized?)
        <br />
        — Whether to retrieve memories/RAG context (always? only when needed?)
        <br />
        — How to format tool results (raw JSON? summarized? truncated?)
        <br /><br />
        The observe step is the most underrated part of the loop. Bad context assembly = bad reasoning, regardless of how good the LLM is.
        <br /><br />
        <strong>Mahesh's memory injection pattern:</strong> The Observe step is where memory meets the loop. Load procedural memory (SKILL.md — how to do this task) into the system prompt. Retrieve semantic memory (relevant facts) via RAG. Append recent episodic memory (what happened in this session). This is the "Context RAM" — the working memory that the LLM reasons over.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Think — the LLM inference step">
        The LLM receives the assembled context and produces either: (a) a tool call (continue looping), or (b) a final text response (exit the loop).
        <br /><br />
        <strong>ReAct pattern:</strong> The LLM explicitly generates a "Thought" before each action. "I need to find the user's account → I should search the database → Let me call the search_users tool." This is more expensive (extra tokens for reasoning) but more debuggable.
        <br /><br />
        <strong>Direct tool calling:</strong> The LLM directly outputs a tool call without explicit reasoning. Faster and cheaper. Less debuggable — you can't see WHY it chose that tool.
        <br /><br />
        <strong>Production choice:</strong> Use extended thinking / chain-of-thought for complex tasks (code generation, multi-step reasoning). Use direct tool calling for simple tasks (FAQ, data lookup).
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Termination conditions — when to stop looping">
        The most critical engineering decision. Without proper termination, agents loop forever (burning money) or stop too early (incomplete answers).
        <br /><br />
        <strong>Natural termination:</strong> The LLM decides to respond with text instead of a tool call. Works 90% of the time.
        <br /><br />
        <strong>Iteration cap:</strong> Hard limit of 5-15 iterations. Prevents runaway loops. Log a warning when hit — it usually means something is wrong.
        <br /><br />
        <strong>Cost cap:</strong> Stop when the query has consumed $X in API costs. Prevents expensive queries from blowing the budget.
        <br /><br />
        <strong>Time cap:</strong> Stop after T seconds. Users don't wait forever. Return a partial result: "I found X so far but ran out of time."
        <br /><br />
        <strong>Convergence detection:</strong> If the last 3 iterations produced the same tool call with the same args, the agent is stuck. Break the loop and escalate.
        <br /><br />
        <strong>Mahesh's "gate" pattern:</strong> "Ship the fix or fix the bug." The evaluation step isn't just "are we done?" — it's "did this iteration actually help?" Track a progress signal: did the test pass? Did the error count decrease? Did the user's question get closer to answered? If 3 iterations show no progress, the gate triggers escalation.
      </Decision></FadeIn>

      <FadeIn><Insight>
        "A harness is what keeps the horse on course" — Mahesh's metaphor. The LLM is the horse — powerful, fast, but it will wander without constraint. The harness is the termination conditions, the cost caps, the convergence detection. Staff+ candidates immediately ask: 'What's the gate? What triggers escalation? What's the cost cap?' The harness engineering — not the LLM choice — is what makes agents production-safe. Mahesh's rule: if you can't explain the harness, you haven't built an agent — you've built a demo.
      </Insight></FadeIn>
    </div>
  );
}

function TracingPanel() {
  return (
    <div>
      <SectionHead
        title="Tracing & observability"
        desc="You can't improve what you can't observe. Agent traces are the equivalent of distributed tracing in microservices — they let you see exactly what happened, why, and where it went wrong."
      />

      <FadeIn><Decision question="What to trace in every agent call?">
        <strong>Per-iteration trace:</strong>
        <br />
        — Iteration number and timestamp
        <br />
        — Input context size (tokens)
        <br />
        — LLM model used and parameters (temperature, max_tokens)
        <br />
        — Tool called (name, arguments, truncated result)
        <br />
        — LLM reasoning (if using chain-of-thought)
        <br />
        — Latency breakdown: context assembly | LLM inference | tool execution
        <br />
        — Token usage: prompt tokens | completion tokens | total cost
        <br /><br />
        <strong>Per-query trace (spans the full loop):</strong>
        <br />
        — Total iterations, total cost, total latency
        <br />
        — Termination reason (natural | iteration cap | cost cap | error)
        <br />
        — User satisfaction signal (if available)
      </Decision></FadeIn>

      <FadeIn><CodeBlock filename="agent-tracer.js" code={TRACING_CODE} output={TRACING_OUTPUT} /></FadeIn>

      <FadeIn delay={80}><Decision question="Tracing tools — what do teams actually use?">
        <Pill type="green">LangSmith</Pill> Purpose-built for LLM tracing. Mahesh demonstrates this in his harness video — visualizes the full agent loop as a tree of spans. Best DX for debugging "why did the agent pick that tool?" Integrates with LangChain but also works standalone.
        <br /><br />
        <Pill type="green">Langfuse</Pill> Open-source alternative Mahesh also covers. Self-hostable. Traces, evals, and prompt management in one tool. Good for teams that want full control over their observability data. Growing fast in the agent community.
        <br /><br />
        <Pill type="green">Braintrust</Pill> Focused on evals + tracing. Strong on A/B testing prompt changes. Good for teams that want to combine tracing and evaluation in one tool.
        <br /><br />
        <Pill type="amber">OpenTelemetry</Pill> Standard distributed tracing. Not LLM-specific but integrates with your existing infrastructure (Datadog, Grafana). Best for teams that already have OTEL set up.
        <br /><br />
        <Pill type="amber">Custom logging</Pill> Structured JSON logs to your existing pipeline. Cheapest. Works if you only need debugging, not fancy visualization. Most production teams start here.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="The 5 metrics every agent needs">
        <strong>1. Success rate</strong> — % of queries that produce a useful response (not an error, not "I don't know"). Target: {'>'} 95%.
        <br /><br />
        <strong>2. Latency p50/p95</strong> — How long users wait. p50 should be under 5 seconds for interactive agents. p95 under 15 seconds.
        <br /><br />
        <strong>3. Cost per query</strong> — Total API cost including all iterations and tool calls. Track mean and p99 (outliers are expensive).
        <br /><br />
        <strong>4. Iterations per query</strong> — How many loops the agent takes. High average = inefficient prompts or poor tool selection. Track distribution, not just mean.
        <br /><br />
        <strong>5. Tool error rate</strong> — % of tool calls that fail. Rising error rate = external API degradation. Alert threshold: {'>'} 5%.
        <br /><br />
        <strong>Mahesh's eval pattern — LLM-as-judge:</strong> Use a stronger model to evaluate a weaker model's outputs. Create a rubric: "Rate this response on correctness (1-5), completeness (1-5), and helpfulness (1-5)." Run this on a sample of production queries. The judge model's scores correlate 80-90% with human evaluators — good enough for automated regression detection, cheap enough to run on every deploy.
      </Decision></FadeIn>

      <FadeIn><Insight>
        "Observability is the answer to 'how do you maintain this in production?' Every interviewer asks it. The answer isn't 'we monitor it' — it's specific: 'We trace every iteration with token counts and latency breakdown. We alert on cost per query exceeding $0.50 and iterations exceeding 8. We review the p95 latency weekly and optimize the slowest tool calls.' Specificity is credibility."
      </Insight></FadeIn>
    </div>
  );
}

function ErrorPanel() {
  return (
    <div>
      <SectionHead
        title="Error recovery patterns"
        desc="Agents fail. APIs timeout, tools return garbage, the LLM hallucinates a tool that doesn't exist. Recovery patterns determine whether your agent gracefully handles failures or crashes in production."
      />

      <FadeIn><Decision question="Retry with exponential backoff">
        The simplest recovery. Tool call failed? Wait 1s, try again. Still failed? Wait 2s. Then 4s. Max 3 retries.
        <br /><br />
        <strong>When to use:</strong> Transient failures — API rate limits, network timeouts, temporary service outages.
        <br /><br />
        <strong>When NOT to use:</strong> Deterministic failures — wrong tool arguments, missing permissions, invalid queries. Retrying these wastes money.
        <br /><br />
        <strong>Implementation:</strong> Check the error type. 429 (rate limit) and 503 (service unavailable) → retry. 400 (bad request) and 403 (forbidden) → don't retry, tell the LLM the error so it can adjust.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Tool fallback chains">
        Primary tool fails → try a secondary tool for the same task. Like DNS fallback or CDN failover.
        <br /><br />
        <strong>Examples:</strong>
        <br />
        — Web search fails → Try a different search engine
        <br />
        — Database query times out → Try a cached version
        <br />
        — Code execution fails → Ask the LLM to reason about the code instead
        <br /><br />
        <strong>Pattern:</strong> Define fallback chains per tool category: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>search: [tavily, serper, brave]</code>. The harness tries each in order. Log which fallback was used — if the primary tool fails {'>'} 10% of the time, investigate.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Graceful degradation — partial answers">
        Sometimes the agent can't fully answer the question. A partial answer is better than no answer.
        <br /><br />
        <strong>Pattern:</strong> Track which subtasks succeeded and which failed. Return what you have with explicit gaps:
        <br /><br />
        "I found your account details and recent transactions. I couldn't access the billing API to check your current invoice — you may need to check that directly at billing.example.com."
        <br /><br />
        <strong>Never silently skip.</strong> If a tool failed, say so. Users trust agents that admit limitations more than agents that confidently provide incomplete information.
      </Decision></FadeIn>

      <FadeIn delay={240}><Decision question="Stuck detection and recovery">
        The agent calls the same tool 3 times in a row with the same arguments. It's stuck.
        <br /><br />
        <strong>Detection:</strong> Track the last 3 (tool_name, args) pairs. If identical, trigger recovery.
        <br /><br />
        <strong>Recovery options:</strong>
        <br />
        (1) Inject a meta-prompt: "You've called this tool 3 times with the same arguments. Consider a different approach."
        <br />
        (2) Force a different tool: Remove the stuck tool from the available tools for 1 iteration.
        <br />
        (3) Escalate: Return a partial response and suggest the user rephrase their question.
        <br /><br />
        <strong>This happens more often than you'd think.</strong> ~5% of complex queries hit a loop. Without detection, they burn 10-50 LLM calls.
      </Decision></FadeIn>

      <FadeIn><Insight>
        "Error recovery is where the 'systems engineer building AI' beats the 'ML engineer building a product.' The patterns are identical to what you'd use in a distributed system — retries with backoff, fallback chains, circuit breakers, graceful degradation. The interviewer isn't testing AI knowledge here — they're testing whether you build resilient systems."
      </Insight></FadeIn>
    </div>
  );
}

function SelfImprovePanel() {
  return (
    <div>
      <SectionHead
        title="Self-improvement loops"
        desc="The best agents get better over time — not through retraining, but through prompt optimization, example curation, and feedback loops that require no ML expertise."
      />

      <FadeIn><Decision question="Human feedback → prompt optimization">
        Users provide implicit feedback: thumbs up/down, rephrasing a question (the original answer was wrong), abandoning the conversation (frustration).
        <br /><br />
        <strong>Pattern:</strong> Log every query + response + feedback signal. Weekly, review the bottom 10% (worst-rated or abandoned queries). Identify patterns — "The agent fails on date calculations" or "Users rephrase whenever the agent gives code in Python instead of JavaScript."
        <br /><br />
        <strong>Fix:</strong> Update the system prompt with explicit instructions addressing the pattern. "When the user's codebase is JavaScript, always provide code examples in JavaScript, not Python."
        <br /><br />
        This isn't ML. It's product iteration powered by data. And it works better than fine-tuning for most use cases.
        <br /><br />
        <strong>Mahesh's real-world example — Claude Code hooks:</strong> Claude Code lets you define hooks — shell commands that run before or after tool calls. A pre-commit hook that runs linting, a post-edit hook that runs tests. This is harness-level self-improvement: the agent's behavior adapts not through prompt changes but through environmental feedback. The harness constrains the horse — hooks are the guardrails on the track.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Few-shot example curation">
        The system prompt includes examples of ideal responses. These examples guide the model's behavior more reliably than instructions.
        <br /><br />
        <strong>Pattern:</strong> Start with 3-5 hand-crafted examples. As the agent handles real queries, identify particularly good responses (high-rated, no follow-ups needed). Add the best real examples to the few-shot set. Remove examples that no longer reflect desired behavior.
        <br /><br />
        <strong>Key insight:</strong> Real examples from production beat synthetic examples every time. They capture edge cases and phrasing that you wouldn't think to include.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Automated eval regression testing">
        Every prompt change risks breaking something. An eval suite catches regressions before they reach users.
        <br /><br />
        <strong>Setup:</strong> Curate 50-100 golden test cases with expected outputs. Run the eval suite on every prompt change. Track pass rate over time.
        <br /><br />
        <strong>Process:</strong>
        <br />
        1. Change the prompt to fix a known issue
        <br />
        2. Run the eval suite — all 100 test cases
        <br />
        3. If pass rate drops, investigate which cases regressed
        <br />
        4. Iterate until the fix doesn't break existing behavior
        <br />
        5. Deploy, then monitor real-world metrics for 24 hours
        <br /><br />
        <strong>This is CI/CD for prompts.</strong> No prompt change ships without passing evals. Period.
      </Decision></FadeIn>

      <FadeIn><Insight>
        "Self-improvement without retraining is the most underrated topic in agent engineering. Fine-tuning is expensive, slow, and often unnecessary. Prompt optimization + few-shot curation + eval regression testing gets you 80% of the benefit at 5% of the cost. In the interview, this shows you think about the full lifecycle — not just building the agent, but operating and improving it."
      </Insight></FadeIn>
    </div>
  );
}

function ProdOpsPanel() {
  return (
    <div>
      <SectionHead
        title="Production operations"
        desc="Running an agent in production is more like running a microservice than deploying a model. You need deployment strategies, rollback plans, and on-call procedures."
      />

      <FadeIn><Decision question="Deployment strategy — canary releases for prompts">
        A prompt change can dramatically alter agent behavior. Deploy like you'd deploy code:
        <br /><br />
        <strong>1. Shadow mode:</strong> Run new prompt alongside old prompt. Compare outputs. No user impact.
        <br />
        <strong>2. Canary:</strong> Route 5% of traffic to new prompt. Monitor success rate, latency, cost. If metrics are stable after 1 hour, increase to 25%.
        <br />
        <strong>3. Full rollout:</strong> After 24 hours with stable metrics, route 100% to new prompt.
        <br />
        <strong>4. Rollback:</strong> If any metric degrades {'>'} 10%, instantly rollback to the previous prompt.
        <br /><br />
        <strong>Key:</strong> Prompts are configuration, not code. Store them in a versioned config system (LaunchDarkly, custom feature flags), not in the codebase. This lets you rollback without a code deploy.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Cost management — preventing budget blowouts">
        A single runaway agent query can cost $50+ if it loops with a large context window. Cost controls are essential:
        <br /><br />
        <strong>Per-query cost cap:</strong> Kill the query if it exceeds $X (typically $0.50-2.00 for consumer, $5-20 for enterprise).
        <br /><br />
        <strong>Per-user daily cap:</strong> Limit total cost per user per day. Prevents abuse and sets user expectations.
        <br /><br />
        <strong>Model tiering:</strong> Use cheap models (Haiku, GPT-3.5) for simple queries, expensive models (Opus, GPT-4) only when needed. A router model (cheapest tier) classifies complexity and selects the model.
        <br /><br />
        <strong>Alert thresholds:</strong> Alert at 2x normal average cost. Page at 5x. Kill switch at 10x.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="On-call for AI agents — what's different?">
        Traditional on-call: the service is up or down. Agent on-call: the service is up but the answers might be wrong. New failure modes:
        <br /><br />
        <strong>Quality degradation:</strong> The agent is responding but answers are worse. Could be: model provider changed behavior, a dependent API returned different data, context window hit capacity. Hard to detect with uptime monitoring alone.
        <br /><br />
        <strong>Cost spike:</strong> A new query pattern triggers expensive loops. The service is "working" but burning 10x normal budget.
        <br /><br />
        <strong>Safety incident:</strong> The agent said something harmful, leaked PII, or hallucinated a dangerous instruction. This is a P0 — immediate response required.
        <br /><br />
        <strong>Mitigation:</strong> Automated quality sampling (eval 1% of queries in real-time), cost anomaly detection, output safety classifier running on every response. Alert the human, don't just log it.
      </Decision></FadeIn>

      <FadeIn><Insight>
        "Production ops for agents is the topic that separates senior from staff. Mahesh's Top 8 advice #5: 'Write workflows as explicit natural-language specs' — your agent's behavior should be documented as clearly as an API contract. Advice #6: 'Add human-in-the-loop correction loops' — not as a fallback, but as a deliberate quality signal. Anyone can build an agent. Running one with canary deployments, cost caps, and an incident response plan — that's what companies pay 2Cr+ for."
      </Insight></FadeIn>
    </div>
  );
}

const styles = {
  back: { fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-block', marginBottom: 16, fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' },
  eyebrow: { fontSize: 11, fontWeight: 500, color: 'var(--text-accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontFamily: 'var(--font-mono)' },
  h1: { fontSize: 34, fontWeight: 400, color: 'var(--text-h)', marginBottom: 10, lineHeight: 1.15, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 14, color: 'var(--text-p)', marginBottom: 8, lineHeight: 1.75 },
  source: { fontSize: 12, color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.6 },
  sourceLink: { color: 'var(--text-accent)', textDecoration: 'underline', textUnderlineOffset: '2px' },
  tabWrap: { display: 'flex', gap: 0, marginBottom: '2rem', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', overflowX: 'auto', scrollbarWidth: 'none' },
  tabBtn: { background: 'transparent', borderTopWidth: 0, borderRightWidth: 0, borderLeftWidth: 0, borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: 'transparent', padding: '10px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', cursor: 'pointer', transition: 'all var(--dur) var(--ease)', fontFamily: 'inherit', whiteSpace: 'nowrap', letterSpacing: '-0.01em' },
  tabActive: { color: 'var(--text-h)', fontWeight: 600, borderBottomColor: 'var(--bg-accent-strong)' },
  sh: { fontSize: 17, fontWeight: 600, color: 'var(--text-h)', marginBottom: 8, letterSpacing: '-0.01em' },
  ss: { fontSize: 13, color: 'var(--text-p)', marginBottom: 16, lineHeight: 1.7 },
};
