/**
 * Compliance Audit Harness — Demo Scenarios
 *
 * 5 scenarios demonstrating production-grade compliance patterns:
 * 1. Log agent decisions with tamper-evident chain
 * 2. Replay a decision to verify determinism
 * 3. Check EU AI Act compliance
 * 4. Generate SOC2 compliance report
 * 5. Full audit with dashboard
 */

import { AuditHarness } from './harness.js';

const SEP = '='.repeat(70);
const SUBSEP = '-'.repeat(50);

function heading(n, title) {
  console.log(`\n${SEP}`);
  console.log(`  SCENARIO ${n}: ${title}`);
  console.log(SEP);
}

// ── Scenario 1: Log Agent Decisions ──────────────────────────────────

function scenario1(harness) {
  heading(1, 'Log Agent Decisions with Tamper-Evident Chain');

  // Simulate a multi-step agent workflow
  const sessionId = 'session-001';

  const e1 = harness.logEvent({
    agentId: 'loan-assessment-agent',
    action: 'context_load',
    input: { applicantId: 'APP-7821', requestedAmount: 50000 },
    output: { creditScore: 742, income: 95000, debtRatio: 0.28 },
    metadata: { sessionId, purpose: 'loan application assessment' },
  });
  console.log(`\n  [1] Context loaded: ${e1.id}`);

  const e2 = harness.logEvent({
    agentId: 'loan-assessment-agent',
    action: 'tool_call',
    input: { tool: 'risk_model_v3', params: { score: 742, amount: 50000 } },
    output: { riskScore: 0.15, recommendation: 'approve' },
    metadata: { sessionId, purpose: 'risk scoring' },
  });
  console.log(`  [2] Tool called: ${e2.id}`);

  const e3 = harness.logEvent({
    agentId: 'loan-assessment-agent',
    action: 'decision',
    input: { applicantId: 'APP-7821', password: 'should-be-redacted', token: 'abc123' },
    output: { approved: true, amount: 50000, rate: 5.2 },
    decision: 'APPROVE',
    rationale: 'Credit score 742 exceeds threshold (700). Debt ratio 0.28 < 0.35 limit. Risk score 0.15 is low.',
    metadata: { sessionId, purpose: 'final decision', riskLevel: 'medium' },
  });
  console.log(`  [3] Decision logged: ${e3.id}`);

  // Verify chain
  const chain = harness.logger.verifyChain();
  console.log(`\n  Chain integrity: ${chain.valid ? 'INTACT' : 'BROKEN'}`);
  console.log(`  Total entries: ${harness.logger.length}`);
  console.log(`  Hash of last entry: ${e3.hash.substring(0, 32)}...`);

  // Show redaction
  console.log(`\n  Redaction check:`);
  console.log(`    password field: ${e3.input.password}`);
  console.log(`    token field: ${e3.input.token}`);

  return e3;
}

// ── Scenario 2: Replay a Decision ────────────────────────────────────

function scenario2(harness, decisionEntry) {
  heading(2, 'Replay a Decision to Verify Determinism');

  // Reconstruct the decision chain
  const reconstruction = harness.replayDecision(decisionEntry.id);
  console.log(`\n  Decision found: ${reconstruction.found}`);
  console.log(`  Chain length: ${reconstruction.chain.length} events`);
  console.log(`  Context events: ${reconstruction.summary.contextEvents}`);
  console.log(`  Tool calls: ${reconstruction.summary.toolCalls}`);
  console.log(`  Decisions: ${reconstruction.summary.decisions}`);

  console.log(`\n  Timeline:`);
  for (const step of reconstruction.timeline) {
    console.log(`    ${step.timestamp} | ${step.action} | decision=${step.decision ?? 'n/a'}`);
  }

  // Deterministic replay
  const replayResult = harness.replayDecision(decisionEntry.id, (ctx) => {
    // Same logic that produced the original decision
    return {
      decision: 'APPROVE',
      rationale: 'Credit score 742 exceeds threshold (700). Debt ratio 0.28 < 0.35 limit. Risk score 0.15 is low.',
    };
  });

  console.log(`\n  Replay match: ${replayResult.match}`);
  console.log(`  Original decision: ${replayResult.original.decision}`);
  console.log(`  Replayed decision: ${replayResult.replayed.decision}`);

  // Now replay with a different decision to show drift detection
  const driftResult = harness.replayDecision(decisionEntry.id, (ctx) => {
    return {
      decision: 'DENY',
      rationale: 'Updated policy requires score > 750.',
    };
  });

  console.log(`\n  Drift detection test:`);
  console.log(`    Match: ${driftResult.match}`);
  console.log(`    Decision changed: ${driftResult.drift?.decisionChanged}`);
  console.log(`    Rationale changed: ${driftResult.drift?.rationaleChanged}`);
}

// ── Scenario 3: EU AI Act Compliance ─────────────────────────────────

function scenario3(harness) {
  heading(3, 'Check EU AI Act Compliance');

  // Add a high-risk decision WITHOUT human review to trigger a finding
  harness.logEvent({
    agentId: 'hiring-agent',
    action: 'decision',
    input: { candidateId: 'CAND-5512' },
    output: { recommendation: 'reject' },
    decision: 'REJECT',
    rationale: 'Candidate does not meet minimum qualification threshold.',
    metadata: { riskLevel: 'high', purpose: 'hiring decision' },
    // NOTE: no humanReviewed flag — this should trigger eu-ai-oversight-001
  });

  const result = harness.checkCompliance('EU AI Act');

  console.log(`\n  Regulation: ${result.regulation}`);
  console.log(`  Score: ${result.summary.score}%`);
  console.log(`  Passed: ${result.summary.passed}/${result.summary.totalRules}`);
  console.log(`  Failed: ${result.summary.failed}/${result.summary.totalRules}`);

  console.log(`\n  ${SUBSEP}`);
  console.log('  Rule Results:');
  for (const r of result.results) {
    const status = r.pass ? 'PASS' : 'FAIL';
    console.log(`    [${status}] ${r.name} (${r.category})`);
    if (!r.pass) {
      console.log(`           Remediation: ${r.remediation}`);
    }
  }
}

// ── Scenario 4: Generate SOC2 Report ─────────────────────────────────

function scenario4(harness) {
  heading(4, 'Generate SOC2 Compliance Report');

  // Add a config change with proper before/after
  harness.logEvent({
    agentId: 'system-admin',
    action: 'config_change',
    input: { setting: 'max_concurrent_agents' },
    output: { applied: true },
    metadata: {
      before: { max_concurrent_agents: 5 },
      after: { max_concurrent_agents: 10 },
      purpose: 'scaling for peak load',
    },
  });

  const soc2Results = harness.checkCompliance('SOC2');

  console.log(`\n  SOC2 Score: ${soc2Results.summary.score}%`);
  console.log(`  Rules checked: ${soc2Results.summary.totalRules}`);

  // Generate full report
  const report = harness.generateReport({
    auditor: 'Compliance Audit Harness (automated)',
    scope: 'AI Agent Operations',
    period: '2026-Q3',
  });

  // Show first 40 lines of the report
  const reportLines = report.split('\n');
  console.log(`\n  Report preview (${reportLines.length} total lines):`);
  console.log(`  ${SUBSEP}`);
  for (const line of reportLines.slice(0, 40)) {
    console.log(`  ${line}`);
  }
  console.log(`  ... (${reportLines.length - 40} more lines)`);
}

// ── Scenario 5: Full Audit with Dashboard ────────────────────────────

function scenario5(harness) {
  heading(5, 'Full Audit with Dashboard');

  // Add more diverse events
  harness.logEvent({
    agentId: 'data-pipeline-agent',
    action: 'data_retrieval',
    input: { source: 'customer_db', query: 'aggregated_stats' },
    output: { recordCount: 15420 },
    metadata: { purpose: 'analytics aggregation' },
  });

  harness.logEvent({
    agentId: 'compliance-bot',
    action: 'erasure_request',
    input: { userId: 'USER-9922' },
    output: { acknowledged: true },
    metadata: { purpose: 'GDPR erasure', status: 'completed' },
  });

  // Dashboard
  const dashboard = harness.dashboard();
  console.log('\n  Dashboard:');
  console.log(`    Events logged:      ${dashboard.eventCount}`);
  console.log(`    Chain integrity:    ${dashboard.chainIntegrity ? 'VALID' : 'BROKEN'}`);
  console.log(`    Active agents:      ${dashboard.activeAgents.join(', ')}`);
  console.log(`    Overall risk:       ${dashboard.overallRisk.toUpperCase()}`);
  console.log(`    Critical findings:  ${dashboard.criticalFindings}`);

  console.log(`\n  Regulation Scores:`);
  for (const [reg, score] of Object.entries(dashboard.regulationScores)) {
    const bar = '#'.repeat(Math.floor(score.score / 5)) + '.'.repeat(20 - Math.floor(score.score / 5));
    console.log(`    ${reg.padEnd(15)} [${bar}] ${score.score}% (${score.passed}/${score.total})`);
  }

  // Full audit export
  const audit = harness.fullAudit({ auditor: 'demo', scope: 'full system' });
  console.log(`\n  Full Audit:`);
  console.log(`    Chain valid:        ${audit.chainIntegrity.valid}`);
  console.log(`    Compliance score:   ${audit.compliance.summary.score}%`);
  console.log(`    Risk level:         ${audit.riskAssessment.overallRisk}`);
  console.log(`    Export entries:     ${audit.exportedLog.entryCount}`);
  console.log(`    Report length:      ${audit.report.length} chars`);

  // Summary report
  const summary = harness.generateSummary();
  console.log(`\n  Summary Report:`);
  console.log(`  ${SUBSEP}`);
  for (const line of summary.split('\n')) {
    console.log(`  ${line}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  console.log(SEP);
  console.log('  COMPLIANCE AUDIT HARNESS — DEMO');
  console.log(SEP);

  const harness = new AuditHarness({ retentionDays: 365 });

  const decisionEntry = scenario1(harness);
  scenario2(harness, decisionEntry);
  scenario3(harness);
  scenario4(harness);
  scenario5(harness);

  console.log(`\n${SEP}`);
  console.log('  ALL 5 SCENARIOS COMPLETE');
  console.log(SEP);
}

main();
