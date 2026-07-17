import { useState } from 'react';
import TabNav from '../components/TabNav';
import TabTransition from '../components/TabTransition';
import Decision, { Pill } from '../components/Decision';
import Insight from '../components/Insight';

const TABS = ['Blue-Green & Canary', 'Feature Flags', 'Config-Driven Dev', 'CI/CD Pipeline Design', 'Anti-patterns'];

export default function DeploymentStrategies() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <p className="page-eyebrow">Framework 12</p>
      <h1 className="page-title">Deployment Strategies</h1>
      <p className="page-subtitle">
        Deployment is where engineering meets organizational maturity. The question
        isn't "how do we push code" — it's "how do we change production safely,
        repeatedly, and with confidence." Your deployment strategy reveals whether
        you treat production as a place code goes or a system you continuously evolve.
      </p>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      <TabTransition activeKey={tab}>

      {tab === 0 && <BlueGreenCanaryPanel />}
      {tab === 1 && <FeatureFlagsPanel />}
      {tab === 2 && <ConfigDrivenPanel />}
      {tab === 3 && <CICDPanel />}
      {tab === 4 && <AntiPatternsPanel />}
      </TabTransition>
    </div>
  );
}

/* ─── Tab 0: Blue-Green & Canary ─── */

function BlueGreenCanaryPanel() {
  return (
    <div>
      <h2 className="page-section-title">Deploying without crossing your fingers</h2>
      <p className="page-body">
        The core insight: separate the act of deploying code from the act of
        releasing it to users. Every strategy below decouples "code is on a server"
        from "users are hitting that code." The difference between a junior and a
        staff answer is understanding which decoupling mechanism fits which risk profile.
      </p>

      <Decision question="When do you choose blue-green over canary?">
        <Pill type="green">architecture</Pill> Blue-green gives you atomic cutover —
        100% of traffic moves from the old environment (blue) to the new one (green)
        in a single step. This is ideal when you need all-or-nothing consistency: database
        schema changes that can't serve mixed traffic, or contract changes where old and
        new clients can't coexist. The cost is double infrastructure. Canary is better
        when you want gradual confidence — route 1% of traffic, watch error rates, then
        expand. Canary requires your system to handle two code versions simultaneously,
        which is a harder invariant than it sounds.
      </Decision>

      <Decision question="How do you handle database migrations in blue-green?">
        <Pill type="red">critical</Pill> This is where blue-green gets genuinely hard.
        The database is shared — you can't have two copies. So your migration must be
        backward-compatible: the old code (blue) must still work against the new schema.
        This means expand-and-contract migrations. Step 1: add the new column (nullable),
        deploy green with dual-write. Step 2: backfill. Step 3: cut traffic to green.
        Step 4: drop the old column in a later deploy. If you try to rename a column or
        change a type in one deploy, blue-green gives you zero protection — the rollback
        target (blue) can't read the new schema.
      </Decision>

      <Decision question="What's the canary promotion ladder, and who decides?">
        A typical progression: 1% for 10 minutes (catch crashes and panics), 5% for
        30 minutes (catch latency regressions), 25% for 2 hours (catch subtle correctness
        bugs in aggregate metrics), 100%. Each stage has automated SLO checks: error rate,
        p99 latency, business metrics (conversion rate, checkout success). If any SLO
        violates the threshold, auto-rollback. The key staff insight: the promotion
        criteria should be defined before the deploy, not eyeballed during it.
        Spinnaker, Argo Rollouts, and Flagger all support this as config.
      </Decision>

      <Decision question="How does shadow traffic differ from canary?">
        <Pill type="amber">nuance</Pill> Canary sends real user traffic to new code
        and serves the response. Shadow traffic (dark launching) duplicates production
        requests to the new version but discards the responses — users always get the
        old version's response. This lets you test performance and correctness under
        real load without user impact. The tradeoff: shadow traffic doubles your load
        (or more, with fan-out). And it doesn't test side effects — if the new code
        writes to a database, you need a shadow database or careful idempotency guards.
        Use shadow traffic for high-risk rewrites (new search engine, new recommendation
        model) where a canary failure would be catastrophic.
      </Decision>

      <Decision question="Rolling deployments — when are they sufficient?">
        Rolling deploys update instances one-at-a-time (or in batches) behind a load
        balancer. They're the simplest zero-downtime strategy and work well for stateless
        services with backward-compatible changes. The risk: during the rollout, you have
        mixed versions serving traffic. If version N+1 writes data that version N can't
        read, you'll get errors on the instances that haven't upgraded yet. Rolling
        deploys also make rollback slower — you have to re-roll the old version across
        all instances. For most CRUD services with good API versioning, rolling deploys
        are perfectly adequate. Don't over-engineer.
      </Decision>

      <Insight>
        "For this service, I'd use canary with automated promotion. We route 1% of
        traffic to the new version, compare error rates and p99 latency against the
        baseline for 15 minutes, then promote to 25%. If the p99 degrades by more
        than 10% at any stage, we auto-rollback. The reason I wouldn't use blue-green
        here is that this change doesn't touch the database schema, so we don't need
        atomic cutover — and canary gives us much earlier signal on regressions."
      </Insight>
    </div>
  );
}

/* ─── Tab 1: Feature Flags ─── */

function FeatureFlagsPanel() {
  return (
    <div>
      <h2 className="page-section-title">Decoupling deploy from release</h2>
      <p className="page-body">
        Feature flags are the most powerful deployment primitive — and the most
        dangerous if left unmanaged. The staff-level question isn't "should we use
        feature flags" (yes), it's "how do we prevent 400 stale flags from turning
        the codebase into spaghetti."
      </p>

      <Decision question="What are the four types of feature flags, and why does it matter?">
        <Pill type="green">taxonomy</Pill> Release flags (short-lived, gate unfinished
        features — remove after launch). Experiment flags (A/B tests — remove after
        the experiment concludes). Ops flags (kill switches, circuit breakers — keep
        permanently, they're operational controls). Permission flags (entitlements,
        plan-based features — they're part of the business logic and live forever).
        The type determines the lifecycle. A release flag older than 30 days is tech
        debt. An ops flag with no expiry is correct. Treating all flags the same is
        how you end up with 2,000 immortal flags nobody dares remove.
      </Decision>

      <Decision question="Server-side vs client-side flag evaluation — what's the tradeoff?">
        <Pill type="amber">nuance</Pill> Server-side evaluation (flag value resolved on
        your backend) keeps business logic out of the client, supports instant changes
        (no app deploy needed), and protects flag rules from inspection. Client-side
        evaluation (SDK downloads the ruleset and evaluates locally) reduces latency
        (no network call per decision) and works offline. The hybrid approach most
        mature systems use: server-side for business-critical flags (pricing, access
        control), client-side with cached rulesets for UI experiments. LaunchDarkly
        supports both. Homegrown systems usually start server-side and regret it when
        latency becomes a problem at scale.
      </Decision>

      <Decision question="How do you prevent stale flag accumulation?">
        <Pill type="red">critical</Pill> This is the real problem. Every flag added
        without a removal plan becomes permanent. Solutions: (1) Every release flag
        gets a Jira ticket for removal, created at flag creation time, due 14 days
        after full rollout. (2) CI lint that fails if a release flag is older than
        its TTL. (3) Quarterly "flag cleanup sprints" — treat it like dependency
        updates. (4) Code ownership: the team that creates the flag owns the cleanup.
        The meta-point: flag hygiene is a cultural problem that requires process, not
        just tooling. If cleanup isn't incentivized, it won't happen.
      </Decision>

      <Decision question="How do kill switches differ from feature flags?">
        A kill switch is a specific type of ops flag designed for emergency use. The
        key properties: it must evaluate in under 1ms (cached locally, never a network
        call in the hot path), it must default to "off" (the safe state), and it must
        be testable in production (you should flip it periodically to verify it works).
        Kill switches for non-critical features (recommendations, personalization,
        analytics) let you shed load during incidents. The anti-pattern is a kill switch
        that has never been tested — it becomes a false sense of safety that fails
        exactly when you need it.
      </Decision>

      <Decision question="What does the flag evaluation architecture look like at scale?">
        At small scale: a config file or database table. At medium scale: a dedicated
        flag service (Unleash, Flagsmith) with an in-process SDK that caches flag rules
        locally and streams updates via SSE or WebSocket. At large scale (LaunchDarkly
        model): edge evaluation where flag rules are pushed to CDN edge nodes, so
        evaluation is a local lookup with zero network latency. The staff insight: the
        flag evaluation path is on every request. If it adds 50ms of latency, you've
        just added 50ms to every endpoint. Treat the flag service as critical
        infrastructure with the same availability SLO as your database.
      </Decision>

      <Insight>
        "I'd classify this new checkout redesign as a release flag with a 21-day TTL.
        We'd gate it server-side — resolve the flag in the BFF layer so the client
        just gets the right component tree. Rollout: 5% internal dogfood for a week,
        then 10% canary with conversion rate monitoring, then 50/50 A/B test for
        statistical significance. The moment we have a decision, the losing branch
        and the flag itself get deleted in the same PR. I'd enforce this with a CI
        check that flags any release flag older than its declared TTL."
      </Insight>
    </div>
  );
}

/* ─── Tab 2: Config-Driven Dev ─── */

function ConfigDrivenPanel() {
  return (
    <div>
      <h2 className="page-section-title">Making behavior changes without deploys</h2>
      <p className="page-body">
        Configuration is code that changes faster than deploys. The staff-level
        conversation is about where the boundary sits between "config" and "code" —
        push too much into config and you've built a Turing-complete config language
        that nobody can debug.
      </p>

      <Decision question="Runtime config vs deploy-time config — where do you draw the line?">
        <Pill type="green">architecture</Pill> Deploy-time config (environment variables,
        build flags) is baked into the artifact. It's immutable, auditable, and can't
        cause runtime surprises. Runtime config (feature flags, tuning parameters)
        changes without a deploy. The rule: if a bad value can cause data loss or a
        security vulnerability, it's deploy-time config. If it's a tuning knob (rate
        limit threshold, cache TTL, retry count), it's runtime config. The middle ground
        — things like database connection strings — should be deploy-time but sourced
        from a secret manager, not hardcoded.
      </Decision>

      <Decision question="How do you architect a config service?">
        A config service needs: (1) a strongly consistent store (etcd, Consul, or
        Postgres — not eventually consistent), (2) a push mechanism (watch/subscribe,
        not polling) so changes propagate in seconds, (3) local caching in each
        service so a config service outage doesn't cascade, (4) validation on write
        (schema enforcement, range checks) so invalid config never enters the system,
        (5) audit log of every change with who/when/why. The anti-pattern: a config
        service that's a single point of failure. If it goes down, services should
        continue with their last-known config, not crash.
      </Decision>

      <Decision question="How do you do hot reload without restart?">
        <Pill type="amber">nuance</Pill> Three approaches: (1) Poll-based — service
        checks config every N seconds. Simple, but N seconds of staleness. (2)
        Push-based — config service pushes via WebSocket or gRPC stream. Immediate,
        but requires connection management. (3) File-watch — config written to a
        mounted volume (Kubernetes ConfigMap), service watches the file with inotify.
        Works well in K8s. The subtlety: hot reload means your application code must
        be designed for it. If you read the config once at startup into a global variable,
        hot reload does nothing. Config must be read from a provider on each use, or
        you need a config-change callback that reinitializes affected components.
      </Decision>

      <Decision question="How do you handle secrets differently from config?">
        <Pill type="red">critical</Pill> Secrets (API keys, database passwords, TLS
        certs) have different requirements: encryption at rest and in transit, access
        logging, automatic rotation, principle of least privilege. Don't store secrets
        in the same system as config — use a dedicated secret manager (HashiCorp Vault,
        AWS Secrets Manager, GCP Secret Manager). The secret manager handles rotation;
        your application uses short-lived credentials or leases. The worst pattern:
        secrets in environment variables checked into git (even in a "private" repo).
        The second worst: secrets in a shared config file that every service can read.
      </Decision>

      <Decision question="Config drift — what is it and how do you detect it?">
        Config drift is when the running config diverges from the declared config.
        Causes: manual changes via admin UIs, emergency hotfixes never committed back,
        config service outages causing stale caches. Detection: periodic reconciliation
        — a job compares declared config (in git or the config service) against what
        each instance is actually using (exposed via a /config health endpoint). Alert
        on any diff. The staff insight: config drift is the deployment equivalent of
        schema drift. If you don't actively detect it, you'll discover it during an
        incident when the system doesn't behave the way the config says it should.
      </Decision>

      <Insight>
        "I'd split config into three tiers. Tier 1 (deploy-time): connection strings,
        feature boundaries, security settings — baked into the container image via
        environment variables from Vault. Tier 2 (runtime, low-risk): cache TTLs,
        rate limits, log levels — served from a config service with schema validation
        and hot-reload via file watch in K8s. Tier 3 (runtime, business): feature
        flags and experiment config — managed through LaunchDarkly with proper flag
        lifecycle. The key principle: the blast radius of a bad config change should
        match the review rigor. Tier 1 goes through PR review. Tier 3 can be changed
        by a PM with guardrails."
      </Insight>
    </div>
  );
}

/* ─── Tab 3: CI/CD Pipeline Design ─── */

function CICDPanel() {
  return (
    <div>
      <h2 className="page-section-title">The pipeline is the product</h2>
      <p className="page-body">
        Your CI/CD pipeline determines how fast you learn from production. Deployment
        frequency isn't vanity — it's a competitive advantage. Teams that deploy 10x/day
        fix bugs faster, ship features sooner, and have fewer incidents than teams that
        deploy weekly. The pipeline design reflects your engineering culture.
      </p>

      <Decision question="Trunk-based development vs GitFlow — when does each make sense?">
        <Pill type="green">strategy</Pill> Trunk-based: everyone commits to main,
        features gated by flags, CI runs on every push. This is what Google, Meta,
        and most high-performing teams use. It forces small, incremental changes and
        eliminates merge hell. GitFlow: long-lived feature branches, develop/staging/main
        branches, release branches. This works for teams with infrequent releases
        (mobile apps with App Store review cycles, on-premise software). The staff
        take: GitFlow is a symptom of low deployment confidence. If you need a
        stabilization branch, your testing is insufficient. Fix the tests, move to
        trunk-based, and use feature flags instead of feature branches.
      </Decision>

      <Decision question="How do you design the pipeline for speed?">
        <Pill type="amber">nuance</Pill> Pipeline speed directly affects developer
        productivity. Target: commit-to-deploy under 15 minutes. Tactics: (1)
        Parallelize test suites — don't run unit, integration, and e2e sequentially.
        (2) Use test impact analysis — only run tests affected by the changed files.
        (3) Cache aggressively — Docker layers, npm/pip caches, compiled artifacts.
        (4) Use ephemeral build agents with fast startup (Firecracker VMs, not cold
        Docker-in-Docker). (5) Separate the "can we merge" check (unit tests, lint,
        type check) from the "can we deploy" check (integration tests, canary).
        The first must be fast (under 5 minutes); the second can be slower but must
        not block the developer.
      </Decision>

      <Decision question="What does automated rollback on SLO violation look like?">
        <Pill type="red">critical</Pill> The deploy pipeline doesn't end at "code is
        on production." It includes a bake period (15-30 minutes) where you compare
        the new version's SLIs against the SLO. Error rate, p99 latency, business
        metrics (orders/minute, login success rate). If any SLO violates during the
        bake, the pipeline automatically reverts to the previous version — no human
        in the loop. This requires: (1) SLOs defined as code, not as dashboards.
        (2) Metrics available within 2 minutes of deploy (not 10-minute aggregation
        windows). (3) The previous version's artifact still available for instant
        rollback. (4) Database migrations that are backward-compatible (you can't
        roll back code if the old code can't read the new schema).
      </Decision>

      <Decision question="GitOps — why declarative deployments win at scale?">
        GitOps (ArgoCD, Flux) treats git as the single source of truth for what's
        deployed. You don't run "kubectl apply" — you commit a manifest change, and
        a controller reconciles the cluster to match. Benefits: full audit trail
        (git log = deployment log), easy rollback (git revert), consistent environments
        (the manifest in git is what's running). The deeper insight: GitOps inverts the
        deployment model. Instead of "push to deploy" (CI pushes artifacts to
        production), it's "pull to deploy" (the cluster pulls the desired state and
        converges). This is more resilient — if the deploy pipeline is down, the
        cluster still self-heals to the last-known-good state in git.
      </Decision>

      <Decision question="Preview environments per PR — luxury or necessity?">
        Spinning up a full environment for every pull request (Vercel preview deploys,
        Render PR environments, custom K8s namespaces) lets reviewers see the change
        running, not just read the diff. This catches visual regressions, integration
        issues, and UX problems that code review misses. The cost: infrastructure
        spend (proportional to the number of open PRs) and environment fidelity (does
        the preview environment have realistic data?). The staff take: preview
        environments are high-ROI for frontend and API changes, lower ROI for
        infrastructure changes. Use them where the cost of a production bug exceeds
        the cost of the preview environment — which, for user-facing changes, is
        almost always true.
      </Decision>

      <Insight>
        "Our pipeline: push to main triggers parallel unit tests and lint (3 min
        gate). If green, build the container image, run integration tests against a
        preview environment with seeded data (8 min). If green, deploy via ArgoCD to
        staging with auto-promote to canary (1% production traffic). Bake for 15
        minutes against SLOs. If p99 stays under 200ms and error rate under 0.1%,
        promote to 100%. Total commit-to-production: 30 minutes with zero human
        intervention. Rollback is a git revert — ArgoCD reconciles within 60 seconds."
      </Insight>
    </div>
  );
}

/* ─── Tab 4: Anti-patterns ─── */

function AntiPatternsPanel() {
  const antis = [
    {
      bad: 'We deploy every two weeks after a code freeze and manual QA.',
      good: 'We deploy to production 5-10 times per day via automated pipelines. Each deploy is small, gated by automated tests and canary metrics. We eliminated the code freeze by investing in test coverage and feature flags — the blast radius of any single deploy is tiny.',
    },
    {
      bad: 'We use feature flags for everything. They give us full control.',
      good: 'We use feature flags strategically — release flags for new features with a 14-day TTL, ops flags for kill switches that live permanently, and experiment flags managed by the data science team. We run a quarterly cleanup sprint and have a CI check that fails on stale release flags. Right now we have 23 active flags, down from 180 after our cleanup initiative.',
    },
    {
      bad: 'Our rollback strategy is to revert the commit and redeploy.',
      good: 'We have three rollback tiers. Tier 1 (seconds): flip the feature flag to off — no deploy needed. Tier 2 (minutes): ArgoCD git revert, auto-reconciles in 60 seconds. Tier 3 (rare): blue-green cutback to the previous environment for database-coupled changes. We pick the tier based on what changed — a UI tweak is tier 1, a new API endpoint is tier 2, a schema migration is tier 3.',
    },
    {
      bad: 'We store configuration in environment variables and secrets in a .env file.',
      good: 'Config is tiered by blast radius. Connection strings and security settings are deploy-time, sourced from Vault and injected as environment variables by the orchestrator — never in a file. Runtime tuning knobs (rate limits, TTLs) live in a config service with schema validation. Secrets rotate automatically via Vault dynamic credentials with 24-hour leases.',
    },
    {
      bad: 'Our CI/CD pipeline runs all tests sequentially — it takes 45 minutes but it\'s thorough.',
      good: 'Our pipeline runs in two phases. Phase 1 (merge gate, 4 min): parallelized unit tests, lint, type checking, and test impact analysis so we only run affected tests. Phase 2 (deploy gate, 10 min): integration tests against a preview environment, security scanning, and container build — all parallel. Total commit-to-production is under 30 minutes, and the developer isn\'t blocked after phase 1.',
    },
  ];

  return (
    <div>
      <h2 className="page-section-title">What not to say</h2>
      <p className="page-body">
        These answers reveal a team that treats deployment as an event rather than a
        continuous capability. The fix: show that you've built systems where
        deploying is boring, reversible, and automated.
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
        Weak deployment answers describe a process — "we deploy on Tuesdays after QA
        signs off." Strong answers describe a system — automated pipelines, progressive
        rollouts, SLO-gated promotion, instant rollback, and flag-based release
        decoupling. The maturity signal in a team: deployment is so safe
        and routine that any engineer can deploy any time without fear. If deploying
        requires courage, your deployment system has failed.
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
