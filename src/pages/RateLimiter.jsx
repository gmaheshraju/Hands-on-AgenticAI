import { useState, useRef, useEffect, useCallback } from 'react';
import TabNav from '../components/TabNav';
import TabTransition from '../components/TabTransition';
import Decision, { Pill } from '../components/Decision';
import Insight from '../components/Insight';

const TABS = ['0 Why first', '1 Algorithms', '2 Simulator', '3 Distributed', '4 Where to place', '5 Real systems', '6 Anti-patterns'];

export default function RateLimiter() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <p className="page-eyebrow">Framework 02</p>
      <h1 className="page-title">Rate Limiter Design</h1>
      <p className="page-subtitle">
        Before picking an algorithm, answer: what are you protecting, who are you
        limiting, and what happens when a request is rejected? The algorithm is
        the last decision, not the first.
      </p>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      <TabTransition activeKey={tab}>

      {tab === 0 && <WhyPanel />}
      {tab === 1 && <AlgorithmsPanel />}
      {tab === 2 && <SimulatorPanel />}
      {tab === 3 && <DistributedPanel />}
      {tab === 4 && <PlacementPanel />}
      {tab === 5 && <RealSystemsPanel />}
      {tab === 6 && <AntiPatternsPanel />}
      </TabTransition>
    </div>
  );
}

function WhyPanel() {
  return (
    <div>
      <h2 className="page-section-title">Start with "what are you protecting?"</h2>
      <p className="page-body">Most candidates jump to "token bucket." Staff engineers ask why you need a rate limiter at all — the answer shapes every subsequent decision.</p>

      <Decision question="Protecting backend services from overload?">
        You need server-side rate limiting. The goal is stability, not fairness. Shed load aggressively — a 429 is cheaper than a cascading failure. This is the most common use case.
      </Decision>
      <Decision question="Preventing abuse — scraping, brute force, spam?">
        You need per-identity limiting (API key, user ID, IP). The goal is fairness and security. Consider combining with exponential backoff on the client and CAPTCHA for repeat offenders.
      </Decision>
      <Decision question="Enforcing paid tier quotas — free vs pro vs enterprise?">
        You need metered rate limiting with accurate counting. The goal is billing correctness. Eventual consistency is not acceptable — you need precise counts. Stripe and AWS use this model.
      </Decision>
      <Decision question="Smoothing bursty traffic to a downstream dependency?">
        You need traffic shaping, not rate limiting. The goal is a steady output rate regardless of input burstiness. Leaky bucket or a queue with a fixed consumer rate fits here.
      </Decision>

      <Insight>
        "The rate limiter protects the database from write amplification during bulk imports. I'd place it at the API gateway level, keyed by API key, with a token bucket allowing short bursts but capping sustained throughput at 100 req/s per tenant."
      </Insight>
    </div>
  );
}

function AlgorithmsPanel() {
  const [expanded, setExpanded] = useState(null);

  const algos = [
    {
      name: 'Token bucket',
      tldr: 'Allows controlled bursts. The most widely used algorithm in production.',
      how: 'A bucket holds up to B tokens. Tokens are added at rate R per second. Each request consumes one token. If the bucket is empty, the request is rejected. Tokens that would exceed B are discarded.',
      burst: 'Yes — up to B requests can fire instantly if the bucket is full. This is a feature, not a bug. Real traffic is bursty.',
      memory: 'O(1) per key — just two values: current token count and last refill timestamp.',
      precision: 'Approximate. A request arriving just after a refill gets a token even if the "true" rate was exceeded by microseconds. In practice this doesn\'t matter.',
      used: 'AWS API Gateway, Stripe API, Linux tc (traffic control), Go\'s golang.org/x/time/rate, Nginx limit_req with burst parameter.',
      gotcha: 'Refill calculation must be atomic in distributed settings. Naive implementations using separate GET + SET in Redis have a race condition — use a Lua script or Redis cell module.',
    },
    {
      name: 'Sliding window log',
      tldr: 'Precise counting but expensive on memory. Good for low-volume, high-accuracy needs.',
      how: 'Store the timestamp of every request in a sorted set (e.g., Redis ZSET). For each new request, remove entries older than the window, then count remaining entries. If count >= limit, reject.',
      burst: 'No burst tolerance — the window slides continuously, so the count is always exact over the trailing window.',
      memory: 'O(N) per key where N = number of requests in the window. At 1000 req/s with a 60s window, that\'s 60,000 entries per key. This gets expensive fast.',
      precision: 'Exact. No approximation. Every request is individually tracked.',
      used: 'Useful for audit-grade rate limiting where you need to prove exact counts (billing, compliance). Rarely used for high-throughput API rate limiting due to memory cost.',
      gotcha: 'The ZRANGEBYSCORE + ZCARD + ZADD sequence must be atomic. Use a Redis Lua script or pipeline with MULTI/EXEC. Without atomicity, concurrent requests can both read "under limit" and both pass.',
    },
    {
      name: 'Sliding window counter',
      tldr: 'Best balance of precision and efficiency. Used by Cloudflare.',
      how: 'Combine two fixed windows: the current window\'s count and the previous window\'s count. Weight the previous window by the overlap fraction. Example: 70% into the current window → effective count = current_count + previous_count × 0.30.',
      burst: 'Minimal — the weighted average smooths out boundary bursts. Cloudflare measured <0.003% false positive rate with this approach.',
      memory: 'O(1) per key — just two counters and a window timestamp. Same as token bucket.',
      precision: 'Approximate but very good in practice. The error is bounded by the window size. Cloudflare\'s analysis showed it\'s accurate enough for production rate limiting at massive scale.',
      used: 'Cloudflare (their blog post on rate limiting describes this exact algorithm), Kong API Gateway.',
      gotcha: 'The approximation under-counts at the start of a new window (when previous_count is 0). This means the first window after a quiet period allows a brief burst. Acceptable for most use cases.',
    },
    {
      name: 'Fixed window counter',
      tldr: 'Simplest to implement. The boundary-burst problem makes it unsuitable for strict rate limiting.',
      how: 'Divide time into fixed windows (e.g., 60-second intervals). Increment a counter per window. If counter >= limit, reject. Reset counter at the start of each window.',
      burst: 'Severe boundary problem: a client can send limit requests at the end of window N and limit requests at the start of window N+1, effectively doubling the rate in a short period.',
      memory: 'O(1) per key — single counter and window ID.',
      precision: 'Poor at window boundaries. A client sending 100 requests in the last second of one window and 100 in the first second of the next effectively gets 200/2s = 100/s against a 100/60s limit.',
      used: 'Simple internal systems where the boundary burst is acceptable. Not used for customer-facing rate limiting at scale.',
      gotcha: 'The Redis INCR command is atomic, making this trivially implementable — but the boundary problem means you\'re not actually enforcing the rate you think you are.',
    },
    {
      name: 'Leaky bucket (as a queue)',
      tldr: 'Smooths output to a fixed rate. Best for traffic shaping, not rate limiting.',
      how: 'Requests enter a FIFO queue with fixed capacity. A processor drains the queue at a constant rate. If the queue is full, new requests are dropped. The output rate is perfectly smooth regardless of input burstiness.',
      burst: 'No bursts on output — that\'s the entire point. Input bursts are absorbed by the queue up to its capacity. This is fundamentally different from token bucket, which allows output bursts.',
      memory: 'O(queue_capacity) — you\'re storing the actual queued requests.',
      precision: 'Exact output rate. The drip rate is deterministic.',
      used: 'Network traffic shaping (Cisco QoS, Linux tc qdisc), Shopify\'s API rate limiter (they use leaky bucket semantics for smoothing merchant API calls).',
      gotcha: 'Adds latency — requests sit in the queue waiting to be processed. For real-time APIs where latency matters, token bucket is better because it serves requests immediately if tokens are available. Leaky bucket trades latency for smoothness.',
    },
  ];

  return (
    <div>
      <h2 className="page-section-title">Five algorithms — know when each fits</h2>
      <p className="page-body">Don't memorize implementations. Understand the tradeoff: burst tolerance vs precision vs memory vs latency. That's what matters in practice.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {algos.map((algo, i) => {
          const ex = expanded === i;
          return (
            <div key={algo.name} style={{ ...styles.algoCard, borderColor: ex ? 'var(--border-strong)' : 'var(--border)' }} onClick={() => setExpanded(ex ? null : i)}>
              <p style={styles.algoName}>
                {algo.name}
                <span style={{ ...styles.algoChev, transform: ex ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
              </p>
              <p style={styles.algoTldr}>{algo.tldr}</p>
              {ex && (
                <div style={styles.algoDetail}>
                  {[['How it works', algo.how], ['Burst behavior', algo.burst], ['Memory', algo.memory], ['Precision', algo.precision], ['Used by', algo.used], ['Gotcha', algo.gotcha]].map(([label, val]) => (
                    <div key={label} style={styles.algoRow}>
                      <span style={styles.algoLabel}>{label}</span>
                      <span style={styles.algoVal}>{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Insight>
        "For this API gateway, I'd use token bucket — it handles real-world bursty traffic naturally, uses O(1) memory per key, and is the algorithm behind AWS API Gateway and Stripe. I'd only reach for sliding window counter if I need tighter boundary precision, like Cloudflare does for their WAF."
      </Insight>
    </div>
  );
}

function SimulatorPanel() {
  const [algo, setAlgo] = useState('token_bucket');
  const [rate, setRate] = useState(5);
  const [burst, setBurst] = useState(10);
  const [log, setLog] = useState([]);
  const stateRef = useRef({ tokens: 10, lastRefill: Date.now(), windowCount: 0, windowStart: Date.now(), prevCount: 0 });
  const idRef = useRef(0);

  const reset = useCallback(() => {
    stateRef.current = { tokens: burst, lastRefill: Date.now(), windowCount: 0, windowStart: Date.now(), prevCount: 0 };
    setLog([]);
    idRef.current = 0;
  }, [burst]);

  useEffect(() => { reset(); }, [algo, rate, burst, reset]);

  const sendRequest = useCallback(() => {
    const now = Date.now();
    const s = stateRef.current;
    let allowed = false;
    let detail = '';

    if (algo === 'token_bucket') {
      const elapsed = (now - s.lastRefill) / 1000;
      s.tokens = Math.min(burst, s.tokens + elapsed * rate);
      s.lastRefill = now;
      if (s.tokens >= 1) {
        s.tokens -= 1;
        allowed = true;
        detail = `${s.tokens.toFixed(1)} tokens remaining`;
      } else {
        detail = `bucket empty (0 tokens, refills at ${rate}/s)`;
      }
    } else if (algo === 'fixed_window') {
      const windowMs = 1000;
      if (now - s.windowStart >= windowMs) {
        s.windowCount = 0;
        s.windowStart = now;
      }
      if (s.windowCount < rate) {
        s.windowCount++;
        allowed = true;
        detail = `${s.windowCount}/${rate} in current window`;
      } else {
        detail = `window full (${s.windowCount}/${rate})`;
      }
    } else if (algo === 'sliding_window') {
      const windowMs = 1000;
      const elapsed = now - s.windowStart;
      if (elapsed >= windowMs) {
        s.prevCount = s.windowCount;
        s.windowCount = 0;
        s.windowStart = now;
      }
      const weight = 1 - ((now - s.windowStart) / windowMs);
      const effective = Math.round(s.windowCount + s.prevCount * Math.max(0, weight));
      if (effective < rate) {
        s.windowCount++;
        allowed = true;
        detail = `effective count: ${effective + 1}/${rate} (weighted)`;
      } else {
        detail = `effective count: ${effective}/${rate} (limit hit)`;
      }
    }

    const id = ++idRef.current;
    setLog(prev => [{ id, allowed, detail, time: new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 1 }) }, ...prev].slice(0, 30));
  }, [algo, rate, burst]);

  const sendBurst = useCallback(() => {
    for (let i = 0; i < 8; i++) {
      setTimeout(() => sendRequest(), i * 30);
    }
  }, [sendRequest]);

  return (
    <div>
      <h2 className="page-section-title">Interactive simulator</h2>
      <p className="page-body">See how each algorithm handles steady traffic vs bursts. Adjust the rate, then click "Send request" or fire a burst to see the difference.</p>

      <div style={styles.simControls}>
        <div style={styles.simRow}>
          <label style={styles.simLabel}>Algorithm</label>
          <select value={algo} onChange={e => setAlgo(e.target.value)} style={styles.simSelect}>
            <option value="token_bucket">Token bucket</option>
            <option value="fixed_window">Fixed window</option>
            <option value="sliding_window">Sliding window counter</option>
          </select>
        </div>
        <div style={styles.simRow}>
          <label style={styles.simLabel}>Rate limit</label>
          <input type="range" min={1} max={20} step={1} value={rate} onChange={e => setRate(Number(e.target.value))} style={styles.simRange} />
          <span style={styles.simVal}>{rate}/s</span>
        </div>
        {algo === 'token_bucket' && (
          <div style={styles.simRow}>
            <label style={styles.simLabel}>Bucket size</label>
            <input type="range" min={1} max={30} step={1} value={burst} onChange={e => setBurst(Number(e.target.value))} style={styles.simRange} />
            <span style={styles.simVal}>{burst}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <button onClick={sendRequest} style={styles.simBtn}>Send request</button>
        <button onClick={sendBurst} style={{ ...styles.simBtn, ...styles.simBtnDanger }}>Send burst (8)</button>
        <button onClick={reset} style={{ ...styles.simBtn, ...styles.simBtnGhost }}>Reset</button>
      </div>

      <div style={styles.simLog}>
        {log.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '2rem 0' }}>Click "Send request" to start</p>}
        {log.map(entry => (
          <div key={entry.id} style={{ ...styles.simEntry, borderLeftColor: entry.allowed ? 'var(--text-success)' : 'var(--text-danger)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...styles.simDot, background: entry.allowed ? 'var(--text-success)' : 'var(--text-danger)' }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: entry.allowed ? 'var(--text-success)' : 'var(--text-danger)' }}>
                {entry.allowed ? 'ALLOWED' : 'REJECTED'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>#{entry.id} at {entry.time}</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, paddingLeft: 19 }}>{entry.detail}</p>
          </div>
        ))}
      </div>

      <Insight>
        Try this: set token bucket to 5/s with bucket size 10, send a burst of 8. The first 8 pass (tokens were full). Then send another burst immediately — most get rejected. Now wait 2 seconds and try again. That's the burst-then-recover behavior that makes token bucket practical for real APIs.
      </Insight>
    </div>
  );
}

function DistributedPanel() {
  return (
    <div>
      <h2 className="page-section-title">Distributed rate limiting — the hard part</h2>
      <p className="page-body">Single-node rate limiting is trivial. The real challenge is coordination across multiple servers. This is where engineers often miss the complexity.</p>

      <Decision question="Why not just rate-limit per server?">
        If you have N servers and a limit of 100/s, each server allows 100/N per second. This breaks when traffic isn't evenly distributed — sticky sessions, hot users, and autoscaling all cause skew. In practice, per-server limits either over-restrict (wasting capacity) or under-restrict (allowing abuse).
      </Decision>
      <Decision question="Centralized counter with Redis">
        The standard approach. Use Redis INCR with EXPIRE for fixed window, or a Lua script for token bucket. Redis single-threaded execution model guarantees atomicity without explicit locks. Latency cost: one Redis RTT per request (typically 0.5–2ms within the same availability zone).
      </Decision>
      <Decision question="What about Redis failing?">
        <Pill type="red">critical</Pill> Two strategies: (1) Fail open — allow all requests when Redis is down. Protects availability but sacrifices rate limiting. Used when rate limiting is a nice-to-have. (2) Fail closed — reject all requests. Used when rate limiting is a security boundary (brute force protection). Most production systems fail open with a local in-memory fallback at a conservative rate.
      </Decision>
      <Decision question="Race condition in naive Redis implementations">
        <Pill type="red">gotcha</Pill> GET tokens → check → SET tokens is NOT atomic. Between GET and SET, another server can GET the same value. Solution: use a single Lua script that does the entire check-and-decrement atomically. Redis executes Lua scripts atomically because it's single-threaded. Alternative: use the Redis Cell module (GCRA algorithm, single command).
      </Decision>
      <Decision question="Multi-region rate limiting">
        Redis in a single region means cross-region latency for the rate limit check. Options: (1) One Redis per region with local limits (sum may exceed global limit). (2) Async sync between regions with eventual consistency (used by Cloudflare). (3) Accept the cross-region latency for strong consistency (used by Stripe for billing-critical limits). The right choice depends on whether the limit is safety-critical or best-effort.
      </Decision>

      <Insight>
        "I'd use Redis with a Lua script for atomicity. The script does EVAL with the token bucket logic — read current tokens, calculate refill based on elapsed time, decrement if allowed, return the result. Single Redis RTT, zero race conditions. If Redis goes down, I'd fail open with a local in-memory token bucket at 80% of the normal rate as a safety net."
      </Insight>
    </div>
  );
}

function PlacementPanel() {
  return (
    <div>
      <h2 className="page-section-title">Where to place the rate limiter</h2>
      <p className="page-body">Placement changes what you can key on, what latency you add, and what traffic you can shed. This is a design decision, not an implementation detail.</p>

      <Decision question="At the API Gateway / Load Balancer">
        Catches traffic before it hits your application servers. Good for: IP-based throttling, global rate limits, DDoS mitigation. AWS API Gateway, Kong, Nginx, Envoy all support this natively. Limitation: you only have access to transport-level info (IP, headers, URL path) — no application-level context like user tier or account ID unless it's in a header.
      </Decision>
      <Decision question="In application middleware">
        Runs inside your service code (Express middleware, Spring filter, gRPC interceptor). Good for: per-user limits, per-endpoint limits, business-logic-aware throttling (e.g., different limits for read vs write operations). Adds latency to every request (the Redis RTT). Most production systems use this layer.
      </Decision>
      <Decision question="As a sidecar / service mesh">
        Istio, Linkerd, Envoy sidecar can rate-limit at the mesh level. Good for: service-to-service rate limiting in microservices. Prevents one service from overwhelming another. The configuration lives in infrastructure, not application code. Downside: less flexibility for business-logic-aware limits.
      </Decision>
      <Decision question="Client-side rate limiting">
        The client throttles itself before sending. Good for: preventing accidental overload from batch jobs, SDK-level protection. AWS SDKs implement client-side throttling with exponential backoff. This is a complement to server-side limiting, never a replacement — you can't trust the client.
      </Decision>

      <Insight>
        "I'd use two layers: the API gateway handles IP-level DDoS protection and global rate limits — that's infrastructure config, not application code. The application middleware handles per-user, per-endpoint limits using the user's API key from the auth token. Two layers, two different concerns, two different keying strategies."
      </Insight>
    </div>
  );
}

function RealSystemsPanel() {
  const [expanded, setExpanded] = useState(null);

  const systems = [
    {
      name: 'Stripe',
      detail: 'Token bucket per API key. 100 req/s for most endpoints, 25/s for search endpoints. Returns X-RateLimit-Limit, X-RateLimit-Remaining, and X-RateLimit-Reset headers. On 429, returns a Retry-After header. Their rate limiter is centralized (single Redis cluster) because billing accuracy matters more than latency. They wrote a detailed blog post describing their migration from a simple counter to token bucket.',
    },
    {
      name: 'GitHub API',
      detail: 'Fixed window counter. 5,000 req/hour for authenticated users, 60/hour for unauthenticated (by IP). They use fixed windows aligned to the hour because their limits are generous enough that boundary bursts don\'t matter. Returns X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset (Unix timestamp). Secondary rate limits exist for content-creating endpoints (POST/PATCH/PUT) at lower thresholds.',
    },
    {
      name: 'Cloudflare',
      detail: 'Sliding window counter for their rate limiting product. Their engineering blog describes the algorithm in detail: two fixed-window counters weighted by overlap fraction. They measured <0.003% false positive rate. For DDoS mitigation, they use a separate system based on probabilistic data structures (HyperLogLog for unique IP counting) at their edge PoPs. They rate-limit at the edge, not at origin.',
    },
    {
      name: 'AWS API Gateway',
      detail: 'Token bucket. Configured per stage with a steady-state rate and burst capacity. Default: 10,000 req/s steady state, 5,000 burst. The burst capacity refills at the steady-state rate. Throttling is per-region, per-account. Returns 429 with no Retry-After header (the client SDK implements exponential backoff). Uses a distributed token bucket across their fleet.',
    },
    {
      name: 'Discord',
      detail: 'Per-route rate limiting with token bucket semantics. Each API route has its own bucket (e.g., /channels/{id}/messages has a different limit than /guilds). Returns X-RateLimit-Bucket (opaque ID), X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Reset-After. They use a global rate limit (50 req/s across all routes) plus per-route limits. Their bot library ecosystem relies heavily on these headers for self-throttling.',
    },
    {
      name: 'Shopify',
      detail: 'Leaky bucket for their REST API, cost-based for GraphQL. REST: 40 requests in the bucket, drains at 2/s. If the bucket is full, you get 429. GraphQL: each query has a calculated cost based on fields requested; you get 1,000 cost points that refill at 50/s. The GraphQL approach is more sophisticated — a simple query costs 1 point, a query fetching 250 products costs 252 points. This prevents expensive queries from starving simple ones.',
    },
  ];

  return (
    <div>
      <h2 className="page-section-title">How real systems do it</h2>
      <p className="page-body">Citing a real system's approach — with the specific algorithm, limits, and headers — is the strongest staff+ signal. It proves you've read the docs, not just the textbooks.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {systems.map((sys, i) => {
          const ex = expanded === i;
          return (
            <div key={sys.name} style={{ ...styles.algoCard, borderColor: ex ? 'var(--border-strong)' : 'var(--border)' }} onClick={() => setExpanded(ex ? null : i)}>
              <p style={styles.algoName}>
                {sys.name}
                <span style={{ ...styles.algoChev, transform: ex ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
              </p>
              {ex && <p style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.7, marginTop: 10 }}>{sys.detail}</p>}
            </div>
          );
        })}
      </div>

      <Insight>
        "Stripe uses token bucket because they need burst tolerance for legitimate API traffic — a merchant's checkout page fires 5 API calls simultaneously. Shopify uses leaky bucket for REST but cost-based for GraphQL — because GraphQL query cost varies 250x depending on fields. The algorithm follows from the use case."
      </Insight>
    </div>
  );
}

function AntiPatternsPanel() {
  const antis = [
    { bad: 'I\'ll use a token bucket because it\'s the best algorithm.',
      good: 'Token bucket fits here because we need burst tolerance for legitimate checkout traffic, and O(1) memory per key since we\'re tracking 10M API keys.' },
    { bad: 'I\'ll rate limit by IP address.',
      good: 'IP-based limiting fails behind NAT and CDNs — a single corporate IP can represent 10,000 users. I\'d use the API key from the auth header for per-tenant limits, and IP only as a fallback for unauthenticated endpoints.' },
    { bad: 'I\'ll store the rate limit state in the application database.',
      good: 'Rate limit checks happen on every request — that\'s read+write on every API call. I\'d use Redis because it\'s in-memory and the operations (INCR, EVAL) are O(1). Putting this in Postgres adds 5-10ms per request and creates a hot row.' },
    { bad: 'When rate limited, I\'ll return a 403 Forbidden.',
      good: '429 Too Many Requests is the correct status code — it was created specifically for rate limiting (RFC 6585). Include Retry-After header so well-behaved clients know when to retry. 403 means "you don\'t have permission" which is a different problem.' },
    { bad: 'I\'ll use Redis and it\'ll just work across regions.',
      good: 'Redis replication is async, so a write in us-east isn\'t immediately visible in eu-west. For global rate limiting, I\'d either accept eventual consistency with per-region limits that sum to the global limit, or route all rate limit checks to a single region and accept the latency.' },
  ];

  return (
    <div>
      <h2 className="page-section-title">What not to say</h2>
      <p className="page-body">These answers reveal shallow understanding. The fix is always the same: name the specific constraint that drives your choice.</p>

      {antis.map((ap, i) => (
        <div key={i} style={styles.anti}>
          <p style={{ marginBottom: 8 }}>
            <span style={{ ...styles.dot, background: 'var(--text-danger)' }} />
            <span style={styles.strike}>"{ap.bad}"</span>
          </p>
          <p style={{ margin: 0 }}>
            <span style={{ ...styles.dot, background: 'var(--text-success)' }} />
            <span style={styles.better}>"{ap.good}"</span>
          </p>
        </div>
      ))}

      <Insight type="warn" tag="The meta-pattern">
        Rate limiting is a systems thinking problem, not an algorithm problem. The algorithm is 10% of the answer. The other 90% is: what are you protecting, where does the limiter live, what do you key on, what happens when it fails, and what does the client see. Engineers who jump to "token bucket" without answering these questions are missing the point.
      </Insight>
    </div>
  );
}

const styles = {

  algoCard: { background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 18px', cursor: 'pointer', transition: 'all var(--dur) var(--ease)' },
  algoName: { fontSize: 15, fontWeight: 600, color: 'var(--text-h)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  algoChev: { fontSize: 10, color: 'var(--text-muted)', transition: 'transform var(--dur) var(--ease)' },
  algoTldr: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 },
  algoDetail: { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' },
  algoRow: { display: 'flex', gap: 10, marginBottom: 10, fontSize: 13, lineHeight: 1.6 },
  algoLabel: { color: 'var(--text-muted)', minWidth: 90, flexShrink: 0, fontWeight: 500, fontSize: 12 },
  algoVal: { color: 'var(--text-p)' },

  simControls: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 18px' },
  simRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 },
  simLabel: { fontSize: 13, fontWeight: 500, color: 'var(--text-p)', minWidth: 90, flexShrink: 0 },
  simSelect: { flex: 1, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-h)', fontSize: 13, fontFamily: 'inherit' },
  simRange: { flex: 1, accentColor: 'var(--text-accent)' },
  simVal: { fontSize: 13, fontWeight: 600, color: 'var(--text-h)', minWidth: 40, textAlign: 'right' },
  simBtn: { padding: '8px 18px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-accent)', background: 'var(--bg-accent)', color: 'var(--text-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all var(--dur) var(--ease)' },
  simBtnDanger: { borderColor: 'var(--text-danger)', background: 'var(--bg-danger)', color: 'var(--text-danger)' },
  simBtnGhost: { borderColor: 'var(--border)', background: 'transparent', color: 'var(--text-muted)' },
  simLog: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px 16px', maxHeight: 320, overflowY: 'auto' },
  simEntry: { borderLeft: '3px solid', paddingLeft: 10, paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid var(--border)' },
  simDot: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%' },

  anti: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 18px', marginBottom: 10 },
  strike: { textDecoration: 'line-through', opacity: 0.5, fontSize: 13, color: 'var(--text-p)', lineHeight: 1.6 },
  better: { fontSize: 13, color: 'var(--text-h)', fontWeight: 500, lineHeight: 1.6 },
  dot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 8, verticalAlign: 'middle' },
};
