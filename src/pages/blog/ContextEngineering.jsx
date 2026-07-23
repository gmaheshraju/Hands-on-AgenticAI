import { useState } from 'react';
import { Link } from 'react-router-dom';
import Decision, { Pill } from '../../components/Decision';
import Insight from '../../components/Insight';
import CodeBlock from '../../components/CodeBlock';
import FadeIn from '../../components/FadeIn';

const BUDGET_CODE = `function allocateTokenBudget(maxTokens, options = {}) {
  const outputBuffer = Math.floor(maxTokens * 0.15);  // reserve for generation
  const safetyMargin = 512;                            // never cut it close
  const available = maxTokens - outputBuffer - safetyMargin;

  // Fixed reserves — these never get dropped
  const systemPrompt = options.systemPromptTokens || 2000;
  const remaining = available - systemPrompt;

  // Dynamic allocation — trade off based on what's available
  const allocations = {
    systemPrompt,
    conversationHistory: Math.floor(remaining * 0.30),  // sliding window
    ragChunks:           Math.floor(remaining * 0.35),  // retrieval results
    toolResults:         Math.floor(remaining * 0.20),  // on-demand
    fewShotExamples:     Math.floor(remaining * 0.10),  // optional, dropped first
    reserved:            Math.floor(remaining * 0.05),  // breathing room
  };

  return {
    maxTokens,
    effectiveWindow: available,
    allocations,
    dropOrder: ['fewShotExamples', 'toolResults', 'ragChunks', 'conversationHistory'],
  };
}`;

const BUDGET_OUTPUT = `> allocateTokenBudget(128000, { systemPromptTokens: 3000 })

maxTokens:       128,000
outputBuffer:     19,200  (15%)
safetyMargin:        512
effectiveWindow: 108,288

allocations:
  systemPrompt:        3,000   (fixed — never dropped)
  conversationHistory: 31,586  (30% of remaining)
  ragChunks:           36,850  (35% of remaining)
  toolResults:         21,057  (20% of remaining)
  fewShotExamples:     10,528  (10% — dropped first)
  reserved:             5,264  (5%)

dropOrder: examples → tools → RAG → conversation
  128K window ≠ 128K usable. Effective budget: ~108K tokens.`;

const PRIORITY_CODE = `function prioritizeSources(sources, budgetByType) {
  // Tier 1: Fixed — never dropped
  const fixed = sources.filter(s => s.tier === 'fixed');

  // Tier 2-5: Score by relevance × recency, then fit to budget
  const dynamic = sources
    .filter(s => s.tier !== 'fixed')
    .map(s => ({
      ...s,
      score: s.relevance * 0.7 + s.recency * 0.3,  // relevance wins
    }))
    .sort((a, b) => b.score - a.score);

  // Greedy fill within each type's budget
  const selected = [...fixed];
  const used = {};

  for (const source of dynamic) {
    const budget = budgetByType[source.type] || 0;
    const typeUsed = used[source.type] || 0;
    if (typeUsed + source.tokens <= budget) {
      selected.push(source);
      used[source.type] = typeUsed + source.tokens;
    }
  }

  return selected.sort((a, b) => a.position - b.position);
}`;

const PRIORITY_OUTPUT = `> prioritizeSources(allSources, {
    conversation: 31586, rag: 36850,
    tools: 21057, examples: 10528
  })

Selected 14 of 23 sources (82,431 tokens used of 108,288 budget):

tier  type          tokens  score  content
────────────────────────────────────────────────────────
fixed system_prompt  3,000  —      "You are a support agent..."
  1   conversation   8,200  0.95   turns 8-12 (recent, on-topic)
  1   conversation   4,100  0.88   turns 5-7 (recent)
  2   rag           12,400  0.92   product_specs.md (chunk 3-5)
  2   rag            8,800  0.87   pricing_2024.md (chunk 1-2)
  2   rag            6,200  0.71   faq.md (chunk 8)
  3   tool_result    4,800  0.89   searchOrders() → 3 results
  3   tool_result    2,100  0.76   getAccount() → profile
  4   example        3,200  0.65   refund flow example

Dropped 9 sources (25,857 tokens saved):
  conversation turns 1-4 (summarized), 3 low-score RAG chunks,
  2 stale tool results, 1 redundant example`;

const ASSEMBLER_CODE = `function assembleContext(sources, budget, strategy = 'balanced') {
  // Step 1: Deduplicate near-identical content
  const deduped = deduplicateSources(sources, { threshold: 0.85 });

  // Step 2: Compress oversized sources
  const compressed = deduped.map(s => {
    if (s.tokens > budget.maxPerSource) {
      return strategy === 'truncate'
        ? truncateMiddle(s, budget.maxPerSource)  // keep start + end
        : summarize(s, budget.maxPerSource);       // LLM-powered compression
    }
    return s;
  });

  // Step 3: Order for attention optimization
  // "Lost in the middle" — put critical content at start and end
  const ordered = [
    ...compressed.filter(s => s.tier === 'fixed'),        // system prompt first
    ...compressed.filter(s => s.type === 'rag')           // RAG early (high attention)
      .sort((a, b) => b.score - a.score),
    ...compressed.filter(s => s.type === 'conversation'), // conversation (chronological)
    ...compressed.filter(s => s.type === 'tool_result'),  // tool results
    ...compressed.filter(s => s.type === 'example'),      // examples last (can be dropped)
  ];

  // Step 4: Final trim if still over budget
  let totalTokens = ordered.reduce((sum, s) => sum + s.tokens, 0);
  while (totalTokens > budget.effective && ordered.length > 1) {
    const dropped = ordered.pop();  // drop lowest priority (end of list)
    totalTokens -= dropped.tokens;
  }

  return { context: ordered, totalTokens, dropped: sources.length - ordered.length };
}`;

const ASSEMBLER_OUTPUT = `> assembleContext(prioritizedSources, budget, 'balanced')

Assembly pipeline:
  dedup:    14 sources → 12 (removed 2 near-duplicate RAG chunks)
  compress: 12 sources → 12 (1 truncated: conversation turns 5-7)
  order:    attention-optimized layout applied
  trim:     12 sources → 12 (within budget)

Final context layout (78,200 tokens):
  ┌─ SYSTEM PROMPT ─────────────────────────── 3,000 tokens ─┐
  │  "You are a support agent..."                             │
  ├─ RAG (highest relevance first) ─────────── 24,800 tokens ─┤
  │  product_specs.md (score: 0.92)                           │
  │  pricing_2024.md  (score: 0.87)                           │
  │  faq.md           (score: 0.71)                           │
  ├─ CONVERSATION (chronological) ──────────── 11,400 tokens ─┤
  │  [summary of turns 1-4] + turns 5-12 verbatim             │
  ├─ TOOL RESULTS ──────────────────────────── 6,900 tokens ──┤
  │  searchOrders() result + getAccount() result               │
  ├─ EXAMPLES ──────────────────────────────── 3,200 tokens ──┤
  │  refund flow example                                       │
  └─────────────────────────────────── effective: 78,200/108K ─┘`;

const TABS = ['Context Budget', 'Source Priority', 'Assembly Patterns', 'Production Patterns', 'Deep Dive'];

export default function ContextEngineering() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <Link to="/blog" style={styles.back}>&larr; AI Engineering</Link>
      <p style={styles.eyebrow}>Post 15</p>
      <h1 style={styles.h1}>Context Engineering</h1>
      <p style={styles.subtitle}>
        The discipline replacing prompt engineering — what goes into the context window,
        in what order, with what token budget, and why getting it wrong silently kills
        your agent's performance.
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

      {tab === 0 && <ContextBudgetPanel />}
      {tab === 1 && <SourcePriorityPanel />}
      {tab === 2 && <AssemblyPatternsPanel />}
      {tab === 3 && <ProductionPatternsPanel />}
      {tab === 4 && <DeepDivePanel />}

      <FadeIn><div style={{ marginTop: 48, padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Hands-On Project</p>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-h)', marginBottom: 6 }}>Context Window Optimizer</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Build the real thing. Design a context assembly pipeline with token budgeting, source prioritization, prompt caching, and compression — then measure its impact with evals.</p>
        <a href="https://github.com/gmaheshraju/Hands-on-AgenticAI/blob/main/projects/22-context-engineering.md" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--text-accent)', textDecoration: 'none', fontWeight: 500 }}>View project brief on GitHub →</a>
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

function ContextPipelineDiagram() {
  const f = 'var(--font-body)';
  const fm = 'var(--font-mono)';

  return (
    <div style={{ overflowX: 'auto', margin: '20px 0' }}>
      <svg viewBox="0 0 740 420" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', display: 'block' }}>
        <defs>
          <marker id="ceh" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="var(--text-muted)" opacity="0.7" />
          </marker>
          <marker id="cehAccent" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="var(--text-accent)" opacity="0.8" />
          </marker>
        </defs>

        {/* Title */}
        <text x="370" y="22" textAnchor="middle" fontSize="14" fontWeight="400" fill="var(--text-h)" fontFamily="var(--font-display)">Context Engineering Pipeline</text>
        <text x="370" y="38" textAnchor="middle" fontSize="9" fill="var(--text-muted)" fontFamily={fm}>Sources → Budget → Priority → Assemble → Optimized Context → LLM</text>

        {/* ── LEFT: INPUT SOURCES ── */}
        <rect x="0" y="48" width="180" height="310" fill="var(--bg-code)" opacity="0.3" rx="4" />
        <text x="12" y="68" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.1em">INPUT SOURCES</text>

        {/* System Prompt */}
        <rect x="14" y="80" width="152" height="34" rx="6" fill="#E7157B" opacity="0.08" stroke="#E7157B" strokeWidth="1.2" />
        <rect x="20" y="86" width="12" height="12" rx="3" fill="#E7157B" opacity="0.9" />
        <text x="90" y="96" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>System Prompt</text>
        <text x="90" y="108" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>~2-4K tokens (fixed)</text>

        {/* RAG Chunks */}
        <rect x="14" y="122" width="152" height="34" rx="6" fill="#3F8624" opacity="0.08" stroke="#3F8624" strokeWidth="1.2" />
        <rect x="20" y="128" width="12" height="12" rx="3" fill="#3F8624" opacity="0.9" />
        <text x="90" y="138" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>RAG Chunks</text>
        <text x="90" y="150" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>relevance-scored</text>

        {/* Memory */}
        <rect x="14" y="164" width="152" height="34" rx="6" fill="#C925D1" opacity="0.08" stroke="#C925D1" strokeWidth="1.2" />
        <rect x="20" y="170" width="12" height="12" rx="3" fill="#C925D1" opacity="0.9" />
        <text x="90" y="180" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Agent Memory</text>
        <text x="90" y="192" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>facts + history</text>

        {/* Tool Results */}
        <rect x="14" y="206" width="152" height="34" rx="6" fill="#ED7100" opacity="0.08" stroke="#ED7100" strokeWidth="1.2" />
        <rect x="20" y="212" width="12" height="12" rx="3" fill="#ED7100" opacity="0.9" />
        <text x="90" y="222" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Tool Results</text>
        <text x="90" y="234" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>500-2K per call</text>

        {/* Conversation */}
        <rect x="14" y="248" width="152" height="34" rx="6" fill="#3949AB" opacity="0.08" stroke="#3949AB" strokeWidth="1.2" />
        <rect x="20" y="254" width="12" height="12" rx="3" fill="#3949AB" opacity="0.9" />
        <text x="90" y="264" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Conversation</text>
        <text x="90" y="276" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>sliding window</text>

        {/* Examples */}
        <rect x="14" y="290" width="152" height="34" rx="6" fill="#8C4FFF" opacity="0.08" stroke="#8C4FFF" strokeWidth="1.2" />
        <rect x="20" y="296" width="12" height="12" rx="3" fill="#8C4FFF" opacity="0.9" />
        <text x="90" y="306" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Few-shot Examples</text>
        <text x="90" y="318" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>optional, dropped first</text>

        {/* ── MIDDLE: CONTEXT ENGINE ── */}
        <rect x="220" y="48" width="280" height="310" fill="var(--bg-card)" opacity="0.15" rx="4" />
        <text x="232" y="68" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.1em">CONTEXT ENGINE</text>

        {/* Budget */}
        <rect x="240" y="100" width="240" height="52" rx="8" fill="var(--text-accent)" opacity="0.06" stroke="var(--text-accent)" strokeWidth="1.2" strokeDasharray="6 3" />
        <text x="250" y="115" fontSize="8" fontWeight="700" fill="var(--text-accent)" fontFamily={fm}>BUDGET</text>
        <rect x="250" y="122" width="100" height="24" rx="4" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="300" y="138" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Token Allocator</text>
        <rect x="370" y="122" width="100" height="24" rx="4" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="420" y="138" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Drop Policy</text>

        {/* Priority */}
        <rect x="240" y="170" width="240" height="52" rx="8" fill="var(--text-accent)" opacity="0.06" stroke="var(--text-accent)" strokeWidth="1.2" strokeDasharray="6 3" />
        <text x="250" y="185" fontSize="8" fontWeight="700" fill="var(--text-accent)" fontFamily={fm}>PRIORITIZE</text>
        <rect x="250" y="192" width="100" height="24" rx="4" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="300" y="208" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Relevance Score</text>
        <rect x="370" y="192" width="100" height="24" rx="4" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="420" y="208" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Tier Ranking</text>

        {/* Assemble */}
        <rect x="240" y="240" width="240" height="52" rx="8" fill="var(--text-accent)" opacity="0.06" stroke="var(--text-accent)" strokeWidth="1.2" strokeDasharray="6 3" />
        <text x="250" y="255" fontSize="8" fontWeight="700" fill="var(--text-accent)" fontFamily={fm}>ASSEMBLE</text>
        <rect x="250" y="262" width="70" height="24" rx="4" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="285" y="278" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Dedup</text>
        <rect x="330" y="262" width="70" height="24" rx="4" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="365" y="278" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Compress</text>
        <rect x="410" y="262" width="60" height="24" rx="4" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="440" y="278" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Order</text>

        {/* Vertical arrows between engine stages */}
        <line x1="360" y1="154" x2="360" y2="168" stroke="var(--text-accent)" strokeWidth="1.2" fill="none" markerEnd="url(#cehAccent)" />
        <line x1="360" y1="224" x2="360" y2="238" stroke="var(--text-accent)" strokeWidth="1.2" fill="none" markerEnd="url(#cehAccent)" />

        {/* ── RIGHT: OUTPUT ── */}
        <rect x="540" y="48" width="190" height="310" fill="var(--bg-code)" opacity="0.3" rx="4" />
        <text x="552" y="68" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.1em">OUTPUT</text>

        {/* Optimized Context Window */}
        <rect x="554" y="130" width="162" height="64" rx="8" fill="var(--text-accent)" opacity="0.08" stroke="var(--text-accent)" strokeWidth="1.2" />
        <rect x="560" y="136" width="14" height="14" rx="3" fill="var(--text-accent)" opacity="0.9" />
        <text x="635" y="152" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Optimized Context</text>
        <text x="635" y="168" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>high signal-to-noise</text>
        <text x="635" y="184" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>attention-ordered</text>

        {/* Cache */}
        <rect x="554" y="212" width="162" height="44" rx="8" fill="#3F8624" opacity="0.08" stroke="#3F8624" strokeWidth="1.2" />
        <rect x="560" y="218" width="12" height="12" rx="3" fill="#3F8624" opacity="0.9" />
        <text x="635" y="234" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Prompt Cache</text>
        <text x="635" y="248" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>static prefix cached</text>

        {/* LLM */}
        <rect x="574" y="274" width="122" height="52" rx="8" fill="var(--bg-card)" stroke="var(--border-strong)" strokeWidth="1.2" />
        <text x="635" y="298" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-h)" fontFamily={f}>LLM</text>
        <text x="635" y="314" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>Claude / GPT-4 / Gemini</text>

        {/* Arrows: context → cache → LLM */}
        <line x1="635" y1="196" x2="635" y2="210" stroke="var(--text-muted)" strokeWidth="1" fill="none" markerEnd="url(#ceh)" />
        <line x1="635" y1="258" x2="635" y2="272" stroke="var(--text-accent)" strokeWidth="1.2" fill="none" markerEnd="url(#cehAccent)" />

        {/* Arrows: sources → engine */}
        <line x1="168" y1="97" x2="238" y2="120" stroke="var(--text-muted)" strokeWidth="1" fill="none" markerEnd="url(#ceh)" />
        <line x1="168" y1="139" x2="238" y2="130" stroke="var(--text-muted)" strokeWidth="1" fill="none" markerEnd="url(#ceh)" />
        <line x1="168" y1="181" x2="238" y2="190" stroke="var(--text-muted)" strokeWidth="1" fill="none" markerEnd="url(#ceh)" />
        <line x1="168" y1="223" x2="238" y2="200" stroke="var(--text-muted)" strokeWidth="1" fill="none" markerEnd="url(#ceh)" />
        <line x1="168" y1="265" x2="238" y2="260" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3 3" fill="none" markerEnd="url(#ceh)" />
        <line x1="168" y1="307" x2="238" y2="270" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3 3" fill="none" markerEnd="url(#ceh)" />

        {/* Arrow: engine → output */}
        <line x1="482" y1="265" x2="552" y2="162" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" markerEnd="url(#cehAccent)" />

        {/* ── Key bar ── */}
        <rect x="18" y="374" width="704" height="36" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.6" />
        <text x="30" y="392" fontSize="8" fontWeight="700" fill="var(--text-accent)" fontFamily={fm}>FLOW</text>
        <text x="70" y="392" fontSize="8" fill="var(--text-p)" fontFamily={f}>6 Sources → Token Budget → Priority Queue → Dedup + Compress + Order → Cached Context → LLM</text>
        <text x="30" y="404" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>128K window ≠ 128K usable · Effective window ~60-80% of max · Signal density {'>'} raw volume</text>
      </svg>
    </div>
  );
}

function ContextBudgetPanel() {
  return (
    <div>
      <SectionHead
        title="Token budgets — the constraint that shapes everything"
        desc="A 128K context window doesn't mean 128K usable tokens. Output buffer, safety margins, and the model's effective attention window all shrink the real budget. Context engineering starts with understanding the constraint."
      />

      <ContextPipelineDiagram />

      <FadeIn><Decision question="How to partition a context window">
        Every context window has competing consumers. A practical partition for a 128K model:
        <br /><br />
        <Pill type="green">System Prompt</Pill> Fixed reserve (2-4K tokens). Never dropped, never truncated. Your agent's identity and instructions.
        <br /><br />
        <Pill type="blue">Conversation History</Pill> Sliding window (~30% of remaining). Recent turns verbatim, older turns summarized.
        <br /><br />
        <Pill type="amber">RAG Chunks</Pill> Dynamic allocation (~35% of remaining). Filled based on retrieval relevance scores.
        <br /><br />
        <Pill type="green">Tool Results</Pill> On-demand (~20% of remaining). Only populated when the agent makes tool calls.
        <br /><br />
        <Pill type="amber">Few-shot Examples</Pill> Optional (~10% of remaining). First to be dropped when budget is tight.
        <br /><br />
        Real math: 128K - 19.2K output buffer - 512 safety margin = ~108K effective. That 128K headline number is marketing, not engineering.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Fixed vs dynamic allocation">
        <Pill type="green">Fixed reserves</Pill> guarantee critical content is always present. The system prompt gets a fixed budget — it's always in, no matter what. This is your non-negotiable baseline.
        <br /><br />
        <Pill type="amber">Dynamic allocation</Pill> lets you trade between source types based on the current request. A retrieval-heavy query? Shrink the example budget and give more tokens to RAG chunks. A multi-turn conversation? Grow the conversation window and drop examples entirely.
        <br /><br />
        The key insight: dynamic allocation means your context composition changes per-request, not just per-deployment.
      </Decision></FadeIn>

      <FadeIn delay={160}><Insight>
        Context engineering is to LLMs what memory management is to operating systems. You're managing a scarce resource (the context window) across competing consumers (sources), with different priority levels, under a hard budget constraint. The same patterns apply: priority queues, eviction policies, fragmentation avoidance.
      </Insight></FadeIn>

      <FadeIn delay={240}><CodeBlock filename="budget-allocator.js" code={BUDGET_CODE} output={BUDGET_OUTPUT} /></FadeIn>

      <FadeIn delay={320}><Decision question="What to do when everything doesn't fit">
        Three strategies, in order of preference:
        <br /><br />
        <Pill type="green">Drop lowest priority</Pill> Remove entire sources by tier. Examples go first, then stale tool results, then low-relevance RAG chunks. Cleanest approach — no information corruption.
        <br /><br />
        <Pill type="amber">Truncate from middle</Pill> Keep the start and end of a source, cut the middle. Research shows LLMs attend most to the beginning and end of long sequences. Used for conversation history and long documents.
        <br /><br />
        <Pill type="amber">Compress before insertion</Pill> Summarize a source with an LLM before inserting it into context. Costs one extra LLM call but can compress 10K tokens to 2K while preserving key information. Best for conversation history compaction.
      </Decision></FadeIn>

      <FadeIn delay={400}><Insight type="warn">
        The #1 mistake: treating the context window as unlimited. GPT-4 has 128K tokens but performance degrades significantly after 32K. Claude handles long context better but still: relevant content in the first 20K outperforms a dump of 100K. Budget to the model's effective window, not its maximum.
      </Insight></FadeIn>
    </div>
  );
}

function SourcePriorityPanel() {
  return (
    <div>
      <SectionHead
        title="Source hierarchy — not all context is equal"
        desc="When you have 6 different source types competing for the same window, you need a priority stack. Not everything can fit. The question is: what do you drop, and in what order?"
      />

      <FadeIn><Decision question="The priority stack (highest to lowest)">
        <Pill type="green">Tier 0 — System Prompt</Pill> Never dropped. Your agent's core instructions, persona, and constraints. If this gets truncated, the agent breaks.
        <br /><br />
        <Pill type="green">Tier 1 — Recent Conversation</Pill> Sliding window of the last 5-10 turns. The user expects the agent to remember what was just said.
        <br /><br />
        <Pill type="blue">Tier 2 — Retrieved Context (RAG)</Pill> Relevance-scored chunks from your knowledge base. This is what grounds the agent's answers in facts.
        <br /><br />
        <Pill type="amber">Tier 3 — Agent Memory / Facts</Pill> Persistent facts about the user or domain. Lower priority than RAG because these are less request-specific.
        <br /><br />
        <Pill type="amber">Tier 4 — Tool Call Results</Pill> Results from function calls. Important when fresh, but stale results from 5 turns ago can be dropped.
        <br /><br />
        <Pill type="amber">Tier 5 — Few-shot Examples</Pill> Demonstrate the desired output format. Helpful but expendable — the system prompt can describe the format in fewer tokens.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Relevance scoring within tiers">
        The priority stack gives you tier ordering. Within each tier, you need finer-grained ranking:
        <br /><br />
        <strong>RAG chunks:</strong> Rank by retrieval score (cosine similarity or reranker score). A chunk with 0.92 relevance gets in before a 0.71 chunk.
        <br /><br />
        <strong>Memory:</strong> Rank by <code>recency x relevance</code>. A fact mentioned 2 turns ago is more relevant than one from 50 turns ago, even if the older one has a higher base relevance score.
        <br /><br />
        <strong>Tool results:</strong> Rank by how recently the tool was called. Results from the current turn always beat results from 3 turns ago.
        <br /><br />
        Relevance scoring turns a flat priority stack into a priority queue — the right data structure for context engineering.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Conversation history — how far back?">
        Last 5-10 turns is usually sufficient. Beyond that, use a sliding window with summarization:
        <br /><br />
        <strong>Window strategy:</strong> Summarize turns 1 through N into a 500-token summary. Keep turns N+1 to current verbatim. This costs one LLM call per compaction but saves thousands of tokens per subsequent request.
        <br /><br />
        <strong>When to compact:</strong> When conversation history exceeds 30% of your effective budget, trigger compaction. Don't wait until you hit the wall — compact proactively.
        <br /><br />
        <strong>What to preserve:</strong> Always keep the first user message (establishes intent) and the last 3-5 turns (current thread of conversation). Everything in between can be summarized.
      </Decision></FadeIn>

      <FadeIn delay={240}><Insight tag="Key insight">
        The key insight: context engineering is about signal-to-noise ratio. A 4K context window with perfectly relevant content outperforms a 128K window stuffed with everything. Your job is to maximize the information density of every token in the window.
      </Insight></FadeIn>

      <FadeIn delay={320}><CodeBlock filename="source-prioritizer.js" code={PRIORITY_CODE} output={PRIORITY_OUTPUT} /></FadeIn>
    </div>
  );
}

function AssemblyPatternsPanel() {
  return (
    <div>
      <SectionHead
        title="Context assembly — turning sources into a coherent window"
        desc="You've budgeted the tokens and prioritized the sources. Now you need to assemble them into a single context window that maximizes the LLM's ability to use the information."
      />

      <FadeIn><Decision question="Three assembly strategies">
        <Pill type="green">Greedy (fill highest priority first)</Pill> Start with Tier 0, fill down. Simple, predictable, works well when your priority ordering is strong. Default choice for most systems.
        <br /><br />
        <Pill type="amber">Relevance-first (sort everything by score)</Pill> Ignore tier boundaries, sort all sources by relevance score, fill top-down. Works when relevance scores are well-calibrated across source types. Risk: might drop a conversation turn in favor of a RAG chunk, confusing the user.
        <br /><br />
        <Pill type="blue">Balanced (proportional budget per type)</Pill> Allocate a percentage of the budget to each source type, then fill each bucket independently. Guarantees representation from every source type. Best for agents that need all source types every request.
        <br /><br />
        <strong>Default to greedy with per-type minimums.</strong> Guarantee at least some conversation history (user experience) and some RAG (grounding), then fill the rest by priority.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Ordering within the assembled context">
        Position in the context window matters. Research shows LLMs attend most to the beginning and end, with significant degradation in the middle:
        <br /><br />
        <strong>Position 1: System prompt</strong> — always first. Sets the frame for everything that follows.
        <br /><br />
        <strong>Position 2: Highest-relevance RAG chunks</strong> — put your best retrieved content early, where attention is highest.
        <br /><br />
        <strong>Middle: Conversation history</strong> — chronological order within this section. The model uses positional cues to understand conversation flow.
        <br /><br />
        <strong>Position N-1: Tool results</strong> — recent results near the end get good attention.
        <br /><br />
        <strong>Position N: Few-shot examples</strong> — right before the user's current message. Primes the output format.
        <br /><br />
        The "lost in the middle" effect is real. Don't bury your most important content at position 50K in a 100K context.
      </Decision></FadeIn>

      <FadeIn delay={160}><Insight>
        The "lost in the middle" problem is real. Research from Stanford showed that LLMs attend most to the beginning and end of context, with significant degradation for information in the middle. Put your most important retrieved content first, not in the middle of a long context dump.
      </Insight></FadeIn>

      <FadeIn delay={240}><Decision question="Compression techniques">
        <Pill type="green">Truncation</Pill> Drop from the middle, keep start and end. Zero-cost, no extra LLM call. Works for conversation history and long documents where the key info is at the boundaries.
        <br /><br />
        <Pill type="amber">Summarization</Pill> LLM-powered compression. Feed the source to a fast model (Haiku/GPT-4o-mini) with "summarize the key facts in under 500 tokens." Costs one API call (~$0.001) but can compress 10:1.
        <br /><br />
        <Pill type="blue">Extraction</Pill> Pull only the relevant sentences from a document. Use the user's query as a filter: "extract sentences relevant to: {query}." More targeted than summarization.
        <br /><br />
        <Pill type="amber">Deduplication</Pill> Remove near-duplicate RAG chunks that waste tokens. Embeddings make this easy — if two chunks have cosine similarity above 0.85, keep the higher-scored one. Common when chunking overlaps.
      </Decision></FadeIn>

      <FadeIn delay={320}><CodeBlock filename="context-assembler.js" code={ASSEMBLER_CODE} output={ASSEMBLER_OUTPUT} /></FadeIn>

      <FadeIn delay={400}><Insight>
        Context management is invisible when it works and looks like stupidity when it fails. A great context setup feels like a sharp agent. A bad one feels like the model got worse overnight.
      </Insight></FadeIn>

      <FadeIn delay={480}><Decision question="The four moves of context engineering (Lance Martin / LangChain)">
        Every context pipeline reduces to four fundamental operations. You do them manually at first, then automate them as the system matures:
        <br /><br />
        <Pill type="green">Select</Pill> Pull only the slice this turn needs. Two sub-decisions compound here: <strong>what</strong> goes into the window (retrieval, filtering, scoring) and <strong>where</strong> it sits (the lost-in-the-middle effect means position is a second lever, not just inclusion).
        <br /><br />
        <Pill type="blue">Compress</Pill> Summarize running history, trim what is no longer load-bearing. The goal is to preserve the facts the agent still needs while freeing tokens for new material. Lossy by definition — the skill is knowing what to lose.
        <br /><br />
        <Pill type="amber">Write</Pill> Write confirmed findings to disk outside the context window so they survive compaction. Scratchpads, memory files, structured notes — anything that persists beyond the current window. Without this move, every compaction risks destroying work the agent already completed.
        <br /><br />
        <Pill type="green">Isolate</Pill> Split work across multiple windows (subagents), bring back only the result. A 200-file codebase search does not belong in the same window as the user conversation. Isolate the subtask, let it run in its own context, and merge the conclusion — not the raw output — back into the parent.
        <br /><br />
        Select and Compress manage what is in the window right now. Write and Isolate manage what is outside it. Production systems need all four.
      </Decision></FadeIn>

      <FadeIn delay={560}><Insight type="warn">
        Modern models cache the prompt prefix. If you reshuffle context every turn, you blow the cache and pay full price — up to 90% discount lost. Freeze a stable prefix, let only the tail move.
      </Insight></FadeIn>
    </div>
  );
}

function ProductionPatternsPanel() {
  return (
    <div>
      <SectionHead
        title="Production context engineering — where theory meets reality"
        desc="In production, your context pipeline handles thousands of requests per minute, each with different source combinations and budget pressures. These patterns handle that scale reliably."
      />

      <FadeIn><Decision question="Context caching (prompt caching)">
        Anthropic's prompt caching: the static prefix of your context (system prompt + few-shot examples) is cached server-side. Only the dynamic suffix (user query + RAG results) is sent fresh each request.
        <br /><br />
        <strong>Impact:</strong> Saves up to 90% on the static portion. A 4K system prompt + 2K examples cached = 6K tokens you're not paying for on every request.
        <br /><br />
        <strong>Design implication:</strong> Structure your context so the cacheable prefix is as large and stable as possible. System prompt, tool schemas, and few-shot examples should be at the top. User-specific and request-specific content should be at the bottom.
        <br /><br />
        <strong>Cache invalidation:</strong> Any change to the cached prefix invalidates the cache. Version your system prompts — don't edit them in place during a conversation.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Multi-turn context management">
        Conversation grows every turn. Without management, a 20-turn conversation can eat 40K tokens of raw history:
        <br /><br />
        <Pill type="green">Sliding window</Pill> Drop the oldest turns. Simple but lossy — the agent forgets early context entirely.
        <br /><br />
        <Pill type="blue">Summarize-and-compact</Pill> Periodically compress older turns into a summary. Every 5-10 turns, summarize turns 1-N into a paragraph and keep N+1 onward verbatim. Best balance of cost and quality.
        <br /><br />
        <Pill type="amber">Relevance-based pruning</Pill> Drop turns unrelated to the current topic. Requires a relevance model to score each turn against the current query. Sophisticated but fragile.
        <br /><br />
        <strong>Best practice:</strong> Hybrid approach — summarize old turns, keep recent turns verbatim, and always preserve the first turn (establishes the original intent).
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Context for tool-using agents">
        Each tool call adds 500-2000 tokens to context (tool schema + call + result). After 5 tool calls, you've burned 5K-10K tokens on tool context alone:
        <br /><br />
        <strong>Tool schema optimization:</strong> Only include schemas for tools relevant to the current task. A support agent doesn't need the analytics tool schema during a refund conversation.
        <br /><br />
        <strong>Result summarization:</strong> After the agent extracts what it needs from a tool result, summarize the result before re-injecting into context. A 1500-token JSON response often contains 100 tokens of relevant data.
        <br /><br />
        <strong>Schema dropping:</strong> After the first tool call, the model has seen the schema. You can drop tool schemas from subsequent turns and save tokens — the model remembers the function signature.
      </Decision></FadeIn>

      <FadeIn delay={240}><Insight type="warn">
        Real incident: An agent made 12 tool calls in one session. Each tool result was ~1500 tokens. That's 18K tokens of tool context — pushing the actual user query and RAG results out of the effective attention window. The agent started hallucinating because it couldn't "see" the retrieved documents buried under tool results. Fix: summarize tool results after use, keep only the data the agent extracted.
      </Insight></FadeIn>

      <FadeIn delay={320}><Decision question="Context engineering for RAG">
        Chunk size directly affects your context budget. At 512-token chunks, you can fit 8 chunks in a 4K RAG budget versus 4 chunks with 1024-token chunks. More chunks means better coverage but less context per chunk.
        <br /><br />
        <strong>Metadata overhead:</strong> Include source URL, document title, section heading, and date with each chunk. Costs ~50 tokens per chunk but dramatically improves faithfulness — the model can cite its sources and calibrate confidence.
        <br /><br />
        <strong>Retrieval score injection:</strong> Prepend the relevance score to each chunk: <code>[relevance: 0.92]</code>. This gives the model a confidence signal — it should weight a 0.92 chunk higher than a 0.65 chunk.
        <br /><br />
        <strong>Practical guideline:</strong> 5-8 chunks of 512 tokens with metadata is the sweet spot for most RAG systems. That's ~3K-5K tokens of retrieved context — enough for grounding without drowning the attention mechanism.
      </Decision></FadeIn>

      <FadeIn delay={400}><Insight tag="Context rot — the 2026 gotcha">
        "Lost in the middle" is about <em>position</em>. Context rot is about <em>length</em> — and it's the trap interviewers now spring with "the window is 1M tokens, why not just stuff everything in?" Chroma's 2025 <strong>Context Rot</strong> study ran 18 models (including the frontier long-context ones) on tasks as trivial as repeating a word or a single-fact lookup, and found accuracy <strong>decays as total input grows even when the relevant content sits at the top and the task never gets harder</strong>. Non-uniformly, too: add a few semantically-similar distractors and the curve falls off a cliff. The takeaway for design — the advertised window is a <em>ceiling, not a budget</em>. A 200K or 1M window does not mean 1M usable tokens; the <strong>effective window</strong> where reliability holds is often a small fraction of it. So the discipline doesn't disappear as windows grow — retrieval, compression, and aggressive pruning matter <em>more</em>, because now you can fit enough junk to quietly poison the answer without ever hitting a hard limit or throwing an error.
      </Insight></FadeIn>
    </div>
  );
}

function DeepDivePanel() {
  return (
    <div>
      <SectionHead
        title="Context engineering as a critical production discipline"
        desc="Context engineering is the new frontier of AI systems design. Here's how to frame your knowledge for senior engineering discussions."
      />

      <FadeIn><Decision question="Why context engineering is replacing prompt engineering">
        Prompt engineering = crafting one system prompt. Context engineering = designing the entire information pipeline into the LLM.
        <br /><br />
        As agents get more complex (RAG + tools + memory + multi-turn), the system prompt is less than 5% of what's in the context window. The other 95% — retrieved documents, tool results, conversation history, examples — needs engineering too.
        <br /><br />
        <strong>The shift:</strong> "Write a better prompt" was 2024 advice. "Design a context pipeline that maximizes signal-to-noise ratio across 6 source types under a hard token budget" — that's 2027.
        <br /><br />
        Prompt engineering is a subset of context engineering. The system prompt is one source among many.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="The critical question: 'Walk me through the context pipeline for an agent with RAG, tools, memory, and multi-turn conversation'">
        This is THE critical context engineering design question. Walk through the full pipeline:
        <br /><br />
        <strong>1. Budget allocation:</strong> 128K window → 108K effective. Fixed reserves for system prompt (3K). Dynamic allocation across conversation (30%), RAG (35%), tools (20%), examples (10%), reserve (5%).
        <br /><br />
        <strong>2. Source priority:</strong> System prompt (never dropped) → recent conversation (sliding window) → RAG (relevance-scored) → memory (recency-weighted) → tool results (freshness-ranked) → examples (expendable).
        <br /><br />
        <strong>3. Relevance scoring:</strong> Within each tier, score by <code>relevance * 0.7 + recency * 0.3</code>. Greedy fill within type budgets.
        <br /><br />
        <strong>4. Assembly order:</strong> System prompt first → highest-relevance RAG → chronological conversation → tool results → examples last. Optimized for the "lost in the middle" attention pattern.
        <br /><br />
        <strong>5. Caching strategy:</strong> Static prefix (system prompt + schemas + examples) cached via prompt caching. Dynamic suffix (query + RAG + recent conversation) sent fresh.
        <br /><br />
        <strong>6. Compression:</strong> Summarize conversation beyond 10 turns. Truncate tool results to extracted data. Deduplicate RAG chunks above 0.85 cosine similarity.
      </Decision></FadeIn>

      <FadeIn delay={160}><Insight>
        Context engineering is to 2027 what prompt engineering was to 2024. Prompt engineering got you a junior role. Context engineering — understanding token budgets, source prioritization, assembly strategies, caching, and compression — that's the senior-level skill. It's the difference between "I can write a good prompt" and "I can architect an information pipeline that makes an agent reliably intelligent."
      </Insight></FadeIn>

      <FadeIn delay={240}><Decision question="Common pitfalls in context pipeline design">
        <Pill type="amber">1. Treating context window as unlimited</Pill> "Just dump everything in the 128K window." This reveals shallow thinking — you've never built a production system. Performance degrades long before you hit the token limit.
        <br /><br />
        <Pill type="amber">2. Not knowing about "lost in the middle"</Pill> If you can't explain why position in the context matters, you haven't read the research. This is foundational.
        <br /><br />
        <Pill type="amber">3. Ignoring tool result accumulation</Pill> Most engineers forget that tool calls add tokens. An agent that makes 10 tool calls has 10-20K tokens of tool context competing with everything else.
        <br /><br />
        <Pill type="amber">4. No strategy for multi-turn growth</Pill> "Keep all conversation history" doesn't scale past turn 15. You need a compaction strategy.
        <br /><br />
        <Pill type="amber">5. Not mentioning prompt caching</Pill> If you're designing a production context pipeline and don't mention caching the static prefix, you're leaving 90% cost savings on the table.
      </Decision></FadeIn>

      <FadeIn delay={320}><div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.65, marginBottom: 8 }}>
          <strong>Related project:</strong>{' '}
          <Link to="/projects/22" style={{ color: 'var(--text-accent)', textDecoration: 'none', fontWeight: 500 }}>Project 22 — Context Window Optimizer</Link>{' '}
          — build a full context assembly pipeline with token budgeting, priority scoring, and eval-driven optimization.
        </p>
      </div></FadeIn>

      <FadeIn delay={400}><Decision question="The four failure modes of context (Drew Brunic)">
        Context does not just fail by being absent — it fails by being wrong, noisy, contradictory, or overwhelming. Each mode requires a different fix:
        <br /><br />
        <Pill type="amber">Poisoning</Pill> A wrong fact enters the context and keeps getting referenced as true. An early hallucination or a stale retrieval result becomes the foundation for all subsequent reasoning. The model treats everything in context as ground truth — one poisoned sentence can corrupt an entire chain of thought. Fix: validate facts at insertion time, version your memory, and add provenance metadata so the model can weigh source reliability.
        <br /><br />
        <Pill type="amber">Distraction</Pill> Context so long that the model over-focuses on window content instead of drawing on its training. When you dump 80K tokens of raw documents into the window, the model stops reasoning and starts pattern-matching against the blob. It becomes a parrot of the context instead of a thinker that uses context. Fix: compress aggressively, keep signal density high, and test with shorter context to see if quality actually improves.
        <br /><br />
        <Pill type="amber">Confusion</Pill> Superfluous material causes worse answers than no material at all. Adding a marginally relevant document does not help — it actively hurts. The model cannot distinguish "included because it might be useful" from "included because it is essential." Every token in the window carries implicit weight. Fix: set a minimum relevance threshold for inclusion. If a source scores below 0.7, dropping it outright beats including it.
        <br /><br />
        <Pill type="amber">Clash</Pill> Accumulated facts contradict each other. The January pricing document says one thing, the July update says another, and both are in context. The model has no way to know which is current. Fix: timestamp all context sources, prefer recent over old when conflicts exist, and deduplicate aggressively across retrieval results.
      </Decision></FadeIn>

      <FadeIn delay={480}><Insight type="warn">
        When an agent underperforms, run these four diagnostics before blaming the model: (1) Did it ever have the right information, or was the answer buried in low-attention positions? (2) Did the summary throw away a key detail during compaction? (3) Did it lose work it should have parked on disk — a finding that got compacted away because nobody wrote it to a scratchpad? (4) Did one giant context drown a subtask that deserved its own window? Most "the model is bad" complaints trace back to one of these four.
      </Insight></FadeIn>

      <FadeIn delay={560}><Insight>
        The meta-insight: every other topic in this playbook feeds into context engineering. RAG (Post 05) determines what gets retrieved. Memory (Post 02) determines what gets remembered. Cost engineering (Post 11) determines the budget. Eval (Post 08) measures whether your context pipeline works. Context engineering is the integration layer — the skill that ties everything together.
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
};
