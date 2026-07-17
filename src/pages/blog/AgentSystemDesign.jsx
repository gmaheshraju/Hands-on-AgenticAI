import { useState } from 'react';
import { Link } from 'react-router-dom';
import Decision, { Pill } from '../../components/Decision';
import Insight from '../../components/Insight';
import CodeBlock from '../../components/CodeBlock';
import FadeIn from '../../components/FadeIn';

const REACT_LOOP_CODE = `async function agentLoop(userMessage, tools, maxIterations = 5) {
  const messages = [{ role: 'user', content: userMessage }];

  for (let i = 0; i < maxIterations; i++) {
    // THINK: call LLM with current context
    const response = await callLLM(messages);

    // CHECK: if no tool calls, we're done — return the response
    if (!response.toolCalls?.length) return response.text;

    // ACT: execute each tool call
    for (const call of response.toolCalls) {
      const tool = tools[call.name];
      if (!tool) throw new Error(\`Unknown tool: \${call.name}\`);

      const result = await tool.execute(call.args);
      messages.push(
        { role: 'assistant', content: null, tool_calls: [call] },
        { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) }
      );
    }
  }
  return 'Max iterations reached. Returning partial result.';
}`;

const TOOL_DISPATCH_CODE = `// Define tools as schemas the LLM understands
const tools = {
  searchOrders: {
    description: 'Search customer orders by email or order ID',
    parameters: {
      type: 'object',
      properties: {
        email:    { type: 'string', description: 'Customer email' },
        orderId:  { type: 'string', description: 'Order ID like ORD-12345' },
      },
    },
    execute: async ({ email, orderId }) => {
      return db.orders.find({ \$or: [{ email }, { orderId }] });
    },
  },

  processRefund: {
    description: 'Process a refund for an order. Use ONLY after confirming with customer.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        reason:  { type: 'string', enum: ['defective', 'wrong_item', 'changed_mind'] },
      },
      required: ['orderId', 'reason'],
    },
    execute: async ({ orderId, reason }) => {
      const order = await db.orders.findOne({ orderId });
      if (order.total > 500) return { status: 'escalated', reason: 'Amount exceeds auto-refund limit' };
      return payments.refund(order.paymentId, { reason });
    },
  },
};

// The dispatcher — called by the agent loop
async function dispatchTool(toolName, args) {
  const tool = tools[toolName];
  if (!tool) return { error: \`Unknown tool: \${toolName}\` };
  try {
    return { result: await tool.execute(args) };
  } catch (err) {
    return { error: err.message };  // Return error to LLM, don't crash
  }
}`;

const REACT_LOOP_OUTPUT = `> agentLoop("What's the status of order ORD-28491?", tools)

[iteration 1] Tool call: searchOrders({ orderId: "ORD-28491" })
  → { orderId: "ORD-28491", status: "shipped", tracking: "1Z999AA1" }

[iteration 2] Tool call: getTrackingDetails({ trackingId: "1Z999AA1" })
  → { carrier: "UPS", estimatedDelivery: "2026-07-12", lastLocation: "Mumbai Hub" }

[iteration 3] No tool calls — returning final response.

✓ "Your order ORD-28491 has shipped via UPS. It's currently at
  the Mumbai Hub with estimated delivery tomorrow (July 12)."

Completed in 3 iterations.`;

const TOOL_DISPATCH_OUTPUT = `> dispatchTool("searchOrders", { email: "user@example.com" })
{ result: [
    { orderId: "ORD-28491", status: "shipped", total: 2499 },
    { orderId: "ORD-27832", status: "delivered", total: 899 }
  ]
}

> dispatchTool("processRefund", { orderId: "ORD-28491", reason: "defective" })
{ status: "escalated", reason: "Amount exceeds auto-refund limit" }

> dispatchTool("unknownTool", { foo: "bar" })
{ error: "Unknown tool: unknownTool" }`;

const TABS = ['Architecture', 'RAG Pipeline', 'Function Calling', 'Evals & Guardrails', 'Real Systems', 'Anti-patterns'];

export default function AgentSystemDesign() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <Link to="/blog" style={styles.back}>&larr; AI Engineering</Link>
      <p style={styles.eyebrow}>Post 01</p>
      <h1 style={styles.h1}>AI Agent System Design</h1>
      <p style={styles.subtitle}>
        How to architect a production AI agent — from data ingestion to response generation.
        Not "call the OpenAI API" — the full system: RAG pipelines, vector databases,
        function calling, evaluation loops, and guardrails.
      </p>

      <div style={styles.tabWrap}>
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            style={{ ...styles.tabBtn, ...(tab === i ? styles.tabActive : {}) }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <ArchitecturePanel />}
      {tab === 1 && <RagPanel />}
      {tab === 2 && <FunctionCallingPanel />}
      {tab === 3 && <EvalsPanel />}
      {tab === 4 && <RealSystemsPanel />}
      {tab === 5 && <AntiPatternsPanel />}

      <FadeIn><div style={{ marginTop: 48, padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Capstone Project</p>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-h)', marginBottom: 6 }}>PR Review Agent</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Build the real thing. Production-grade project brief with architecture requirements, evaluation criteria, and deep dive into production patterns.</p>
        <a href="https://github.com/gmaheshraju/Hands-on-AgenticAI/blob/main/projects/01-agent-system-design.md" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--text-accent)', textDecoration: 'none', fontWeight: 500 }}>View project brief on GitHub →</a>
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

function AgentArchDiagram() {
  const f = 'var(--font-body)';
  const fm = 'var(--font-mono)';

  return (
    <div style={{ overflowX: 'auto', margin: '20px 0' }}>
      <svg viewBox="0 0 740 520" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', display: 'block' }}>
        <defs>
          <marker id="bah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="var(--text-muted)" opacity="0.7" />
          </marker>
          <marker id="bahAccent" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="var(--text-accent)" opacity="0.8" />
          </marker>
        </defs>

        {/* Title */}
        <text x="370" y="22" textAnchor="middle" fontSize="14" fontWeight="400" fill="var(--text-h)" fontFamily="var(--font-display)">Production AI Agent Architecture</text>
        <text x="370" y="38" textAnchor="middle" fontSize="9" fill="var(--text-muted)" fontFamily={fm}>User Query → Orchestrator → Tools + RAG → LLM → Response</text>

        {/* Zone backgrounds */}
        <rect x="0" y="48" width="740" height="72" fill="var(--bg-code)" opacity="0.3" />
        <rect x="0" y="132" width="740" height="100" fill="var(--bg-card)" opacity="0.15" />
        <rect x="0" y="244" width="740" height="110" fill="var(--bg-code)" opacity="0.3" />
        <rect x="0" y="366" width="740" height="90" fill="var(--bg-card)" opacity="0.15" />

        {/* Lane labels */}
        <text x="12" y="68" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.1em">INPUT</text>
        <text x="12" y="155" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.1em">ORCHESTRATION</text>
        <text x="12" y="268" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.1em">RETRIEVAL + TOOLS</text>
        <text x="12" y="390" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.1em">GENERATION</text>

        {/* ── INPUT LANE ── */}
        {/* User */}
        <g>
          <circle cx="80" cy="90" r="16" fill="none" stroke="var(--border-strong)" strokeWidth="1.2" />
          <circle cx="80" cy="84" r="4.5" fill="var(--text-muted)" opacity="0.5" />
          <path d="M72 96 Q80 92 88 96" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" opacity="0.5" />
          <text x="80" y="114" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>User</text>
        </g>

        {/* API Gateway */}
        <rect x="160" y="68" width="100" height="46" rx="8" fill="#E7157B" opacity="0.08" stroke="#E7157B" strokeWidth="1.2" />
        <rect x="166" y="74" width="14" height="14" rx="3" fill="#E7157B" opacity="0.9" />
        <text x="210" y="88" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>API Gateway</text>
        <text x="210" y="104" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>auth + rate limit</text>

        {/* Input Processing */}
        <rect x="310" y="68" width="110" height="46" rx="8" fill="#3949AB" opacity="0.08" stroke="#3949AB" strokeWidth="1.2" />
        <rect x="316" y="74" width="14" height="14" rx="3" fill="#3949AB" opacity="0.9" />
        <text x="365" y="88" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Input Guard</text>
        <text x="365" y="104" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>PII · injection · classify</text>

        {/* Input arrows */}
        <line x1="96" y1="90" x2="158" y2="90" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#bah)" />
        <line x1="262" y1="90" x2="308" y2="90" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#bah)" />

        {/* ── ORCHESTRATION LANE ── */}
        {/* Agent Loop */}
        <rect x="160" y="148" width="280" height="68" rx="10" fill="var(--text-accent)" opacity="0.06" stroke="var(--text-accent)" strokeWidth="1.2" strokeDasharray="6 3" />
        <text x="170" y="163" fontSize="8" fontWeight="700" fill="var(--text-accent)" fontFamily={fm}>AGENT LOOP</text>

        <rect x="180" y="172" width="100" height="36" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="230" y="188" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Planner</text>
        <text x="230" y="200" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>ReAct / CoT</text>

        <rect x="310" y="172" width="110" height="36" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="365" y="188" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Tool Router</text>
        <text x="365" y="200" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>function dispatch</text>

        <line x1="282" y1="190" x2="308" y2="190" stroke="var(--text-muted)" strokeWidth="1" fill="none" markerEnd="url(#bah)" />

        {/* Loop arrow */}
        <path d="M365,210 L365,222 L200,222 L200,210" stroke="var(--text-accent)" strokeWidth="1" fill="none" strokeDasharray="4 2" markerEnd="url(#bahAccent)" />
        <text x="283" y="234" textAnchor="middle" fontSize="7" fill="var(--text-accent)" fontFamily={fm}>iterate until done</text>

        {/* Input → Orchestration */}
        <polyline points="365,116 365,130 300,130 300,146" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#bah)" />

        {/* Memory (right side) */}
        <rect x="500" y="148" width="100" height="46" rx="8" fill="#C925D1" opacity="0.08" stroke="#C925D1" strokeWidth="1.2" />
        <rect x="506" y="154" width="14" height="14" rx="3" fill="#C925D1" opacity="0.9" />
        <text x="550" y="170" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Memory</text>
        <text x="550" y="186" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>conversation + facts</text>

        <line x1="442" y1="180" x2="498" y2="172" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3 3" fill="none" markerEnd="url(#bah)" />

        {/* ── RETRIEVAL + TOOLS LANE ── */}
        {/* RAG Pipeline */}
        <rect x="80" y="260" width="110" height="52" rx="8" fill="#3F8624" opacity="0.08" stroke="#3F8624" strokeWidth="1.2" />
        <rect x="86" y="266" width="14" height="14" rx="3" fill="#3F8624" opacity="0.9" />
        <text x="135" y="282" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>RAG Pipeline</text>
        <text x="135" y="298" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>embed → search → rerank</text>

        {/* Vector DB */}
        <rect x="80" y="322" width="110" height="32" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="135" y="342" textAnchor="middle" fontSize="9" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Vector DB</text>

        <line x1="135" y1="314" x2="135" y2="320" stroke="var(--text-muted)" strokeWidth="1" fill="none" markerEnd="url(#bah)" />

        {/* Function Calling */}
        <rect x="240" y="260" width="110" height="52" rx="8" fill="#ED7100" opacity="0.08" stroke="#ED7100" strokeWidth="1.2" />
        <rect x="246" y="266" width="14" height="14" rx="3" fill="#ED7100" opacity="0.9" />
        <text x="295" y="282" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Functions</text>
        <text x="295" y="298" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>APIs · DB · search</text>

        {/* Code Execution */}
        <rect x="400" y="260" width="110" height="52" rx="8" fill="#8C4FFF" opacity="0.08" stroke="#8C4FFF" strokeWidth="1.2" />
        <rect x="406" y="266" width="14" height="14" rx="3" fill="#8C4FFF" opacity="0.9" />
        <text x="455" y="282" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Code Exec</text>
        <text x="455" y="298" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>sandbox · REPL</text>

        {/* Web Search */}
        <rect x="560" y="260" width="110" height="52" rx="8" fill="#E7157B" opacity="0.08" stroke="#E7157B" strokeWidth="1.2" />
        <rect x="566" y="266" width="14" height="14" rx="3" fill="#E7157B" opacity="0.9" />
        <text x="615" y="282" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Web Search</text>
        <text x="615" y="298" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>Tavily · Serper</text>

        {/* Tool Router → Tools (fan out) */}
        <line x1="230" y1="210" x2="135" y2="258" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#bah)" />
        <line x1="310" y1="210" x2="295" y2="258" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#bah)" />
        <line x1="380" y1="210" x2="455" y2="258" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#bah)" />
        <line x1="420" y1="210" x2="615" y2="258" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3 3" fill="none" markerEnd="url(#bah)" />

        {/* ── GENERATION LANE ── */}
        {/* LLM */}
        <rect x="200" y="380" width="140" height="52" rx="8" fill="var(--text-accent)" opacity="0.08" stroke="var(--text-accent)" strokeWidth="1.2" />
        <rect x="206" y="386" width="14" height="14" rx="3" fill="var(--text-accent)" opacity="0.9" />
        <text x="270" y="402" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-h)" fontFamily={f}>LLM</text>
        <text x="270" y="418" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>Claude · GPT-4 · Gemini</text>

        {/* Output Guard */}
        <rect x="400" y="380" width="110" height="52" rx="8" fill="#3949AB" opacity="0.08" stroke="#3949AB" strokeWidth="1.2" />
        <rect x="406" y="386" width="14" height="14" rx="3" fill="#3949AB" opacity="0.9" />
        <text x="455" y="402" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Output Guard</text>
        <text x="455" y="418" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>hallucination · tone</text>

        {/* Response */}
        <rect x="570" y="384" width="90" height="44" rx="8" fill="var(--bg-card)" stroke="var(--border-strong)" strokeWidth="1.2" />
        <text x="615" y="404" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Response</text>
        <text x="615" y="418" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>stream to user</text>

        {/* Orchestration → LLM */}
        <polyline points="300,222 300,340 270,340 270,378" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" markerEnd="url(#bahAccent)" />
        <text x="286" y="355" fontSize="8" fontWeight="600" fill="var(--text-accent)" fontFamily={fm}>context</text>

        {/* LLM → Output Guard → Response */}
        <line x1="342" y1="406" x2="398" y2="406" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#bah)" />
        <line x1="512" y1="406" x2="568" y2="406" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#bah)" />

        {/* ── OPS sidebar ── */}
        <text x="660" y="390" fontSize="8" fontWeight="700" fill="var(--text-muted)" fontFamily={fm} letterSpacing="0.08em">OPS</text>

        <rect x="640" y="68" width="80" height="36" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="680" y="84" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Tracing</text>
        <text x="680" y="96" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>LangSmith</text>

        <rect x="640" y="112" width="80" height="36" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="680" y="128" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Evals</text>
        <text x="680" y="140" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>Braintrust</text>

        <rect x="640" y="156" width="80" height="36" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="680" y="172" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Logging</text>
        <text x="680" y="184" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>cost · latency</text>

        {/* Dashed lines to ops */}
        <line x1="440" y1="180" x2="638" y2="86" stroke="var(--border-strong)" strokeWidth="0.7" strokeDasharray="3 3" fill="none" />
        <line x1="440" y1="190" x2="638" y2="130" stroke="var(--border-strong)" strokeWidth="0.7" strokeDasharray="3 3" fill="none" />

        {/* ── Key Decisions bar ── */}
        <rect x="18" y="470" width="704" height="40" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.6" />
        <text x="30" y="490" fontSize="8" fontWeight="700" fill="var(--text-accent)" fontFamily={fm}>FLOW</text>
        <text x="70" y="490" fontSize="8" fill="var(--text-p)" fontFamily={f}>Query → Guard → Plan → Route Tools → Gather Context → LLM → Guard → Stream</text>
        <text x="30" y="502" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>Agent loops 2-5x per complex query · Each iteration adds tool results to context window</text>
      </svg>
    </div>
  );
}

function RagPipelineDiagram() {
  const f = 'var(--font-body)';
  const fm = 'var(--font-mono)';

  return (
    <div style={{ overflowX: 'auto', margin: '20px 0' }}>
      <svg viewBox="0 0 720 340" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', display: 'block' }}>
        <defs>
          <marker id="rah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="var(--text-muted)" opacity="0.7" />
          </marker>
          <marker id="rahA" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="var(--text-accent)" opacity="0.8" />
          </marker>
        </defs>

        <text x="360" y="22" textAnchor="middle" fontSize="14" fontWeight="400" fill="var(--text-h)" fontFamily="var(--font-display)">RAG Pipeline — Ingestion + Retrieval</text>

        {/* ── TOP ROW: INGESTION ── */}
        <rect x="0" y="40" width="720" height="70" fill="var(--bg-code)" opacity="0.3" />
        <text x="12" y="58" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.1em">INGEST</text>

        <rect x="60" y="52" width="90" height="44" rx="8" fill="#3F8624" opacity="0.08" stroke="#3F8624" strokeWidth="1.2" />
        <text x="105" y="72" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Documents</text>
        <text x="105" y="86" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>PDF · MD · HTML</text>

        <rect x="190" y="52" width="90" height="44" rx="8" fill="#ED7100" opacity="0.08" stroke="#ED7100" strokeWidth="1.2" />
        <text x="235" y="72" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Chunker</text>
        <text x="235" y="86" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>recursive · semantic</text>

        <rect x="320" y="52" width="90" height="44" rx="8" fill="#8C4FFF" opacity="0.08" stroke="#8C4FFF" strokeWidth="1.2" />
        <text x="365" y="72" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Embedder</text>
        <text x="365" y="86" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>text-embedding-3</text>

        <rect x="450" y="52" width="100" height="44" rx="8" fill="#C925D1" opacity="0.08" stroke="#C925D1" strokeWidth="1.2" />
        <text x="500" y="72" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Vector Store</text>
        <text x="500" y="86" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>Pinecone · pgvector</text>

        <line x1="152" y1="74" x2="188" y2="74" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#rah)" />
        <line x1="282" y1="74" x2="318" y2="74" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#rah)" />
        <line x1="412" y1="74" x2="448" y2="74" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#rah)" />

        {/* Metadata store */}
        <rect x="600" y="52" width="90" height="44" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="645" y="72" textAnchor="middle" fontSize="9" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Metadata</text>
        <text x="645" y="86" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>source · date · ACL</text>

        <line x1="552" y1="74" x2="598" y2="74" stroke="var(--border-strong)" strokeWidth="0.8" strokeDasharray="3 3" fill="none" markerEnd="url(#rah)" />

        {/* ── BOTTOM ROW: RETRIEVAL ── */}
        <rect x="0" y="130" width="720" height="70" fill="var(--bg-card)" opacity="0.15" />
        <text x="12" y="148" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.1em">RETRIEVE</text>

        <rect x="60" y="142" width="90" height="44" rx="8" fill="var(--bg-card)" stroke="var(--border-strong)" strokeWidth="1.2" />
        <text x="105" y="162" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>User Query</text>
        <text x="105" y="176" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>natural language</text>

        <rect x="190" y="142" width="90" height="44" rx="8" fill="#8C4FFF" opacity="0.08" stroke="#8C4FFF" strokeWidth="1.2" />
        <text x="235" y="162" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Embed</text>
        <text x="235" y="176" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>same model</text>

        <rect x="320" y="142" width="100" height="44" rx="8" fill="#C925D1" opacity="0.08" stroke="#C925D1" strokeWidth="1.2" />
        <text x="370" y="162" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Hybrid Search</text>
        <text x="370" y="176" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>vector + BM25</text>

        <rect x="460" y="142" width="90" height="44" rx="8" fill="#E7157B" opacity="0.08" stroke="#E7157B" strokeWidth="1.2" />
        <text x="505" y="162" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Reranker</text>
        <text x="505" y="176" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>Cohere · cross-enc</text>

        <rect x="590" y="142" width="100" height="44" rx="8" fill="var(--text-accent)" opacity="0.08" stroke="var(--text-accent)" strokeWidth="1.2" />
        <text x="640" y="162" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Context</text>
        <text x="640" y="176" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>top-k → prompt</text>

        <line x1="152" y1="164" x2="188" y2="164" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#rah)" />
        <line x1="282" y1="164" x2="318" y2="164" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#rah)" />
        <line x1="422" y1="164" x2="458" y2="164" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#rah)" />
        <line x1="552" y1="164" x2="588" y2="164" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" markerEnd="url(#rahA)" />

        {/* Vector DB connection between rows */}
        <line x1="500" y1="98" x2="370" y2="140" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 3" fill="none" markerEnd="url(#rah)" />

        {/* ── NUMBERS BAR ── */}
        <rect x="18" y="220" width="684" height="110" rx="8" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.6" />
        <text x="36" y="242" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm}>PRODUCTION NUMBERS</text>

        <text x="36" y="264" fontSize="8" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Chunk size</text>
        <text x="36" y="278" fontSize="8" fill="var(--text-p)" fontFamily={f}>512-1024 tokens. Smaller = precise retrieval, larger = more context per hit.</text>

        <text x="36" y="298" fontSize="8" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Top-k</text>
        <text x="36" y="312" fontSize="8" fill="var(--text-p)" fontFamily={f}>Retrieve 20, rerank to 5. Reranking improves relevance 15-30% over vector-only.</text>

        <text x="380" y="264" fontSize="8" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Embedding model</text>
        <text x="380" y="278" fontSize="8" fill="var(--text-p)" fontFamily={f}>text-embedding-3-large (3072d) or Cohere embed-v3. Don't mix models.</text>

        <text x="380" y="298" fontSize="8" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Latency budget</text>
        <text x="380" y="312" fontSize="8" fill="var(--text-p)" fontFamily={f}>Embed: 20ms · Search: 50ms · Rerank: 100ms · Total retrieval: &lt;200ms.</text>
      </svg>
    </div>
  );
}

function ArchitecturePanel() {
  return (
    <div>
      <SectionHead
        title="The 5-layer agent architecture"
        desc="Every production AI agent has the same bones: input processing, orchestration loop, tools + retrieval, generation, and output guards. The quality difference is in the orchestration loop and the evaluation pipeline — not the LLM."
      />

      <AgentArchDiagram />

      <div style={{ background: 'var(--bg-code)', borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)', borderRightWidth: 1, borderRightStyle: 'solid', borderRightColor: 'var(--border)', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: 'var(--bg-accent-strong)', borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-accent)', marginBottom: 6, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>MAHESH'S FRAMEWORK</p>
        <p style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.65, marginBottom: 8 }}>
          Mahesh structures his AI agent as three specialized agents working together through an <strong>e-Commerce customer support</strong> use case:
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.65, marginBottom: 4 }}>
          <strong>1. Router Agent</strong> — classifies user intent (product question vs order issue vs complaint) and routes to the right specialist.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.65, marginBottom: 4 }}>
          <strong>2. Q&A Agent (the "Brain/CEO")</strong> — handles knowledge-grounded responses using RAG over the product catalog and help articles. This is the agent that actually talks to the user.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.65, marginBottom: 4 }}>
          <strong>3. Planner Agent</strong> — decomposes complex multi-step tasks (returns, exchanges, account changes) into executable action sequences with function calls.
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 8, fontStyle: 'italic' }}>
          This isn't three models — it's three system prompts with different tool sets, potentially running on the same LLM. The architecture decision is about context isolation and tool scoping, not model count.
        </p>
      </div>

      <FadeIn><CodeBlock filename="agent-loop.js" code={REACT_LOOP_CODE} output={REACT_LOOP_OUTPUT} /></FadeIn>

      <FadeIn><Decision question="What makes this different from 'just calling the API'?">
        A raw LLM call is stateless, has no tools, no memory, and no guardrails. A production agent adds: (1) an orchestration loop that plans multi-step actions, (2) tool access for real-time data, (3) RAG for domain knowledge, (4) memory across conversations, and (5) input/output guards for safety. The LLM is ~20% of the system — the other 80% is infrastructure.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="ReAct vs Plan-then-Execute — which orchestration pattern?">
        <Pill type="green">ReAct</Pill> Interleave reasoning and action. Think → Act → Observe → Think. Best for exploratory tasks where the next step depends on what you find. Used by Claude, ChatGPT.
        <br /><br />
        <Pill type="amber">Plan-then-Execute</Pill> Generate a full plan upfront, then execute steps. Best for well-defined tasks where the steps are predictable. Used by AutoGPT-style agents. Brittle — the plan breaks when reality diverges.
        <br /><br />
        <strong>Default to ReAct.</strong> Plan-then-Execute only works when the task is highly structured and the tools are deterministic.
        <br /><br />
        <strong>Mahesh's key insight:</strong> "AI Agents vs Deterministic Workflows" — don't build an agent when a workflow suffices. If every step is predictable and the logic never branches on LLM output, use a deterministic workflow (Temporal, Step Functions). Agents shine when the next action depends on reasoning about the result of the previous action.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="How many iterations should the agent loop run?">
        Cap at 5-10 iterations. Most useful queries resolve in 2-3 tool calls. If the agent is looping more than 5 times, it's likely stuck — add a circuit breaker that escalates to a human or returns a partial answer. Cost scales linearly with iterations (each loop is a full LLM call with growing context).
      </Decision></FadeIn>

      <FadeIn><Insight>
        "What matters is not that you'd use LangChain. Senior engineers look for reasoning about the tradeoffs: why ReAct over plan-and-execute, why you'd cap iterations at 5, why you need both input and output guards. The framework choice is the last sentence — the architecture reasoning demonstrates depth."
      </Insight></FadeIn>
    </div>
  );
}

function RagPanel() {
  return (
    <div>
      <SectionHead
        title="RAG: retrieval-augmented generation"
        desc="RAG is how agents access domain knowledge that isn't in the LLM's training data. The pipeline has two phases — ingestion (offline) and retrieval (real-time). Getting retrieval wrong means the LLM hallucinates with confidence."
      />

      <RagPipelineDiagram />

      <FadeIn><Decision question="When do you need RAG vs fine-tuning?">
        <Pill type="green">RAG</Pill> When knowledge changes frequently, when you need citations/sources, when you have access control requirements, when data is too large to fit in context. Most production use cases.
        <br /><br />
        <Pill type="amber">Fine-tuning</Pill> When you need to change the model's behavior/style/format, not its knowledge. E.g., making it respond in a specific JSON schema, adopting a brand voice, or learning domain-specific reasoning patterns.
        <br /><br />
        <strong>They're complementary, not competing.</strong> Fine-tune for behavior, RAG for knowledge. Stripe uses both — fine-tuned model for understanding payment jargon, RAG for retrieving specific API docs.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Chunking strategy — recursive vs semantic?">
        <Pill type="green">Recursive character</Pill> Split by paragraph → sentence → character, respecting natural boundaries. Simple, fast, works for 80% of cases. Use with 512-1024 token chunks and 20% overlap.
        <br /><br />
        <Pill type="amber">Semantic chunking</Pill> Use embeddings to detect topic boundaries. Better for documents with mixed topics (e.g., a long report covering multiple subjects). 2-3x slower to ingest.
        <br /><br />
        Start with recursive. Switch to semantic only when retrieval quality is provably poor on topic-switching documents.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Vector-only search vs hybrid?">
        Vector search alone misses exact keyword matches (product names, error codes, IDs). Hybrid search combines vector similarity (semantic) with BM25 (keyword). In production benchmarks, hybrid + reranking beats vector-only by 15-30% on relevance metrics.
        <br /><br />
        <strong>Stack: </strong> Retrieve 20 candidates via hybrid search → Rerank with a cross-encoder (Cohere Rerank, BGE Reranker) → Take top 5 → Inject into prompt.
      </Decision></FadeIn>

      <FadeIn><Insight>
        "I'd use hybrid search with reranking rather than pure vector similarity. Vector search is great for semantic matching, but it misses exact terms — if a user asks about error code E_TIMEOUT, vector search might return results about 'connection issues' instead of the exact error. BM25 catches those exact matches. The reranker then sorts the combined results by actual relevance to the query, which improves answer quality by 15-30% in our benchmarks."
      </Insight></FadeIn>
    </div>
  );
}

function FunctionCallingPanel() {
  return (
    <div>
      <SectionHead
        title="Function calling: giving agents hands"
        desc="Function calling lets the LLM invoke structured tools — APIs, databases, search engines, code execution. The LLM decides WHICH tool to call and WITH WHAT arguments. You execute the tool and return the result."
      />

      <FadeIn><Decision question="How does function calling actually work?">
        You define tools as JSON schemas (name, description, parameters). The LLM's response includes a tool_use block instead of text. You execute the function, return the result, and the LLM incorporates it into its next response.
        <br /><br />
        <strong>Critical:</strong> The LLM never executes code directly. It outputs structured JSON saying "call this function with these args." Your application layer executes it in a sandbox and returns the result. This is the security boundary.
      </Decision></FadeIn>

      <FadeIn><CodeBlock filename="tool-dispatch.js" code={TOOL_DISPATCH_CODE} output={TOOL_DISPATCH_OUTPUT} /></FadeIn>

      <FadeIn><Decision question="How many tools should an agent have?">
        <Pill type="green">5-15 tools</Pill> Sweet spot for most agents. Enough capability without confusing the LLM.
        <br /><br />
        <Pill type="red">50+ tools</Pill> Tool selection accuracy drops significantly. The LLM struggles to pick the right tool from a large set.
        <br /><br />
        <strong>Solutions for many tools:</strong> (1) Two-stage routing — first classify the intent, then load only relevant tools. (2) Tool descriptions matter more than tool count — a well-described tool with clear "when to use" guidance beats 10 poorly described ones.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Parallel vs sequential tool calling?">
        <Pill type="green">Parallel</Pill> When tools are independent. "Get weather AND stock price" — both can run simultaneously. Reduces latency by 2-5x.
        <br /><br />
        <Pill type="amber">Sequential</Pill> When tool B depends on tool A's result. "Search for user → Get their orders → Calculate total." Must be serial.
        <br /><br />
        Claude and GPT-4 both support parallel tool calling natively. Always prefer parallel when dependencies allow — users notice the latency difference.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Error handling in tool calls?">
        Tools fail. APIs timeout, databases return empty, search finds nothing. The agent needs to handle this gracefully:
        <br /><br />
        (1) Return the error to the LLM — let it decide whether to retry, try a different tool, or inform the user.
        <br />
        (2) Set a retry limit (2-3 attempts max) with exponential backoff.
        <br />
        (3) Always have a fallback response: "I couldn't access that data, but based on what I know..."
        <br /><br />
        <strong>Never silently swallow tool errors.</strong> A hallucinated answer from a failed tool call is worse than admitting the failure.
      </Decision></FadeIn>

      <FadeIn><Insight>
        "The maturity signal is in how you handle the unhappy path. Anyone can describe the happy path — LLM picks tool, tool returns data, LLM answers. Senior engineering perspective: what happens when the tool times out? What if it returns stale data? What if the LLM picks the wrong tool? You need retry logic, circuit breakers, and graceful degradation — the same patterns you'd use in any distributed system."
      </Insight></FadeIn>
    </div>
  );
}

function EvalsPanel() {
  return (
    <div>
      <SectionHead
        title="Evals & guardrails: the quality gate"
        desc="An AI agent without evals is a demo. Production agents need automated evaluation on every change — model upgrades, prompt edits, tool additions. Guardrails prevent the agent from going off the rails in real-time."
      />

      <FadeIn><Decision question="What should you eval?">
        Five dimensions, in priority order:
        <br /><br />
        <strong>1. Correctness</strong> — Does the answer actually answer the question? (LLM-as-judge + human spot-check)
        <br />
        <strong>2. Groundedness</strong> — Is every claim supported by retrieved context? (Automated: check if answer spans appear in context)
        <br />
        <strong>3. Relevance</strong> — Did RAG retrieve the right documents? (Automated: precision@k, recall@k)
        <br />
        <strong>4. Safety</strong> — Does the response violate any policies? (Classifier: toxicity, PII leakage, off-topic)
        <br />
        <strong>5. Latency/cost</strong> — Is it fast enough and cheap enough? (Automated: p50/p95 latency, $/query)
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="LLM-as-judge — does it work?">
        <Pill type="green">Yes, with guardrails</Pill> Use a stronger model to judge a weaker one (Claude judging GPT-3.5 outputs). Agreement with human evaluators is 80-90% on factual correctness. Use rubrics — don't just ask "is this good?"
        <br /><br />
        <strong>The pattern:</strong> Create a golden dataset of 50-100 question-answer pairs with human-verified correct answers. Run your agent on these questions. Use LLM-as-judge to score. Track regression over time. When the score drops, investigate before shipping.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="What guardrails do you need in production?">
        <strong>Input guards</strong> (before the LLM sees the query):
        <br />
        — PII detection and redaction (names, emails, SSNs)
        <br />
        — Prompt injection detection (ignore previous instructions...)
        <br />
        — Topic classification (is this in-scope for the agent?)
        <br /><br />
        <strong>Output guards</strong> (before the user sees the response):
        <br />
        — Hallucination detection (claims not grounded in context)
        <br />
        — Tone/brand compliance
        <br />
        — Sensitive content filtering
        <br /><br />
        Guards add 50-200ms latency. Worth it. A single hallucinated medical or financial claim can destroy trust.
      </Decision></FadeIn>

      <FadeIn><Insight>
        "Evals + Memory are the moats of AI products" — Mahesh's Top 8 Advice. Anyone can build a demo agent in a weekend. The production gap is the eval pipeline. Mahesh's rule: treat evals like CI/CD — no prompt change ships without passing your golden test cases. When you upgrade the model, compare outputs side-by-side. "Add continuous evals" is advice #8 on his list, and it's last because it's the one teams skip — and the one that separates shipped products from abandoned demos.
      </Insight></FadeIn>
    </div>
  );
}

function RealSystemsPanel() {
  return (
    <div>
      <SectionHead
        title="Real production agent architectures"
        desc="How actual companies architect their AI agents — from customer support to code generation. These are the examples that demonstrate staff+ thinking in practice."
      />

      <div style={styles.systemCard}>
        <h3 style={styles.systemName}>Mahesh's e-Commerce Agent — The Reference Architecture</h3>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Architecture</span>
          <span style={styles.sysVal}>Three-agent system: Router (intent classification) {'>'} Q&A Agent with RAG over product catalog + help articles {'>'} Planner Agent for multi-step order operations. User Auth Gateway at the entry point. Each agent has scoped tools — the Q&A agent can search but can't modify orders.</span>
        </div>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Key insight</span>
          <span style={styles.sysVal}>The Router isn't an LLM call — it's a lightweight classifier that runs in &lt;50ms. Only the Q&A and Planner agents use full LLM inference. This keeps 60% of queries fast (simple product questions) while reserving expensive reasoning for complex operations.</span>
        </div>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>From Mahesh</span>
          <span style={styles.sysVal}>"When to Loop in Humans" — the Planner Agent has a confidence threshold. Order cancellations above $500 always escalate. Refund requests with shipping disputes always escalate. The agent handles the 80% — humans handle the 20% that needs judgment.</span>
        </div>
      </div>

      <div style={styles.systemCard}>
        <h3 style={styles.systemName}>Cursor / Claude Code — Code Agent</h3>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Architecture</span>
          <span style={styles.sysVal}>ReAct loop with file system + terminal tools. Code indexing via tree-sitter for AST-aware retrieval. Embedding-based codebase search + grep fallback (hybrid).</span>
        </div>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Key insight</span>
          <span style={styles.sysVal}>Context window management is the core challenge. A 200K token window sounds huge until you load 5 files. Solution: summarize distant context, keep recent edits verbatim.</span>
        </div>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Tools</span>
          <span style={styles.sysVal}>Read file, Edit file, Terminal, Search codebase, List directory. ~8 tools total — focused, not sprawling.</span>
        </div>
      </div>

      <div style={styles.systemCard}>
        <h3 style={styles.systemName}>Perplexity — Research Agent</h3>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Architecture</span>
          <span style={styles.sysVal}>Query → Web search (multiple engines) → Scrape top results → Chunk + embed on-the-fly → Rerank → Generate with citations. Real-time RAG — no pre-built index.</span>
        </div>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Key insight</span>
          <span style={styles.sysVal}>Latency optimization: start streaming the answer while still fetching later search results. The first paragraph comes from the first 3 results, subsequent paragraphs incorporate later results.</span>
        </div>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Scale</span>
          <span style={styles.sysVal}>100M+ queries/month. Each query triggers 5-10 web fetches, making the search cost the dominant expense — not the LLM.</span>
        </div>
      </div>

      <div style={styles.systemCard}>
        <h3 style={styles.systemName}>Intercom Fin — Customer Support Agent</h3>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Architecture</span>
          <span style={styles.sysVal}>RAG over help center articles + conversation history. Confidence scoring — only auto-responds above threshold, escalates to human below it. Multi-turn memory within a ticket.</span>
        </div>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Key insight</span>
          <span style={styles.sysVal}>The confidence threshold is the product decision, not the architecture decision. Too high = too many escalations (expensive). Too low = wrong answers (trust-destroying). They tuned it per-customer.</span>
        </div>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Guardrails</span>
          <span style={styles.sysVal}>Never make promises the company can't keep. Never discuss competitors. Never reveal internal processes. These are hard-coded output filters, not prompt instructions.</span>
        </div>
      </div>

      <FadeIn><Insight>
        "When asked to design a customer support agent, don't just describe the RAG pipeline. Talk about the confidence threshold — it's the most important product decision. Then talk about the escalation path, the feedback loop (human corrections improve the system), and the hard-coded guardrails. That's what separates an engineer who's built one from someone who's read about one."
      </Insight></FadeIn>
    </div>
  );
}

function AntiPatternsPanel() {
  return (
    <div>
      <SectionHead
        title="Anti-patterns that reveal shallow thinking"
        desc="The most common mistakes when discussing AI agent architecture in design reviews."
      />

      <div style={styles.anti}>
        <p style={styles.strike}>"I'd use LangChain to build the agent."</p>
        <p style={styles.better}><span style={{...styles.dot, background: 'var(--text-success)'}} />LangChain is an implementation detail, not an architecture. Describe the components — orchestration loop, tool routing, RAG pipeline, eval system — then mention that LangChain (or LlamaIndex, or custom code) implements them. The framework is the last word.{' '}Mahesh's framework from his 107k-view video: describe the Router {'>'} Q&A {'>'} Planner agent architecture FIRST, then say "this could be implemented with LangGraph, CrewAI, or raw API calls — the architecture is the same."</p>
      </div>

      <div style={styles.anti}>
        <p style={styles.strike}>"We'd just increase the context window to fit everything."</p>
        <p style={styles.better}><span style={{...styles.dot, background: 'var(--text-success)'}} />Context windows have cost and latency implications. 200K tokens costs 10-50x more than 10K tokens. RAG retrieves only the relevant 2-3K tokens. This is the "use DynamoDB because it scales" equivalent — reaching for the expensive solution when a targeted one works better.</p>
      </div>

      <div style={styles.anti}>
        <p style={styles.strike}>"We don't need evals — we'll test it manually."</p>
        <p style={styles.better}><span style={{...styles.dot, background: 'var(--text-success)'}} />LLM outputs are non-deterministic. Manual testing catches obvious failures but misses regressions. When you change a prompt, you need automated evals on 50-100 test cases to catch subtle quality drops. Treat it like CI/CD — no merge without passing evals.</p>
      </div>

      <div style={styles.anti}>
        <p style={styles.strike}>"The agent will figure out what tools to use."</p>
        <p style={styles.better}><span style={{...styles.dot, background: 'var(--text-success)'}} />Tool selection accuracy drops with tool count. Give the agent 50 tools and it'll pick the wrong one 30% of the time. Use two-stage routing: classify intent first, then load only the relevant 5-8 tools. Or use tool descriptions that clearly state when each tool should be used.</p>
      </div>

      <div style={styles.anti}>
        <p style={styles.strike}>"We'll use GPT-4 for everything."</p>
        <p style={styles.better}><span style={{...styles.dot, background: 'var(--text-success)'}} />Use the right model for each component. Input classification → small fast model (Haiku). RAG retrieval → embedding model. Main reasoning → large model (Opus/GPT-4). Output validation → medium model (Sonnet). A single-model architecture wastes money on simple tasks and bottlenecks on complex ones.</p>
      </div>

      <FadeIn><Insight>
        "The meta-pattern is Mahesh's Top 8 rule #3: go vertical-first. Don't build a 'general agent framework' — build an agent that solves one specific problem perfectly. The e-Commerce customer support agent doesn't need to write code or search the web. It needs to search products, check orders, and process returns. Scope the tools, scope the prompt, scope the eval set. Then reason about constraints: latency budget, cost per query, accuracy threshold. The framework — LangChain, LlamaIndex, custom code — is genuinely the last decision."
      </Insight></FadeIn>
        </div>
  );
}

const styles = {
  back: {
    fontSize: 12,
    color: 'var(--text-muted)',
    textDecoration: 'none',
    display: 'inline-block',
    marginBottom: 16,
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.02em',
  },
  eyebrow: { fontSize: 11, fontWeight: 500, color: 'var(--text-accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontFamily: 'var(--font-mono)' },
  h1: { fontSize: 34, fontWeight: 400, color: 'var(--text-h)', marginBottom: 10, lineHeight: 1.15, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 14, color: 'var(--text-p)', marginBottom: 8, lineHeight: 1.75 },
  source: { fontSize: 12, color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.6 },
  sourceLink: { color: 'var(--text-accent)', textDecoration: 'underline', textUnderlineOffset: '2px' },

  tabWrap: {
    display: 'flex',
    gap: 0,
    marginBottom: '2rem',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--border)',
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  tabBtn: {
    background: 'transparent',
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'all var(--dur) var(--ease)',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
    letterSpacing: '-0.01em',
  },
  tabActive: {
    color: 'var(--text-h)',
    fontWeight: 600,
    borderBottomColor: 'var(--bg-accent-strong)',
  },

  sh: { fontSize: 17, fontWeight: 600, color: 'var(--text-h)', marginBottom: 8, letterSpacing: '-0.01em' },
  ss: { fontSize: 13, color: 'var(--text-p)', marginBottom: 16, lineHeight: 1.7 },

  systemCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '16px 18px',
    marginBottom: 12,
  },
  systemName: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text-h)',
    marginBottom: 10,
    fontFamily: 'var(--font-display)',
  },
  systemDetail: {
    display: 'flex',
    gap: 12,
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 1.6,
  },
  sysLabel: {
    color: 'var(--text-accent)',
    minWidth: 80,
    flexShrink: 0,
    fontWeight: 600,
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.02em',
    paddingTop: 2,
  },
  sysVal: { color: 'var(--text-p)' },

  anti: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '16px 18px',
    marginBottom: 10,
  },
  strike: { textDecoration: 'line-through', opacity: 0.5, fontSize: 13, color: 'var(--text-p)', lineHeight: 1.6 },
  better: { fontSize: 13, color: 'var(--text-h)', fontWeight: 500, lineHeight: 1.6, marginTop: 6 },
  dot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 8, verticalAlign: 'middle' },
};
