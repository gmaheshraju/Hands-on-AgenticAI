import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { redact, redactMessages, scanOnly } from '../pii.js';
import { TokenBucketLimiter } from '../rateLimit.js';
import { CircuitBreaker } from '../circuitBreaker.js';
import { ModelRouter } from '../router.js';
import { CostTracker } from '../costTracker.js';
import { AuditLog } from '../audit.js';
import { LLMGateway } from '../gateway.js';

// ─── PII Redaction ───

describe('PII Redaction', () => {
  it('redacts SSN', () => {
    const { redacted, findings } = redact('SSN is 123-45-6789');
    assert.ok(!redacted.includes('123-45-6789'));
    assert.ok(redacted.includes('[SSN_REDACTED]'));
    assert.equal(findings[0].type, 'SSN');
  });

  it('redacts email addresses', () => {
    const { redacted } = redact('Contact john@example.com for info');
    assert.ok(redacted.includes('[EMAIL_REDACTED]'));
  });

  it('redacts AWS access keys', () => {
    const { redacted } = redact('Key: AKIAIOSFODNN7EXAMPLE');
    assert.ok(redacted.includes('[AWS_KEY_REDACTED]'));
  });

  it('redacts Indian PAN numbers', () => {
    const { redacted } = redact('PAN: ABCDE1234F');
    assert.ok(redacted.includes('[PAN_REDACTED]'));
  });

  it('redacts API keys (sk- prefix)', () => {
    const { redacted } = redact('Token: sk-abcdefghij1234567890abcd');
    assert.ok(redacted.includes('[API_KEY_REDACTED]'));
  });

  it('redacts multiple PII types in one string', () => {
    const { findings } = redact('Email john@test.com, SSN 111-22-3333, key AKIAIOSFODNN7EXAMPLE');
    const types = findings.map(f => f.type);
    assert.ok(types.includes('EMAIL'));
    assert.ok(types.includes('SSN'));
    assert.ok(types.includes('AWS_KEY'));
  });

  it('preserves non-PII text', () => {
    const { redacted, findings } = redact('Hello, world!');
    assert.equal(redacted, 'Hello, world!');
    assert.equal(findings.length, 0);
  });

  it('redacts PII from message arrays', () => {
    const { messages, findings } = redactMessages([
      { role: 'user', content: 'My email is test@foo.com' },
      { role: 'assistant', content: 'Got it.' },
    ]);
    assert.ok(!messages[0].content.includes('test@foo.com'));
    assert.equal(messages[1].content, 'Got it.');
    assert.ok(findings.length > 0);
  });

  it('scanOnly detects without redacting', () => {
    const findings = scanOnly('SSN 123-45-6789 and email a@b.com');
    assert.ok(findings.length >= 2);
    assert.ok(findings[0].snippet.includes('***'));
  });
});

// ─── Rate Limiting ───

describe('Rate Limiting', () => {
  it('allows requests under limit', () => {
    const rl = new TokenBucketLimiter({ requestsPerMinute: 10, tokensPerMinute: 10000 });
    const check = rl.check('team-a', 500);
    assert.equal(check.allowed, true);
  });

  it('blocks when request limit exhausted', () => {
    const rl = new TokenBucketLimiter({ requestsPerMinute: 2, tokensPerMinute: 100000 });
    rl.consume('team-a', 100);
    rl.consume('team-a', 100);
    rl.consume('team-a', 100);
    const check = rl.check('team-a', 100);
    assert.equal(check.allowed, false);
    assert.equal(check.reason, 'request_limit');
    assert.ok(check.retryAfterMs > 0);
  });

  it('blocks when token limit exhausted', () => {
    const rl = new TokenBucketLimiter({ requestsPerMinute: 100, tokensPerMinute: 1000 });
    rl.consume('team-a', 1400);
    const check = rl.check('team-a', 500);
    assert.equal(check.allowed, false);
    assert.equal(check.reason, 'token_limit');
  });

  it('supports per-team limits', () => {
    const rl = new TokenBucketLimiter({ requestsPerMinute: 100 });
    rl.setTeamLimit('free-tier', { requestsPerMinute: 5, tokensPerMinute: 5000 });
    const checkDefault = rl.check('paid-team', 100);
    const checkFree = rl.check('free-tier', 100);
    assert.equal(checkDefault.allowed, true);
    assert.equal(checkFree.allowed, true);
    assert.ok(checkDefault.remaining.requests > checkFree.remaining.requests);
  });

  it('returns status with utilization', () => {
    const rl = new TokenBucketLimiter({ requestsPerMinute: 10, tokensPerMinute: 10000 });
    rl.consume('team-a', 5000);
    const status = rl.status('team-a');
    assert.equal(status.teamId, 'team-a');
    assert.ok(status.tokens.utilizationPct > 0);
  });
});

// ─── Circuit Breaker ───

describe('Circuit Breaker', () => {
  it('starts closed', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    const check = cb.canRequest('anthropic');
    assert.equal(check.allowed, true);
    assert.equal(check.state, 'closed');
  });

  it('opens after threshold failures', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2 });
    cb.recordFailure('anthropic', new Error('timeout'));
    cb.recordFailure('anthropic', new Error('timeout'));
    const check = cb.canRequest('anthropic');
    assert.equal(check.allowed, false);
    assert.equal(check.state, 'open');
  });

  it('transitions to half-open after recovery time', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, recoveryTimeMs: 100 });
    cb.recordFailure('openai', new Error('down'));
    cb._getState('openai').lastFailure = Date.now() - 200;
    const check = cb.canRequest('openai');
    assert.equal(check.state, 'half_open');
  });

  it('closes after successful half-open attempts', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, recoveryTimeMs: 100, halfOpenMaxAttempts: 1 });
    cb.recordFailure('openai', new Error('down'));
    cb._getState('openai').lastFailure = Date.now() - 200;
    cb.canRequest('openai');
    cb.recordSuccess('openai');
    const status = cb.status('openai');
    assert.equal(status.state, 'closed');
  });

  it('re-opens on failure during half-open', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, recoveryTimeMs: 0 });
    cb.recordFailure('google', new Error('down'));
    cb.canRequest('google');
    cb.recordFailure('google', new Error('still down'));
    const status = cb.status('google');
    assert.equal(status.state, 'open');
  });

  it('tracks failure rate', () => {
    const cb = new CircuitBreaker({ failureThreshold: 10 });
    cb.recordSuccess('anthropic');
    cb.recordSuccess('anthropic');
    cb.recordFailure('anthropic', new Error('err'));
    const status = cb.status('anthropic');
    assert.equal(status.failureRate, 33);
  });

  it('reports retryAfterMs while open and before recovery elapses', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, recoveryTimeMs: 30000 });
    cb.recordFailure('openai', new Error('down'));
    const check = cb.canRequest('openai');
    assert.equal(check.allowed, false);
    assert.equal(check.state, 'open');
    assert.ok(check.retryAfterMs > 0);
    assert.ok(check.retryAfterMs <= 30000);
  });

  it('throttles concurrent probes once half-open attempts are exhausted', () => {
    // The half-open state should let only halfOpenMaxAttempts probes through.
    // Simulate several in-flight probes racing before any has resolved.
    const cb = new CircuitBreaker({ failureThreshold: 1, recoveryTimeMs: 100, halfOpenMaxAttempts: 2 });
    cb.recordFailure('google', new Error('down'));
    const s = cb._getState('google');
    s.lastFailure = Date.now() - 200; // recovery window elapsed
    cb.canRequest('google'); // transitions open -> half_open
    s.halfOpenAttempts = 2; // both probe slots already consumed
    const check = cb.canRequest('google');
    assert.equal(check.allowed, false);
    assert.equal(check.state, 'half_open');
    assert.equal(check.reason, 'max_half_open_attempts');
  });

  it('self-heals: a success in closed state decays accumulated failures', () => {
    // A provider that hiccups but recovers should not creep toward the
    // failure threshold — each success walks the failure count back down.
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    cb.recordFailure('anthropic', new Error('blip'));
    cb.recordFailure('anthropic', new Error('blip'));
    assert.equal(cb.status('anthropic').consecutiveFailures, 2);
    cb.recordSuccess('anthropic');
    assert.equal(cb.status('anthropic').consecutiveFailures, 1);
    cb.recordSuccess('anthropic');
    cb.recordSuccess('anthropic'); // never drops below zero
    assert.equal(cb.status('anthropic').consecutiveFailures, 0);
    assert.equal(cb.status('anthropic').state, 'closed');
  });

  it('allStatus aggregates every tracked provider', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    cb.recordSuccess('anthropic');
    cb.recordFailure('openai', new Error('down'));
    const all = cb.allStatus();
    assert.deepEqual(Object.keys(all).sort(), ['anthropic', 'openai']);
    assert.equal(all.anthropic.state, 'closed');
    assert.equal(all.openai.state, 'open');
  });
});

// ─── Model Router ───

describe('Model Router', () => {
  it('routes simple queries to fast tier', () => {
    const router = new ModelRouter();
    const route = router.route({ messages: [{ content: 'Summarize this.' }] });
    assert.equal(route.tier, 'fast');
    assert.ok(route.reason.includes('complexity'));
  });

  it('routes complex queries to premium tier', () => {
    const router = new ModelRouter();
    const route = router.route({
      messages: [{ content: 'Analyze and compare the security architecture of our distributed system. Evaluate each microservice for vulnerabilities. Design a comprehensive migration plan with backward compatibility. Consider implications for session management and OAuth2 flow across services.' }],
      tools: [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }, { name: 'e' }, { name: 'f' }],
    });
    assert.equal(route.tier, 'premium');
  });

  it('respects explicit model selection', () => {
    const router = new ModelRouter();
    const route = router.route({ model: 'gpt-4o', messages: [{ content: 'Hi' }] });
    assert.equal(route.model, 'gpt-4o');
    assert.equal(route.reason, 'explicit_model');
  });

  it('respects team overrides', () => {
    const router = new ModelRouter();
    router.setTeamModel('budget-team', 'fast');
    const route = router.route({
      teamId: 'budget-team',
      messages: [{ content: 'Analyze complex system architecture with deep security review and migration planning' }],
      tools: [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }, { name: 'e' }, { name: 'f' }],
    });
    assert.equal(route.tier, 'fast');
  });

  it('falls back when provider is circuit-broken', () => {
    const router = new ModelRouter();
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    cb.recordFailure('anthropic', new Error('down'));
    const route = router.route({ model: 'claude-sonnet-4', messages: [{ content: 'test' }] }, cb);
    assert.notEqual(route.provider, 'anthropic');
  });

  it('estimates cost correctly', () => {
    const router = new ModelRouter();
    const cost = router.estimateCost('claude-sonnet-4', 1000, 500);
    assert.ok(cost > 0);
    assert.equal(cost, (1000 / 1000) * 0.003 + (500 / 1000) * 0.015);
  });
});

// ─── Cost Tracker ───

describe('Cost Tracker', () => {
  it('records and tracks costs', () => {
    const ct = new CostTracker();
    ct.record({ teamId: 'eng', model: 'claude-sonnet-4', costUsd: 0.05 });
    ct.record({ teamId: 'eng', model: 'claude-sonnet-4', costUsd: 0.03 });
    const report = ct.teamReport('eng');
    assert.equal(report.requestCount, 2);
    assert.equal(report.totalCostUsd, 0.08);
  });

  it('enforces daily budgets', () => {
    const ct = new CostTracker();
    ct.setBudget('small-team', 0.10);
    ct.record({ teamId: 'small-team', costUsd: 0.08 });
    ct.record({ teamId: 'small-team', costUsd: 0.03 });
    const check = ct.checkBudget('small-team');
    assert.equal(check.allowed, false);
    assert.equal(check.reason, 'daily_budget_exceeded');
  });

  it('generates budget alerts at thresholds', () => {
    const ct = new CostTracker({ alertThresholds: [0.5, 0.8] });
    ct.setBudget('eng', 1.00);
    ct.record({ teamId: 'eng', costUsd: 0.60 });
    assert.ok(ct.alerts.length >= 1);
    assert.equal(ct.alerts[0].threshold, 0.5);
  });

  it('detects waste patterns', () => {
    const ct = new CostTracker();
    ct.record({ teamId: 'eng', model: 'claude-opus-4', inputTokens: 100, outputTokens: 50, costUsd: 0.05 });
    ct.record({ teamId: 'eng', model: 'claude-opus-4', inputTokens: 80, outputTokens: 30, costUsd: 0.04 });
    const waste = ct.wasteReport();
    const premiumWaste = waste.find(w => w.pattern === 'premium_model_for_simple_tasks');
    assert.ok(premiumWaste);
    assert.ok(premiumWaste.potentialSavingsUsd > 0);
  });

  it('allows requests with no budget set', () => {
    const ct = new CostTracker();
    const check = ct.checkBudget('no-budget-team');
    assert.equal(check.allowed, true);
  });
});

// ─── Audit Log ───

describe('Audit Log', () => {
  it('logs and queries entries', () => {
    const log = new AuditLog();
    log.log({ teamId: 'eng', action: 'request', model: 'claude-sonnet-4', status: 'success' });
    log.log({ teamId: 'eng', action: 'request', model: 'gpt-4o', status: 'success' });
    log.log({ teamId: 'marketing', action: 'request', model: 'gpt-4o-mini', status: 'success' });
    const engLogs = log.query({ teamId: 'eng' });
    assert.equal(engLogs.length, 2);
  });

  it('filters by PII detection', () => {
    const log = new AuditLog();
    log.log({ teamId: 'eng', action: 'pii_detected', piiDetected: true, piiTypes: ['EMAIL', 'SSN'] });
    log.log({ teamId: 'eng', action: 'request', piiDetected: false });
    const piiLogs = log.query({ piiDetected: true });
    assert.equal(piiLogs.length, 1);
  });

  it('generates compliance report', () => {
    const log = new AuditLog();
    log.log({ teamId: 'eng', action: 'request', status: 'success', costUsd: 0.05, model: 'claude-sonnet-4' });
    log.log({ teamId: 'eng', action: 'pii_detected', piiDetected: true, piiTypes: ['EMAIL'], status: 'success', model: 'claude-sonnet-4' });
    log.log({ teamId: 'eng', action: 'blocked', status: 'blocked' });
    const report = log.complianceReport('eng', Date.now() - 60000);
    assert.equal(report.totalRequests, 3);
    assert.equal(report.piiDetectionEvents, 1);
    assert.equal(report.blockedRequests, 1);
    assert.ok(report.piiByType.EMAIL > 0);
  });

  it('enforces max entries', () => {
    const log = new AuditLog({ maxEntries: 10 });
    for (let i = 0; i < 15; i++) {
      log.log({ action: 'request', status: 'success' });
    }
    assert.ok(log.entries.length <= 10);
  });
});

// ─── Full Gateway Integration ───

describe('LLM Gateway Integration', () => {
  function createGateway() {
    const gw = new LLMGateway({
      rateLimit: { requestsPerMinute: 100, tokensPerMinute: 500000 },
      circuitBreaker: { failureThreshold: 3, recoveryTimeMs: 1000 },
    });
    gw.registerProvider('anthropic', async (req) => ({
      content: `Anthropic response for ${req.model}`,
      usage: { inputTokens: 100, outputTokens: 50 },
    }));
    gw.registerProvider('openai', async (req) => ({
      content: `OpenAI response for ${req.model}`,
      usage: { inputTokens: 100, outputTokens: 50 },
    }));
    gw.registerProvider('google', async (req) => ({
      content: `Google response for ${req.model}`,
      usage: { inputTokens: 100, outputTokens: 50 },
    }));
    return gw;
  }

  it('processes a simple request end-to-end', async () => {
    const gw = createGateway();
    const result = await gw.request({
      teamId: 'eng',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    assert.ok(result.content);
    assert.ok(result.requestId);
    assert.ok(result.costUsd >= 0);
    assert.ok(result.latencyMs >= 0);
    assert.ok(result.routingReason);
  });

  it('redacts PII before sending to provider', async () => {
    const gw = new LLMGateway({ rateLimit: { requestsPerMinute: 100, tokensPerMinute: 500000 } });
    let capturedMessages;
    gw.registerProvider('anthropic', async (req) => {
      capturedMessages = req.messages;
      return { content: 'ok', usage: { inputTokens: 50, outputTokens: 20 } };
    });
    gw.registerProvider('openai', async () => ({ content: 'ok', usage: { inputTokens: 50, outputTokens: 20 } }));
    gw.registerProvider('google', async () => ({ content: 'ok', usage: { inputTokens: 50, outputTokens: 20 } }));
    await gw.request({
      teamId: 'eng',
      model: 'claude-sonnet-4',
      messages: [{ role: 'user', content: 'My email is secret@corp.com' }],
    });
    assert.ok(capturedMessages, 'Provider should have been called');
    assert.ok(!capturedMessages[0].content.includes('secret@corp.com'));
    assert.ok(capturedMessages[0].content.includes('[EMAIL_REDACTED]'));
  });

  it('blocks when budget exhausted', async () => {
    const gw = createGateway();
    gw.costTracker.setBudget('broke-team', 0.001);
    gw.costTracker.record({ teamId: 'broke-team', costUsd: 0.002 });
    const result = await gw.request({
      teamId: 'broke-team',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    assert.equal(result.error, 'BUDGET_EXCEEDED');
  });

  it('fails over when provider is down', async () => {
    const gw = new LLMGateway({ circuitBreaker: { failureThreshold: 1, recoveryTimeMs: 60000 } });
    gw.registerProvider('anthropic', async () => { throw new Error('down'); });
    gw.registerProvider('openai', async (req) => ({
      content: 'OpenAI fallback', usage: { inputTokens: 50, outputTokens: 20 },
    }));
    gw.registerProvider('google', async (req) => ({
      content: 'Google fallback', usage: { inputTokens: 50, outputTokens: 20 },
    }));
    const result = await gw.request({
      model: 'claude-sonnet-4',
      messages: [{ role: 'user', content: 'Test failover' }],
    });
    assert.notEqual(result.provider, 'anthropic');
    assert.ok(result.content);
  });

  it('runs custom middleware', async () => {
    const gw = createGateway();
    gw.use(async (ctx) => {
      if (ctx.originalRequest.messages?.some(m => m.content.includes('DROP TABLE'))) {
        return { block: true, reason: 'sql_injection_detected' };
      }
    });
    const result = await gw.request({
      teamId: 'eng',
      messages: [{ role: 'user', content: 'Run this: DROP TABLE users;' }],
    });
    assert.equal(result.error, 'MIDDLEWARE_BLOCKED');
    assert.equal(result.reason, 'sql_injection_detected');
  });

  it('produces a dashboard', async () => {
    const gw = createGateway();
    gw.costTracker.setBudget('eng', 5.00);
    await gw.request({ teamId: 'eng', messages: [{ role: 'user', content: 'Test' }] });
    const dash = gw.dashboard();
    assert.ok(dash.providers);
    assert.ok(dash.costs);
    assert.ok(dash.costs.eng);
    assert.equal(dash.costs.eng.requestCount, 1);
  });
});
