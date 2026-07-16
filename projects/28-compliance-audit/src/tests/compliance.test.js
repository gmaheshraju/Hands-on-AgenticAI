import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { EventLogger, deepRedact, computeHash } from '../eventLogger.js';
import { DecisionReplay } from '../decisionReplay.js';
import { ComplianceFramework } from '../complianceFramework.js';
import { ComplianceReporter } from '../reporter.js';
import { AuditHarness } from '../harness.js';

// ── EventLogger Tests ────────────────────────────────────────────────

describe('EventLogger', () => {
  let logger;

  beforeEach(() => {
    logger = new EventLogger();
  });

  it('should create an entry with all required fields', () => {
    const entry = logger.log({
      agentId: 'agent-1',
      action: 'test_action',
      input: { key: 'value' },
      output: { result: 'ok' },
      decision: 'APPROVE',
      rationale: 'Test rationale',
    });

    assert.ok(entry.id);
    assert.ok(entry.timestamp);
    assert.equal(entry.agentId, 'agent-1');
    assert.equal(entry.action, 'test_action');
    assert.equal(entry.decision, 'APPROVE');
    assert.equal(entry.rationale, 'Test rationale');
    assert.ok(entry.hash);
    assert.ok(entry.previousHash);
  });

  it('should require agentId', () => {
    assert.throws(() => logger.log({ action: 'test' }), /agentId is required/);
  });

  it('should require action', () => {
    assert.throws(() => logger.log({ agentId: 'a' }), /action is required/);
  });

  it('should build a valid hash chain', () => {
    logger.log({ agentId: 'a', action: 'x', input: { a: 1 } });
    logger.log({ agentId: 'a', action: 'y', input: { b: 2 } });
    logger.log({ agentId: 'a', action: 'z', input: { c: 3 } });

    const result = logger.verifyChain();
    assert.equal(result.valid, true);
    assert.equal(result.brokenAt, -1);
  });

  it('should use genesis hash for the first entry', () => {
    const entry = logger.log({ agentId: 'a', action: 'first' });
    assert.equal(entry.previousHash, '0'.repeat(64));
  });

  it('should link each entry to the previous hash', () => {
    const e1 = logger.log({ agentId: 'a', action: 'one' });
    const e2 = logger.log({ agentId: 'a', action: 'two' });
    assert.equal(e2.previousHash, e1.hash);
  });

  it('should redact sensitive fields in input', () => {
    const entry = logger.log({
      agentId: 'a',
      action: 'test',
      input: { username: 'john', password: 'secret123', token: 'abc' },
    });
    assert.equal(entry.input.username, 'john');
    assert.equal(entry.input.password, '[REDACTED]');
    assert.equal(entry.input.token, '[REDACTED]');
  });

  it('should redact sensitive fields in output', () => {
    const entry = logger.log({
      agentId: 'a',
      action: 'test',
      output: { data: 'ok', apiKey: 'key-123', secret: 'shh' },
    });
    assert.equal(entry.output.data, 'ok');
    assert.equal(entry.output.apiKey, '[REDACTED]');
    assert.equal(entry.output.secret, '[REDACTED]');
  });

  it('should query by agent', () => {
    logger.log({ agentId: 'alpha', action: 'x' });
    logger.log({ agentId: 'beta', action: 'y' });
    logger.log({ agentId: 'alpha', action: 'z' });

    const results = logger.queryByAgent('alpha');
    assert.equal(results.length, 2);
    assert.ok(results.every(e => e.agentId === 'alpha'));
  });

  it('should query by action', () => {
    logger.log({ agentId: 'a', action: 'read' });
    logger.log({ agentId: 'b', action: 'write' });
    logger.log({ agentId: 'c', action: 'read' });

    assert.equal(logger.queryByAction('read').length, 2);
    assert.equal(logger.queryByAction('write').length, 1);
  });

  it('should query by time range', () => {
    const e1 = logger.log({ agentId: 'a', action: 'x' });
    // All entries are created nearly simultaneously in tests,
    // so a range encompassing "now" should return all
    const start = new Date(Date.now() - 1000).toISOString();
    const end = new Date(Date.now() + 1000).toISOString();
    const results = logger.queryByTimeRange(start, end);
    assert.ok(results.length >= 1);
  });

  it('should export valid data', () => {
    logger.log({ agentId: 'a', action: 'test' });
    const exported = logger.export();
    assert.ok(exported.exportedAt);
    assert.equal(exported.entryCount, 1);
    assert.equal(exported.chainValid, true);
    assert.equal(exported.entries.length, 1);
  });

  it('should freeze entries (immutable)', () => {
    const entry = logger.log({ agentId: 'a', action: 'test' });
    assert.throws(() => { entry.agentId = 'tampered'; }, TypeError);
  });
});

describe('deepRedact', () => {
  it('should redact nested sensitive fields', () => {
    const result = deepRedact({
      user: { name: 'John', credentials: { password: 'secret', apiKey: 'key' } },
    });
    assert.equal(result.user.credentials.password, '[REDACTED]');
    assert.equal(result.user.credentials.apiKey, '[REDACTED]');
    assert.equal(result.user.name, 'John');
  });

  it('should handle arrays', () => {
    const result = deepRedact([{ password: 'x' }, { name: 'ok' }]);
    assert.equal(result[0].password, '[REDACTED]');
    assert.equal(result[1].name, 'ok');
  });

  it('should handle null and undefined', () => {
    assert.equal(deepRedact(null), null);
    assert.equal(deepRedact(undefined), undefined);
  });
});

// ── DecisionReplay Tests ─────────────────────────────────────────────

describe('DecisionReplay', () => {
  let logger;
  let replay;

  beforeEach(() => {
    logger = new EventLogger();
    replay = new DecisionReplay(logger);
  });

  it('should require a logger', () => {
    assert.throws(() => new DecisionReplay(), /EventLogger instance is required/);
  });

  it('should reconstruct a decision chain', () => {
    const session = 'sess-1';
    logger.log({ agentId: 'agent-1', action: 'context_load', input: { data: 'x' }, metadata: { sessionId: session } });
    logger.log({ agentId: 'agent-1', action: 'tool_call', input: { tool: 'calc' }, output: { result: 42 }, metadata: { sessionId: session } });
    const decision = logger.log({
      agentId: 'agent-1', action: 'decide',
      decision: 'YES', rationale: 'Score is high',
      metadata: { sessionId: session },
    });

    const result = replay.reconstruct(decision.id);
    assert.equal(result.found, true);
    assert.equal(result.chain.length, 3);
    assert.equal(result.summary.totalEvents, 3);
  });

  it('should return not found for unknown ID', () => {
    const result = replay.reconstruct('nonexistent');
    assert.equal(result.found, false);
  });

  it('should replay and verify deterministic decision', () => {
    const entry = logger.log({
      agentId: 'a', action: 'decide',
      decision: 'ALLOW', rationale: 'Policy permits',
    });

    const result = replay.replay(entry.id, () => ({
      decision: 'ALLOW',
      rationale: 'Policy permits',
    }));

    assert.equal(result.match, true);
    assert.equal(result.drift, null);
  });

  it('should detect decision drift', () => {
    const entry = logger.log({
      agentId: 'a', action: 'decide',
      decision: 'ALLOW', rationale: 'Policy permits',
    });

    const result = replay.replay(entry.id, () => ({
      decision: 'DENY',
      rationale: 'Policy changed',
    }));

    assert.equal(result.match, false);
    assert.equal(result.drift.decisionChanged, true);
    assert.equal(result.drift.rationaleChanged, true);
  });

  it('should handle replay function errors', () => {
    const entry = logger.log({ agentId: 'a', action: 'decide', decision: 'OK' });
    const result = replay.replay(entry.id, () => { throw new Error('boom'); });
    assert.equal(result.match, false);
    assert.ok(result.error.includes('boom'));
  });

  it('should produce an audit summary', () => {
    const entry = logger.log({
      agentId: 'a', action: 'decide',
      decision: 'APPROVE', rationale: 'Good score',
    });

    const summary = replay.auditSummary(entry.id);
    assert.ok(summary);
    assert.equal(summary.decision, 'APPROVE');
    assert.ok(summary.inputHash);
    assert.equal(summary.chainIntegrity, true);
  });
});

// ── ComplianceFramework Tests ────────────────────────────────────────

describe('ComplianceFramework', () => {
  let framework;
  let logger;

  beforeEach(() => {
    framework = new ComplianceFramework();
    logger = new EventLogger();
  });

  it('should have built-in rules for all 3 regulations', () => {
    const regs = framework.getRegulations();
    assert.ok(regs.includes('EU AI Act'));
    assert.ok(regs.includes('SOC2'));
    assert.ok(regs.includes('GDPR'));
  });

  it('should filter rules by regulation', () => {
    const euRules = framework.getRules('EU AI Act');
    assert.ok(euRules.length > 0);
    assert.ok(euRules.every(r => r.regulation === 'EU AI Act'));
  });

  it('should add custom rules', () => {
    framework.addRule({
      id: 'custom-001',
      regulation: 'Internal',
      name: 'Custom Rule',
      check: () => ({ pass: true, total: 0, failing: 0, evidence: [] }),
    });
    const rules = framework.getRules('Internal');
    assert.equal(rules.length, 1);
  });

  it('should reject rules without required fields', () => {
    assert.throws(() => framework.addRule({ name: 'bad' }), /must have id/);
  });

  it('should detect transparency violations', () => {
    // Decision without rationale
    logger.log({ agentId: 'a', action: 'decide', decision: 'YES' });
    const result = framework.check(logger, 'EU AI Act');
    const transparencyRule = result.results.find(r => r.ruleId === 'eu-ai-transparency-001');
    assert.equal(transparencyRule.pass, false);
  });

  it('should pass when all decisions have rationale', () => {
    logger.log({ agentId: 'a', action: 'decide', decision: 'YES', rationale: 'Good reason' });
    const result = framework.check(logger, 'EU AI Act');
    const transparencyRule = result.results.find(r => r.ruleId === 'eu-ai-transparency-001');
    assert.equal(transparencyRule.pass, true);
  });

  it('should detect protected attribute violations', () => {
    logger.log({
      agentId: 'a', action: 'decide', decision: 'NO', rationale: 'score',
      input: { name: 'John', race: 'white', gender: 'male' },
    });
    const result = framework.check(logger, 'EU AI Act');
    const rule = result.results.find(r => r.ruleId === 'eu-ai-nondiscrimination-001');
    assert.equal(rule.pass, false);
  });

  it('should compute risk assessment', () => {
    // Trigger a critical failure
    logger.log({ agentId: 'a', action: 'decide', decision: 'YES' }); // no rationale
    const risk = framework.riskAssessment(logger);
    assert.ok(['low', 'medium', 'high', 'critical'].includes(risk.overallRisk));
    assert.ok(risk.totalFailures > 0);
  });

  it('should remove rules', () => {
    const before = framework.getRules().length;
    framework.removeRule('eu-ai-transparency-001');
    assert.equal(framework.getRules().length, before - 1);
  });
});

// ── ComplianceReporter Tests ─────────────────────────────────────────

describe('ComplianceReporter', () => {
  let reporter;

  beforeEach(() => {
    reporter = new ComplianceReporter();
  });

  it('should generate a markdown report', () => {
    const report = reporter.generate({
      complianceResults: [
        { regulation: 'EU AI Act', ruleId: 'test-1', name: 'Test Rule', category: 'test', severity: 'high', pass: true, failing: 0, total: 5, evidence: [] },
        { regulation: 'SOC2', ruleId: 'test-2', name: 'Failing Rule', category: 'audit', severity: 'critical', pass: false, failing: 2, total: 5, evidence: [{ id: 'x' }], description: 'Must pass', remediation: 'Fix it' },
      ],
      riskAssessment: {
        overallRisk: 'high',
        totalFailures: 1,
        criticalFindings: [{ ruleId: 'test-2', name: 'Failing Rule', remediation: 'Fix it' }],
        failedBySeverity: { critical: 1, high: 0, medium: 0, low: 0 },
      },
      auditMeta: { auditor: 'Test', scope: 'Unit Test' },
    });

    assert.ok(report.includes('# Compliance Audit Report'));
    assert.ok(report.includes('Overall Risk Level'));
    assert.ok(report.includes('EU AI Act'));
    assert.ok(report.includes('SOC2'));
    assert.ok(report.includes('Remediation Roadmap'));
  });

  it('should generate a summary report', () => {
    const summary = reporter.generateSummary([
      { regulation: 'GDPR', pass: true },
      { regulation: 'GDPR', pass: false },
      { regulation: 'SOC2', pass: true },
    ]);

    assert.ok(summary.includes('# Compliance Summary'));
    assert.ok(summary.includes('GDPR'));
    assert.ok(summary.includes('SOC2'));
  });
});

// ── AuditHarness Integration Tests ───────────────────────────────────

describe('AuditHarness', () => {
  let harness;

  beforeEach(() => {
    harness = new AuditHarness({ retentionDays: 365 });
  });

  it('should log events through harness', () => {
    const entry = harness.logEvent({ agentId: 'a', action: 'test' });
    assert.ok(entry.id);
    assert.equal(harness.logger.length, 1);
  });

  it('should replay decisions through harness', () => {
    const entry = harness.logEvent({
      agentId: 'a', action: 'decide',
      decision: 'GO', rationale: 'All clear',
    });

    const result = harness.replayDecision(entry.id);
    assert.equal(result.found, true);
  });

  it('should check compliance through harness', () => {
    harness.logEvent({ agentId: 'a', action: 'test', metadata: { purpose: 'testing' } });
    const result = harness.checkCompliance('SOC2');
    assert.ok(result.summary);
    assert.equal(result.regulation, 'SOC2');
  });

  it('should generate full report through harness', () => {
    harness.logEvent({ agentId: 'a', action: 'decide', decision: 'Y', rationale: 'OK', metadata: { purpose: 'test' } });
    const report = harness.generateReport({ auditor: 'test' });
    assert.ok(report.includes('# Compliance Audit Report'));
  });

  it('should produce a dashboard', () => {
    harness.logEvent({ agentId: 'agent-x', action: 'test', metadata: { purpose: 'test' } });
    const dash = harness.dashboard();
    assert.ok(dash.timestamp);
    assert.equal(dash.eventCount, 1);
    assert.equal(dash.chainIntegrity, true);
    assert.ok(dash.activeAgents.includes('agent-x'));
    assert.ok(dash.regulationScores);
  });

  it('should run full audit', () => {
    harness.logEvent({ agentId: 'a', action: 'test', metadata: { purpose: 'test' } });
    const audit = harness.fullAudit({ auditor: 'test' });
    assert.ok(audit.chainIntegrity.valid);
    assert.ok(audit.compliance);
    assert.ok(audit.riskAssessment);
    assert.ok(audit.report);
    assert.ok(audit.exportedLog);
  });

  it('should add custom rules through harness', () => {
    harness.addRule({
      id: 'custom-harness-001',
      regulation: 'Custom',
      name: 'Custom Test',
      check: () => ({ pass: true, total: 0, failing: 0, evidence: [] }),
    });

    const result = harness.checkCompliance('Custom');
    assert.equal(result.summary.totalRules, 1);
    assert.equal(result.summary.passed, 1);
  });

  it('should export audit data', () => {
    harness.logEvent({ agentId: 'a', action: 'x' });
    const exported = harness.exportAuditData();
    assert.equal(exported.entryCount, 1);
    assert.equal(exported.chainValid, true);
  });
});
