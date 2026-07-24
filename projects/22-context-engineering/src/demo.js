// demo.js — Context Window Optimizer demonstration
// Shows why context engineering matters: naive stuffing vs intelligent assembly.
// Demonstrates BPE tokenization, attention reordering, conversation compaction, and prompt caching.

import { estimateTokens, estimateTokensNaive, compareEstimates } from './tokenizer.js';
import { SourceType, createSource, totalTokens } from './sources.js';
import { TokenBudget } from './budget.js';
import { strategies } from './strategies.js';
import { assemble, reorderForAttention, assembleWithScratchpad } from './assembler.js';
import { compactConversation, extractKeyFacts, contextAwareCompress } from './compactor.js';
import { ContextCache, simulateSession } from './cache.js';
import { Scratchpad } from './scratchpad.js';

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


function demoScratchpad() {
  console.log(sectionHeader('6. THE WRITE MOVE — SCRATCHPAD'));
  console.log('\n  When context fills up, park findings to a scratchpad instead of dropping them.');
  console.log('  A compact index stays in-context. The agent knows WHAT is available without');
  console.log('  paying the token cost of holding ALL of it.\n');

  const pad = new Scratchpad({ maxEntries: 50 });

  // Simulate an agent accumulating findings during a debugging session
  const findings = [
    { key: 'error_stacktrace', content: `java.lang.OutOfMemoryError: Java heap space\n  at com.billing.events.EventProjector.replayAll(EventProjector.java:142)\n  at com.billing.events.EventStore.init(EventStore.java:87)\n  at org.springframework.boot.SpringApplication.run(SpringApplication.java:1300)\n  at com.billing.Application.main(Application.java:12)\nCaused by: 847,293 events loaded into memory during replay\nHeap size: 1024MB, Used: 1018MB, Free: 6MB`, meta: { source: 'tool_result', relevance: 0.95 } },
    { key: 'pod_status', content: `NAME                         READY   STATUS             RESTARTS   AGE\nbilling-svc-7d8f9c6b4-x2k9m  1/2     CrashLoopBackOff   14         2h\nbilling-svc-7d8f9c6b4-y3l0n  1/2     CrashLoopBackOff   12         2h\nauth-svc-5c4d3b2a1-m8k2f     2/2     Running            0          3d\ngateway-6f5e4d3c2-h7g6f      2/2     Running            0          5d`, meta: { source: 'tool_result', relevance: 0.85 } },
    { key: 'event_store_schema', content: `CREATE TABLE events (\n  event_id UUID PRIMARY KEY,\n  aggregate_id UUID NOT NULL,\n  aggregate_type VARCHAR(255) NOT NULL,\n  event_type VARCHAR(255) NOT NULL,\n  event_data JSONB NOT NULL,\n  metadata JSONB DEFAULT '{}',\n  version INTEGER NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  UNIQUE(aggregate_id, version)\n);\nCREATE INDEX idx_events_aggregate ON events(aggregate_id, version);\nCREATE INDEX idx_events_type ON events(event_type, created_at);`, meta: { source: 'rag_chunk', relevance: 0.70 } },
    { key: 'jvm_tuning_guide', content: `JVM Heap Sizing for Event Sourcing:\n- Base: 512MB for application + framework overhead\n- Per 100K events in memory: ~200MB (with JSONB deserialization)\n- Recommended: use G1GC with -XX:MaxGCPauseMillis=200\n- For 847K events: minimum 2048MB heap\n- Better approach: implement snapshots every 10K events\n  Snapshot reduces replay to latest_snapshot + new_events\n  Typical startup: 50ms (snapshot) vs 90s (full replay)`, meta: { source: 'rag_chunk', relevance: 0.80 } },
    { key: 'node_capacity', content: `Cluster: production-eks-us-east-1\nNode pool: m5.2xlarge (8 vCPU, 32GB RAM)\nNodes: 3\nAllocatable per node: 30.5 Gi\nCurrent usage: 24.4 Gi / 30.5 Gi (80%)\nPod requests: billing-svc 1Gi, auth-svc 512Mi, gateway 256Mi\nAvailable headroom: 6.1 Gi per node, 18.3 Gi total`, meta: { source: 'tool_result', relevance: 0.75 } },
  ];

  console.log('  Parking 5 findings from a debugging session:\n');

  let totalSaved = 0;
  for (const f of findings) {
    const result = pad.write(f.key, f.content, f.meta);
    totalSaved += result.tokensSaved;
    console.log(`    ${f.key.padEnd(22)} ${estimateTokens(f.content)} tokens parked, ${result.tokensSaved} tokens saved`);
  }

  // Show the index (what goes into context)
  const summary = pad.summarize();
  console.log(`\n  Full content: ${summary.contentTokens} tokens`);
  console.log(`  Index only:   ${summary.indexTokens} tokens`);
  console.log(`  Compression:  ${summary.compressionRatio}x (${Math.round((1 - summary.indexTokens / summary.contentTokens) * 100)}% token reduction)\n`);

  console.log('  Scratchpad index (this is what stays in-context):');
  const indexLines = pad.formatIndex().split('\n');
  for (const line of indexLines) {
    console.log(`    ${line}`);
  }

  // Demonstrate retrieval
  console.log('\n  Retrieving a specific finding:');
  const retrieved = pad.read('jvm_tuning_guide');
  console.log(`    pad.read("jvm_tuning_guide") -> ${retrieved.tokens} tokens`);
  console.log(`    Preview: "${retrieved.content.slice(0, 60)}..."\n`);

  // Demonstrate search
  console.log('  Searching for "memory heap":');
  const results = pad.search('memory heap');
  for (const r of results) {
    console.log(`    [${r.matchScore.toFixed(1)}] ${r.key} (${r.tokens}tok) — ${r.snippet.slice(0, 60)}...`);
  }

  // Show stats
  const stats = pad.getStats();
  console.log(`\n  Stats: ${stats.entries} entries, ${stats.totalTokensParked} tokens parked, ${stats.writeCount} writes, ${stats.readCount} reads\n`);
}

function demoScratchpadAssembly() {
  console.log(sectionHeader('7. SCRATCHPAD-AWARE ASSEMBLY'));
  console.log('\n  Instead of dropping sources when budget is tight, park them in the scratchpad.');
  console.log('  The scratchpad index goes into context — cheap awareness of everything available.\n');

  const sources = createDemoSources();
  const TIGHT_BUDGET = 600;
  const budget = new TokenBudget(TIGHT_BUDGET);
  const pad = new Scratchpad();

  // Standard assembly (drops sources)
  const standardPlan = budget.allocate(sources);
  const standardResult = assemble(sources, standardPlan);

  // Scratchpad-aware assembly (parks dropped sources)
  const freshBudget = new TokenBudget(TIGHT_BUDGET);
  const scratchpadPlan = freshBudget.allocate(sources);
  const scratchpadResult = assembleWithScratchpad(sources, scratchpadPlan, pad);

  console.log(`  Budget: ${TIGHT_BUDGET} tokens (tight — forces drops)\n`);
  console.log('  Standard assembly:');
  console.log(`    Sources kept:    ${standardResult.report.sourcesKept}`);
  console.log(`    Sources dropped: ${standardResult.report.sourcesDropped} (LOST)`);
  console.log(`    Tokens used:     ${standardResult.totalTokens}\n`);

  console.log('  Scratchpad-aware assembly:');
  console.log(`    Sources kept:    ${scratchpadResult.report.sourcesKept}`);
  console.log(`    Sources parked:  ${scratchpadResult.report.scratchpad.sourcesParked} (RECOVERABLE)`);
  console.log(`    Tokens used:     ${scratchpadResult.totalTokens}`);
  console.log(`    Index cost:      ${scratchpadResult.report.scratchpad.indexTokenCost} tokens`);
  console.log(`    Tokens parked:   ${scratchpadResult.report.scratchpad.totalTokensParked} tokens\n`);

  if (scratchpadResult.parkedSources.length > 0) {
    console.log('  Parked sources (available via scratchpad.read()):');
    for (const p of scratchpadResult.parkedSources) {
      console.log(`    ${p.label.padEnd(20)} ${p.tokens} tokens, relevance ${p.relevance.toFixed(2)}`);
    }
  }
  console.log('');
}

function demoFailureModes() {
  console.log(sectionHeader('8. FAILURE MODE DETECTION'));
  console.log('\n  Drew Brunic\'s 4 failure modes that degrade context quality.');
  console.log('  contextAwareCompress detects and handles each one before compression.\n');

  // Create a conversation with deliberate failure modes
  const turns = [
    { role: 'user', content: 'We need to set the timeout to 30 seconds for all API calls. The database connection pool is 50.' },
    { role: 'assistant', content: 'I recommend setting the timeout to 30 seconds. The connection pool size of 50 should be sufficient for your load.' },
    { role: 'user', content: 'Actually, set the timeout to 5 seconds. We should never allow long-running queries. Also, did you see that game last night? The pizza at the stadium was terrible and the parking lot was full. Anyway back to the system.' },
    { role: 'assistant', content: 'Setting it to 5 seconds. Also, always allow retries on timeout. This ensures reliability.' },
    { role: 'user', content: 'Never allow retries on timeout. It causes cascade failures. Also the system should always process them synchronously.' },
    { role: 'assistant', content: 'Got it, no retries. The system should never process them synchronously — async is safer for this workload.' },
    { role: 'user', content: 'It broke again. It is not working properly. They need to fix it before it causes more issues with them and those other things.' },
  ];

  const originalTokens = turns.reduce((s, t) => s + estimateTokens(t.content), 0);
  const budget = Math.floor(originalTokens * 0.5);

  const result = contextAwareCompress(turns, budget, {
    recentTurnCount: 2,
    stripDistractions: true,
    flagContradictions: true,
  });

  console.log(`  Input: ${turns.length} turns, ${originalTokens} tokens`);
  console.log(`  Budget: ${budget} tokens (50% of original)\n`);

  if (result.stats.failureModesDetected.length > 0) {
    console.log('  Failure modes detected:');
    for (const fm of result.stats.failureModesDetected) {
      const icon = { poisoning: 'POISON', distraction: 'TANGENT', confusion: 'VAGUE', clash: 'CLASH' }[fm.mode];
      console.log(`    [${icon}] ${fm.mode} (${fm.count} instance${fm.count > 1 ? 's' : ''}):`);
      for (const d of fm.details.slice(0, 2)) {
        console.log(`      - ${d.description}`);
      }
    }
  }

  console.log(`\n  Quality score: ${result.stats.qualityScore} (1.0 = no issues, 0.0 = severe problems)`);
  console.log(`  Tokens recovered from stripping distractions: ${result.stats.tokensRecovered}`);
  console.log(`  Final compression ratio: ${result.stats.compressionRatio}x`);
  console.log(`  Output: ${result.stats.compactedTurns} turns, ${result.stats.compactedTokens} tokens\n`);
}

// ─── Run the demo ───────────────────────────────────────────────────

function run() {
  console.log(sectionHeader('CONTEXT WINDOW OPTIMIZER'));
  console.log('\n  A production-grade context engineering toolkit.');
  console.log('  Select | Compress | Write | Isolate — the 4 moves of context engineering.\n');

  demoBPETokenizer();
  demoAttentionReordering();
  demoConversationCompaction();
  demoCacheSimulation();
  demoStrategyComparison();
  demoScratchpad();
  demoScratchpadAssembly();
  demoFailureModes();

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
    '',
    '6. The Write move: when context fills up, park findings to a scratchpad.',
    '   A compact index (table of contents) stays in-context — the agent',
    '   knows what is available at 5-10% of the full token cost.',
    '',
    '7. Failure mode detection: poisoning, distraction, confusion, and clash',
    '   degrade context quality silently. Detect and strip them before compression.',
  ].join('\n')));
}

run();
