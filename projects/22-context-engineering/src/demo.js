// demo.js — Context Window Optimizer demonstration
// Shows why context engineering matters: naive stuffing vs intelligent assembly.
// Demonstrates BPE tokenization, attention reordering, conversation compaction, and prompt caching.

import { estimateTokens, estimateTokensNaive, compareEstimates } from './tokenizer.js';
import { SourceType, createSource, totalTokens } from './sources.js';
import { TokenBudget } from './budget.js';
import { strategies } from './strategies.js';
import { assemble, reorderForAttention } from './assembler.js';
import { compactConversation, extractKeyFacts } from './compactor.js';
import { ContextCache, simulateSession } from './cache.js';

// ─── Box-drawing helpers ────────────────────────────────────────────

function box(title, content) {
  const lines = content.split('\n');
  const maxLen = Math.max(title.length + 2, ...lines.map(l => l.length));
  const w = maxLen + 2;
  const top = `┌${'─'.repeat(w)}┐`;
  const bot = `└${'─'.repeat(w)}┘`;
  const titleLine = `│ ${title}${' '.repeat(w - title.length - 1)}│`;
  const sep = `├${'─'.repeat(w)}┤`;
  const body = lines.map(l => `│ ${l}${' '.repeat(Math.max(0, w - l.length - 1))}│`).join('\n');
  return `${top}\n${titleLine}\n${sep}\n${body}\n${bot}`;
}

function table(headers, rows) {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => String(r[i]).length))
  );
  const sep = '┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
  const mid = '├' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
  const bot = '└' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';
  const fmtRow = (cells) =>
    '│' + cells.map((c, i) => ` ${String(c).padEnd(colWidths[i])} `).join('│') + '│';

  return [sep, fmtRow(headers), mid, ...rows.map(fmtRow), bot].join('\n');
}

function sectionHeader(text) {
  const line = '═'.repeat(60);
  return `\n${line}\n  ${text}\n${line}`;
}

// ─── Realistic demo data ────────────────────────────────────────────

function createDemoSources() {
  const sources = [];

  // System prompt (priority 0 -- never dropped)
  sources.push(createSource(SourceType.SYSTEM_PROMPT,
    `You are an expert software architect specializing in distributed systems. You help engineers design scalable, fault-tolerant architectures. Always consider: consistency vs availability tradeoffs, data partitioning strategies, failure modes and recovery, observability and monitoring. Respond with concrete recommendations backed by industry patterns. When discussing tradeoffs, use a structured format with pros/cons/recommendation.`,
    { id: 'sys_prompt', relevanceScore: 1.0 }
  ));

  // RAG chunks
  sources.push(createSource(SourceType.RAG_CHUNKS,
    `[CAP Theorem] The CAP theorem states that a distributed system can provide at most two of three guarantees: Consistency, Availability, and Partition tolerance. In practice, since network partitions are inevitable, the real choice is between CP and AP. Modern systems like CockroachDB and Spanner use synchronized clocks to provide strong consistency with high availability.`,
    { id: 'rag_cap', relevanceScore: 0.95, metadata: { source: 'distributed_systems_textbook' } }
  ));

  sources.push(createSource(SourceType.RAG_CHUNKS,
    `[Saga Pattern] The Saga pattern manages distributed transactions across microservices without two-phase commit. Each service executes a local transaction and publishes an event. If any step fails, compensating transactions undo previous steps. Two approaches: choreography and orchestration.`,
    { id: 'rag_saga', relevanceScore: 0.72 }
  ));

  sources.push(createSource(SourceType.RAG_CHUNKS,
    `[Circuit Breaker] The circuit breaker pattern prevents cascade failures. Three states: Closed (normal), Open (calls fail immediately), Half-Open (limited calls to test recovery). Popular implementations: Resilience4j (Java), Polly (.NET). Always pair with bulkhead pattern for isolation.`,
    { id: 'rag_circuit', relevanceScore: 0.45 }
  ));

  sources.push(createSource(SourceType.RAG_CHUNKS,
    `[Event Sourcing] Event sourcing stores state changes as an append-only sequence of events. Benefits: complete audit trail, ability to rebuild state at any point. Challenges: eventual consistency, event schema evolution, snapshot management for long event streams.`,
    { id: 'rag_events', relevanceScore: 0.88 }
  ));

  sources.push(createSource(SourceType.RAG_CHUNKS,
    `[Load Balancing] Advanced strategies beyond round-robin: Weighted round-robin, Least connections, Consistent hashing, Power of Two Choices. For microservices, consider client-side load balancing with service mesh (Istio, Linkerd) for lower latency.`,
    { id: 'rag_lb', relevanceScore: 0.30 }
  ));

  // Memory entries
  sources.push(createSource(SourceType.MEMORY,
    `User preference: prefers PostgreSQL over MySQL. Has experience with Kubernetes on AWS EKS. Team size is 8 engineers. Current system handles ~10K requests per second at peak.`,
    { id: 'mem_prefs', relevanceScore: 0.85 }
  ));

  sources.push(createSource(SourceType.MEMORY,
    `Previous discussion: explored migration from monolith to microservices. Decided on strangler fig pattern. Currently has 3 services extracted: auth, billing, notifications.`,
    { id: 'mem_migration', relevanceScore: 0.70 }
  ));

  // Tool results
  sources.push(createSource(SourceType.TOOL_RESULTS,
    `[kubectl get pods -n production]\nauth-svc-7d8f9c6b4-x2k9m     2/2     Running   0     3d\nbilling-svc-5c4d3b2a1-m8k2   1/2     CrashLoopBackOff   14  2h\ngateway-6f5e4d3c2-h7g6f      2/2     Running   0     5d`,
    { id: 'tool_kubectl', relevanceScore: 0.90 }
  ));

  sources.push(createSource(SourceType.TOOL_RESULTS,
    `[docker logs billing-svc --tail 20]\n2024-01-15T08:15:03Z INFO  Event store initialized, replaying 847,293 events...\n2024-01-15T08:16:38Z ERROR java.lang.OutOfMemoryError: Java heap space\n  at com.billing.events.EventProjector.replayAll(EventProjector.java:142)\n2024-01-15T08:16:38Z FATAL Application crashed during startup`,
    { id: 'tool_logs', relevanceScore: 0.96 }
  ));

  // Conversation history
  sources.push(createSource(SourceType.CONVERSATION_HISTORY,
    `User: We deployed a new version of the billing service this morning and it's been unstable. Pods are crash-looping.`,
    { id: 'conv_1', relevanceScore: 0.95, metadata: { turn: 1 } }
  ));

  sources.push(createSource(SourceType.CONVERSATION_HISTORY,
    `User: Should we rollback or try to fix forward? We added event sourcing to the billing service in this release.`,
    { id: 'conv_3', relevanceScore: 0.98, metadata: { turn: 3 } }
  ));

  // Examples
  sources.push(createSource(SourceType.EXAMPLES,
    `Example -- Event Store Snapshot:\nUser: "Our event replay takes 5 minutes on startup"\nAssistant: "Implement snapshots: 1) Create a snapshot every N events 2) On load: read latest snapshot, then replay only events after 3) Add background snapshot pre-building"`,
    { id: 'ex_snapshot', relevanceScore: 0.80 }
  ));

  return sources;
}

// ─── Demo sections ──────────────────────────────────────────────────

function demoBPETokenizer() {
  console.log(sectionHeader('1. BPE TOKENIZER vs NAIVE'));
  console.log('\n  BPE-approximation counts tokens more accurately than word counting.');
  console.log('  Common words = 1 token. Code is ~1.3x more expensive. Numbers split differently.\n');

  const samples = [
    { label: 'English prose', text: 'The quick brown fox jumps over the lazy dog and runs away.', mode: 'text' },
    { label: 'Technical text', text: 'CockroachDB uses Raft consensus with hybrid logical clocks for linearizable reads.', mode: 'text' },
    { label: 'JavaScript code', text: 'const handleError = async (err) => { if (err.code === "ECONNREFUSED") { await retry(3); } };', mode: 'code' },
    { label: 'Python code', text: 'def calculate_percentile(data: list[float], p: int = 95) -> float:\n    sorted_data = sorted(data)\n    k = (len(sorted_data) - 1) * p / 100\n    return sorted_data[int(k)]', mode: 'code' },
    { label: 'Numbers/metrics', text: 'P99 latency: 847ms, throughput: 12,450 QPS, error rate: 0.03%, memory: 3.2GB/4GB', mode: 'text' },
    { label: 'Mixed content', text: 'Deploy v2.4.0 to production:\n```\nkubectl rollout restart deployment/billing-svc -n prod\n```\nMonitor for 15 min.', mode: 'auto' },
  ];

  const rows = samples.map(s => {
    const comp = compareEstimates(s.text, { mode: s.mode });
    return [s.label, s.mode, comp.naive, comp.bpe, comp.deltaPercent];
  });

  console.log(table(['Content', 'Mode', 'Naive', 'BPE', 'Delta'], rows));
  console.log('\n  Key: BPE catches code overhead, number splitting, and punctuation costs');
  console.log('  that naive word counting misses. This matters for budget accuracy.\n');
}

function demoAttentionReordering() {
  console.log(sectionHeader('2. LOST-IN-THE-MIDDLE REORDERING'));
  console.log('\n  Stanford (Liu et al. 2023): LLMs attend most to START and END of context.');
  console.log('  Content in the middle is up to 30% less likely to be used correctly.\n');

  // Create items with clear relevance scores
  const items = [
    { type: 'SYSTEM_PROMPT', label: 'System', content: 'sys', tokens: 100, relevance: 1.0, status: 'full' },
    { type: 'TOOL_RESULTS', label: 'Docker Logs (critical)', content: 'logs', tokens: 80, relevance: 0.96, status: 'full' },
    { type: 'RAG_CHUNKS', label: 'CAP Theorem', content: 'cap', tokens: 70, relevance: 0.95, status: 'full' },
    { type: 'RAG_CHUNKS', label: 'Event Sourcing', content: 'es', tokens: 60, relevance: 0.88, status: 'full' },
    { type: 'MEMORY', label: 'User Prefs', content: 'prefs', tokens: 40, relevance: 0.85, status: 'full' },
    { type: 'RAG_CHUNKS', label: 'Saga Pattern', content: 'saga', tokens: 65, relevance: 0.72, status: 'full' },
    { type: 'RAG_CHUNKS', label: 'CQRS', content: 'cqrs', tokens: 55, relevance: 0.55, status: 'full' },
    { type: 'RAG_CHUNKS', label: 'Circuit Breaker', content: 'cb', tokens: 50, relevance: 0.45, status: 'full' },
    { type: 'RAG_CHUNKS', label: 'Load Balancing', content: 'lb', tokens: 60, relevance: 0.30, status: 'full' },
  ];

  // Show chronological ordering
  console.log('  Chronological ordering (default):');
  for (let i = 0; i < items.length; i++) {
    const bar = '█'.repeat(Math.round(items[i].relevance * 20));
    console.log(`    [${i + 1}] ${items[i].label.padEnd(25)} rel=${items[i].relevance.toFixed(2)} ${bar}`);
  }

  // Show attention-optimized ordering
  const reordered = reorderForAttention(items);
  console.log('\n  Attention-optimized ordering:');
  for (let i = 0; i < reordered.length; i++) {
    const bar = '█'.repeat(Math.round(reordered[i].relevance * 20));
    const pos = (reordered[i].attentionPosition || 'fixed').padEnd(6);
    console.log(`    [${i + 1}] ${reordered[i].label.padEnd(25)} rel=${reordered[i].relevance.toFixed(2)} [${pos}] ${bar}`);
  }

  console.log('\n  Result: highest relevance items at positions 1-2 and 8-9 (start/end).');
  console.log('  Lowest relevance items in positions 4-6 (middle attention valley).\n');
}

function demoConversationCompaction() {
  console.log(sectionHeader('3. CONVERSATION COMPACTION'));
  console.log('\n  When conversation exceeds budget, compress older turns into a summary');
  console.log('  while keeping recent turns verbatim. The hardest part of context engineering.\n');

  // Create a 12-turn conversation
  const turns = [
    { role: 'user', content: 'We deployed billing-svc v2.4.0 this morning and pods are crash-looping. Can you help investigate?' },
    { role: 'assistant', content: 'I can see the billing-svc is in CrashLoopBackOff with 14 restarts. The Grafana dashboard shows memory at 980MB/1GB. This looks like a memory issue in the new deployment.' },
    { role: 'user', content: 'Should we rollback or try to fix forward? We added event sourcing to the billing service.' },
    { role: 'assistant', content: 'Given the severity, I recommend an immediate rollback to stabilize. The event sourcing change is likely the culprit. Replaying 847K events on startup without snapshots will exhaust the heap.' },
    { role: 'user', content: 'OK, we rolled back to v2.3.1 and it is stable now. But we need event sourcing for audit trail compliance. How can we make it work?' },
    { role: 'assistant', content: 'For event sourcing without OOM, implement three changes: 1) Snapshot projections every 10K events. 2) Use lazy loading for aggregates. 3) Increase JVM heap to 2GB with G1GC.' },
    { role: 'user', content: 'The snapshots approach sounds good. Can you check if our node has enough memory headroom for the increased heap?' },
    { role: 'assistant', content: 'You are at 80% memory allocation (24Gi/30Gi). Increasing billing-svc heap to 2GB across 2 pods adds 2Gi, putting you at 87%. I would recommend scaling the node pool first.' },
    { role: 'user', content: 'We have budget for one more m5.2xlarge node. Would that be enough for both the heap increase and future growth?' },
    { role: 'assistant', content: 'An m5.2xlarge adds 32GB memory. With your current 87% usage on existing nodes, adding a node gives you ~62GB total allocatable. That provides headroom for the heap increase plus 3-4 more service replicas.' },
    { role: 'user', content: 'Great. One more thing -- should we use EventStoreDB or just PostgreSQL for the event store? We already have PostgreSQL expertise.' },
    { role: 'assistant', content: 'For your team size (8 engineers) and existing PostgreSQL expertise, I recommend PostgreSQL with NOTIFY/LISTEN. EventStoreDB is purpose-built but adds operational overhead your team may not need yet. PostgreSQL handles up to ~10K events/second writes easily.' },
  ];

  // Show original size
  const totalOrigTokens = turns.reduce((s, t) => s + estimateTokens(t.content), 0);
  console.log(`  Original: ${turns.length} turns, ~${totalOrigTokens} tokens`);

  // Compact to a tight budget
  const budget = Math.floor(totalOrigTokens * 0.4); // 40% of original
  const result = compactConversation(turns, budget, { recentTurnCount: 3 });

  console.log(`  Budget:   ${budget} tokens (40% of original)`);
  console.log(`  Result:   ${result.stats.compactedTurns} turns, ~${result.stats.compactedTokens} tokens`);
  console.log(`  Ratio:    ${result.stats.compressionRatio}x compression`);
  console.log('');
  console.log(`  ${result.stats.description}`);
  console.log('');

  // Show the summary
  console.log('  Generated summary:');
  const summaryLines = result.turns[0].content.split('\n');
  for (const line of summaryLines) {
    console.log(`    ${line}`);
  }

  console.log('\n  Recent turns kept verbatim:');
  for (let i = 1; i < result.turns.length; i++) {
    const preview = result.turns[i].content.length > 80
      ? result.turns[i].content.slice(0, 80) + '...'
      : result.turns[i].content;
    console.log(`    [${result.turns[i].role}] ${preview}`);
  }

  // Show extraction stats
  const facts = result.stats.factsExtracted;
  console.log('\n  Facts extracted from older turns:');
  console.log(`    Decisions: ${facts.decisions}, Questions: ${facts.questions}, Entities: ${facts.entities}`);
  console.log(`    Action items: ${facts.actionItems}, Key values: ${facts.keyValues}\n`);
}

function demoCacheSimulation() {
  console.log(sectionHeader('4. PROMPT CACHE SIMULATION'));
  console.log('\n  Anthropic-style caching: static prefix (system prompt + examples) is cached');
  console.log('  across requests. Cached tokens cost 90% less. First request pays a write premium.\n');

  const systemPrompt = `You are an expert software architect specializing in distributed systems.
You help engineers design scalable, fault-tolerant architectures.
Always consider: consistency vs availability tradeoffs, data partitioning strategies,
failure modes and recovery, observability and monitoring.
Respond with concrete recommendations backed by industry patterns.
When discussing tradeoffs, use a structured format with pros/cons/recommendation.

Example: When asked about database selection, compare PostgreSQL, MySQL, and NoSQL options
with specific metrics for the team's use case. Always consider operational complexity.

Example: When reviewing architecture, check for: single points of failure (need 3+ replicas),
blast radius of component failures, data consistency boundaries, and observability gaps.`;

  const queries = [
    'Our billing service is OOMing after adding event sourcing. How should we fix it?',
    'Should we use EventStoreDB or PostgreSQL for the event store?',
    'How do we implement snapshots for our 847K event stream?',
    'What is the right JVM heap size for a service replaying events?',
    'Can you review our node capacity before we scale up the heap?',
  ];

  const result = simulateSession(systemPrompt, queries, {
    outputTokensPerRequest: 400,
    interRequestDelayMs: 2000,
  });

  // Show per-request breakdown
  const rows = result.requests.map(r => [
    `Request ${r.requestNum}`,
    r.cacheHit ? 'HIT' : 'MISS',
    `${r.tokens.static}+${r.tokens.dynamic}`,
    `$${r.cost.total.toFixed(4)}`,
    `$${r.cost.withoutCache.toFixed(4)}`,
    r.cost.savings > 0 ? `$${r.cost.savings.toFixed(4)}` : '-',
  ]);

  console.log(table(
    ['Request', 'Cache', 'Static+Dynamic', 'Cost', 'No Cache', 'Savings'],
    rows,
  ));

  console.log(`\n  Static prefix: ${result.stats.staticPrefixTokens} tokens (cached after first request)`);
  console.log(`  Cache hit rate: ${result.stats.hitRate}%`);
  console.log(`  Total with caching:    $${result.stats.costWithCache.toFixed(4)}`);
  console.log(`  Total without caching: $${result.stats.costWithoutCache.toFixed(4)}`);
  console.log(`  Total savings:         $${result.stats.totalSavings.toFixed(4)} (${result.stats.savingsPercent}%)\n`);
}

function demoStrategyComparison() {
  console.log(sectionHeader('5. STRATEGY COMPARISON'));
  console.log('\n  Three strategies for fitting sources into a fixed token budget.\n');

  const sources = createDemoSources();
  const naiveTotal = totalTokens(sources);
  const BUDGET = 1024;

  console.log(`  Sources: ${sources.length} totaling ~${naiveTotal} tokens`);
  console.log(`  Budget: ${BUDGET} tokens (${BUDGET - Math.floor(BUDGET * 0.25)} available after output buffer)\n`);

  const results = {};

  for (const [name, strategyFn] of Object.entries(strategies)) {
    const freshBudget = new TokenBudget(BUDGET);
    const plan = strategyFn(sources, freshBudget);
    // Use attention-optimized ordering
    const assembled = assemble(sources, plan, { ordering: 'attention-optimized' });
    results[name] = { plan, assembled, budget: freshBudget };
  }

  const compRows = Object.entries(results).map(([name, { assembled }]) => [
    name,
    assembled.totalTokens,
    assembled.report.sourcesKept,
    assembled.report.sourcesDropped,
    assembled.report.sourcesTruncated,
    `${assembled.report.utilization}%`,
  ]);
  console.log(table(
    ['Strategy', 'Tokens', 'Kept', 'Dropped', 'Truncated', 'Utilization'],
    compRows,
  ));

  // Show the balanced strategy's attention-optimized assembly
  console.log('\n  Balanced strategy with attention-optimized ordering:');
  const balancedItems = results.balanced.assembled.report.items;
  for (let i = 0; i < balancedItems.length; i++) {
    const item = balancedItems[i];
    const pos = item.attentionPosition ? ` [${item.attentionPosition}]` : ' [fixed]';
    const rel = item.relevance !== undefined ? ` rel=${item.relevance.toFixed(2)}` : '';
    const trunc = item.status === 'truncated' ? ' (truncated)' : '';
    console.log(`    [${i + 1}] ${item.label.padEnd(20)} ${item.tokens}tok${rel}${pos}${trunc}`);
  }
  console.log('');
}

// ─── Run the demo ───────────────────────────────────────────────────

function run() {
  console.log(sectionHeader('CONTEXT WINDOW OPTIMIZER'));
  console.log('\n  A production-grade context engineering toolkit.');
  console.log('  BPE tokenization | Attention reordering | Conversation compaction | Prompt caching\n');

  demoBPETokenizer();
  demoAttentionReordering();
  demoConversationCompaction();
  demoCacheSimulation();
  demoStrategyComparison();

  console.log(box('KEY INSIGHTS', [
    '1. Tokenization accuracy matters: BPE vs naive can differ 20-40% on code.',
    '   Budget errors compound across thousands of requests.',
    '',
    '2. Position matters: "Lost in the middle" is a real production problem.',
    '   Put critical context at the start and end, not buried in the middle.',
    '',
    '3. Compression is the hardest problem: when context exceeds budget,',
    '   you must summarize without losing key facts and decisions.',
    '',
    '4. Caching is free money: a 2K static prefix across 100 requests',
    '   saves ~$0.50. At scale (1M req/day), that is $5,000/day.',
    '',
    '5. Strategy selection depends on your use case:',
    '   - Greedy: when you have clear priority ordering',
    '   - Relevance: when you have good embeddings/scores',
    '   - Balanced: when you need representation across source types',
  ].join('\n')));
}

run();
