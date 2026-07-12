import { useState } from 'react';
import TabNav from '../components/TabNav';
import TabTransition from '../components/TabTransition';
import Decision, { Pill } from '../components/Decision';
import Insight from '../components/Insight';

const TABS = ['Health Checks', 'Auto-Recovery', 'Distributed Tracing', 'SLOs & Alerting', 'Anti-patterns'];

export default function Observability() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <p className="page-eyebrow">Framework 09</p>
      <h1 className="page-title">Self-Healing & Observability</h1>
      <p className="page-subtitle">
        Observability is not dashboards. It is the ability to ask arbitrary questions
        about your production system without deploying new code. Self-healing is not
        "auto-restart" — it is building systems that converge toward a desired state
        even when components fail. The question isn't whether things break — it's
        whether you find out before your users do, and whether the system can fix
        itself while you sleep.
      </p>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      <TabTransition activeKey={tab}>

      {tab === 0 && <HealthChecksPanel />}
      {tab === 1 && <AutoRecoveryPanel />}
      {tab === 2 && <DistributedTracingPanel />}
      {tab === 3 && <SLOsPanel />}
      {tab === 4 && <AntiPatternsPanel />}
      </TabTransition>
    </div>
  );
}

/* ─────────── Tab 0: Health Checks ─────────── */

function HealthChecksPanel() {
  return (
    <div>
      <h2 className="page-section-title">Liveness vs readiness vs startup probes</h2>
      <p className="page-body">
        Kubernetes defines three probe types and most engineers conflate them. Getting
        this wrong causes cascading restarts during deploys, connection storms on boot,
        or pods that serve traffic before they can handle it. Each probe answers a
        different question about your process.
      </p>

      <Decision question="When should a liveness probe fail?">
        <Pill type="red">critical</Pill> Only when the process is irrecoverably stuck —
        deadlocked threads, corrupted heap, infinite loop. A liveness failure kills the
        pod and restarts it. If your liveness probe checks the database and the DB is
        down, Kubernetes will restart every pod in the cluster simultaneously. Now
        you have a DB outage AND a compute outage. Liveness should check "is this
        process alive?" — not "is this process useful?" A simple HTTP 200 from a
        dedicated /healthz endpoint that does zero I/O is the gold standard.
      </Decision>

      <Decision question="What belongs in a readiness probe?">
        Readiness controls whether a pod receives traffic. This is where you check
        dependencies: can we connect to the database? Is the cache warm? Have we
        loaded the ML model into memory? A failing readiness probe removes the pod
        from the Service's endpoint list — traffic shifts to healthy pods. The pod
        stays alive, keeps retrying, and re-enters the pool when it recovers. This
        is the correct probe for dependency checks.
      </Decision>

      <Decision question="Why do startup probes exist?">
        Java apps, ML models, and anything that loads large datasets on boot can take
        30-120 seconds to start. Without a startup probe, you must set liveness
        initialDelaySeconds high enough to cover the worst-case boot time — which
        means a deadlocked pod sits around that long before getting killed. Startup
        probes run only during boot: they disable liveness checks until the app
        signals ready. After startup succeeds, liveness takes over with tight
        intervals. Use failureThreshold * periodSeconds to define your max boot
        window.
      </Decision>

      <Decision question="How do you prevent health check cascading failures?">
        <Pill type="red">critical</Pill> Deep health checks that call downstream
        services create a dependency chain: Service A's health depends on Service B,
        which depends on Service C. If C goes down, A and B both report unhealthy,
        triggering restarts across the entire mesh. The fix: readiness checks should
        verify that YOUR process can reach its direct dependencies, not that the
        entire dependency graph is healthy. Each service owns exactly one layer of
        health. Additionally, health checks should have aggressive timeouts (200ms)
        so a slow dependency doesn't block the probe response.
      </Decision>

      <Decision question="When do health check endpoints lie?">
        An endpoint that returns 200 OK while silently dropping 30% of requests is
        the most dangerous kind of healthy. Health checks lie when they test a
        different code path than production traffic. Your /health endpoint hits a
        connection pool, gets a connection, returns 200 — but production queries
        timeout because the pool is exhausted by slow queries. The fix: health
        checks should exercise the same pool, the same parsing, the same hot path.
        Some teams add a "deep health" endpoint that runs a lightweight query
        end-to-end — SELECT 1 through the ORM, not a raw TCP check.
      </Decision>

      <Insight>
        "I'd configure liveness as a simple process-alive check with zero I/O — just
        return 200 from a dedicated handler. Readiness would verify the DB connection
        pool and cache connectivity, with a 200ms timeout so a slow dependency can't
        block the probe. Startup probe gives the JVM 90 seconds to warm up with
        failureThreshold=30 and periodSeconds=3. The key design principle: liveness
        never checks external dependencies, readiness checks only direct dependencies,
        and every probe has an aggressive timeout to prevent cascading."
      </Insight>
    </div>
  );
}

/* ─────────── Tab 1: Auto-Recovery ─────────── */

function AutoRecoveryPanel() {
  return (
    <div>
      <h2 className="page-section-title">Reconciliation loops and self-healing controllers</h2>
      <p className="page-body">
        Self-healing systems don't react to failures — they continuously reconcile
        desired state with actual state. The difference matters: event-driven recovery
        can miss events, but a reconciliation loop will always converge. Kubernetes
        itself is built on this pattern — every controller is a reconciliation loop.
      </p>

      <Decision question="How does the reconciliation loop pattern work?">
        Store the desired state declaratively (e.g., "3 replicas of service X"). A
        controller continuously observes the actual state, computes the diff, and
        takes the minimum action to converge. If a pod dies, the controller doesn't
        know why — it just sees "actual=2, desired=3" and creates one. This is more
        robust than event-driven recovery because it handles missed events, partial
        failures, and operator errors identically. The loop interval determines your
        recovery latency. Kubernetes controllers run every 10 seconds by default.
      </Decision>

      <Decision question="When should you build a Kubernetes operator?">
        <Pill type="amber">judgment</Pill> Operators encode domain-specific operational
        knowledge into a controller. Build one when your application has complex
        lifecycle operations that can't be expressed as Deployments — database failover,
        certificate rotation, schema migration sequencing. Don't build one for simple
        stateless apps. The operator pattern is powerful but expensive: you're writing
        a distributed system to manage a distributed system. Use the Operator SDK or
        Kubebuilder, implement leader election, and make every reconciliation
        idempotent. A buggy operator is worse than manual operations.
      </Decision>

      <Decision question="How does automatic failover work in leader election?">
        Leader election requires a consensus protocol (Raft, Paxos) or a lease
        mechanism (etcd, ZooKeeper, DynamoDB). The leader holds a lease with a TTL.
        If the leader fails to renew, a follower acquires the lease and promotes
        itself. The critical design decision is the lease duration: too short and
        you get false failovers during GC pauses or network blips. Too long and
        you have extended downtime. Most systems use 10-30 second leases with a
        renewal interval of lease/3. For database replica promotion, the new leader
        must also handle the split-brain window — what if the old leader is still
        alive and accepting writes?
      </Decision>

      <Decision question="How should circuit breaker auto-recovery work?">
        A circuit breaker has three states: closed (normal), open (failing fast),
        half-open (testing recovery). The anti-pattern is opening the circuit and
        requiring manual intervention to close it. Instead, after a configurable
        timeout (30-60s), transition to half-open and send a single probe request.
        If it succeeds, close the circuit. If it fails, reset the timeout with
        exponential backoff. The key insight: the half-open state should send
        real traffic, not synthetic health checks — a health check that passes
        while production traffic fails gives false confidence.
      </Decision>

      <Decision question="Why must recovery operations be idempotent?">
        <Pill type="red">critical</Pill> Recovery loops retry by design. If "promote
        replica to primary" is not idempotent, running it twice creates two primaries
        (split-brain). If "reprocess failed messages" is not idempotent, you double-
        charge customers. Every recovery operation must be safe to run N times with
        the same result. Use unique operation IDs, check-before-act patterns, and
        conditional writes (e.g., "UPDATE ... WHERE status = 'failed'"). Design
        recovery as convergence toward a state, not execution of an action.
      </Decision>

      <Insight>
        "I'd model the system as a reconciliation loop, not an event handler. The
        controller reads desired state from a config store, observes actual state
        from the infrastructure, computes the diff, and takes the minimum idempotent
        action to converge. If a failover runs twice, the second run is a no-op
        because the state already matches. This handles missed events, partial
        failures, and operator errors identically — the system converges regardless
        of how it got into its current state."
      </Insight>
    </div>
  );
}

/* ─────────── Tab 2: Distributed Tracing ─────────── */

function DistributedTracingPanel() {
  return (
    <div>
      <h2 className="page-section-title">Trace context propagation and sampling</h2>
      <p className="page-body">
        In a monolith, a stack trace tells you what happened. In microservices, a
        single user request fans out across 10-50 services. Without distributed
        tracing, debugging is grep across 50 log streams and hoping the timestamps
        align. Tracing reconstructs the causal chain — but only if you propagate
        context correctly and sample intelligently.
      </p>

      <Decision question="How does trace context propagation work?">
        Every incoming request gets a trace ID (128-bit random). Each unit of work
        within a service creates a span with a unique span ID and a pointer to its
        parent span. The trace ID and parent span ID are propagated to downstream
        services via HTTP headers (W3C Trace Context: traceparent, tracestate) or
        gRPC metadata. The critical failure mode: any service that doesn't propagate
        headers breaks the trace chain. This is why OpenTelemetry auto-instrumentation
        matters — it injects propagation into HTTP clients and servers without manual
        code. For async messaging (Kafka, SQS), propagate trace context in message
        headers, not the payload.
      </Decision>

      <Decision question="Head-based vs tail-based sampling — when does it matter?">
        <Pill type="amber">judgment</Pill> Head-based sampling decides at the trace
        root: "sample this request at 1%." It's simple and predictable but misses
        rare errors — if only 0.01% of requests fail, 1% sampling captures almost
        none of them. Tail-based sampling buffers complete traces and decides after
        the fact: "keep all traces with errors, keep all traces slower than p99,
        sample 1% of everything else." It captures every interesting trace but
        requires buffering all spans temporarily, which is expensive. At scale,
        use tail-based sampling with a collector tier (OpenTelemetry Collector with
        tail_sampling processor). Below 10K RPS, head-based at 100% is often
        cheaper than the collector infrastructure.
      </Decision>

      <Decision question="How do you correlate logs, metrics, and traces?">
        The three pillars are only useful when connected. Inject the trace ID into
        every structured log line (traceId field in JSON logs). Attach trace
        exemplars to metrics — when a p99 latency spike appears on a dashboard,
        click through to the exact trace that caused it. Prometheus supports
        exemplars natively. The correlation pattern: metric alert fires, you click
        the exemplar to see the trace, the trace shows the slow span, you click the
        span to see the correlated logs from that service during that request.
        Without this chain, you're context-switching between three separate tools.
      </Decision>

      <Decision question="What makes good span design and naming?">
        Spans should represent logical operations, not function calls. "process-
        payment" is a good span name. "handleRequest" is useless. Include semantic
        attributes: db.system, db.statement (sanitized), http.method, http.status_code,
        rpc.service. Set span status to ERROR on failures. The anti-pattern is
        creating too many spans — 500 spans per trace makes the waterfall unreadable
        and the storage cost explode. A typical well-instrumented request should have
        10-30 spans covering HTTP calls, database queries, cache lookups, and queue
        publishes. Internal function calls rarely need their own spans.
      </Decision>

      <Decision question="What is trace-based testing?">
        Instead of mocking service boundaries, run an integration test, capture the
        trace, and assert on span attributes. "The payment trace should contain a
        span named 'charge-card' with attribute payment.amount {'>'} 0 and status OK."
        This tests the actual distributed behavior, not a mock. Tools like Tracetest
        and Malabi enable this. The trade-off: these tests are slower and require
        the full system running, but they catch integration bugs that unit tests
        miss — like a service that swallows errors and returns 200.
      </Decision>

      <Insight>
        "I'd instrument with OpenTelemetry SDK for vendor-neutral telemetry, export
        to an OTel Collector, and use tail-based sampling to keep 100% of error
        traces and p99+ latency traces while sampling 1% of normal traffic. Every
        structured log line includes the trace ID so I can pivot from a metric
        alert to the exact trace to the correlated logs in three clicks. Span
        names follow the 'verb-noun' convention — 'charge-card', 'fetch-user',
        'publish-event' — with semantic attributes for filtering."
      </Insight>
    </div>
  );
}

/* ─────────── Tab 3: SLOs & Alerting ─────────── */

function SLOsPanel() {
  return (
    <div>
      <h2 className="page-section-title">Error budgets, burn rates, and alerts that matter</h2>
      <p className="page-body">
        SLOs transform reliability from a vague aspiration into a measurable
        engineering constraint. Without an error budget, every reliability
        improvement competes with features for priority. With one, the question
        becomes "can we afford to ship this?" — and the data answers it.
      </p>

      <Decision question="How does the SLI/SLO/SLA hierarchy work?">
        SLI (Service Level Indicator) is the metric: "proportion of requests
        completing in under 300ms." SLO (Service Level Objective) is the target:
        "99.9% of requests in under 300ms over a 30-day rolling window." SLA
        (Service Level Agreement) is the contractual commitment with financial
        penalties — typically looser than the SLO. The SLO is the internal bar
        your team holds itself to. The SLA is the external promise to customers.
        Set SLO tighter than SLA so you catch degradation before it becomes a
        contract breach. Common mistake: setting SLOs on infrastructure metrics
        (CPU, memory) instead of user-facing outcomes (latency, error rate,
        throughput).
      </Decision>

      <Decision question="What is an error budget and how do you use it?">
        <Pill type="red">critical</Pill> If your SLO is 99.9% availability over
        30 days, your error budget is 0.1% — roughly 43 minutes of downtime. The
        error budget is not a target; it is permission to take risks. When you have
        budget remaining, ship features aggressively. When the budget is exhausted,
        freeze deployments and focus on reliability. This creates a natural feedback
        loop: unreliable systems automatically slow down feature velocity. The
        error budget also resolves the eternal dev-vs-ops tension — both teams
        share a single number that balances innovation and stability.
      </Decision>

      <Decision question="Why is burn rate alerting better than threshold alerting?">
        A naive alert — "fire if error rate exceeds 1%" — doesn't tell you whether
        you'll exhaust your error budget. A 1.5% error rate for 2 minutes is noise.
        A 1.5% error rate for 6 hours exhausts your monthly budget. Burn rate
        measures how fast you're consuming budget: a burn rate of 1x means you'll
        exactly exhaust the budget at the end of the window. 10x means you'll
        exhaust it in 3 days. Alert on multi-window burn rates: a fast burn (14.4x
        over 5 minutes, sustained for 1 hour) pages immediately. A slow burn (3x
        over 6 hours) creates a ticket. This eliminates alert fatigue from transient
        spikes while catching sustained degradation early.
      </Decision>

      <Decision question="Symptom-based vs cause-based alerts — which should page?">
        <Pill type="amber">judgment</Pill> Symptom-based alerts fire on user impact:
        "error rate for /checkout exceeded SLO burn rate." Cause-based alerts fire
        on infrastructure state: "disk at 90%." Only symptom-based alerts should
        page an on-call engineer, because they represent user impact NOW. Cause-based
        alerts should create tickets for proactive remediation. The anti-pattern is
        paging on "disk at 90%" when the disk is a scratch volume that gets cleaned
        up every hour — it causes alert fatigue, which causes engineers to ignore
        pages, which causes real incidents to go unnoticed. Every page should
        require immediate human action. If it doesn't, it's a ticket.
      </Decision>

      <Decision question="What makes a dashboard useful vs one that lies?">
        Dashboards lie when they aggregate away the signal. An average latency of
        100ms hides a p99 of 3 seconds. A global error rate of 0.1% hides a single
        endpoint at 15% errors. Useful dashboards: show percentiles (p50, p95, p99),
        not averages. Break down by endpoint, customer tier, and region. Display
        error budget burn rate as a first-class metric. Show the rate of change,
        not just the current value. Include a "time since last deploy" marker so
        you can visually correlate deploys with metric changes. The RED method
        (Rate, Errors, Duration) for services and USE method (Utilization,
        Saturation, Errors) for resources provide a starting framework.
      </Decision>

      <Insight>
        "I'd set SLOs on user-facing outcomes — 99.9% of /checkout requests
        complete successfully in under 500ms over a 30-day window. That gives a
        43-minute error budget. I'd alert on burn rate: 14.4x over 5 minutes
        sustained for 1 hour pages the on-call. 3x over 6 hours creates a ticket.
        Dashboards show p50/p95/p99 latency per endpoint with deploy markers and
        error budget burn overlaid. Every alert has a runbook link — if you page
        someone at 3am, they shouldn't have to think about what to do first."
      </Insight>
    </div>
  );
}

/* ─────────── Tab 4: Anti-patterns ─────────── */

function AntiPatternsPanel() {
  const antis = [
    {
      bad: 'I\'ll add health checks to every service to make sure they\'re all running.',
      good: 'I\'d use liveness probes with zero I/O to detect stuck processes, readiness probes that check direct dependencies with 200ms timeouts, and startup probes for slow-booting services. Liveness never checks external dependencies — that prevents a database outage from cascading into a compute outage via mass pod restarts.'
    },
    {
      bad: 'We\'ll set up Prometheus and Grafana for monitoring.',
      good: 'I\'d define SLOs on user-facing outcomes first — 99.9% of checkout requests under 500ms. Then instrument with OpenTelemetry to emit the SLIs that measure those SLOs. Dashboards show error budget burn rate, not raw metrics. The tooling serves the SLOs, not the other way around.'
    },
    {
      bad: 'If a service goes down, we\'ll restart it automatically.',
      good: 'I\'d build a reconciliation loop that continuously compares desired state to actual state and takes the minimum idempotent action to converge. A restart is one possible action, but the controller might also promote a replica, redirect traffic, or scale horizontally — depending on what convergence requires.'
    },
    {
      bad: 'We\'ll use distributed tracing to debug production issues.',
      good: 'I\'d instrument with OpenTelemetry and use tail-based sampling to capture 100% of error traces and p99+ latency traces while sampling 1% of normal traffic. Every log line includes the trace ID for correlation. The goal isn\'t "tracing exists" — it\'s "I can go from a metric alert to the exact failing span to the correlated logs in three clicks."'
    },
    {
      bad: 'We\'ll alert on everything so we don\'t miss incidents.',
      good: 'I\'d alert only on symptoms — user-facing impact measured against SLO burn rates. A fast burn (14.4x over 5 minutes, sustained 1 hour) pages immediately. A slow burn (3x over 6 hours) creates a ticket. Infrastructure metrics like CPU and disk are ticket-worthy, never page-worthy. Every alert has a runbook. If an alert fires and nobody needs to act, delete it.'
    },
    {
      bad: 'Our dashboards show all the metrics from every service.',
      good: 'I\'d organize dashboards around the RED method for services (Rate, Errors, Duration) and USE method for resources (Utilization, Saturation, Errors). Show percentiles not averages, break down by endpoint and customer tier, overlay deploy markers, and put error budget burn as the top-level metric. A dashboard with 50 panels helps nobody — 6 panels that answer "is this service healthy right now?" help everyone.'
    },
  ];

  return (
    <div>
      <h2 className="page-section-title">What not to say</h2>
      <p className="page-body">
        These answers reveal tool-centric thinking — naming technologies without
        explaining what problem they solve or how they fit together. The fix:
        start with the outcome (SLOs, recovery time, debugging speed), then
        choose the mechanism.
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
        Weak observability answers list tools — Prometheus, Grafana, Jaeger,
        PagerDuty. Strong answers describe a system: SLOs define what "healthy"
        means, SLIs measure it, error budgets create accountability, burn rate
        alerts catch degradation before users notice, traces connect symptoms
        to causes, and reconciliation loops fix problems without human intervention.
        The tools are interchangeable. The system design is what matters.
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
