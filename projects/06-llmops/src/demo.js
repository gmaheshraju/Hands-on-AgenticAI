/**
 * Demo — runs 50 diverse queries through the router and prints a summary.
 * Populates the SQLite metrics DB so the dashboard has real data.
 */

import { route } from './router.js';
import {
  costByModel, avgLatencyByModel, escalationStats,
  tierDistribution, savingsVsFrontier,
} from './metrics.js';

// ── Sample queries (mix of simple, medium, complex) ─────────────────────

const QUERIES = [
  // Simple (20)
  'What is my order status?',
  'Hi there!',
  'What are your store hours?',
  'How do I reset my password?',
  'How much does shipping cost?',
  'Can I get a refund?',
  'Where is my delivery?',
  'What is the return policy?',
  'Thanks for your help!',
  'What is the price of the basic plan?',
  'Cancel my subscription',
  'What is your phone number?',
  'Hello, I need help',
  'What time do you close today?',
  'Yes, please proceed',
  'How do I contact support?',
  'Where is the nearest store?',
  'Format this as a bullet list: apples oranges bananas',
  'Convert 100 USD to EUR',
  'Define the word "ephemeral"',

  // Medium (15)
  'Summarize this article about climate change and its effects on agriculture in developing nations',
  'Explain how JavaScript promises work with async/await',
  'Write a professional email declining a meeting invitation',
  'What is the difference between SQL and NoSQL databases? Give me an overview.',
  'Review this code and suggest improvements:\nfunction add(a,b) { return a+b; }',
  'Describe the key features of React and how it compares to Vue',
  'Create a template for a weekly status report email',
  'Explain the concept of microservices architecture',
  'List the pros and cons of remote work for software engineers',
  'Summarize the key points of this quarterly earnings report overview',
  'How does HTTP/2 differ from HTTP/1.1? Explain the improvements.',
  'Suggest a good tech stack for a small e-commerce website',
  'Rewrite this paragraph in a more professional tone: We messed up the deployment and stuff broke.',
  'Give me an outline of how DNS resolution works',
  'Recommend best practices for securing a REST API',

  // Complex (15)
  'Analyze this contract for potential liability risks. The agreement states that Party A shall indemnify Party B against all claims arising from...\n\nSection 4.2 states unlimited liability. Section 7.1 covers IP assignment broadly. I need a thorough legal analysis with recommendations for each section.',
  'Design a system architecture for a real-time bidding platform that handles 100K requests per second. Consider trade-offs between consistency and latency. Include failure modes and recovery strategies.',
  'Write a comprehensive analysis comparing the pros and cons of different database sharding strategies for a social media platform with 500M users. Consider horizontal vs vertical partitioning, consistent hashing, and cross-shard queries.',
  'Evaluate this investment portfolio for risk exposure. Holdings include: 40% US equities, 20% international equities, 15% bonds, 10% REITs, 15% crypto. Analyze correlation risks, tail risk scenarios, and suggest rebalancing strategies based on current market conditions.',
  'Implement a red-black tree data structure in Python with insert, delete, and search operations. Include proper rotation logic and color fixing after insertions. Add comprehensive test cases.',
  'Write a detailed step-by-step debugging guide for a distributed system experiencing intermittent timeout errors. The system uses microservices with Kubernetes, gRPC, and PostgreSQL. Root cause analysis methodology required.',
  'Compare and contrast three different approaches to implementing a recommendation engine: collaborative filtering, content-based filtering, and hybrid approaches. Include mathematical formulations, scalability analysis, and real-world trade-offs.',
  'Analyze the regulatory compliance implications of deploying an AI-powered hiring tool in the EU. Consider GDPR, the EU AI Act, existing employment law, and potential liability for algorithmic bias. Provide a risk assessment matrix.',
  'Design an algorithm for optimal resource allocation in a cloud computing environment with heterogeneous workloads. Consider CPU-bound, memory-bound, and I/O-bound tasks. The algorithm should minimize cost while meeting SLA requirements.',
  'Write a creative short story set in a post-apocalyptic world where AI has become sentient. The story should explore themes of consciousness, free will, and the nature of humanity. Include multiple perspectives and a plot twist.',
  'Provide a comprehensive analysis of why the Boeing 737 MAX crisis happened from a systems engineering perspective. Cover organizational factors, regulatory capture, software design decisions, and lessons for safety-critical systems.',
  'Explain the mathematical foundations of transformer neural networks step by step. Cover self-attention mechanisms, positional encoding, layer normalization, and the relationship to older sequence models. Include the key equations.',
  'Design a fault-tolerant distributed consensus protocol for a financial transaction system. Compare your design to Raft and Paxos. Prove safety and liveness properties. Discuss performance implications.',
  'Analyze the strategic implications of vertical integration for a mid-size SaaS company. Consider the build vs buy decision framework, impact on margins, competitive moat, engineering velocity trade-offs, and provide a decision matrix.',
  'Write a detailed architecture proposal for migrating a monolithic Rails application to microservices. Include service boundaries, data migration strategy, API gateway design, monitoring, and a phased rollout plan with rollback procedures.',
];

// ── Run the demo ────────────────────────────────────────────────────────

async function runDemo() {
  console.log('=== Model Router Demo ===\n');
  console.log(`Running ${QUERIES.length} queries through the router...\n`);

  const results = [];

  for (let i = 0; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    const result = await route(query);

    const preview = query.length > 60 ? query.slice(0, 57) + '...' : query;
    const esc = result.escalated ? ' [ESCALATED]' : '';

    console.log(
      `  [${String(i + 1).padStart(2)}] ${result.tier.padEnd(7)} → ${result.model.padEnd(20)} ` +
      `$${result.cost.toFixed(6).padStart(10)}  ${String(result.latencyMs).padStart(5)}ms${esc}`
    );

    results.push(result);
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  // Cost by model
  console.log('\n--- Cost by Model ---');
  const costs = costByModel();
  for (const row of costs) {
    console.log(
      `  ${row.model.padEnd(20)} ${String(row.request_count).padStart(4)} reqs  ` +
      `$${row.total_cost.toFixed(6).padStart(10)}  (${row.total_tokens} tokens)`
    );
  }

  // Latency by model
  console.log('\n--- Avg Latency by Model ---');
  const latency = avgLatencyByModel();
  for (const row of latency) {
    console.log(
      `  ${row.model.padEnd(20)} avg ${String(row.avg_latency_ms).padStart(5)}ms  ` +
      `(min ${row.min_latency_ms}ms, max ${row.max_latency_ms}ms)`
    );
  }

  // Escalation stats
  console.log('\n--- Escalation Stats ---');
  const esc = escalationStats();
  console.log(`  Total requests: ${esc.total}`);
  console.log(`  Escalated:      ${esc.escalated_count} (${esc.escalation_pct}%)`);

  // Tier distribution
  console.log('\n--- Tier Distribution ---');
  const tiers = tierDistribution();
  for (const row of tiers) {
    console.log(`  ${row.tier.padEnd(10)} ${String(row.count).padStart(4)} (${row.pct}%)`);
  }

  // Savings
  console.log('\n--- Cost Savings vs Frontier ---');
  const savings = savingsVsFrontier();
  console.log(`  Actual cost:     $${savings.actual_cost.toFixed(6)}`);
  console.log(`  Frontier cost:   $${savings.frontier_cost.toFixed(6)}`);
  console.log(`  Savings:         $${savings.savings_usd.toFixed(6)} (${savings.savings_pct}%)`);

  console.log('\n✓ Metrics saved to metrics.db');
  console.log('✓ Run "npm run dashboard" to view the cost dashboard at http://localhost:3000');
}

runDemo().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
