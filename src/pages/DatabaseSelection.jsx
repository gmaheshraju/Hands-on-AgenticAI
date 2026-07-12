import { useState } from 'react';
import TabNav from '../components/TabNav';
import TabTransition from '../components/TabTransition';
import Decision, { Pill } from '../components/Decision';
import Insight from '../components/Insight';

const TABS = ['0 Scale', '1 Access', '2 Joins', '3 Consistency', '4 Writes', '5 Profiles', '6 Anti-patterns', '7 Design Problem'];

const DBS = [
  { name: 'Postgres', tldr: 'Transactions, joins, correctness. The default until proven otherwise.',
    shines: 'ACID transactions, complex queries, strong consistency, PostGIS, full-text search (GIN), JSONB for semi-structured data',
    breaks: 'Write-heavy at extreme scale (>50K TPS), horizontal sharding is manual and painful (Citus helps), vacuum overhead on update-heavy tables',
    ops: 'Low. Mature tooling, well-understood. RDS/Aurora reduce most operational burden.',
    take: 'Start here. Move data out only when you hit a specific bottleneck you can name.' },
  { name: 'DynamoDB', tldr: 'Predictable latency at any scale — if you know your access patterns cold.',
    shines: 'Single-digit ms at any scale, auto-scaling, zero ops overhead, partition + sort key access patterns',
    breaks: 'Ad-hoc queries, joins, transactions across partitions, hot partitions, changing access patterns after launch',
    ops: 'Very low infra ops. Very high design-time cost — data modeling mistakes are expensive to fix.',
    take: 'DynamoDB punishes you for not knowing your queries upfront. Only use it when access patterns are stable and you need guaranteed latency.' },
  { name: 'MongoDB', tldr: 'Document-shaped access with flexible schema — not a relational escape hatch.',
    shines: 'Self-contained documents fetched by ID, rapid schema iteration, embedded arrays/objects that avoid joins',
    breaks: 'Cross-document joins (doing them in app code is an anti-pattern at scale), unbounded array growth, weak transactional guarantees',
    ops: 'Medium. Atlas reduces ops, but schema evolution and data modeling mistakes compound silently.',
    take: 'MongoDB works when the document IS the query result. If you\'re ever joining across collections in application code, you picked the wrong store.' },
  { name: 'Redis', tldr: 'Sub-ms reads — cache, counters, sessions, rate limiting. Not your source of truth.',
    shines: 'Cache, session store, rate limiting (INCR + TTL), leaderboards (sorted sets), pub/sub, queues (streams)',
    breaks: 'As primary source of truth — AOF/RDB persistence is not the same as durability. Memory cost scales linearly.',
    ops: 'Low for cache use. High if you\'re relying on persistence — you now own failover, backup, and memory management.',
    take: 'Redis is a performance layer, not a storage layer. Every key in Redis should have a source-of-truth backing it somewhere else.' },
  { name: 'Cassandra', tldr: 'Write-heavy, time-ordered, globally distributed — with significant operational cost.',
    shines: 'Append-heavy writes, time-series by partition key + clustering key, multi-region replication, linear horizontal scaling',
    breaks: 'Reads across partitions, ad-hoc queries, lightweight transactions are limited, tombstone management, compaction storms',
    ops: 'High. JVM tuning, compaction strategy, repair cycles, tombstone cleanup. This is a team-level decision.',
    take: 'Cassandra\'s operational cost is real. Only reach for it when you need write throughput and availability that Postgres replicas can\'t serve — and you have the team to run it.' },
  { name: 'Elasticsearch', tldr: 'Search, ranking, and analytics on text — always backed by a primary store.',
    shines: 'Full-text search with relevance ranking, log aggregation, faceted search, autocomplete, analytics on semi-structured data',
    breaks: 'As source of truth — eventual consistency, split-brain risk, no transactions. Index corruption requires full reindex.',
    ops: 'High. Cluster management, shard rebalancing, mapping explosions, heap tuning.',
    take: 'ES is a search index, not a database. Always have a pipeline that rebuilds the index from the source of truth. If the index dies, you rebuild — you don\'t restore from backup.' },
];

const ANTIS = [
  { bad: 'I\'ll use DynamoDB because it scales.', good: 'At this scale, Postgres handles it. If we grow past [specific threshold], I\'d migrate the [specific table] to DynamoDB because [specific access pattern].' },
  { bad: 'I\'ll use MongoDB because the schema is flexible.', good: 'The user profile is a natural document — self-contained, fetched by ID, rarely joined. MongoDB fits here. The order-to-inventory relationship needs joins, so that stays relational.' },
  { bad: 'I\'ll add Redis for caching.', good: 'The read-to-write ratio here is ~500:1 with a 95th percentile latency budget of 50ms. I\'d cache the [specific query] in Redis with a TTL of [duration] and invalidate on [specific write event].' },
  { bad: 'We need strong consistency for everything.', good: 'The payment ledger needs serializable isolation. The user\'s order history can tolerate 5 seconds of staleness — I\'d serve it from a read replica.' },
  { bad: 'Let\'s use a microservice per entity with its own database.', good: 'I\'d start with a single Postgres instance. If we later need to split, the [specific bounded context] is the natural seam — it has no joins to the rest.' },
];

export default function DatabaseSelection() {
  const [tab, setTab] = useState(0);
  const [expandedDb, setExpandedDb] = useState(null);

  return (
    <div className="page-content">
      <p className="page-eyebrow">Framework 01</p>
      <h1 className="page-title">Database Selection</h1>
      <p className="page-subtitle">
        The 6-question decision tree that signals staff+ thinking. Start from the
        top — each question narrows the field before you ever name a technology.
      </p>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      <TabTransition activeKey={tab}>

      {tab === 0 && <ScalePanel />}
      {tab === 1 && <AccessPanel />}
      {tab === 2 && <JoinsPanel />}
      {tab === 3 && <ConsistencyPanel />}
      {tab === 4 && <WritesPanel />}
      {tab === 5 && <ProfilesPanel expandedDb={expandedDb} setExpandedDb={setExpandedDb} />}
      {tab === 6 && <AntiPatternsPanel />}
      {tab === 7 && <DesignProblemPanel />}
      </TabTransition>
    </div>
  );
}

function ScalePanel() {
  return (
    <div>
      <h2 className="page-section-title">Calibrate scale before choosing</h2>
      <p className="page-body">Most candidates jump to DynamoDB or Cassandra for problems that Postgres handles trivially. Naming a distributed system for a small-scale problem signals inexperience.</p>
      <Decision question="How much data? How many QPS?">
        <Pill type="green">small</Pill> Under 10M rows, under 1K QPS — single Postgres handles everything. The database choice barely matters. Say this out loud.
      </Decision>
      <Decision question="10M–1B rows, 1K–100K QPS?">
        <Pill type="amber">medium</Pill> Postgres with read replicas + Redis cache covers most cases. Shard only if you can identify the partition key clearly.
      </Decision>
      <Decision question="Beyond 1B rows or 100K+ QPS?">
        <Pill type="red">large</Pill> Now the database choice is load-bearing. DynamoDB, Cassandra, or purpose-built stores earn their complexity. Justify the operational cost.
      </Decision>
      <Insight>"At this scale, Postgres with proper indexing and a read replica handles it. I'd only reach for DynamoDB if we're looking at 100K+ QPS with a clear partition key — the operational overhead isn't free."</Insight>
    </div>
  );
}

function AccessPanel() {
  return (
    <div>
      <h2 className="page-section-title">Start with the query, not the store</h2>
      <p className="page-body">The access pattern determines the engine. Name the query shape first, then the technology that serves it.</p>
      <Decision question="Point lookup by ID?">Any engine with a primary key index. At small scale, Postgres. At massive scale with single-digit-ms latency, DynamoDB or Redis.</Decision>
      <Decision question="Range query by time?">Postgres B-tree index, DynamoDB sort key, Cassandra clustering key, or purpose-built time-series (TimescaleDB, InfluxDB) at scale.</Decision>
      <Decision question="Full-text or relevance-ranked search?">Elasticsearch / OpenSearch with an inverted index. Postgres GIN + tsvector works for simpler cases — mention both.</Decision>
      <Decision question="Location / proximity search?">PostGIS, geospatial indexes, or a dedicated geospatial service. Mention the query shape: "find all within radius" vs. "nearest K."</Decision>
      <Decision question="Large blobs — files, images, video?">Object storage (S3). Store the metadata pointer in your primary DB. Never store blobs in your transactional database.</Decision>
      <Decision question="Graph traversal — friends-of-friends, recommendations?">Neo4j or a graph layer. Recursive SQL joins degrade past 2–3 hops. Mention when relational is good enough and when it breaks.</Decision>
      <Insight>"Real systems are polyglot — Uber uses Postgres + Redis + Kafka + S3 + Elasticsearch together. The question isn't which DB. It's which store for which access pattern."</Insight>
    </div>
  );
}

function JoinsPanel() {
  return (
    <div>
      <h2 className="page-section-title">The join question</h2>
      <p className="page-body">This is the single biggest fork in the decision tree that most candidates miss. It separates relational from document/KV thinking.</p>
      <Decision question="Do you need joins across entities?">Strong signal toward relational (Postgres, MySQL). Joins in application code at scale is a well-known anti-pattern — it multiplies latency and breaks under load.</Decision>
      <Decision question="Is each entity self-contained?">If "fetch one document by ID" gives you everything you need (user profile, product listing), document stores (MongoDB, DynamoDB) work naturally.</Decision>
      <Decision question="Mixed — some joins, some self-contained?">Use relational for the core transactional model. Denormalize into a document store or cache for the read-heavy, self-contained access patterns.</Decision>
      <Insight>"MongoDB is great when each document is the complete unit of access. It falls apart when you start needing cross-document queries that look like joins — that's when you're fighting the engine instead of using it."</Insight>
    </div>
  );
}

function ConsistencyPanel() {
  return (
    <div>
      <h2 className="page-section-title">Consistency — what breaks if data is stale?</h2>
      <p className="page-body">Don't cite the CAP theorem abstractly. Ground it in business impact — that's what separates theory from engineering judgment.</p>
      <Decision question='"What happens if this data is stale for 5 seconds?"'>This one question replaces the CAP theorem slide. Ask it for every entity in your design.</Decision>
      <Decision question="Nothing serious — profile photo, feed ranking">Eventual consistency. Optimize for availability and horizontal scale. Caches, read replicas, async replication.</Decision>
      <Decision question="Money, trust, or legal — balance, payment, inventory">Strong consistency. Single-leader writes, synchronous replication, or serializable isolation. Mention the latency tradeoff you're accepting.</Decision>
      <Decision question="Correctness with recovery — payment status, order state">You need idempotency + reconciliation, not just strong consistency. Mention idempotency keys, exactly-once delivery patterns, and async reconciliation jobs.</Decision>
      <Insight>"For the payment ledger, I'd use Postgres with serializable isolation on the write path. For the user's order history view, I'd read from a denormalized replica with eventual consistency — stale-by-seconds is fine there. Same data, two consistency models, chosen per access pattern."</Insight>
    </div>
  );
}

function WritesPanel() {
  return (
    <div>
      <h2 className="page-section-title">Write patterns — where most designs silently break</h2>
      <p className="page-body">Candidates obsess over reads. Staff engineers know that bad write patterns cause outages. Name the write shape before the read shape.</p>
      <Decision question="Append-only — logs, events, analytics">LSM-based stores (Cassandra, RocksDB), Kafka for streaming, S3 for cold storage. Append-only is the easiest write pattern to scale.</Decision>
      <Decision question="Frequent updates to the same row — counters, status">Hot rows cause lock contention. Solutions: write-behind with Redis, sharded counters, or CRDT-based merging. Name the specific contention risk.</Decision>
      <Decision question="High write fan-out — social feeds, notifications">Fan-out-on-write vs fan-out-on-read is a design decision, not a database decision. Name the tradeoff: write amplification vs read latency.</Decision>
      <Decision question="Multi-entity transactions — transfers, bookings">Relational DB is the safer first choice. Distributed transactions (2PC, Saga) add complexity — only reach for them when entities must live in different stores.</Decision>
      <Decision question="Read/write ratio">1000:1 read-heavy (timeline) → optimize reads with caching + denormalization. 1:1 balanced (chat) → optimize for write throughput. 1:100 write-heavy (IoT) → append-only stores.</Decision>
      <Insight>"The counter update is a hot-row problem. I'd buffer writes in Redis with periodic flush to Postgres, accepting eventual consistency on the displayed count. The alternative — sharded counters in the DB — works but adds read-time aggregation cost."</Insight>
    </div>
  );
}

function ProfilesPanel({ expandedDb, setExpandedDb }) {
  return (
    <div>
      <h2 className="page-section-title">Database profiles</h2>
      <p className="page-body">Click any card to see the staff-level nuance — when it shines, when it breaks, and the operational cost most candidates ignore.</p>
      <div style={styles.dbGrid}>
        {DBS.map((db, i) => {
          const ex = expandedDb === i;
          return (
            <div
              key={db.name}
              style={{
                ...styles.dbCard,
                gridColumn: ex ? '1 / -1' : 'auto',
                borderColor: ex ? 'var(--border-strong)' : 'var(--border)',
              }}
              onClick={() => setExpandedDb(ex ? null : i)}
            >
              <p style={styles.dbName}>
                {db.name}
                <span style={{ ...styles.dbChev, transform: ex ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
              </p>
              <p style={styles.dbTldr}>{db.tldr}</p>
              {ex && (
                <div style={styles.dbDetail}>
                  {[['Shines', db.shines], ['Breaks', db.breaks], ['Ops cost', db.ops], ['Staff take', db.take]].map(([label, val]) => (
                    <div key={label} style={styles.dbRow}>
                      <span style={styles.dbLabel}>{label}</span>
                      <span style={styles.dbVal}>{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AntiPatternsPanel() {
  return (
    <div>
      <h2 className="page-section-title">What not to say in a staff+ interview</h2>
      <p className="page-body">These are the answers that get you passed over. The fix isn't more knowledge — it's showing engineering judgment.</p>
      {ANTIS.map((ap, i) => (
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
        Every weak answer shares the same structure: technology name without a specific reason. Every strong answer names the query shape, the scale, the consistency requirement, or the operational tradeoff. The database is the last word in the sentence, never the first.
      </Insight>
    </div>
  );
}

function AwsIcon({ x, y, color, label, sublabel }) {
  return (
    <g>
      <rect x={x} y={y} width="90" height="52" rx="8" fill={color} opacity="0.08" stroke={color} strokeWidth="1.2" />
      <rect x={x + 6} y={y + 6} width="16" height="16" rx="3" fill={color} opacity="0.9" />
      <text x={x + 45} y={y + 22} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-h)" fontFamily="var(--font-body)">{label}</text>
      {sublabel && <text x={x + 45} y={y + 38} textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily="var(--font-mono)">{sublabel}</text>}
    </g>
  );
}

function UrlShortenerDiagram() {
  const f = 'var(--font-body)';
  const fm = 'var(--font-mono)';

  return (
    <div style={{ overflowX: 'auto', margin: '20px 0' }}>
      <svg viewBox="0 0 720 420" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', display: 'block' }}>
        <defs>
          <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="var(--text-muted)" opacity="0.7" />
          </marker>
          <marker id="ahAccent" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="var(--text-accent)" opacity="0.8" />
          </marker>
        </defs>

        {/* Background zones */}
        <rect x="0" y="44" width="720" height="80" rx="0" fill="var(--bg-code)" opacity="0.3" />
        <rect x="0" y="138" width="720" height="120" rx="0" fill="var(--bg-card)" opacity="0.15" />
        <rect x="0" y="272" width="720" height="90" rx="0" fill="var(--bg-code)" opacity="0.3" />

        {/* Lane labels */}
        <text x="12" y="62" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.1em">EDGE</text>
        <text x="12" y="158" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.1em">COMPUTE</text>
        <text x="12" y="292" fontSize="9" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.1em">DATA</text>

        {/* Title bar */}
        <text x="360" y="20" textAnchor="middle" fontSize="14" fontWeight="400" fill="var(--text-h)" fontFamily="var(--font-display)">URL Shortener Architecture</text>
        <text x="360" y="36" textAnchor="middle" fontSize="9" fill="var(--text-muted)" fontFamily={fm}>100M URLs &middot; 10K reads/s &middot; 500 writes/s &middot; sub-100ms p99</text>

        {/* ── EDGE LANE ── */}
        {/* Users */}
        <g>
          <circle cx="80" cy="84" r="18" fill="none" stroke="var(--border-strong)" strokeWidth="1.2" />
          <circle cx="80" cy="78" r="5" fill="var(--text-muted)" opacity="0.5" />
          <path d="M72 90 Q80 85 88 90" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" opacity="0.5" />
          <text x="80" y="110" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Users</text>
        </g>

        {/* Route 53 */}
        <AwsIcon x={140} y={60} color="#8C4FFF" label="Route 53" sublabel="DNS" />
        {/* CloudFront */}
        <AwsIcon x={280} y={60} color="#8C4FFF" label="CloudFront" sublabel="CDN cache" />

        {/* Edge arrows */}
        <line x1="98" y1="84" x2="138" y2="84" stroke="var(--text-muted)" strokeWidth="1.2" markerEnd="url(#ah)" fill="none" />
        <line x1="232" y1="86" x2="278" y2="86" stroke="var(--text-muted)" strokeWidth="1.2" markerEnd="url(#ah)" fill="none" />

        {/* ── COMPUTE LANE ── */}
        {/* API Gateway */}
        <AwsIcon x={140} y={158} color="#E7157B" label="API Gateway" sublabel="REST" />

        {/* Lambda Write */}
        <AwsIcon x={290} y={145} color="#ED7100" label="Lambda" sublabel="POST /shorten" />
        {/* Lambda Read */}
        <AwsIcon x={290} y={208} color="#ED7100" label="Lambda" sublabel="GET /:code" />

        {/* CF → API GW (orthogonal) */}
        <polyline points="325,114 325,130 185,130 185,156" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#ah)" />
        <text x="255" y="128" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>origin</text>

        {/* API GW → Lambda Write */}
        <line x1="232" y1="175" x2="288" y2="170" stroke="var(--text-muted)" strokeWidth="1.2" markerEnd="url(#ah)" fill="none" />
        {/* API GW → Lambda Read */}
        <line x1="232" y1="195" x2="288" y2="225" stroke="var(--text-muted)" strokeWidth="1.2" markerEnd="url(#ah)" fill="none" />

        {/* ── DATA LANE ── */}
        {/* ElastiCache */}
        <AwsIcon x={460} y={148} color="#C925D1" label="ElastiCache" sublabel="Redis" />
        {/* DynamoDB */}
        <AwsIcon x={460} y={286} color="#3949AB" label="DynamoDB" sublabel="PK: short_code" />

        {/* Lambda Read → Redis (primary read path) */}
        <line x1="382" y1="230" x2="458" y2="180" stroke="var(--text-accent)" strokeWidth="1.5" markerEnd="url(#ahAccent)" fill="none" />
        <text x="408" y="198" fontSize="8" fontWeight="600" fill="var(--text-accent)" fontFamily={fm}>cache hit?</text>

        {/* Redis → DynamoDB (cache miss, orthogonal) */}
        <polyline points="505,202 505,284" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 3" fill="none" markerEnd="url(#ah)" />
        <text x="515" y="248" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>miss</text>

        {/* Lambda Write → DynamoDB (orthogonal) */}
        <polyline points="382,170 430,170 430,310 458,310" stroke="var(--text-muted)" strokeWidth="1.2" fill="none" markerEnd="url(#ah)" />
        <text x="438" y="248" fontSize="7" fill="var(--text-muted)" fontFamily={fm} textAnchor="end">write</text>

        {/* ── SUPPORTING column ── */}
        <text x="620" y="155" fontSize="8" fontWeight="700" fill="var(--text-muted)" fontFamily={fm} letterSpacing="0.08em">OPS</text>

        <g>
          <rect x="600" y={164} width="80" height="38" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
          <text x="640" y="180" textAnchor="middle" fontSize="9" fontWeight="500" fill="var(--text-h)" fontFamily={f}>CloudWatch</text>
          <text x="640" y="194" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>metrics</text>
        </g>
        <g>
          <rect x="600" y={212} width="80" height="38" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
          <text x="640" y="228" textAnchor="middle" fontSize="9" fontWeight="500" fill="var(--text-h)" fontFamily={f}>S3</text>
          <text x="640" y="242" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={fm}>analytics</text>
        </g>

        {/* Supporting dashed lines */}
        <line x1="382" y1="165" x2="598" y2="180" stroke="var(--border-strong)" strokeWidth="0.8" strokeDasharray="3 3" fill="none" />
        <line x1="382" y1="235" x2="598" y2="228" stroke="var(--border-strong)" strokeWidth="0.8" strokeDasharray="3 3" fill="none" />

        {/* ── Throughput annotations ── */}
        <g>
          <rect x="18" y="376" width="684" height="36" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.6" />
          <text x="30" y="394" fontSize="8" fontWeight="700" fill="var(--text-accent)" fontFamily={fm}>KEY DECISIONS</text>
          <text x="148" y="394" fontSize="8" fill="var(--text-p)" fontFamily={f}>DynamoDB: pure KV, zero ops</text>
          <text x="310" y="394" fontSize="8" fill="var(--text-muted)" fontFamily={f}>&middot;</text>
          <text x="322" y="394" fontSize="8" fill="var(--text-p)" fontFamily={f}>Redis: Zipf law, 80% cache hit</text>
          <text x="486" y="394" fontSize="8" fill="var(--text-muted)" fontFamily={f}>&middot;</text>
          <text x="498" y="394" fontSize="8" fill="var(--text-p)" fontFamily={f}>CloudFront: 301 at edge, 60% offload</text>
        </g>
      </svg>
    </div>
  );
}

function DesignProblemPanel() {
  return (
    <div>
      <h2 className="page-section-title">Design Problem: URL Shortener</h2>
      <p className="page-body">
        Classic system design question. The database decision here is the core of the
        architecture — everything else follows from it. Walk through the 6-question
        framework to arrive at the answer.
      </p>

      <div style={{ background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 18px', marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)', marginBottom: 6 }}>Requirements</p>
        <ul style={{ fontSize: 12, color: 'var(--text-p)', lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
          <li>Generate short URLs (7-char base62 = 3.5 trillion combinations)</li>
          <li>Redirect short URL → original URL with 301/302</li>
          <li>100M URLs stored, 10K reads/sec, 500 writes/sec</li>
          <li>99.9% availability, sub-100ms redirect latency</li>
          <li>Analytics: click count per URL (async, not on hot path)</li>
        </ul>
      </div>

      <UrlShortenerDiagram />

      <Decision question="Why DynamoDB over Postgres?">
        At 100M rows and 10K QPS, Postgres handles it. But the access pattern is pure key-value — partition key lookup, no joins, no transactions, no complex queries. DynamoDB gives single-digit ms latency with zero operational overhead (no vacuum, no connection pooling, no replica lag). The data model is one table with one access pattern — this is DynamoDB's sweet spot.
      </Decision>

      <Decision question="Why Redis in front?">
        <Pill type="amber">20:1 read/write ratio</Pill>
        URL access follows a Zipf distribution — the top 20% of URLs serve 80% of traffic. Caching hot URLs in Redis drops DynamoDB reads from 10K/sec to ~2K/sec (80% cache hit rate), reducing cost and latency. TTL of 24h, cache-aside pattern. Redis is the performance layer, DynamoDB is the truth.
      </Decision>

      <Decision question="Why CloudFront?">
        A 301 redirect is cacheable. CloudFront caches the redirect response at 400+ edge locations globally, meaning most redirects never hit Lambda at all. This drops the effective Lambda invocations by 60-70% for popular URLs, reduces latency to single-digit ms at the edge, and cuts compute costs.
      </Decision>

      <Decision question="What about the short code generation?">
        Counter-based (auto-increment) is simple but creates a single point of serialization. For 500 writes/sec, pre-generate batches of short codes — a Lambda generates 10K codes ahead of time, stores them in a "codes" table, and the write Lambda pops one atomically (DynamoDB conditional write). No collisions, no coordination, horizontally scalable.
      </Decision>

      <Insight>
        "I'd start with DynamoDB for the URL mappings — the access pattern is pure key-value lookup by short code, no joins, eventual consistency is fine since URLs don't change after creation. I'd put ElastiCache in front because URL access follows Zipf — the top 20% of URLs will serve 80% of reads. And CloudFront caches the 301 redirects at the edge, so popular URLs resolve in single-digit milliseconds without hitting compute at all. The total DynamoDB cost at 100M items with 2K effective reads/sec after caching is about $50/month."
      </Insight>
    </div>
  );
}

const styles = {

  dbGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 },
  dbCard: { background: 'var(--bg-card)', border: '1px solid', borderRadius: 'var(--radius-md)', padding: '16px 18px', cursor: 'pointer', transition: 'all var(--dur) var(--ease)' },
  dbName: { fontSize: 15, fontWeight: 600, color: 'var(--text-h)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  dbChev: { fontSize: 10, color: 'var(--text-muted)', transition: 'transform var(--dur) var(--ease)' },
  dbTldr: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 },
  dbDetail: { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' },
  dbRow: { display: 'flex', gap: 10, marginBottom: 8, fontSize: 13, lineHeight: 1.6 },
  dbLabel: { color: 'var(--text-muted)', minWidth: 72, flexShrink: 0, fontWeight: 500, fontSize: 12 },
  dbVal: { color: 'var(--text-p)' },

  anti: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 18px', marginBottom: 10 },
  strike: { textDecoration: 'line-through', opacity: 0.5, fontSize: 13, color: 'var(--text-p)', lineHeight: 1.6 },
  better: { fontSize: 13, color: 'var(--text-h)', fontWeight: 500, lineHeight: 1.6 },
  dot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 8, verticalAlign: 'middle' },
};
