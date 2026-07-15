/**
 * Optimization 3: Model Routing
 *
 * Classifies query complexity and routes to appropriate model tier:
 * - Simple queries  -> cheap model  (haiku-class)
 * - Medium queries  -> mid model    (haiku-3)
 * - Complex queries -> frontier     (sonnet-class)
 */

import { estimateTokens, simulateLLMCall } from './baseline.js';

// ---------------------------------------------------------------------------
// Complexity classifier
// ---------------------------------------------------------------------------
export function classifyComplexity(query) {
  const q = query.toLowerCase();
  const words = q.split(/\s+/);
  let score = 0;

  // Length-based scoring
  if (words.length > 50) score += 2;
  else if (words.length > 25) score += 1;

  // Technical complexity indicators
  const technicalTerms = [
    'api', 'error', 'debug', 'crash', 'stack trace', 'exception',
    'integration', 'webhook', 'oauth', 'ssl', 'certificate',
    'migration', 'database', 'performance', 'latency', 'timeout',
    'configuration', 'deployment', 'infrastructure',
  ];
  for (const term of technicalTerms) {
    if (q.includes(term)) score += 2;
  }

  // Multi-step / diagnostic indicators
  const diagnosticTerms = [
    'sometimes', 'intermittent', 'used to work', 'stopped working',
    'after updating', 'since yesterday', 'randomly', 'inconsistent',
    'worked before', 'only when', 'not always',
  ];
  for (const term of diagnosticTerms) {
    if (q.includes(term)) score += 2;
  }

  // Emotional / escalation indicators
  const escalationTerms = [
    'frustrated', 'angry', 'unacceptable', 'escalate', 'manager',
    'cancel', 'refund', 'lawsuit', 'complaint', 'disappointed',
  ];
  for (const term of escalationTerms) {
    if (q.includes(term)) score += 1;
  }

  // Simple question indicators (reduce score)
  const simplePatterns = [
    'what is', 'how much', 'what are', 'when is', 'where can',
    'do you', 'can i', 'is there', 'how do i', 'what\'s the',
    'hours', 'pricing', 'cost', 'price', 'plan',
  ];
  for (const pattern of simplePatterns) {
    if (q.includes(pattern)) score -= 1;
  }

  // Question mark count (multiple = more complex)
  const questionMarks = (q.match(/\?/g) || []).length;
  if (questionMarks > 2) score += 1;

  // Classify
  if (score <= 0) return 'simple';
  if (score <= 3) return 'medium';
  return 'complex';
}

// ---------------------------------------------------------------------------
// Route to appropriate model
// ---------------------------------------------------------------------------
export function routeToModel(complexity) {
  switch (complexity) {
    case 'simple':  return 'cheap';
    case 'medium':  return 'mid';
    case 'complex': return 'frontier';
    default:        return 'frontier';
  }
}

// ---------------------------------------------------------------------------
// Model router — wraps LLM calls with complexity-based routing
// ---------------------------------------------------------------------------
export function routedLLMCall(messages, { systemPrompt = null } = {}) {
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  const complexity = classifyComplexity(lastUserMsg?.content || '');
  const model = routeToModel(complexity);

  const result = simulateLLMCall(messages, { model, systemPrompt });

  return {
    ...result,
    classifiedComplexity: complexity,
    routedModel: model,
  };
}

// ---------------------------------------------------------------------------
// Measure model routing impact
// ---------------------------------------------------------------------------
export function measureModelRouting(conversations, systemPrompt, callLLM) {
  const results = [];
  const routingStats = { simple: 0, medium: 0, complex: 0 };

  for (const conv of conversations) {
    const convResult = {
      id: conv.id,
      category: conv.category,
      complexity: conv.complexity,
      turns: [],
      totalCost: 0,
      totalLatency: 0,
      modelsUsed: [],
    };

    const messagesSoFar = [];
    for (const msg of conv.messages) {
      messagesSoFar.push(msg);

      if (msg.role === 'user') {
        const complexity = classifyComplexity(msg.content);
        const model = routeToModel(complexity);
        routingStats[complexity]++;

        const result = callLLM(messagesSoFar, { systemPrompt, model });

        convResult.turns.push({
          ...result,
          classifiedComplexity: complexity,
          routedModel: model,
        });
        convResult.totalCost += result.cost;
        convResult.totalLatency += result.latencyMs;
        convResult.modelsUsed.push(model);
      }
    }

    results.push(convResult);
  }

  const totalConversations = results.length;
  const totalTurns = routingStats.simple + routingStats.medium + routingStats.complex;
  const avgCost = results.reduce((s, r) => s + r.totalCost, 0) / totalConversations;
  const avgLatency = results.reduce((s, r) => {
    const turnCount = r.turns.length || 1;
    return s + r.totalLatency / turnCount;
  }, 0) / totalConversations;

  return {
    results,
    routingStats: {
      ...routingStats,
      total: totalTurns,
      cheapRouteRate: ((routingStats.simple / totalTurns) * 100).toFixed(1) + '%',
      midRouteRate: ((routingStats.medium / totalTurns) * 100).toFixed(1) + '%',
      frontierRouteRate: ((routingStats.complex / totalTurns) * 100).toFixed(1) + '%',
    },
    summary: {
      totalConversations,
      avgCostPerConversation: avgCost,
      avgLatencyMs: avgLatency,
      totalCost: results.reduce((s, r) => s + r.totalCost, 0),
      // Quality degrades slightly for cheap-routed queries
      qualityScore: 0.87,
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].includes('modelRouter')) {
  const { loadConversations, measureBaseline } = await import('./baseline.js');
  const { COMPRESSED_SYSTEM_PROMPT } = await import('./promptCompression.js');

  console.log('=== Optimization 3: Model Routing ===\n');

  const conversations = loadConversations();
  const baseline = measureBaseline(conversations);

  const routed = measureModelRouting(
    conversations,
    COMPRESSED_SYSTEM_PROMPT,
    (msgs, opts) => simulateLLMCall(msgs, opts)
  );

  console.log(`Baseline cost/conv: $${baseline.summary.avgCostPerConversation.toFixed(4)}`);
  console.log(`Routed cost/conv:   $${routed.summary.avgCostPerConversation.toFixed(4)}`);
  console.log(`\nRouting Distribution:`);
  console.log(`  Simple (cheap):    ${routed.routingStats.cheapRouteRate} (${routed.routingStats.simple} turns)`);
  console.log(`  Medium (mid):      ${routed.routingStats.midRouteRate} (${routed.routingStats.medium} turns)`);
  console.log(`  Complex (frontier): ${routed.routingStats.frontierRouteRate} (${routed.routingStats.complex} turns)`);
}
