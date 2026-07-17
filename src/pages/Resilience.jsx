import { useState } from 'react';
import TabNav from '../components/TabNav';
import TabTransition from '../components/TabTransition';
import Decision, { Pill } from '../components/Decision';
import Insight from '../components/Insight';

const TABS = [
  'Circuit Breakers',
  'Retries & Backoff',
  'Bulkheads & Isolation',
  'Graceful Degradation',
  'Anti-patterns',
];

/* ───────── Tab 0: Circuit Breakers ───────── */
function CircuitBreakersPanel() {
  return (
    <>
      <h2 className="page-section-title">The Three States That Save Your Uptime</h2>
      <p className="page-body">
        Circuit breakers are modeled after electrical fuses: once a downstream
        dependency starts failing, you stop hammering it and fail fast locally.
        The three states -- closed (healthy), open (tripped), and half-open
        (probing) -- form a simple state machine that every staff engineer
        should be able to whiteboard from memory.
      </p>

      <Decision question="Walk me through the circuit breaker state machine and how you'd tune the thresholds.">
        <p className="page-body">
          <Pill type="green">Closed</Pill> All requests pass through. You
          track a rolling failure counter (or failure rate over a sliding
          window). When failures hit your threshold -- say 50% error rate
          over the last 20 requests -- the breaker <strong>trips</strong>.
        </p>
        <p className="page-body">
          <Pill type="red">Open</Pill> All requests are immediately rejected
          or routed to a fallback. No traffic reaches the dependency. A
          timeout timer starts (e.g. 30 seconds). This is where you protect
          your own latency budget and protect the downstream from a stampede.
        </p>
        <p className="page-body">
          <Pill type="amber">Half-Open</Pill> After the timeout, you let a
          small number of probe requests through (typically 1-5). If they
          succeed, you transition back to Closed and reset counters. If they
          fail, you go back to Open and restart the timer -- often with an
          increased timeout (exponential backoff on the breaker itself).
        </p>
        <p className="page-body">
          Tuning is the hard part. A rolling window of 10 requests with a
          50% threshold trips on 5 failures -- too sensitive for a bursty
          service. A window of 100 requests takes too long to trip during a
          real outage. The right answer is: <strong>match the window to your
          SLO.</strong> If your p99 latency budget is 500ms and the
          dependency adds 200ms, you can tolerate ~2-3 consecutive timeouts
          before your SLO blows. That's your window.
        </p>
      </Decision>

      <Decision question="Should you have one circuit breaker per service, or one per dependency endpoint?">
        <p className="page-body">
          <Pill type="green">Per-dependency, always.</Pill> A single breaker
          for all of "payment-service" means a failing /refund endpoint
          trips the breaker and blocks healthy /charge calls. This is the
          number one mistake I see in production breaker configs.
        </p>
        <p className="page-body">
          Go further: partition by <strong>dependency + operation +
          priority</strong>. Your read path to a cache should have a
          different breaker than your write path to the same cache. Reads
          can fall back to origin; writes may need to queue. Different
          failure modes, different breakers.
        </p>
        <p className="page-body">
          At staff+ scale, you should also consider <strong>per-tenant
          breakers</strong>. One noisy tenant causing failures shouldn't
          trip the breaker for everyone. This is where bulkhead + breaker
          composition matters.
        </p>
      </Decision>

      <Decision question="What are your fallback strategies when a breaker is open?">
        <p className="page-body">
          Fallbacks are not optional -- an open breaker without a fallback
          is just a faster error. The hierarchy:
        </p>
        <p className="page-body">
          <strong>1. Cached/stale data</strong> -- serve the last known good
          response. Works for read-heavy paths. Set a staleness budget (e.g.
          "stale up to 5 minutes is acceptable for product catalog").
        </p>
        <p className="page-body">
          <strong>2. Degraded response</strong> -- return a partial result.
          Search results without personalization. Product page without
          reviews. The feature flag for each degradation should already exist.
        </p>
        <p className="page-body">
          <strong>3. Default/static response</strong> -- hardcoded safe
          defaults. "Free shipping" banner when the shipping calculator is
          down. Better than an error.
        </p>
        <p className="page-body">
          <strong>4. Queue for later</strong> -- for writes, accept the
          request into a durable queue and process when the dependency
          recovers. This changes your consistency model from synchronous to
          eventual -- make sure the caller can handle it.
        </p>
      </Decision>

      <Decision question="When should you NOT use a circuit breaker?">
        <p className="page-body">
          <Pill type="red">Don't breaker critical-path writes.</Pill> If you
          can't lose the operation (financial transactions, order placement),
          a circuit breaker that silently drops requests is worse than a slow
          retry. Use <strong>queues + retries</strong> instead.
        </p>
        <p className="page-body">
          <Pill type="amber">Don't breaker fast-fail dependencies.</Pill> If
          the dependency already returns errors in 5ms, a breaker adds
          complexity without value. Breakers shine when the failure mode is
          <em>timeouts</em> (slow failures), not fast rejections.
        </p>
        <p className="page-body">
          Don't use breakers as a substitute for proper capacity planning.
          If your breaker trips every day at peak, the fix is scaling, not
          a better breaker config.
        </p>
      </Decision>

      <Insight tag="Staff+ signal">
        "A circuit breaker is an admission that you can't control your
        dependencies, but you can control how you fail. The senior move is
        designing the fallback before you design the happy path -- because
        in distributed systems, the fallback IS the happy path 30% of the
        time."
      </Insight>
    </>
  );
}

/* ───────── Tab 1: Retries & Backoff ───────── */
function RetriesPanel() {
  return (
    <>
      <h2 className="page-section-title">Retries: The Most Dangerous Reliability Pattern</h2>
      <p className="page-body">
        Retries are trivial to implement and catastrophic to get wrong. An
        uncontrolled retry on a failing service doesn't just waste resources --
        it actively makes the outage worse. Every retry is another request on
        a system that's already drowning.
      </p>

      <Decision question="Explain exponential backoff with jitter. Why is jitter critical?">
        <p className="page-body">
          Exponential backoff alone creates <strong>thundering herd</strong>
          {' '}problems. If 1000 clients all fail at T=0 and retry at T=1s,
          T=2s, T=4s -- they all hit the server at exactly the same
          intervals. The server recovers, gets slammed, fails again. Repeat.
        </p>
        <p className="page-body">
          <Pill type="green">Full jitter</Pill> is the gold standard:
          {' '}<code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          sleep = random(0, min(cap, base * 2^attempt))</code>. This
          spreads retries uniformly across the backoff window. AWS's own
          analysis showed full jitter completes all work fastest with the
          fewest total calls.
        </p>
        <p className="page-body">
          <Pill type="amber">Decorrelated jitter</Pill> is an alternative:
          {' '}<code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          sleep = min(cap, random(base, prev_sleep * 3))</code>. Slightly
          more aggressive on early retries, slightly more spread on later
          ones. Either works; just never use plain exponential without jitter.
        </p>
      </Decision>

      <Decision question="What is a retry budget and why does it matter more than per-request retry counts?">
        <p className="page-body">
          A per-request retry count of 3 sounds harmless. But with 10,000
          RPS, 3 retries means up to 30,000 RPS hitting a failing service.
          <strong> That's a 3x amplification factor.</strong>
        </p>
        <p className="page-body">
          <Pill type="green">Retry budgets</Pill> cap the total retry traffic
          as a percentage of successful traffic. Google's SRE book recommends
          no more than <strong>10% retry ratio</strong>. If you're processing
          100 RPS successfully, you're allowed at most 10 retries/second
          across all requests. Once the budget is exhausted, new failures
          fail fast without retrying.
        </p>
        <p className="page-body">
          Implementation: maintain a token bucket or sliding window counter
          of (retries / total requests). When the ratio exceeds your budget,
          disable retries globally. This turns a potential 3x amplification
          into a controlled 1.1x.
        </p>
        <p className="page-body">
          At staff+ level, you should also track retry budgets <strong>per
          downstream dependency</strong>, not just globally. A failing cache
          shouldn't consume the retry budget for your database calls.
        </p>
      </Decision>

      <Decision question="Which errors are retryable? Walk me through the decision tree.">
        <p className="page-body">
          <Pill type="green">Retryable</Pill> 503 (Service Unavailable),
          429 (Rate Limited -- but respect Retry-After header), connection
          refused, connection reset, DNS resolution failure (transient).
          These indicate the server can't handle the request <em>right
          now</em> but might be able to later.
        </p>
        <p className="page-body">
          <Pill type="red">Never retry</Pill> 400 (Bad Request), 401
          (Unauthorized), 403 (Forbidden), 404 (Not Found), 409 (Conflict),
          422 (Unprocessable). These are deterministic -- retrying won't
          change the outcome. Retrying a 400 is a bug.
        </p>
        <p className="page-body">
          <Pill type="amber">It depends</Pill> Timeouts (408, socket
          timeout) are retryable only if the operation is <strong>
          idempotent</strong>. A GET? Retry. A POST that creates an order?
          Only if you have an idempotency key. A timeout doesn't mean the
          request failed -- it might have succeeded and you just didn't get
          the response. Retrying a non-idempotent timeout can double-charge
          customers.
        </p>
        <p className="page-body">
          500 (Internal Server Error) is a gray area. Some 500s are
          transient (OOM, deadlock), some are deterministic (null pointer
          on this specific input). Default: retry once, then stop.
        </p>
      </Decision>

      <Decision question="How do retry storms cause cascading failures?">
        <p className="page-body">
          Picture a three-tier system: Frontend {'→'} Service A {'→'} Service B.
          Service B starts timing out. Service A retries 3x per request.
          Now Service A is also slow (waiting on retries). Frontend retries
          Service A 3x. That's <strong>3 x 3 = 9 requests</strong> hitting
          Service B for every 1 user request.
        </p>
        <p className="page-body">
          Each layer multiplies. With 4 layers and 3 retries each, a single
          user request can generate <strong>81 downstream requests</strong>.
          This is why per-layer retry budgets and circuit breakers must work
          together. The breaker trips to stop the flood; the retry budget
          caps the pre-trip amplification.
        </p>
        <p className="page-body">
          The staff+ answer: <strong>only retry at the edge.</strong> The
          service closest to the user retries. Internal services between
          layers should fail fast and propagate errors up. If every layer
          retries independently, you get multiplicative amplification. If
          only the edge retries, you get additive overhead.
        </p>
      </Decision>

      <Insight>
        "The first question I ask when reviewing a retry policy isn't 'how
        many retries?' -- it's 'what happens to the downstream when every
        client retries at once?' If you can't answer that, you're not
        designing for resilience, you're designing a DDoS tool."
      </Insight>
    </>
  );
}

/* ───────── Tab 2: Bulkheads & Isolation ───────── */
function BulkheadsPanel() {
  return (
    <>
      <h2 className="page-section-title">Contain the Blast Radius</h2>
      <p className="page-body">
        The bulkhead pattern comes from ship design: compartments that
        prevent a hull breach from sinking the entire vessel. In software,
        it means isolating failures so that one degraded component can't
        take down unrelated functionality.
      </p>

      <Decision question="Thread pool isolation vs semaphore isolation -- when do you use each?">
        <p className="page-body">
          <Pill type="green">Thread pool isolation</Pill> gives each
          dependency its own fixed-size thread pool. If the payment service
          starts timing out, it exhausts its 20 threads but can't touch
          the 20 threads allocated to the inventory service. This is the
          Hystrix model. Cost: context switching overhead and the memory
          footprint of extra thread pools.
        </p>
        <p className="page-body">
          <Pill type="amber">Semaphore isolation</Pill> uses a counter
          (permit) to limit concurrent calls to a dependency without
          creating separate threads. Lighter weight, but no timeout control
          -- if the dependency hangs, the calling thread hangs too. Use
          for fast, in-memory calls or when you have your own timeout
          mechanism (like a circuit breaker with timeout).
        </p>
        <p className="page-body">
          The modern answer in async/reactive systems: <strong>neither</strong>.
          You use connection pool limits and request-scoped timeouts.
          resilience4j's bulkhead is a semaphore that rejects when permits
          are exhausted. In Go, you'd use a buffered channel as a semaphore.
          Thread pool isolation is a JVM-specific pattern from the
          thread-per-request era.
        </p>
      </Decision>

      <Decision question="Explain cell architecture (swim lanes) and when it's worth the operational cost.">
        <p className="page-body">
          Cell architecture partitions your entire stack into independent,
          self-contained units -- each cell handles a subset of customers
          and has its own databases, caches, queues, and compute. A failure
          in Cell A can't propagate to Cell B because they share nothing.
        </p>
        <p className="page-body">
          <Pill type="green">When to use it</Pill> You're at a scale where
          a single blast radius is existential. AWS uses cells internally
          (each Availability Zone in some services is a cell). Slack rebuilt
          on cell architecture after outages where a single shard failure
          cascaded globally. It's appropriate when you have 10M+ users and
          a global outage costs millions per minute.
        </p>
        <p className="page-body">
          <Pill type="red">The cost is enormous.</Pill> You need a routing
          layer that pins customers to cells. Cross-cell operations (friend
          lists spanning cells, global search) require either data
          replication or cross-cell RPCs -- which reintroduces coupling.
          Deployments get harder (do you deploy to all cells simultaneously
          or canary cell-by-cell?). Monitoring multiplies. Don't architect
          cells until your blast radius actually justifies it.
        </p>
      </Decision>

      <Decision question="How does connection pool partitioning act as a bulkhead?">
        <p className="page-body">
          A single shared connection pool to a database means any query
          pattern can exhaust all connections. A slow analytics query holds
          50 connections while your latency-sensitive user-facing queries
          queue behind it.
        </p>
        <p className="page-body">
          Partition into <strong>priority pools</strong>: 70% of connections
          for the critical read path, 20% for writes, 10% for background
          jobs. Even if background jobs hang, they can only exhaust their
          10% -- the read path keeps serving.
        </p>
        <p className="page-body">
          In practice: use separate database users or connection pool
          instances with different <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          max_connections</code> settings. At the infrastructure layer,
          PgBouncer or ProxySQL can enforce per-pool limits in front of
          the database.
        </p>
      </Decision>

      <Decision question="How is rate limiting a form of bulkhead?">
        <p className="page-body">
          Rate limiting is a bulkhead between tenants. Without it, one
          tenant's traffic spike consumes resources that belong to everyone.
          Per-tenant rate limits ensure that <strong>noisy neighbor
          problems</strong> are contained.
        </p>
        <p className="page-body">
          The deeper insight: rate limiting and bulkheads are both about
          <strong>resource reservation</strong>. A bulkhead reserves threads
          or connections; a rate limiter reserves request capacity. The
          design question is the same: how do you partition a shared
          resource so that one consumer can't starve others?
        </p>
        <p className="page-body">
          At staff+ level, combine them: per-tenant rate limits (bulkhead
          between customers) + per-dependency thread pools (bulkhead
          between services) + per-priority connection pools (bulkhead
          between workload types). Three dimensions of isolation.
        </p>
      </Decision>

      <Insight type="warn" tag="Common trap">
        "Bulkheads only work if your monitoring knows about them. I've seen
        teams configure 5 thread pools and then alert on aggregate thread
        utilization. One pool at 100% and four at 10% averages to 28% --
        well below the alert threshold. Monitor each pool independently, or
        your bulkheads are invisible."
      </Insight>
    </>
  );
}

/* ───────── Tab 3: Graceful Degradation ───────── */
function DegradationPanel() {
  return (
    <>
      <h2 className="page-section-title">Failing Gracefully Is a Feature, Not a Bug</h2>
      <p className="page-body">
        Graceful degradation means your system deliberately sheds non-critical
        work to protect core functionality under stress. It's not something
        that happens automatically -- it's a set of explicit decisions about
        what to sacrifice and when.
      </p>

      <Decision question="How do you use feature flags for planned degradation?">
        <p className="page-body">
          Every non-critical feature should have a <strong>kill switch</strong>
          {' '}-- a feature flag that can disable it in seconds without a
          deploy. This isn't the same as a feature rollout flag. Degradation
          flags are specifically designed to shed load.
        </p>
        <p className="page-body">
          Build a <Pill type="green">degradation ladder</Pill> -- an ordered
          list of features to disable as pressure increases:
        </p>
        <p className="page-body">
          <strong>Level 1:</strong> Disable recommendations, personalization,
          A/B test tracking. User doesn't notice.
          <br />
          <strong>Level 2:</strong> Serve cached search results, disable
          autocomplete, reduce image quality. User barely notices.
          <br />
          <strong>Level 3:</strong> Read-only mode -- disable writes except
          for critical paths (checkout, auth). User notices but can browse.
          <br />
          <strong>Level 4:</strong> Static fallback pages. User sees a
          "we're experiencing high demand" page with cached content.
        </p>
        <p className="page-body">
          The key insight: <strong>define these levels BEFORE an incident.</strong>
          {' '}During an outage, you're not designing degradation strategies --
          you're flipping pre-tested switches. Runbooks should say "flip
          degradation to Level 2" not "figure out what to disable."
        </p>
      </Decision>

      <Decision question="When is serving stale data acceptable, and how do you bound the staleness?">
        <p className="page-body">
          Stale data is almost always better than no data -- but the
          staleness budget depends on the domain:
        </p>
        <p className="page-body">
          <Pill type="green">Minutes-stale OK</Pill> Product catalog,
          content feeds, user profiles, search results. Cache aggressively,
          serve from cache when origin is down.
        </p>
        <p className="page-body">
          <Pill type="amber">Seconds-stale OK</Pill> Inventory counts,
          pricing, session state. Use short TTLs and stale-while-revalidate.
          Show "price may have changed" disclaimers.
        </p>
        <p className="page-body">
          <Pill type="red">Stale is dangerous</Pill> Account balances,
          order status, security permissions. Showing a user their old
          balance after a withdrawal could lead to double-spending or
          support escalations.
        </p>
        <p className="page-body">
          Implementation: set <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          Cache-Control: max-age=60, stale-if-error=3600</code>. This says
          "cache for 60s normally, but if origin is a 5xx, serve stale data
          up to 1 hour." The <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          stale-if-error</code> directive is your degradation policy in a
          single HTTP header.
        </p>
      </Decision>

      <Decision question="Explain load shedding. How do you decide what to drop?">
        <p className="page-body">
          Load shedding means intentionally dropping requests to keep the
          system healthy for the requests you do serve. Without shedding, an
          overloaded server tries to handle everything and succeeds at
          nothing -- latencies spike, timeouts cascade, and you get a
          complete outage instead of a partial one.
        </p>
        <p className="page-body">
          Shedding strategies ranked by sophistication:
        </p>
        <p className="page-body">
          <strong>1. LIFO queue with max depth</strong> -- drop the oldest
          requests first (they're probably already timed out on the client
          side). Better than FIFO because you serve the freshest requests
          that clients are still waiting for.
        </p>
        <p className="page-body">
          <strong>2. Priority-based shedding</strong> -- tag requests with
          priority (checkout {'>'} browse {'>'} analytics). When at capacity, reject
          low-priority requests with 503 + Retry-After. Google's CoDel
          algorithm does this adaptively.
        </p>
        <p className="page-body">
          <strong>3. Client-cooperative shedding</strong> -- return 503 with
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {' '}Retry-After: 30</code> and trust clients to back off. Works
          in API ecosystems where you control the client SDK.
        </p>
      </Decision>

      <Decision question="How do you implement read-only mode as a degradation strategy?">
        <p className="page-body">
          Read-only mode protects your system when the write path is failing
          (database overloaded, queue backed up, write replicas down) while
          keeping the read path alive. This preserves the most valuable user
          experience: browsing, searching, viewing.
        </p>
        <p className="page-body">
          Implementation requires <strong>separating your read and write
          paths architecturally</strong> (CQRS lite). Reads go to replicas
          or caches. Writes go to the primary. When you flip to read-only,
          you reject writes at the API gateway with a friendly error:
          "Purchases are temporarily unavailable. You can continue browsing."
        </p>
        <p className="page-body">
          The hard part: <strong>UI adaptation</strong>. Don't show "Add to
          Cart" buttons that return errors. Use the same feature flag system
          to hide write-path UI elements. The degradation should feel
          intentional, not broken.
        </p>
      </Decision>

      <Insight>
        "The best graceful degradation I've ever seen was at a company that
        ran 'degradation game days' monthly. They'd kill a dependency in
        production and watch. Not to test if the fallback worked -- to test
        if anyone even noticed. The goal wasn't zero-downtime: it was
        zero-impact despite downtime."
      </Insight>
    </>
  );
}

/* ───────── Tab 4: Anti-patterns ───────── */
function AntiPatternsPanel() {
  return (
    <>
      <h2 className="page-section-title">Bad vs Good: What Separates Senior from Staff</h2>
      <p className="page-body">
        The difference between a senior answer and a staff+ answer on
        resilience isn't knowing the patterns -- it's knowing when each
        pattern becomes the problem.
      </p>

      {/* Anti-pattern 1 */}
      <div style={styles.anti}>
        <p style={{ ...styles.ss, fontWeight: 600, marginBottom: 8 }}>
          <span style={{ ...styles.dot, background: '#e74c3c' }} />
          "How do you handle downstream failures?"
        </p>
        <p style={styles.strike}>
          "We add retries with exponential backoff. If the service is down
          we retry 3 times with increasing delays."
        </p>
        <p style={styles.better}>
          "Retries are the last resort, not the first tool. First, I
          classify the failure: is it transient or persistent? Is the
          operation idempotent? Then I layer defenses: circuit breaker to
          detect persistent failures, fallback to serve degraded data,
          and only then retries with jitter and a 10% retry budget to
          prevent amplification. The retry count matters less than the
          total retry volume relative to baseline traffic."
        </p>
      </div>

      {/* Anti-pattern 2 */}
      <div style={styles.anti}>
        <p style={{ ...styles.ss, fontWeight: 600, marginBottom: 8 }}>
          <span style={{ ...styles.dot, background: '#e74c3c' }} />
          "Design a system that's resilient to database failures."
        </p>
        <p style={styles.strike}>
          "Use a multi-AZ RDS deployment with automatic failover. If the
          primary goes down, the standby takes over in about 60 seconds."
        </p>
        <p style={styles.better}>
          "Automatic failover handles the easy case. I'd design for the
          hard cases: what happens during those 60 seconds? Read traffic
          hits a cache layer that can serve stale data with a staleness
          budget. Write traffic goes to a durable queue (SQS/Kafka) and
          gets drained when the DB recovers. The API returns 202 Accepted
          instead of 200 OK to signal eventual consistency. Connection pools
          are partitioned so background jobs can't starve the critical
          path during recovery. And the circuit breaker on the DB connection
          trips within 5 seconds, not 60 -- so we don't accumulate a
          backlog of threads waiting on a dead connection."
        </p>
      </div>

      {/* Anti-pattern 3 */}
      <div style={styles.anti}>
        <p style={{ ...styles.ss, fontWeight: 600, marginBottom: 8 }}>
          <span style={{ ...styles.dot, background: '#e74c3c' }} />
          "How would you prevent cascading failures?"
        </p>
        <p style={styles.strike}>
          "Add circuit breakers between every service. Use Hystrix or
          resilience4j. Set timeout to 1 second."
        </p>
        <p style={styles.better}>
          "Cascading failures happen because of resource exhaustion, not
          just errors. I'd attack all three vectors: threads (bulkheads
          so one slow dependency can't exhaust the thread pool), connections
          (separate pools per dependency with independent limits), and
          queues (bounded queues with LIFO ordering so stale requests are
          dropped first). Circuit breakers are one tool in that kit --
          they handle the detection. But the isolation (bulkheads) and the
          shedding (load shedding) are equally important. And critically:
          only retry at the edge. If every layer retries independently,
          you get multiplicative amplification -- 3 retries across 4 layers
          means 81x traffic on the leaf service."
        </p>
      </div>

      {/* Anti-pattern 4 */}
      <div style={styles.anti}>
        <p style={{ ...styles.ss, fontWeight: 600, marginBottom: 8 }}>
          <span style={{ ...styles.dot, background: '#e74c3c' }} />
          "How do you test resilience in production?"
        </p>
        <p style={styles.strike}>
          "We use chaos engineering. We randomly kill pods in production
          to see what happens."
        </p>
        <p style={styles.better}>
          "Chaos engineering isn't randomly killing things -- that's chaos
          without engineering. We form a hypothesis ('if cache fails,
          latency increases by at most 200ms because origin handles the
          load'), define the blast radius (one AZ, 5% of traffic), set
          abort conditions (p99 latency exceeds 2s OR error rate exceeds
          5%), and then inject the failure in a controlled way. We run
          game days during business hours with the team on standby, not at
          3am. The goal isn't to find failures -- it's to verify that our
          resilience patterns actually work under real load. The value is
          in the steady-state hypothesis, not the explosion."
        </p>
      </div>

      <Decision question="What's the meta-pattern that connects all resilience patterns?">
        <p className="page-body">
          Every resilience pattern is a tradeoff between <strong>availability
          and correctness</strong>. Circuit breakers trade correctness (some
          requests get fallback data) for availability (the system stays up).
          Retries trade latency (slower responses) for correctness (eventual
          success). Bulkheads trade resource efficiency (idle capacity in
          each pool) for isolation (failures don't spread).
        </p>
        <p className="page-body">
          The staff+ engineer's job is to make these tradeoffs <strong>
          explicit and configurable</strong>. Don't hardcode retry counts --
          make them tunable. Don't pick one fallback strategy -- build a
          degradation ladder. Don't choose between availability and
          correctness -- let the business decide per feature, per endpoint,
          per customer tier.
        </p>
        <p className="page-body">
          <Pill type="green">The ultimate test</Pill>: can you explain to a
          non-technical stakeholder exactly what the user experience will be
          when each dependency fails? If you can't, your resilience strategy
          is an engineering exercise, not a product feature.
        </p>
      </Decision>

      <Insight tag="Senior engineering perspective">
        "When someone lists resilience patterns like a textbook, I know
        they've studied. When they tell me about the time their retry policy
        caused a cascading failure that took down production for 4 hours, I
        know they've built. Senior engineers have scars. Show your scars."
      </Insight>
    </>
  );
}

/* ───────── Main Component ───────── */
export default function Resilience() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <p className="page-eyebrow">Framework 08</p>
      <h1 className="page-title">Resilience Patterns</h1>
      <p className="page-subtitle">
        Distributed systems fail constantly. The question is never "will it
        break?" but "when it breaks, does the user notice?" This framework
        covers the patterns that separate systems that degrade gracefully from
        systems that cascade into total outages -- and the anti-patterns that
        turn your reliability investment into a liability.
      </p>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      <TabTransition activeKey={tab}>

      {tab === 0 && <CircuitBreakersPanel />}
      {tab === 1 && <RetriesPanel />}
      {tab === 2 && <BulkheadsPanel />}
      {tab === 3 && <DegradationPanel />}
      {tab === 4 && <AntiPatternsPanel />}
      </TabTransition>
    </div>
  );
}

/* ───────── Styles ───────── */
const styles = {
  anti: { background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 18px', marginBottom: 10 },
  strike: { textDecoration: 'line-through', opacity: 0.5, fontSize: 13, color: 'var(--text-p)', lineHeight: 1.6 },
  better: { fontSize: 13, color: 'var(--text-h)', fontWeight: 500, lineHeight: 1.6 },
  dot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 8, verticalAlign: 'middle' },
};
