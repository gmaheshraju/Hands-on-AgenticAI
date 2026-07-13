import FrameworkCard from '../components/FrameworkCard';
import FadeIn from '../components/FadeIn';

const frameworks = [
  {
    to: '/database-selection',
    number: '01',
    title: 'Database Selection',
    subtitle: 'The 6-question decision tree: scale, access pattern, joins, consistency, writes, technology. Name the constraint before the store.',
    tags: ['Postgres', 'DynamoDB', 'Redis', 'MongoDB', 'Cassandra', 'Elasticsearch'],
    ready: true,
  },
  {
    to: '/rate-limiter',
    number: '02',
    title: 'Rate Limiter Design',
    subtitle: 'Token bucket vs sliding window vs leaky bucket — with burst handling, distributed coordination, and failure modes.',
    tags: ['Token bucket', 'Sliding window', 'Redis', 'Distributed'],
    ready: true,
  },
  {
    to: '/caching',
    number: '03',
    title: 'Caching Strategies',
    subtitle: 'Write-through, write-behind, cache-aside — when each pattern works, when it breaks, and the invalidation tradeoffs.',
    tags: ['Cache-aside', 'Write-through', 'Invalidation', 'TTL', 'Thundering herd'],
    ready: true,
  },
  {
    to: '/message-queues',
    number: '04',
    title: 'Message Queue Selection',
    subtitle: 'Kafka vs SQS vs RabbitMQ — ordering guarantees, exactly-once semantics, backpressure, and when "just use Kafka" is wrong.',
    tags: ['Kafka', 'SQS', 'RabbitMQ', 'Ordering', 'Exactly-once'],
    ready: true,
  },
  {
    to: '/scaling',
    number: '05',
    title: 'Scaling Playbook',
    subtitle: 'Vertical, read replicas, horizontal sharding, CQRS, event sourcing. Know when to move, not just how.',
    tags: ['Sharding', 'CQRS', 'Read replicas', 'Partitioning'],
    ready: true,
  },
  {
    to: '/event-driven',
    number: '06',
    title: 'Event-Driven Architecture',
    subtitle: 'Event sourcing, CQRS projections, idempotency, and the choreography vs orchestration decision.',
    tags: ['Event sourcing', 'CQRS', 'Idempotency', 'Choreography'],
    ready: true,
  },
  {
    to: '/state-machines',
    number: '07',
    title: 'State Machines & Workflows',
    subtitle: 'Explicit state machines over boolean flags. Transition tables, guards, compensation, distributed locks, and workflow orchestration.',
    tags: ['State machines', 'Temporal', 'Sagas', 'Fencing tokens', 'CRDTs'],
    ready: true,
  },
  {
    to: '/resilience',
    number: '08',
    title: 'Resilience Patterns',
    subtitle: 'Circuit breakers, retries with backoff, bulkheads, graceful degradation — building systems that bend without breaking.',
    tags: ['Circuit breakers', 'Retries', 'Bulkheads', 'Load shedding'],
    ready: true,
  },
  {
    to: '/observability',
    number: '09',
    title: 'Self-Healing & Observability',
    subtitle: 'Health checks, auto-recovery, distributed tracing, SLOs — the infrastructure that lets you sleep at night.',
    tags: ['Health checks', 'Tracing', 'SLOs', 'Auto-recovery'],
    ready: true,
  },
  {
    to: '/api-design',
    number: '10',
    title: 'API Design',
    subtitle: 'API-first development, REST vs gRPC vs GraphQL, versioning strategies, pagination — the contract that holds your system together.',
    tags: ['REST', 'gRPC', 'GraphQL', 'Versioning', 'Pagination'],
    ready: true,
  },
  {
    to: '/auth',
    number: '11',
    title: 'Auth Architecture',
    subtitle: 'AuthN vs AuthZ, OAuth2/OIDC, JWT design, RBAC/ABAC/ReBAC — the security layer most candidates handwave past.',
    tags: ['OAuth2', 'JWT', 'RBAC', 'Zero trust', 'Zanzibar'],
    ready: true,
  },
  {
    to: '/deployment',
    number: '12',
    title: 'Deployment Strategies',
    subtitle: 'Blue-green, canary, feature flags, config-driven development, CI/CD pipeline design — shipping with confidence.',
    tags: ['Blue-green', 'Canary', 'Feature flags', 'GitOps'],
    ready: true,
  },
  {
    to: '/concurrency',
    number: '13',
    title: 'Concurrency & Performance',
    subtitle: 'Locks, connection pools, N+1 queries, load testing, profiling — where most production systems actually break.',
    tags: ['Locking', 'Connection pools', 'N+1', 'Load testing'],
    ready: true,
  },
  {
    to: '/distributed-systems',
    number: '14',
    title: 'Distributed Systems',
    subtitle: 'CAP theorem (what it actually says), consensus, distributed transactions, idempotency — the foundations everything else builds on.',
    tags: ['CAP', 'Raft', 'Idempotency', 'Sagas', '2PC'],
    ready: true,
  },
];

export default function Home() {
  return (
    <div>
      <section className="home-hero">
        <p className="home-hero__eyebrow">Mahesh Guntumadugu</p>
        <h1 className="home-hero__title">
          System Design<br />
          <em>Playbook</em>
        </h1>
        <p className="home-hero__tagline">
          Decision frameworks battle-tested design and architectural patterns
          that signal staff, principal, and CTO-level thinking.
        </p>
      </section>

      <section style={{ marginBottom: '3.5rem' }}>
        <h2 className="home-section-title">Frameworks</h2>
        <div className="home-grid">
          {frameworks.map((f, index) => (
            <FadeIn key={f.number} delay={index * 60}>
              <FrameworkCard {...f} />
            </FadeIn>
          ))}
        </div>
      </section>

      <section className="home-philosophy">
        <div className="home-philosophy__bar" />
        <div>
          <h2 className="home-philosophy__title">The meta-principle</h2>
          <p className="home-philosophy__text">
            Every weak system design answer starts with a technology name.
            Every strong one starts with a constraint — the query shape, the scale,
            the consistency requirement, the write pattern.
            The technology is the last word in the sentence, never the first.
          </p>
          <p className="home-philosophy__sub">
            These frameworks train you to think constraint-first. That's what separates
            a 30L offer from a 2Cr one — not more knowledge, but better judgment.
          </p>
        </div>
      </section>
    </div>
  );
}

function Stat({ number, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span className="home-stat__num">{number}</span>
      <span className="home-stat__label">{label}</span>
    </div>
  );
}
