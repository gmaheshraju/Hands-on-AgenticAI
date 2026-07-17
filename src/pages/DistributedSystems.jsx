import { useState } from 'react';
import TabNav from '../components/TabNav';
import TabTransition from '../components/TabTransition';
import Decision, { Pill } from '../components/Decision';
import Insight from '../components/Insight';

const TABS = ['CAP & Consistency', 'Consensus', 'Transactions', 'Idempotency', 'Anti-patterns'];

export default function DistributedSystems() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <p className="page-eyebrow">Framework 14</p>
      <h1 className="page-title">Distributed Systems</h1>
      <p className="page-subtitle">
        Distributed systems fail in ways that monoliths never will. The network is unreliable,
        clocks drift, nodes crash mid-operation, and messages arrive out of order — or not at all.
        The job isn't to prevent failure. It's to design systems that remain correct when failure
        is the norm. Every choice here is a tradeoff, and staff+ engineers are expected to
        articulate exactly what they're trading away.
      </p>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      <TabTransition activeKey={tab}>

      {tab === 0 && <CAPPanel />}
      {tab === 1 && <ConsensusPanel />}
      {tab === 2 && <TransactionsPanel />}
      {tab === 3 && <IdempotencyPanel />}
      {tab === 4 && <AntiPatternsPanel />}
      </TabTransition>
    </div>
  );
}

/* ───────────────────────── TAB 0: CAP & Consistency ───────────────────────── */

function CAPPanel() {
  return (
    <div>
      <h2 className="page-section-title">What CAP actually says (and doesn't)</h2>
      <p className="page-body">
        CAP is the most misunderstood theorem in distributed systems. It does not say
        "pick two out of three." It says: during a network partition, you must choose between
        consistency and availability. When there's no partition, you can have both. The real
        question is what happens during the (rare but inevitable) partition event.
      </p>

      <Decision question="What does CAP actually guarantee?">
        <Pill type="red">critical</Pill> CAP says: in a distributed data store, when a network
        partition occurs, you must choose between Consistency (every read gets the most recent
        write or an error) and Availability (every request gets a non-error response, without
        guaranteeing the most recent write). Partition tolerance isn't a choice — partitions
        happen whether you like it or not. So the real decision is: during a partition, do you
        return stale data (AP) or return errors (CP)?
      </Decision>

      <Decision question="What is PACELC and why does it matter more than CAP?">
        PACELC extends CAP: if there's a Partition, choose Availability or Consistency; Else
        (normal operation), choose Latency or Consistency. This captures the everyday tradeoff
        that CAP misses. Dynamo chose PA/EL (available during partitions, low latency normally).
        Spanner chose PC/EC (consistent always, but pays latency via TrueTime). Most real systems
        live in the "else" branch 99.99% of the time — that's where your design decisions
        actually matter.
      </Decision>

      <Decision question="What are the consistency models and when do you pick each?">
        <Pill type="amber">nuanced</Pill> Strong consistency (linearizability): every operation
        appears to take effect at a single instant. Expensive — requires coordination.
        Eventual consistency: replicas converge eventually. Cheap but confusing for users.
        Causal consistency: preserves cause-effect ordering (if A causes B, everyone sees A
        before B). Good middle ground. Read-your-writes: you always see your own updates.
        Essential for user-facing apps — a user who updates their profile must see the update
        immediately, even if other users see it later.
      </Decision>

      <Decision question="Linearizability vs. serializability — what's the difference?">
        This trips up even experienced engineers. Linearizability is a recency guarantee on
        single operations: once a write completes, all subsequent reads see it. It's about
        real-time ordering. Serializability is a transaction isolation level: the result of
        executing transactions is equivalent to some serial order. They operate on different
        axes. Strict serializability (Spanner) gives you both — it's the gold standard and
        the most expensive option.
      </Decision>

      <Decision question="How does tunable consistency work in practice?">
        Cassandra lets you choose consistency per query. CL=ONE reads from one replica (fast,
        possibly stale). CL=QUORUM reads from a majority (slower, consistent if writes also
        use QUORUM). CL=ALL reads from every replica (slowest, most consistent, least
        available). The formula: R + W &gt; N guarantees strong consistency (where R = read
        replicas, W = write replicas, N = total replicas). In practice, QUORUM reads +
        QUORUM writes (majority + majority) gives you strong consistency with fault tolerance.
      </Decision>

      <Insight>
        "For this user-facing service, I'd use read-your-writes consistency. The user who
        updates their email address must see the change immediately — showing them the old
        email after they just changed it is a bug. But other users can see the update with
        a few seconds of delay. I'd implement this by routing the updating user's reads to
        the primary for 5 seconds after a write, then falling back to replicas. This gives
        us the consistency users expect without sacrificing read scalability."
      </Insight>
    </div>
  );
}

/* ───────────────────────── TAB 1: Consensus ───────────────────────── */

function ConsensusPanel() {
  return (
    <div>
      <h2 className="page-section-title">Why consensus is hard — and when you need it</h2>
      <p className="page-body">
        Consensus means getting a group of unreliable nodes to agree on a single value.
        It sounds simple. It's proven to be one of the hardest problems in computer science.
        The FLP impossibility result (1985) showed that no deterministic algorithm can guarantee
        consensus in an asynchronous system where even one node can crash. Every practical
        consensus protocol works around this by using timeouts, randomization, or partial
        synchrony assumptions.
      </p>

      <Decision question="How does Raft achieve consensus?">
        <Pill type="green">essential</Pill> Raft breaks consensus into three sub-problems:
        Leader election (nodes vote for a leader using randomized timeouts — the randomization
        breaks the FLP impossibility), log replication (leader accepts client requests, appends
        them to its log, replicates to followers, commits when a majority acknowledge), and
        safety (a node can only be elected leader if its log is at least as up-to-date as a
        majority of nodes — this prevents committed entries from being lost). Raft is designed
        to be understandable, unlike Paxos.
      </Decision>

      <Decision question="What about Paxos?">
        Single-decree Paxos solves consensus for one value using three phases: Prepare (proposer
        picks a ballot number, asks acceptors to promise not to accept lower-numbered proposals),
        Accept (if a majority promise, proposer sends the value), Learn (once a majority accept,
        the value is chosen). Multi-Paxos optimizes for a sequence of values by using a stable
        leader to skip the Prepare phase for most rounds. Paxos is correct but notoriously hard
        to implement — Google's Chubby paper says "there are significant gaps between the
        description of the Paxos algorithm and the needs of a real-world system."
      </Decision>

      <Decision question="ZooKeeper vs. etcd — when do you pick each?">
        Both are consensus-backed coordination services. ZooKeeper (ZAB protocol) is battle-tested
        in the Hadoop/Kafka ecosystem — it provides ephemeral nodes, watches, and sequential
        znodes for leader election. etcd (Raft protocol) is the Kubernetes control plane's brain —
        simpler API (key-value with MVCC), gRPC-based, better for cloud-native stacks. Pick
        ZooKeeper if you're in the JVM/Hadoop world. Pick etcd if you're Kubernetes-native.
        Don't run either yourself if you can avoid it — use a managed service.
      </Decision>

      <Decision question="When do you actually need consensus?">
        <Pill type="amber">judgment call</Pill> You need consensus for: leader election (only
        one node should process writes), distributed locks (mutual exclusion across nodes),
        metadata coordination (which shard owns which key range), and configuration management
        (all nodes must agree on the current config). You do NOT need consensus for: application
        data reads/writes (use a database with built-in replication), caching (eventual
        consistency is fine), and event streaming (Kafka's ISR mechanism handles this without
        full consensus).
      </Decision>

      <Decision question="What are the performance implications of consensus?">
        Consensus requires a network round-trip to a majority of nodes for every decision.
        At a minimum, that's one round-trip for Raft/Multi-Paxos with a stable leader, or two
        for basic Paxos. Cross-datacenter consensus adds 50-150ms per operation (speed of light).
        This is why Spanner uses TrueTime instead of consensus for read-only transactions — GPS
        and atomic clocks are faster than cross-datacenter network calls. The lesson: consensus
        is expensive. Use it for metadata and coordination, not for every data operation.
      </Decision>

      <Insight>
        "I'd use etcd for leader election and shard assignment — that's a low-frequency,
        high-importance coordination problem that justifies the cost of consensus. But I
        would not route user data through a consensus protocol. Instead, the consensus layer
        tells each node which shard it owns, and then each node handles its shard's reads
        and writes directly against the database. Keep the consensus path narrow — it's a
        coordination mechanism, not a data path."
      </Insight>
    </div>
  );
}

/* ───────────────────────── TAB 2: Transactions ───────────────────────── */

function TransactionsPanel() {
  return (
    <div>
      <h2 className="page-section-title">Distributed transactions — the options and their costs</h2>
      <p className="page-body">
        ACID transactions are straightforward in a single database. The moment data spans
        multiple services or databases, everything gets harder. Two-phase commit works but
        blocks. Sagas work but require compensating actions. The outbox pattern bridges the
        gap between database writes and event publishing. Every approach trades off something
        — the question is which tradeoff fits your business requirements.
      </p>

      <Decision question="Why is 2PC slow and fragile?">
        <Pill type="red">critical</Pill> Two-phase commit (2PC) works in two phases: Prepare
        (coordinator asks all participants "can you commit?") and Commit (if all say yes,
        coordinator tells everyone to commit). The problem: if the coordinator crashes between
        Prepare and Commit, all participants are stuck holding locks, unable to commit or abort,
        until the coordinator recovers. This is the "blocking" problem. Meanwhile, other
        transactions waiting for those locks are also blocked. In practice, 2PC across
        microservices means a coordinator crash can freeze your entire system. This is why
        most distributed systems avoid 2PC across service boundaries.
      </Decision>

      <Decision question="Does three-phase commit solve the blocking problem?">
        3PC adds a "pre-commit" phase between Prepare and Commit, so participants can
        independently decide to abort if the coordinator crashes. It solves the blocking problem
        in theory. In practice, 3PC is rarely used because: (1) it requires three round-trips
        instead of two, (2) it doesn't work correctly with network partitions (a partitioned
        participant might abort while others commit), and (3) the failure modes it solves are
        rare enough that the performance cost isn't worth it. It's good to understand conceptually but
        not a practical recommendation.
      </Decision>

      <Decision question="When should you use the Saga pattern instead of 2PC?">
        <Pill type="green">essential</Pill> Sagas break a distributed transaction into a
        sequence of local transactions, each with a compensating action. Order saga: create
        order (compensate: cancel order) → reserve inventory (compensate: release inventory) →
        charge payment (compensate: refund). If step 3 fails, you run compensating actions in
        reverse. Two orchestration styles: choreography (each service emits events, next service
        listens — simple but hard to trace) and orchestration (a central orchestrator drives
        the sequence — easier to reason about, single point of coordination). Use orchestration
        for complex sagas with many steps; choreography for 2-3 step flows.
      </Decision>

      <Decision question="How does the outbox pattern ensure reliable event publishing?">
        <Pill type="green">essential</Pill> The problem: you update a database row and publish
        an event to Kafka. If the app crashes between the DB write and the Kafka publish, the
        event is lost. The outbox pattern: write the event to an "outbox" table in the same
        database transaction as the business data. A separate process (CDC via Debezium, or a
        poller) reads the outbox table and publishes to Kafka. Now the event is guaranteed to
        be published if and only if the business data was committed. The tradeoff is added
        latency (polling interval or CDC lag) and operational complexity (running Debezium).
      </Decision>

      <Decision question="How do you handle eventual consistency with compensation?">
        Accept that distributed operations will temporarily be inconsistent, and design for
        correction. Example: a payment service charges a card, but the order service crashes
        before recording it. The reconciliation process runs every hour, compares payment
        records with order records, and creates compensating transactions for mismatches.
        This requires: (1) every operation to be idempotent, (2) compensating actions for every
        forward action, (3) a reconciliation process that detects and corrects drift, and
        (4) alerting when drift exceeds acceptable thresholds. It's messy but it's how most
        large-scale systems actually work.
      </Decision>

      <Insight>
        "For this order processing system, I'd use a saga with an orchestrator. The orchestrator
        manages the create-order → reserve-inventory → charge-payment flow and handles
        compensations if any step fails. For event publishing, I'd use the outbox pattern —
        write the order event to an outbox table in the same transaction as the order, and use
        Debezium CDC to publish it to Kafka. This gives me atomic business-data-plus-event
        writes without 2PC. I'd run an hourly reconciliation job to catch any edge cases where
        the saga and the actual state drift apart."
      </Insight>
    </div>
  );
}

/* ───────────────────────── TAB 3: Idempotency ───────────────────────── */

function IdempotencyPanel() {
  return (
    <div>
      <h2 className="page-section-title">Idempotency — the foundation of reliable distributed systems</h2>
      <p className="page-body">
        In a distributed system, any request can be retried. The network can duplicate
        packets, load balancers can retry on timeout, clients can resend on failure, and
        message queues deliver at-least-once. If your operations aren't idempotent, every
        retry is a potential data corruption. Idempotency is not a nice-to-have — it's a
        structural requirement.
      </p>

      <Decision question="Why is idempotency non-negotiable?">
        <Pill type="red">critical</Pill> Consider: a client sends a payment request, the
        server processes it, but the response is lost in the network. The client retries.
        Without idempotency, the customer is charged twice. This isn't a hypothetical — it
        happens in production constantly. At-least-once delivery is the only practical
        guarantee most systems can provide. Combined with idempotent operations, at-least-once
        becomes effectively exactly-once. The formula is simple: at-least-once delivery +
        idempotent processing = exactly-once semantics.
      </Decision>

      <Decision question="How do you design idempotency keys?">
        <Pill type="green">essential</Pill> The client generates a unique idempotency key
        (UUID v4) for each logical operation and sends it with the request. The server stores
        a mapping of idempotency key → response. On duplicate requests, the server returns
        the stored response without re-executing the operation. Key design decisions: (1) scope
        the key to a user or account to prevent cross-user collisions, (2) set a TTL on stored
        keys (24-72 hours is typical — retries after that are new requests), (3) handle
        concurrent duplicate requests with a database unique constraint on the idempotency key,
        and (4) store the full response so retries return the same result.
      </Decision>

      <Decision question="Which HTTP methods are naturally idempotent?">
        GET, PUT, DELETE are idempotent by design. GET returns data without side effects. PUT
        replaces a resource — putting the same data twice leaves the resource in the same state.
        DELETE removes a resource — deleting an already-deleted resource is a no-op (return 404
        or 204, not an error). POST is NOT idempotent — posting the same order twice creates two
        orders. To make POST idempotent, use an idempotency key header
        (Idempotency-Key: abc-123). Stripe does this for payment creation. PATCH is also not
        inherently idempotent — "increment counter by 1" applied twice gives a different result
        than applied once.
      </Decision>

      <Decision question="What deduplication strategies exist beyond idempotency keys?">
        <Pill type="amber">nuanced</Pill> Bloom filters: probabilistic set membership — "is
        this message ID one we've seen?" Fast and memory-efficient but has false positives
        (might say "seen" when it hasn't). Good for high-volume event streams where occasional
        duplicate processing is acceptable. Idempotency stores (Redis SET with NX): exact
        deduplication with a TTL. Use for payment processing where false positives are
        unacceptable. Content-based deduplication: hash the message body and dedup on the hash.
        Works when the same logical message might arrive with different IDs (e.g., from
        different retry paths).
      </Decision>

      <Decision question="How do you achieve database-level idempotency?">
        UPSERT (INSERT ... ON CONFLICT UPDATE): if the row exists, update it instead of
        failing or inserting a duplicate. This makes write operations idempotent at the
        database level. Unique constraints: prevent duplicate rows even if application-level
        dedup fails. Always have a unique constraint on your natural key (e.g., order_id +
        line_item_id), not just the surrogate key. Conditional updates: UPDATE ... WHERE
        version = expected_version. The update only applies if the row hasn't been modified
        since you read it. This is optimistic locking — it makes concurrent updates safe
        without explicit locks.
      </Decision>

      <Insight>
        "Every mutation endpoint in this API will require an Idempotency-Key header. The server
        stores the key in Redis with a 48-hour TTL. The first request executes normally and
        stores the response keyed by the idempotency key. Duplicate requests within 48 hours
        return the stored response with a 200 status — the client can't distinguish a retry
        from a fresh response, which is exactly the behavior we want. For the payment service
        specifically, I'd also add a unique constraint on (account_id, idempotency_key) in
        Postgres as a second line of defense, because charging someone twice is the one failure
        mode we absolutely cannot tolerate."
      </Insight>
    </div>
  );
}

/* ───────────────────────── TAB 4: Anti-patterns ───────────────────────── */

function AntiPatternsPanel() {
  return (
    <div>
      <h2 className="page-section-title">Anti-patterns vs. production-tested approaches</h2>
      <p className="page-body">
        The difference between a senior and a staff+ answer isn't more buzzwords — it's
        demonstrating that you understand the tradeoffs, have opinions about defaults,
        and can articulate what you're giving up with each choice.
      </p>

      {/* Anti-pattern 1 */}
      <div style={styles.anti}>
        <p style={styles.strike}>
          "We'll use strong consistency everywhere to make sure data is always correct."
        </p>
        <p style={styles.better}>
          <span style={{ ...styles.dot, background: 'var(--text-success)' }} />
          "Strong consistency has a latency and availability cost. I'd use it for the payment
          ledger where correctness is non-negotiable, but use read-your-writes consistency
          for user profiles — the updating user sees their change immediately, other users
          can tolerate a few seconds of staleness. This lets me use read replicas for 95%
          of profile reads."
        </p>
      </div>

      {/* Anti-pattern 2 */}
      <div style={styles.anti}>
        <p style={styles.strike}>
          "We need distributed transactions across all our microservices to maintain ACID."
        </p>
        <p style={styles.better}>
          <span style={{ ...styles.dot, background: 'var(--text-success)' }} />
          "2PC across microservices is fragile — a coordinator crash blocks all participants.
          I'd use a saga with an orchestrator for the order flow, and the outbox pattern
          for reliable event publishing. Each service maintains ACID locally, and the saga
          provides eventual consistency across services with explicit compensating actions
          for failure cases."
        </p>
      </div>

      {/* Anti-pattern 3 */}
      <div style={styles.anti}>
        <p style={styles.strike}>
          "Our system provides exactly-once message delivery."
        </p>
        <p style={styles.better}>
          <span style={{ ...styles.dot, background: 'var(--text-success)' }} />
          "True exactly-once delivery is impossible in a distributed system — the Two Generals
          Problem proves this. What we actually provide is at-least-once delivery combined with
          idempotent consumers. Every consumer operation uses an idempotency key stored in Redis
          with a 48-hour TTL. The net effect is exactly-once processing semantics, even though
          the message might be delivered multiple times."
        </p>
      </div>

      {/* Anti-pattern 4 */}
      <div style={styles.anti}>
        <p style={styles.strike}>
          "We'll use Paxos for consensus because it's the most correct algorithm."
        </p>
        <p style={styles.better}>
          <span style={{ ...styles.dot, background: 'var(--text-success)' }} />
          "Paxos is proven correct but notoriously difficult to implement. For our use case —
          leader election and shard assignment — I'd use etcd, which implements Raft. Raft
          provides the same safety guarantees as Paxos but is designed for understandability,
          which matters when you're debugging a production incident at 3 AM. We don't need
          to implement consensus ourselves — we need to use a battle-tested implementation
          correctly."
        </p>
      </div>

      {/* Anti-pattern 5 */}
      <div style={styles.anti}>
        <p style={styles.strike}>
          "We'll handle failures with retries and timeouts — the standard approach."
        </p>
        <p style={styles.better}>
          <span style={{ ...styles.dot, background: 'var(--text-success)' }} />
          "Retries without idempotency create duplicates. Timeouts without circuit breakers
          cause cascading failures. I'd implement exponential backoff with jitter (to avoid
          thundering herds), circuit breakers that open after 5 consecutive failures (to stop
          hammering a dead service), and idempotency keys on every mutation so retries are
          safe. The retry budget should be capped at 10% of total traffic to prevent retry
          storms from amplifying a partial outage into a total one."
        </p>
      </div>

      {/* Anti-pattern 6 */}
      <div style={styles.anti}>
        <p style={styles.strike}>
          "CAP theorem says we can only pick two out of three: consistency, availability,
          or partition tolerance."
        </p>
        <p style={styles.better}>
          <span style={{ ...styles.dot, background: 'var(--text-success)' }} />
          "That's the common simplification, but it's misleading. Partition tolerance isn't
          a choice — partitions will happen. CAP really says: during a partition, pick
          consistency (return errors rather than stale data) or availability (return stale
          data rather than errors). And most of the time there's no partition, so PACELC
          is more useful — it adds the normal-operation tradeoff of latency vs. consistency.
          Dynamo chose PA/EL — available and fast. Spanner chose PC/EC — consistent always,
          paying latency with TrueTime."
        </p>
      </div>

      <Insight>
        "The staff+ differentiator in distributed systems questions isn't knowing the
        theorems — it's showing that you understand the tradeoff space well enough to make
        a defensible choice for a specific system. Don't recite CAP. Say what your system
        needs, what you're choosing, and what the cost of that choice is. What matters is
        judgment, not definitions."
      </Insight>
    </div>
  );
}

/* ───────────────────────── STYLES ───────────────────────── */

const styles = {
  anti: { background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 18px', marginBottom: 10 },
  strike: { textDecoration: 'line-through', opacity: 0.5, fontSize: 13, color: 'var(--text-p)', lineHeight: 1.6 },
  better: { fontSize: 13, color: 'var(--text-h)', fontWeight: 500, lineHeight: 1.6 },
  dot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 8, verticalAlign: 'middle' },
};
