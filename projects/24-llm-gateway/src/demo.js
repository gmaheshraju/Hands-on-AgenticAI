import { LLMGateway } from './gateway.js';

function mockProvider(name, failAfter = Infinity) {
  let calls = 0;
  return async (req) => {
    calls++;
    if (calls > failAfter) throw Object.assign(new Error(`${name} unavailable`), { code: 'SERVICE_UNAVAILABLE' });
    await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
    const inputTokens = Math.ceil((req.messages?.map(m => m.content).join('').length || 100) / 4);
    const outputTokens = Math.floor(inputTokens * 0.6);
    return { content: `[${name}:${req.model}] Response to your query.`, usage: { inputTokens, outputTokens } };
  };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║              LLM Gateway — Production Demo             ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const gateway = new LLMGateway({
    rateLimit: { tokensPerMinute: 50000, requestsPerMinute: 30 },
    circuitBreaker: { failureThreshold: 2, recoveryTimeMs: 5000 },
  });

  gateway.registerProvider('anthropic', mockProvider('Anthropic'));
  gateway.registerProvider('openai', mockProvider('OpenAI'));
  gateway.registerProvider('google', mockProvider('Google'));

  gateway.costTracker.setBudget('engineering', 10.00);
  gateway.costTracker.setBudget('marketing', 2.00);
  gateway.router.setTeamModel('marketing', 'fast');

  // --- Scenario 1: Complexity-based routing ---
  console.log('━━━ Scenario 1: Complexity-Based Routing ━━━\n');

  const simpleReq = await gateway.request({
    teamId: 'engineering',
    messages: [{ role: 'user', content: 'Summarize this in one line.' }],
  });
  console.log(`  Simple query → ${simpleReq.routingReason} → cost: $${simpleReq.costUsd?.toFixed(6)}`);

  const complexReq = await gateway.request({
    teamId: 'engineering',
    messages: [{ role: 'user', content: 'Analyze and compare the security architecture of our authentication system. Evaluate the OAuth2 flow against the new OIDC provider. Design a migration plan that maintains backward compatibility while improving the security posture. Consider the implications for our microservice mesh and the distributed session management.' }],
    tools: [{ name: 'readCode' }, { name: 'searchDocs' }, { name: 'runTests' }, { name: 'deployPreview' }, { name: 'securityScan' }, { name: 'analyzeMetrics' }],
  });
  console.log(`  Complex query → ${complexReq.routingReason} → cost: $${complexReq.costUsd?.toFixed(6)}`);

  // --- Scenario 2: PII Redaction ---
  console.log('\n━━━ Scenario 2: PII Redaction ━━━\n');

  const piiReq = await gateway.request({
    teamId: 'engineering',
    messages: [{ role: 'user', content: 'Send a password reset email to john.doe@company.com. His SSN is 123-45-6789 and phone is +91 98765 43210. AWS key: AKIAIOSFODNN7EXAMPLE.' }],
  });
  console.log(`  PII types redacted: ${piiReq.piiRedacted}`);
  console.log(`  Request still processed: ${piiReq.error ? 'NO' : 'YES'}`);

  // --- Scenario 3: Rate Limiting ---
  console.log('\n━━━ Scenario 3: Rate Limiting ━━━\n');

  const results = [];
  for (let i = 0; i < 35; i++) {
    const r = await gateway.request({
      teamId: 'marketing',
      messages: [{ role: 'user', content: `Query ${i + 1}` }],
    });
    results.push(r);
  }
  const limited = results.filter(r => r.error === 'RATE_LIMITED');
  console.log(`  35 requests from marketing team:`);
  console.log(`  Succeeded: ${results.length - limited.length}`);
  console.log(`  Rate limited: ${limited.length}`);
  if (limited.length > 0) console.log(`  Retry after: ${limited[0].retryAfterMs}ms`);

  // --- Scenario 4: Circuit Breaker + Failover ---
  console.log('\n━━━ Scenario 4: Circuit Breaker + Failover ━━━\n');

  const gw2 = new LLMGateway({
    circuitBreaker: { failureThreshold: 2, recoveryTimeMs: 3000 },
  });
  gw2.registerProvider('anthropic', mockProvider('Anthropic', 2));
  gw2.registerProvider('openai', mockProvider('OpenAI'));
  gw2.registerProvider('google', mockProvider('Google'));

  for (let i = 0; i < 5; i++) {
    const r = await gw2.request({
      teamId: 'engineering',
      model: 'claude-sonnet-4',
      messages: [{ role: 'user', content: `Request ${i + 1} — testing failover` }],
    });
    const provider = r.provider || 'N/A';
    const model = r.model || 'N/A';
    console.log(`  Request ${i + 1}: ${provider}/${model} (${r.routingReason || r.error})`);
  }

  const cbStatus = gw2.circuitBreaker.allStatus();
  console.log(`\n  Circuit breaker states:`);
  for (const [p, s] of Object.entries(cbStatus)) {
    console.log(`    ${p}: ${s.state} (${s.consecutiveFailures} failures, ${s.failureRate}% rate)`);
  }

  // --- Scenario 5: Cost Dashboard ---
  console.log('\n━━━ Scenario 5: Cost Dashboard ━━━\n');

  const dash = gateway.dashboard();
  for (const [team, report] of Object.entries(dash.costs)) {
    console.log(`  ${team}:`);
    console.log(`    Requests: ${report.requestCount}`);
    console.log(`    Total cost: $${report.totalCostUsd}`);
    console.log(`    Avg latency: ${report.avgLatencyMs}ms`);
    if (report.costByModel) {
      for (const [model, stats] of Object.entries(report.costByModel)) {
        console.log(`    ${model}: ${stats.requests} reqs, $${stats.costUsd.toFixed(6)}`);
      }
    }
  }

  if (dash.alerts.length > 0) {
    console.log(`\n  Budget alerts:`);
    for (const a of dash.alerts) {
      console.log(`    ${a.teamId}: ${Math.round(a.ratio * 100)}% of $${a.budget} budget used`);
    }
  }

  // --- Scenario 6: Compliance Report ---
  console.log('\n━━━ Scenario 6: Compliance Audit ━━━\n');

  const report = gateway.auditLog.complianceReport('engineering', Date.now() - 3600000);
  console.log(`  Total requests: ${report.totalRequests}`);
  console.log(`  Success rate: ${report.successRate}%`);
  console.log(`  PII detection events: ${report.piiDetectionEvents}`);
  if (Object.keys(report.piiByType).length > 0) {
    console.log(`  PII types found: ${JSON.stringify(report.piiByType)}`);
  }
  console.log(`  Models used: ${report.modelsUsed.join(', ')}`);
  console.log(`  Total cost: $${report.totalCostUsd}`);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                    Demo Complete                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
}

main().catch(console.error);
