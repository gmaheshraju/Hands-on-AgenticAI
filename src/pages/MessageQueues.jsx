import { useState } from 'react';
import TabNav from '../components/TabNav';
import TabTransition from '../components/TabTransition';
import Decision, { Pill } from '../components/Decision';
import Insight from '../components/Insight';

const TABS = ['0 Why first', '1 Guarantees', '2 Profiles', '3 Patterns', '4 Failures', '5 Anti-patterns'];

export default function MessageQueues() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <p className="page-eyebrow">Framework 04</p>
      <h1 className="page-title">Message Queue Selection</h1>
      <p className="page-subtitle">
        "Just use Kafka" is the queue equivalent of "just use DynamoDB." Before
        picking a technology, answer: what ordering do you need, can you lose
        messages, and who needs to consume them?
      </p>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      <TabTransition activeKey={tab}>

      {tab === 0 && <WhyPanel />}
      {tab === 1 && <GuaranteesPanel />}
      {tab === 2 && <ProfilesPanel />}
      {tab === 3 && <PatternsPanel />}
      {tab === 4 && <FailuresPanel />}
      {tab === 5 && <AntiPatternsPanel />}
      </TabTransition>
    </div>
  );
}

function WhyPanel() {
  return (
    <div>
      <h2 className="page-section-title">Start with "why do you need a queue?"</h2>
      <p className="page-body">A queue adds operational complexity, delivery semantics to reason about, and a failure mode that didn't exist before. Name the specific problem it solves.</p>

      <Decision question="Decoupling producers from consumers?">
        The producer doesn't need to know who consumes the message or when. This enables independent deployment, scaling, and failure isolation. The most common reason. Example: order service publishes "order.placed" — inventory, billing, and notification services each consume independently.
      </Decision>
      <Decision question="Absorbing traffic spikes (load leveling)?">
        The queue buffers burst traffic so downstream services process at their own pace. Without a queue, a 10x traffic spike either drops requests or crashes the downstream service. With a queue, the spike is absorbed and processed over time. Example: flash sale traffic buffered for the inventory service.
      </Decision>
      <Decision question="Guaranteeing delivery despite failures?">
        If the consumer is down, the message waits in the queue until the consumer recovers. Without a queue, the producer must implement retry logic, dead-letter handling, and persistence — effectively building a queue. Example: payment webhooks that must eventually be processed even if the handler is temporarily down.
      </Decision>
      <Decision question="Event-driven architecture / event sourcing?">
        Events as the source of truth. Multiple consumers react to the same event independently. The event log is replayable. This is where Kafka's log-based model shines over traditional queues — the log is persistent and consumers track their own offsets. Example: user actions published to Kafka, consumed by analytics, search indexing, and recommendations independently.
      </Decision>

      <Insight>
        "I need a queue here for two reasons: load leveling (the payment processor handles 50 TPS but we see 500 TPS bursts during checkout) and delivery guarantee (a failed payment must be retried, not dropped). SQS with a dead-letter queue fits — I don't need ordering or fan-out."
      </Insight>
    </div>
  );
}

function GuaranteesPanel() {
  return (
    <div>
      <h2 className="page-section-title">Delivery guarantees — the real decision</h2>
      <p className="page-body">The delivery guarantee determines the technology. This is the most important section in this framework — get this wrong and the rest doesn't matter.</p>

      <Decision question="At-most-once delivery">
        Message is delivered zero or one times. If delivery fails, the message is lost. Fastest and simplest. Used when: losing a message is acceptable (metrics, logs, analytics events). Implementation: fire-and-forget, no acknowledgment. UDP of the messaging world.
      </Decision>
      <Decision question="At-least-once delivery">
        <Pill type="amber">most common</Pill> Message is delivered one or more times. Duplicates are possible. The consumer must be idempotent — processing the same message twice must produce the same result. This is the default for SQS, RabbitMQ, and Kafka. Most production systems use this because exactly-once is expensive and at-most-once loses messages.
      </Decision>
      <Decision question="Exactly-once delivery">
        <Pill type="red">hard</Pill> Message is delivered exactly one time. In distributed systems, true exactly-once is impossible across system boundaries (the Two Generals Problem). What systems call "exactly-once" is really "at-least-once delivery + idempotent processing" or "at-least-once + transactional deduplication." Kafka Streams achieves exactly-once within Kafka using transactional producers and idempotent writes — but only within the Kafka ecosystem, not to external systems.
      </Decision>
      <Decision question="Ordering guarantees">
        Global ordering (all messages in total order) is expensive — it means single partition, single consumer, no parallelism. Partition-level ordering (messages with the same key are ordered) is the practical choice. Kafka guarantees order within a partition. SQS FIFO guarantees order within a message group. RabbitMQ guarantees order per queue with a single consumer. Ask: "does message B depend on message A having been processed first?" If yes, they need the same partition/group key.
      </Decision>

      <Insight>
        "For payment processing, I need at-least-once delivery — losing a payment event is unacceptable. The payment handler must be idempotent: I'd use the payment ID as an idempotency key and check 'already processed' before executing. For analytics events, at-most-once is fine — a missing page view doesn't break the business."
      </Insight>
    </div>
  );
}

function ProfilesPanel() {
  const [expanded, setExpanded] = useState(null);

  const queues = [
    {
      name: 'Apache Kafka',
      tldr: 'Distributed log, not a queue. Best for high-throughput event streaming with replay.',
      model: 'Append-only log partitioned by topic. Consumers track their own offset. Messages persist for a configurable retention period (default 7 days). Multiple consumer groups read the same topic independently.',
      throughput: 'Millions of messages/sec on a properly sized cluster. LinkedIn processes 7 trillion messages/day on Kafka. Designed for sustained high throughput, not low latency on individual messages.',
      ordering: 'Guaranteed within a partition only. Messages with the same key go to the same partition. Global ordering requires a single partition (kills parallelism).',
      delivery: 'At-least-once by default. Exactly-once within Kafka using idempotent producers + transactional APIs (Kafka Streams). Consumer offset commit is the deduplication mechanism.',
      ops: 'High. ZooKeeper (being replaced by KRaft), broker management, partition rebalancing, consumer group coordination. Managed options (Confluent Cloud, Amazon MSK) reduce this significantly.',
      when: 'Event streaming, log aggregation, CDC (change data capture), event sourcing. When you need replay, multiple consumer groups, or very high throughput. NOT for simple task queues — it\'s overkill.',
    },
    {
      name: 'Amazon SQS',
      tldr: 'Fully managed, zero ops. The default choice for AWS-native task queues.',
      model: 'Distributed queue. Messages are delivered to one consumer. After processing, the consumer deletes the message. Visibility timeout prevents other consumers from seeing the same message while it\'s being processed.',
      throughput: 'Standard: nearly unlimited throughput. FIFO: 300 messages/sec (3,000 with batching). Standard is sufficient for most workloads.',
      ordering: 'Standard: best-effort ordering (not guaranteed). FIFO: guaranteed ordering within a MessageGroupId. Choose FIFO only when order matters.',
      delivery: 'Standard: at-least-once (occasional duplicates). FIFO: exactly-once deduplication within a 5-minute window using MessageDeduplicationId.',
      ops: 'Near zero. No servers to manage, automatic scaling, pay-per-message. Dead-letter queues built in. This is SQS\'s biggest advantage over Kafka.',
      when: 'Task queues, background jobs, decoupling microservices in AWS. When you want zero ops overhead and don\'t need event replay, fan-out, or high-throughput streaming.',
    },
    {
      name: 'RabbitMQ',
      tldr: 'Feature-rich message broker with flexible routing. Best for complex routing patterns.',
      model: 'AMQP-based broker. Producers publish to exchanges, which route messages to queues based on routing rules (direct, topic, fanout, headers). Consumers subscribe to queues. Messages are acknowledged and removed after processing.',
      throughput: 'Tens of thousands of messages/sec per node. Not designed for Kafka-scale throughput. Performance degrades with deep queues (millions of messages backing up).',
      ordering: 'Guaranteed per queue with a single consumer. Multiple consumers on the same queue get round-robin delivery (no ordering guarantee across consumers).',
      delivery: 'At-least-once with manual acknowledgment. Publisher confirms ensure the broker received the message. Consumer acks ensure the broker can remove the message. No built-in exactly-once.',
      ops: 'Medium. Cluster management, queue mirroring for HA, memory and disk monitoring (RabbitMQ can crash when memory fills). Erlang runtime adds complexity. CloudAMQP and Amazon MQ offer managed versions.',
      when: 'Complex routing patterns (topic-based routing, priority queues, request-reply). Polyglot environments (AMQP is language-agnostic). When you need routing logic that SQS can\'t express and don\'t need Kafka\'s scale.',
    },
    {
      name: 'Amazon SNS + SQS',
      tldr: 'Fan-out pattern: SNS broadcasts, SQS queues receive. The AWS-native pub/sub.',
      model: 'SNS topic receives a message, fans it out to all subscribed SQS queues, Lambda functions, HTTP endpoints, or email. Each subscriber gets its own copy. Combines pub/sub (SNS) with reliable consumption (SQS).',
      throughput: 'SNS: nearly unlimited publish throughput. Each SQS subscriber has its own throughput limits. The fan-out is handled by AWS infrastructure.',
      ordering: 'SNS FIFO + SQS FIFO: ordered fan-out. Standard SNS: best-effort ordering.',
      delivery: 'At-least-once. SNS retries delivery to each subscriber independently. If an SQS queue is temporarily unavailable, SNS retries. Messages that fail all retries go to an SNS dead-letter queue.',
      ops: 'Near zero. Fully managed. The combination is the standard AWS pattern for event-driven architectures.',
      when: 'When multiple services need to react to the same event independently. Order service publishes "order.placed" to SNS → inventory queue, billing queue, and notification queue each get a copy. This is the AWS-native alternative to Kafka consumer groups.',
    },
    {
      name: 'Redis Streams',
      tldr: 'Lightweight log-like queue built into Redis. Good for simple streaming without Kafka overhead.',
      model: 'Append-only log data structure in Redis. Consumer groups track individual consumer offsets (similar to Kafka). XADD writes, XREADGROUP reads. Messages persist until explicitly trimmed.',
      throughput: 'Hundreds of thousands of messages/sec on a single Redis node. Limited by Redis being single-threaded. Not suitable for Kafka-scale workloads.',
      ordering: 'Guaranteed within a single stream. No partitioning — a single stream is on a single Redis node.',
      delivery: 'At-least-once with consumer group acknowledgment (XACK). Pending entries list tracks unacknowledged messages for redelivery. No built-in exactly-once.',
      ops: 'Low if you already run Redis. Redis persistence caveats apply — if Redis restarts between snapshots, messages can be lost. Redis Cluster can shard streams across nodes.',
      when: 'When you already have Redis and need a lightweight event stream without the operational cost of Kafka. Activity feeds, real-time notifications, simple event sourcing. Not for mission-critical message processing where durability matters.',
    },
  ];

  return (
    <div>
      <h2 className="page-section-title">Queue profiles — know what each is built for</h2>
      <p className="page-body">Click any card for the full breakdown — throughput, ordering, delivery guarantees, and operational cost.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {queues.map((q, i) => {
          const ex = expanded === i;
          return (
            <div key={q.name} style={{ ...styles.card, borderColor: ex ? 'var(--border-strong)' : 'var(--border)' }} onClick={() => setExpanded(ex ? null : i)}>
              <p style={styles.cardName}>
                {q.name}
                <span style={{ ...styles.chev, transform: ex ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
              </p>
              <p style={styles.cardTldr}>{q.tldr}</p>
              {ex && (
                <div style={styles.detail}>
                  {[['Model', q.model], ['Throughput', q.throughput], ['Ordering', q.ordering], ['Delivery', q.delivery], ['Ops cost', q.ops], ['When to use', q.when]].map(([label, val]) => (
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
        "Kafka is a distributed log — it's designed for event streaming with replay and multiple consumer groups. SQS is a task queue — it's designed for reliable point-to-point delivery with zero ops. Using Kafka as a task queue is like using Postgres as a cache — it works, but you're paying for capabilities you don't need."
      </Insight>
    </div>
  );
}

function PatternsPanel() {
  return (
    <div>
      <h2 className="page-section-title">Messaging patterns — the architecture shapes</h2>
      <p className="page-body">The pattern determines the queue topology. Name the pattern before the technology.</p>

      <Decision question="Point-to-point (task queue)">
        One producer, one consumer group. Each message is processed by exactly one consumer. Used for: background jobs, work distribution, async processing. The simplest pattern. SQS was built for this. Kafka and RabbitMQ can do this but it's not their sweet spot.
      </Decision>
      <Decision question="Publish-subscribe (fan-out)">
        One producer, multiple independent consumer groups. Each group gets every message. Used for: event-driven architecture where multiple services react to the same event. Kafka consumer groups, SNS+SQS fan-out, and RabbitMQ fanout exchanges all implement this pattern.
      </Decision>
      <Decision question="Request-reply (RPC over queue)">
        Producer sends a request message with a correlation ID and reply-to address. Consumer processes and sends response to the reply queue. Used for: async RPC, when you want queue benefits (load leveling, retry) with request-response semantics. RabbitMQ has first-class support. Kafka can do it but it's awkward.
      </Decision>
      <Decision question="Competing consumers">
        Multiple consumers read from the same queue. Each message goes to one consumer. Used for: horizontal scaling of processing. Add more consumers to process faster. The queue acts as a load balancer. Kafka partitions are the unit of parallelism — max consumers per group = number of partitions.
      </Decision>
      <Decision question="Dead-letter queue (DLQ)">
        Messages that fail processing N times are moved to a separate queue for inspection. Every production queue system needs a DLQ. Without it, poison messages (messages that always fail) block the queue forever. SQS has built-in DLQ support. Kafka requires manual implementation (consumer catches exception, publishes to error topic).
      </Decision>

      <Insight>
        "The order processing system needs fan-out — inventory, billing, and notifications all react to 'order.placed' independently. In AWS, I'd use SNS to fan out to three SQS queues, each with its own DLQ. Each service scales its consumers independently. If I'm on Kafka, three consumer groups on the same topic achieve the same fan-out."
      </Insight>
    </div>
  );
}

function FailuresPanel() {
  return (
    <div>
      <h2 className="page-section-title">Failure modes — what goes wrong with queues</h2>
      <p className="page-body">Queues shift failures from synchronous (caller sees an error) to asynchronous (failures are silent until you look). This is the hidden cost of async processing.</p>

      <Decision question="Poison messages">
        <Pill type="red">P0 risk</Pill> A message that always fails processing (malformed data, triggering a bug). Without a DLQ, the message is retried forever, blocking the queue. With a DLQ, it's moved aside after N retries. But you need monitoring on the DLQ — a growing DLQ means you're silently losing work. Set alerts on DLQ depth.
      </Decision>
      <Decision question="Consumer lag">
        Consumers process messages slower than producers publish. The queue grows. Eventually, messages are delayed by minutes or hours. In Kafka, consumer lag is measured in offsets — a growing lag means you need more partitions or faster consumers. In SQS, the "ApproximateNumberOfMessages" metric shows queue depth. Monitor this as a leading indicator.
      </Decision>
      <Decision question="Message ordering violations">
        Even with "ordered" queues, retries can cause ordering violations. Message A fails, message B succeeds, message A is retried — now B was processed before A. Solutions: idempotent consumers that can handle out-of-order processing, or sequential processing (single consumer, no parallelism — slow but ordered).
      </Decision>
      <Decision question="Duplicate processing">
        At-least-once delivery means duplicates happen. A consumer processes a message, the ack is lost (network blip), the message is redelivered. If the consumer isn't idempotent, the work is done twice. For payments, this means double-charging. Solution: idempotency key stored in the database — check before processing, mark after processing, in the same transaction.
      </Decision>
      <Decision question="Backpressure propagation">
        When the consumer is overwhelmed, how does the producer know to slow down? Kafka: producers get errors when broker disk is full. SQS: no backpressure — the queue grows until it hits the retention limit (14 days). RabbitMQ: producer flow control kicks in when memory is high. Design for backpressure: set queue size limits, monitor depth, and have a plan for when the queue is full (reject, drop oldest, apply backpressure to upstream).
      </Decision>

      <Insight>
        "The most dangerous queue failure is a silently growing DLQ. The system looks healthy — no errors, no alerts, messages are flowing — but 5% of orders are landing in the DLQ and nobody knows. I'd set an alert on DLQ depth &gt; 0 as a P1 and require every DLQ to have a documented remediation playbook."
      </Insight>
    </div>
  );
}

function AntiPatternsPanel() {
  const antis = [
    { bad: 'I\'ll use Kafka because it\'s the industry standard.',
      good: 'The use case is a background job queue processing 50 messages/sec with no ordering requirement. SQS handles this with zero operational cost. Kafka\'s partition management, ZooKeeper, and consumer group coordination add complexity with no benefit here.' },
    { bad: 'I\'ll use a queue to make the system faster.',
      good: 'A queue doesn\'t make processing faster — it makes the response async. The user gets a 202 Accepted instead of waiting. Total processing time is the same or slightly higher (queue overhead). The benefit is responsiveness and resilience, not speed.' },
    { bad: 'I\'ll guarantee exactly-once delivery.',
      good: 'True exactly-once across system boundaries is impossible in distributed systems. I\'d use at-least-once delivery with idempotent consumers. The payment handler checks the idempotency key before processing, so a duplicate message is a no-op.' },
    { bad: 'Messages will be processed in order because I\'m using a FIFO queue.',
      good: 'FIFO ordering is per message group (SQS) or per partition (Kafka), not global. If I need ordering for messages from the same user, I\'d use user_id as the partition/group key. Messages from different users can be processed in any order — that\'s where parallelism comes from.' },
    { bad: 'If the queue goes down, we\'ll just retry from the producer.',
      good: 'If the queue is the single point of failure, I need multi-AZ deployment (SQS is multi-AZ by default, Kafka needs cross-AZ replication configured). For Kafka, I\'d set replication factor ≥ 3 and min.insync.replicas = 2 so no single broker failure causes message loss.' },
  ];

  return (
    <div>
      <h2 className="page-section-title">What not to say</h2>
      <p className="page-body">These answers reveal technology-first thinking instead of problem-first thinking.</p>

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
        Queue design comes down to two things: (1) do you understand delivery semantics (at-least-once vs exactly-once, ordering, idempotency), and (2) can you pick the right queue for the job. Kafka for a 50 msg/s job queue is over-engineering. SQS for a 1M msg/s event stream is under-engineering. The technology follows from the requirements.
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

  anti: { background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 18px', marginBottom: 10 },
  strike: { textDecoration: 'line-through', opacity: 0.5, fontSize: 13, color: 'var(--text-p)', lineHeight: 1.6 },
  better: { fontSize: 13, color: 'var(--text-h)', fontWeight: 500, lineHeight: 1.6 },
  dot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 8, verticalAlign: 'middle' },
};
