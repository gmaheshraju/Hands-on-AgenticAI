import { useState } from 'react';
import { Link } from 'react-router-dom';
import Decision, { Pill } from '../../components/Decision';
import Insight from '../../components/Insight';
import CodeBlock from '../../components/CodeBlock';
import FadeIn from '../../components/FadeIn';

const MODEL_ROUTER_CODE = `async function routeToModel(query, { costCap = 0.01 } = {}) {
  // Classify complexity: simple queries go to fast/cheap model
  const complexity = await classifyComplexity(query);

  if (complexity === 'simple') {
    // Haiku/GPT-4o-mini: ~$0.25/1M input tokens
    return callModel('claude-haiku', query);
  }

  if (complexity === 'medium') {
    // Sonnet/GPT-4o: ~$3/1M input tokens
    return callModel('claude-sonnet', query);
  }

  // Complex: Opus/GPT-4: ~$15/1M input tokens
  // But verify the response — expensive model isn't always right
  const response = await callModel('claude-opus', query);
  return response;
}

async function classifyComplexity(query) {
  // Use the cheap model to classify — meta-routing
  const result = await callModel('claude-haiku',
    \`Classify this query complexity as simple/medium/complex.
     Simple: factual lookup, short answer.
     Medium: analysis, comparison, moderate reasoning.
     Complex: multi-step reasoning, code generation, creative.
     Query: "\${query}"
     Respond with ONE word.\`
  );
  return result.trim().toLowerCase();
}`;

const MODEL_ROUTER_OUTPUT = `> routeToModel("What's the capital of France?")
  -> Routed to claude-haiku (simple) — 0.3ms classify, 180ms generate
  -> Cost: $0.000003 | "The capital of France is Paris."

> routeToModel("Design a rate limiter for a distributed system")
  -> Routed to claude-opus (complex) — 0.4ms classify, 2100ms generate
  -> Cost: $0.0018 | [detailed system design response...]

Cost savings: 94% on simple queries vs always using Opus`;

const TOKEN_BUDGET_CODE = `class TokenBudgetManager {
  constructor({ dailyBudgetUsd = 500, perRequestMax = 4096 }) {
    this.dailyBudgetUsd = dailyBudgetUsd;
    this.perRequestMax = perRequestMax;
    this.todaySpend = 0;
    this.resetAt = this._nextMidnight();
  }

  async call(model, messages, opts = {}) {
    this._maybeReset();

    // Estimate cost before calling
    const inputTokens = this._estimateTokens(messages);
    const estimatedCost = this._estimateCost(model, inputTokens, opts.maxTokens || 1024);

    if (this.todaySpend + estimatedCost > this.dailyBudgetUsd) {
      // Budget exceeded — try a cheaper model or reject
      if (model !== 'claude-haiku') {
        console.warn(\`Budget guard: downgrading \${model} -> haiku\`);
        return this.call('claude-haiku', messages, opts);
      }
      throw new Error(\`Daily budget exhausted: $\${this.todaySpend.toFixed(2)}/$\${this.dailyBudgetUsd}\`);
    }

    // Truncate context if it exceeds model window
    const truncated = this._truncateToFit(messages, model);

    const response = await callModel(model, truncated, {
      max_tokens: Math.min(opts.maxTokens || 1024, this.perRequestMax),
    });

    // Track actual cost
    const actualCost = this._actualCost(model, response.usage);
    this.todaySpend += actualCost;

    return { ...response, cost: actualCost, budgetRemaining: this.dailyBudgetUsd - this.todaySpend };
  }

  _estimateCost(model, inputTokens, outputTokens) {
    const rates = {
      'claude-haiku':  { input: 0.25, output: 1.25 },   // per 1M tokens
      'claude-sonnet': { input: 3.00, output: 15.00 },
      'claude-opus':   { input: 15.00, output: 75.00 },
    };
    const r = rates[model] || rates['claude-sonnet'];
    return (inputTokens * r.input + outputTokens * r.output) / 1_000_000;
  }

  _truncateToFit(messages, model) {
    const limits = { 'claude-haiku': 200000, 'claude-sonnet': 200000, 'claude-opus': 200000 };
    const maxInput = (limits[model] || 128000) * 0.85; // 85% of window for input
    let total = this._estimateTokens(messages);
    if (total <= maxInput) return messages;

    // Keep system + last N user messages, drop middle
    const system = messages.filter(m => m.role === 'system');
    const rest = messages.filter(m => m.role !== 'system');
    const trimmed = [...system];
    for (let i = rest.length - 1; i >= 0; i--) {
      trimmed.splice(system.length, 0, rest[i]);
      if (this._estimateTokens(trimmed) > maxInput) {
        trimmed.splice(system.length, 1);
        break;
      }
    }
    return trimmed;
  }

  _estimateTokens(messages) {
    const text = messages.map(m => m.content || '').join('');
    return Math.ceil(text.length / 4);
  }
  _actualCost(model, usage) {
    return this._estimateCost(model, usage.input_tokens, usage.output_tokens);
  }
  _nextMidnight() { const d = new Date(); d.setHours(24,0,0,0); return d; }
  _maybeReset() { if (Date.now() > this.resetAt) { this.todaySpend = 0; this.resetAt = this._nextMidnight(); } }
}`;

const TOKEN_BUDGET_OUTPUT = `> const budget = new TokenBudgetManager({ dailyBudgetUsd: 500, perRequestMax: 4096 })

> await budget.call('claude-opus', longConversation)
  Input: 12,400 tokens | Output: 1,820 tokens
  Cost: $0.3225 | Budget remaining: $499.68

> // 15,000 requests later...
> await budget.call('claude-opus', messages)
  Budget guard: downgrading claude-opus -> haiku
  Cost: $0.000089 | Budget remaining: $2.14

> await budget.call('claude-haiku', messages)
  Error: Daily budget exhausted: $500.00/$500`;

const RESILIENT_CLIENT_CODE = `class ResilientLLMClient {
  constructor(models = ['claude-sonnet', 'claude-haiku']) {
    this.models = models;
    this.circuitBreakers = new Map();
    models.forEach(m => this.circuitBreakers.set(m, { failures: 0, openUntil: 0 }));
  }

  async call(messages, opts = {}) {
    const { timeout = 30000, maxRetries = 3, stream = false } = opts;

    for (const model of this.models) {
      const cb = this.circuitBreakers.get(model);

      // Circuit breaker: skip if open
      if (cb.openUntil > Date.now()) {
        console.warn(\`Circuit open for \${model}, skipping\`);
        continue;
      }

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeout);

          const response = await callModel(model, messages, {
            signal: controller.signal,
            stream,
          });

          clearTimeout(timer);
          cb.failures = 0; // reset on success
          return { ...response, model, attempt };

        } catch (err) {
          clearTimeout(timer);

          // Don't retry client errors (bad prompt, auth, etc.)
          if (err.status >= 400 && err.status < 500 && err.status !== 429) {
            throw err;
          }

          // Rate limited — respect Retry-After header
          if (err.status === 429) {
            const wait = parseInt(err.headers?.['retry-after'] || '5') * 1000;
            await sleep(wait);
            continue;
          }

          // Server error or timeout — backoff then retry
          const backoff = Math.min(1000 * Math.pow(2, attempt), 30000);
          const jitter = Math.random() * backoff * 0.1;
          console.warn(\`\${model} attempt \${attempt + 1} failed: \${err.message}. Retrying in \${backoff}ms\`);
          await sleep(backoff + jitter);
        }
      }

      // All retries exhausted — open circuit breaker for this model
      cb.failures++;
      if (cb.failures >= 3) {
        cb.openUntil = Date.now() + 60000; // open for 60s
        console.error(\`Circuit breaker OPEN for \${model} (60s cooldown)\`);
      }
    }

    // All models failed — return cached response or graceful error
    const cached = await responseCache.get(hashMessages(messages));
    if (cached) return { ...cached, fromCache: true, stale: true };

    throw new Error('All models unavailable. No cached response.');
  }
}`;

const RESILIENT_CLIENT_OUTPUT = `> const client = new ResilientLLMClient(['claude-sonnet', 'claude-haiku'])

> await client.call(messages, { timeout: 10000, stream: true })
  -> claude-sonnet: 200 OK (attempt 0, 1847ms)
  { model: 'claude-sonnet', attempt: 0, text: '...' }

> // Sonnet is rate-limited...
> await client.call(messages)
  -> claude-sonnet attempt 1 failed: 429 Too Many Requests. Waiting 5s...
  -> claude-sonnet attempt 2 failed: 429. Waiting 5s...
  -> claude-sonnet attempt 3 failed: 429. Circuit breaker OPEN (60s)
  -> claude-haiku: 200 OK (attempt 0, 340ms)
  { model: 'claude-haiku', attempt: 0, text: '...' }

> // All models down...
> await client.call(messages)
  -> claude-sonnet: circuit open, skipping
  -> claude-haiku attempt 1 failed: 503. Retrying in 1000ms...
  -> claude-haiku attempt 2 failed: 503. Retrying in 2000ms...
  { fromCache: true, stale: true, text: '...' }`;

const OBSERVABILITY_CODE = `function createLLMTracer(config = {}) {
  const { serviceName = 'llm-gateway', sampleRate = 1.0 } = config;

  return async function tracedCall(model, messages, opts = {}) {
    const traceId = crypto.randomUUID();
    const startTime = performance.now();
    const promptHash = hashContent(messages);

    try {
      const response = await callModel(model, messages, opts);
      const latencyMs = performance.now() - startTime;

      // Log EVERYTHING — you'll thank yourself during an incident
      const trace = {
        traceId,
        timestamp: new Date().toISOString(),
        model,
        promptHash,                            // for dedup detection
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheHit: response.usage.cache_read_input_tokens > 0,
        cacheTokens: response.usage.cache_read_input_tokens || 0,
        latencyMs: Math.round(latencyMs),
        ttftMs: response.metrics?.ttft || null, // time to first token
        costUsd: calculateCost(model, response.usage),
        status: 'success',
        stopReason: response.stop_reason,       // end_turn | max_tokens | tool_use
        // DO NOT log full prompt/response in prod — token hashes only
        inputPreview: messages[messages.length - 1]?.content?.slice(0, 100),
      };

      // Emit to your metrics pipeline
      metrics.histogram('llm.latency', latencyMs, { model });
      metrics.counter('llm.tokens.input', trace.inputTokens, { model });
      metrics.counter('llm.tokens.output', trace.outputTokens, { model });
      metrics.counter('llm.cost', trace.costUsd, { model });
      if (trace.cacheHit) metrics.counter('llm.cache.hits', 1, { model });
      if (trace.stopReason === 'max_tokens') metrics.counter('llm.truncated', 1, { model });

      // Async write — don't block the response
      setImmediate(() => traceStore.write(trace));

      return response;
    } catch (err) {
      const latencyMs = performance.now() - startTime;
      metrics.counter('llm.errors', 1, { model, error: err.status || 'unknown' });

      setImmediate(() => traceStore.write({
        traceId, model, promptHash, latencyMs,
        status: 'error', error: err.message, errorCode: err.status,
      }));

      throw err;
    }
  };
}

// Alert on anomalies
function setupAlerts(metrics) {
  // Cost spike: >2x rolling 1h average
  metrics.alert('llm.cost.spike', {
    condition: 'rate(llm.cost[5m]) > 2 * avg_over_time(llm.cost[1h])',
    severity: 'critical',
    action: 'page-oncall',
  });
  // Latency degradation: p99 > 10s for 5 minutes
  metrics.alert('llm.latency.degraded', {
    condition: 'histogram_quantile(0.99, llm.latency[5m]) > 10000',
    severity: 'warning',
  });
  // Cache hit rate drops (prompt changed?)
  metrics.alert('llm.cache.regression', {
    condition: 'rate(llm.cache.hits[15m]) / rate(llm.tokens.input[15m]) < 0.3',
    severity: 'info',
  });
}`;

const OBSERVABILITY_OUTPUT = `> const tracedCall = createLLMTracer({ serviceName: 'chat-api' })

> await tracedCall('claude-sonnet', messages)
  Trace d4f8a2b1: model=claude-sonnet input=1847tok output=423tok
    latency=1204ms ttft=287ms cost=$0.0119 cache=hit(1200tok)
    stop=end_turn

> // Dashboard query (Grafana/Datadog):
> SELECT
    model,
    percentile(latency_ms, 0.50) as p50,
    percentile(latency_ms, 0.95) as p95,
    percentile(latency_ms, 0.99) as p99,
    sum(cost_usd) as total_cost,
    count(*) as requests
  FROM llm_traces
  WHERE timestamp > now() - interval '1 hour'
  GROUP BY model

  model          | p50    | p95    | p99     | cost    | requests
  claude-haiku   | 340ms  | 890ms  | 1.8s    | $12.40  | 142,000
  claude-sonnet  | 1.2s   | 3.4s   | 8.1s    | $487.20 | 48,000
  claude-opus    | 2.8s   | 7.2s   | 14.3s   | $142.80 | 2,100`;

const TABS = ['Model Serving', 'Cost Engineering', 'Latency & Reliability', 'Monitoring & Debugging', 'Anti-patterns'];

export default function LlmOps() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <Link to="/blog" style={styles.back}>&larr; AI Engineering</Link>
      <p style={styles.eyebrow}>Post 06</p>
      <h1 style={styles.h1}>LLMOps &mdash; Production LLM Infrastructure</h1>
      <p style={styles.subtitle}>
        Model serving, cost routing, token budgeting, latency SLOs &mdash; the infrastructure
        that turns an LLM prototype into a system that handles 10M requests/day without
        bankrupting your company.
      </p>

      <div style={styles.tabWrap}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{ ...styles.tabBtn, ...(tab === i ? styles.tabActive : {}) }}>{t}</button>
        ))}
      </div>

      {tab === 0 && <ModelServingPanel />}
      {tab === 1 && <CostEngineeringPanel />}
      {tab === 2 && <LatencyReliabilityPanel />}
      {tab === 3 && <MonitoringPanel />}
      {tab === 4 && <AntiPatternsPanel />}

      <FadeIn><div style={{ marginTop: 48, padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Capstone Project</p>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-h)', marginBottom: 6 }}>Model Router with Cost Dashboard</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Build the real thing. Production-grade project brief with architecture requirements, evaluation criteria, and staff+ interview angles.</p>
        <a href="https://github.com/gmaheshraju/Hands-on-AgenticAI/blob/main/projects/06-llmops.md" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--text-accent)', textDecoration: 'none', fontWeight: 500 }}>View project brief on GitHub →</a>
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

function LLMOpsArchDiagram() {
  const f = 'var(--font-body)';
  const fm = 'var(--font-mono)';

  return (
    <div style={{ overflowX: 'auto', margin: '20px 0' }}>
      <svg viewBox="0 0 740 370" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', display: 'block' }}>
        <text x="370" y="22" textAnchor="middle" fontSize="14" fontWeight="400" fill="var(--text-h)" fontFamily="var(--font-display)">LLMOps Model Routing Architecture</text>

        {/* User Request */}
        <rect x="20" y="55" width="110" height="44" rx="8" fill="var(--bg-card)" stroke="var(--border-strong)" strokeWidth="1.2" />
        <text x="75" y="74" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>User Request</text>
        <text x="75" y="88" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>10M req/day</text>

        {/* Arrow: User -> LB */}
        <line x1="130" y1="77" x2="165" y2="77" stroke="var(--text-muted)" strokeWidth="1" markerEnd="url(#arrowGray)" />

        {/* Load Balancer */}
        <rect x="165" y="55" width="110" height="44" rx="8" fill="#3949AB" fillOpacity="0.1" stroke="#3949AB" strokeWidth="1.2" />
        <text x="220" y="74" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Load Balancer</text>
        <text x="220" y="88" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>rate limit + auth</text>

        {/* Arrow: LB -> Classifier */}
        <line x1="275" y1="77" x2="310" y2="77" stroke="var(--text-muted)" strokeWidth="1" markerEnd="url(#arrowGray)" />

        {/* Complexity Classifier */}
        <rect x="310" y="45" width="130" height="64" rx="8" fill="#E7157B" fillOpacity="0.1" stroke="#E7157B" strokeWidth="1.2" />
        <text x="375" y="67" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Complexity</text>
        <text x="375" y="80" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Classifier</text>
        <text x="375" y="100" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>Haiku (~$0.001/1K)</text>

        {/* Arrow: Classifier -> Router */}
        <line x1="440" y1="77" x2="475" y2="77" stroke="var(--text-muted)" strokeWidth="1" markerEnd="url(#arrowGray)" />

        {/* Model Router */}
        <rect x="475" y="45" width="110" height="64" rx="8" fill="#8C4FFF" fillOpacity="0.1" stroke="#8C4FFF" strokeWidth="1.2" />
        <text x="530" y="67" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Model Router</text>
        <text x="530" y="82" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>budget + fallback</text>
        <text x="530" y="100" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>circuit breaker</text>

        {/* Model Pool - 3 boxes stacked on the right */}
        <rect x="620" y="15" width="100" height="36" rx="6" fill="#3F8624" fillOpacity="0.12" stroke="#3F8624" strokeWidth="1.2" />
        <text x="670" y="31" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Haiku</text>
        <text x="670" y="44" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>$0.25/1M in</text>

        <rect x="620" y="59" width="100" height="36" rx="6" fill="#ED7100" fillOpacity="0.12" stroke="#ED7100" strokeWidth="1.2" />
        <text x="670" y="75" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Sonnet</text>
        <text x="670" y="88" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>$3/1M in</text>

        <rect x="620" y="103" width="100" height="36" rx="6" fill="#C925D1" fillOpacity="0.12" stroke="#C925D1" strokeWidth="1.2" />
        <text x="670" y="119" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Opus</text>
        <text x="670" y="132" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>$15/1M in</text>

        {/* Arrows: Router -> Model Pool */}
        <line x1="585" y1="63" x2="620" y2="33" stroke="var(--text-muted)" strokeWidth="1" markerEnd="url(#arrowGray)" />
        <line x1="585" y1="77" x2="620" y2="77" stroke="var(--text-muted)" strokeWidth="1" markerEnd="url(#arrowGray)" />
        <line x1="585" y1="91" x2="620" y2="121" stroke="var(--text-muted)" strokeWidth="1" markerEnd="url(#arrowGray)" />

        {/* Response Cache - below the router */}
        <rect x="440" y="160" width="130" height="44" rx="8" fill="#3949AB" fillOpacity="0.1" stroke="#3949AB" strokeWidth="1.2" />
        <text x="505" y="179" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Response Cache</text>
        <text x="505" y="194" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>Redis / prompt hash key</text>

        {/* Arrow: Models down to cache */}
        <line x1="670" y1="139" x2="670" y2="182" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 3" />
        <line x1="670" y1="182" x2="570" y2="182" stroke="var(--text-muted)" strokeWidth="1" markerEnd="url(#arrowGray)" strokeDasharray="4 3" />

        {/* Arrow: Cache back to User */}
        <path d="M440,182 L75,182 L75,99" fill="none" stroke="var(--text-muted)" strokeWidth="1" markerEnd="url(#arrowGray)" strokeDasharray="4 3" />
        <text x="250" y="175" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>response</text>

        {/* Metrics Collector - bottom */}
        <rect x="165" y="240" width="420" height="54" rx="8" fill="var(--bg-code)" stroke="var(--border)" strokeWidth="1" />
        <text x="375" y="260" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Metrics Collector</text>
        <text x="375" y="278" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>latency p50/p95/p99 | tokens in/out | cost/query | error rate | cache hit rate | model accuracy</text>

        {/* Dotted arrows: components -> metrics */}
        <line x1="220" y1="99" x2="220" y2="240" stroke="var(--border)" strokeWidth="0.8" strokeDasharray="3 3" />
        <line x1="375" y1="109" x2="375" y2="240" stroke="var(--border)" strokeWidth="0.8" strokeDasharray="3 3" />
        <line x1="530" y1="109" x2="530" y2="240" stroke="var(--border)" strokeWidth="0.8" strokeDasharray="3 3" />

        {/* Alert thresholds */}
        <rect x="165" y="310" width="130" height="36" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="230" y="326" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Cost Alerts</text>
        <text x="230" y="339" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>&gt;2x hourly avg</text>

        <rect x="310" y="310" width="130" height="36" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="375" y="326" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Latency Alerts</text>
        <text x="375" y="339" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>p99 &gt; 10s for 5m</text>

        <rect x="455" y="310" width="130" height="36" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="520" y="326" textAnchor="middle" fontSize="8" fontWeight="500" fill="var(--text-h)" fontFamily={f}>Cache Alerts</text>
        <text x="520" y="339" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>hit rate &lt; 30%</text>

        <line x1="300" y1="294" x2="300" y2="310" stroke="var(--border)" strokeWidth="0.8" strokeDasharray="3 3" />
        <line x1="375" y1="294" x2="375" y2="310" stroke="var(--border)" strokeWidth="0.8" strokeDasharray="3 3" />
        <line x1="450" y1="294" x2="450" y2="310" stroke="var(--border)" strokeWidth="0.8" strokeDasharray="3 3" />

        {/* Arrow marker definition */}
        <defs>
          <marker id="arrowGray" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6" fill="none" stroke="var(--text-muted)" strokeWidth="1" />
          </marker>
        </defs>
      </svg>
    </div>
  );
}

function ModelServingPanel() {
  return (
    <div>
      <SectionHead
        title="Model serving at scale"
        desc="The first architectural decision is build vs buy. Get this wrong and you're either burning cash on an unnecessary GPU cluster or stuck on rate-limited APIs when you need 10x throughput."
      />

      <LLMOpsArchDiagram />

      <FadeIn><Decision question="Self-host (vLLM/TGI) vs API (Claude/GPT)?">
        <Pill type="green">API-first (Claude, GPT)</Pill> Use managed APIs until you hit at least one of: (1) &gt;$50K/month in API costs where self-hosting is cheaper, (2) strict data residency requirements (healthcare, finance, government), (3) need for fine-tuned open models that APIs don't offer. At $50K/mo on Sonnet you're doing ~16M requests/month. Most companies never reach this.
        <br /><br />
        <Pill type="amber">Self-host with vLLM</Pill> When you exceed the cost threshold OR need data residency. vLLM with PagedAttention gives you continuous batching and near-optimal GPU utilization. On a single A100 (80GB), Llama 70B serves ~40 tokens/sec per request, batched to ~800 tokens/sec aggregate. That's roughly 2.8M tokens/hour per GPU. At 8 A100s (~$25K/mo on cloud), you can serve what would cost $200K/mo on APIs.
        <br /><br />
        <Pill type="red">Self-host before $50K/mo API spend</Pill> A GPU cluster needs MLOps engineers, monitoring, failover, model updates. You're building infrastructure instead of product. The breakeven includes engineer salaries.
        <br /><br />
        <strong>Real cost math:</strong> 8x A100 80GB on AWS = ~$25K/mo (reserved). Running Llama 70B, that serves ~22M tokens/hour. Claude Sonnet at $3/$15 per 1M tokens would cost $66K-$330K/mo for the same volume. Breakeven is around 5-8M req/month depending on prompt length.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="vLLM vs TGI vs Triton for self-hosting?">
        <Pill type="green">vLLM</Pill> Wins for most LLM serving. PagedAttention reduces memory waste by 60-80% compared to naive KV-cache allocation. Continuous batching means new requests start immediately without waiting for the batch to finish. Supports tensor parallelism across GPUs. OpenAI-compatible API out of the box. Throughput: 2-4x over naive HuggingFace serving.
        <br /><br />
        <Pill type="amber">TGI (Text Generation Inference)</Pill> HuggingFace's serving solution. Better integration with the HF ecosystem (custom models, LoRA adapters). Token streaming built in. Use when you're already deep in HuggingFace and need easy LoRA swapping. Throughput is close to vLLM but slightly lower on benchmarks.
        <br /><br />
        <Pill type="amber">Triton Inference Server</Pill> NVIDIA's multi-framework server. Use when you're serving multiple model types (LLM + embedding + classifier) on the same GPU cluster. Supports dynamic batching, model ensembles, and GPU sharing. More complex to configure but unmatched for heterogeneous workloads.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Single model vs model routing?">
        <Pill type="green">Model routing (recommended)</Pill> Route by query complexity. Use a cheap classifier (Haiku at $0.25/1M) to categorize incoming queries, then route to the appropriate model tier. In practice, 60-70% of queries are simple enough for Haiku, 25-30% need Sonnet, and &lt;5% need Opus. This cuts average cost per query by 80-90%.
        <br /><br />
        <Pill type="red">Always use the best model</Pill> Using Opus/GPT-4 for classification tasks, FAQ lookups, or simple extraction is lighting money on fire. A "what's my order status?" query doesn't need a $15/1M-token model.
      </Decision></FadeIn>

      <FadeIn><CodeBlock filename="model-router.js" code={MODEL_ROUTER_CODE} output={MODEL_ROUTER_OUTPUT} /></FadeIn>

      <FadeIn><Insight>
        The staff+ signal isn't knowing that model routing exists. It's knowing the exact cost crossover points and being able to do the math live: "We're at 200K requests/day, average 1500 tokens in + 400 tokens out. On Sonnet that's $900/day. With routing, 65% go to Haiku, that drops to $180/day. The classifier cost is $12/day. Net savings: 80%." Interviewers want you to pull out real numbers, not say "it depends on the use case."
      </Insight></FadeIn>
    </div>
  );
}

function CostEngineeringPanel() {
  return (
    <div>
      <SectionHead
        title="Cost engineering for LLM systems"
        desc="LLM costs scale linearly with usage unless you actively engineer against it. At 10M requests/day, a 10% cost reduction saves $30K-$100K/year. This is the difference between a sustainable product and a money pit."
      />

      <FadeIn><Decision question="Prompt caching — the single biggest cost lever">
        <Pill type="green">System prompt caching (mandatory)</Pill> If your system prompt is &gt;1024 tokens and repeated across requests, caching gives you 90% discount on those tokens. Claude caches automatically for identical prefixes. A 2000-token system prompt across 1M requests/day: without caching = $6/day on input alone (Sonnet). With caching = $0.60/day. At scale this is the difference between viable and bankrupt.
        <br /><br />
        <Pill type="amber">Semantic caching (high-volume patterns)</Pill> Cache entire responses for semantically similar queries. Hash the prompt, check Redis before calling the API. Hit rate depends on query distribution — FAQ-style products see 30-50% cache hit rates. Conversational products see &lt;5%. Only worth building if you measure first.
        <br /><br />
        <strong>Real pricing (as of 2025):</strong>
        <br /><br />
        <div style={{ overflowX: 'auto' }}>
        <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 12px', color: 'var(--text-h)', fontWeight: 600 }}>Model</th>
              <th style={{ textAlign: 'right', padding: '6px 12px', color: 'var(--text-h)', fontWeight: 600 }}>Input/1M</th>
              <th style={{ textAlign: 'right', padding: '6px 12px', color: 'var(--text-h)', fontWeight: 600 }}>Output/1M</th>
              <th style={{ textAlign: 'right', padding: '6px 12px', color: 'var(--text-h)', fontWeight: 600 }}>Cache Write</th>
              <th style={{ textAlign: 'right', padding: '6px 12px', color: 'var(--text-h)', fontWeight: 600 }}>Cache Read</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 12px', color: 'var(--text-p)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>Claude Haiku</td>
              <td style={{ textAlign: 'right', padding: '6px 12px', color: 'var(--text-p)' }}>$0.25</td>
              <td style={{ textAlign: 'right', padding: '6px 12px', color: 'var(--text-p)' }}>$1.25</td>
              <td style={{ textAlign: 'right', padding: '6px 12px', color: 'var(--text-p)' }}>$0.30</td>
              <td style={{ textAlign: 'right', padding: '6px 12px', color: 'var(--text-p)' }}>$0.03</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 12px', color: 'var(--text-p)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>Claude Sonnet</td>
              <td style={{ textAlign: 'right', padding: '6px 12px', color: 'var(--text-p)' }}>$3.00</td>
              <td style={{ textAlign: 'right', padding: '6px 12px', color: 'var(--text-p)' }}>$15.00</td>
              <td style={{ textAlign: 'right', padding: '6px 12px', color: 'var(--text-p)' }}>$3.75</td>
              <td style={{ textAlign: 'right', padding: '6px 12px', color: 'var(--text-p)' }}>$0.30</td>
            </tr>
            <tr>
              <td style={{ padding: '6px 12px', color: 'var(--text-p)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>Claude Opus</td>
              <td style={{ textAlign: 'right', padding: '6px 12px', color: 'var(--text-p)' }}>$15.00</td>
              <td style={{ textAlign: 'right', padding: '6px 12px', color: 'var(--text-p)' }}>$75.00</td>
              <td style={{ textAlign: 'right', padding: '6px 12px', color: 'var(--text-p)' }}>$18.75</td>
              <td style={{ textAlign: 'right', padding: '6px 12px', color: 'var(--text-p)' }}>$1.50</td>
            </tr>
          </tbody>
        </table>
        </div>
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Token budgeting — preventing runaway costs">
        <Pill type="green">Per-request + daily budget caps (mandatory)</Pill> Set max_tokens on every call. Enforce a daily spend limit with automatic model downgrade. A single agentic loop without a cost cap can burn $500+ in an hour. Real incident: a recursive summarization pipeline hit an edge case and made 4,000 Opus calls in 40 minutes. Cost: $12,000. A $200 daily cap would have caught it at call #50.
        <br /><br />
        <Pill type="amber">Context window management</Pill> Long conversations accumulate tokens. A 50-message conversation with a 2000-token system prompt easily hits 30K tokens per call. Solutions: (1) sliding window — keep last N messages, (2) summarize older messages into a compressed context, (3) hybrid — keep last 5 messages verbatim + summarize the rest. Option 3 preserves recent detail while capping costs.
        <br /><br />
        <Pill type="amber">Batch processing for non-urgent work</Pill> Nightly batch jobs (report generation, bulk classification, content moderation queues) can use the Batch API for 50% discount on some providers. Claude's Message Batches API processes up to 100K requests with results within 24 hours at half price.
      </Decision></FadeIn>

      <FadeIn><CodeBlock filename="token-budget-manager.js" code={TOKEN_BUDGET_CODE} output={TOKEN_BUDGET_OUTPUT} /></FadeIn>

      <FadeIn delay={160}><Decision question="When is output cost more important than input cost?">
        Output tokens cost 3-5x more than input tokens across all providers. For workloads that generate long outputs (code generation, content writing, detailed analysis), output costs dominate. A code generation task averaging 2000 output tokens on Sonnet costs $0.03 per request — 83% of that is output.
        <br /><br />
        <Pill type="green">Control output length</Pill> Set max_tokens appropriately. Use system prompt instructions: "Be concise. Limit response to 3 paragraphs." For classification tasks, instruct the model to return only the label, not an explanation.
        <br /><br />
        <Pill type="amber">Structured output</Pill> JSON mode or tool_use forces the model to return structured data instead of prose. A classification that returns {`{"category": "billing", "confidence": 0.94}`} uses ~15 output tokens instead of 200 tokens of explanation.
      </Decision></FadeIn>

      <FadeIn><Insight tag="Cost reality check">
        Run this math in every LLMOps interview: "At 1M requests/day, 2000 tokens in + 500 tokens out average, Sonnet costs $6,000/day input + $7,500/day output = $13,500/day = $405K/month. With routing (65% Haiku, 30% Sonnet, 5% Opus) + caching (40% hit rate), it drops to ~$45K/month. That's a 9x reduction from one architectural decision." Pull out the calculator. The numbers win the argument.
      </Insight></FadeIn>
    </div>
  );
}

function LatencyReliabilityPanel() {
  return (
    <div>
      <SectionHead
        title="Latency and reliability at scale"
        desc="LLM APIs are the slowest dependency in your stack. A database query takes 5ms. An LLM call takes 1-15 seconds. Everything about your architecture must account for this — streaming, timeouts, fallbacks, and circuit breakers."
      />

      <FadeIn><Decision question="Streaming vs non-streaming?">
        <Pill type="green">Always stream for user-facing responses</Pill> TTFT (time to first token) matters more than total generation time. Users perceive a response that starts in 300ms and takes 5 seconds total as faster than one that appears all at once after 3 seconds. Claude's TTFT is typically 200-500ms for Sonnet, 400-800ms for Opus. Non-streaming means the user stares at a spinner for the entire generation time.
        <br /><br />
        <Pill type="amber">Non-streaming for backend pipelines</Pill> When the LLM output feeds into another processing step (classification into a database, extraction into an API call), streaming adds complexity with no benefit. The downstream system needs the complete response anyway.
        <br /><br />
        <strong>TTFT SLOs to target:</strong>
        <br />
        Chat/conversational: &lt;500ms TTFT (users notice delays above this)
        <br />
        Complex reasoning: &lt;2s TTFT (set expectation with UI: "Thinking...")
        <br />
        Background/batch: no TTFT requirement, optimize for throughput
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Retry strategy — which errors to retry and how?">
        <Pill type="green">Retry: 429 (rate limit), 500/502/503 (server errors), timeouts</Pill> Use exponential backoff with jitter. Start at 1s, cap at 30s. For 429s, respect the Retry-After header — the provider is telling you exactly when to retry. Max 3 retries per request.
        <br /><br />
        <Pill type="red">Never retry: 400 (bad request), 401 (auth), 404</Pill> These are deterministic errors. Retrying a malformed prompt 3 times just wastes time and money. 400 errors need code fixes, not retries.
        <br /><br />
        <Pill type="amber">Circuit breaker pattern for cascading failures</Pill> After 3 consecutive failures to a model, open the circuit for 60 seconds (skip that model entirely). This prevents a downed provider from adding retry latency to every request. Half-open after 60s: try one request, close circuit if it succeeds.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Fallback chains — graceful degradation">
        <Pill type="green">Multi-model fallback (recommended)</Pill> Primary: Sonnet. Fallback 1: Haiku (lower quality but available). Fallback 2: cached response (stale but instant). Fallback 3: graceful error message. Never show users a raw API error. The fallback chain should be invisible — the user gets a response, maybe slightly lower quality, but never a blank screen.
        <br /><br />
        <strong>Real latency budget for a chat request:</strong>
        <br />
        Network + auth: 10-30ms
        <br />
        Prompt construction: 1-5ms
        <br />
        TTFT from provider: 200-800ms
        <br />
        Full generation: 1-15s (depends on output length + model)
        <br />
        Post-processing: 1-10ms
        <br />
        <strong>Total: 1.2-16s</strong> (vs 50-200ms for a traditional API endpoint)
        <br /><br />
        This is why streaming is non-negotiable for user-facing: you can't make the user wait 8 seconds for a response.
      </Decision></FadeIn>

      <FadeIn><CodeBlock filename="resilient-llm-client.js" code={RESILIENT_CLIENT_CODE} output={RESILIENT_CLIENT_OUTPUT} /></FadeIn>

      <FadeIn><Insight>
        The staff+ answer to "how do you handle LLM reliability?" isn't "we retry." It's: "We have a three-layer defense. Layer 1: retries with exponential backoff for transient errors. Layer 2: circuit breakers that skip a model after 3 consecutive failures, so we don't add 30 seconds of retry latency to every request during an outage. Layer 3: response cache as the last resort — stale data beats no data. We monitor which layer caught the failure. If Layer 3 activates more than 0.1% of the time, that's an incident."
      </Insight></FadeIn>

      <FadeIn delay={80}><Insight type="warn" tag="Latency trap">
        Agentic loops multiply latency. A 5-iteration agent loop where each iteration calls the LLM once takes 5-25 seconds. If each iteration also calls tools that call LLMs (e.g., a search-then-summarize tool), you're looking at 30-60 seconds total. Set iteration caps, parallelize independent tool calls, and show progressive results. The user should see something useful within 2 seconds even if the full agent loop takes 30.
      </Insight></FadeIn>
    </div>
  );
}

function MonitoringPanel() {
  return (
    <div>
      <SectionHead
        title="Monitoring and debugging LLM systems"
        desc="LLM failures are silent. The model doesn't crash — it returns a confident wrong answer. Traditional monitoring (uptime, error rate, latency) catches infrastructure failures but misses quality degradation. You need a different observability stack."
      />

      <FadeIn><Decision question="What to monitor — the essential metrics">
        <strong>Infrastructure metrics (standard):</strong>
        <br />
        - Latency: p50, p95, p99 by model — detect provider degradation
        <br />
        - Error rate: by error code (429, 500, timeout) — detect outages
        <br />
        - Token usage: input/output per request — detect prompt bloat
        <br />
        - Cost: per query, per user, per feature — detect runaway costs
        <br /><br />
        <strong>Quality metrics (LLM-specific — this is where most teams fail):</strong>
        <br />
        - Cache hit rate: measures prompt consistency. Drops = someone changed a prompt
        <br />
        - Stop reason distribution: end_turn vs max_tokens. Rising max_tokens = responses being truncated
        <br />
        - Prompt hash cardinality: how many unique prompts are you sending? Sudden spikes = prompt injection or unexpected input patterns
        <br />
        - Output token length distribution: sudden changes mean the model behavior shifted (provider update, prompt regression)
        <br /><br />
        <Pill type="green">Monitor all of the above</Pill> Infrastructure metrics catch outages. Quality metrics catch the silent failures that degrade your product over weeks without anyone noticing.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Trace logging — what to capture per LLM call">
        <strong>Log these fields for every call:</strong>
        <br />
        - Trace ID (for distributed tracing)
        <br />
        - Model name and version
        <br />
        - Prompt hash (NOT the full prompt in production — PII risk)
        <br />
        - Input/output token counts
        <br />
        - Latency (total + TTFT for streaming)
        <br />
        - Cost (calculated from token counts)
        <br />
        - Stop reason (end_turn, max_tokens, tool_use)
        <br />
        - Cache hit/miss
        <br /><br />
        <Pill type="red">Don't log full prompts/responses in production</Pill> User data in LLM prompts means full prompt logging creates a PII liability. Log prompt hashes for dedup detection, input previews (first 100 chars) for debugging, and sample full prompts at 1% rate to a separate secure store.
        <br /><br />
        <Pill type="green">Log full prompts in staging/dev</Pill> You need full visibility during development. Use environment-based log levels.
      </Decision></FadeIn>

      <FadeIn><CodeBlock filename="llm-observability.js" code={OBSERVABILITY_CODE} output={OBSERVABILITY_OUTPUT} /></FadeIn>

      <FadeIn delay={160}><Decision question="Detecting prompt regression — the hardest debugging problem">
        When a prompt change degrades output quality, there's no stack trace. The model still returns 200 OK with confident text. Detection requires:
        <br /><br />
        <Pill type="green">A/B test prompt changes</Pill> Route 10% of traffic to the new prompt, compare quality metrics. Never roll out a prompt change to 100% without data. Treat prompts like code deploys — canary first.
        <br /><br />
        <Pill type="green">Golden test set</Pill> Maintain 50-200 test cases with expected outputs. Run every prompt change against the golden set and measure: (1) exact match rate for structured output, (2) LLM-as-judge for free-form output (have a separate model grade quality 1-5), (3) manual spot-check of 10 random outputs.
        <br /><br />
        <Pill type="amber">Output distribution monitoring</Pill> Track output token length, response structure, and key phrase frequency over time. A prompt regression often shows up as a distribution shift before quality metrics catch it. If your classification prompt suddenly produces 40% more "uncertain" labels, something changed.
      </Decision></FadeIn>

      <FadeIn><Insight>
        The debugging superpower in LLM systems is the prompt hash. When a user reports "the AI gave me a wrong answer," you search by trace ID, find the prompt hash, and immediately answer: "This prompt template has been called 47,000 times with a 94% satisfaction rate. This specific input hit an edge case in our context window truncation — the relevant document was in position 12 of 15 and got cut." That's a 5-minute diagnosis instead of a 2-hour investigation. Build the observability before you need it.
      </Insight></FadeIn>
    </div>
  );
}

function AntiPatternsPanel() {
  return (
    <div>
      <SectionHead
        title="LLMOps anti-patterns that cost real money"
        desc="Every one of these has caused a production incident or a five-figure bill at a real company. Learn from their mistakes."
      />

      <FadeIn>
        <div style={styles.anti}>
          <p style={styles.strike}>
            "We don't need cost monitoring — our LLM usage is small."
          </p>
          <p style={styles.better}>
            <span style={{ ...styles.dot, background: '#E7157B' }} />
            <strong>The $100K/month surprise.</strong> A company shipped an agentic feature without token limits. An edge case caused a recursive loop: the agent would call the LLM, parse the response, decide it needed more context, and call again — 200+ iterations per user request. One engineer's Friday deploy, a quiet weekend with no alerts, Monday morning: $42,000 in API charges from a single weekend. The fix was a 3-line cost cap that should have been there from day one. Every LLM call needs a max_tokens parameter. Every pipeline needs a per-request and daily budget. No exceptions.
          </p>
        </div>
      </FadeIn>

      <FadeIn delay={60}>
        <div style={styles.anti}>
          <p style={styles.strike}>
            "More context in the system prompt means better answers."
          </p>
          <p style={styles.better}>
            <span style={{ ...styles.dot, background: '#ED7100' }} />
            <strong>The mega-prompt trap.</strong> A team kept adding instructions to their system prompt until it hit 50K tokens. "Always respond in formal English." "Never use bullet points." "If the user mentions pricing, include this disclaimer..." 847 rules. The model started contradicting itself, ignoring instructions buried in the middle (the "lost in the middle" phenomenon is real — models attend less to information in the center of long contexts), and generating worse output than a 2K-token prompt. The fix: distill to the 10 instructions that actually matter, move reference data to retrieval, and A/B test that the shorter prompt produces equal or better output. It did. By a measurable margin.
          </p>
        </div>
      </FadeIn>

      <FadeIn delay={120}>
        <div style={styles.anti}>
          <p style={styles.strike}>
            "We should use GPT-4/Opus for everything — quality matters."
          </p>
          <p style={styles.better}>
            <span style={{ ...styles.dot, background: '#C925D1' }} />
            <strong>The "always use the best model" fallacy.</strong> A support chatbot used Opus for every query. 70% of queries were "what's my order status?" or "how do I reset my password?" — tasks where Haiku produces identical output at 1/60th the cost. The remaining 30% were genuinely complex queries where Opus added value. After implementing model routing, they cut costs from $180K/month to $28K/month while user satisfaction stayed flat. The classifier itself (Haiku) cost $400/month. ROI: 550x on the routing investment.
          </p>
        </div>
      </FadeIn>

      <FadeIn delay={180}>
        <div style={styles.anti}>
          <p style={styles.strike}>
            "Caching doesn't work for LLMs — every conversation is unique."
          </p>
          <p style={styles.better}>
            <span style={{ ...styles.dot, background: '#3949AB' }} />
            <strong>The no-caching waste.</strong> System prompts are NOT unique — they're identical across all users. A 3000-token system prompt sent 500K times/day on Sonnet without caching costs $4,500/day on input tokens alone. With prompt caching (same prefix = cached), that drops to $450/day. Even for "unique" conversations, semantic deduplication catches 15-30% of queries in FAQ-heavy products. A Redis cache with 1-hour TTL and prompt hashing is a weekend project that pays for itself in 48 hours.
          </p>
        </div>
      </FadeIn>

      <FadeIn delay={240}>
        <div style={styles.anti}>
          <p style={styles.strike}>
            "Streaming is a nice-to-have, we'll add it later."
          </p>
          <p style={styles.better}>
            <span style={{ ...styles.dot, background: '#3F8624' }} />
            <strong>The blank-screen experience.</strong> Without streaming, users stare at a loading spinner for 3-15 seconds while the full response generates. User studies consistently show that streaming responses feel 2-3x faster even when total time is identical. More importantly, users abandon non-streaming LLM interfaces at 3x the rate of streaming ones. Streaming is a P0 for any user-facing LLM feature, not a polish item. Retrofitting it into an architecture that assumed synchronous responses means rewriting your WebSocket layer, your state management, and your rendering pipeline. Build it first.
          </p>
        </div>
      </FadeIn>

      <FadeIn delay={300}>
        <div style={styles.anti}>
          <p style={styles.strike}>
            "We test prompts manually — a few examples is enough."
          </p>
          <p style={styles.better}>
            <span style={{ ...styles.dot, background: '#E7157B' }} />
            <strong>The untested prompt deploy.</strong> A team changed one word in their extraction prompt — "extract" to "identify" — and deployed to production. Extraction accuracy dropped from 94% to 71% on edge cases. Nobody noticed for 2 weeks because the happy-path examples still worked. The prompt had no automated test suite, no golden test set, no canary deployment. Treat prompts as code: version control them, test them against 50+ cases covering edge cases, deploy with canary rollout, and monitor output distributions for regression. A prompt change should go through the same rigor as a code change to a payment system.
          </p>
        </div>
      </FadeIn>

      <FadeIn><Insight>
        In a staff+ interview, describing anti-patterns with specific dollar amounts and incident timelines is worth more than describing the correct architecture. "We had a recursive agent loop that cost $42K over a weekend, which led us to implement per-request cost caps, daily budget limits with automatic model downgrading, and a Slack alert that fires when hourly spend exceeds 2x the rolling average" tells the interviewer you've been in the trenches, not just read the blog posts. The fix is obvious — the story of how you learned it the hard way is what separates operators from theorists.
      </Insight></FadeIn>
        </div>
  );
}

const styles = {
  back: { fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-block', marginBottom: 16, fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' },
  eyebrow: { fontSize: 11, fontWeight: 500, color: 'var(--text-accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontFamily: 'var(--font-mono)' },
  h1: { fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 400, color: 'var(--text-h)', lineHeight: 1.12, marginBottom: 16, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 15, color: 'var(--text-p)', lineHeight: 1.75, marginBottom: 32 },
  tabWrap: { display: 'flex', gap: 0, marginBottom: '2rem', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', overflowX: 'auto', scrollbarWidth: 'none' },
  tabBtn: { background: 'transparent', borderTopWidth: 0, borderRightWidth: 0, borderLeftWidth: 0, borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: 'transparent', padding: '10px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', cursor: 'pointer', transition: 'all var(--dur) var(--ease)', fontFamily: 'inherit', whiteSpace: 'nowrap', letterSpacing: '-0.01em' },
  tabActive: { color: 'var(--text-h)', fontWeight: 600, borderBottomColor: 'var(--bg-accent-strong)' },
  sh: { fontSize: 20, fontWeight: 600, color: 'var(--text-h)', marginBottom: 8, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' },
  ss: { fontSize: 14, color: 'var(--text-p)', lineHeight: 1.7, marginBottom: 20 },
  anti: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 18px', marginBottom: 10 },
  strike: { textDecoration: 'line-through', opacity: 0.5, fontSize: 13, color: 'var(--text-p)', lineHeight: 1.6 },
  better: { fontSize: 13, color: 'var(--text-h)', fontWeight: 500, lineHeight: 1.6, marginTop: 6 },
  dot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 8, verticalAlign: 'middle' },
};
