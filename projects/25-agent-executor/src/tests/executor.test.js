import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PolicyEngine } from '../policy.js';
import { ActionRegistry } from '../actionRegistry.js';
import { Sandbox } from '../sandbox.js';
import { ApprovalQueue } from '../approvals.js';
import { AuditTrail } from '../auditTrail.js';
import { AgentExecutor } from '../executor.js';

// ─── Policy Engine ───

describe('Policy Engine', () => {
  it('denies by default when no policies match', () => {
    const pe = new PolicyEngine();
    const result = pe.evaluate({ principal: 'agent-1', action: 'deploy', resource: 'prod' });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'no_matching_policy');
  });

  it('allows when matching allow policy exists', () => {
    const pe = new PolicyEngine();
    pe.addPolicy({ id: 'p1', effect: 'allow', principals: ['agent-1'], actions: ['read'], resources: ['*'] });
    const result = pe.evaluate({ principal: 'agent-1', action: 'read', resource: 'data/users' });
    assert.equal(result.allowed, true);
    assert.equal(result.policy, 'p1');
  });

  it('explicit deny overrides allow', () => {
    const pe = new PolicyEngine();
    pe.addPolicy({ id: 'allow-all', effect: 'allow', principals: ['*'], actions: ['*'], resources: ['*'], priority: 1 });
    pe.addPolicy({ id: 'deny-deploy', effect: 'deny', principals: ['*'], actions: ['deploy'], resources: ['*'], priority: 10 });
    const result = pe.evaluate({ principal: 'agent-1', action: 'deploy', resource: 'prod' });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'explicit_deny');
  });

  it('evaluates conditions', () => {
    const pe = new PolicyEngine();
    pe.addPolicy({
      id: 'p1', effect: 'allow', principals: ['*'], actions: ['write'], resources: ['*'],
      conditions: { trustLevel: { in: ['elevated', 'admin'] } },
    });
    const denied = pe.evaluate({ principal: 'agent-1', action: 'write', resource: 'db', context: { trustLevel: 'basic' } });
    assert.equal(denied.allowed, false);
    const allowed = pe.evaluate({ principal: 'agent-1', action: 'write', resource: 'db', context: { trustLevel: 'elevated' } });
    assert.equal(allowed.allowed, true);
  });

  it('supports wildcard prefix matching', () => {
    const pe = new PolicyEngine();
    pe.addPolicy({ id: 'p1', effect: 'allow', principals: ['*'], actions: ['db:*'], resources: ['*'] });
    const result = pe.evaluate({ principal: 'x', action: 'db:query', resource: 'users' });
    assert.equal(result.allowed, true);
    const denied = pe.evaluate({ principal: 'x', action: 'api:call', resource: 'users' });
    assert.equal(denied.allowed, false);
  });

  it('handles condition operators: lessThan, greaterThan, notEquals', () => {
    const pe = new PolicyEngine();
    pe.addPolicy({
      id: 'p1', effect: 'deny', principals: ['*'], actions: ['*'], resources: ['*'], priority: 10,
      conditions: { violationCount: { greaterThan: 2 } },
    });
    pe.addPolicy({ id: 'p2', effect: 'allow', principals: ['*'], actions: ['*'], resources: ['*'], priority: 1 });
    const safe = pe.evaluate({ principal: 'a', action: 'read', resource: 'x', context: { violationCount: 1 } });
    assert.equal(safe.allowed, true);
    const blocked = pe.evaluate({ principal: 'a', action: 'read', resource: 'x', context: { violationCount: 5 } });
    assert.equal(blocked.allowed, false);
  });
});

// ─── Action Registry ───

describe('Action Registry', () => {
  it('registers and retrieves actions', () => {
    const reg = new ActionRegistry();
    reg.register({ id: 'db:query', name: 'Query', category: 'database', riskLevel: 'low', handler: async () => {} });
    const action = reg.get('db:query');
    assert.equal(action.name, 'Query');
    assert.equal(action.riskLevel, 'low');
  });

  it('validates required fields', () => {
    const reg = new ActionRegistry();
    reg.register({ id: 'a1', handler: async () => {}, schema: { required: ['name', 'email'] } });
    const missing = reg.validate('a1', { name: 'test' });
    assert.equal(missing.valid, false);
    assert.ok(missing.errors.some(e => e.includes('email')));
    const valid = reg.validate('a1', { name: 'test', email: 'a@b.com' });
    assert.equal(valid.valid, true);
  });

  it('validates types and enums', () => {
    const reg = new ActionRegistry();
    reg.register({
      id: 'a1', handler: async () => {},
      schema: { properties: { method: { type: 'string', enum: ['GET', 'POST'] }, count: { type: 'number', minimum: 1, maximum: 100 } } },
    });
    const badMethod = reg.validate('a1', { method: 'DELETE' });
    assert.equal(badMethod.valid, false);
    const badCount = reg.validate('a1', { count: 200 });
    assert.equal(badCount.valid, false);
    const good = reg.validate('a1', { method: 'GET', count: 50 });
    assert.equal(good.valid, true);
  });

  it('returns error for unknown action', () => {
    const reg = new ActionRegistry();
    const result = reg.validate('nonexistent', {});
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Unknown'));
  });

  it('lists by category and risk', () => {
    const reg = new ActionRegistry();
    reg.register({ id: 'a1', category: 'db', riskLevel: 'low', handler: async () => {} });
    reg.register({ id: 'a2', category: 'db', riskLevel: 'high', handler: async () => {} });
    reg.register({ id: 'a3', category: 'api', riskLevel: 'low', handler: async () => {} });
    assert.equal(reg.listByCategory('db').length, 2);
    assert.equal(reg.listByRisk('low').length, 2);
  });

  it('generates summary', () => {
    const reg = new ActionRegistry();
    reg.register({ id: 'a1', category: 'db', riskLevel: 'low', handler: async () => {} });
    reg.register({ id: 'a2', category: 'api', riskLevel: 'critical', handler: async () => {} });
    const summary = reg.summary();
    assert.equal(summary.totalActions, 2);
    assert.equal(summary.byCategory.db, 1);
    assert.equal(summary.byRisk.critical, 1);
  });
});

// ─── Sandbox ───

describe('Sandbox', () => {
  it('creates sessions with permissions', () => {
    const sb = new Sandbox();
    const session = sb.createSession('agent-1', { canReadFiles: true });
    assert.equal(session.state, 'active');
    assert.equal(session.permissions.canReadFiles, true);
    assert.equal(session.permissions.canWriteFiles, false);
  });

  it('allows permitted file reads', () => {
    const sb = new Sandbox();
    const session = sb.createSession('agent-1', { canReadFiles: true });
    const result = sb.checkPermission(session.id, { type: 'file_read', target: '/app/data.csv' });
    assert.equal(result.allowed, true);
  });

  it('blocks file reads to sensitive paths', () => {
    const sb = new Sandbox();
    const session = sb.createSession('agent-1', { canReadFiles: true });
    const result = sb.checkPermission(session.id, { type: 'file_read', target: '/etc/shadow' });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'path_blocked');
  });

  it('blocks .env file access', () => {
    const sb = new Sandbox();
    const session = sb.createSession('agent-1', { canReadFiles: true });
    const result = sb.checkPermission(session.id, { type: 'file_read', target: '/app/.env' });
    assert.equal(result.allowed, false);
  });

  it('denies unpermitted operations', () => {
    const sb = new Sandbox();
    const session = sb.createSession('agent-1', { canReadFiles: true });
    const writeCheck = sb.checkPermission(session.id, { type: 'file_write', target: '/app/x.txt' });
    assert.equal(writeCheck.allowed, false);
    const netCheck = sb.checkPermission(session.id, { type: 'network', target: 'https://api.com' });
    assert.equal(netCheck.allowed, false);
  });

  it('suspends after 3 violations', () => {
    const sb = new Sandbox();
    const session = sb.createSession('agent-1', {});
    sb.checkPermission(session.id, { type: 'file_read', target: '/a' });
    sb.checkPermission(session.id, { type: 'file_write', target: '/b' });
    sb.checkPermission(session.id, { type: 'network', target: 'x' });
    const s = sb.getSession(session.id);
    assert.equal(s.state, 'suspended');
    assert.equal(s.violations.length, 3);
  });

  it('enforces file ops limit', () => {
    const sb = new Sandbox({ maxFileOps: 2 });
    const session = sb.createSession('agent-1', { canReadFiles: true });
    sb.checkPermission(session.id, { type: 'file_read', target: '/a' });
    sb.checkPermission(session.id, { type: 'file_read', target: '/b' });
    const third = sb.checkPermission(session.id, { type: 'file_read', target: '/c' });
    assert.equal(third.allowed, false);
    assert.equal(third.reason, 'file_ops_limit_reached');
  });

  it('enforces allowed directories', () => {
    const sb = new Sandbox();
    const session = sb.createSession('agent-1', { canReadFiles: true, allowedDirs: ['/app/data'] });
    const allowed = sb.checkPermission(session.id, { type: 'file_read', target: '/app/data/file.csv' });
    assert.equal(allowed.allowed, true);
    const denied = sb.checkPermission(session.id, { type: 'file_read', target: '/home/user/secrets' });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'outside_allowed_directory');
  });

  it('enforces allowed hosts for network', () => {
    const sb = new Sandbox({ allowedHosts: ['api.internal.com'] });
    const session = sb.createSession('agent-1', { canNetwork: true });
    const allowed = sb.checkPermission(session.id, { type: 'network', target: 'https://api.internal.com/health' });
    assert.equal(allowed.allowed, true);
    const denied = sb.checkPermission(session.id, { type: 'network', target: 'https://evil.com/exfil' });
    assert.equal(denied.allowed, false);
  });
});

// ─── Approval Queue ───

describe('Approval Queue', () => {
  it('queues requests for approval', () => {
    const aq = new ApprovalQueue();
    const result = aq.submit({ agentId: 'a1', action: 'deploy', riskLevel: 'high' });
    assert.equal(result.status, 'pending');
    assert.ok(result.id);
  });

  it('auto-approves low risk actions', () => {
    const aq = new ApprovalQueue({
      autoApproveRules: [{ name: 'low_risk', maxRisk: 'low' }],
    });
    const result = aq.submit({ agentId: 'a1', action: 'read', riskLevel: 'low' });
    assert.equal(result.status, 'auto_approved');
  });

  it('approves and denies requests', () => {
    const aq = new ApprovalQueue();
    const req = aq.submit({ agentId: 'a1', action: 'deploy', riskLevel: 'high' });
    const approved = aq.approve(req.id, 'admin', 'looks good');
    assert.equal(approved.status, 'approved');
    assert.equal(aq.getPending().length, 0);
  });

  it('escalates through the chain', () => {
    const aq = new ApprovalQueue({ escalationChain: ['lead', 'manager', 'cto'] });
    const req = aq.submit({ agentId: 'a1', action: 'deploy', riskLevel: 'critical' });
    const esc1 = aq.escalate(req.id);
    assert.equal(esc1.escalatedTo, 'lead');
    const esc2 = aq.escalate(req.id);
    assert.equal(esc2.escalatedTo, 'manager');
  });

  it('expires stale requests', () => {
    const aq = new ApprovalQueue({ timeout: 100 });
    const result = aq.submit({ agentId: 'a1', action: 'deploy', riskLevel: 'high' });
    const req = aq.getPending().find(r => r.id === result.id);
    req.expiresAt = Date.now() - 1;
    const expired = aq.checkExpired();
    assert.equal(expired.length, 1);
    assert.equal(aq.getPending().length, 0);
  });

  it('tracks approval history', () => {
    const aq = new ApprovalQueue();
    const r1 = aq.submit({ agentId: 'a1', action: 'deploy', riskLevel: 'high' });
    const r2 = aq.submit({ agentId: 'a2', action: 'deploy', riskLevel: 'high' });
    aq.approve(r1.id, 'admin');
    aq.deny(r2.id, 'admin', 'too risky');
    const history = aq.getHistory({});
    assert.equal(history.length, 2);
    assert.equal(history[0].status, 'approved');
    assert.equal(history[1].status, 'denied');
  });
});

// ─── Audit Trail ───

describe('Audit Trail', () => {
  it('records and queries events', () => {
    const at = new AuditTrail();
    at.record({ agentId: 'a1', action: 'read', result: 'allowed' });
    at.record({ agentId: 'a1', action: 'write', result: 'denied' });
    at.record({ agentId: 'a2', action: 'read', result: 'allowed' });
    const a1Events = at.query({ agentId: 'a1' });
    assert.equal(a1Events.length, 2);
    const denials = at.query({ result: 'denied' });
    assert.equal(denials.length, 1);
  });

  it('generates agent reports', () => {
    const at = new AuditTrail();
    at.record({ agentId: 'a1', action: 'read', result: 'allowed', riskLevel: 'low', duration: 50 });
    at.record({ agentId: 'a1', action: 'write', result: 'denied', riskLevel: 'high', duration: 10 });
    at.record({ agentId: 'a1', action: 'read', result: 'allowed', riskLevel: 'low', duration: 30 });
    const report = at.agentReport('a1');
    assert.equal(report.totalActions, 3);
    assert.equal(report.allowed, 2);
    assert.equal(report.denied, 1);
    assert.equal(report.denyRate, 33);
    assert.equal(report.avgDurationMs, 30);
  });

  it('replays sessions', () => {
    const at = new AuditTrail();
    at.record({ sessionId: 's1', agentId: 'a1', action: 'read', result: 'allowed' });
    at.record({ sessionId: 's1', agentId: 'a1', action: 'write', result: 'allowed' });
    at.record({ sessionId: 's2', agentId: 'a2', action: 'read', result: 'allowed' });
    const replay = at.sessionReplay('s1');
    assert.equal(replay.length, 2);
  });

  it('generates security reports', () => {
    const at = new AuditTrail();
    at.record({ agentId: 'a1', action: 'read', result: 'allowed', riskLevel: 'low' });
    at.record({ agentId: 'a1', action: 'deploy', result: 'denied', riskLevel: 'critical' });
    at.record({ agentId: 'a2', action: 'write', result: 'denied', riskLevel: 'high' });
    const report = at.securityReport(Date.now() - 60000);
    assert.equal(report.totalDenials, 2);
    assert.equal(report.highRiskActions, 2);
    assert.equal(report.uniqueAgents, 2);
  });
});

// ─── Full Executor Integration ───

describe('Agent Executor Integration', () => {
  function createExecutor() {
    const exec = new AgentExecutor({
      sandbox: { maxFileOps: 20 },
      approvals: {
        autoApproveRules: [{ name: 'auto_low', maxRisk: 'low' }],
        escalationChain: ['lead', 'manager'],
      },
    });

    exec.actions.register({
      id: 'db:query', name: 'Query', category: 'db', riskLevel: 'low',
      schema: { required: ['query'], properties: { query: { type: 'string' } } },
      handler: async (params) => ({ rows: [], query: params.query }),
    });

    exec.actions.register({
      id: 'db:write', name: 'Write', category: 'db', riskLevel: 'medium',
      schema: { required: ['table'], properties: { table: { type: 'string' } } },
      handler: async (params) => ({ inserted: 1 }),
    });

    exec.actions.register({
      id: 'deploy', name: 'Deploy', category: 'ops', riskLevel: 'critical',
      requiresApproval: true,
      schema: { required: ['service'], properties: { service: { type: 'string' } } },
      handler: async (params) => ({ deployed: true }),
    });

    exec.policy.addPolicy({ id: 'allow-reads', effect: 'allow', principals: ['*'], actions: ['db:query'], resources: ['*'] });
    exec.policy.addPolicy({
      id: 'allow-writes', effect: 'allow', principals: ['*'], actions: ['db:write'], resources: ['*'],
      conditions: { trustLevel: { in: ['elevated', 'admin'] } },
    });
    exec.policy.addPolicy({
      id: 'allow-deploy', effect: 'allow', principals: ['*'], actions: ['deploy'], resources: ['*'],
      conditions: { trustLevel: { equals: 'admin' } },
    });

    exec.registerAgent({ id: 'reader', name: 'Reader', trustLevel: 'basic', permissions: { canReadFiles: true } });
    exec.registerAgent({ id: 'writer', name: 'Writer', trustLevel: 'elevated', permissions: { canReadFiles: true, canWriteFiles: true } });
    exec.registerAgent({ id: 'admin', name: 'Admin', trustLevel: 'admin', permissions: { canReadFiles: true, canWriteFiles: true, canNetwork: true } });

    return exec;
  }

  it('allows read for basic agent', async () => {
    const exec = createExecutor();
    const session = exec.startSession('reader');
    const result = await exec.execute(session.id, 'db:query', { query: 'SELECT 1' });
    assert.equal(result.success, true);
    assert.ok(result.result.query);
    exec.endSession(session.id);
  });

  it('denies write for basic agent', async () => {
    const exec = createExecutor();
    const session = exec.startSession('reader');
    const result = await exec.execute(session.id, 'db:write', { table: 'users' });
    assert.equal(result.error, 'POLICY_DENIED');
    exec.endSession(session.id);
  });

  it('allows write for elevated agent', async () => {
    const exec = createExecutor();
    const session = exec.startSession('writer');
    const result = await exec.execute(session.id, 'db:write', { table: 'logs' });
    assert.equal(result.success, true);
    exec.endSession(session.id);
  });

  it('requires approval for critical actions', async () => {
    const exec = createExecutor();
    const session = exec.startSession('admin');
    const result = await exec.execute(session.id, 'deploy', { service: 'api' });
    assert.equal(result.error, 'APPROVAL_REQUIRED');
    assert.ok(result.approvalId);
    exec.endSession(session.id);
  });

  it('rejects invalid params', async () => {
    const exec = createExecutor();
    const session = exec.startSession('reader');
    const result = await exec.execute(session.id, 'db:query', {});
    assert.equal(result.error, 'VALIDATION_FAILED');
    assert.ok(result.details.some(d => d.includes('query')));
    exec.endSession(session.id);
  });

  it('rejects unknown actions', async () => {
    const exec = createExecutor();
    const session = exec.startSession('reader');
    const result = await exec.execute(session.id, 'nonexistent', {});
    assert.equal(result.error, 'UNKNOWN_ACTION');
    exec.endSession(session.id);
  });

  it('tracks everything in audit trail', async () => {
    const exec = createExecutor();
    const session = exec.startSession('reader');
    await exec.execute(session.id, 'db:query', { query: 'SELECT 1' });
    await exec.execute(session.id, 'db:write', { table: 'users' });
    const report = exec.audit.agentReport('reader');
    assert.equal(report.totalActions, 2);
    assert.equal(report.allowed, 1);
    assert.equal(report.denied, 1);
    exec.endSession(session.id);
  });

  it('produces a dashboard', async () => {
    const exec = createExecutor();
    const session = exec.startSession('reader');
    await exec.execute(session.id, 'db:query', { query: 'test' });
    const dash = exec.dashboard();
    assert.equal(dash.activeSessions, 1);
    assert.equal(dash.actions.totalActions, 3);
    assert.ok(dash.security);
    exec.endSession(session.id);
  });
});
