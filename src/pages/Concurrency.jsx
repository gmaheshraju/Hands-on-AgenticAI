import { useState } from 'react';
import TabNav from '../components/TabNav';
import TabTransition from '../components/TabTransition';
import Decision, { Pill } from '../components/Decision';
import Insight from '../components/Insight';

const TABS = ['Concurrency Control', 'Connection Pools', 'Performance Patterns', 'Load Testing', 'Anti-patterns'];

export default function Concurrency() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <p className="page-eyebrow">Framework 13</p>
      <h1 className="page-title">Concurrency & Performance</h1>
      <p className="page-subtitle">
        Performance work without concurrency control is just faster bugs.
        The hard problems aren't making things fast — they're making things
        correct under contention, predictable under load, and debuggable
        when neither holds. Every lock you don't take is a race condition
        you'll find in production.
      </p>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      <TabTransition activeKey={tab}>

      {tab === 0 && <ConcurrencyControlPanel />}
      {tab === 1 && <ConnectionPoolsPanel />}
      {tab === 2 && <PerformancePatternsPanel />}
      {tab === 3 && <LoadTestingPanel />}
      {tab === 4 && <AntiPatternsPanel />}
      </TabTransition>
    </div>
  );
}

/* ─── Tab 0: Concurrency Control ─── */

function ConcurrencyControlPanel() {
  return (
    <div>
      <h2 className="page-section-title">Choosing the right concurrency primitive</h2>
      <p className="page-body">
        The first question is always: can you avoid coordination entirely?
        Partition data so writers never overlap. If you can't partition, pick
        the weakest lock that preserves correctness — optimistic beats
        pessimistic in almost every web workload because contention is low
        and retries are cheap.
      </p>

      <Decision question="Optimistic vs pessimistic locking — when does each win?">
        <Pill type="green">optimistic</Pill> Use when contention is low (most web apps).
        Read the row with a version number, do your work, write back with
        WHERE version = N. If another writer incremented the version, your
        write returns 0 rows affected — retry. Cost of a conflict is one
        extra read. Cost of no conflict is zero lock overhead.{' '}
        <Pill type="amber">pessimistic</Pill> Use when contention is high
        or the cost of a failed attempt is expensive (payment processing,
        inventory decrements on flash sales). SELECT FOR UPDATE acquires a
        row-level lock — no other transaction can modify the row until you
        commit. The danger: long transactions hold locks and create queuing.
        Rule of thumb: if retries are cheap and conflicts rare, go optimistic.
        If conflicts are frequent or retries are expensive, go pessimistic.
      </Decision>

      <Decision question="Database-level locks: SELECT FOR UPDATE vs advisory locks">
        SELECT FOR UPDATE locks specific rows within a transaction — it's
        scoped and automatic. Use it for "claim this job" or "decrement this
        inventory." Advisory locks (pg_advisory_lock in Postgres) are
        application-defined: you lock on an arbitrary bigint key, and the
        database doesn't tie it to any row. Use advisory locks for
        cross-table coordination — "only one process should run this
        migration" or "only one worker should process orders for customer X."
        Advisory locks survive transaction boundaries (session-level) unless
        you explicitly use pg_advisory_xact_lock (transaction-level). Prefer
        transaction-level to avoid lock leaks on crashed processes.
      </Decision>

      <Decision question="Distributed locks: Redis SETNX + TTL and the Redlock debate">
        <Pill type="red">critical</Pill> Single-node Redis lock: SET key value NX PX 30000.
        Simple, fast, good enough when the lock protects "nice to have"
        exclusivity (deduplication, rate limiting). But Redis is AP, not CP —
        if the primary fails before replicating the key, two clients hold the
        lock. Redlock (lock on N/2+1 independent Redis nodes) tries to solve
        this but Martin Kleppmann's analysis showed it's fundamentally unsafe
        under clock drift and GC pauses. For true distributed mutual
        exclusion, use a CP system: ZooKeeper (ephemeral znodes with session
        semantics), etcd (lease-based locks with linearizable reads), or
        Consul (session-based). The real answer: if correctness matters, don't
        use Redis. If availability matters more than strict exclusion, Redis
        SETNX is fine.
      </Decision>

      <Decision question="Fencing tokens — why locks alone aren't enough">
        A lock with a TTL can expire while the holder is still working (GC
        pause, slow network). Now two processes think they hold the lock.
        Fencing tokens solve this: each lock acquisition returns a
        monotonically increasing token. The downstream resource (database,
        storage) rejects writes with a token older than the latest it has
        seen. ZooKeeper's zxid and etcd's revision naturally serve as
        fencing tokens. If you're using Redis locks, you need to implement
        fencing yourself — which usually means you should be using ZooKeeper
        instead.
      </Decision>

      <Decision question="Compare-and-swap (CAS) and lock-free data structures">
        CAS is the hardware primitive behind lock-free programming:
        atomically "set X to new_value only if X is currently expected_value."
        In databases, this is UPDATE ... WHERE version = N. In application
        code, it's the foundation of concurrent queues, stacks, and counters
        (java.util.concurrent.atomic). Lock-free data structures matter at
        extreme scale (millions of ops/sec on shared state) — for most
        services, a mutex or database lock is simpler and correct. Don't
        reach for lock-free unless profiling proves lock contention is your
        bottleneck. The complexity cost is enormous: ABA problems, memory
        ordering, and subtle bugs that only manifest under specific
        interleaving.
      </Decision>

      <Decision question="Deadlock detection and prevention strategies">
        Prevention is better than detection. Rule 1: always acquire locks
        in a consistent global order (e.g., by primary key ascending). Rule
        2: set lock timeouts — Postgres's lock_timeout, Redis TTL. Rule 3:
        keep critical sections short. Detection: Postgres detects deadlocks
        automatically and kills the youngest transaction. In application
        code, use a wait-for graph — if you detect a cycle, abort one
        participant. At staff+ level, the answer is usually "design the
        system so deadlocks can't happen" rather than "detect and recover."
        Partition state, use optimistic concurrency, or sequence operations
        through a single writer.
      </Decision>

      <Insight>
        "I'd use optimistic locking with a version column for this — our
        contention rate is under 0.1%, so the retry cost is negligible. But
        for the payment flow specifically, I'd use SELECT FOR UPDATE because
        a failed optimistic retry after we've already called the payment
        gateway means we might double-charge. The cost of the pessimistic
        lock (queuing) is worth it to avoid the cost of a failed retry
        (double charge)."
      </Insight>
    </div>
  );
}

/* ─── Tab 1: Connection Pools ─── */

function ConnectionPoolsPanel() {
  return (
    <div>
      <h2 className="page-section-title">Pool sizing is capacity planning in disguise</h2>
      <p className="page-body">
        Every connection is a file descriptor, a memory allocation on the
        database server, and a slot in a finite pool. Getting pool size
        wrong is one of the most common production outages — too small and
        requests queue, too large and you overwhelm the database. The math
        is not intuition: it's Little's Law.
      </p>

      <Decision question="Database connection pooling: PgBouncer vs HikariCP">
        PgBouncer is a lightweight external proxy — it sits between your
        application and Postgres, multiplexing thousands of application
        connections onto a small pool of real database connections. Three
        modes: session (1:1 mapping, least benefit), transaction (connection
        returned after each transaction — the sweet spot), and statement
        (returned after each statement — breaks multi-statement transactions).
        Use transaction mode for web workloads. HikariCP is an in-process
        Java pool — fastest JVM pool, but each application instance maintains
        its own pool. With 20 app instances × 10 connections each = 200
        database connections. PgBouncer centralizes this: 20 instances × 100
        connections → PgBouncer → 30 real connections. The difference
        matters: Postgres performance degrades sharply above ~200 connections
        due to snapshot management overhead.
      </Decision>

      <Decision question="Little's Law: how to size your pool">
        <Pill type="red">critical</Pill> Pool size = throughput x latency.
        If your service handles 100 requests/second and each request holds
        a database connection for 50ms, you need 100 × 0.05 = 5 connections.
        Add headroom for variance (p99 latency, burst traffic): 2-3x the
        calculated minimum. So 10-15 connections. HikariCP's recommendation:
        connections = (core_count × 2) + spindle_count. For SSDs with no
        mechanical spindles, this simplifies to roughly 2× cores. A 4-core
        database server optimally handles ~10 connections. More connections
        doesn't mean more throughput — it means more context switching,
        more lock contention, and slower queries for everyone.
      </Decision>

      <Decision question="Connection pool exhaustion as a failure mode">
        This is the most common way a slow dependency kills your entire
        service. Scenario: a downstream API starts timing out at 30 seconds
        instead of 100ms. Every in-flight request holds a database connection
        while waiting. Pool drains in seconds. New requests queue. Queue
        fills. Health checks fail. Load balancer marks you down. Fix: set
        connection checkout timeouts (e.g., 1 second — fail fast instead of
        queuing). Set query timeouts (statement_timeout in Postgres). Use
        circuit breakers on slow dependencies so they fail before draining
        your pool. Monitor pool utilization — alert at 70%, not 100%.
      </Decision>

      <Decision question="Pool per dependency vs shared pool">
        <Pill type="amber">tradeoff</Pill> A shared pool is simpler but
        creates coupling: if one dependency's pool is exhausted, it can
        block connections for other dependencies. Bulkhead pattern: give
        each dependency its own pool with its own limits. Your primary
        database gets 20 connections, your analytics database gets 5, your
        Redis gets 10. If analytics queries slow down, they exhaust their
        own 5 connections but the primary database pool is unaffected. The
        cost: total connections across all pools may exceed what a shared
        pool would need (some pools sit idle while others are full). Worth
        it for isolation — a shared pool means one slow query path can
        take down all query paths.
      </Decision>

      <Decision question="HTTP connection pooling and keep-alive">
        HTTP/1.1 keep-alive reuses TCP connections across requests —
        avoiding the 1-3 RTT cost of TCP handshake + TLS handshake on
        every request. Most HTTP clients pool connections by default, but
        the defaults are often wrong. Node.js http.Agent defaults to
        maxSockets: Infinity (no pooling limit) and keepAlive: false
        (before Node 19). Set explicit limits matching your throughput
        needs. For service-to-service calls, HTTP/2 multiplexes many
        requests over a single TCP connection — one connection per
        upstream host is often sufficient. gRPC uses HTTP/2 by default,
        which is why gRPC services typically need far fewer connections.
      </Decision>

      <Insight>
        "I'd size the database pool using Little's Law: at 200 req/s with
        25ms average query time, I need 5 connections minimum. I'd set the
        pool to 15 (3x headroom) with a 1-second checkout timeout. Then I'd
        put PgBouncer in front in transaction mode — our 12 app instances
        each maintain 15 application connections, but PgBouncer multiplexes
        them onto 30 real Postgres connections. Without PgBouncer, that's
        180 direct connections and Postgres starts thrashing."
      </Insight>
    </div>
  );
}

/* ─── Tab 2: Performance Patterns ─── */

function PerformancePatternsPanel() {
  return (
    <div>
      <h2 className="page-section-title">Performance is a feature, not a fix</h2>
      <p className="page-body">
        The highest-leverage performance work isn't optimization — it's
        avoiding unnecessary work entirely. Move computation off the hot
        path, read from precomputed results, and batch what you can't
        avoid. Profile before you optimize. The biggest wins are always
        architectural, not algorithmic.
      </p>

      <Decision question="N+1 queries: detection and three levels of fixes">
        <Pill type="red">critical</Pill> The N+1 problem: load a list of N
        items, then for each item, execute a query for related data. 1 query
        becomes N+1. At N=1000, that's 1001 database round trips. Detection:
        APM tools (Datadog, New Relic) flag endpoints with high query counts.
        Django's django-debug-toolbar. Rails' Bullet gem.{' '}
        Fix level 1 (SQL): JOIN the related data in the original query. One
        round trip. Works for simple relationships.{' '}
        Fix level 2 (batch loading): DataLoader pattern — collect all IDs
        from the N items, execute one WHERE id IN (...) query. Facebook
        invented DataLoader for GraphQL exactly for this.{' '}
        Fix level 3 (API design): batch APIs. Instead of GET /user/:id
        called N times, provide GET /users?ids=1,2,3. Push batching to the
        API boundary. The best fix depends on where the N+1 lives — in your
        ORM, in your API calls, or in your client.
      </Decision>

      <Decision question="Hot key / hot partition — when one key gets all the traffic">
        A celebrity's profile, a viral product, a global counter — one key
        receives orders of magnitude more traffic than others. In
        partitioned systems, this creates a hot partition: one node handles
        all the load while others sit idle. Fixes: read replicas for hot
        reads (fan out across replicas). Local caching with short TTL (each
        app instance caches the hot key for 5 seconds). Key splitting:
        instead of counter:global, use counter:global:shard_0 through
        counter:global:shard_7, increment a random shard, sum on read.
        DynamoDB handles this with adaptive capacity — it silently moves
        hot items to dedicated partitions. But you still need to design
        for it: a single partition key with 100x average traffic will
        throttle regardless of total capacity.
      </Decision>

      <Decision question="Caching patterns: read-through vs write-through vs cache-aside">
        Cache-aside (lazy loading): app checks cache, on miss reads DB and
        populates cache. Most common. App controls the logic.{' '}
        Read-through: cache itself fetches from DB on miss. Simpler app code,
        but the cache must know how to read your data.{' '}
        Write-through: every write goes to cache and DB synchronously. Cache
        is always fresh but write latency increases.{' '}
        Write-behind: writes go to cache, cache asynchronously flushes to DB.
        Fastest writes but risk data loss if cache crashes before flush.{' '}
        For most web apps, cache-aside with delete-on-write is the right
        default. Delete the cache key on write instead of updating it —
        if the DB write fails after a cache update, you have stale data.
        Delete is idempotent and safe.
      </Decision>

      <Decision question="Materialized views and denormalization for read performance">
        When a query joins 5 tables and aggregates across millions of rows,
        no amount of indexing makes it fast enough for real-time serving.
        Materialized views precompute the result — Postgres REFRESH
        MATERIALIZED VIEW runs the query and stores it as a table. Trade-off:
        read latency drops from seconds to milliseconds, but data is stale
        until the next refresh. REFRESH MATERIALIZED VIEW CONCURRENTLY
        allows reads during refresh but requires a unique index.
        Denormalization is the manual version: store the computed result
        directly in the read table. Update it in the write path or via
        async workers. Staff+ judgment: denormalize when the read:write
        ratio justifies it and you can tolerate the consistency delay.
        Don't denormalize data that must be strictly consistent — that's
        what transactions are for.
      </Decision>

      <Decision question="Database indexing strategy: covering, partial, and composite indexes">
        A covering index includes all columns the query needs — the database
        reads the index and never touches the table (index-only scan in
        Postgres EXPLAIN). Massive win for read-heavy queries.{' '}
        Partial indexes: CREATE INDEX ON orders(created_at) WHERE status =
        'pending'. Only indexes the rows that match the predicate — smaller
        index, faster scans, useful when you only query a subset.{' '}
        Composite indexes: column order matters. An index on (a, b, c)
        supports queries on (a), (a, b), and (a, b, c), but NOT (b) or
        (b, c) alone. Put the most selective column first, unless you're
        range-scanning — then put the equality column first and the range
        column last. Monitor with pg_stat_user_indexes: unused indexes waste
        write performance and storage.
      </Decision>

      <Decision question="Move work off the hot path: async processing">
        <Pill type="green">high leverage</Pill> The fastest code is code
        that doesn't run during the request. Email sending, webhook
        delivery, analytics events, image processing, PDF generation — none
        of these need to complete before the HTTP response returns. Push
        them to a queue (SQS, RabbitMQ, Kafka) and process async. The
        user's request returns in 50ms instead of 3 seconds. Design
        principle: the write path should do the minimum to acknowledge the
        request. All derived work happens async. This also improves
        reliability: if the email service is down, the request still
        succeeds and the email retries later.
      </Decision>

      <Insight>
        "The dashboard endpoint joins 5 tables and aggregates 90 days of
        data — it takes 4 seconds. Rather than optimizing the query, I'd
        create a materialized view refreshed every 5 minutes by a cron job.
        Dashboard reads hit the materialized view in under 10ms. The
        trade-off is 5 minutes of staleness, which is fine for a dashboard.
        For the real-time metrics section, I'd precompute via a Kafka
        consumer that updates a denormalized table on each event."
      </Insight>
    </div>
  );
}

/* ─── Tab 3: Load Testing ─── */

function LoadTestingPanel() {
  return (
    <div>
      <h2 className="page-section-title">Test the system, not the component</h2>
      <p className="page-body">
        A load test that only tests your service in isolation tells you
        nothing about production. The bottleneck is almost never where you
        think — it's the database connection pool, the third-party API
        rate limit, the shared Redis instance, or the ELB connection limit.
        Load testing is the only way to find these before your users do.
      </p>

      <Decision question="Load testing vs stress testing vs soak testing">
        Load testing: apply expected production traffic patterns to verify
        the system meets latency and throughput targets. "Can we handle
        Black Friday traffic?" Stress testing: push beyond expected load
        until the system breaks. Find the breaking point and the failure
        mode. "What happens at 10x normal traffic? Does it degrade
        gracefully or fall off a cliff?" Soak testing: run at moderate load
        for hours or days. Find memory leaks, connection pool exhaustion,
        log disk filling, certificate expiration, GC pauses that accumulate.
        "Does the system slowly degrade over 48 hours?" You need all three.
        Load testing validates capacity. Stress testing validates failure
        modes. Soak testing validates operational stability.
      </Decision>

      <Decision question="Tools: k6, Locust, Gatling — choosing the right one">
        <Pill type="green">k6</Pill> JavaScript-based, runs as a single
        Go binary. Best for developers who want to write tests as code,
        check them into Git, and run in CI/CD. Excellent for API load
        testing. Limitation: no browser-level testing (k6 browser extension
        is experimental).{' '}
        <Pill type="amber">Locust</Pill> Python-based, distributed by
        default. Best when your team knows Python and needs to simulate
        complex user behavior with branching logic. Web UI for real-time
        monitoring. Lower per-worker throughput than k6.{' '}
        Gatling: Scala/Java, strong for JVM shops. Excellent HTML reports.
        More complex setup. For most teams: start with k6 for API testing,
        use Locust if you need complex scenarios, and avoid building your
        own framework — the operational cost of maintaining a custom load
        testing tool is never worth it.
      </Decision>

      <Decision question="Amdahl's Law: why some bottlenecks can't be parallelized away">
        <Pill type="red">critical</Pill> If 10% of your workload is
        inherently serial (database writes, lock acquisition, consensus),
        no amount of horizontal scaling gets you beyond 10x speedup. At
        1000 parallel workers, the serial portion becomes 99% of your
        latency. This is why "just add more servers" isn't always the
        answer. Identify the serial portions: database transactions, global
        locks, consensus protocols, ordered message processing. Then either
        eliminate the serialization (partition the data so different workers
        handle different partitions) or accept it as your throughput ceiling
        and size accordingly. Load testing reveals Amdahl's Law in
        practice: you'll see throughput flatten while latency climbs as
        you add more load.
      </Decision>

      <Decision question="Profiling: flame graphs and APM for finding real bottlenecks">
        CPU flame graphs show where time is spent across the call stack —
        wide bars mean expensive functions. Generate with perf (Linux),
        async-profiler (JVM), or py-spy (Python). Memory flame graphs find
        allocation hotspots. APM tools (Datadog, New Relic, Honeycomb)
        provide distributed tracing: follow a single request across 10
        services and see which one is slow. The p50 latency is almost never
        the problem — look at p99 and p999. A p99 of 3 seconds when p50
        is 50ms means 1% of your users wait 60x longer. Find those
        outliers: GC pauses, lock contention, cold caches, network
        retries, connection pool exhaustion.
      </Decision>

      <Decision question="Chaos engineering: breaking things on purpose">
        Chaos Monkey (Netflix): randomly kills production instances to
        ensure the system auto-recovers. Litmus (CNCF): Kubernetes-native
        chaos — pod kills, network partitions, disk pressure. Chaos
        engineering is not "break things randomly." It's a structured
        experiment: (1) define steady state (e.g., p99 latency under 200ms),
        (2) hypothesize that the system maintains steady state under a
        specific failure, (3) inject the failure, (4) observe. Start in
        staging. Graduate to production only with automated rollback. The
        highest value experiments: kill a database replica, add 500ms
        latency to a dependency, fill the disk on a node, exhaust
        connection pools. These are the failures that actually happen.
      </Decision>

      <Insight>
        "I'd start with k6 scripting the critical user journey — login,
        search, add to cart, checkout — and run it at 2x expected peak
        traffic. I'd watch three things: p99 latency, database connection
        pool utilization, and error rate. Once I find the bottleneck
        (usually the database), I'd use Datadog traces to find the
        slowest query, then flame-graph the application to see if we're
        CPU-bound or IO-bound. Only after I know the actual bottleneck
        would I decide whether to scale horizontally, optimize a query,
        or add caching."
      </Insight>
    </div>
  );
}

/* ─── Tab 4: Anti-patterns ─── */

function AntiPatternsPanel() {
  const antis = [
    {
      bad: 'I\'ll just add a mutex to make it thread-safe.',
      good: 'The contention rate on this data path is under 0.1%, so I\'d use optimistic concurrency with a version column. The retry cost is one extra read, which is cheaper than holding a lock on every request. For the payment path where retry cost is high (double-charge risk), I\'d use SELECT FOR UPDATE with a 2-second lock timeout.',
    },
    {
      bad: 'We\'ll use Redis distributed locks for consistency.',
      good: 'Redis is AP, not CP — a primary failover can lose the lock key before replication. For this payment deduplication, I need a CP lock. I\'d use an idempotency key stored in Postgres with a unique constraint — the database transaction itself provides the mutual exclusion. If we needed distributed coordination, I\'d use etcd leases with fencing tokens.',
    },
    {
      bad: 'Let me increase the connection pool size to fix the timeouts.',
      good: 'The timeouts are because a slow downstream dependency is holding connections for 30 seconds instead of 100ms. A bigger pool just delays the inevitable. I\'d add a 1-second checkout timeout so requests fail fast, set a 5-second statement_timeout, and put a circuit breaker on the slow dependency. Then I\'d right-size the pool with Little\'s Law: 200 req/s x 25ms = 5 connections, so 15 with headroom.',
    },
    {
      bad: 'I\'ll optimize this query by adding more indexes.',
      good: 'Before adding indexes, I\'d run EXPLAIN ANALYZE to find the actual bottleneck. The query might be slow because of a missing JOIN condition (Cartesian product), a type mismatch preventing index use, or lock contention — not a missing index. Every index speeds up reads but slows down writes. I\'d check pg_stat_user_indexes first — we might already have unused indexes we should drop.',
    },
    {
      bad: 'We need to load test at 10x traffic to be safe.',
      good: 'I\'d load test at 2x expected peak first to validate our capacity model, then stress test to find the breaking point. But the number matters less than what we measure: p99 latency, error rate, connection pool utilization, CPU, and memory. And I\'d run a 24-hour soak test at 1x — the memory leak that crashes the service after 18 hours won\'t show up in a 10-minute burst test at 10x.',
    },
    {
      bad: 'The N+1 query isn\'t a problem because each query is fast.',
      good: 'Each query takes 2ms, but with 500 items that\'s 1 second of sequential database round trips — and it holds a connection from the pool for that entire second. Under load, this drains the pool. I\'d batch with a DataLoader: one query with WHERE id IN (...) takes 3ms total instead of 1000ms. The per-query time doesn\'t matter; the aggregate connection hold time does.',
    },
  ];

  return (
    <div>
      <h2 className="page-section-title">What not to say</h2>
      <p className="page-body">
        These answers reveal reflex rather than reasoning. The fix: name the
        actual contention pattern, quantify the cost, and choose the primitive
        that matches the failure mode you're protecting against.
      </p>

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
        Weak concurrency answers reach for the first tool that sounds right —
        "add a lock," "increase the pool," "add an index." Strong answers
        start with the physics: what's the contention rate, what's the cost
        of a conflict, what's the serial fraction? Then they choose the
        weakest primitive that provides correctness. A mutex when CAS would
        do is wasted latency. A Redis lock when a database unique constraint
        would do is unnecessary infrastructure. The best concurrency code
        is code that avoids coordination entirely — partition the data so
        writers never collide.
      </Insight>
    </div>
  );
}

const styles = {
  anti: { background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 18px', marginBottom: 10 },
  strike: { textDecoration: 'line-through', opacity: 0.5, fontSize: 13, color: 'var(--text-p)', lineHeight: 1.6 },
  better: { fontSize: 13, color: 'var(--text-h)', fontWeight: 500, lineHeight: 1.6 },
  dot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 8, verticalAlign: 'middle' },
};
