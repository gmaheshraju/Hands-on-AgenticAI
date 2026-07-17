import { useState } from 'react';
import TabNav from '../components/TabNav';
import TabTransition from '../components/TabTransition';
import Decision, { Pill } from '../components/Decision';
import Insight from '../components/Insight';

const TABS = ['0 When to scale', '1 Progression', '2 Sharding', '3 CQRS', '4 Real numbers', '5 Anti-patterns'];

export default function Scaling() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <p className="page-eyebrow">Framework 05</p>
      <h1 className="page-title">Scaling Playbook</h1>
      <p className="page-subtitle">
        Scaling is a progression, not a choice. Each step adds complexity and
        solves a specific bottleneck. The key differentiator is knowing when to move
        to the next step — and when it's too early.
      </p>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      <TabTransition activeKey={tab}>

      {tab === 0 && <WhenPanel />}
      {tab === 1 && <ProgressionPanel />}
      {tab === 2 && <ShardingPanel />}
      {tab === 3 && <CqrsPanel />}
      {tab === 4 && <NumbersPanel />}
      {tab === 5 && <AntiPatternsPanel />}
      </TabTransition>
    </div>
  );
}

function WhenPanel() {
  return (
    <div>
      <h2 className="page-section-title">First question: "What's the bottleneck?"</h2>
      <p className="page-body">Scaling without profiling is guessing. Before adding infrastructure, identify whether you're CPU-bound, memory-bound, IO-bound, or network-bound. The solution differs for each.</p>

      <Decision question="CPU-bound — computation is the bottleneck">
        Symptoms: high CPU utilization, slow response times that correlate with CPU usage, requests queuing up on a single core. Solutions: vertical scaling (bigger CPU), horizontal scaling (more instances behind a load balancer), moving computation off the hot path (async processing, precomputation).
      </Decision>
      <Decision question="IO-bound — database or disk is the bottleneck">
        <Pill type="amber">most common</Pill> Symptoms: low CPU but slow responses, high database query times, connection pool exhaustion. This is the most common bottleneck for web applications. Solutions: query optimization first (indexes, query rewriting), then read replicas, then caching, then sharding. Each step is a 10x improvement.
      </Decision>
      <Decision question="Memory-bound — not enough RAM">
        Symptoms: OOM kills, excessive garbage collection, swapping to disk. Solutions: vertical scaling (more RAM), reducing memory footprint (streaming instead of loading entire datasets), or redesigning to process in chunks. Often caused by loading large datasets into memory or unbounded caches.
      </Decision>
      <Decision question="Network-bound — bandwidth or latency">
        Symptoms: transfer times dominate response times, high bandwidth utilization. Solutions: CDN for static content, compression (gzip/brotli), reducing payload size (pagination, field selection), connection pooling, moving services closer to data (same AZ/region).
      </Decision>

      <Insight>
        "Before scaling anything, I'd look at the slow query log and APM traces. In my experience, 80% of scaling problems at this stage are a missing database index or an N+1 query — not an infrastructure problem. Adding a read replica for a problem that an index would fix is expensive and doesn't solve the root cause."
      </Insight>
    </div>
  );
}

function ProgressionPanel() {
  const steps = [
    {
      n: '1',
      title: 'Single server',
      scale: '~1K QPS, <10M rows',
      desc: 'One application server, one database. This handles more than most people think. Basecamp, early Stack Overflow, and many SaaS products serve millions of users from a single well-optimized database. The focus at this stage is code quality, query optimization, and proper indexing — not infrastructure.',
      move: 'Move to step 2 when: database CPU consistently exceeds 60%, read latency exceeds your SLA, or you need fault tolerance (single server = single point of failure).',
    },
    {
      n: '2',
      title: 'Vertical scaling + read replicas',
      scale: '~10K QPS, 10M–500M rows',
      desc: 'Bigger database server (more CPU, RAM, faster SSDs) + one or more read replicas. Route read queries to replicas, write queries to the primary. This is a 10x improvement with minimal code changes. Most web applications are 90%+ reads, so offloading reads to replicas handles the majority of traffic growth. Add a Redis cache for hot data to reduce database load further.',
      move: 'Move to step 3 when: write throughput exceeds what a single primary can handle, or data size exceeds what fits on a single server (typically 1–4TB for Postgres/MySQL with acceptable performance).',
    },
    {
      n: '3',
      title: 'Application-level horizontal scaling',
      scale: '~100K QPS',
      desc: 'Multiple stateless application servers behind a load balancer. Sessions stored in Redis (not on the server). This scales the application layer independently from the database layer. The database is still a single primary with replicas. Most companies live here for years. Combine with CDN for static assets and a distributed cache for query results.',
      move: 'Move to step 4 when: the write load exceeds what a single database primary can handle, even after query optimization and vertical scaling.',
    },
    {
      n: '4',
      title: 'Database sharding',
      scale: '~1M QPS, billions of rows',
      desc: 'Split the database across multiple servers by a partition key. Each shard holds a subset of the data. This is a one-way door — sharding adds permanent complexity (cross-shard queries, rebalancing, application routing logic). Only do this when you\'ve exhausted vertical scaling and read replicas. Common sharding keys: user_id, tenant_id, geographic region.',
      move: 'Move to step 5 when: read and write patterns diverge so much that a single data model can\'t serve both efficiently (e.g., the write model is normalized for ACID, but reads need denormalized views for performance).',
    },
    {
      n: '5',
      title: 'CQRS + event sourcing',
      scale: '10M+ QPS, extreme read/write divergence',
      desc: 'Separate the read model from the write model. Writes go to an event log (Kafka); read-optimized views are materialized from events. Each read view is tailored to its access pattern (search index, graph database, time-series store). This is the most complex architecture and requires significant engineering investment. Used by: LinkedIn, Uber, Netflix at their highest-scale services.',
      move: 'Most systems never need this. If you\'re here, you have a dedicated platform team maintaining the event infrastructure.',
    },
  ];

  return (
    <div>
      <h2 className="page-section-title">The scaling progression</h2>
      <p className="page-body">Each step is a 10x improvement. The key differentiator is knowing which step you're at and when to move — not jumping to step 5 from step 1.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {steps.map(s => (
          <div key={s.n} style={styles.step}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={styles.stepN}>{s.n}</span>
              <div>
                <p style={styles.stepTitle}>{s.title}</p>
                <p style={styles.stepScale}>{s.scale}</p>
              </div>
            </div>
            <p style={styles.stepDesc}>{s.desc}</p>
            {s.move && <p style={styles.stepMove}>{s.move}</p>}
          </div>
        ))}
      </div>

      <Insight>
        "At our current scale of 5K QPS and 50M rows, I'd stay at step 2: a vertically scaled Postgres primary with two read replicas and a Redis cache for hot queries. Sharding would be premature — the operational overhead isn't justified until we're consistently hitting the write ceiling on the primary."
      </Insight>
    </div>
  );
}

function ShardingPanel() {
  return (
    <div>
      <h2 className="page-section-title">Database sharding — the point of no return</h2>
      <p className="page-body">Sharding is a one-way door. Once you shard, cross-shard queries, rebalancing, and schema migrations become permanently harder. Make sure you need it.</p>

      <Decision question="Choosing a shard key">
        <Pill type="red">critical</Pill> The shard key determines which shard holds the data. A bad key creates hot shards (one shard gets all the traffic) or makes common queries impossible (joining across shards). Good keys: user_id (queries are usually scoped to a user), tenant_id (multi-tenant SaaS), geographic region (data locality). Bad keys: created_at (all recent writes go to one shard), random UUIDs (uniform distribution but no query locality).
      </Decision>
      <Decision question="Cross-shard queries">
        Queries that need data from multiple shards (e.g., "top 10 users by activity" across all shards) are expensive — they must fan out to all shards, aggregate results, and merge. Design your shard key so that the most common queries are single-shard. Accept that some queries will be expensive or maintain a separate denormalized view for cross-shard access patterns.
      </Decision>
      <Decision question="Rebalancing">
        When shards grow unevenly or you need to add capacity, you need to move data between shards. This is operationally complex and risky. Strategies: consistent hashing (minimizes data movement when adding nodes — used by DynamoDB, Cassandra), virtual shards (map many virtual shards to fewer physical shards — rebalancing just reassigns virtual shards), or double-write during migration.
      </Decision>
      <Decision question="Application-level vs proxy-level routing">
        Application-level: the application knows the shard key and routes directly. Simpler, more flexible, but sharding logic is in application code. Proxy-level: a proxy (Vitess for MySQL, Citus for Postgres, ProxySQL) handles routing transparently. More infrastructure, but application code doesn't change. Vitess is how YouTube scaled MySQL to billions of rows.
      </Decision>

      <Insight>
        "I'd shard by tenant_id for this multi-tenant SaaS. Every query in the application is already scoped to a tenant, so every query is single-shard. The few admin queries that span all tenants (aggregate dashboards) would read from a separate analytics store that receives CDC events from all shards."
      </Insight>
    </div>
  );
}

function CqrsPanel() {
  return (
    <div>
      <h2 className="page-section-title">CQRS and event sourcing — when the read and write models diverge</h2>
      <p className="page-body">CQRS is not "use two databases." It's a recognition that reads and writes have fundamentally different optimization requirements at extreme scale.</p>

      <Decision question="When CQRS makes sense">
        The write model needs ACID, normalization, and constraints (relational database). The read model needs denormalization, fast aggregations, and full-text search (Elasticsearch, materialized views, Redis). At moderate scale, you can serve both from one database with indexes and views. CQRS becomes necessary when the read and write patterns can't be served by the same data model without unacceptable tradeoffs.
      </Decision>
      <Decision question="Event sourcing — storing events, not state">
        Instead of storing the current state ("balance = $150"), store the events that produced it ("deposited $200, withdrew $50"). The current state is derived by replaying events. Pros: complete audit trail, ability to rebuild any view from events, temporal queries ("what was the balance at 3pm?"). Cons: event schema evolution is hard, rebuilding state from millions of events is slow without snapshots, eventual consistency between the event log and read views.
      </Decision>
      <Decision question="The eventual consistency tradeoff">
        <Pill type="amber">key tradeoff</Pill> In CQRS, the read model is updated asynchronously from events. There's a delay between a write and when it appears in the read model (typically milliseconds to seconds). For most read paths, this is acceptable. For the "read-your-own-write" case (user updates profile, immediately sees old version), you need a workaround: read from the write model for the current user's own data, or update the read model synchronously for the writing user.
      </Decision>
      <Decision question="When NOT to use CQRS">
        Simple CRUD applications. Applications where reads and writes have similar patterns. Small teams (CQRS adds significant operational complexity). "We might need it later" is not a valid reason — CQRS is extremely hard to bolt on later, but premature CQRS is worse than premature optimization. Start with a single database and extract CQRS for specific bounded contexts when proven necessary.
      </Decision>

      <Insight>
        "I'd use CQRS only for the search and analytics paths. The write path stays as a normalized Postgres database — simple, ACID, well-understood. The search service consumes CDC events from Postgres (via Debezium) and builds an Elasticsearch index. The analytics service materializes aggregations into a columnar store. The core transactional path stays simple."
      </Insight>
    </div>
  );
}

function NumbersPanel() {
  return (
    <div>
      <h2 className="page-section-title">Numbers every system designer should know</h2>
      <p className="page-body">Citing specific throughput numbers — even as order-of-magnitude estimates — shows that you think in concrete terms, not abstractions. These are approximate and vary by configuration.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { label: 'Postgres (single node)', val: '~10K-50K QPS reads, ~5K-20K QPS writes', note: 'With proper indexes, connection pooling (PgBouncer), and SSD storage' },
          { label: 'Redis (single node)', val: '~100K-500K ops/sec', note: 'In-memory, single-threaded. Pipeline batching can push higher.' },
          { label: 'Kafka (cluster)', val: '~1M-10M messages/sec', note: 'Per cluster. LinkedIn does 7 trillion msgs/day across clusters.' },
          { label: 'SQS Standard', val: '~unlimited throughput', note: 'AWS manages scaling. FIFO limited to 300 msg/s (3K batched).' },
          { label: 'Nginx / Load Balancer', val: '~50K-100K concurrent connections', note: 'Event-driven, non-blocking. The LB is rarely the bottleneck.' },
          { label: 'Single app server (Node.js)', val: '~5K-15K req/sec', note: 'CPU-bound workloads lower. IO-bound workloads higher with async.' },
          { label: 'CDN edge', val: '~100K+ req/sec per PoP', note: 'Cloudflare handles 50M+ req/sec globally across all PoPs.' },
          { label: 'Network RTT (same AZ)', val: '~0.5-1ms', note: 'Cross-AZ: 1-2ms. Cross-region: 50-200ms. This matters for every hop.' },
        ].map(item => (
          <div key={item.label} style={styles.numCard}>
            <p style={styles.numLabel}>{item.label}</p>
            <p style={styles.numVal}>{item.val}</p>
            <p style={styles.numNote}>{item.note}</p>
          </div>
        ))}
      </div>

      <Insight>
        "When someone says '1 million users,' I immediately translate that to QPS. 1M users ≠ 1M QPS. If 10% are daily active, that's 100K DAU. If each does 20 actions per day, that's 2M actions/day ≈ 23 QPS average. Even with a 10x peak-to-average ratio, that's 230 QPS peak — a single Postgres instance handles that trivially."
      </Insight>
    </div>
  );
}

function AntiPatternsPanel() {
  const antis = [
    { bad: 'We\'ll need microservices to scale.',
      good: 'Microservices solve organizational scaling (independent teams), not necessarily traffic scaling. A well-architected monolith with horizontal scaling handles most traffic levels. I\'d decompose into services only at the team/domain boundary, not for performance.' },
    { bad: 'Let\'s shard the database now so we\'re ready for growth.',
      good: 'Sharding is a one-way door that makes every operation more complex. At our current 10K QPS, a single Postgres primary with read replicas handles it. I\'d shard when we\'re consistently at 70% of the primary\'s write capacity — not before.' },
    { bad: '1 million users means we need massive infrastructure.',
      good: '1M registered users with 10% DAU, 20 actions/day = ~23 QPS average, ~230 QPS peak. A single server handles this. I\'d focus on query optimization and monitoring, not infrastructure, until we see concrete bottlenecks in metrics.' },
    { bad: 'We need to design for 10x growth from day one.',
      good: 'I\'d design for the current load with a clear path to the next 10x. The path is: add indexes → add read replicas → add caching → shard. Each step buys 10x headroom. I\'d take step 1 now and monitor for when step 2 is needed.' },
    { bad: 'Let\'s add a cache, a queue, and a search engine to the architecture.',
      good: 'Each additional system is a new failure mode, consistency challenge, and operational burden. I\'d add them one at a time, only when a specific bottleneck demands it, and prove the bottleneck exists in metrics before adding infrastructure.' },
  ];

  return (
    <div>
      <h2 className="page-section-title">What not to say</h2>
      <p className="page-body">Over-engineering is the most common failure mode in system design. What separates senior engineers is proportional responses, not maximum complexity.</p>

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
        The strongest engineering stance starts with "at this scale, we don't need that yet." It shows engineering judgment — you know the tools exist and you know they're not needed. Complexity is a cost, not a feature. The best architecture is the simplest one that meets the requirements with headroom for the next 10x, not the next 1000x.
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

  step: { background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)', padding: '18px 20px' },
  stepN: { fontSize: 14, fontWeight: 700, color: 'var(--text-accent)', background: 'var(--bg-accent)', borderRadius: 'var(--radius-full)', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text-h)', margin: 0 },
  stepScale: { fontSize: 12, color: 'var(--text-muted)', margin: 0 },
  stepDesc: { fontSize: 13, color: 'var(--text-p)', lineHeight: 1.7, marginBottom: 8 },
  stepMove: { fontSize: 12, color: 'var(--text-accent)', lineHeight: 1.6, fontStyle: 'italic' },

  numCard: { background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' },
  numLabel: { fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 4 },
  numVal: { fontSize: 14, fontWeight: 600, color: 'var(--text-h)', marginBottom: 4, lineHeight: 1.3 },
  numNote: { fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 },

  anti: { background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 18px', marginBottom: 10 },
  strike: { textDecoration: 'line-through', opacity: 0.5, fontSize: 13, color: 'var(--text-p)', lineHeight: 1.6 },
  better: { fontSize: 13, color: 'var(--text-h)', fontWeight: 500, lineHeight: 1.6 },
  dot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 8, verticalAlign: 'middle' },
};
