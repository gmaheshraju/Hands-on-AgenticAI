import { useState } from 'react';
import TabNav from '../components/TabNav';
import TabTransition from '../components/TabTransition';
import Decision, { Pill } from '../components/Decision';
import Insight from '../components/Insight';

const TABS = ['API-First Design', 'REST vs gRPC vs GraphQL', 'Versioning', 'Pagination & Filtering', 'Anti-patterns'];

export default function ApiDesign() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <p className="page-eyebrow">Framework 10</p>
      <h1 className="page-title">API Design</h1>
      <p className="page-subtitle">
        An API is a published promise. Once a client depends on it, every field name,
        status code, and error shape becomes a contract you maintain for years. The best
        API designers think like product managers: who consumes this, what do they need
        next, and how do I evolve without breaking them?
      </p>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      <TabTransition activeKey={tab}>

      {tab === 0 && <ApiFirstPanel />}
      {tab === 1 && <ProtocolPanel />}
      {tab === 2 && <VersioningPanel />}
      {tab === 3 && <PaginationPanel />}
      {tab === 4 && <AntiPatternsPanel />}
      </TabTransition>
    </div>
  );
}

/* ───────────── Tab 0: API-First Design ───────────── */

function ApiFirstPanel() {
  return (
    <div>
      <h2 className="page-section-title">Contract-first development</h2>
      <p className="page-body">
        API-first means the interface definition is written and reviewed before a single
        line of implementation code. The spec becomes the source of truth that drives
        server stubs, client SDKs, documentation, and contract tests. Teams that skip
        this step discover incompatibilities during integration — the most expensive
        phase to find them.
      </p>

      <Decision question="Why OpenAPI / Swagger as the source of truth?">
        OpenAPI is a machine-readable contract. From a single YAML file you generate
        server stubs (Go, Java, Node), client SDKs (TypeScript, Python, Swift), request
        validation middleware, and interactive docs — all guaranteed to be in sync. The
        alternative is handwritten docs that drift from the code within weeks. At Stripe,
        every API change starts as an OpenAPI diff reviewed by a dedicated API platform
        team before any backend work begins.
      </Decision>

      <Decision question="How does code generation change the workflow?">
        <Pill type="green">efficiency</Pill> With codegen, the spec is the single source
        of truth. Backend teams generate server interfaces and implement them. Frontend
        teams generate typed clients and build against them. Both sides can work in
        parallel because the contract is agreed upfront. Tools like openapi-generator,
        protoc (for gRPC), and GraphQL codegen eliminate an entire class of
        serialization bugs. The tradeoff: generated code can be ugly and hard to
        customize. The solution is to generate interfaces/types, not business logic.
      </Decision>

      <Decision question="What does an API design review look like?">
        <Pill type="amber">process</Pill> Before implementation, the API spec goes
        through a review checklist: Are resource names nouns (not verbs)? Are
        relationships modeled correctly (embedded vs. linked)? Is the error contract
        consistent with existing APIs? Are fields named consistently (camelCase vs
        snake_case — pick one and enforce it)? Does the pagination model match the rest
        of the platform? Google, Stripe, and Twilio all have internal API review boards.
        At staff+ level, you should be proposing this process, not just following it.
      </Decision>

      <Decision question="What are consumer-driven contracts?">
        Instead of the provider defining what the API returns, each consumer publishes
        a contract describing the fields it actually uses. The provider runs these
        contracts in CI — if a change breaks any consumer's contract, the build fails.
        This is the Pact testing model. It inverts the usual dependency: the API evolves
        freely as long as no consumer is broken. This matters at scale because with 30
        consumers, you can't manually verify each one. The contracts do it automatically.
      </Decision>

      <Decision question="When should you treat your API as a product?">
        <Pill type="red">critical</Pill> Always — even for internal APIs. An internal
        API with 15 consuming services has 15 "customers." If you break them, you've
        caused 15 teams to stop and debug. API-as-product means: versioned changelog,
        deprecation notices with timelines, usage analytics (who calls what, how often),
        and an on-call rotation for API reliability. Stripe charges money for their API
        — but their internal APIs get the same rigor. That's why Stripe's API is
        considered best-in-class.
      </Decision>

      <Insight>
        "I'd start by writing the OpenAPI spec and having both the backend and mobile
        teams review it. From that spec, we generate TypeScript types for the frontend,
        Go interfaces for the backend, and Pact contracts for each consumer. The spec
        lives in its own repo with CI that validates backward compatibility on every PR.
        Implementation starts only after the spec is approved."
      </Insight>
    </div>
  );
}

/* ───────────── Tab 1: REST vs gRPC vs GraphQL ───────────── */

function ProtocolPanel() {
  return (
    <div>
      <h2 className="page-section-title">Choosing the right protocol</h2>
      <p className="page-body">
        This isn't a "which is best" question — it's a "which is best for this
        boundary." Most mature systems use multiple protocols: REST for public APIs,
        gRPC for internal service-to-service, and GraphQL for client-facing aggregation
        layers. The staff+ answer names the boundary and justifies the choice.
      </p>

      <Decision question="When does REST win?">
        <Pill type="green">public APIs</Pill> REST wins when your consumers are
        external, diverse, or unknown. Any HTTP client in any language can call a REST
        API — no codegen, no special tooling. REST also wins for simplicity: CRUD
        operations on resources map naturally to HTTP verbs. Stripe, Twilio, and GitHub
        all chose REST for their public APIs because the barrier to adoption is near
        zero. The downside: REST has no built-in schema, no streaming (without
        workarounds), and over-fetching is structural — you get the whole resource even
        if you need one field.
      </Decision>

      <Decision question="When does gRPC win?">
        <Pill type="amber">internal services</Pill> gRPC wins for internal
        service-to-service communication where you control both sides. Protocol buffers
        give you a strict schema with backward-compatible evolution rules built in.
        Binary serialization is 5-10x smaller and faster than JSON. HTTP/2 multiplexing
        eliminates head-of-line blocking. And gRPC streaming (server-stream,
        client-stream, bidirectional) is first-class — no WebSocket hacks needed.
        Google, Netflix, and Square use gRPC internally. The tradeoff: browser support
        requires grpc-web (a proxy), debugging is harder (binary payloads), and the
        learning curve for protobufs is real.
      </Decision>

      <Decision question="When does GraphQL win?">
        <Pill type="green">varied clients</Pill> GraphQL wins when you have multiple
        clients with different data needs — a mobile app that needs 3 fields, a web
        dashboard that needs 30, and an admin tool that needs nested relationships.
        Instead of building 3 REST endpoints or accepting massive over-fetching,
        GraphQL lets each client request exactly what it needs. Facebook, Shopify, and
        GitHub (v4) use GraphQL for this reason. The tradeoff: caching is harder (no
        HTTP caching by URL), authorization must be field-level (not endpoint-level),
        and N+1 queries in the resolver layer can destroy backend performance without
        DataLoader-style batching.
      </Decision>

      <Decision question="What about streaming APIs?">
        <Pill type="red">critical distinction</Pill> Three patterns, each for a
        different use case. <strong>Server-Sent Events (SSE)</strong>: unidirectional
        server-to-client over HTTP/1.1 — perfect for live feeds, notifications, stock
        tickers. Simple, works through proxies, auto-reconnects.{' '}
        <strong>WebSockets</strong>: bidirectional, persistent TCP — for chat, gaming,
        collaborative editing where both sides send frequently.{' '}
        <strong>gRPC streaming</strong>: typed, bidirectional over HTTP/2 — for internal
        service communication like log tailing, real-time ML inference pipelines. Don't
        use WebSockets when SSE suffices — WebSockets bypass HTTP middleware (auth,
        rate limiting, logging) and require sticky sessions.
      </Decision>

      <Decision question="Protocol buffers vs JSON — when does the encoding matter?">
        At 100 requests/second, JSON is fine. At 100,000 requests/second between
        internal services, protobuf's 5-10x size reduction and faster
        serialization/deserialization meaningfully reduce latency and network costs.
        Protobuf also enforces a schema — you can't accidentally send a string where an
        int is expected. JSON's advantage is human readability and universal tooling. The
        pragmatic answer: JSON at the edge (public APIs, debugging), protobuf internally
        (service mesh, high-throughput paths).
      </Decision>

      <Insight>
        "For this system, I'd use REST with OpenAPI for the public API — our partners
        need zero-friction integration. Between our internal services, I'd use gRPC
        with protobuf for the order pipeline (high throughput, strict schema) and REST
        for the admin dashboard (low traffic, developer convenience). For real-time
        order status updates to the mobile app, SSE — it's unidirectional, works
        through CDN proxies, and auto-reconnects on mobile network switches."
      </Insight>
    </div>
  );
}

/* ───────────── Tab 2: Versioning ───────────── */

function VersioningPanel() {
  return (
    <div>
      <h2 className="page-section-title">Evolving without breaking</h2>
      <p className="page-body">
        API versioning is change management. The technical mechanism matters less than
        the policy: how do you communicate changes, how long do you support old
        versions, and how do you migrate consumers? Get the policy wrong and you're
        maintaining 5 versions of every endpoint forever.
      </p>

      <Decision question="URL versioning (/v1/users) vs header versioning — which and why?">
        <Pill type="green">opinionated</Pill> URL versioning (/v1/users, /v2/users)
        wins for public APIs. It's explicit, visible in logs, cacheable by URL, and
        impossible for consumers to miss. Header versioning (Accept:
        application/vnd.api+json;version=2) is cleaner in theory but invisible in
        browser address bars, harder to test with curl, and easy to forget. Stripe uses
        a date-based header (Stripe-Version: 2023-10-16), which works because they have
        a dedicated API platform team managing compatibility. Unless you have that team,
        use URL versioning. Content negotiation (Accept header with media types) is
        academically elegant but almost nobody does it in practice.
      </Decision>

      <Decision question="What's a breaking change vs. a non-breaking change?">
        <Pill type="red">critical</Pill> Breaking: removing a field, renaming a field,
        changing a field's type, making an optional field required, changing the
        semantics of an existing field, removing an endpoint, changing error codes.
        Non-breaking: adding a new field (if clients ignore unknown fields), adding a
        new endpoint, adding an optional query parameter, adding a new enum value (if
        clients handle unknown values). The key insight: "additive changes only" is the
        safest evolution strategy. If you always add and never remove, you rarely need
        a new version. This is why response fields should be optional by default in your
        schema.
      </Decision>

      <Decision question="How do you handle API deprecation lifecycle?">
        <Pill type="amber">process</Pill> Four phases: (1) Announce — add
        Sunset and Deprecation headers to responses, update docs, email consumers.
        (2) Monitor — track usage of deprecated endpoints/fields; reach out to active
        consumers directly. (3) Warn — return warning headers, optionally degrade
        performance (add latency) to incentivize migration. (4) Remove — after the
        sunset date, return 410 Gone with a migration guide URL. The timeline matters:
        internal APIs get 3-6 months, public APIs get 12-24 months. Stripe supports
        every API version forever (via automatic request/response transformation) — but
        that requires enormous engineering investment.
      </Decision>

      <Decision question="How do you support multiple versions in production?">
        Three strategies ranked by complexity. <strong>Route-based</strong>: separate
        controllers for /v1 and /v2 — simple but duplicates code.{' '}
        <strong>Transformation-based</strong>: one implementation, with middleware that
        transforms requests/responses between versions — Stripe's model, elegant but
        complex. <strong>Feature-flag-based</strong>: no versions at all; new behavior
        is gated behind flags per-consumer — works for internal APIs where you control
        the clients. At staff+ level, the answer depends on how many consumers you have
        and how fast they can migrate.
      </Decision>

      <Decision question="Feature flags vs. API versions — when do flags replace versions?">
        Feature flags replace API versions when you control both sides (internal APIs)
        and can coordinate rollouts. Instead of /v2/orders with a new field, you add
        the field behind a flag and enable it per-consumer. No versioning overhead, no
        sunset policy. The risk: flag sprawl. If you have 50 flags controlling API
        behavior, nobody understands what any given consumer actually sees. The rule of
        thumb: flags for gradual rollout of new features, versions for breaking schema
        changes.
      </Decision>

      <Insight>
        "I'd use URL versioning — /v1/ prefix — because our API is public and we want
        version to be visible in every log line and curl command. Our policy: additive
        changes only within a version. If we must break, we ship v2 with a 12-month
        overlap period. During the overlap, we track v1 usage per consumer and
        proactively reach out to the top 10 by volume. After sunset, v1 returns 410
        Gone with a link to the migration guide."
      </Insight>
    </div>
  );
}

/* ───────────── Tab 3: Pagination & Filtering ───────────── */

function PaginationPanel() {
  return (
    <div>
      <h2 className="page-section-title">Pagination, filtering, and rate limiting</h2>
      <p className="page-body">
        Every list endpoint needs pagination. The choice between cursor and offset has
        real consequences at scale — offset pagination breaks silently when data is
        inserted or deleted between pages. Filtering and rate limiting are the other two
        decisions that separate production-grade APIs from toy APIs.
      </p>

      <Decision question="Cursor-based vs offset pagination — when does offset break?">
        <Pill type="red">critical</Pill> Offset pagination (page=3&limit=20, meaning
        "skip 40, take 20") has two fatal flaws at scale. First, the database must scan
        and discard all skipped rows — page 500 of a million rows means scanning
        500,000 rows to return 20. Second, if a row is inserted or deleted between page
        requests, items shift — you either miss items or see duplicates. Cursor
        pagination ("give me 20 items after cursor=eyJpZCI6MTAwfQ") uses an opaque
        token encoding the last-seen position. The database seeks directly to that
        position (indexed lookup), and insertions/deletions don't cause shifts. Use
        offset only when the dataset is small and static (admin tables). Use cursors
        for everything user-facing.
      </Decision>

      <Decision question="How should cursor pagination be implemented?">
        The cursor is typically a Base64-encoded JSON object containing the sort key
        value(s) of the last item: {`{id: 100}`} or {`{created_at: "2024-01-15", id: 500}`}
        for compound sorts. The server decodes it and adds a WHERE clause:
        WHERE (created_at, id) {'>'} ('2024-01-15', 500) ORDER BY created_at, id LIMIT 21.
        Fetch limit+1 rows — if you get 21, there's a next page; return 20 items plus
        a next_cursor. Return null cursor when there's no next page. Never expose raw
        database IDs in cursors — encode them. The cursor should be opaque to the client
        so you can change the implementation without breaking consumers.
      </Decision>

      <Decision question="How do you handle complex filtering at the API layer?">
        <Pill type="amber">tradeoff</Pill> Simple filtering via query parameters works
        for 1-3 fields: GET /orders?status=shipped&min_total=100. For complex queries
        (AND/OR logic, nested conditions, range filters), query params become unwieldy.
        Two options: (1) POST /orders/search with a JSON body describing the filter —
        Elasticsearch-style. This is technically not RESTful (POST for a read), but it's
        pragmatic and widely used. (2) A filtering DSL in query params:
        filter[status][eq]=shipped&filter[total][gte]=100 — JSON:API style. Option 1 is
        simpler to implement and more expressive. The tradeoff: POST requests aren't
        cacheable by HTTP caches.
      </Decision>

      <Decision question="Rate limiting at the API layer — what's the design?">
        Three headers, always: X-RateLimit-Limit (max requests per window),
        X-RateLimit-Remaining (requests left), X-RateLimit-Reset (Unix timestamp when
        the window resets). Return 429 Too Many Requests with a Retry-After header when
        exceeded. Implementation: token bucket (bursty traffic) or sliding window
        (smooth distribution). Rate limits should be per-consumer (API key), not
        per-IP — a single corporate NAT can have thousands of users behind one IP.
        Tiered limits by plan (free: 100/min, pro: 1000/min) are table stakes for any
        API-as-product.
      </Decision>

      <Decision question="Response envelope design and HATEOAS — how much structure?">
        A response envelope wraps data with metadata:{' '}
        {`{ data: [...], pagination: { next_cursor, has_more }, meta: { total_count, request_id } }`}.
        This is valuable — it gives clients a consistent shape to parse and a place for
        cross-cutting concerns (request tracing, deprecation warnings). HATEOAS (links
        to related resources and actions in the response) is the most debated part of
        REST. In practice: include pagination links (next, prev) — that's universally
        useful. Skip full HATEOAS (links to every possible action on every resource)
        unless you're building a truly generic hypermedia client, which almost nobody is.
        GitHub's API includes HATEOAS links and they're genuinely useful for navigation;
        most APIs aren't GitHub-scale.
      </Decision>

      <Insight>
        "For the orders list endpoint, I'd use cursor-based pagination with the cursor
        encoding (created_at, order_id) — both indexed. The response envelope includes
        data, next_cursor, and has_more. For filtering, simple cases use query params;
        for the advanced search page, POST /orders/search with a JSON body. Rate limits
        at 1000/min per API key with token bucket, returning standard rate limit headers
        on every response — not just on 429s."
      </Insight>
    </div>
  );
}

/* ───────────── Tab 4: Anti-patterns ───────────── */

function AntiPatternsPanel() {
  const antis = [
    {
      bad: "I'd build a REST API with endpoints for each operation.",
      good: "I'd start with an OpenAPI spec defining resources, relationships, and error contracts. The spec gets reviewed by consuming teams before I write any code. From the spec, I generate TypeScript types for the frontend and validation middleware for the backend."
    },
    {
      bad: "GraphQL is better than REST because it solves over-fetching.",
      good: "GraphQL solves over-fetching for varied clients — our mobile app needs 3 fields while the dashboard needs 30. But it introduces resolver N+1 problems, makes HTTP caching impossible, and requires field-level authorization. For our public API with uniform consumers, REST with sparse fieldsets (?fields=id,name) gives us 80% of the benefit with none of the complexity."
    },
    {
      bad: "I'd use page numbers for pagination — page=1, page=2, etc.",
      good: "Offset pagination breaks at scale — page 500 scans 10,000 rows to return 20. Worse, if items are inserted between requests, users see duplicates or miss items. I'd use cursor-based pagination with an opaque token encoding the last-seen sort key. The database does an indexed seek instead of a scan, and insertions don't shift results."
    },
    {
      bad: "We'd version the API when we need to make changes.",
      good: "Our versioning policy is additive-only within a version: new fields, new endpoints, new optional params — never remove or rename. If we must break the contract, we ship a new version with a 12-month overlap and proactively migrate consumers by usage volume. Breaking changes without a sunset policy is how you lose trust and adoption."
    },
    {
      bad: "I'd use gRPC because it's faster than REST.",
      good: "gRPC is faster — but speed isn't the decision driver. I'd use gRPC between our internal services because we control both sides, we need strict schema evolution (protobuf), and the order pipeline benefits from server-streaming for real-time status updates. The public API stays REST because our partners expect zero-friction HTTP integration with standard tooling."
    },
  ];

  return (
    <div>
      <h2 className="page-section-title">What not to say</h2>
      <p className="page-body">
        These answers reveal pattern-matching without understanding. The fix: name the
        specific consumers, their data needs, and the tradeoff you're making. API design
        answers should sound like product decisions, not technology preferences.
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
        Weak API design answers name technologies — "REST," "GraphQL," "gRPC." Strong
        answers name constraints: who consumes this, what data do they need, how fast
        does it change, and what breaks if I get the contract wrong? The protocol is the
        last decision, not the first. Start with the consumer, define the contract, then
        choose the transport.
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
