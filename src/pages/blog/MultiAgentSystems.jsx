import { useState } from 'react';
import { Link } from 'react-router-dom';
import Decision, { Pill } from '../../components/Decision';
import Insight from '../../components/Insight';
import CodeBlock from '../../components/CodeBlock';
import FadeIn from '../../components/FadeIn';

const SUPERVISOR_CODE = `async function supervisorAgent(userMessage, specialists) {
  // Step 1: Router — classify intent and pick specialist
  const routing = await callLLM([
    { role: 'system', content: \`You are a router. Classify the user's intent and pick
the best specialist. Available: \${Object.keys(specialists).join(', ')}.
Respond with JSON: { "specialist": "name", "task": "what to do" }\` },
    { role: 'user', content: userMessage },
  ], { responseFormat: 'json' });

  const { specialist, task } = routing;
  const agent = specialists[specialist];
  if (!agent) return \`I can't help with that. Available: \${Object.keys(specialists).join(', ')}\`;

  // Step 2: Delegate to specialist with scoped tools
  const result = await agent.run(task);

  // Step 3: Synthesize — the supervisor formats the final response
  const synthesis = await callLLM([
    { role: 'system', content: 'Synthesize this specialist result into a helpful response for the user.' },
    { role: 'user', content: userMessage },
    { role: 'assistant', content: \`Specialist (\${specialist}) returned: \${JSON.stringify(result)}\` },
  ]);

  return synthesis.text;
}

// Specialists — each has its own system prompt and tool set
const specialists = {
  researcher: {
    run: (task) => agentLoop(task, { tools: { webSearch, readUrl } }),
  },
  coder: {
    run: (task) => agentLoop(task, { tools: { readFile, editFile, runTests } }),
  },
  reviewer: {
    run: (task) => agentLoop(task, { tools: { readFile, searchCode } }),  // read-only!
  },
};`;

const FANOUT_CODE = `async function fanOutReview(codeToReview) {
  // Launch multiple specialist reviewers in parallel
  const reviewers = [
    { name: 'bugs',     prompt: 'Find correctness bugs. Ignore style.' },
    { name: 'security', prompt: 'Find security vulnerabilities. OWASP top 10.' },
    { name: 'perf',     prompt: 'Find performance issues. Big-O, N+1 queries, memory leaks.' },
  ];

  const results = await Promise.all(
    reviewers.map(async (reviewer) => {
      const findings = await callLLM([
        { role: 'system', content: \`You are a \${reviewer.name} reviewer. \${reviewer.prompt}
Return JSON: { "findings": [{ "file": "", "line": 0, "severity": "high|medium|low", "issue": "" }] }\` },
        { role: 'user', content: codeToReview },
      ], { responseFormat: 'json' });

      return { reviewer: reviewer.name, ...findings };
    })
  );

  // Merge and deduplicate across reviewers
  const allFindings = results.flatMap(r =>
    r.findings.map(f => ({ ...f, foundBy: r.reviewer }))
  );

  // Dedupe by file+line (multiple reviewers may flag the same issue)
  const deduped = Object.values(
    Object.groupBy(allFindings, f => \`\${f.file}:\${f.line}\`)
  ).map(group => ({
    ...group[0],
    foundBy: group.map(g => g.foundBy),  // credit all reviewers
    confidence: group.length > 1 ? 'high' : 'medium',  // multi-reviewer = higher confidence
  }));

  return deduped.sort((a, b) =>
    ['high','medium','low'].indexOf(a.severity) - ['high','medium','low'].indexOf(b.severity)
  );
}`;

const SUPERVISOR_OUTPUT = `> await supervisorAgent(
    "Why are our API response times spiking?",
    specialists
  )

[Router] Classifying intent...
  → { specialist: "researcher", task: "Investigate API response time spikes" }

[Specialist: researcher]
  Tool: webSearch("API latency debugging common causes")
  Tool: readUrl("https://docs.internal/monitoring")
  → Found: connection pool exhaustion pattern

[Supervisor] Synthesizing response...

"Your API response times are spiking due to connection pool
exhaustion. The default pool size is 10, but your traffic has
grown to 200 req/s. Increase the pool size to 50 and add
connection timeout of 5s. Monitor pg_stat_activity to verify."`;

const FANOUT_OUTPUT = `> await fanOutReview(codeToReview)

[parallel] Launching 3 reviewers...
  ├─ bugs:     scanning for correctness issues...
  ├─ security: checking OWASP top 10...
  └─ perf:     analyzing performance patterns...

[bugs]     Found 2 findings (380ms)
[security] Found 1 finding  (420ms)
[perf]     Found 2 findings (290ms)

Merging 5 findings, deduplicating by file:line...
  → auth.js:47 flagged by [bugs, security] → confidence: high
  → db.js:112  flagged by [perf]           → confidence: medium

[
  { file: "auth.js", line: 47, severity: "high",
    issue: "SQL injection via unsanitized user input",
    foundBy: ["bugs", "security"], confidence: "high" },
  { file: "db.js", line: 112, severity: "medium",
    issue: "N+1 query in user list endpoint",
    foundBy: ["perf"], confidence: "medium" },
]`;

const TABS = ['Patterns', 'Coordination', 'Architecture', 'When to Use', 'Anti-patterns'];

export default function MultiAgentSystems() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <Link to="/blog" style={styles.back}>&larr; AI Engineering</Link>
      <p style={styles.eyebrow}>Post 04</p>
      <h1 style={styles.h1}>Multi-Agent Systems</h1>
      <p style={styles.subtitle}>
        When one agent isn't enough — delegation patterns, shared memory, supervisor architectures,
        and the honest truth about when single-agent beats multi-agent.
      </p>

      <div style={styles.tabWrap}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{ ...styles.tabBtn, ...(tab === i ? styles.tabActive : {}) }}>{t}</button>
        ))}
      </div>

      {tab === 0 && <PatternsPanel />}
      {tab === 1 && <CoordinationPanel />}
      {tab === 2 && <ArchPanel />}
      {tab === 3 && <WhenToUsePanel />}
      {tab === 4 && <AntiPatternsPanel />}

      <FadeIn><div style={{ marginTop: 48, padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Capstone Project</p>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-h)', marginBottom: 6 }}>Multi-Agent Content Pipeline</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Build the real thing. Production-grade project brief with architecture requirements, evaluation criteria, and staff+ interview angles.</p>
        <a href="https://github.com/gmaheshraju/Hands-on-AgenticAI/blob/main/projects/04-multi-agent-systems.md" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--text-accent)', textDecoration: 'none', fontWeight: 500 }}>View project brief on GitHub →</a>
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

function MultiAgentDiagram() {
  const f = 'var(--font-body)';
  const fm = 'var(--font-mono)';

  return (
    <div style={{ overflowX: 'auto', margin: '20px 0' }}>
      <svg viewBox="0 0 720 380" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', display: 'block' }}>
        <defs>
          <marker id="mad" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="var(--text-muted)" opacity="0.7" />
          </marker>
          <marker id="madA" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="var(--text-accent)" opacity="0.8" />
          </marker>
        </defs>

        <text x="360" y="22" textAnchor="middle" fontSize="14" fontWeight="400" fill="var(--text-h)" fontFamily="var(--font-display)">Supervisor Multi-Agent Architecture</text>

        {/* Supervisor zone */}
        <rect x="0" y="40" width="720" height="90" fill="var(--bg-code)" opacity="0.3" />
        <text x="12" y="60" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.1em">SUPERVISOR</text>

        {/* User */}
        <g>
          <circle cx="80" cy="86" r="16" fill="none" stroke="var(--border-strong)" strokeWidth="1.2" />
          <circle cx="80" cy="80" r="4.5" fill="var(--text-muted)" opacity="0.5" />
          <path d="M72 92 Q80 88 88 92" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" opacity="0.5" />
          <text x="80" y="112" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>User</text>
        </g>

        {/* Router/Supervisor */}
        <rect x="180" y="60" width="160" height="52" rx="10" fill="var(--text-accent)" opacity="0.08" stroke="var(--text-accent)" strokeWidth="1.5" />
        <rect x="186" y="66" width="14" height="14" rx="3" fill="var(--text-accent)" opacity="0.9" />
        <text x="260" y="84" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Supervisor Agent</text>
        <text x="260" y="100" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>route · delegate · synthesize</text>

        <line x1="96" y1="86" x2="178" y2="86" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" markerEnd="url(#madA)" />

        {/* Shared State */}
        <rect x="440" y="60" width="130" height="52" rx="8" fill="#C925D1" opacity="0.08" stroke="#C925D1" strokeWidth="1.2" />
        <rect x="446" y="66" width="14" height="14" rx="3" fill="#C925D1" opacity="0.9" />
        <text x="505" y="84" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Shared State</text>
        <text x="505" y="100" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>memory · artifacts · logs</text>

        <line x1="342" y1="86" x2="438" y2="86" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 3" fill="none" markerEnd="url(#mad)" />

        {/* Agent zone */}
        <rect x="0" y="148" width="720" height="100" fill="var(--bg-card)" opacity="0.15" />
        <text x="12" y="168" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.1em">SPECIALIST AGENTS</text>

        {/* Agent 1: Research */}
        <rect x="40" y="178" width="120" height="52" rx="8" fill="#3F8624" opacity="0.08" stroke="#3F8624" strokeWidth="1.2" />
        <rect x="46" y="184" width="14" height="14" rx="3" fill="#3F8624" opacity="0.9" />
        <text x="100" y="202" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Researcher</text>
        <text x="100" y="218" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>search · read · summarize</text>

        {/* Agent 2: Coder */}
        <rect x="190" y="178" width="120" height="52" rx="8" fill="#3949AB" opacity="0.08" stroke="#3949AB" strokeWidth="1.2" />
        <rect x="196" y="184" width="14" height="14" rx="3" fill="#3949AB" opacity="0.9" />
        <text x="250" y="202" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Coder</text>
        <text x="250" y="218" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>write · edit · test</text>

        {/* Agent 3: Reviewer */}
        <rect x="340" y="178" width="120" height="52" rx="8" fill="#ED7100" opacity="0.08" stroke="#ED7100" strokeWidth="1.2" />
        <rect x="346" y="184" width="14" height="14" rx="3" fill="#ED7100" opacity="0.9" />
        <text x="400" y="202" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Reviewer</text>
        <text x="400" y="218" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>verify · critique · approve</text>

        {/* Agent 4: Planner */}
        <rect x="490" y="178" width="120" height="52" rx="8" fill="#E7157B" opacity="0.08" stroke="#E7157B" strokeWidth="1.2" />
        <rect x="496" y="184" width="14" height="14" rx="3" fill="#E7157B" opacity="0.9" />
        <text x="550" y="202" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Planner</text>
        <text x="550" y="218" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>decompose · prioritize</text>

        {/* Delegation arrows */}
        <line x1="220" y1="114" x2="100" y2="176" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#mad)" />
        <line x1="240" y1="114" x2="250" y2="176" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#mad)" />
        <line x1="280" y1="114" x2="400" y2="176" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#mad)" />
        <line x1="300" y1="114" x2="550" y2="176" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3 3" fill="none" markerEnd="url(#mad)" />

        {/* Tools zone */}
        <rect x="0" y="266" width="720" height="60" fill="var(--bg-code)" opacity="0.3" />
        <text x="12" y="286" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.1em">TOOLS</text>

        <rect x="60" y="278" width="80" height="34" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="100" y="298" textAnchor="middle" fontSize="9" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Web Search</text>

        <rect x="170" y="278" width="80" height="34" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="210" y="298" textAnchor="middle" fontSize="9" fontWeight="500" fill="var(--text-h)" fontFamily={f}>File System</text>

        <rect x="280" y="278" width="80" height="34" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="320" y="298" textAnchor="middle" fontSize="9" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Terminal</text>

        <rect x="390" y="278" width="80" height="34" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="430" y="298" textAnchor="middle" fontSize="9" fontWeight="500" fill="var(--text-h)" fontFamily={f}>APIs</text>

        <rect x="500" y="278" width="80" height="34" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="540" y="298" textAnchor="middle" fontSize="9" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Database</text>

        {/* Agent → Tool connections */}
        <line x1="100" y1="232" x2="100" y2="276" stroke="var(--text-muted)" strokeWidth="0.8" strokeDasharray="3 3" fill="none" />
        <line x1="250" y1="232" x2="210" y2="276" stroke="var(--text-muted)" strokeWidth="0.8" strokeDasharray="3 3" fill="none" />
        <line x1="250" y1="232" x2="320" y2="276" stroke="var(--text-muted)" strokeWidth="0.8" strokeDasharray="3 3" fill="none" />

        {/* Key bar */}
        <rect x="18" y="340" width="684" height="30" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.6" />
        <text x="30" y="358" fontSize="8" fontWeight="700" fill="var(--text-accent)" fontFamily={fm}>FLOW</text>
        <text x="70" y="358" fontSize="8" fill="var(--text-p)" fontFamily={f}>User → Supervisor routes to specialist → Specialist uses tools → Results flow back → Supervisor synthesizes final response</text>
      </svg>
    </div>
  );
}

function PatternsPanel() {
  return (
    <div>
      <SectionHead
        title="Multi-agent patterns"
        desc={<>Mahesh maps the evolution: <strong>Single Agent {'>'} Sequential Agents {'>'} Agent Teams {'>'} Agent Swarm.</strong> Each level adds capability and complexity. The key insight: Teams "fear being wrong" (they narrow and verify), while Swarms "fear missing something" (they explore in parallel). Pick based on your failure mode.</>}
      />

      <MultiAgentDiagram />

      <div style={{ background: 'var(--bg-code)', borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)', borderRightWidth: 1, borderRightStyle: 'solid', borderRightColor: 'var(--border)', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: 'var(--bg-accent-strong)', borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-accent)', marginBottom: 6, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>MAHESH'S EVOLUTION FRAMEWORK</p>
        <p style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.65, marginBottom: 6 }}>
          <strong>Level 1: Single Agent</strong> — One LLM with tools. Handles 80% of use cases. ChatGPT, basic Claude conversations.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.65, marginBottom: 6 }}>
          <strong>Level 2: Sequential Agents</strong> — Pipeline: Agent A {'>'} Agent B {'>'} Agent C. Each specializes. Like Unix pipes.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.65, marginBottom: 6 }}>
          <strong>Level 3: Agent Teams</strong> — Predefined roles, a leader delegates tasks, agents report back. "Fears being wrong" — narrows and verifies before responding. Claude Code's subagent system is here.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.65, marginBottom: 6 }}>
          <strong>Level 4: Agent Swarm</strong> — A goal agent auto-spawns workers, a synthesizer clusters findings. "Fears missing something" — explores in parallel. Kimi's Deep Research is here.
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 8, fontStyle: 'italic' }}>
          Mahesh's warning: "Multi-agent systems can burn tokens fast unless you constrain agent count + tool usage." Most teams should stay at Level 2-3.
        </p>
      </div>

      <FadeIn><CodeBlock filename="supervisor-agent.js" code={SUPERVISOR_CODE} output={SUPERVISOR_OUTPUT} /></FadeIn>

      <FadeIn><Decision question="1. Supervisor pattern (hierarchical)">
        <Pill type="green">Most common</Pill> One supervisor agent routes tasks to specialist agents, collects results, and synthesizes the final response. The supervisor is the only agent that talks to the user.
        <br /><br />
        <strong>Pros:</strong> Clear control flow. Easy to debug (trace supervisor's routing decisions). Natural error handling — supervisor can retry with a different agent.
        <br /><br />
        <strong>Cons:</strong> Supervisor is a bottleneck. If the supervisor misroutes, everything fails. Adding new specialists requires updating the supervisor's routing logic.
        <br /><br />
        <strong>Used by:</strong> Claude Code (main loop delegates to subagents), most enterprise agent platforms.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="2. Pipeline pattern (sequential)">
        Agents arranged in a chain — output of agent A becomes input of agent B. Like a Unix pipe: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>research | draft | review | edit</code>
        <br /><br />
        <strong>Pros:</strong> Simple mental model. Each agent has a single responsibility. Easy to test each stage independently.
        <br /><br />
        <strong>Cons:</strong> Latency scales linearly (4 agents = 4x the time). One slow agent blocks everything. Can't parallelize independent work.
        <br /><br />
        <strong>Best for:</strong> Content generation (research → write → edit → fact-check), code review pipelines, data processing.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="3. Parallel fan-out pattern">
        Multiple agents work on the same problem independently, then results are merged. Good for tasks where diverse perspectives improve quality.
        <br /><br />
        <strong>Pros:</strong> Wall-clock time = slowest single agent (not sum). Multiple perspectives catch more issues. Natural for review/audit tasks.
        <br /><br />
        <strong>Cons:</strong> Results need merging/deduplication (the hard part). Cost scales linearly with agent count. Conflicting recommendations need resolution.
        <br /><br />
        <strong>Best for:</strong> Code review (bugs + security + performance in parallel), research (multiple search angles), adversarial verification.
      </Decision></FadeIn>

      <FadeIn delay={240}><Decision question="4. Swarm pattern (autonomous)">
        <Pill type="red">High complexity</Pill> Agents communicate peer-to-peer with no central coordinator. Each agent decides what to do based on shared state and messages from other agents.
        <br /><br />
        <strong>Pros:</strong> Most flexible. No single point of failure. Can scale to many agents.
        <br /><br />
        <strong>Cons:</strong> Extremely hard to debug. Emergent behavior is unpredictable. Coordination overhead grows quadratically with agent count. Race conditions.
        <br /><br />
        <strong>Mahesh's distinction:</strong> Swarms "fear missing something" — they explore every angle in parallel, then a synthesizer clusters the findings. Contrast with Teams, which "fear being wrong" — they narrow, verify, then respond with confidence. Deep Research (OpenAI, Kimi) uses the swarm pattern because breadth matters more than precision. Coding agents use teams because correctness matters more than coverage. Match the pattern to your failure mode.
      </Decision></FadeIn>

      <FadeIn><Insight>
        "In the interview, use Mahesh's evolution framework: Single {'>'} Sequential {'>'} Teams {'>'} Swarm. Start by saying 'this is a Level 1 problem — single agent with good tools.' If the interviewer pushes, upgrade: 'At this scale, I'd move to Level 3 — Agent Teams with a supervisor, because we fear being wrong more than we fear missing something.' That framing — Teams vs Swarms as different fear modes — is the staff+ signal. It shows you reason about system design tradeoffs, not just memorize patterns."
      </Insight></FadeIn>
    </div>
  );
}

function CoordinationPanel() {
  return (
    <div>
      <SectionHead
        title="Agent coordination"
        desc="Multiple agents need to share state, avoid conflicts, and produce coherent results. These are distributed systems problems — the same patterns from microservices apply."
      />

      <FadeIn><Decision question="Shared state management">
        Agents need to read and write shared state — the current document, discovered facts, intermediate results. Three approaches:
        <br /><br />
        <Pill type="green">Centralized state store</Pill> A single source of truth (Redis, a shared file, a database). Agents read and write to it. Simple but needs conflict resolution.
        <br /><br />
        <Pill type="amber">Message passing</Pill> Agents communicate via messages. No shared mutable state. Each agent has its own view. More complex but avoids conflicts.
        <br /><br />
        <Pill type="amber">Event sourcing</Pill> All state changes are recorded as events. Any agent can replay events to reconstruct current state. Best auditability but highest complexity.
        <br /><br />
        <strong>Default to centralized state store.</strong> Message passing adds latency. Event sourcing adds complexity. A shared document/artifact that agents read and append to covers 90% of cases.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Conflict resolution — when agents disagree">
        Two agents review the same code and give conflicting feedback. How do you resolve it?
        <br /><br />
        <strong>Voting:</strong> If 2 of 3 reviewers say it's a bug, it's a bug. Simple majority. Works for classification tasks.
        <br /><br />
        <strong>Supervisor arbitration:</strong> The supervisor agent sees both opinions and makes the call. More nuanced but adds latency.
        <br /><br />
        <strong>Confidence scoring:</strong> Each agent reports a confidence score. The highest-confidence answer wins. Best when agents have different strengths.
        <br /><br />
        <strong>Adversarial verification:</strong> A dedicated "skeptic" agent tries to refute each finding. Only findings that survive the skeptic make it to the final result. Best for high-stakes decisions.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Error handling in multi-agent systems">
        What happens when one agent in a 5-agent pipeline fails?
        <br /><br />
        (1) <strong>Retry with backoff</strong> — Same agent, same input. Works for transient failures (API timeout).
        <br />
        (2) <strong>Fallback agent</strong> — Different agent, same task. "If the code agent fails, try the simpler code agent."
        <br />
        (3) <strong>Graceful degradation</strong> — Skip the failed step, continue with partial results. "Review completed: security ✓, performance ✗ (agent failed), correctness ✓."
        <br />
        (4) <strong>Circuit breaker</strong> — If an agent fails 3x in 5 minutes, stop routing to it entirely. Prevents cascade failures.
        <br /><br />
        <strong>Always surface failures.</strong> "3 of 4 checks completed" is more trustworthy than silently skipping the failed one.
      </Decision></FadeIn>

      <FadeIn><Insight>
        "This is where your distributed systems experience shines. Multi-agent coordination IS microservice orchestration — shared state, conflict resolution, circuit breakers, graceful degradation. The interviewer is testing whether you can apply systems patterns to a new domain, not whether you've memorized agent frameworks."
      </Insight></FadeIn>
    </div>
  );
}

function ArchPanel() {
  return (
    <div>
      <SectionHead
        title="Production multi-agent architectures"
        desc="How real systems organize multiple agents — from code generation to content creation to customer operations."
      />

      <FadeIn><CodeBlock filename="fan-out-review.js" code={FANOUT_CODE} output={FANOUT_OUTPUT} /></FadeIn>

      <div style={styles.systemCard}>
        <h3 style={styles.systemName}>Claude Code — Subagent Architecture</h3>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Pattern</span>
          <span style={styles.sysVal}>Supervisor with specialized subagents. Main loop handles conversation, delegates to Explorer (read-only search), general-purpose (complex tasks), and Plan agents. Each subagent gets isolated tools and context.</span>
        </div>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Key insight</span>
          <span style={styles.sysVal}>Mahesh's analysis: subagents protect the main context window. Instead of the main agent reading 50 files, a search subagent does it and returns just the answer. This is Level 3 (Teams) — predefined roles, supervisor delegates. The Hermes Agent takes this further: sub-agents calling Claude Code CLI, with shared memory as the coordination layer.</span>
        </div>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Coordination</span>
          <span style={styles.sysVal}>Subagent returns a single text result to the main loop. No shared mutable state. The main agent synthesizes. Simple, debuggable, effective.</span>
        </div>
      </div>

      <div style={styles.systemCard}>
        <h3 style={styles.systemName}>Devin — Coding Agent</h3>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Pattern</span>
          <span style={styles.sysVal}>Pipeline with feedback loops. Plan → Code → Test → Fix → Review. If tests fail, loops back to Code. If review finds issues, loops back to Plan. Multi-step with conditional branching.</span>
        </div>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Key insight</span>
          <span style={styles.sysVal}>The feedback loop is what makes it work. A pure pipeline (plan → code → done) fails on complex tasks. The loop from test → fix → test lets it converge on correct code through iteration.</span>
        </div>
      </div>

      <div style={styles.systemCard}>
        <h3 style={styles.systemName}>Kimi Deep Research — Swarm Architecture</h3>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Pattern</span>
          <span style={styles.sysVal}>Swarm (Level 4). A goal agent decomposes the research question, auto-spawns worker agents that search independently, a synthesizer agent clusters and deduplicates findings, then generates a comprehensive report.</span>
        </div>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Key insight</span>
          <span style={styles.sysVal}>Swarms "fear missing something." Multiple agents searching the same topic from different angles find information that a single exhaustive search misses. The cost: 10-50x more tokens than a single agent. Worth it when comprehensiveness matters more than speed.</span>
        </div>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Mahesh's take</span>
          <span style={styles.sysVal}>Deep Research narrows and verifies (fears being wrong). Swarms explore in parallel (fear missing something). Teams execute with control. The architecture follows the failure mode you're optimizing against.</span>
        </div>
      </div>

      <div style={styles.systemCard}>
        <h3 style={styles.systemName}>Content Generation — Editorial Pipeline</h3>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Pattern</span>
          <span style={styles.sysVal}>Pipeline: Researcher → Writer → Editor → Fact-Checker → Publisher. Each stage has a different model — Researcher uses a web-enabled model, Writer uses a creative model, Fact-Checker uses a grounded model.</span>
        </div>
        <div style={styles.systemDetail}>
          <span style={styles.sysLabel}>Key insight</span>
          <span style={styles.sysVal}>Different models for different stages. The Writer doesn't need web access. The Fact-Checker doesn't need creative writing ability. Using the right model per stage reduces cost 3-5x vs using the most capable model everywhere.</span>
        </div>
      </div>

      <FadeIn><Insight>
        "The production insight is context isolation. Multi-agent isn't primarily about parallelism — it's about giving each agent a focused context window with only the information it needs. A search agent with 10 files in context outperforms a generalist with 100 files. Specialization reduces noise, which improves accuracy."
      </Insight></FadeIn>
    </div>
  );
}

function WhenToUsePanel() {
  return (
    <div>
      <SectionHead
        title="Single-agent vs multi-agent"
        desc="The most important decision in agent architecture is whether you need more than one agent at all. Multi-agent adds complexity, cost, and failure modes. Only use it when the benefits clearly outweigh the costs."
      />

      <FadeIn><Decision question="Use single-agent when...">
        (1) The task fits in one context window. If one agent can hold all the relevant information and tools, adding more agents just adds latency and cost.
        <br /><br />
        (2) The task is sequential by nature. If step B always depends on step A's output, parallelism doesn't help.
        <br /><br />
        (3) Coherence matters more than coverage. A single agent produces a more coherent response than merging outputs from multiple agents.
        <br /><br />
        (4) You need speed. Single-agent = 1 LLM call. Multi-agent = 3-10 LLM calls. For real-time applications (chat, autocomplete), single-agent is often the only viable option.
        <br /><br />
        <strong>Most production agents are single-agent.</strong> ChatGPT, Claude (conversational mode), most customer support bots. Multi-agent is the exception, not the default.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Use multi-agent when...">
        (1) <strong>Context overflow.</strong> The task requires more information than fits in one context window. Code agents searching large codebases. Research agents reading many documents.
        <br /><br />
        (2) <strong>Diverse expertise.</strong> Different subtasks need different tools, prompts, or models. A code review needs security expertise AND performance expertise AND correctness expertise.
        <br /><br />
        (3) <strong>Adversarial verification.</strong> You want independent perspectives that check each other. A finder agent finds bugs, a skeptic agent tries to disprove them.
        <br /><br />
        (4) <strong>Parallelizable work.</strong> Independent subtasks that can run simultaneously. Searching 10 codebases, reviewing 5 PRs, analyzing data from 3 sources.
        <br /><br />
        (5) <strong>Human-in-the-loop stages.</strong> Some steps need human approval before proceeding. Multi-agent makes it natural to pause between stages.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Cost and latency math">
        <strong>Single agent:</strong> 1 LLM call. ~$0.01-0.10 per query. 2-10 seconds.
        <br /><br />
        <strong>Supervisor + 3 specialists:</strong> 4+ LLM calls. ~$0.04-0.40 per query. 8-40 seconds.
        <br /><br />
        <strong>Pipeline of 5 agents:</strong> 5+ LLM calls (serial). ~$0.05-0.50 per query. 10-50 seconds.
        <br /><br />
        <strong>Fan-out of 5 agents:</strong> 6+ LLM calls (parallel). ~$0.06-0.60 per query. 4-15 seconds (wall-clock).
        <br /><br />
        <strong>Rule of thumb:</strong> Multi-agent costs 3-10x more per query. Only worth it when the quality improvement justifies the cost — code generation (saves developer hours), content creation (saves editor hours), compliance review (avoids legal risk).
        <br /><br />
        <strong>Mahesh's token warning:</strong> "Multi-agent systems can burn tokens fast unless you constrain agent count + tool usage." Set hard limits: max 5 sub-agents per query, max 3 tool calls per sub-agent, total cost cap per query. Without these constraints, a swarm exploring a broad question can easily hit $10-50 per query.
      </Decision></FadeIn>

      <FadeIn><Insight>
        "The staff+ move is recommending single-agent first and articulating exactly when you'd graduate to multi-agent. Anyone can draw a fancy multi-agent diagram. The interview signal is saying: 'For this use case, a single agent with good tool selection handles 90% of queries. I'd add a specialist subagent only for the 10% that overflow the context window — and here's how I'd detect that overflow condition.'"
      </Insight></FadeIn>
    </div>
  );
}

function AntiPatternsPanel() {
  return (
    <div>
      <SectionHead
        title="Multi-agent anti-patterns"
        desc="The mistakes that turn a multi-agent system from 'powerful' to 'expensive and unreliable.'"
      />

      <div style={styles.anti}>
        <p style={styles.strike}>"Each microservice should be its own agent."</p>
        <p style={styles.better}><span style={{...styles.dot, background: 'var(--text-success)'}} />Agents are expensive (each is an LLM call). Microservices are cheap (each is an API call). Don't create an agent for something a function call can do. An "email agent" that just calls the Gmail API is a $0.05 wrapper around a $0.0001 API call.</p>
      </div>

      <div style={styles.anti}>
        <p style={styles.strike}>"The agents will coordinate themselves."</p>
        <p style={styles.better}><span style={{...styles.dot, background: 'var(--text-success)'}} />Self-organizing agents sound elegant but are debugging nightmares. You need explicit coordination — a supervisor, a pipeline, or a defined protocol. "Emergent behavior" in production means "unpredictable behavior that wakes you up at 3 AM."</p>
      </div>

      <div style={styles.anti}>
        <p style={styles.strike}>"More agents = better quality."</p>
        <p style={styles.better}><span style={{...styles.dot, background: 'var(--text-success)'}} />Diminishing returns hit fast. 3 reviewers catch more than 1. 5 reviewers catch marginally more than 3. 10 reviewers catch the same as 5 but cost 3x more and take 2x longer to merge. The sweet spot is 3-5 agents for most tasks.</p>
      </div>

      <div style={styles.anti}>
        <p style={styles.strike}>"Each agent should have access to all tools."</p>
        <p style={styles.better}><span style={{...styles.dot, background: 'var(--text-success)'}} />Tool isolation improves accuracy. A research agent with only search + read tools can't accidentally modify files. A review agent with only read access can't break the code it's reviewing. Principle of least privilege applies to agents too.</p>
      </div>

      <div style={styles.anti}>
        <p style={styles.strike}>"We need a swarm of autonomous agents."</p>
        <p style={styles.better}><span style={{...styles.dot, background: 'var(--text-success)'}} />Mahesh's framework: Swarms are Level 4 — only when you "fear missing something" more than you fear cost or complexity. Deep Research uses swarms because comprehensiveness justifies the 10-50x token cost. Your customer support bot does not. Start at Level 1 (single agent), upgrade only when you can name the specific failure mode that requires it.</p>
      </div>

      <FadeIn><Insight>
        "Use Mahesh's evolution levels as your interview framework. Level 1: 'This is a single-agent problem — one LLM with 5 focused tools.' Level 2: 'If we need pipeline processing, chain agents sequentially.' Level 3: 'For quality-critical tasks, a supervisor with specialist teams — they fear being wrong, so they verify.' Level 4: 'Only for exhaustive research where we fear missing something.' Starting at Level 4 and working down is the interview anti-pattern. Starting at Level 1 and articulating exactly when to upgrade — that's staff+ reasoning."
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
  systemCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 18px', marginBottom: 12 },
  systemName: { fontSize: 15, fontWeight: 600, color: 'var(--text-h)', marginBottom: 10, fontFamily: 'var(--font-display)' },
  systemDetail: { display: 'flex', gap: 12, marginBottom: 8, fontSize: 13, lineHeight: 1.6 },
  sysLabel: { color: 'var(--text-accent)', minWidth: 80, flexShrink: 0, fontWeight: 600, fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.02em', paddingTop: 2 },
  sysVal: { color: 'var(--text-p)' },
  anti: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 18px', marginBottom: 10 },
  strike: { textDecoration: 'line-through', opacity: 0.5, fontSize: 13, color: 'var(--text-p)', lineHeight: 1.6 },
  better: { fontSize: 13, color: 'var(--text-h)', fontWeight: 500, lineHeight: 1.6, marginTop: 6 },
  dot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 8, verticalAlign: 'middle' },
};
