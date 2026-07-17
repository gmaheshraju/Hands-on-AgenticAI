import { useState } from 'react';
import TabNav from '../components/TabNav';
import TabTransition from '../components/TabTransition';
import Decision, { Pill } from '../components/Decision';
import Insight from '../components/Insight';

const TABS = ['State Machines', 'Workflow Orchestration', 'Distributed State', 'Design Problem', 'Anti-patterns'];

const ANTIS = [
  { bad: 'I\'ll use a status field with string values and check it everywhere.',
    good: 'I\'d define an explicit state machine with a transition table. Each state lists its allowed next states and the guard conditions. Any transition not in the table is rejected at the boundary — no scattered if-checks.' },
  { bad: 'We\'ll use a saga for everything since we have microservices.',
    good: 'For the payment + inventory reservation, I\'d use orchestration (Temporal) because the compensation logic is complex and needs to be centrally visible. For the notification fanout after order confirmation, choreography is fine — it\'s fire-and-forget with no rollback.' },
  { bad: 'I\'ll add a distributed lock so only one instance processes this.',
    good: 'I\'d use a fencing token with the lock. The lock itself only provides best-effort mutual exclusion — a stale holder can still write after the lock expires. The fencing token ensures the storage layer rejects writes from expired holders.' },
  { bad: 'We need to handle all the state transitions in the API layer.',
    good: 'State transitions happen in exactly one place — the state machine gateway. The API layer requests a transition, the gateway validates it against the transition table, applies guards, emits events, and persists atomically. No other code path can mutate order state.' },
  { bad: 'I\'ll use a boolean flag for each status — isPaid, isShipped, isDelivered.',
    good: 'Boolean flags create 2^n possible states, most of which are illegal (isPaid=false, isDelivered=true). An explicit enum state with a transition table makes illegal states unrepresentable — you can\'t reach DELIVERED without passing through SHIPPED.' },
];

export default function StateMachines() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <p className="page-eyebrow">Framework 07</p>
      <h1 className="page-title">State Machines & Workflows</h1>
      <p className="page-subtitle">
        Every production outage you remember involved state. A payment stuck in
        "processing," an order both "cancelled" and "shipped," a workflow that
        retried forever. Explicit state machines are how staff engineers prevent
        entire categories of bugs — not by being more careful, but by making
        illegal states structurally impossible.
      </p>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      <TabTransition activeKey={tab}>

      {tab === 0 && <StateMachinesPanel />}
      {tab === 1 && <WorkflowOrchestrationPanel />}
      {tab === 2 && <DistributedStatePanel />}
      {tab === 3 && <DesignProblemPanel />}
      {tab === 4 && <AntiPatternsPanel />}
      </TabTransition>
    </div>
  );
}

/* ───────── Tab 0: State Machines ───────── */
function StateMachinesPanel() {
  return (
    <div>
      <h2 className="page-section-title">Why explicit state machines beat boolean flags</h2>
      <p className="page-body">
        A boolean flag is a 1-bit state machine you forgot to design. Two booleans
        give you four states. Three give you eight. Most combinations are illegal,
        but nothing enforces that — until production finds the impossible state at
        3 AM.
      </p>

      <Decision question="Boolean flags vs. enum state — when does it matter?">
        <Pill type="red">flags</Pill> With N boolean flags you get 2^N possible states.
        An order with isPaid, isShipped, isCancelled has 8 combinations — at least 4
        are illegal (cancelled + shipped, unpaid + delivered). Nothing prevents these
        at the type level. An enum state field with a transition table has exactly the
        states you defined, and transitions are validated at a single boundary. The
        enum approach scales linearly; booleans scale exponentially in bug surface area.
      </Decision>

      <Decision question="What belongs in a state transition table?">
        A transition table maps (current_state, event) to (next_state, guard, side_effects).
        The guard is a pure predicate — "is payment confirmed?" The side effects are
        actions triggered on transition — "send confirmation email," "reserve inventory."
        Separating guards from side effects is critical: guards are synchronous and
        determine whether the transition is allowed; side effects are often async and
        must not block the transition decision.
        <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
          PLACED + payment_received [guard: amount_matches] → CONFIRMED + [emit: order.confirmed]<br/>
          CONFIRMED + warehouse_picked → PICKING + [emit: picking.started]<br/>
          PICKING + handed_to_carrier → SHIPPED + [emit: shipment.created]<br/>
          SHIPPED + delivery_confirmed → DELIVERED + [emit: order.completed]<br/>
          PLACED|CONFIRMED + cancel_requested [guard: not_yet_shipped] → CANCELLED + [emit: refund.initiated]
        </div>
      </Decision>

      <Decision question="How do you make illegal states unrepresentable?">
        <Pill type="green">structural safety</Pill> In typed languages, use discriminated
        unions or tagged enums where each state variant carries only the data relevant
        to that state. A SHIPPED order carries a tracking_id; a PLACED order does not.
        You cannot access tracking_id on a PLACED order — the compiler prevents it.
        In dynamic languages, the state machine gateway is the enforcement layer:
        all state mutations go through one function that validates the transition
        against the table before persisting. No direct updates to the state field
        from anywhere else in the codebase.
      </Decision>

      <Decision question="Where should the state machine live — application or database?">
        Both. The application layer holds the transition table and validates transitions.
        The database enforces the current state with an atomic compare-and-swap:
        UPDATE orders SET state = 'CONFIRMED' WHERE id = ? AND state = 'PLACED'.
        If the WHERE clause matches zero rows, the transition was contested — another
        process already moved the state. This gives you optimistic concurrency control
        without distributed locks. The application decides what transitions are valid;
        the database decides who wins the race.
      </Decision>

      <Decision question="How do you handle transitions that require external confirmation?">
        Introduce intermediate states. Instead of PLACED → CONFIRMED, use
        PLACED → PAYMENT_PENDING → CONFIRMED. PAYMENT_PENDING is a waiting state
        with a timeout. If the payment gateway does not respond within T seconds, a
        scheduled job transitions PAYMENT_PENDING → PAYMENT_FAILED. This makes the
        "waiting for external system" state visible, monitorable, and recoverable —
        instead of an order stuck in PLACED with a silent hope that a webhook arrives.
      </Decision>

      <Insight>
        "Every boolean flag in your data model is a state machine you haven't drawn
        yet. I'd start by listing every combination of those flags that's actually
        valid, realize it's 4 out of 16, and replace them with an explicit enum.
        The transition table becomes the contract — QA tests it, monitoring alerts
        on unexpected transitions, and the on-call engineer can read it at 3 AM."
      </Insight>
    </div>
  );
}

/* ───────── Tab 1: Workflow Orchestration ───────── */
function WorkflowOrchestrationPanel() {
  return (
    <div>
      <h2 className="page-section-title">Orchestration vs. choreography</h2>
      <p className="page-body">
        Orchestration means a central coordinator tells services what to do and when.
        Choreography means services react to events independently. The choice is not
        philosophical — it depends on whether you need to see the whole workflow in
        one place, and whether compensation (rollback) is complex.
      </p>

      <Decision question="When does orchestration beat choreography?">
        <Pill type="green">orchestration wins</Pill> When the workflow has compensation
        logic — if step 3 fails, undo steps 2 and 1 in a specific order. When you need
        a single place to see "where is this order in the pipeline?" When the workflow
        has timeouts, retries, and human approval steps. Temporal and AWS Step Functions
        give you durable execution: the workflow state survives process crashes, and you
        can replay from the last checkpoint. The tradeoff is a central dependency —
        the orchestrator is a single point of failure (mitigated by the platform's own
        replication).
      </Decision>

      <Decision question="When does choreography beat orchestration?">
        <Pill type="amber">choreography wins</Pill> When the downstream reactions are
        independent and don't need rollback. "Order confirmed" triggers: send email,
        update analytics, notify warehouse. Each consumer is independent — if email
        fails, analytics still works. No central coordinator needed. The tradeoff is
        visibility: when something goes wrong, you're grep-ing across 5 services'
        logs to reconstruct what happened. Add a correlation ID to every event to
        make this possible.
      </Decision>

      <Decision question="How do you handle compensation in a long-running workflow?">
        Each step in the workflow defines its compensating action upfront. Payment
        charged → compensate with refund. Inventory reserved → compensate with release.
        Shipping label created → compensate with cancellation. The orchestrator
        executes compensations in reverse order when a step fails. This is the Saga
        pattern — but the key insight is that compensations are not always symmetric.
        A refund is not "undo payment" — it is a new forward action with its own
        failure modes. Design compensations as first-class operations, not afterthoughts.
      </Decision>

      <Decision question="How do you version long-running workflows?">
        A workflow started on version 1 might run for days. You deploy version 2.
        Temporal handles this with workflow versioning — you branch on a version flag
        inside the workflow code, so in-flight v1 workflows continue on the old path
        while new workflows take the v2 path. The alternative is the "two-deployment"
        pattern: run v1 and v2 side by side, drain v1 over time. Never mutate a
        running workflow's definition in place — that is the #1 cause of workflow
        corruption.
      </Decision>

      <Decision question="Timeouts and deadlines — what most teams get wrong?">
        Every waiting state needs a timeout. Every timeout needs a fallback. "Wait
        for payment confirmation" without a deadline means an order can sit in
        PAYMENT_PENDING forever. Set a deadline (e.g., 30 minutes), define the
        timeout action (cancel order, release inventory), and make the timeout
        itself a state transition in your state machine. The deeper mistake: setting
        timeouts too short. A payment gateway having a bad 10 minutes causes mass
        cancellations. Use escalating timeouts: 5 min → retry, 15 min → alert,
        30 min → cancel.
      </Decision>

      <Insight>
        "I'd use Temporal for the order fulfillment workflow because the compensation
        chain is 4 steps deep — payment refund, inventory release, shipping
        cancellation, coupon restoration. I need that compensation logic in one
        place, testable as a unit. For the notification fanout after delivery, I'd
        use choreography — email, SMS, and push are independent, no rollback needed,
        and I don't want the notification system coupled to the orchestrator."
      </Insight>
    </div>
  );
}

/* ───────── Tab 2: Distributed State ───────── */
function DistributedStatePanel() {
  return (
    <div>
      <h2 className="page-section-title">Managing state across distributed systems</h2>
      <p className="page-body">
        The moment state lives on more than one machine, you are in coordination
        territory. Every tool here — locks, leader election, CRDTs — is a different
        answer to the same question: who is allowed to mutate this state right now?
      </p>

      <Decision question="Distributed locks — Redis SETNX vs. ZooKeeper?">
        <Pill type="amber">tradeoffs</Pill> Redis SETNX with TTL is simple and fast
        but fundamentally unsafe without fencing. The lock holder can pause (GC, network),
        the TTL expires, another process acquires the lock, and now two processes think
        they hold it. ZooKeeper uses ephemeral nodes with session heartbeats — if the
        holder dies, the session expires and the lock releases. More reliable, but
        operationally heavier. The right answer: if the lock protects an operation
        that must be mutually exclusive for correctness (not just efficiency), you
        need fencing tokens regardless of which lock service you use.
      </Decision>

      <Decision question="What is a fencing token and why is it essential?">
        <Pill type="green">correctness</Pill> A fencing token is a monotonically
        increasing number issued with each lock acquisition. The storage layer
        (database, object store) rejects any write with a token lower than the
        highest token it has seen. Even if a stale lock holder wakes up and tries
        to write, its old token is rejected. Without fencing, distributed locks
        provide mutual exclusion only in the happy path — which is exactly when
        you don't need them.
      </Decision>

      <Decision question="Optimistic vs. pessimistic locking — which and when?">
        Optimistic locking: read the current version, do your work, write with a
        version check (UPDATE ... WHERE version = X). If it fails, retry. Best when
        contention is low — most attempts succeed on the first try. Pessimistic locking:
        acquire a lock before reading, hold it through the write. Best when contention
        is high and retries are expensive (e.g., a complex computation you don't want
        to redo). The mistake is using pessimistic locking everywhere "to be safe" —
        you trade throughput for safety you may not need.
      </Decision>

      <Decision question="CRDTs — when do they actually help?">
        CRDTs (Conflict-free Replicated Data Types) let multiple replicas accept writes
        independently and merge deterministically — no coordination needed. G-Counters,
        LWW-Registers, OR-Sets. They shine in multi-region setups where you cannot
        afford cross-region latency on every write: collaborative editing, distributed
        counters, shopping cart merging. The limitation is that not every data structure
        has a natural CRDT. Order state machines are not CRDTs — state transitions have
        preconditions that require coordination.
      </Decision>

      <Decision question="Leader election — when do you need it?">
        When exactly one process must own a responsibility: running the cron scheduler,
        processing a specific partition, performing leader-only maintenance. Use
        ZooKeeper recipes, etcd lease-based election, or the database itself (row lock
        with heartbeat). The critical design: every leader-elected process must handle
        the "I was leader, now I'm not" transition gracefully. If the leader loses
        its lease mid-operation, it must stop writing — not finish its current batch.
        This is where fencing tokens reappear.
      </Decision>

      <Insight>
        "I wouldn't use a distributed lock here. The inventory decrement can use an
        atomic compare-and-swap in the database — UPDATE inventory SET qty = qty - 1
        WHERE product_id = ? AND qty {'>'} 0. If the row update returns zero affected
        rows, the item is out of stock. No lock, no coordination, no TTL to tune.
        Distributed locks are for when the operation spans multiple stores or takes
        significant time — not for single-row updates."
      </Insight>
    </div>
  );
}

/* ───────── Tab 3: Design Problem ───────── */
function DesignProblemPanel() {
  return (
    <div>
      <h2 className="page-section-title">Design Problem: Order Management System</h2>
      <p className="page-body">
        Design an order management system with explicit states: CREATED,
        PAYMENT_PENDING, CONFIRMED, PICKING, SHIPPED, DELIVERED — with cancellation
        possible from multiple states. This is the canonical state machine design
        problem.
      </p>

      <div style={{
        background: 'var(--bg-card)',
        borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '14px 18px', marginBottom: 16
      }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)', marginBottom: 6 }}>Requirements</p>
        <ul style={{ fontSize: 12, color: 'var(--text-p)', lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
          <li>States: CREATED → PAYMENT_PENDING → CONFIRMED → PICKING → SHIPPED → DELIVERED</li>
          <li>Cancellation allowed from CREATED, PAYMENT_PENDING, CONFIRMED (before picking starts)</li>
          <li>Cancellation from CONFIRMED requires inventory release + refund</li>
          <li>Each transition has guards (preconditions) and side effects (notifications, inventory)</li>
          <li>Concurrent updates must not corrupt state (two cancel requests, cancel + ship race)</li>
          <li>Full audit trail of every state transition with timestamp and actor</li>
        </ul>
      </div>

      <OrderStateDiagram />

      <Decision question="How do you structure the state machine gateway?">
        <Pill type="green">single entry point</Pill> All state mutations go through
        one function: transitionOrder(orderId, event, payload). This function: (1) loads
        the current order state, (2) looks up the transition in the table for
        (currentState, event), (3) evaluates the guard — e.g., for cancel from CONFIRMED,
        check that picking has not started, (4) performs an atomic compare-and-swap in
        the database: UPDATE orders SET state = nextState, version = version + 1
        WHERE id = ? AND state = currentState AND version = currentVersion,
        (5) if the update succeeds, executes side effects (emit events, send notifications),
        (6) pushes a record to the audit trail. No other code path touches the state column.
      </Decision>

      <Decision question="How do you handle cancellation from multiple states?">
        Each cancellable state has its own transition entry with a different compensation
        chain. Cancel from CREATED: no compensation needed, just mark cancelled. Cancel
        from PAYMENT_PENDING: cancel the payment attempt (if in flight). Cancel from
        CONFIRMED: release reserved inventory + initiate refund. The key insight: the
        state determines the compensation, not a generic "cancel" function that tries
        to figure out what needs undoing. This is why PICKING and SHIPPED are not
        cancellable — once physical work begins, cancellation becomes a return flow,
        which is a different state machine entirely.
      </Decision>

      <Decision question="How do you handle the cancel + ship race condition?">
        Two concurrent requests: a customer cancels while the warehouse marks the
        order as shipped. Both read state = CONFIRMED. Without protection, both
        succeed and the order is both CANCELLED and SHIPPED. The atomic compare-and-swap
        prevents this: both attempt UPDATE ... WHERE state = 'CONFIRMED'. Exactly
        one succeeds. The loser gets zero rows affected and must re-read the state
        to decide what to do. This is optimistic concurrency — no distributed locks,
        no blocking, just atomic writes with preconditions.
      </Decision>

      <Decision question="What does the audit trail look like?">
        Every transition appends to an immutable audit log: order_id, from_state,
        to_state, event, actor (user_id or system), timestamp, metadata (payment_id,
        tracking_number, etc.). This log is append-only — never update or delete
        entries. It serves three purposes: (1) debugging — reconstruct exactly what
        happened to any order, (2) compliance — who authorized the refund and when,
        (3) analytics — how long do orders spend in each state, where do they get
        stuck? Store it in the same transaction as the state change for consistency.
      </Decision>

      <Decision question="How would you scale this to 100K orders/day?">
        The state machine pattern scales naturally because each order is independent —
        there is no cross-order coordination. Shard by order_id. The compare-and-swap
        operates on a single row, so it does not create contention across orders.
        The side effects (email, inventory) are emitted as events and processed
        asynchronously by consumers. The bottleneck, if any, is the event bus — use
        Kafka partitioned by order_id to maintain per-order ordering while parallelizing
        across orders. The state machine gateway itself is stateless and horizontally
        scalable.
      </Decision>

      <Insight>
        "I'd put the entire transition table in one module — 30 lines of config that
        anyone can read. When the PM asks 'can we cancel a shipped order?' I point
        to the table: SHIPPED has no cancel transition. Adding it means defining the
        compensation (return label, refund, restock). That conversation happens in
        the config, not buried in if-statements across 6 services. The table IS the
        documentation."
      </Insight>
    </div>
  );
}

function OrderStateDiagram() {
  const fm = 'var(--font-mono)';
  const f = 'var(--font-body)';

  return (
    <div style={{ overflowX: 'auto', margin: '20px 0' }}>
      <svg viewBox="0 0 700 340" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', display: 'block' }}>
        <defs>
          <marker id="smArrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="var(--text-muted)" opacity="0.7" />
          </marker>
          <marker id="smArrowRed" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="var(--text-danger)" opacity="0.7" />
          </marker>
          <marker id="smArrowAccent" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="var(--text-accent)" opacity="0.8" />
          </marker>
        </defs>

        {/* Title */}
        <text x="350" y="20" textAnchor="middle" fontSize="13" fontWeight="400" fill="var(--text-h)" fontFamily="var(--font-display)">Order State Machine</text>
        <text x="350" y="34" textAnchor="middle" fontSize="9" fill="var(--text-muted)" fontFamily={fm}>happy path (blue) + cancellation (red)</text>

        {/* State boxes — happy path */}
        {[
          { x: 20,  y: 60,  label: 'CREATED',          sub: 'cart submitted' },
          { x: 130, y: 60,  label: 'PAYMENT_PENDING',   sub: 'awaiting gateway' },
          { x: 280, y: 60,  label: 'CONFIRMED',         sub: 'paid + reserved' },
          { x: 410, y: 60,  label: 'PICKING',           sub: 'warehouse active' },
          { x: 530, y: 60,  label: 'SHIPPED',           sub: 'in transit' },
          { x: 620, y: 60,  label: 'DELIVERED',         sub: 'completed' },
        ].map(({ x, y, label, sub }) => (
          <g key={label}>
            <rect x={x} y={y} width={label === 'PAYMENT_PENDING' ? 120 : (label === 'DELIVERED' ? 70 : 100)} height={42} rx={6}
              fill="var(--bg-card)" stroke="var(--border)" strokeWidth={1} />
            <text x={x + (label === 'PAYMENT_PENDING' ? 60 : (label === 'DELIVERED' ? 35 : 50))} y={y + 18}
              textAnchor="middle" fontSize={label === 'PAYMENT_PENDING' ? 8 : 9} fontWeight="600"
              fill="var(--text-h)" fontFamily={fm}>{label}</text>
            <text x={x + (label === 'PAYMENT_PENDING' ? 60 : (label === 'DELIVERED' ? 35 : 50))} y={y + 32}
              textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={f}>{sub}</text>
          </g>
        ))}

        {/* Happy path arrows */}
        <line x1="100" y1="81" x2="128" y2="81" stroke="var(--text-accent)" strokeWidth="1.2" markerEnd="url(#smArrowAccent)" />
        <line x1="250" y1="81" x2="278" y2="81" stroke="var(--text-accent)" strokeWidth="1.2" markerEnd="url(#smArrowAccent)" />
        <line x1="380" y1="81" x2="408" y2="81" stroke="var(--text-accent)" strokeWidth="1.2" markerEnd="url(#smArrowAccent)" />
        <line x1="510" y1="81" x2="528" y2="81" stroke="var(--text-accent)" strokeWidth="1.2" markerEnd="url(#smArrowAccent)" />
        <line x1="630" y1="81" x2="618" y2="81" stroke="var(--text-accent)" strokeWidth="1.2" markerEnd="url(#smArrowAccent)" />

        {/* CANCELLED state */}
        <rect x="200" y="180" width="100" height="42" rx={6}
          fill="var(--bg-danger, var(--bg-card))" stroke="var(--text-danger)" strokeWidth={1} opacity="0.9" />
        <text x="250" y="198" textAnchor="middle" fontSize="9" fontWeight="600"
          fill="var(--text-danger)" fontFamily={fm}>CANCELLED</text>
        <text x="250" y="212" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontFamily={f}>
          + compensation
        </text>

        {/* Cancel arrows from CREATED, PAYMENT_PENDING, CONFIRMED */}
        <polyline points="50,102 50,200 198,200" stroke="var(--text-danger)" strokeWidth="1" strokeDasharray="4 3" fill="none" markerEnd="url(#smArrowRed)" />
        <polyline points="190,102 190,190 198,190" stroke="var(--text-danger)" strokeWidth="1" strokeDasharray="4 3" fill="none" markerEnd="url(#smArrowRed)" />
        <polyline points="330,102 330,200 302,200" stroke="var(--text-danger)" strokeWidth="1" strokeDasharray="4 3" fill="none" markerEnd="url(#smArrowRed)" />

        {/* Cancel labels */}
        <text x="55" y="150" fontSize="7" fill="var(--text-danger)" fontFamily={fm}>cancel</text>
        <text x="195" y="145" fontSize="7" fill="var(--text-danger)" fontFamily={fm}>cancel</text>
        <text x="310" y="150" fontSize="7" fill="var(--text-danger)" fontFamily={fm} textAnchor="end">cancel + refund</text>

        {/* Legend */}
        <g>
          <rect x="20" y="260" width="660" height="60" rx={6} fill="var(--bg-card)" stroke="var(--border)" strokeWidth={0.6} />
          <text x="35" y="280" fontSize="8" fontWeight="700" fill="var(--text-accent)" fontFamily={fm} letterSpacing="0.08em">KEY DECISIONS</text>
          <text x="35" y="300" fontSize="8" fill="var(--text-p)" fontFamily={f}>Atomic CAS on state column prevents race conditions</text>
          <text x="320" y="300" fontSize="8" fill="var(--text-muted)" fontFamily={f}>&middot;</text>
          <text x="332" y="300" fontSize="8" fill="var(--text-p)" fontFamily={f}>Cancel compensation varies by source state</text>
          <text x="540" y="300" fontSize="8" fill="var(--text-muted)" fontFamily={f}>&middot;</text>
          <text x="552" y="300" fontSize="8" fill="var(--text-p)" fontFamily={f}>PICKING+ = no cancel (return flow)</text>
        </g>
      </svg>
    </div>
  );
}

/* ───────── Tab 4: Anti-patterns ───────── */
function AntiPatternsPanel() {
  return (
    <div>
      <h2 className="page-section-title">Common misconceptions</h2>
      <p className="page-body">
        These answers reveal that you've read about state machines but never built one
        that survived production traffic, concurrent users, and the PM changing
        requirements mid-sprint.
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
        Every weak answer treats state as a passive field to read and write. Every
        strong answer treats state as a controlled transition with preconditions,
        side effects, and atomic persistence. The difference is not knowledge — it's
        whether you've been woken up at 3 AM by an order stuck in an impossible
        state and vowed never again.
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
