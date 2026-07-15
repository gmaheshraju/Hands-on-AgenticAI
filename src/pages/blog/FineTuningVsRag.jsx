import { useState } from 'react';
import { Link } from 'react-router-dom';
import Decision, { Pill } from '../../components/Decision';
import Insight from '../../components/Insight';
import CodeBlock from '../../components/CodeBlock';
import FadeIn from '../../components/FadeIn';

const PROMPT_TEMPLATE_CODE = `function buildPrompt(template, variables, examples = []) {
  let prompt = template;
  for (const [key, value] of Object.entries(variables)) {
    prompt = prompt.replace(\`{{\${key}}}\`, value);
  }

  if (examples.length > 0) {
    const exampleBlock = examples.map(ex =>
      \`Input: \${ex.input}\\nOutput: \${JSON.stringify(ex.output)}\`
    ).join('\\n\\n');
    prompt = prompt.replace('{{examples}}', exampleBlock);
  }

  return prompt;
}

const CLASSIFY_TEMPLATE = \`You are a support ticket classifier.

Classify the ticket into exactly one category.
Respond with JSON: {"category": "...", "confidence": 0.0-1.0}

Examples:
{{examples}}

Ticket: {{ticket}}\`;

const examples = [
  { input: "I can't log in to my account",
    output: { category: "auth", confidence: 0.95 } },
  { input: "When will my order arrive?",
    output: { category: "shipping", confidence: 0.92 } },
  { input: "The app crashes when I upload a photo",
    output: { category: "bug", confidence: 0.88 } },
];`;

const PROMPT_TEMPLATE_OUTPUT = `> const prompt = buildPrompt(CLASSIFY_TEMPLATE,
    { ticket: "My credit card was charged twice" },
    examples
  )
> await classify(prompt)

{ category: "billing", confidence: 0.91 }

Prompt tokens: 287 | Output tokens: 18 | Cost: $0.000089
Latency: 340ms | No retrieval, no fine-tuning needed.`;

const RAG_PIPELINE_CODE = `async function ragQuery(question, { topK = 5, minScore = 0.7 } = {}) {
  // 1. Retrieve relevant chunks
  const chunks = await vectorDB.search(
    await embed(question), { limit: topK }
  );

  // 2. Quality gate — if best chunk score is too low, abstain
  if (chunks[0].score < minScore) {
    return {
      answer: "I don't have enough information to answer this accurately.",
      confidence: 'low',
      sources: [],
    };
  }

  // 3. Build grounded prompt
  const context = chunks
    .map((c, i) => \`[Source \${i + 1}]: \${c.text}\`)
    .join('\\n\\n');

  const answer = await callLLM(\`Answer based ONLY on the provided sources.
Cite sources as [Source N]. If the sources don't contain the answer, say so.

Sources:
\${context}

Question: \${question}\`);

  return {
    answer,
    confidence: 'high',
    sources: chunks.map(c => c.metadata),
  };
}`;

const RAG_PIPELINE_OUTPUT = `> await ragQuery("What's the refund policy for enterprise plans?")

{ answer: "Enterprise plans have a 60-day refund window with prorated
    billing [Source 1]. Refunds are processed within 5-7 business days
    to the original payment method [Source 3].",
  confidence: "high",
  sources: [
    { doc: "enterprise-billing.md", chunk: 4, score: 0.92 },
    { doc: "refund-policy.md", chunk: 2, score: 0.89 },
    { doc: "enterprise-billing.md", chunk: 7, score: 0.84 },
  ]
}

> await ragQuery("What's the CEO's favorite color?")

{ answer: "I don't have enough information to answer this accurately.",
  confidence: "low",
  sources: []
}

Retrieval: 85ms | Generation: 1200ms | Total: 1285ms`;

const FINETUNE_DATA_CODE = `async function prepareFineTuningData(
  rawExamples,
  { systemPrompt, validate }
) {
  const dataset = [];
  const rejected = [];

  for (const ex of rawExamples) {
    // Validate each example meets quality bar
    const validation = await validate(ex);
    if (!validation.pass) {
      rejected.push({ ...ex, reason: validation.reason });
      continue;
    }

    dataset.push({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: ex.input },
        { role: 'assistant', content: ex.idealOutput },
      ],
    });
  }

  // Split: 90% train, 10% eval
  const split = Math.floor(dataset.length * 0.9);
  const train = dataset.slice(0, split);
  const eval_ = dataset.slice(split);

  return {
    train,
    eval: eval_,
    rejected,
    stats: {
      total: rawExamples.length,
      accepted: dataset.length,
      rejected: rejected.length,
      trainSize: train.length,
      evalSize: eval_.length,
    },
  };
}`;

const FINETUNE_DATA_OUTPUT = `> const { stats, rejected } = await prepareFineTuningData(
    productionLogs,
    { systemPrompt: "You are a medical coding assistant...",
      validate: medicalCodingValidator }
  )

Stats:
  Total examples:    847
  Accepted:          612 (72.3%)
  Rejected:          235 (27.7%)
  Train set:         550
  Eval set:           62

Top rejection reasons:
  "Output contains hallucinated ICD code"     — 89 examples
  "Input too short for meaningful training"    — 67 examples
  "Output format doesn't match schema"        — 44 examples
  "Duplicate of existing example"             — 35 examples

Ready for upload: train.jsonl (550 examples, 1.2M tokens)
Estimated cost: $9.60 (GPT-4o-mini fine-tuning)`;

const TABS = ['The Decision Tree', 'Prompt Engineering', 'RAG', 'Fine-tuning', 'Combining Techniques'];

export default function FineTuningVsRag() {
  const [tab, setTab] = useState(0);
  return (
    <div className="page-content">
      <Link to="/blog" style={styles.back}>&larr; AI Engineering</Link>
      <p style={styles.eyebrow}>Post 09</p>
      <h1 style={styles.h1}>Fine-tuning vs Prompting vs RAG</h1>
      <p style={styles.subtitle}>
        The decision framework every AI architect needs &mdash; when to prompt engineer,
        when to retrieve, when to fine-tune, and when to combine them. Get this wrong and
        you waste 3 months building the wrong thing.
      </p>
      <div style={styles.tabWrap}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            style={{ ...styles.tabBtn, ...(tab === i ? styles.tabActive : {}) }}>
            {t}
          </button>
        ))}
      </div>
      {tab === 0 && <DecisionTreePanel />}
      {tab === 1 && <PromptEngineeringPanel />}
      {tab === 2 && <RagPanel />}
      {tab === 3 && <FineTuningPanel />}
      {tab === 4 && <CombiningPanel />}

      <FadeIn><div style={{ marginTop: 48, padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Capstone Project</p>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-h)', marginBottom: 6 }}>Same Problem Three Ways</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Build the real thing. Production-grade project brief with architecture requirements, evaluation criteria, and staff+ interview angles.</p>
        <a href="https://github.com/gmaheshraju/Hands-on-AgenticAI/blob/main/projects/09-fine-tuning-vs-rag.md" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--text-accent)', textDecoration: 'none', fontWeight: 500 }}>View project brief on GitHub →</a>
      </div></FadeIn>
        </div>
  );
}

/* ─── Tab 1: The Decision Tree ─── */
function DecisionTreePanel() {
  return (
    <FadeIn>
      <SectionHead
        title="The Core Decision Framework"
        desc="Five questions that determine whether you need prompting, RAG, or fine-tuning. Answer them in order — each one narrows the search space."
      />

      <Decision question="What are you trying to change — the model's KNOWLEDGE or its BEHAVIOR?">
        <p><Pill type="green">Knowledge</Pill> Facts, docs, data that changes over time &rarr; <strong>RAG</strong>.
          The model needs information it was never trained on or that has changed since training.</p>
        <p><Pill type="amber">Behavior</Pill> Output format, tone, reasoning style, domain-specific patterns &rarr; <strong>Fine-tuning</strong>.
          The model knows the facts but doesn't do the right thing with them.</p>
        <p><Pill type="green">Neither</Pill> The model already knows enough, just needs direction &rarr; <strong>Prompt engineering</strong>.
          This is the starting point 90% of the time. Try this first.</p>
      </Decision>

      <Decision question="How often does the information change?">
        <p><Pill type="green">Daily or weekly</Pill> RAG. Fine-tuning can't keep up &mdash; retraining takes hours to days, and you need fresh eval data each time.
          Product catalogs, pricing, support docs, compliance policies.</p>
        <p><Pill type="amber">Rarely or never</Pill> Fine-tuning is viable. Medical coding standards change yearly. Legal precedent is stable.
          Tax rules update annually.</p>
        <p><Pill type="red">Real-time</Pill> RAG + live API tool calls. Stock prices, weather, inventory levels.
          No static approach works here &mdash; you need a retrieval layer that hits live data sources.</p>
      </Decision>

      <Decision question="Do you need citations and attribution?">
        <p><Pill type="green">Yes</Pill> RAG is the only option. Fine-tuning bakes knowledge into model weights &mdash;
          the model can't tell you which training example informed its answer. RAG retrieves specific
          documents and can cite them: &quot;Based on section 4.2 of the refund policy...&quot;</p>
        <p><Pill type="amber">No</Pill> Either approach works. But consider: even if you don't need citations
          today, auditors and regulators increasingly demand explainability. RAG gives you that for free.</p>
      </Decision>

      <Decision question="What's your latency budget?">
        <p><Pill type="green">{'<'} 500ms total</Pill> Fine-tuning or prompting. RAG adds 80-300ms for embedding + vector search + re-ranking.
          On a P95 basis, that often pushes you past 500ms when combined with LLM inference.</p>
        <p><Pill type="amber">{'<'} 2 seconds</Pill> RAG is fine. Most production RAG systems run 800ms-1.5s end-to-end.
          Users tolerate this for search, support, and knowledge-base queries.</p>
        <p><Pill type="green">Batch or async</Pill> Anything works. Document processing, nightly reports,
          email classification &mdash; latency doesn't matter.</p>
      </Decision>

      <Decision question="What's your data volume?">
        <p><Pill type="green">{'<'} 100 examples</Pill> Prompt engineering with few-shot examples. You don't have enough
          data to fine-tune reliably. Put your best 3-5 examples directly in the prompt.</p>
        <p><Pill type="amber">100 - 10K examples</Pill> Fine-tuning sweet spot. Enough data to shift model behavior
          without overfitting. 500-1000 high-quality examples is the practical optimum.</p>
        <p><Pill type="green">10K+ documents</Pill> RAG. You're building a knowledge base, not training data.
          Index, chunk, embed, retrieve.</p>
      </Decision>

      <FadeIn delay={200}>
        <div style={{ margin: '32px 0', overflowX: 'auto' }}>
          <svg viewBox="0 0 780 420" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 780, display: 'block', margin: '0 auto' }}>
            {/* Root */}
            <rect x="290" y="10" width="200" height="36" rx="8" fill="var(--bg-card)" stroke="var(--border-strong)" strokeWidth="1.5" />
            <text x="390" y="34" textAnchor="middle" fontSize="13" fontFamily="var(--font-display)" fontWeight="600" fill="var(--text-h)">What do you need?</text>

            {/* Branches from root */}
            <line x1="330" y1="46" x2="140" y2="90" stroke="var(--border)" strokeWidth="1" />
            <line x1="390" y1="46" x2="390" y2="90" stroke="var(--border)" strokeWidth="1" />
            <line x1="450" y1="46" x2="640" y2="90" stroke="var(--border)" strokeWidth="1" />

            {/* Left: Change knowledge */}
            <rect x="40" y="90" width="200" height="32" rx="6" fill="var(--bg-code)" stroke="var(--border)" />
            <text x="140" y="111" textAnchor="middle" fontSize="12" fontFamily="var(--font-body)" fill="var(--text-p)">Change knowledge</text>

            <line x1="100" y1="122" x2="100" y2="160" stroke="var(--border)" strokeWidth="1" />

            <rect x="20" y="160" width="160" height="28" rx="6" fill="var(--bg-code)" stroke="var(--border)" />
            <text x="100" y="179" textAnchor="middle" fontSize="11" fontFamily="var(--font-body)" fill="var(--text-p)">How often updated?</text>

            <line x1="60" y1="188" x2="60" y2="220" stroke="var(--border)" strokeWidth="1" />
            <line x1="140" y1="188" x2="140" y2="220" stroke="var(--border)" strokeWidth="1" />

            <rect x="10" y="220" width="100" height="28" rx="14" fill="var(--bg-accent)" />
            <text x="60" y="239" textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fontWeight="600" fill="var(--text-accent)">RAG</text>
            <text x="60" y="258" textAnchor="middle" fontSize="9" fontFamily="var(--font-body)" fill="var(--text-muted)">Frequently</text>

            {/* Rarely branch */}
            <rect x="120" y="220" width="100" height="28" rx="6" fill="var(--bg-code)" stroke="var(--border)" />
            <text x="170" y="239" textAnchor="middle" fontSize="10" fontFamily="var(--font-body)" fill="var(--text-p)">Need citations?</text>

            <line x1="145" y1="248" x2="120" y2="280" stroke="var(--border)" strokeWidth="1" />
            <line x1="195" y1="248" x2="220" y2="280" stroke="var(--border)" strokeWidth="1" />

            <rect x="70" y="280" width="90" height="28" rx="14" fill="var(--bg-accent)" />
            <text x="115" y="299" textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fontWeight="600" fill="var(--text-accent)">RAG</text>
            <text x="115" y="317" textAnchor="middle" fontSize="9" fontFamily="var(--font-body)" fill="var(--text-muted)">Yes</text>

            <rect x="175" y="280" width="100" height="28" rx="14" fill="var(--bg-accent)" />
            <text x="225" y="299" textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fontWeight="600" fill="var(--text-accent)">Fine-tune</text>
            <text x="225" y="317" textAnchor="middle" fontSize="9" fontFamily="var(--font-body)" fill="var(--text-muted)">No</text>

            {/* Center: Change behavior */}
            <rect x="290" y="90" width="200" height="32" rx="6" fill="var(--bg-code)" stroke="var(--border)" />
            <text x="390" y="111" textAnchor="middle" fontSize="12" fontFamily="var(--font-body)" fill="var(--text-p)">Change behavior</text>

            <line x1="390" y1="122" x2="390" y2="160" stroke="var(--border)" strokeWidth="1" />

            <rect x="300" y="160" width="180" height="28" rx="6" fill="var(--bg-code)" stroke="var(--border)" />
            <text x="390" y="179" textAnchor="middle" fontSize="11" fontFamily="var(--font-body)" fill="var(--text-p)">How many examples?</text>

            <line x1="330" y1="188" x2="310" y2="220" stroke="var(--border)" strokeWidth="1" />
            <line x1="390" y1="188" x2="390" y2="220" stroke="var(--border)" strokeWidth="1" />
            <line x1="450" y1="188" x2="470" y2="220" stroke="var(--border)" strokeWidth="1" />

            <rect x="260" y="220" width="100" height="28" rx="14" fill="var(--bg-accent)" />
            <text x="310" y="239" textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fontWeight="600" fill="var(--text-accent)">Few-shot</text>
            <text x="310" y="258" textAnchor="middle" fontSize="9" fontFamily="var(--font-body)" fill="var(--text-muted)">{'<'} 100</text>

            <rect x="340" y="220" width="100" height="28" rx="14" fill="var(--bg-accent)" />
            <text x="390" y="239" textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fontWeight="600" fill="var(--text-accent)">Fine-tune</text>
            <text x="390" y="258" textAnchor="middle" fontSize="9" fontFamily="var(--font-body)" fill="var(--text-muted)">100 - 10K</text>

            <rect x="430" y="220" width="100" height="28" rx="14" fill="var(--bg-accent)" />
            <text x="480" y="239" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fontWeight="600" fill="var(--text-accent)">FT + eval</text>
            <text x="480" y="258" textAnchor="middle" fontSize="9" fontFamily="var(--font-body)" fill="var(--text-muted)">{'>'}10K</text>

            {/* Right: Just guide it */}
            <rect x="540" y="90" width="200" height="32" rx="6" fill="var(--bg-code)" stroke="var(--border)" />
            <text x="640" y="111" textAnchor="middle" fontSize="12" fontFamily="var(--font-body)" fill="var(--text-p)">Just guide it</text>

            <line x1="640" y1="122" x2="640" y2="160" stroke="var(--border)" strokeWidth="1" />

            <rect x="560" y="160" width="160" height="28" rx="14" fill="var(--bg-accent)" />
            <text x="640" y="179" textAnchor="middle" fontSize="12" fontFamily="var(--font-mono)" fontWeight="600" fill="var(--text-accent)">Prompt engineering</text>

            {/* Legend */}
            <text x="390" y="400" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill="var(--text-muted)">
              Start here. Answer each question top-down. First leaf you hit is your starting approach.
            </text>
          </svg>
        </div>
      </FadeIn>

      <Insight>
        The interviewer is testing whether you'll jump to fine-tuning because it sounds impressive,
        or whether you'll start with the cheapest option that works. The right answer is almost always:
        start with prompt engineering, add RAG if you need external knowledge, fine-tune only if the
        first two can't get the behavior right. Each step up costs 10x more in engineering time.
      </Insight>
    </FadeIn>
  );
}

/* ─── Tab 2: Prompt Engineering ─── */
function PromptEngineeringPanel() {
  return (
    <FadeIn>
      <SectionHead
        title="Prompt Engineering — The Cheapest Wins"
        desc="This is your baseline. It takes hours, not weeks. If you skip this and go straight to fine-tuning, you're optimizing for resume lines, not product velocity."
      />

      <Decision question="Zero-shot vs few-shot vs chain-of-thought?">
        <p><Pill type="green">Zero-shot</Pill> Just the instruction, no examples.
          Works for simple classification, extraction, and reformatting.
          &quot;Classify this email as spam or not-spam.&quot; GPT-4-class models hit 85-90% accuracy on most
          zero-shot classification tasks.</p>
        <p><Pill type="amber">Few-shot</Pill> 3-5 examples in the prompt. Works when the task is clear
          but the output format is specific. Each example costs ~50-100 tokens. At $3/1M input tokens (Claude Sonnet),
          5 examples add $0.0015 per request &mdash; negligible at any scale.</p>
        <p><Pill type="green">Chain-of-thought</Pill> &quot;Think step by step.&quot; Adds ~30% latency
          and ~2x output tokens, but improves accuracy on math, logic, and multi-step reasoning from
          ~60% to ~85%+. The cost/accuracy tradeoff is almost always worth it for reasoning tasks.</p>
      </Decision>

      <Decision question="System prompt vs user prompt?">
        <p><Pill type="green">System prompt</Pill> Persistent behavior instructions: tone, format constraints,
          persona, output schema, safety rules. This is your &quot;base model config&quot; &mdash;
          it stays the same across requests. Cached system prompts on Claude/GPT-4 reduce input costs by 90%.</p>
        <p><Pill type="amber">User prompt</Pill> Per-request context and instructions. The variable input
          that changes every call. Keep task-specific data here &mdash; the document to summarize, the ticket
          to classify, the code to review.</p>
      </Decision>

      <Insight tag="Real numbers">
        Prompt engineering gets you to 80-85% accuracy on most tasks out of the box. The question is
        whether 85% is good enough for your use case. For internal tools, usually yes. For medical
        diagnosis or legal advice, usually no. Know your accuracy threshold before picking a technique.
      </Insight>

      <CodeBlock
        code={PROMPT_TEMPLATE_CODE}
        filename="prompt-template.js"
        output={PROMPT_TEMPLATE_OUTPUT}
      />

      <Decision question="When is prompt engineering NOT enough?">
        <p><Pill type="red">Edge case consistency</Pill> You need consistent structured output across
          thousands of edge cases. Prompts degrade on the long tail &mdash; the 95th percentile input
          that your 5 examples don't cover.</p>
        <p><Pill type="red">Missing domain knowledge</Pill> The task requires domain-specific reasoning
          the base model genuinely doesn't have. Rare with GPT-4/Claude, but real for niche domains
          like semiconductor yield analysis or exotic derivatives pricing.</p>
        <p><Pill type="red">Prompt cost at scale</Pill> Repeating 50 few-shot examples on every request
          becomes a real cost problem at 1M+ requests/day. Fine-tuning bakes those examples into weights &mdash;
          zero per-request overhead.</p>
        <p><Pill type="red">Latency constraints</Pill> Long prompts = more time-to-first-token.
          If you need {'<'} 100ms response times, you can't afford a 2000-token system prompt.</p>
      </Decision>

      <Insight type="warn">
        The biggest prompt engineering mistake: stuffing everything into one mega-prompt. Break complex
        tasks into chains. A 4-step chain of simple prompts beats a single 3000-token prompt in both
        accuracy and debuggability. Each step is independently testable and swappable.
      </Insight>
    </FadeIn>
  );
}

/* ─── Tab 3: RAG ─── */
function RagPanel() {
  return (
    <FadeIn>
      <SectionHead
        title="RAG — When the Model Needs Knowledge It Doesn't Have"
        desc="Retrieval-Augmented Generation bridges the gap between what the model was trained on and what your users need answers about. It's the workhorse of enterprise AI."
      />

      <Decision question="When RAG wins over fine-tuning">
        <p><Pill type="green">Data changes frequently</Pill> Product catalogs, documentation, pricing,
          policies. Re-indexing takes minutes; retraining takes hours. A nightly re-index pipeline
          costs ~$5-20/month on most vector DBs.</p>
        <p><Pill type="green">You need citations</Pill> &quot;Based on section 4.2 of the policy...&quot;
          RAG naturally provides source attribution. Fine-tuning cannot &mdash; knowledge is compressed
          into weight updates with no traceability back to training examples.</p>
        <p><Pill type="green">Data is too large</Pill> Millions of documents, terabytes of text.
          You can't fit this in training data, but you can index and retrieve from it. Vector DBs scale
          to billions of embeddings.</p>
        <p><Pill type="green">Access control matters</Pill> User A sees different docs than User B.
          RAG applies per-query metadata filters at retrieval time. Fine-tuning bakes everything
          into one model &mdash; no per-user access control possible.</p>
      </Decision>

      <Decision question="RAG pitfalls — when retrieval fails silently">
        <p><Pill type="red">Bad chunking</Pill> Your 512-token chunks split a table in half, cut a code
          block mid-function, or separate a question from its answer. Chunk boundaries are the #1
          RAG failure mode. Use semantic chunking or overlap of 10-20%.</p>
        <p><Pill type="red">Semantic gap</Pill> User asks &quot;how do I cancel?&quot; but the doc
          says &quot;subscription termination procedure.&quot; Embedding similarity misses this.
          Fix: query expansion (rewrite the query 3 ways) or hybrid search (BM25 + vector).</p>
        <p><Pill type="red">Multi-hop reasoning</Pill> The answer requires synthesizing information
          across 3-4 documents. Single-chunk retrieval fails. Fix: iterative retrieval (retrieve,
          reason, retrieve again) or pre-computed document graphs.</p>
        <p><Pill type="red">Stale index</Pill> Someone updated the docs but the index hasn't re-run.
          Users get yesterday's pricing or last week's policy. Fix: event-driven re-indexing on
          doc changes, not nightly batch jobs.</p>
      </Decision>

      <Insight tag="Cost comparison">
        RAG setup: 1-2 weeks engineering, ~$50-200/month for vector DB + embeddings.
        Fine-tuning: 2-4 weeks engineering, $50-500 per training run, plus ongoing eval infrastructure.
        RAG is 5-10x cheaper to maintain long-term because updating knowledge is just re-indexing,
        not retraining. The break-even point where fine-tuning becomes cheaper is around 10M+ requests/month
        with stable data.
      </Insight>

      <CodeBlock
        code={RAG_PIPELINE_CODE}
        filename="rag-pipeline.js"
        output={RAG_PIPELINE_OUTPUT}
      />

      <Decision question="The quality gate pattern — why it matters">
        <p><Pill type="green">Abstain over hallucinate</Pill> When the best retrieved chunk scores below
          your threshold (0.7 is a solid default), return &quot;I don't know&quot; instead of guessing.
          A confident wrong answer is worse than no answer. This single pattern prevents 80% of RAG
          hallucinations in production.</p>
        <p><Pill type="amber">Re-ranking</Pill> Embedding similarity is a rough filter. Add a cross-encoder
          re-ranker (like Cohere Rerank or a local model) as a second pass. Costs 5-20ms extra but
          improves top-5 precision by 15-25% on average.</p>
      </Decision>

      <Insight type="warn">
        The most common RAG failure in production: teams spend 3 weeks on the vector DB and retrieval
        pipeline, then 2 hours on the generation prompt. Flip it. Retrieval quality sets the ceiling,
        but the prompt determines how much of that ceiling you actually reach. A mediocre retriever
        with a great prompt beats a great retriever with a mediocre prompt.
      </Insight>
    </FadeIn>
  );
}

/* ─── Tab 4: Fine-tuning ─── */
function FineTuningPanel() {
  return (
    <FadeIn>
      <SectionHead
        title="Fine-tuning — Changing How the Model Thinks"
        desc="Fine-tuning modifies model weights to shift behavior. It's the most powerful technique and the most expensive to get wrong. Reach for it last, not first."
      />

      <Decision question="What fine-tuning actually changes">
        <p><Pill type="green">Output format consistency</Pill> Always return valid JSON matching your
          schema. Always use your company's field names. After fine-tuning on 500 examples, schema
          compliance goes from ~92% (prompted) to 99.5%+.</p>
        <p><Pill type="green">Domain-specific reasoning</Pill> Medical diagnosis patterns, legal
          analysis frameworks, code review in your specific stack. The model learns reasoning shortcuts
          that prompts can't teach.</p>
        <p><Pill type="amber">Tone and style</Pill> Brand voice, formality level, response length
          calibration. Fine-tuned models match target style ~95% of the time vs ~75% with prompting alone.</p>
        <p><Pill type="red">NOT for adding knowledge</Pill> Fine-tuning is terrible for injecting facts.
          Knowledge gets compressed and distorted in weight updates. The model might &quot;know&quot; the fact
          but can't cite it, and you can't update it without retraining. Use RAG for knowledge.</p>
      </Decision>

      <Decision question="Full fine-tune vs LoRA vs QLoRA">
        <p><Pill type="red">Full fine-tune</Pill> Update all parameters. $1000+ per run on 70B models,
          requires 8xA100 or equivalent. Only justified with massive data ({'>'}50K examples) and a
          dedicated ML team. Most teams never need this.</p>
        <p><Pill type="green">LoRA</Pill> Freeze base model, train small adapter layers (0.1-1% of
          parameters). 10-100x cheaper. Runs on 1-2 A100s. Gets 90-95% of full fine-tune quality.
          This is the default choice for self-hosted fine-tuning.</p>
        <p><Pill type="green">QLoRA</Pill> LoRA on a 4-bit quantized model. Fits on a single A100 or
          even a 48GB A6000. Best cost/performance ratio for budget-conscious teams. ~5% quality
          drop vs LoRA on most benchmarks.</p>
        <p><Pill type="amber">API fine-tuning</Pill> OpenAI, Anthropic, Google &mdash; upload JSONL,
          wait, get a model endpoint. Zero infra, limited customization. Best for teams without ML
          engineers. OpenAI GPT-4o-mini: ~$25 to fine-tune 1000 examples.</p>
      </Decision>

      <Insight tag="Real numbers">
        You need minimum 100 high-quality examples. 500-1000 is the practical sweet spot.
        Diminishing returns after ~5000 examples &mdash; spend effort on data quality, not quantity.
        200 expert-written gold-standard examples beats 5000 noisy crowd-sourced ones every time.
        Measure on a held-out eval set, not vibes.
      </Insight>

      <Decision question="How to build a fine-tuning dataset">
        <p><Pill type="green">Start with production logs</Pill> Real user queries + ideal responses
          curated by domain experts. This is your highest-signal data source. Filter for cases where
          the base model struggled &mdash; easy cases don't improve fine-tuning.</p>
        <p><Pill type="amber">Expert annotation</Pill> Have domain experts (not crowd workers) write
          gold-standard responses. Crowd workers produce grammatically correct nonsense. Domain experts
          produce actually correct outputs. The cost difference is 5x but the quality difference is 50x.</p>
        <p><Pill type="red">Synthetic data</Pill> Use the base model to generate training data for
          a smaller model. Works for distillation (GPT-4 {'->'} GPT-4o-mini) but creates a quality ceiling.
          The student can't exceed the teacher. Only use when expert annotation isn't feasible.</p>
      </Decision>

      <CodeBlock
        code={FINETUNE_DATA_CODE}
        filename="prepare-finetuning-data.js"
        output={FINETUNE_DATA_OUTPUT}
      />

      <Insight type="warn">
        Fine-tuning is NOT a shortcut. It's the most expensive option in engineering time &mdash;
        you need data collection, cleaning, training, evaluation, and ongoing monitoring for drift.
        Most teams that jump to fine-tuning could have solved their problem with better prompts or
        RAG. Fine-tune only when you've proven prompt engineering hits a ceiling and you can point
        to specific failure modes that prompting can't fix.
      </Insight>
    </FadeIn>
  );
}

/* ─── Tab 5: Combining Techniques ─── */
function CombiningPanel() {
  return (
    <FadeIn>
      <SectionHead
        title="Combining Techniques — What Production Systems Actually Do"
        desc="Real systems rarely use just one technique. The art is knowing which combinations solve your problem without overengineering."
      />

      <Decision question="RAG + Prompt Engineering — the 80% combo">
        <p><Pill type="green">Most common in production</Pill> RAG retrieves the knowledge, prompt
          engineering shapes the output. Customer support bots, internal knowledge bases, documentation
          assistants. This combination covers 80% of enterprise AI use cases.</p>
        <p>Setup time: 1-3 weeks. Monthly cost: $200-2000. Engineering complexity: moderate.
          One backend engineer can build and maintain this. No ML expertise required.</p>
      </Decision>

      <Decision question="RAG + Fine-tuning — the power combo">
        <p><Pill type="amber">Highest quality, highest cost</Pill> Fine-tune for domain-specific
          reasoning and behavior. RAG for up-to-date knowledge. Example: medical diagnosis &mdash;
          fine-tuned model understands clinical reasoning patterns, RAG provides latest guidelines
          and drug interactions.</p>
        <p>Setup time: 4-8 weeks. Monthly cost: $1000-10000. Requires at least one ML engineer
          plus domain experts for training data. Worth it when accuracy requirements are {'>'}95%
          and the domain is complex enough that prompting can't reach that bar.</p>
      </Decision>

      <Decision question="Prompt Engineering + Fine-tuning">
        <p><Pill type="amber">Behavioral base + per-request flexibility</Pill> Fine-tune for your
          company's base behavior (writing style, output schema, reasoning approach). Use the system
          prompt for per-request customization (content type: blog vs email vs docs, audience: technical
          vs non-technical, length: brief vs detailed).</p>
        <p>This works when your output quality problem is behavioral consistency, not missing knowledge.
          The fine-tuned model nails your style 95% of the time; the prompt handles the remaining 5%
          of per-request variation.</p>
      </Decision>

      <Insight tag="The cost ladder">
        Engineering time + monthly cost for each tier:
        (1) Prompt engineering: 1-3 days setup, $0-100/month.
        (2) RAG: 1-3 weeks, $200-2000/month.
        (3) Fine-tuning: 2-6 weeks, $500-5000/month.
        (4) RAG + Fine-tuning: 4-8 weeks, $1000-10000/month.
        Each step up is a 5-10x jump in total cost of ownership. Justify each escalation with data.
      </Insight>

      <Decision question="The iteration pattern — the answer that wins interviews">
        <p><Pill type="green">Week 1</Pill> Ship with prompt engineering. Build a golden eval dataset
          of 50-100 examples. Measure accuracy, latency, and cost. This is your baseline. If accuracy
          is above your threshold, stop here. You're done.</p>
        <p><Pill type="amber">Week 2-3</Pill> If accuracy {'<'} 85%, analyze failure modes. If failures
          are &quot;model doesn't know X&quot; &mdash; add RAG. If failures are &quot;model knows but
          outputs wrong format/style&quot; &mdash; that's a prompting problem first, fine-tuning second.</p>
        <p><Pill type="amber">Month 2</Pill> If behavior is still inconsistent after prompt optimization,
          collect 500 production examples of correct behavior and fine-tune. Measure the delta on your
          golden dataset. If the improvement is {'<'} 5%, the fine-tuning wasn't worth it &mdash; go back
          to prompt engineering.</p>
        <p><Pill type="red">Never</Pill> Skip straight to fine-tuning before trying the cheaper options.
          &quot;We fine-tuned a model&quot; sounds impressive but &quot;we solved it with a 200-token
          prompt&quot; ships 10x faster and is 100x easier to maintain.</p>
      </Decision>

      <Insight>
        In the interview, walk through this exact iteration pattern. Start with: &quot;I'd first
        establish a baseline with prompt engineering, measure accuracy on a golden dataset, and only
        escalate to RAG or fine-tuning when I can point to specific failure modes that cheaper
        approaches can't fix.&quot; This signals that you optimize for engineering velocity, not
        technical complexity. The staff+ engineer builds the simplest thing that works, not the most
        sophisticated thing they can.
      </Insight>
    </FadeIn>
  );
}

/* ─── Helpers ─── */
function SectionHead({ title, desc }) {
  return (<>
    <h2 style={styles.sh}>{title}</h2>
    <p style={styles.ss}>{desc}</p>
  </>);
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
