import { useState } from 'react';
import TabNav from '../components/TabNav';
import TabTransition from '../components/TabTransition';
import Decision, { Pill } from '../components/Decision';
import Insight from '../components/Insight';

const TABS = ['0 Why first', '1 Patterns', '2 Invalidation', '3 Failures', '4 Where to cache', '5 Real systems', '6 Anti-patterns'];

export default function Caching() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <p className="page-eyebrow">Framework 03</p>
      <h1 className="page-title">Caching Strategies</h1>
      <p className="page-subtitle">
        Caching is easy to add and hard to get right. The question isn't whether
        to cache — it's what to cache, when to invalidate, and what happens when
        the cache lies. Every caching bug is an invalidation bug.
      </p>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      <TabTransition activeKey={tab}>

      {tab === 0 && <WhyPanel />}
      {tab === 1 && <PatternsPanel />}
      {tab === 2 && <InvalidationPanel />}
      {tab === 3 && <FailuresPanel />}
      {tab === 4 && <WherePanel />}
      {tab === 5 && <RealSystemsPanel />}
      {tab === 6 && <AntiPatternsPanel />}
      </TabTransition>
    </div>
  );
}

function WhyPanel() {
  return (
    <div>
      <h2 className="page-section-title">Start with "should you cache at all?"</h2>
      <p className="page-body">Caching adds a consistency problem to every read path. Before adding a cache, prove that the database can't serve the load with proper indexing and read replicas.</p>

      <Decision question="Is the read/write ratio high enough to justify caching?">
        Caching shines at 10:1 or higher read/write ratios. A user profile read 1000x for every update is a perfect candidate. A chat message read once and written once gets no benefit — caching it wastes memory and adds staleness risk.
      </Decision>
      <Decision question="Can you tolerate stale data?">
        <Pill type="red">critical</Pill> This is the single most important question. If the answer is "no" (account balance, inventory count), caching either requires synchronous invalidation (which is hard to get right) or should be avoided entirely. If "yes for 30 seconds" (product catalog, user feed), cache with a TTL matching that tolerance.
      </Decision>
      <Decision question="Is the data expensive to compute or fetch?">
        Aggregations, ML model inference results, third-party API responses, and complex joins are all good cache candidates even at lower read/write ratios. The cache amortizes the cost across reads. A dashboard query that takes 3 seconds but updates hourly should absolutely be cached.
      </Decision>
      <Decision question="What's the cardinality of the cache key space?">
        Caching "top 10 trending posts" (1 key) is trivial. Caching "personalized feed for each of 100M users" (100M keys) requires careful memory planning. At high cardinality, you need eviction policies (LRU/LFU) and must size the cache to your memory budget, not your key space.
      </Decision>

      <Insight>
        "The product catalog has a 500:1 read/write ratio and tolerates 60 seconds of staleness. I'd cache it with a 60s TTL in Redis. The inventory count changes on every purchase and must be accurate — I'd skip the cache there and read from a Postgres read replica with strong consistency."
      </Insight>
    </div>
  );
}

function PatternsPanel() {
  const [expanded, setExpanded] = useState(null);

  const patterns = [
    {
      name: 'Cache-aside (lazy loading)',
      tldr: 'Application manages the cache explicitly. The most common pattern in production.',
      how: 'On read: check cache → if miss, read from DB → write to cache → return. On write: update DB → delete cache entry (NOT update). The next read triggers a cache fill with fresh data.',
      pros: 'Simple to implement. Only caches data that is actually requested (no wasted memory). Application has full control over what\'s cached and for how long. Works with any database.',
      cons: 'First request after a miss is slow (cache miss + DB read + cache write). Under high concurrency, multiple simultaneous cache misses for the same key cause a "thundering herd" — all hit the DB at once.',
      when: 'Default choice for most read-heavy workloads. User profiles, product pages, configuration data, session data. Use this unless you have a specific reason not to.',
      gotcha: 'On write, DELETE the cache key — don\'t UPDATE it. If you update the cache and the DB write fails, the cache has data that doesn\'t exist in the DB. Delete-on-write is always safe: the worst case is an extra cache miss.',
    },
    {
      name: 'Write-through',
      tldr: 'Every write goes to both cache and DB synchronously. Cache is always consistent.',
      how: 'On write: write to cache AND write to DB in the same operation (or transaction). On read: always read from cache. The cache is the "front" for the DB.',
      pros: 'Cache is never stale — every write updates both stores. Reads are always fast (cache hit). Simple mental model: the cache is a consistent mirror of the DB.',
      cons: 'Write latency increases (two writes instead of one). Caches data that may never be read — wastes memory. If the cache is down, writes either fail or bypass the cache (creating inconsistency).',
      when: 'Data that is written and immediately read back (e.g., user updates their profile then views it). Systems where staleness is unacceptable but you still want read performance. DynamoDB Accelerator (DAX) uses this model.',
      gotcha: 'If the cache write succeeds but the DB write fails, you have inconsistency. You need both writes in a transaction, or you need the cache write to happen only after the DB write confirms. In practice, "write DB first, then update cache" is safer than true write-through.',
    },
    {
      name: 'Write-behind (write-back)',
      tldr: 'Writes go to cache immediately, DB is updated asynchronously. Fast writes, eventual persistence.',
      how: 'On write: write to cache → return immediately → a background process flushes dirty cache entries to the DB periodically or on eviction. On read: always from cache.',
      pros: 'Extremely fast writes (only cache latency). Batches multiple writes to the same key (if a counter is incremented 100x in 1 second, only 1 DB write). Absorbs write spikes.',
      cons: 'Data loss risk: if the cache node dies before flushing, uncommitted writes are lost. Harder to implement correctly. Debugging is difficult because the cache and DB are temporarily inconsistent by design.',
      when: 'Write-heavy workloads where some data loss is acceptable: analytics counters, view counts, activity logs. CPU L1/L2 caches use this model — the hardware equivalent.',
      gotcha: 'You MUST handle cache node failure. Options: replicated cache (Redis Sentinel/Cluster), write-ahead log before the cache write, or accepting data loss for that window. Most teams that think they can accept data loss are surprised when they actually lose it.',
    },
    {
      name: 'Read-through',
      tldr: 'Cache itself fetches from DB on miss. Application only talks to the cache.',
      how: 'On read: application asks cache → cache checks itself → on miss, cache fetches from DB, stores it, returns to application. The application never directly queries the DB for cached data.',
      pros: 'Simplifies application code — the cache is the only data source the app talks to. Cache handles all the miss/fill logic. Consistent behavior across all cache consumers.',
      cons: 'Requires the cache layer to understand your data model and know how to query the DB. Less flexible than cache-aside. First-read latency is still high on a miss.',
      when: 'When you want a clean abstraction boundary. CDNs are read-through caches — they fetch from the origin on miss and serve from cache on hit. Memcached-based ORMs (like Hibernate\'s second-level cache) use this model.',
      gotcha: 'Read-through and cache-aside are functionally identical in behavior — the only difference is who calls the DB on a miss (the cache library vs the application). The choice is about code organization, not performance.',
    },
    {
      name: 'Refresh-ahead',
      tldr: 'Proactively refreshes entries before they expire. Eliminates miss latency for hot keys.',
      how: 'Track access patterns. When an entry is accessed and its TTL is within a "refresh window" (e.g., <20% remaining), trigger an async background refresh from the DB. The stale entry is served while the refresh happens.',
      pros: 'Zero cache-miss latency for frequently accessed keys. Smooth latency distribution — no periodic spikes when popular keys expire simultaneously.',
      cons: 'Only helps for hot keys that are accessed regularly within the refresh window. Cold keys still get normal miss behavior. Adds complexity — you need background refresh workers and access tracking.',
      when: 'High-traffic keys where cache-miss latency is unacceptable: homepage content, trending feeds, feature flags. Amazon uses refresh-ahead for product page data.',
      gotcha: 'If the refresh window is too large, you waste DB reads refreshing keys that won\'t be accessed again. If too small, you don\'t catch keys in time and they expire normally. Tune based on access frequency data, not guesses.',
    },
  ];

  return (
    <div>
      <h2 className="page-section-title">Five caching patterns — know the tradeoffs</h2>
      <p className="page-body">Cache-aside is the default. Name why you'd deviate from it — that's the staff+ signal.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {patterns.map((p, i) => {
          const ex = expanded === i;
          return (
            <div key={p.name} style={{ ...styles.card, borderColor: ex ? 'var(--border-strong)' : 'var(--border)' }} onClick={() => setExpanded(ex ? null : i)}>
              <p style={styles.cardName}>
                {p.name}
                <span style={{ ...styles.chev, transform: ex ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
              </p>
              <p style={styles.cardTldr}>{p.tldr}</p>
              {ex && (
                <div style={styles.detail}>
                  {[['How it works', p.how], ['Pros', p.pros], ['Cons', p.cons], ['When to use', p.when], ['Gotcha', p.gotcha]].map(([label, val]) => (
                    <div key={label} style={styles.row}>
                      <span style={styles.label}>{label}</span>
                      <span style={styles.val}>{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Insight>
        "I'd use cache-aside for the product catalog — we only cache what's actually requested, and a 60s TTL handles staleness. For the user session, I'd use write-through because the session is written and immediately read back on every request — staleness there means a logged-in user seeing a logged-out page."
      </Insight>
    </div>
  );
}

function InvalidationPanel() {
  return (
    <div>
      <h2 className="page-section-title">Cache invalidation — the hardest problem</h2>
      <p className="page-body">"There are only two hard things in Computer Science: cache invalidation and naming things." Phil Karlton wasn't joking. Every caching bug is an invalidation bug.</p>

      <Decision question="TTL-based expiration">
        Set a Time-To-Live on every cache entry. After TTL expires, the next read fetches fresh data from DB. The simplest approach. Works when you can define an acceptable staleness window. TTL too short = excessive DB load. TTL too long = stale data. Start with your staleness tolerance and set TTL to match. Most production caches use this as the baseline strategy.
      </Decision>
      <Decision question="Event-driven invalidation">
        When data changes, publish an event (via Kafka, SNS, CDC) that triggers cache deletion. Gives near-real-time consistency. Complexity: you need a reliable event pipeline, and events can arrive out of order or be delayed. Use for data where staleness is visible to users — e.g., when a user updates their name and expects to see it immediately.
      </Decision>
      <Decision question="Version-based invalidation">
        Include a version number in the cache key (e.g., `product:123:v7`). When data changes, increment the version. Old keys expire naturally via TTL. Pros: no explicit deletion needed, immune to race conditions. Cons: old versions waste memory until they expire. Facebook uses this for their Memcached layer.
      </Decision>
      <Decision question="Delete on write (cache-aside pattern)">
        On every write to DB, delete the corresponding cache key. The next read triggers a refill. This is the safest approach: the worst case is one extra cache miss. Never UPDATE the cache on write — if the DB write fails, you'd have inconsistent data. Delete is idempotent and safe.
      </Decision>

      <div style={styles.card}>
        <p style={{ ...styles.cardName, marginBottom: 10 }}>The classic race condition</p>
        <div style={styles.race}>
          <Step n="1" text="Thread A reads from DB: price = $100" />
          <Step n="2" text="Thread B writes to DB: price = $120" />
          <Step n="3" text="Thread B deletes cache key" />
          <Step n="4" text="Thread A writes to cache: price = $100 (stale!)" />
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.7, marginTop: 12 }}>
          Thread A's cache write happens AFTER Thread B's delete, so the cache now holds stale data ($100) indefinitely. Fix: use a TTL as a safety net (stale data expires), or use a cache lock / lease mechanism (Facebook's Memcached paper describes "leases" that prevent this exact race).
        </p>
      </div>

      <Insight>
        "I'd combine TTL + delete-on-write. The TTL is the safety net — even if invalidation fails, data is never stale for more than 60 seconds. The delete-on-write gives near-instant consistency for the happy path. Belt and suspenders."
      </Insight>
    </div>
  );
}

function Step({ n, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-accent)', background: 'var(--bg-accent)', borderRadius: 'var(--radius-full)', padding: '2px 8px', flexShrink: 0 }}>{n}</span>
      <span style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

function FailuresPanel() {
  return (
    <div>
      <h2 className="page-section-title">Cache failure modes — what goes wrong</h2>
      <p className="page-body">The critical question is "what happens when your cache fails?" These three scenarios are the ones that take down production systems.</p>

      <Decision question="Cache stampede (thundering herd)">
        <Pill type="red">P0 risk</Pill> A hot key expires. Hundreds of concurrent requests all miss the cache simultaneously and all hit the DB at once. The DB buckles under the sudden load. Solutions: (1) Cache lock — only one thread fetches from DB, others wait. (2) Stale-while-revalidate — serve the expired value while one thread refreshes. (3) Refresh-ahead — refresh before expiry. (4) Jittered TTLs — add randomness to TTLs so keys don't expire at the same time.
      </Decision>
      <Decision question="Cache penetration">
        Requests for data that doesn't exist in the DB (e.g., querying user ID that was never created). Every request is a cache miss followed by a DB miss. This can be a DDoS vector — an attacker sends requests for random non-existent IDs. Solutions: (1) Cache the null result with a short TTL. (2) Bloom filter in front of the cache — a probabilistic check that says "this ID definitely doesn't exist" without hitting DB or cache.
      </Decision>
      <Decision question="Cache avalanche">
        Many cache keys expire at the same time (e.g., a bulk import set all TTLs to 60s from the same moment). The DB gets hit with a wall of refill requests simultaneously. Different from stampede (one key, many requests) — this is many keys expiring together. Solution: jitter the TTLs. Instead of TTL=60s, use TTL=60s + random(0, 10s). Spreads expiration across time.
      </Decision>
      <Decision question="Hot key problem">
        One key receives disproportionate traffic (a viral tweet, a flash sale product). A single Redis node handles all reads for that key. Solutions: (1) Local in-memory cache (L1) in front of Redis (L2) with a very short TTL (1-5 seconds). (2) Key replication — store the hot key under multiple keys (`hot:tweet:123:shard1`, `shard2`, etc.) and distribute reads across them. Instagram uses both strategies for viral content.
      </Decision>

      <Insight>
        "For the flash sale page, I'd expect a hot key problem. I'd use a two-tier cache: a 2-second local in-memory cache on each app server (L1), backed by Redis (L2) with a 30-second TTL. The L1 absorbs the burst — even 50 app servers each hitting Redis once per 2 seconds is only 25 QPS to Redis, instead of 50,000 QPS from users."
      </Insight>
    </div>
  );
}

function WherePanel() {
  return (
    <div>
      <h2 className="page-section-title">Where to place the cache</h2>
      <p className="page-body">Different layers of the stack have different caching tradeoffs. Most production systems use multiple layers simultaneously.</p>

      <Decision question="Browser / client cache">
        HTTP Cache-Control headers (max-age, s-maxage, stale-while-revalidate, ETag/If-None-Match). Zero latency, zero server cost. Good for: static assets, API responses that don't change often. Bad for: personalized data, frequently changing data. Often overlooked in system design — worth considering for its simplicity.
      </Decision>
      <Decision question="CDN / edge cache">
        Cloudflare, CloudFront, Fastly. Content cached at PoPs geographically close to users. Good for: static content, public API responses, media. Bad for: personalized responses (Cache-Control: private). Purge/invalidation latency is typically 1-5 seconds globally. CDN cache invalidation is its own design challenge at scale.
      </Decision>
      <Decision question="Application-level in-memory cache (L1)">
        In-process cache (HashMap, Guava/Caffeine in Java, node-cache in Node.js). Sub-microsecond reads. Good for: hot configuration, feature flags, very hot keys. Bad for: data that must be consistent across server instances (each server has its own copy). Limited by server memory. Invalidation across servers requires pub/sub.
      </Decision>
      <Decision question="Distributed cache — Redis / Memcached (L2)">
        Shared cache accessible by all application servers. Good for: session data, query results, computed aggregations. Sub-millisecond reads (network hop). Redis adds data structures (sorted sets, hashes) and persistence. Memcached is simpler and slightly faster for pure key-value. Most production systems use Redis.
      </Decision>
      <Decision question="Database query cache / materialized views">
        Postgres materialized views, MySQL query cache (deprecated in 8.0 for good reason), denormalized read tables. Good for: expensive aggregations, reporting queries. The "cache" lives in the database itself. Refresh is explicit (REFRESH MATERIALIZED VIEW) or via triggers. Often overlooked but powerful for analytics-heavy systems.
      </Decision>

      <Insight>
        "I'd use three layers: CDN for static assets and public API responses (Cache-Control: public, max-age=300), a local in-memory cache on each app server for feature flags and hot configuration (2s TTL, pub/sub invalidation), and Redis for user session data and personalized query results (60s TTL with delete-on-write). Each layer has a different staleness tolerance and consistency model."
      </Insight>
    </div>
  );
}

function RealSystemsPanel() {
  const [expanded, setExpanded] = useState(null);

  const systems = [
    {
      name: 'Facebook / Meta',
      detail: 'Operates the largest Memcached deployment in the world — billions of requests per second across multiple data centers. Their TAO system is a read-through cache for the social graph (MySQL → Memcached). Key innovations: "leases" to prevent thundering herd and stale sets (a cache token that prevents concurrent writers from overwriting each other), "gutter" pools (a small, dedicated Memcached pool that absorbs traffic when a primary cache server fails — prevents stampede to the DB), and McRouter (a routing layer that handles consistent hashing, replication, and failover). Published in the 2013 NSDI paper "Scaling Memcache at Facebook" — one of the most cited caching papers in industry.',
    },
    {
      name: 'Netflix',
      detail: 'EVCache — their distributed caching system built on Memcached. Runs across multiple AWS availability zones with synchronous writes to all replicas. Key design: reads go to the local AZ replica (low latency), writes replicate to all AZs (consistency). They cache everything: user profiles, viewing history, personalization data, artwork selections. Their blog posts describe caching billions of objects with sub-millisecond read latency. They also heavily use client-side caching in their mobile and TV apps with ETag-based invalidation.',
    },
    {
      name: 'Twitter / X',
      detail: 'Timeline cache is one of the most complex caching systems at scale. They use a fan-out-on-write model: when a user tweets, the tweet ID is pushed into the timeline cache (Redis sorted sets) of every follower. For users with millions of followers (celebrities), they switch to fan-out-on-read to avoid write amplification. The timeline cache stores only tweet IDs; the full tweet objects are in a separate cache. Cache misses trigger a "hydration" pipeline that fetches from multiple services. Their 2012 QCon talk described serving 300K req/s from the timeline cache.',
    },
    {
      name: 'Amazon / DynamoDB DAX',
      detail: 'DynamoDB Accelerator (DAX) is a write-through cache for DynamoDB. Reads hit DAX first; on a miss, DAX fetches from DynamoDB and caches the result. Writes go through DAX to DynamoDB — the cache is always consistent with the table. DAX is item-cache (individual items by key) and query-cache (query results). It\'s a purpose-built caching layer that understands DynamoDB\'s data model, not a generic Redis cache. Latency drops from single-digit milliseconds (DynamoDB) to microseconds (DAX). The tradeoff: DAX costs money per node and doesn\'t support all DynamoDB features (e.g., no strongly consistent reads through DAX).',
    },
    {
      name: 'Stack Overflow',
      detail: 'Runs one of the highest-traffic sites on remarkably few servers. Their caching strategy is central to this. They use Redis as the primary cache layer with a "mini-profiler" (MiniProfiler, which they open-sourced) that shows cache hit/miss data on every page in development. Key insight from their architecture posts: they cache aggressively at the application level but keep the architecture simple — no microservices, no complex invalidation. They use tag-based invalidation: a question\'s cache is invalidated when any answer is posted. Their philosophy: "cache the expensive thing, not everything."',
    },
  ];

  return (
    <div>
      <h2 className="page-section-title">How real systems cache</h2>
      <p className="page-body">Citing specific systems with named technologies and published papers is the strongest staff+ signal. It proves engineering depth, not textbook knowledge.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {systems.map((sys, i) => {
          const ex = expanded === i;
          return (
            <div key={sys.name} style={{ ...styles.card, borderColor: ex ? 'var(--border-strong)' : 'var(--border)' }} onClick={() => setExpanded(ex ? null : i)}>
              <p style={styles.cardName}>
                {sys.name}
                <span style={{ ...styles.chev, transform: ex ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
              </p>
              {ex && <p style={{ fontSize: 13, color: 'var(--text-p)', lineHeight: 1.7, marginTop: 10 }}>{sys.detail}</p>}
            </div>
          );
        })}
      </div>

      <Insight>
        "Facebook's 'leases' solution to thundering herd is worth knowing — when a cache miss happens, the first thread gets a lease token. Other threads that miss the same key see the lease exists and either wait or get a slightly stale value. This prevents N threads from all hitting the database for the same key."
      </Insight>
    </div>
  );
}

function AntiPatternsPanel() {
  const antis = [
    { bad: 'I\'ll add a Redis cache in front of the database.',
      good: 'The product listing endpoint has a 200:1 read/write ratio and tolerates 30 seconds of staleness. I\'d use cache-aside with Redis, keyed by product ID, with a 30s TTL and delete-on-write invalidation.' },
    { bad: 'I\'ll cache everything to make the system faster.',
      good: 'I\'d cache the product catalog (high read ratio, tolerates staleness) but not the inventory count (changes on every purchase, must be accurate for oversell prevention). Caching the wrong data is worse than not caching.' },
    { bad: 'The cache will always be consistent because I update it when I write.',
      good: 'I\'d delete the cache key on write, not update it. If the DB write fails after a cache update, I have data in the cache that doesn\'t exist in the database. Delete is idempotent and always safe — the worst case is one extra cache miss.' },
    { bad: 'If the cache goes down, requests just go to the database.',
      good: 'If Redis goes down and all traffic hits the database directly, the DB will likely fail under the load — it was never sized for that traffic. I\'d use a circuit breaker: when the cache is down, serve degraded responses (stale data from a local cache, or a simpler query) instead of overwhelming the DB.' },
    { bad: 'I\'ll set a long TTL to maximize cache hit ratio.',
      good: 'TTL should match the staleness tolerance of the data consumer, not the cache hit ratio goal. A user seeing their own stale profile for 24 hours is worse than a 5% lower hit ratio. I\'d use 60s for user-facing data, 300s for catalog data, and 5s for the hot local cache.' },
  ];

  return (
    <div>
      <h2 className="page-section-title">What not to say</h2>
      <p className="page-body">These answers reveal that you're adding caching by reflex, not by design. The fix: name the specific data, the staleness tolerance, and the invalidation strategy.</p>

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
        Weak caching answers treat the cache as a transparent performance layer — "just add Redis." Strong answers treat it as a design decision with consistency implications. Every cached value is a copy. Every copy can be stale. Every staleness has a business impact. Name that impact, then choose the TTL, the invalidation strategy, and the failure mode.
      </Insight>
    </div>
  );
}

const styles = {

  card: { background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 18px', cursor: 'pointer', transition: 'all var(--dur) var(--ease)' },
  cardName: { fontSize: 15, fontWeight: 600, color: 'var(--text-h)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  chev: { fontSize: 10, color: 'var(--text-muted)', transition: 'transform var(--dur) var(--ease)' },
  cardTldr: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 },
  detail: { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' },
  row: { display: 'flex', gap: 10, marginBottom: 10, fontSize: 13, lineHeight: 1.6 },
  label: { color: 'var(--text-muted)', minWidth: 90, flexShrink: 0, fontWeight: 500, fontSize: 12 },
  val: { color: 'var(--text-p)' },

  race: { background: 'var(--bg-code)', borderRadius: 'var(--radius-sm)', padding: '14px 16px' },

  anti: { background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 18px', marginBottom: 10 },
  strike: { textDecoration: 'line-through', opacity: 0.5, fontSize: 13, color: 'var(--text-p)', lineHeight: 1.6 },
  better: { fontSize: 13, color: 'var(--text-h)', fontWeight: 500, lineHeight: 1.6 },
  dot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 8, verticalAlign: 'middle' },
};
