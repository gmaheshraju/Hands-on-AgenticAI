import { useState } from 'react';
import { Link } from 'react-router-dom';
import Decision, { Pill } from '../../components/Decision';
import Insight from '../../components/Insight';
import CodeBlock from '../../components/CodeBlock';
import FadeIn from '../../components/FadeIn';

const MODEL_ROUTER_CODE = `const MODEL_TIERS = {
  simple:  { model: 'claude-haiku-4-5',  costPer1M: 0.25,  maxTokens: 1024 },
  medium:  { model: 'claude-sonnet-5',   costPer1M: 3.0,   maxTokens: 4096 },
  complex: { model: 'claude-opus-4',     costPer1M: 15.0,  maxTokens: 8192 },
};

async function routeRequest(messages, tools) {
  const complexity = classifyComplexity(messages, tools);
  const tier = MODEL_TIERS[complexity];

  const response = await callModel({
    model: tier.model,
    messages,
    tools,
    max_tokens: tier.maxTokens,
  });

  // Quality check — cascade up if confidence is low
  if (response.confidence < 0.7 && complexity !== 'complex') {
    const nextTier = complexity === 'simple' ? 'medium' : 'complex';
    return routeRequest(messages, tools); // retry with higher tier
  }

  return { ...response, model: tier.model, cost: calculateCost(response, tier) };
}

function classifyComplexity(messages, tools) {
  const lastMessage = messages[messages.length - 1].content;
  const wordCount = lastMessage.split(' ').length;
  const hasTools = tools && tools.length > 0;
  const hasMultiStep = /\\b(and then|after that|also|compare|analyze)\\b/i.test(lastMessage);

  if (wordCount < 20 && !hasTools && !hasMultiStep) return 'simple';
  if (wordCount > 100 || hasMultiStep) return 'complex';
  return 'medium';
}`;

const MODEL_ROUTER_OUTPUT = `> routeRequest([{ role: 'user', content: 'What time do you close?' }])
{ model: 'claude-haiku-4-5', cost: $0.000034, latency: 180ms }

> routeRequest([{ role: 'user', content: 'Compare our Q3 revenue across all
  regions and identify the underperforming segments with recommendations' }])
{ model: 'claude-opus-4', cost: $0.0089, latency: 2400ms }

Monthly savings at 100K requests: $12,400 → $2,100 (83% reduction)`;

const SEMANTIC_CACHE_CODE = `class SemanticCache {
  constructor(vectorDB, { threshold = 0.93, ttlSeconds = 3600 } = {}) {
    this.vectorDB = vectorDB;
    this.threshold = threshold;
    this.ttlSeconds = ttlSeconds;
    this.stats = { hits: 0, misses: 0 };
  }

  async get(query) {
    const embedding = await embed(query);
    const results = await this.vectorDB.search(embedding, { limit: 1 });

    if (results[0] && results[0].score >= this.threshold) {
      const cached = results[0].metadata;
      if (Date.now() - cached.timestamp < this.ttlSeconds * 1000) {
        this.stats.hits++;
        return { hit: true, response: cached.response, score: results[0].score };
      }
    }

    this.stats.misses++;
    return { hit: false };
  }

  async set(query, response) {
    const embedding = await embed(query);
    await this.vectorDB.upsert({
      id: hash(query),
      vector: embedding,
      metadata: { query, response, timestamp: Date.now() },
    });
  }

  hitRate() {
    const total = this.stats.hits + this.stats.misses;
    return total ? (this.stats.hits / total * 100).toFixed(1) + '%' : '0%';
  }
}`;

const SEMANTIC_CACHE_OUTPUT = `> cache.get("What's your return policy?")
{ hit: true, response: "You can return items within 30 days...", score: 0.97 }
// Saved: $0.003 per cached response

> cache.get("How do I return something I bought?")
{ hit: true, response: "You can return items within 30 days...", score: 0.94 }
// Semantic match! Different words, same intent.

> cache.hitRate()
"67.3%"
// At 10K requests/day: 6,730 cached = $20/day saved = $600/month`;

const COST_TRACKER_CODE = `function costTracker(config = {}) {
  const { dailyBudget = 500, alertThreshold = 0.8 } = config;
  let dailySpend = 0;
  let lastReset = new Date().toDateString();

  return async function track(request, response) {
    // Reset daily counter
    if (new Date().toDateString() !== lastReset) {
      dailySpend = 0;
      lastReset = new Date().toDateString();
    }

    const cost = calculateCost(response);
    dailySpend += cost;

    metrics.record({
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost,
      latency: response.latency,
      cacheHit: response.cacheHit || false,
    });

    if (dailySpend > dailyBudget * alertThreshold) {
      alert(\`AI spend at \${((dailySpend/dailyBudget)*100).toFixed(0)}% of daily budget\`);
    }

    if (dailySpend > dailyBudget) {
      throw new Error('Daily AI budget exceeded. Requests blocked until reset.');
    }

    return { ...response, cost, dailySpend };
  };
}`;

const COST_TRACKER_OUTPUT = `> tracker.track(request, response)
{ model: "claude-sonnet-5",
  cost: 0.0034,
  dailySpend: 127.45,
  inputTokens: 890,
  outputTokens: 234,
  latency: 1847,
  cacheHit: false }

Daily dashboard:
  Total spend:     $127.45 / $500.00 (25.5%)
  Requests:        38,291
  Avg cost/req:    $0.0033
  Cache hit rate:  64.2%
  P95 latency:     2,340ms
  Model split:     Haiku 71% | Sonnet 24% | Opus 5%`;

const TABS = ['The Cost Stack', 'Model Routing', 'Caching & Compression', 'Latency Optimization', 'Metrics & Budgets'];

function SectionHead({ title, desc }) {
  return (<>
    <h2 style={styles.sh}>{title}</h2>
    <p style={styles.ss}>{desc}</p>
  </>);
}

function CostWaterfall() {
  const items = [
    { label: 'Output Tokens', cost: 0.0225, color: 'var(--text-accent)' },
    { label: 'Input History', cost: 0.006, color: 'var(--text-h)' },
    { label: 'RAG Chunks', cost: 0.0045, color: 'var(--text-p)' },
    { label: 'System Prompt', cost: 0.0024, color: 'var(--text-muted)' },
    { label: 'Tool Calls', cost: 0.001, color: 'var(--border-strong)' },
  ];
  const maxCost = Math.max(...items.map(i => i.cost));

  return (
    <svg viewBox="0 0 700 280" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', marginBottom: 24 }}>
      <text x="350" y="24" textAnchor="middle" fill="var(--text-h)" fontSize="14" fontFamily="var(--font-display)" fontWeight="600">
        Cost per Conversation Breakdown
      </text>
      <text x="350" y="42" textAnchor="middle" fill="var(--text-muted)" fontSize="11" fontFamily="var(--font-mono)">
        Total: ~$0.036 per conversation (GPT-4o / Sonnet-class model)
      </text>
      {items.map((item, i) => {
        const y = 65 + i * 42;
        const barWidth = (item.cost / maxCost) * 400;
        return (
          <g key={item.label}>
            <text x="145" y={y + 16} textAnchor="end" fill="var(--text-p)" fontSize="12" fontFamily="var(--font-body)">
              {item.label}
            </text>
            <rect x="155" y={y + 2} width={barWidth} height="22" rx="3" fill={item.color} opacity="0.8" />
            <text x={165 + barWidth} y={y + 17} fill="var(--text-muted)" fontSize="11" fontFamily="var(--font-mono)">
              ${item.cost.toFixed(4)} ({(item.cost / 0.036 * 100).toFixed(0)}%)
            </text>
          </g>
        );
      })}
      <line x1="155" y1="58" x2="155" y2="272" stroke="var(--border)" strokeWidth="1" />
      <text x="350" y="268" textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-mono)">
        Output tokens dominate: 3-5x more expensive than input on most providers
      </text>
    </svg>
  );
}

function Tab1() {
  return (
    <FadeIn>
      <SectionHead
        title="Where the Money Actually Goes"
        desc="Before you optimize anything, understand the cost breakdown. Most teams attack the wrong line item."
      />

      <Decision question="Where does the money go in a typical AI system?">
        <p><Pill type="red">Output tokens (40-60% of total)</Pill> The biggest line item. Output tokens cost 3-5x more than input tokens on every major provider. A verbose 500-token response at $15/1M output tokens = $0.0075. A concise 150-token response = $0.00225. Same answer, 70% cheaper. Control this with explicit length instructions and max_tokens.</p>
        <p><Pill type="amber">Input tokens (25-35%)</Pill> System prompts, conversation history, retrieved documents. This is where you have the most architectural control. An 800-token system prompt that fires on every request costs $0.0024/req. At 100K requests/day, that is $240/day just for the system prompt.</p>
        <p><Pill type="amber">RAG retrieval (10-15%)</Pill> Embedding cost ($0.02/1M tokens for text-embedding-3-small) is cheap per-call but adds up. The real cost is the retrieved chunks hitting the LLM context. Retrieve 10 chunks, re-rank to 3 -- you pay embedding for 10 but LLM cost for only 3.</p>
        <p><Pill type="green">Vector DB + Tools (5-10%)</Pill> Pinecone: $70/month for 1M vectors. pgvector: $0 if you already have Postgres. Tool execution is usually negligible unless you are running expensive external APIs.</p>
      </Decision>

      <SectionHead
        title="Real Cost Breakdown"
        desc="A typical AI support agent handling 10K conversations/day. These are real numbers, not estimates."
      />

      <CostWaterfall />

      <Decision question="What does optimization actually look like?">
        <p><Pill type="green">Before optimization: $0.036/conversation</Pill> System prompt: 800 tokens ($0.0024). History 5 turns: 2000 input + 1500 output ($0.006 + $0.0225). RAG 3 chunks: 1500 tokens ($0.0045). Tools: ($0.001). At 10K conversations/day = $360/day = $10,800/month.</p>
        <p><Pill type="green">After optimization: $0.008/conversation</Pill> Compressed system prompt: 200 tokens ($0.0006). History summarization: 500 input + 400 output ($0.0015 + $0.006). Semantic cache hits 65% of RAG ($0.0016). Model routing: 70% Haiku ($0.0003). At 10K/day = $80/day = $2,400/month. That is a 77% reduction.</p>
      </Decision>

      <Insight>
        Most teams optimize the wrong thing. They negotiate volume discounts with the API provider (saving 10-15%) while their system prompt burns 800 tokens per request that could be 200 (saving 75% on that line item). They set max_tokens to 4096 when 90% of responses need 256. Optimize the architecture before negotiating the price. A staff engineer's first move is instrumentation, not vendor calls.
      </Insight>
    </FadeIn>
  );
}

function Tab2() {
  return (
    <FadeIn>
      <SectionHead
        title="Model Routing"
        desc="The single biggest cost lever. Use the right model for the right task. This alone cuts 80-90% of spend."
      />

      <Decision question="How to tier your model routing?">
        <p><Pill type="green">Tier 1 -- Haiku/GPT-4o-mini ($0.25/1M input)</Pill> Classification, entity extraction, simple Q&A, formatting, summarization under 200 words. Handles 70% of real-world requests. Latency: 150-300ms TTFT. These models are shockingly good at structured tasks -- most teams underestimate them.</p>
        <p><Pill type="amber">Tier 2 -- Sonnet/GPT-4o ($3/1M input)</Pill> Multi-step reasoning, content synthesis, complex queries with nuance, code generation for known patterns. Handles 25% of requests. Latency: 400-800ms TTFT. The workhorse tier.</p>
        <p><Pill type="red">Tier 3 -- Opus/o1 ($15/1M input)</Pill> Novel reasoning, ambiguous edge cases, complex multi-file code generation, tasks where correctness matters more than cost. 5% of requests. Latency: 1-3s TTFT. Reserve for high-stakes outputs.</p>
        <p><strong>Blended math:</strong> 70% x $0.25 + 25% x $3 + 5% x $15 = $1.675/1M vs $15/1M all-Opus = 89% savings.</p>
      </Decision>

      <Decision question="How to classify request complexity automatically?">
        <p><Pill type="green">Token count heuristic</Pill> Short questions with no tool requirements go to the cheap model. Fast, zero-cost classification, roughly 70% accurate. Good enough for v1.</p>
        <p><Pill type="green">Intent classifier</Pill> Fine-tuned small model (or even a regex-based router) that predicts complexity. 85-90% accurate. Classification cost: $0.001 per request. Pays for itself immediately at scale.</p>
        <p><Pill type="amber">Cascading pattern</Pill> Start with the cheapest model for everything. If the response fails a quality check (confidence score, format validation, or a lightweight LLM judge), retry with the next tier. Self-healing but adds P95 latency for escalated requests. Best approach when you cannot predict complexity upfront.</p>
      </Decision>

      <CodeBlock
        filename="model-router.js"
        code={MODEL_ROUTER_CODE}
        output={MODEL_ROUTER_OUTPUT}
      />

      <Insight>
        The cascading pattern is underrated. Start with Haiku for everything. Only escalate when the cheap model's response fails a quality check. At 100K requests/month, this saves $10K+ because most requests are simple. The real engineering challenge is building a reliable quality scorer -- not the routing logic itself. A 200ms classifier that is 90% accurate saves you more money than a perfect classifier that adds 2 seconds of latency.
      </Insight>
    </FadeIn>
  );
}

function Tab3() {
  return (
    <FadeIn>
      <SectionHead
        title="Caching and Compression"
        desc="Avoid paying twice for the same work. Semantic caching and prompt compression are the two highest-ROI techniques after model routing."
      />

      <Decision question="Semantic caching vs exact-match caching?">
        <p><Pill type="green">Exact match</Pill> Hash the prompt, cache the response. 100% precision, zero false positives, but low hit rate (5-10%). Users rarely ask the exact same question. Use as your baseline -- it is free and catches duplicate requests from retry logic and bots.</p>
        <p><Pill type="green">Semantic cache</Pill> Embed the query, find similar cached queries within a cosine distance threshold. Hit rates of 40-70% depending on your domain. The narrower your domain (support bot for one product vs general assistant), the higher the hit rate.</p>
        <p><Pill type="red">Threshold too low (0.85)</Pill> False positives. User asks about refunds, gets the answer about returns. Dangerous -- wrong answers destroy trust faster than slow answers. Never ship without human evaluation of edge cases.</p>
        <p><Pill type="amber">Sweet spot: 0.92-0.95</Pill> Test on your actual query distribution. Pull 1000 real queries, compute pairwise similarity, manually label which pairs should share a cached response. Your threshold falls out of that analysis.</p>
      </Decision>

      <Decision question="Prompt compression techniques?">
        <p><Pill type="green">History summarization</Pill> Instead of sending full 20-turn conversation, summarize older turns into a single paragraph: &quot;Earlier, we discussed the user&apos;s billing issue and confirmed their account ID is #4521.&quot; Saves 60-80% of history tokens. Summarize after every 5 turns.</p>
        <p><Pill type="green">Provider prompt caching</Pill> Anthropic&apos;s prompt caching reduces repeated system prompt cost to 10% ($0.30/1M instead of $3/1M). A 2000-token system prompt costs $0.006 first time, then $0.0006 for subsequent uses within the TTL. Mark your system prompt and tool definitions as cacheable.</p>
        <p><Pill type="amber">RAG chunk pruning</Pill> Retrieve 10 chunks from your vector store, re-rank with a cross-encoder, keep top 3. You pay embedding cost for 10 but LLM input cost for only 3. The re-ranker (Cohere Rerank, cross-encoder) costs $0.002/1K queries -- trivial compared to the LLM savings.</p>
        <p><Pill type="amber">Output length control</Pill> &quot;Answer in 2-3 sentences&quot; vs letting the model write paragraphs. Output tokens cost 3-5x more than input. A 50-word instruction that saves 200 output tokens pays for itself 10x over.</p>
      </Decision>

      <CodeBlock
        filename="semantic-cache.js"
        code={SEMANTIC_CACHE_CODE}
        output={SEMANTIC_CACHE_OUTPUT}
      />

      <Insight tag="Architecture signal">
        The interview question behind caching: &quot;How do you handle cache invalidation for AI responses?&quot; The answer: TTL-based expiry (1-4 hours for most support use cases), plus event-driven invalidation when the underlying data changes (product update, policy change). Tag cached responses with the source document version. When the source updates, invalidate all cache entries derived from it. This is the same pattern as CDN cache invalidation -- the hard part is tracking provenance, not the cache itself.
      </Insight>
    </FadeIn>
  );
}

function Tab4() {
  return (
    <FadeIn>
      <SectionHead
        title="Latency Optimization"
        desc="Users abandon after 3 seconds. Your P95 is 4.2 seconds. Here is the engineering playbook to fix it."
      />

      <Decision question="Where does latency hide in AI systems?">
        <p><Pill type="red">Time to first token (TTFT): 200ms-2s</Pill> Depends on model size and prompt length. A 4000-token prompt to Opus has ~1.5s TTFT. Same prompt to Haiku: ~200ms. This is the user&apos;s &quot;thinking time&quot; -- the dead silence before anything appears. Most impactful metric for perceived speed.</p>
        <p><Pill type="amber">Token generation: 30-80 tokens/sec</Pill> A 200-token response takes 2.5-7 seconds of streaming. Faster models (Haiku: ~80 tok/s) vs slower (Opus: ~30 tok/s). You cannot speed this up -- it is model-bound. Control it with output length limits.</p>
        <p><Pill type="amber">RAG retrieval: 50-300ms</Pill> Embedding (20-50ms) + vector search (30-100ms) + optional re-ranking (50-150ms). This runs before the LLM call, so it is additive. Optimize by pre-computing embeddings and using approximate nearest neighbor indexes.</p>
        <p><Pill type="green">Tool execution: 100ms-10s</Pill> Entirely depends on what the tool does. Database query: 50ms. External API: 200ms-2s. The key insight: tool calls happen sequentially in most frameworks. Three tool calls at 300ms each = 900ms of added latency.</p>
        <p><strong>Typical P95 for a RAG + tool agent:</strong> 3-8 seconds without optimization. Target: under 2 seconds for the first visible content.</p>
      </Decision>

      <Decision question="Streaming vs buffered responses?">
        <p><Pill type="green">Always stream for user-facing applications</Pill> Send tokens as they are generated. User sees the response building in real-time. Perceived latency drops from 4s (buffered) to 200ms (TTFT with streaming). This is not optional -- it is table stakes for any production AI system.</p>
        <p><Pill type="amber">Buffer only for machine consumers</Pill> Batch processing, content moderation pipelines, or when you need to validate the full response before showing it (safety filtering). Even then, consider streaming to an internal buffer and releasing after validation.</p>
      </Decision>

      <Decision question="Speculative execution and parallelism?">
        <p><Pill type="green">Parallel RAG + model warm-up</Pill> Do not wait for RAG results before calling the LLM. Send a preliminary request to warm the connection, then inject retrieved context via tool results or a follow-up message. Saves 100-300ms of sequential waiting.</p>
        <p><Pill type="green">Predictive tool pre-loading</Pill> While the model generates a response, start pre-loading likely next steps. If the user asked a billing question, pre-fetch their recent invoices. Hit rate of 60-70% on well-understood domains.</p>
        <p><Pill type="amber">Connection pooling and keep-alive</Pill> A cold TCP + TLS handshake adds 100-300ms. Maintain persistent connections to your LLM provider. Most SDKs handle this, but verify -- some HTTP clients create new connections per request by default.</p>
        <p><Pill type="amber">Edge deployment for embeddings</Pill> Run your embedding model at the edge (Cloudflare Workers AI, Lambda@Edge). Cuts 50-100ms of network round-trip for the embedding step. Only matters at scale where you are optimizing every millisecond.</p>
      </Decision>

      <Insight>
        The biggest latency win is not technical -- it is UX. Show a typing indicator immediately (0ms perceived wait). Stream the first token within 200ms. Show intermediate results: &quot;Found 3 relevant documents, generating answer...&quot; Users tolerate 5 seconds of active progress but abandon after 2 seconds of silence. The perception of speed matters more than actual speed. A staff engineer optimizes both, but knows which one the user actually feels.
      </Insight>

      <Insight tag="Staff+ interview answer">
        When asked &quot;How would you reduce latency for our AI agent?&quot; -- the senior answer is &quot;use a faster model.&quot; The staff answer is: &quot;I would instrument TTFT, generation time, tool execution, and RAG retrieval separately. Then I would stream everything, parallelize RAG with model warm-up, pre-fetch predictable tool results, and set P95 latency budgets per component. The model choice is one lever among five, and usually not the most impactful one.&quot;
      </Insight>
    </FadeIn>
  );
}

function Tab5() {
  return (
    <FadeIn>
      <SectionHead
        title="Metrics and Budgets"
        desc="If you cannot measure it, you cannot optimize it. Build the observability layer before building features."
      />

      <Decision question="What to track per request?">
        <p><Pill type="green">Cost metrics</Pill> Input tokens, output tokens, total cost in dollars (not just tokens -- convert using the model&apos;s pricing). Track by model tier to validate your routing is working. If Opus usage creeps above 10%, your classifier is leaking.</p>
        <p><Pill type="green">Latency metrics</Pill> TTFT, total response time, tool execution time (broken down per tool), RAG retrieval time. Track P50, P95, and P99. P50 is your typical experience; P95 is what your frustrated users hit; P99 catches pathological cases.</p>
        <p><Pill type="amber">Quality metrics</Pill> Cache hit/miss rate, quality scores from your eval pipeline, error rate by tool and by model. A high cache hit rate with declining quality scores means your threshold is too low.</p>
        <p><Pill type="amber">Business metrics</Pill> Cost per conversation, cost per resolution (for support), cost per successful action (for agents). These are what your VP cares about, not tokens per request.</p>
      </Decision>

      <Decision question="How to set token budgets?">
        <p><Pill type="green">Per-turn budget</Pill> max_tokens = 256 for simple Q&A, 1024 for standard responses, 4096 for complex analysis. Never leave it unlimited -- a single runaway response can cost $0.50+. Default to the smallest budget that covers 95% of cases.</p>
        <p><Pill type="green">Per-conversation budget</Pill> Cap at $0.50. After that threshold, force a history summarization and fresh context window. Long conversations accumulate context that inflates every subsequent turn. A 30-turn conversation where each turn includes full history costs 15x more than necessary.</p>
        <p><Pill type="red">System-wide daily budget</Pill> Hard limit with alerting at 80%. One runaway loop or a bot attack can burn thousands in hours. $500/day for a startup, $5000/day for enterprise. Circuit breaker that kills requests when exceeded -- better to return &quot;service temporarily unavailable&quot; than to bankrupt your AI budget.</p>
        <p><Pill type="amber">Per-user budget</Pill> Free tier: 20 conversations/day. Paid: 200. Enterprise: unlimited with per-org billing and cost attribution. Without per-user limits, one power user can consume 40% of your budget.</p>
      </Decision>

      <CodeBlock
        filename="cost-tracker.js"
        code={COST_TRACKER_CODE}
        output={COST_TRACKER_OUTPUT}
      />

      <Insight>
        The interview answer that separates staff from senior: &quot;I would instrument every request from day one, build a cost dashboard before building features, and set circuit breakers on spend before we go to production. The architecture decision is not which model to use -- it is building the observability that lets you optimize continuously. Week 1 you are guessing. Week 4 your data tells you exactly where the money goes. The team that ships a cost dashboard in sprint 1 spends 60% less by month 3 than the team that adds observability after launch.&quot;
      </Insight>

      <Insight type="warn" tag="Common mistake">
        Do not track cost in tokens. Track it in dollars. Tokens are meaningless across models -- 1000 tokens of Haiku input ($0.00025) vs 1000 tokens of Opus input ($0.015) is a 60x difference. Your dashboard should show dollar amounts, your alerts should fire on dollar thresholds, and your budget conversations with leadership should be in dollars per month, not millions of tokens.
      </Insight>
    </FadeIn>
  );
}

export default function CostLatencyEngineering() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <Link to="/blog" style={styles.back}>&larr; AI Engineering</Link>
      <p style={styles.eyebrow}>Post 11</p>
      <h1 style={styles.h1}>Cost &amp; Latency Engineering</h1>
      <p style={styles.subtitle}>
        Your agent costs $2 per conversation. Your boss wants $0.15. Here is the engineering
        playbook -- model routing, semantic caching, prompt compression, token budgets, and
        the metrics that actually matter.
      </p>

      <div style={styles.tabWrap}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            style={{ ...styles.tabBtn, ...(tab === i ? styles.tabActive : {}) }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <Tab1 />}
      {tab === 1 && <Tab2 />}
      {tab === 2 && <Tab3 />}
      {tab === 3 && <Tab4 />}
      {tab === 4 && <Tab5 />}
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
