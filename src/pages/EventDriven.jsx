import { useState } from 'react';
import TabNav from '../components/TabNav';
import TabTransition from '../components/TabTransition';
import Decision, { Pill } from '../components/Decision';
import Insight from '../components/Insight';

const TABS = ['Patterns', 'Event Sourcing', 'Sagas', 'CDC & Streaming', 'Anti-patterns'];

const ANTIS = [
  { bad: 'We should use event sourcing because it gives us a complete audit trail.', good: 'The audit requirement is append-only compliance logs. I\'d use a simple append-only table with Postgres — event sourcing adds projection complexity we don\'t need for a write-once-read-rarely audit trail.' },
  { bad: 'I\'ll use Kafka for communication between services.', good: 'The order-to-payment flow needs request-reply semantics with a 200ms SLA. I\'d use a synchronous call there. Kafka fits the order-to-analytics pipeline where the consumer can lag by minutes without business impact.' },
  { bad: 'We need exactly-once delivery to prevent duplicate charges.', good: 'The broker gives us at-least-once. I\'d make the payment handler idempotent using an idempotency key derived from the order ID — so duplicate deliveries are safe, and we don\'t pay the enormous cost of exactly-once semantics.' },
  { bad: 'Let\'s use choreography so services are fully decoupled.', good: 'With 6 services in the order flow, choreography turns debugging into archaeology. I\'d use an orchestrator for the order saga — one place to see the state machine, one place to add compensations. Choreography works for the notification fanout where there\'s no coordination needed.' },
  { bad: 'Events solve the distributed transaction problem.', good: 'Events solve the coupling problem, not the consistency problem. For the order-payment-inventory flow, I still need saga compensations and idempotent handlers. The transactional outbox pattern ensures events are published atomically with the local state change.' },
];

export default function EventDriven() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <p className="page-eyebrow">Framework 06</p>
      <h1 className="page-title">Event-Driven Architecture</h1>
      <p className="page-subtitle">
        Events decouple producers from consumers, but they don't decouple you from
        thinking about ordering, idempotency, and failure modes. The key differentiator
        is knowing when events help and when they make things worse.
      </p>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      <TabTransition activeKey={tab}>

      {tab === 0 && <PatternsPanel />}
      {tab === 1 && <EventSourcingPanel />}
      {tab === 2 && <SagasPanel />}
      {tab === 3 && <CDCStreamingPanel />}
      {tab === 4 && <AntiPatternsPanel />}
      </TabTransition>
    </div>
  );
}

/* ─── Tab 0: Patterns ─── */

function PatternsPanel() {
  return (
    <div>
      <h2 className="page-section-title">Three models, three tradeoffs</h2>
      <p className="page-body">
        Most engineers say "pub/sub" and stop. Staff engineers name the messaging
        model, the ordering guarantee, and the failure mode in the same breath.
        The model you pick determines what breaks first.
      </p>

      <Decision question="Pub/sub vs point-to-point vs event streaming — when does each earn its complexity?">
        <Pill type="green">pub/sub</Pill> One producer, N consumers who each get a copy.
        Use for fan-out: "order placed" triggers email, analytics, inventory independently.
        Consumers are independent — one failing doesn't block others. But you lose ordering
        guarantees across consumers, and there's no replay. SNS, RabbitMQ fanout exchange.
        {'\n\n'}
        <Pill type="amber">point-to-point</Pill> One producer, one consumer per message.
        Competing consumers pull from a shared queue. Use for work distribution: "process
        this image," "send this email." SQS, RabbitMQ direct queue. Natural load balancing,
        but you get at-least-once, not exactly-once — design the consumer to be idempotent.
        {'\n\n'}
        <Pill type="red">event streaming</Pill> Append-only log with consumer offsets.
        Kafka, Kinesis. Use when you need ordering within a partition, replay from any
        point, and multiple consumer groups reading independently. The complexity cost is
        real: partition key design, consumer group rebalancing, offset management. Only
        reach for it when replay or strict ordering is a hard requirement.
      </Decision>

      <Decision question="How do you design event schemas that don't break consumers on every deploy?">
        Use a schema registry (Confluent, AWS Glue) with backward-compatible evolution.
        The CloudEvents spec gives you a standard envelope: source, type, specversion,
        id, time, datacontenttype, data. The discipline is: new fields are always optional,
        never rename or remove fields, version the event type (order.placed.v2), and
        consumers must ignore unknown fields. The moment you break backward compatibility,
        you need a new topic or a dual-write migration — both are expensive. The better approach:
        mention that schema evolution is a contract problem, not a technical one. You need
        a schema review process the same way you need an API review process.
      </Decision>

      <Decision question="How do you guarantee ordering when you need it?">
        Ordering is per-partition, not global. In Kafka, messages with the same partition
        key land on the same partition and are consumed in order. Choose the partition key
        carefully — order_id if you need all events for one order in sequence, user_id if
        you need per-user ordering. Global ordering across partitions is effectively
        impossible at scale and almost never actually required.
        {'\n\n'}
        The trap: a single partition with all traffic gives you global ordering but kills
        throughput. If someone challenges you on global ordering, the practitioner's answer is
        "we probably don't actually need it — let me identify the entity that needs
        causal ordering and partition by that."
      </Decision>

      <Decision question="At-least-once vs exactly-once — what's the real-world answer?">
        <Pill type="green">at-least-once</Pill> is what every production system
        actually uses. The consumer commits the offset after processing, so a crash
        before commit means reprocessing. This is fine if your consumer is idempotent.
        {'\n\n'}
        <Pill type="red">exactly-once</Pill> is a marketing term that hides enormous
        complexity. Kafka's "exactly-once" (idempotent producer + transactional consumer)
        only works within Kafka — the moment you write to an external database, you're
        back to at-least-once plus idempotency. The staff answer: "I'd use at-least-once
        delivery with an idempotency key on the consumer side. The idempotency key is
        derived from the event ID, and I store it in the same transaction as the
        side effect."
      </Decision>

      <Decision question="How do you make a consumer idempotent in practice?">
        Three patterns, pick based on context:
        {'\n\n'}
        1. Idempotency key table — store event_id in a unique-constrained table in the
        same transaction as the business write. If the insert conflicts, skip processing.
        Works for database-backed consumers.
        {'\n\n'}
        2. Conditional writes — use version numbers or ETags. "Update balance WHERE
        version = 5" fails if already applied. Works for optimistic concurrency.
        {'\n\n'}
        3. Natural idempotency — the operation itself is safe to repeat. Setting a
        status to "shipped" is idempotent. Incrementing a counter is not. Identify
        which operations in your system are naturally idempotent and which need
        explicit protection.
      </Decision>

      <Insight>
        "The first thing I'd establish is whether we actually need event-driven architecture
        here. If two services need request-reply with a latency SLA, a synchronous call is
        simpler and debuggable. I reach for events when producers genuinely shouldn't know
        or care about consumers — fan-out notifications, analytics pipelines, cross-domain
        data sync. The litmus test: if removing a consumer would require changing the
        producer, you don't have events, you have RPC with extra steps."
      </Insight>
    </div>
  );
}

/* ─── Tab 1: Event Sourcing ─── */

function EventSourcingPanel() {
  return (
    <div>
      <h2 className="page-section-title">Event sourcing — powerful and usually overkill</h2>
      <p className="page-body">
        Event sourcing stores every state change as an immutable event. The current
        state is derived by replaying events. It's extremely powerful for specific
        domains and catastrophically over-engineered for most CRUD applications.
      </p>

      <Decision question="How do you design an event store?">
        The event store is an append-only log partitioned by aggregate ID. Each event
        has: aggregate_id, sequence_number, event_type, event_data (JSON), timestamp,
        and metadata. The sequence_number provides ordering within an aggregate and
        enables optimistic concurrency — append only if the expected sequence matches.
        {'\n\n'}
        Storage options: Postgres with an events table works for most cases (append-only
        inserts are fast, and you get transactions for free). EventStoreDB is purpose-built
        but adds operational overhead. DynamoDB with aggregate_id as partition key and
        sequence as sort key works well at scale.
        {'\n\n'}
        Critical constraint: events are immutable. You never update or delete an event.
        If you got it wrong, you append a compensating event. This is a feature for
        audit trails and a nightmare for GDPR right-to-erasure — mention this tradeoff.
      </Decision>

      <Decision question="Projections and materialized views — how do you actually query event-sourced data?">
        You don't query the event store directly for reads. You build projections —
        event handlers that consume events and write to read-optimized views.
        {'\n\n'}
        Example: an OrderProjection consumes OrderPlaced, ItemAdded, OrderShipped events
        and maintains a denormalized orders table in Postgres optimized for the queries
        your UI needs. The projection is eventually consistent with the event store.
        {'\n\n'}
        The power: you can build multiple projections from the same event stream. One
        for the user-facing order list, one for the analytics dashboard, one for the
        search index. Each optimized for its access pattern.
        {'\n\n'}
        The cost: you now maintain N read models, each with its own schema, each
        potentially lagging behind the event store. Debugging "why doesn't the UI
        show the update?" means checking projection lag, not just database state.
      </Decision>

      <Decision question="When do you need snapshots, and how do they work?">
        Replaying 100K events to rebuild an aggregate's state is slow. Snapshots
        solve this: periodically serialize the current state and store it alongside
        the events. To rebuild, load the latest snapshot and replay only events
        after the snapshot's sequence number.
        {'\n\n'}
        When to snapshot: when aggregate event counts routinely exceed a few hundred.
        A user with 50 events doesn't need snapshots. A trading account with 100K
        transactions does.
        {'\n\n'}
        Implementation: store snapshots in a separate table keyed by aggregate_id
        with the snapshot data and the sequence_number it represents. Snapshot
        creation can be async — trigger it when event count since last snapshot
        exceeds a threshold (e.g., every 100 events).
      </Decision>

      <Decision question="When is event sourcing overkill?">
        <Pill type="red">most of the time</Pill> Event sourcing earns its complexity in
        domains where the history IS the business value: financial ledgers (every
        transaction matters), collaborative editing (merge conflict resolution),
        audit-critical systems (healthcare, compliance), and domains with complex
        state machines (insurance claims, order fulfillment).
        {'\n\n'}
        It's overkill for: user profiles, content management, settings, catalogs —
        anything where you only care about current state. The key differentiator is saying
        "I'd use event sourcing for the payment ledger because the audit trail has
        regulatory value, but the user profile is straightforward CRUD — I'd use
        a regular Postgres table there."
      </Decision>

      <Decision question="How do you handle schema evolution in an event store?">
        Events are immutable, but your domain understanding evolves. Three strategies:
        {'\n\n'}
        1. Upcasting — transform old event formats to new ones on read. The event store
        keeps the original, but your application layer maps v1 events to the v2 schema
        before processing. Clean, but adds complexity to every event handler.
        {'\n\n'}
        2. Versioned event types — OrderPlaced_v1, OrderPlaced_v2. Projections handle
        both. Simple but the handler code accumulates versions over time.
        {'\n\n'}
        3. Copy-and-transform — create a new event stream by replaying and transforming
        all events. Nuclear option, but sometimes necessary for major domain model changes.
        Mention that this is essentially a data migration for your event store.
      </Decision>

      <Insight tag="The decision filter">
        "Event sourcing is seductive because it promises a complete history. But I've
        seen teams adopt it for a CRUD app and spend 6 months building projection
        infrastructure instead of shipping features. The question I always ask: does
        the business need the history, or just the current state? If the answer is
        current state, a simple table with an updated_at column and a separate audit
        log gives you 90% of the benefit at 10% of the cost."
      </Insight>
    </div>
  );
}

/* ─── Tab 2: Sagas ─── */

function SagasPanel() {
  return (
    <div>
      <h2 className="page-section-title">Distributed transactions without 2PC</h2>
      <p className="page-body">
        When a business operation spans multiple services, you can't use a single
        database transaction. Sagas coordinate multi-service operations with
        compensating actions instead of rollbacks. The hard part isn't the happy
        path — it's designing every failure mode.
      </p>

      <Decision question="Orchestration vs choreography — how do you choose?">
        <Pill type="green">orchestration</Pill> A central coordinator (the orchestrator)
        tells each service what to do and tracks the state machine. Use when the workflow
        has more than 3 steps, when you need visibility into where things are, or when
        failure handling is complex. The orchestrator owns the saga state: "order 123 is
        at step payment_pending." Debugging is easy — look at the orchestrator's state.
        Downside: the orchestrator is a coupling point and a single point of failure
        (mitigate with persistence and retries).
        {'\n\n'}
        <Pill type="amber">choreography</Pill> Each service reacts to events and emits
        its own events. No central coordinator. Use when the flow is simple (2-3 steps),
        services are truly independent, and you don't need to query "what step is this
        saga on?" Downside: with 5+ services, the event chain becomes impossible to
        reason about. You end up drawing sequence diagrams on whiteboards to understand
        what's happening, which is a sign you need an orchestrator.
        {'\n\n'}
        Staff+ rule of thumb: choreography for notification fan-out and simple reactive
        flows. Orchestration for anything that looks like a business process with steps
        and rollbacks.
      </Decision>

      <Decision question="Walk me through a real saga: order, payment, inventory.">
        Orchestrator-based saga for placing an order:
        {'\n\n'}
        Happy path: (1) Create order in PENDING state. (2) Reserve inventory
        (inventory service decrements available count). (3) Charge payment
        (payment service authorizes the card). (4) Confirm order, set status to
        CONFIRMED.
        {'\n\n'}
        Payment fails at step 3: (3a) Compensation: release inventory reservation
        (inventory service increments available count back). (3b) Set order to FAILED.
        {'\n\n'}
        Key details that signal depth: inventory reservation has a TTL — if the saga
        doesn't complete within 10 minutes, the reservation auto-expires. Payment uses
        authorize-then-capture, not direct charge — so compensation is just voiding the
        auth, not issuing a refund. The order ID is the idempotency key for both the
        inventory and payment calls, so retries are safe.
      </Decision>

      <Decision question="How do you design compensation transactions?">
        Compensations are not rollbacks — they're semantically opposite operations that
        undo the effect. This distinction matters because:
        {'\n\n'}
        1. Not everything is compensatable. You can void a payment authorization, but
        you can't unsend an email. Design sagas so non-compensatable steps happen last.
        {'\n\n'}
        2. Compensations can fail too. You need retry logic on compensations, and
        eventually a dead-letter queue for compensations that exhaust retries. A human
        looks at the DLQ — this is your safety net, not a bug.
        {'\n\n'}
        3. Compensations must be idempotent. The compensation for "reserve 5 units"
        is "release reservation R123," not "add 5 units back." The first is idempotent,
        the second double-counts on retry.
      </Decision>

      <Decision question="2PC vs sagas — when would you actually use 2PC?">
        <Pill type="red">2PC (two-phase commit)</Pill> Distributed transaction protocol:
        coordinator asks all participants to prepare, then commit. Provides atomicity
        across databases. Use when: all participants are databases you control, latency
        tolerance is high (2PC holds locks during the prepare phase), and you absolutely
        need atomicity — e.g., moving money between two accounts in different databases
        within the same organization.
        {'\n\n'}
        Why sagas win in practice: 2PC holds locks across services, creating availability
        risk. If the coordinator crashes between prepare and commit, participants are
        stuck with locks held. 2PC doesn't work across services you don't control (payment
        gateways, third-party APIs). And 2PC doesn't compose — you can't nest 2PC
        transactions easily.
        {'\n\n'}
        The right answer: "2PC is for database-level atomicity within a trusted boundary.
        For cross-service business operations, I'd use sagas with compensations because
        the services have different availability characteristics and I can't hold locks
        across them."
      </Decision>

      <Decision question="How do you handle the saga getting stuck — timeouts, partial failures?">
        Three mechanisms, layered:
        {'\n\n'}
        1. Step-level timeouts — each step has a deadline. If inventory doesn't respond
        in 5 seconds, retry (up to 3 times), then trigger compensation for all completed
        steps. The timeout is per-step, not per-saga.
        {'\n\n'}
        2. Saga-level TTL — if the entire saga hasn't completed in 15 minutes, force
        compensate everything. This catches cascading timeout scenarios.
        {'\n\n'}
        3. Stuck saga detector — a background job that scans for sagas in non-terminal
        states older than their TTL and triggers compensations. This is your last-resort
        safety net. Log aggressively here — a stuck saga means your timeout logic has
        a gap.
      </Decision>

      <Insight>
        "I'd use an orchestrator here because the order flow has 4 steps with compensations.
        The orchestrator stores the saga state in Postgres — which step we're on, which
        compensations are pending. If the orchestrator crashes, it restarts from the
        persisted state. Each service call is idempotent using the saga_id + step_number as
        the idempotency key. The non-compensatable steps — sending the confirmation email,
        updating the search index — happen after the order is confirmed, outside the saga
        boundary."
      </Insight>
    </div>
  );
}

/* ─── Tab 3: CDC & Streaming ─── */

function CDCStreamingPanel() {
  return (
    <div>
      <h2 className="page-section-title">Turning database changes into a stream</h2>
      <p className="page-body">
        Change Data Capture (CDC) reads the database's write-ahead log and publishes
        changes as events. It's how you get real-time data flow between systems without
        dual-write bugs. Combined with stream processing, it's the backbone of modern
        data infrastructure.
      </p>

      <Decision question="What is CDC and when do you reach for it?">
        CDC captures row-level changes (INSERT, UPDATE, DELETE) from the database's
        transaction log and publishes them as events. Debezium (Postgres, MySQL) and
        DynamoDB Streams are the common implementations.
        {'\n\n'}
        Reach for CDC when: you need to sync data between systems without changing the
        producing application (the app writes to its database normally, CDC picks up the
        changes), you need to build read replicas in a different storage engine (Postgres
        to Elasticsearch), or you need an event stream from a legacy system that can't
        be modified.
        {'\n\n'}
        The key advantage over application-level events: CDC is guaranteed to capture
        every change because it reads the WAL. Application-level events have a dual-write
        problem — the app might write to the database but fail to publish the event (or
        vice versa).
      </Decision>

      <Decision question="What is the outbox pattern and why does it matter?">
        The dual-write problem: your service writes to its database AND publishes an
        event to Kafka. If the database write succeeds but the Kafka publish fails (or
        vice versa), your systems are inconsistent. This isn't theoretical — it happens
        under load, during network partitions, and during deployments.
        {'\n\n'}
        The outbox pattern solves this: instead of publishing directly to Kafka, write
        the event to an "outbox" table in the same database transaction as the business
        data. A separate process (CDC or a poller) reads the outbox table and publishes
        to Kafka. Because the event and the data are in the same transaction, they're
        atomic — either both happen or neither does.
        {'\n\n'}
        Implementation: outbox table with id, aggregate_type, aggregate_id, event_type,
        payload, created_at, published_at. CDC (Debezium) tails this table and publishes
        to Kafka. After publishing, mark published_at. Periodically clean up old rows.
      </Decision>

      <Decision question="Stream processing — Kafka Streams vs Flink vs simpler alternatives?">
        <Pill type="green">simple consumers</Pill> If you're just transforming and
        forwarding events (enrich, filter, route), a Kafka consumer with application
        logic is enough. Don't reach for a stream processing framework for ETL.
        {'\n\n'}
        <Pill type="amber">Kafka Streams</Pill> When you need stateful processing —
        windowed aggregations, joins between streams, exactly-once within Kafka. Runs
        as a library inside your application (no separate cluster). Good for: real-time
        dashboards, sessionization, fraud scoring. Limitation: Kafka-to-Kafka only.
        {'\n\n'}
        <Pill type="red">Flink</Pill> When you need complex event processing with
        event-time semantics, large state, or heterogeneous sources/sinks. Flink manages
        its own state with checkpointing and handles out-of-order events with watermarks.
        Operational cost is significant — a Flink cluster is another distributed system
        to manage. Only justify it for true stream processing workloads: real-time ML
        feature computation, complex fraud detection, multi-source joins.
      </Decision>

      <Decision question="How do you handle backpressure in event-driven systems?">
        Backpressure is what happens when a consumer can't keep up with the producer.
        Without handling it, you either drop events, OOM the broker, or create unbounded
        lag that makes the system useless.
        {'\n\n'}
        Strategies by layer:
        {'\n\n'}
        Broker level — Kafka partitions are bounded by retention policy (time or size).
        If a consumer falls behind, old events are deleted. This is acceptable for
        metrics but not for business events. For business events, use longer retention
        and alert on consumer lag.
        {'\n\n'}
        Consumer level — control consumption rate with configurable batch sizes and
        processing timeouts. If the consumer is CPU-bound, scale horizontally (add
        consumer instances up to partition count). If it's I/O-bound (writing to a
        slow database), batch writes.
        {'\n\n'}
        System level — the circuit breaker pattern: if the consumer detects it's falling
        too far behind (lag {'>'} threshold), stop accepting new work and focus on catching
        up. Alert on this — it means your capacity model is wrong.
      </Decision>

      <Decision question="How do you actually achieve exactly-once in a streaming pipeline?">
        End-to-end exactly-once requires three pieces:
        {'\n\n'}
        1. Idempotent producer — Kafka's enable.idempotence=true prevents duplicate
        publishes from retries. The broker deduplicates by producer ID + sequence number.
        {'\n\n'}
        2. Transactional consumer-producer — Kafka transactions let you consume, process,
        and produce in a single atomic operation. Consumer offset commit and output
        record publish are in the same transaction.
        {'\n\n'}
        3. Idempotent sink — if the final consumer writes to an external database,
        you're back to at-least-once plus idempotency. Use the Kafka offset or event
        ID as a deduplication key in the database. Store the offset in the same
        transaction as the business write.
        {'\n\n'}
        The production answer: "Exactly-once within Kafka is achievable with
        transactional APIs. Exactly-once to external systems requires idempotent sinks.
        I'd rather design for idempotency everywhere than depend on exactly-once
        guarantees that break at system boundaries."
      </Decision>

      <Insight>
        "For syncing order data from Postgres to Elasticsearch, I'd use the transactional
        outbox pattern with Debezium. The order service writes to the orders table and the
        outbox table in one transaction. Debezium tails the outbox and publishes to Kafka.
        A consumer reads from Kafka and indexes into Elasticsearch. If Elasticsearch is
        down, Kafka retains the events. If Debezium restarts, it resumes from the WAL
        position. The entire pipeline is idempotent — the Elasticsearch upsert uses the
        order_id as the document ID, so replays are safe."
      </Insight>
    </div>
  );
}

/* ─── Tab 4: Anti-patterns ─── */

function AntiPatternsPanel() {
  return (
    <div>
      <h2 className="page-section-title">Common misconceptions</h2>
      <p className="page-body">
        These answers sound reasonable but reveal shallow understanding. The fix is
        showing the tradeoff you considered, not just the technology you chose.
      </p>

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
        Every weak answer treats event-driven architecture as a solution. Every strong
        answer treats it as a tradeoff. The pattern: name what you're gaining (decoupling,
        replay, fan-out), what you're paying (eventual consistency, debugging complexity,
        infrastructure cost), and why the gain justifies the cost for this specific problem.
        If you can't name the cost, experienced engineers will assume you don't know it exists.
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
