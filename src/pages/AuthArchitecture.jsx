import { useState } from 'react';
import TabNav from '../components/TabNav';
import TabTransition from '../components/TabTransition';
import Decision, { Pill } from '../components/Decision';
import Insight from '../components/Insight';

const TABS = ['AuthN vs AuthZ', 'OAuth2 & OIDC', 'Token Design', 'Access Control Models', 'Anti-patterns'];

export default function AuthArchitecture() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <p className="page-eyebrow">Framework 11</p>
      <h1 className="page-title">Auth Architecture</h1>
      <p className="page-subtitle">
        Authentication and authorization are the two pillars every system rests on,
        yet most engineers conflate them until a breach forces the distinction. The
        staff-level question is never "how do I add login" — it's "how do I design
        an auth system that scales to 200 services, survives token compromise, and
        lets product ship new permission models without a migration."
      </p>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      <TabTransition activeKey={tab}>

      {tab === 0 && <AuthNvsAuthZPanel />}
      {tab === 1 && <OAuthPanel />}
      {tab === 2 && <TokenDesignPanel />}
      {tab === 3 && <AccessControlPanel />}
      {tab === 4 && <AntiPatternsPanel />}
      </TabTransition>
    </div>
  );
}

/* ─── Tab 0: AuthN vs AuthZ ─── */
function AuthNvsAuthZPanel() {
  return (
    <div>
      <h2 className="page-section-title">The separation that defines your architecture</h2>
      <p className="page-body">
        Authentication answers "who are you?" Authorization answers "what can you do?"
        They sound simple in isolation, but the architectural boundary between them
        determines how your system evolves. Merge them and every permission change
        touches the login flow. Separate them cleanly and you can swap IdPs, add SSO,
        or migrate from RBAC to ABAC without touching a single auth endpoint.
      </p>

      <Decision question="Should authentication be a centralized service or embedded in each service?">
        <Pill type="green">centralize</Pill> Always centralize authentication into a
        dedicated identity service. Every service that rolls its own login is a surface
        area for credential-handling bugs — password hashing, session management, brute-force
        protection. Centralize it once, harden it once, audit it once. Services receive
        a verified identity token and never see raw credentials. This is non-negotiable
        at scale. Even a 3-service system benefits because credential storage is a
        liability, not a feature.
      </Decision>

      <Decision question="Session-based vs token-based authentication — when does each win?">
        <Pill type="amber">depends</Pill> Session-based (server stores session state, client
        holds a session ID cookie) works well for monoliths and server-rendered apps. The
        server has full revocation control — delete the session and the user is logged out
        instantly. Token-based (JWT or opaque token, client holds the credential) wins in
        distributed systems where you don't want a centralized session store as a bottleneck.
        The tradeoff is explicit: sessions give you instant revocation but require shared
        state; tokens give you stateless verification but make revocation hard. Most
        production systems use a hybrid — short-lived JWTs (5-15 minutes) with a refresh
        token that's checked against a server-side store.
      </Decision>

      <Decision question="Where should MFA live in the authentication flow?">
        MFA must be enforced by the identity service, not by individual applications. If
        you push MFA checks to the application layer, one misconfigured service becomes a
        bypass. The identity service completes the full MFA ceremony before issuing any
        token. The token itself carries an <code>amr</code> (authentication methods reference)
        claim so downstream services can verify MFA was completed without re-prompting.
        Step-up authentication — requiring a second factor for sensitive operations like
        changing email or initiating a transfer — should be a re-authentication call back
        to the identity service, not a custom flow in the business service.
      </Decision>

      <Decision question="How do you design passwordless authentication?">
        Passwordless flows (magic links, WebAuthn/passkeys, SMS OTP) eliminate the
        credential storage liability entirely. The staff-level insight is that passwordless
        doesn't simplify your auth system — it shifts complexity from password management
        to session management and account recovery. Magic links require email deliverability
        monitoring and link expiration (typically 10 minutes, single-use). Passkeys (WebAuthn)
        are the strongest option — phishing-resistant, device-bound, no shared secret — but
        require a credential registration flow and a fallback for device loss. Design for
        the fallback first. Your account recovery flow IS your auth security — if recovery
        is weak, the entire chain is weak.
      </Decision>

      <Decision question="How should authorization data flow through a microservices system?">
        <Pill type="red">critical</Pill> The identity service authenticates and issues a
        token containing identity claims (user ID, org, roles). Authorization — checking
        whether this user can perform this action on this resource — happens at the service
        level, because only the service understands its resource model. The API gateway can
        enforce coarse-grained authorization (is this a valid, unexpired token? does the
        user belong to this tenant?) but fine-grained checks (can this user edit this specific
        document?) must happen in the owning service. Pushing all authorization to the gateway
        creates a god object that knows every service's permission model.
      </Decision>

      <Insight>
        A staff-level answer separates the concerns crisply: "I'd build a dedicated identity
        service that handles all credential verification, MFA, and token issuance. Services
        never see passwords. Each service checks authorization locally against its own resource
        model, using claims from the identity token. The gateway validates token signatures
        and tenant membership but never makes business-level permission decisions."
      </Insight>
    </div>
  );
}

/* ─── Tab 1: OAuth2 & OIDC ─── */
function OAuthPanel() {
  return (
    <div>
      <h2 className="page-section-title">OAuth2 is for authorization. OIDC adds identity.</h2>
      <p className="page-body">
        OAuth2 was designed to let a third party access your resources without sharing
        your password — it's a delegation protocol, not an authentication protocol. OIDC
        (OpenID Connect) layers identity on top of OAuth2 by adding the ID token. Most
        engineers conflate them, and the confusion leads to insecure token handling.
        Understanding the distinction is a staff-level requirement because you will
        design systems that act as both OAuth clients and OAuth resource servers.
      </p>

      <Decision question="Which OAuth2 grant type should you use for browser-based SPAs?">
        <Pill type="green">auth code + PKCE</Pill> The Authorization Code flow with PKCE
        (Proof Key for Code Exchange) is the only correct choice for SPAs and mobile apps.
        The implicit flow is deprecated — it exposes tokens in URL fragments and browser
        history. With PKCE, the client generates a random code verifier, hashes it to create
        a code challenge, and sends the challenge with the auth request. The authorization
        server returns an auth code that can only be exchanged for tokens by presenting the
        original verifier. This prevents authorization code interception even without a
        client secret. For SPAs, combine this with a backend-for-frontend (BFF) pattern
        that keeps tokens server-side and proxies API calls — the browser never holds
        access tokens directly.
      </Decision>

      <Decision question="When do you use the client credentials grant?">
        Client credentials is for machine-to-machine (M2M) communication where no user
        is involved. Service A authenticates to the authorization server with its own
        client ID and secret, gets an access token, and calls Service B. The key design
        question is secret management — client secrets must be stored in a vault
        (HashiCorp Vault, AWS Secrets Manager), rotated on a schedule, and never committed
        to source control. At scale, consider mutual TLS (mTLS) as an alternative to
        client secrets for M2M auth — it eliminates the secret rotation problem entirely.
      </Decision>

      <Decision question="ID tokens vs access tokens vs refresh tokens — what is each for?">
        <Pill type="red">critical</Pill> This is the most commonly confused topic in auth.
        The <strong>ID token</strong> is an OIDC concept — a JWT that tells the client who
        the user is. It's consumed by the client application, never sent to APIs. The{' '}
        <strong>access token</strong> is an OAuth2 concept — it authorizes API access. It's
        sent to resource servers, which validate it. It can be a JWT (self-contained) or
        opaque (requires introspection). The <strong>refresh token</strong> is a long-lived
        credential used to get new access tokens without re-authenticating the user. Never
        send ID tokens to APIs. Never use access tokens to determine who the user is.
        Refresh tokens must be stored securely (httpOnly cookie or secure server-side storage)
        and should use rotation — each use issues a new refresh token and invalidates the old
        one, so a stolen refresh token can only be used once.
      </Decision>

      <Decision question="How do you architect token exchange for downstream service calls?">
        When Service A receives a user's access token and needs to call Service B on behalf
        of that user, you have three options. (1) Pass the original token downstream — simple
        but means Service B trusts Service A's audience, which violates least privilege.
        (2) Token exchange (RFC 8693) — Service A exchanges the user's token for a new
        token scoped specifically to Service B. This is the correct approach at scale because
        each token is audience-restricted. (3) On-behalf-of flow (Azure AD's OBO) — a
        platform-specific version of token exchange. The staff-level answer always mentions
        audience restriction: an access token for Service A should be rejected by Service B.
      </Decision>

      <Decision question="How should social login (Google, GitHub, etc.) be architected?">
        Social login uses OIDC with the social provider as the identity provider. The
        critical architectural decision is account linking: what happens when a user signs
        up with email/password, then later clicks "Sign in with Google" using the same
        email? You need an account linking strategy — typically match on verified email
        and link the social identity to the existing account. But only link if the email
        is verified by the social provider (Google verifies, some don't). Store the
        provider and external user ID in a separate identity_providers table, not on the
        user record, because a user may have multiple social identities. Never use the
        social provider's user ID as your primary key — providers can change IDs, and
        you'd lose the account.
      </Decision>

      <Insight>
        "OAuth2 is a delegation framework, not a login protocol. If someone says 'we use
        OAuth for login' I immediately ask whether they mean OIDC, because raw OAuth2
        doesn't give you identity. The grant type follows the client type: auth code + PKCE
        for anything user-facing, client credentials for M2M. Tokens are audience-scoped —
        if a token meant for Service A is accepted by Service B, that's a vulnerability."
      </Insight>
    </div>
  );
}

/* ─── Tab 2: Token Design ─── */
function TokenDesignPanel() {
  return (
    <div>
      <h2 className="page-section-title">Tokens are the currency of distributed auth</h2>
      <p className="page-body">
        Every token design decision is a tradeoff between performance, security, and
        operational complexity. Fat tokens vs thin tokens. Short TTLs vs long TTLs.
        Stateless verification vs server-side lookup. The right answer depends on your
        revocation requirements, your latency budget, and how much you trust your
        internal network.
      </p>

      <Decision question="JWT structure — what claims matter and why?">
        A JWT has three parts: header (algorithm, key ID), payload (claims), and
        signature. The critical registered claims are: <code>iss</code> (issuer — who
        created this token), <code>sub</code> (subject — the user), <code>aud</code>
        (audience — who this token is for), <code>exp</code> (expiration), <code>iat</code>
        (issued at), and <code>jti</code> (JWT ID — unique identifier for revocation).
        Always validate <code>aud</code> — a token issued for Service A must be rejected
        by Service B. Use <code>kid</code> (key ID) in the header to support key rotation
        without downtime. Use asymmetric signing (RS256 or ES256) so resource servers can
        verify tokens without knowing the signing secret — they only need the public key,
        which you publish via a JWKS endpoint.
      </Decision>

      <Decision question="Fat tokens vs thin tokens — which approach and when?">
        <Pill type="amber">tradeoff</Pill> Fat tokens embed user claims (roles, permissions,
        org membership) directly in the JWT. Verification is fully stateless — no database
        lookup needed. But the token grows (Stripe's tokens can be 4KB+), and stale
        permissions persist until expiry. Thin tokens contain only the user ID; the
        resource server looks up permissions on every request. This gives real-time
        accuracy but adds a database call to every API request. The hybrid approach is
        the most common in production: medium tokens with commonly-needed claims (user ID,
        org, primary role) and short TTLs (5-15 minutes). Sensitive or frequently-changing
        permissions are looked up in real-time. The token is a cache, not a source of truth.
      </Decision>

      <Decision question="How do you revoke JWTs if they're stateless?">
        <Pill type="red">critical</Pill> This is the hardest problem in JWT-based auth.
        Four strategies, each with tradeoffs: (1) <strong>Short TTL + refresh</strong> — set
        access tokens to 5-15 minutes. Revocation happens by denying the refresh. The user
        stays active for up to TTL minutes after revocation. (2) <strong>Token blocklist</strong>
        — maintain a set of revoked <code>jti</code> values. Check on every request. This
        works but reintroduces server-side state, negating the stateless benefit. Use Redis
        with TTL matching the token expiry so entries auto-expire. (3) <strong>Token
        versioning</strong> — store a version counter on the user record. Embed the version
        in the token. Increment on revocation. Tokens with old versions are rejected. Requires
        a user lookup but it's a single integer comparison. (4) <strong>Short-lived tokens
        only</strong> — no refresh tokens, re-authenticate every 15 minutes via silent auth
        (hidden iframe or background fetch). Works for internal tools.
      </Decision>

      <Decision question="Refresh token rotation — why and how?">
        Refresh token rotation means every time a refresh token is used, the server issues
        a new refresh token and invalidates the old one. If an attacker steals a refresh
        token and uses it, the legitimate user's next refresh attempt fails (because the
        token was already consumed), which signals a compromise. The server then invalidates
        the entire refresh token family — all tokens descended from the original grant.
        This is critical for mobile and SPA clients where refresh tokens can't be stored
        as securely as on a server. Without rotation, a stolen refresh token grants
        indefinite access. With rotation, theft is detectable and the blast radius is
        bounded.
      </Decision>

      <Decision question="Where should tokens be stored on the client?">
        <Pill type="red">critical</Pill> <strong>httpOnly, Secure, SameSite=Strict
        cookies</strong> are the most secure option for web apps. JavaScript can't access
        the token (prevents XSS theft), and SameSite prevents CSRF. The downside: cookies
        are sent on every request to the domain, including non-API requests, and CORS
        configuration is more restrictive. <strong>localStorage</strong> is accessible to
        any JavaScript on the page — a single XSS vulnerability exposes all tokens. Never
        store refresh tokens in localStorage. <strong>sessionStorage</strong> is slightly
        better (cleared on tab close) but still XSS-vulnerable. <strong>In-memory only</strong>
        (JavaScript variable) is the most secure against storage-based attacks but tokens
        are lost on page refresh, requiring silent re-authentication. The BFF (backend for
        frontend) pattern eliminates the problem entirely — tokens live on the server, the
        browser holds only a session cookie.
      </Decision>

      <Insight>
        "I design token systems around the revocation requirement. If we need instant
        revocation (financial, compliance), I use short-lived JWTs (5 min) with refresh
        tokens checked against a Redis blocklist. If we can tolerate 15 minutes of stale
        access (content platform, internal tools), short TTL alone suffices. The token
        is a performance optimization over session lookup — not a replacement for
        server-side state."
      </Insight>
    </div>
  );
}

/* ─── Tab 3: Access Control Models ─── */
function AccessControlPanel() {
  return (
    <div>
      <h2 className="page-section-title">Permission models shape your product's ceiling</h2>
      <p className="page-body">
        The access control model you choose determines what your product can express.
        Pick RBAC and you can say "admins can delete." Pick ABAC and you can say "owners
        can delete their own resources during business hours." Pick ReBAC and you can say
        "anyone with edit access to the parent folder can edit this document." Each model
        has a complexity cost — the staff-level skill is matching the model to the
        product's actual permission requirements, not over-engineering for hypotheticals.
      </p>

      <Decision question="When is RBAC sufficient, and when does it break down?">
        <Pill type="green">start here</Pill> Role-Based Access Control assigns permissions
        to roles, and roles to users. It's the right starting point for most B2B SaaS
        applications: admin, editor, viewer covers 80% of needs. RBAC breaks down when
        you need resource-level permissions ("Alice can edit Document X but not Document Y")
        or when the role explosion problem hits — creating roles like "billing-admin-east-region"
        for every combination of permissions. If you find yourself creating more than 15-20
        roles, RBAC is fighting you. The migration path is to layer ABAC on top: keep roles
        for coarse access, add attribute-based rules for fine-grained control.
      </Decision>

      <Decision question="How does ABAC work and when should you adopt it?">
        Attribute-Based Access Control evaluates policies against attributes of the user,
        the resource, and the environment. A policy might say: "allow if user.role == 'editor'
        AND resource.owner == user.id AND environment.time is within business_hours." ABAC
        is strictly more expressive than RBAC — every RBAC policy can be written as ABAC,
        but not vice versa. The cost is complexity: policies are harder to write, test, debug,
        and audit. Adopt ABAC when you need context-dependent permissions (time, location,
        resource attributes) or when your permission model requires combinations that RBAC
        can't express without role explosion. AWS IAM is the canonical ABAC system.
      </Decision>

      <Decision question="What is ReBAC (Zanzibar) and when is it the right choice?">
        <Pill type="amber">advanced</Pill> Relationship-Based Access Control, popularized
        by Google's Zanzibar paper, defines permissions as relationships between objects. "User
        Alice is an editor of Document X. Editors of a folder are editors of documents in
        that folder." Permissions are checked by traversing the relationship graph. This model
        naturally handles hierarchical permissions (org &gt; workspace &gt; folder &gt; doc),
        sharing ("share this doc with Bob"), and inherited access. Google Drive, Notion, and
        Airbnb use Zanzibar-style systems. The implementation cost is high — you need a
        relationship tuple store, a graph traversal engine, and a caching layer (Zanzibar
        uses a Leopard index for reverse lookups). Use SpiceDB, OpenFGA, or Authzed if
        building this. Choose ReBAC when your product's core model is collaborative content
        with sharing and inheritance.
      </Decision>

      <Decision question="Should authorization be checked at the API gateway or the service level?">
        <Pill type="red">critical</Pill> Both, at different granularities. The API gateway
        handles coarse-grained checks: is the token valid? Is the user in the right tenant?
        Does the user have the required scope for this API endpoint? The service handles
        fine-grained checks: can this user modify this specific resource? Does the user's
        plan allow this feature? The gateway acts as a bouncer (valid ticket to enter); the
        service acts as a permissions check (authorized for this specific seat). Never put
        resource-level authorization in the gateway — it would need to understand every
        service's data model, creating tight coupling and a single point of failure for all
        permission logic.
      </Decision>

      <Decision question="How do you isolate tenants in a multi-tenant system?">
        Tenant isolation is an authorization problem at the data layer. Three approaches:
        (1) <strong>Row-level isolation</strong> — every table has a <code>tenant_id</code>
        column, every query includes a tenant filter. Simple but relies on application code
        never forgetting the filter. Use Postgres Row-Level Security (RLS) as a safety net.
        (2) <strong>Schema-level isolation</strong> — each tenant gets their own database
        schema. Stronger isolation, but migration complexity grows linearly with tenant count.
        (3) <strong>Database-level isolation</strong> — each tenant gets their own database.
        Strongest isolation, required for compliance in some industries (healthcare, finance),
        but operational cost is highest. Most B2B SaaS starts with row-level and moves to
        schema or database isolation for enterprise tiers. The auth system must enforce
        tenant boundaries at the token level — every token includes the tenant ID, and every
        service validates it before any data access.
      </Decision>

      <Insight tag="Architecture signal">
        "I'd start with RBAC for the first version — admin, editor, viewer covers our
        launch use cases. But I'd abstract the permission check behind a policy evaluation
        interface so we can swap in ABAC or ReBAC later without touching service code. The
        gateway validates tokens and tenant membership. Each service calls the policy engine
        for resource-level decisions. This keeps authorization centralized in logic but
        decentralized in enforcement."
      </Insight>
    </div>
  );
}

/* ─── Tab 4: Anti-patterns ─── */
function AntiPatternsPanel() {
  return (
    <div>
      <h2 className="page-section-title">Common auth mistakes that reveal junior thinking</h2>
      <p className="page-body">
        Auth anti-patterns are dangerous because they often work in development and staging,
        then fail silently in production — until a breach. The real test is whether you've
        been burned by these mistakes or are about to be.
      </p>

      {/* Anti-pattern 1 */}
      <div style={styles.anti}>
        <p style={styles.strike}>
          "We'll just store the JWT in localStorage and validate it on the frontend."
        </p>
        <p style={styles.better}>
          <span style={{ ...styles.dot, background: 'var(--text-success)' }} />
          "Access tokens go in httpOnly cookies or stay in-memory. Frontend code never
          touches tokens directly. All validation happens server-side — the frontend only
          observes the result (authenticated or not). A single XSS vulnerability in an
          npm dependency would expose every user's token if stored in localStorage."
        </p>
      </div>

      {/* Anti-pattern 2 */}
      <div style={styles.anti}>
        <p style={styles.strike}>
          "We check permissions in the API gateway so services don't need to worry about auth."
        </p>
        <p style={styles.better}>
          <span style={{ ...styles.dot, background: 'var(--text-success)' }} />
          "The gateway handles authentication and coarse authorization (valid token, correct
          tenant, required scope). Fine-grained authorization lives in each service because
          only the service understands its resource model. If someone bypasses the gateway
          (internal service call, queue consumer), the service must still enforce permissions.
          Defense in depth — never a single gate."
        </p>
      </div>

      {/* Anti-pattern 3 */}
      <div style={styles.anti}>
        <p style={styles.strike}>
          "We use a long-lived JWT (24 hours) so users don't have to re-authenticate often."
        </p>
        <p style={styles.better}>
          <span style={{ ...styles.dot, background: 'var(--text-success)' }} />
          "Access tokens should be short-lived (5-15 minutes). Use a refresh token with
          rotation to maintain the session transparently. A 24-hour JWT means a compromised
          token grants 24 hours of access with no way to revoke it. Short TTLs bound the
          blast radius. The refresh flow handles the UX — users never notice."
        </p>
      </div>

      {/* Anti-pattern 4 */}
      <div style={styles.anti}>
        <p style={styles.strike}>
          "We built our own authentication system — it's just bcrypt and sessions, how hard can it be?"
        </p>
        <p style={styles.better}>
          <span style={{ ...styles.dot, background: 'var(--text-success)' }} />
          "Authentication is a liability, not a differentiator. I'd use an established IdP
          (Auth0, Cognito, Keycloak) for credential management and focus engineering time on
          the authorization model, which IS a differentiator. Custom auth means you own
          password reset flows, brute-force protection, credential stuffing defense, MFA
          implementation, and security patching — forever. The ROI is almost never there."
        </p>
      </div>

      {/* Anti-pattern 5 */}
      <div style={styles.anti}>
        <p style={styles.strike}>
          "Our microservices trust each other, so internal calls don't need authentication."
        </p>
        <p style={styles.better}>
          <span style={{ ...styles.dot, background: 'var(--text-success)' }} />
          "Zero trust — every service-to-service call is authenticated, even internal ones.
          Use mTLS or service tokens with the client credentials grant. An attacker who
          compromises one service should not get free access to every other service. The
          network boundary is not a trust boundary. This is how every major breach scales
          from one compromised host to full lateral movement."
        </p>
      </div>

      {/* Anti-pattern 6 */}
      <div style={styles.anti}>
        <p style={styles.strike}>
          "We pass the user's access token to all downstream services in the call chain."
        </p>
        <p style={styles.better}>
          <span style={{ ...styles.dot, background: 'var(--text-success)' }} />
          "Each service should have its own audience-scoped token. Use token exchange
          (RFC 8693) so Service A exchanges the user's token for a new token scoped to
          Service B. If Service A's token works on Service B, then a compromised Service A
          becomes a skeleton key for the entire system. Audience restriction is non-negotiable
          for defense in depth."
        </p>
      </div>

      {/* Anti-pattern 7 */}
      <div style={styles.anti}>
        <p style={styles.strike}>
          "We encode the user's permissions directly in the JWT so authorization is fully stateless."
        </p>
        <p style={styles.better}>
          <span style={{ ...styles.dot, background: 'var(--text-success)' }} />
          "Embedding all permissions in the token creates two problems: token size (a user
          with 50 permissions across 10 services creates a multi-KB token that exceeds cookie
          size limits) and staleness (permissions changed after token issuance aren't reflected
          until the next token refresh). Embed coarse claims (role, org, tier). Check
          fine-grained permissions at the service level against a real-time source."
        </p>
      </div>

      <Insight type="warn" tag="Common pitfall">
        When evaluating an auth design, the question isn't whether you know OAuth2
        grant types — it's whether you understand the security implications of
        every design choice. The strongest signal is when you proactively mention threat
        models: "If this token is stolen, here's the blast radius, and here's how we
        bound it." Every auth decision should have a corresponding "what happens when
        this is compromised" answer.
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
