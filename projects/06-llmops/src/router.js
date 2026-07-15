/**
 * Model Router with Fallback Chain
 *
 * Routes queries to the appropriate model tier based on complexity score.
 * If the primary model fails or returns a low-quality response, escalates
 * to the next tier in the fallback chain.
 *
 * In demo mode, uses mock model responses. In production, swap the model
 * functions for real API calls.
 */

import { classify } from './classifier.js';
import { logRequest } from './metrics.js';

// ── Model Configuration ─────────────────────────────────────────────────
// Pricing is per 1K tokens. Easily extensible — add a new model here,
// no code changes needed.

export const MODEL_CONFIG = {
  'haiku': {
    name: 'claude-3-haiku',
    tier: 'cheap',
    inputCostPer1k:  0.00025,
    outputCostPer1k: 0.00125,
    avgLatencyMs: 200,
    description: 'Fast, cheap — FAQ, status, simple formatting',
  },
  'gpt-4o-mini': {
    name: 'gpt-4o-mini',
    tier: 'cheap',
    inputCostPer1k:  0.00015,
    outputCostPer1k: 0.0006,
    avgLatencyMs: 250,
    description: 'OpenAI cheap tier — simple tasks',
  },
  'sonnet': {
    name: 'claude-3.5-sonnet',
    tier: 'medium',
    inputCostPer1k:  0.003,
    outputCostPer1k: 0.015,
    avgLatencyMs: 800,
    description: 'Balanced — summarization, code explanation, analysis',
  },
  'gpt-4o': {
    name: 'gpt-4o',
    tier: 'medium',
    inputCostPer1k:  0.0025,
    outputCostPer1k: 0.01,
    avgLatencyMs: 700,
    description: 'OpenAI mid-tier',
  },
  'opus': {
    name: 'claude-3-opus',
    tier: 'expensive',
    inputCostPer1k:  0.015,
    outputCostPer1k: 0.075,
    avgLatencyMs: 2000,
    description: 'Frontier — reasoning, multi-step, creative, legal',
  },
};

// ── Tier → model mapping (primary + fallback order) ─────────────────────

const ROUTING_TABLE = {
  simple:  ['haiku', 'sonnet', 'opus'],
  medium:  ['sonnet', 'opus'],
  complex: ['opus'],
};

// ── Mock model responses (demo mode) ────────────────────────────────────

const MOCK_RESPONSES = {
  simple: [
    'Your order #12345 is currently in transit and expected to arrive tomorrow.',
    'Our store hours are Monday-Friday 9am-6pm, Saturday 10am-4pm.',
    'You can reset your password by clicking "Forgot Password" on the login page.',
    'The current price is $29.99. Would you like to proceed with the purchase?',
    'Your refund has been processed and will appear in 3-5 business days.',
  ],
  medium: [
    'Here is a summary of the key points from the document:\n\n1. Revenue increased 15% year-over-year\n2. Customer acquisition cost decreased by $12\n3. Three new product lines launched in Q3\n4. Employee retention improved to 94%\n\nThe overall trend indicates strong growth with improving operational efficiency.',
    'The function works by iterating through the array and applying a reduce operation. The callback accumulates values based on the predicate function passed as the second argument. Time complexity is O(n) where n is the array length.',
    'Based on the requirements, I recommend the following tech stack:\n- Frontend: React with TypeScript for type safety\n- Backend: Node.js with Express for API endpoints\n- Database: PostgreSQL for relational data\n- Cache: Redis for session management\n\nThis provides a good balance of performance, developer experience, and scalability.',
  ],
  complex: [
    'After analyzing the contract, I identified several areas of potential liability:\n\n1. **Section 4.2 - Indemnification**: The clause is one-sided and exposes your company to unlimited liability for third-party claims. Recommendation: Add a mutual indemnification clause with a liability cap.\n\n2. **Section 7.1 - Intellectual Property**: The assignment clause is overly broad — it could be interpreted to include pre-existing IP. Recommendation: Add carve-outs for pre-existing and independently developed IP.\n\n3. **Section 9.3 - Termination**: The 90-day notice period combined with the non-compete creates a practical lock-in of 15 months. Recommendation: Negotiate to 30 days or remove the post-termination non-compete.\n\n4. **Missing Clauses**: No force majeure, no dispute resolution mechanism, no data protection provisions (GDPR risk if EU customers involved).\n\nOverall risk assessment: MEDIUM-HIGH. I recommend legal review before signing.',
    'The system design for a real-time bidding platform requires careful consideration of several trade-offs:\n\n**Latency vs. Consistency**: At 100K requests/second, you cannot afford synchronous database writes. Use an append-only log (Kafka) with eventual consistency. Bidders see results within 50ms; final reconciliation happens asynchronously.\n\n**Architecture**:\n- Load balancer → Bidding service (stateless, horizontally scaled)\n- Bidding service → Redis (current auction state, TTL-based expiry)\n- Redis → Kafka → Settlement service → PostgreSQL\n- WebSocket gateway for real-time updates to bidders\n\n**Failure modes**: If Redis fails, fall back to rejecting new bids (fail-closed). If Kafka fails, buffer in local disk queue with circuit breaker. Settlement service is idempotent — replaying Kafka messages is safe.\n\nEstimated infrastructure cost at scale: $15K/month on AWS.',
  ],
};

// Low-quality response indicators for fallback detection
const LOW_QUALITY_SIGNALS = [
  (resp) => resp.length < 20,
  (resp) => /i don'?t know/i.test(resp),
  (resp) => /i'?m not sure/i.test(resp),
  (resp) => /i cannot/i.test(resp) && resp.length < 100,
  (resp) => /as an ai/i.test(resp) && resp.length < 150,
  (resp) => resp.trim().endsWith('...') && resp.length < 80,
];

function isLowQuality(response) {
  return LOW_QUALITY_SIGNALS.some(check => check(response));
}

// ── Mock model call ─────────────────────────────────────────────────────

function mockModelCall(modelKey, query) {
  const config = MODEL_CONFIG[modelKey];
  if (!config) throw new Error(`Unknown model: ${modelKey}`);

  // Simulate latency (randomized around the model's average)
  const jitter    = Math.random() * 0.6 + 0.7; // 0.7x to 1.3x
  const latencyMs = Math.round(config.avgLatencyMs * jitter);

  // Simulate token counts
  const tokensIn  = Math.round(query.length / 4);   // ~4 chars per token
  const tokensOut = Math.round(tokensIn * (1.5 + Math.random() * 2));

  // Pick a response based on what tier this model is
  const tier = config.tier === 'cheap' ? 'simple'
             : config.tier === 'medium' ? 'medium'
             : 'complex';
  const pool = MOCK_RESPONSES[tier];
  const response = pool[Math.floor(Math.random() * pool.length)];

  // Simulate occasional failures for cheap models on complex queries
  const shouldFail = config.tier === 'cheap' && query.length > 300 && Math.random() < 0.3;

  // Calculate cost
  const cost = (tokensIn / 1000) * config.inputCostPer1k
             + (tokensOut / 1000) * config.outputCostPer1k;

  return {
    response: shouldFail ? "I'm not sure I can help with that complex request." : response,
    tokensIn,
    tokensOut,
    cost: Math.round(cost * 1000000) / 1000000, // 6 decimal places
    latencyMs,
    success: !shouldFail,
  };
}

// ── Router ──────────────────────────────────────────────────────────────

/**
 * Route a query through the model router.
 *
 * @param {string} query - The user's prompt
 * @param {object} opts
 * @param {function} opts.modelCall - Custom model call function (default: mockModelCall)
 * @returns {object} { response, model, tier, complexity, escalated, ... }
 */
export async function route(query, opts = {}) {
  const callModel = opts.modelCall || mockModelCall;

  // Step 1: classify
  const classification = classify(query);
  const { tier, score } = classification;

  // Step 2: get the fallback chain for this tier
  const chain = ROUTING_TABLE[tier];

  let lastResult = null;
  let escalated = false;
  let escalationReason = null;

  for (let i = 0; i < chain.length; i++) {
    const modelKey = chain[i];

    try {
      const result = callModel(modelKey, query);

      // Simulate async latency
      await new Promise(resolve => setTimeout(resolve, Math.min(result.latencyMs, 50)));

      // Log to metrics
      const isLastInChain = i === chain.length - 1;
      const qualityOk = !isLowQuality(result.response) || isLastInChain;

      if (!qualityOk) {
        // Escalate: log this attempt as failed escalation
        escalated = true;
        escalationReason = result.response.length < 20
          ? 'response_too_short'
          : 'low_quality_detected';

        logRequest({
          query_preview:    query,
          complexity:       score,
          tier,
          model:            MODEL_CONFIG[modelKey].name,
          tokens_in:        result.tokensIn,
          tokens_out:       result.tokensOut,
          cost_usd:         result.cost,
          latency_ms:       result.latencyMs,
          success:          false,
          escalated:        true,
          escalation_reason: escalationReason,
          response_preview: result.response,
        });

        lastResult = result;
        continue; // try next model in chain
      }

      // Success — log and return
      logRequest({
        query_preview:     query,
        complexity:        score,
        tier,
        model:             MODEL_CONFIG[modelKey].name,
        tokens_in:         result.tokensIn,
        tokens_out:        result.tokensOut,
        cost_usd:          result.cost,
        latency_ms:        result.latencyMs,
        success:           true,
        escalated,
        escalation_reason: escalationReason,
        response_preview:  result.response,
      });

      return {
        response:         result.response,
        model:            MODEL_CONFIG[modelKey].name,
        modelKey,
        tier,
        complexity:       score,
        tokensIn:         result.tokensIn,
        tokensOut:        result.tokensOut,
        cost:             result.cost,
        latencyMs:        result.latencyMs,
        escalated,
        escalationReason,
        classification,
      };

    } catch (err) {
      // Model call threw — escalate
      escalated = true;
      escalationReason = `error: ${err.message}`;

      logRequest({
        query_preview:     query,
        complexity:        score,
        tier,
        model:             MODEL_CONFIG[modelKey].name,
        tokens_in:         0,
        tokens_out:        0,
        cost_usd:          0,
        latency_ms:        0,
        success:           false,
        escalated:         true,
        escalation_reason: escalationReason,
        response_preview:  err.message,
      });

      continue;
    }
  }

  // All models in chain failed
  return {
    response:         lastResult?.response || 'All models failed to produce a response.',
    model:            'none',
    modelKey:         'none',
    tier,
    complexity:       score,
    tokensIn:         0,
    tokensOut:        0,
    cost:             0,
    latencyMs:        0,
    escalated:        true,
    escalationReason: 'all_models_exhausted',
    classification,
  };
}
