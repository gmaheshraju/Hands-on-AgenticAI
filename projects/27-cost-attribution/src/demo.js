import { CostAttributionEngine } from './engine.js';

function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       Cost Attribution Engine — Production Demo         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const engine = new CostAttributionEngine();

  engine.setBudget('engineering', 5.00);
  engine.setBudget('marketing', 1.00);

  engine.roi.setOutcomeValue('code_review', () => 5.00);
  engine.roi.setOutcomeValue('ticket_triage', () => 2.00);
  engine.roi.setOutcomeValue('content_gen', () => 1.50);

  // Simulate diverse agent activity
  const scenarios = [
    { agentId: 'pr-reviewer', teamId: 'engineering', taskType: 'code_review', model: 'claude-sonnet-4', inputTokens: 2000, outputTokens: 800, outcome: 'success', latencyMs: 3200 },
    { agentId: 'pr-reviewer', teamId: 'engineering', taskType: 'code_review', model: 'claude-sonnet-4', inputTokens: 1500, outputTokens: 600, outcome: 'success', latencyMs: 2800 },
    { agentId: 'pr-reviewer', teamId: 'engineering', taskType: 'code_review', model: 'claude-opus-4', inputTokens: 300, outputTokens: 100, outcome: 'success', latencyMs: 5000 },
    { agentId: 'ticket-bot', teamId: 'engineering', taskType: 'ticket_triage', model: 'claude-haiku-3.5', inputTokens: 800, outputTokens: 200, outcome: 'success', latencyMs: 400 },
    { agentId: 'ticket-bot', teamId: 'engineering', taskType: 'ticket_triage', model: 'claude-haiku-3.5', inputTokens: 600, outputTokens: 150, outcome: 'success', latencyMs: 350 },
    { agentId: 'ticket-bot', teamId: 'engineering', taskType: 'ticket_triage', model: 'claude-haiku-3.5', inputTokens: 900, outputTokens: 250, outcome: 'failure', latencyMs: 600 },
    { agentId: 'ticket-bot', teamId: 'engineering', taskType: 'ticket_triage', model: 'claude-haiku-3.5', inputTokens: 700, outputTokens: 180, outcome: 'failure', latencyMs: 500 },
    { agentId: 'content-writer', teamId: 'marketing', taskType: 'content_gen', model: 'gpt-4o', inputTokens: 400, outputTokens: 150, outcome: 'success', latencyMs: 1200 },
    { agentId: 'content-writer', teamId: 'marketing', taskType: 'content_gen', model: 'gpt-4o', inputTokens: 350, outputTokens: 120, outcome: 'success', latencyMs: 1100 },
    { agentId: 'content-writer', teamId: 'marketing', taskType: 'content_gen', model: 'claude-opus-4', inputTokens: 200, outputTokens: 80, outcome: 'success', latencyMs: 4500 },
    { agentId: 'data-analyst', teamId: 'engineering', taskType: 'data_query', model: 'gemini-2.5-flash', inputTokens: 1000, outputTokens: 500, outcome: 'success', latencyMs: 200 },
    { agentId: 'data-analyst', teamId: 'engineering', taskType: 'data_query', model: 'gemini-2.5-flash', inputTokens: 1000, outputTokens: 500, outcome: 'success', latencyMs: 200, cached: true },
  ];

  for (const s of scenarios) engine.record(s);

  // --- Scenario 1: Attribution by agent ---
  console.log('━━━ Scenario 1: Cost Attribution by Agent ━━━\n');
  const byAgent = engine.attribution.byAgent();
  for (const a of byAgent) {
    console.log(`  ${a.agentId}: $${a.totalCost} (${a.requests} reqs, ${a.successRate}% success, avg $${a.avgCostPerRequest}/req)`);
  }

  // --- Scenario 2: Attribution by team ---
  console.log('\n━━━ Scenario 2: Cost Attribution by Team ━━━\n');
  const byTeam = engine.attribution.byTeam();
  for (const t of byTeam) {
    console.log(`  ${t.teamId}: $${t.totalCost} (${t.requests} reqs, ${t.uniqueAgents} agents)`);
    for (const [model, data] of Object.entries(t.modelBreakdown)) {
      console.log(`    ${model}: $${data.cost} (${data.requests} reqs)`);
    }
  }

  // --- Scenario 3: Attribution by task type ---
  console.log('\n━━━ Scenario 3: Cost by Task Type ━━━\n');
  const byType = engine.attribution.byTaskType();
  for (const t of byType) {
    console.log(`  ${t.taskType}: $${t.totalCost} (${t.successRate}% success, cost/success: ${t.costPerSuccess ? '$' + t.costPerSuccess : 'N/A'})`);
  }

  // --- Scenario 4: Waste detection ---
  console.log('\n━━━ Scenario 4: Waste Detection ━━━\n');
  const waste = engine.waste.analyze();
  if (waste.length === 0) {
    console.log('  No waste patterns detected!');
  }
  for (const w of waste) {
    console.log(`  [${w.pattern}] ${w.description}`);
    console.log(`    Potential savings: $${w.savingsUsd}`);
    console.log(`    Recommendation: ${w.recommendation}`);
  }

  // --- Scenario 5: ROI per agent ---
  console.log('\n━━━ Scenario 5: ROI per Agent ━━━\n');
  for (const agentId of ['pr-reviewer', 'ticket-bot', 'content-writer', 'data-analyst']) {
    const roi = engine.roi.agentROI(agentId);
    if (roi) {
      console.log(`  ${roi.agentId}: cost=$${roi.totalCost}, value=$${roi.totalValue}, ROI=${roi.roi}x, value/$ =$${roi.valuePerDollar}`);
    }
  }

  // --- Scenario 6: Executive summary ---
  console.log('\n━━━ Scenario 6: Executive Summary ━━━\n');
  const summary = engine.executiveSummary();
  console.log(`  Total cost: $${summary.totalCost}`);
  console.log(`  Total requests: ${summary.totalRequests}`);
  console.log(`  Success rate: ${summary.successRate}%`);
  console.log(`  Cost per success: $${summary.costPerSuccess}`);
  console.log(`  Waste patterns: ${summary.wastePatterns}`);
  console.log(`  Potential savings: $${summary.potentialSavings} (${summary.savingsPercent}% of spend)`);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                    Demo Complete                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
}

main();
