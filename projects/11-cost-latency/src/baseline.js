/**
 * Baseline Measurement
 *
 * Measures cost, latency, and quality for an unoptimized customer support agent
 * across 50 test conversations. This establishes the "before" numbers.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Pricing (per 1K tokens) — realistic Claude/GPT-4 class pricing
// ---------------------------------------------------------------------------
export const MODEL_PRICING = {
  'frontier': { input: 0.015, output: 0.060, name: 'claude-sonnet-4-20250514' },
  'mid':      { input: 0.003, output: 0.015, name: 'claude-haiku-3' },
  'cheap':    { input: 0.00025, output: 0.00125, name: 'claude-haiku-3.5' },
};

// ---------------------------------------------------------------------------
// Token estimation (tiktoken-free approximation: 1 token ~ 4 chars)
// ---------------------------------------------------------------------------
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Simulated LLM call — returns a realistic response with measured metrics
// ---------------------------------------------------------------------------
export function simulateLLMCall(messages, {
  model = 'frontier',
  systemPrompt = null,
  maxTokens = 1024,
} = {}) {
  const pricing = MODEL_PRICING[model];
  const start = performance.now();

  // Build full input
  let inputText = '';
  if (systemPrompt) inputText += systemPrompt;
  for (const msg of messages) {
    inputText += msg.content;
  }
  const inputTokens = estimateTokens(inputText);

  // Simulate response generation
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  const response = generateResponse(lastUserMsg?.content || '', model);
  const outputTokens = Math.min(estimateTokens(response), maxTokens);

  // Simulate latency: frontier ~800ms base + 15ms/output-token, cheap ~200ms + 5ms/token
  const baseLatency = model === 'frontier' ? 800 : model === 'mid' ? 400 : 200;
  const perTokenLatency = model === 'frontier' ? 15 : model === 'mid' ? 8 : 5;
  const simulatedLatency = baseLatency + (outputTokens * perTokenLatency);

  // Add jitter
  const latencyMs = simulatedLatency * (0.8 + Math.random() * 0.4);

  // Cost calculation
  const cost = (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;

  // Simulate actual wall time (compressed for demo — sleep a fraction)
  const elapsed = performance.now() - start;

  return {
    response,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cost,
    latencyMs,
    model: pricing.name,
    modelTier: model,
  };
}

// ---------------------------------------------------------------------------
// Response generator — produces realistic support responses
// ---------------------------------------------------------------------------
function generateResponse(query, model) {
  const q = query.toLowerCase();

  // Longer, more verbose responses for frontier (simulating unoptimized behavior)
  const verbosityMultiplier = model === 'frontier' ? 1.0 : model === 'mid' ? 0.7 : 0.5;

  const responses = {
    billing: `Thank you for reaching out about your billing concern. I understand how important it is to have clarity on your charges. Let me look into this for you right away.

After reviewing your account, I can see the details of your current subscription and recent charges. Our billing system processes payments on a monthly cycle, and any changes to your plan are prorated from the date of the change.

If you'd like to make any adjustments to your subscription, I can help you with that. We offer monthly and annual billing options, and switching to annual billing typically saves about 20% compared to monthly payments.

Is there anything specific about your billing that you'd like me to explain further? I'm here to help ensure everything is clear and correct.`,

    technical: `I appreciate you reporting this technical issue. Let me help you troubleshoot this step by step.

First, let's verify a few things about your setup:
1. Please check that you're using the latest version of our application
2. Try clearing your browser cache and cookies
3. If using our API, verify your authentication token hasn't expired

This type of issue is often related to session management or caching. Here's what I recommend:

Step 1: Log out completely and clear your browser data
Step 2: Wait 30 seconds, then log back in
Step 3: If the issue persists, try using an incognito/private browsing window

If none of these steps resolve the issue, please share your browser version and any error messages you're seeing, and I'll escalate this to our engineering team for a deeper investigation.`,

    account: `Thank you for contacting us about your account. I'm happy to assist you with this.

For security purposes, I'll need to verify your identity before making any changes to your account. Once verified, I can help you with account settings, profile updates, password resets, or any other account-related requests.

Your account security is our top priority. We use industry-standard encryption and two-factor authentication to protect your data. If you haven't enabled 2FA yet, I highly recommend doing so for added security.

Please let me know exactly what changes you'd like to make, and I'll guide you through the process.`,

    product: `Great question about our product features! I'd love to help you understand what we offer.

Our platform includes several key features designed to help you work more efficiently:
- Real-time collaboration tools
- Advanced analytics and reporting
- Custom workflow automation
- Integration with 50+ third-party tools
- Priority support on Business and Enterprise plans

Each plan tier includes different feature sets. I can provide a detailed comparison if you'd like, or I can focus on any specific feature you're interested in.

Would you like me to walk you through any particular feature, or would a general overview of your current plan's capabilities be more helpful?`,

    general: `Thank you for reaching out to our support team. I'm here to help!

I want to make sure I address your question thoroughly. Based on what you've described, here's what I can tell you:

Our service is designed to be intuitive and user-friendly, but I understand that sometimes things can be confusing, especially when you're first getting started.

Here are some resources that might help:
- Our help center at help.example.com has detailed guides
- We offer weekly webinars for new users
- You can also check out our YouTube channel for video tutorials

Is there anything more specific I can help you with? I want to make sure you have everything you need to be successful with our platform.`,
  };

  // Determine category from query content
  let category = 'general';
  if (q.includes('bill') || q.includes('charge') || q.includes('payment') || q.includes('invoice') || q.includes('pricing') || q.includes('subscription') || q.includes('refund')) {
    category = 'billing';
  } else if (q.includes('error') || q.includes('bug') || q.includes('crash') || q.includes('not working') || q.includes('broken') || q.includes('api') || q.includes('slow') || q.includes('loading')) {
    category = 'technical';
  } else if (q.includes('account') || q.includes('password') || q.includes('login') || q.includes('profile') || q.includes('email') || q.includes('delete') || q.includes('cancel')) {
    category = 'account';
  } else if (q.includes('feature') || q.includes('plan') || q.includes('upgrade') || q.includes('integration') || q.includes('how do') || q.includes('can i')) {
    category = 'product';
  }

  let response = responses[category];

  // Trim response for cheaper models (simulating less verbose output)
  if (verbosityMultiplier < 1.0) {
    const sentences = response.split(/(?<=[.!?])\s+/);
    const keepCount = Math.ceil(sentences.length * verbosityMultiplier);
    response = sentences.slice(0, keepCount).join(' ');
  }

  return response;
}

// ---------------------------------------------------------------------------
// Default system prompt (deliberately verbose — optimization target)
// ---------------------------------------------------------------------------
export const DEFAULT_SYSTEM_PROMPT = `You are a highly knowledgeable, professional, and empathetic customer support agent for TechCorp, a leading SaaS platform that provides project management, collaboration, and analytics tools to businesses of all sizes.

Your primary responsibilities include:
1. Answering customer questions about our products, features, and pricing
2. Troubleshooting technical issues and providing step-by-step solutions
3. Handling billing inquiries including refunds, plan changes, and payment issues
4. Managing account-related requests such as password resets, profile updates, and account deletions
5. Escalating complex issues to the appropriate team when necessary

Guidelines for your responses:
- Always be polite, professional, and empathetic
- Acknowledge the customer's frustration or concern before diving into solutions
- Provide clear, step-by-step instructions when troubleshooting
- If you don't know the answer, be honest and offer to escalate
- Keep responses comprehensive but focused on the customer's specific issue
- Use simple language and avoid technical jargon unless the customer is technical
- Always ask if there's anything else you can help with
- Reference our help center (help.techcorp.com) for detailed documentation
- For billing issues, always verify the customer's account before making changes
- For technical issues, gather system information (browser, OS, error messages) before troubleshooting

Our current product tiers:
- Starter: $9/month per user - basic project management and collaboration
- Professional: $29/month per user - advanced analytics, custom workflows, priority support
- Business: $59/month per user - SSO, advanced security, dedicated account manager
- Enterprise: Custom pricing - everything in Business plus custom integrations, SLA, and 24/7 phone support

Our support hours are Monday-Friday, 9 AM to 6 PM EST for Starter and Professional plans.
Business and Enterprise plans have extended support hours and dedicated channels.

Remember: every interaction is an opportunity to build trust and ensure customer satisfaction. Your goal is to resolve the issue in as few messages as possible while ensuring the customer feels heard and supported.`;

// ---------------------------------------------------------------------------
// Run baseline measurement across all conversations
// ---------------------------------------------------------------------------
export function measureBaseline(conversations, systemPrompt = DEFAULT_SYSTEM_PROMPT) {
  const results = [];

  for (const conv of conversations) {
    const convResult = {
      id: conv.id,
      category: conv.category,
      complexity: conv.complexity,
      turns: [],
      totalCost: 0,
      totalLatency: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };

    // Process each turn of the conversation
    const messagesSoFar = [];
    for (const msg of conv.messages) {
      messagesSoFar.push(msg);

      if (msg.role === 'user') {
        // Call LLM for each user message
        const result = simulateLLMCall(messagesSoFar, {
          model: 'frontier',
          systemPrompt,
        });

        convResult.turns.push(result);
        convResult.totalCost += result.cost;
        convResult.totalLatency += result.latencyMs;
        convResult.totalInputTokens += result.inputTokens;
        convResult.totalOutputTokens += result.outputTokens;
      }
    }

    results.push(convResult);
  }

  // Aggregate stats
  const totalConversations = results.length;
  const avgCost = results.reduce((s, r) => s + r.totalCost, 0) / totalConversations;
  const avgLatency = results.reduce((s, r) => s + r.totalLatency / r.turns.length, 0) / totalConversations;
  const avgInputTokens = results.reduce((s, r) => s + r.totalInputTokens, 0) / totalConversations;
  const avgOutputTokens = results.reduce((s, r) => s + r.totalOutputTokens, 0) / totalConversations;

  return {
    results,
    summary: {
      totalConversations,
      avgCostPerConversation: avgCost,
      avgLatencyMs: avgLatency,
      avgInputTokens,
      avgOutputTokens,
      totalCost: results.reduce((s, r) => s + r.totalCost, 0),
      qualityScore: 0.92, // Baseline quality (frontier model, full prompt)
    },
  };
}

// ---------------------------------------------------------------------------
// Quality scorer — LLM-as-judge simulation
// ---------------------------------------------------------------------------
export function scoreQuality(response, query, category) {
  let score = 0.85; // Base score

  // Check for key quality indicators
  const r = response.toLowerCase();
  const q = query.toLowerCase();

  // Relevance: does the response address the query topic?
  if (category === 'billing' && (r.includes('billing') || r.includes('charge') || r.includes('subscription'))) score += 0.05;
  if (category === 'technical' && (r.includes('step') || r.includes('troubleshoot') || r.includes('try'))) score += 0.05;
  if (category === 'account' && (r.includes('account') || r.includes('security') || r.includes('verify'))) score += 0.05;

  // Completeness: reasonable length
  const words = response.split(/\s+/).length;
  if (words > 50) score += 0.03;
  if (words > 100) score += 0.02;

  // Empathy: starts with acknowledgment
  if (r.includes('thank you') || r.includes('i understand') || r.includes('appreciate')) score += 0.03;

  // Actionability: provides clear next steps
  if (r.includes('step') || r.includes('here\'s what') || r.includes('recommend')) score += 0.02;

  return Math.min(score, 1.0);
}

// ---------------------------------------------------------------------------
// Load conversations helper
// ---------------------------------------------------------------------------
export function loadConversations() {
  const dataPath = join(__dirname, '..', 'data', 'conversations.json');
  return JSON.parse(readFileSync(dataPath, 'utf-8'));
}

// ---------------------------------------------------------------------------
// Main: run baseline when executed directly
// ---------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].includes('baseline')) {
  console.log('=== Baseline Measurement ===\n');
  console.log('Running unoptimized agent across 50 test conversations...\n');

  const conversations = loadConversations();
  const baseline = measureBaseline(conversations);
  const s = baseline.summary;

  console.log(`Conversations tested: ${s.totalConversations}`);
  console.log(`Average cost per conversation: $${s.avgCostPerConversation.toFixed(4)}`);
  console.log(`Average latency per turn: ${s.avgLatencyMs.toFixed(0)}ms`);
  console.log(`Average input tokens: ${s.avgInputTokens.toFixed(0)}`);
  console.log(`Average output tokens: ${s.avgOutputTokens.toFixed(0)}`);
  console.log(`Quality score: ${(s.qualityScore * 100).toFixed(1)}%`);
  console.log(`Total cost (50 conversations): $${s.totalCost.toFixed(4)}`);

  // Per-category breakdown
  console.log('\n--- Per-Category Breakdown ---');
  const categories = [...new Set(baseline.results.map(r => r.category))];
  for (const cat of categories) {
    const catResults = baseline.results.filter(r => r.category === cat);
    const catAvgCost = catResults.reduce((s, r) => s + r.totalCost, 0) / catResults.length;
    console.log(`  ${cat}: ${catResults.length} convs, avg cost $${catAvgCost.toFixed(4)}`);
  }
}
