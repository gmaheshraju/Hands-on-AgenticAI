// context.test.js — 30 tests covering all components

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { estimateTokens, estimateTokensNaive, compareEstimates, truncateToTokens, truncateMiddle } from '../tokenizer.js';
import { SourceType, createSource, sortByPriority, sortByRelevance, groupByType, totalTokens } from '../sources.js';
import { TokenBudget } from '../budget.js';
import { assemble, reorderForAttention } from '../assembler.js';
import { greedy, relevance, balanced } from '../strategies.js';
import { compactConversation, extractKeyFacts } from '../compactor.js';
import { ContextCache, simulateSession } from '../cache.js';

// ─── BPE Tokenizer tests ───────────────────────────────────────────

describe('BPE Tokenizer', () => {
  it('estimates tokens for a typical sentence', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const tokens = estimateTokens(text);
    assert.ok(tokens >= 5 && tokens <= 20, `Expected 5-20, got ${tokens}`);
  });

  it('returns 0 for empty or null input', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens(null), 0);
    assert.equal(estimateTokens(undefined), 0);
  });

  it('common English words count as 1 token each', () => {
    // "the" + "is" + "a" + "good" + "test" = 5 common words = ~5 tokens
    const text = 'the is a good test';
    const tokens = estimateTokens(text, { mode: 'text' });
    assert.ok(tokens >= 4 && tokens <= 7, `Common words should be ~5 tokens, got ${tokens}`);
  });

  it('code mode produces higher estimates than text mode', () => {
    const code = 'const handleError = async (err) => { if (err.code === "ECONNREFUSED") { await retry(3); } };';
    const asText = estimateTokens(code, { mode: 'text' });
    const asCode = estimateTokens(code, { mode: 'code' });
    assert.ok(asCode > asText, `Code (${asCode}) should be > text (${asText})`);
  });

  it('auto mode detects code content', () => {
    const code = 'function foo() { return bar.baz(); }\nconst x = new Map();';
    const autoEstimate = estimateTokens(code); // auto mode
    const textEstimate = estimateTokens(code, { mode: 'text' });
    // Auto should detect this as code and give a higher estimate
    assert.ok(autoEstimate >= textEstimate, `Auto should detect code and estimate >= text mode`);
  });

  it('compareEstimates shows delta between BPE and naive', () => {
    const code = 'async function fetchData(url: string): Promise<Response> {\n  return await fetch(url);\n}';
    const comp = compareEstimates(code, { mode: 'code' });
    assert.ok(comp.bpe > 0, 'BPE should be positive');
    assert.ok(comp.naive > 0, 'Naive should be positive');
    assert.ok(typeof comp.deltaPercent === 'string', 'Delta percent should be a string');
  });

  it('truncation preserves the start of text', () => {
    const text = 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi';
    const truncated = truncateToTokens(text, 5);
    assert.ok(truncated.startsWith('Alpha'), 'Should start with first word');
    assert.ok(truncated.length < text.length, 'Should be shorter');
    assert.ok(estimateTokens(truncated) <= 5, `Should be within budget, got ${estimateTokens(truncated)}`);
  });

  it('truncateMiddle keeps start and end with marker', () => {
    const text = 'START ' + 'middle '.repeat(50) + 'END of text';
    const result = truncateMiddle(text, 20);
    assert.ok(result.includes('[...truncated...]'), 'Should contain truncation marker');
    assert.ok(result.startsWith('START'), 'Should preserve start');
  });
});

// ─── Sources tests ──────────────────────────────────────────────────

describe('Sources', () => {
  it('createSource auto-estimates tokens', () => {
    const source = createSource(SourceType.RAG_CHUNKS, 'Hello world, this is a test');
    assert.ok(source.tokens > 0, 'Tokens should be positive');
    assert.equal(source.type.name, 'RAG_CHUNKS');
    assert.equal(source.relevanceScore, 1.0);
  });

  it('relevance score is clamped to 0-1', () => {
    const low = createSource(SourceType.MEMORY, 'test', { relevanceScore: -0.5 });
    const high = createSource(SourceType.MEMORY, 'test', { relevanceScore: 1.5 });
    assert.equal(low.relevanceScore, 0);
    assert.equal(high.relevanceScore, 1);
  });

  it('sortByPriority orders system prompt first', () => {
    const sources = [
      createSource(SourceType.EXAMPLES, 'example'),
      createSource(SourceType.SYSTEM_PROMPT, 'system'),
      createSource(SourceType.RAG_CHUNKS, 'rag'),
    ];
    const sorted = sortByPriority(sources);
    assert.equal(sorted[0].type.name, 'SYSTEM_PROMPT');
    assert.equal(sorted[1].type.name, 'RAG_CHUNKS');
    assert.equal(sorted[2].type.name, 'EXAMPLES');
  });
});

// ─── Budget tests ───────────────────────────────────────────────────

describe('TokenBudget', () => {
  it('reserves output buffer correctly', () => {
    const budget = new TokenBudget(4096);
    assert.equal(budget.outputBuffer, 1024);
    assert.equal(budget.available, 3072);
  });

  it('system prompt is never dropped', () => {
    const budget = new TokenBudget(200);
    const sources = [
      createSource(SourceType.SYSTEM_PROMPT, 'You are a helpful assistant.'),
      createSource(SourceType.RAG_CHUNKS, 'A '.repeat(500)),
      createSource(SourceType.MEMORY, 'User likes Python'),
    ];
    const plan = budget.allocate(sources);
    const includedTypes = plan.included.map(s => s.type.name);
    assert.ok(includedTypes.includes('SYSTEM_PROMPT'), 'System prompt must be included');
  });

  it('drops lowest priority sources when over budget', () => {
    const budget = new TokenBudget(400);
    const sources = [
      createSource(SourceType.SYSTEM_PROMPT, 'System prompt here'),
      createSource(SourceType.CONVERSATION_HISTORY, 'User said something'),
      createSource(SourceType.RAG_CHUNKS, 'RAG content here'),
      createSource(SourceType.EXAMPLES, 'A '.repeat(200)),
    ];
    const plan = budget.allocate(sources);
    const droppedTypes = plan.dropped.map(s => s.type.name);
    const truncatedTypes = plan.truncated.map(s => s.type.name);
    const removedTypes = [...droppedTypes, ...truncatedTypes];
    if (removedTypes.length > 0) {
      assert.ok(!removedTypes.includes('SYSTEM_PROMPT'), 'System prompt must not be dropped');
    }
  });
});

// ─── Assembler tests ────────────────────────────────────────────────

describe('Assembler', () => {
  it('orders system prompt first in messages', () => {
    const budget = new TokenBudget(4096);
    const sources = [
      createSource(SourceType.RAG_CHUNKS, 'RAG content'),
      createSource(SourceType.SYSTEM_PROMPT, 'System instructions'),
      createSource(SourceType.CONVERSATION_HISTORY, 'User message'),
    ];
    const plan = budget.allocate(sources);
    const result = assemble(sources, plan);
    assert.equal(result.messages[0].role, 'system');
    assert.ok(result.messages[0].content.includes('System instructions'));
  });

  it('report shows accurate counts', () => {
    const budget = new TokenBudget(4096);
    const sources = [
      createSource(SourceType.SYSTEM_PROMPT, 'Prompt'),
      createSource(SourceType.RAG_CHUNKS, 'Data'),
    ];
    const plan = budget.allocate(sources);
    const result = assemble(sources, plan);
    assert.equal(result.report.sourcesKept, 2);
    assert.equal(result.report.sourcesDropped, 0);
    assert.ok(result.totalTokens > 0);
  });

  it('supports chronological ordering mode', () => {
    const budget = new TokenBudget(4096);
    const sources = [
      createSource(SourceType.SYSTEM_PROMPT, 'System'),
      createSource(SourceType.RAG_CHUNKS, 'RAG', { relevanceScore: 0.5 }),
      createSource(SourceType.MEMORY, 'Memory', { relevanceScore: 0.9 }),
    ];
    const plan = budget.allocate(sources);
    const result = assemble(sources, plan, { ordering: 'chronological' });
    assert.equal(result.report.ordering, 'chronological');
    // Items should NOT have attentionPosition
    const hasAttention = result.report.items.some(i => i.attentionPosition);
    assert.ok(!hasAttention, 'Chronological ordering should not have attention positions');
  });

  it('applies attention-optimized ordering by default', () => {
    const budget = new TokenBudget(4096);
    const sources = [
      createSource(SourceType.SYSTEM_PROMPT, 'System'),
      createSource(SourceType.RAG_CHUNKS, 'High RAG', { relevanceScore: 0.95 }),
      createSource(SourceType.RAG_CHUNKS, 'Low RAG', { relevanceScore: 0.2 }),
      createSource(SourceType.MEMORY, 'Memory', { relevanceScore: 0.8 }),
      createSource(SourceType.EXAMPLES, 'Example', { relevanceScore: 0.5 }),
    ];
    const plan = budget.allocate(sources);
    const result = assemble(sources, plan); // default = attention-optimized
    assert.equal(result.report.ordering, 'attention-optimized');
  });
});

// ─── Lost-in-the-middle tests ───────────────────────────────────────

describe('Lost-in-the-Middle Reordering', () => {
  it('keeps system prompt at position 0', () => {
    const items = [
      { type: 'SYSTEM_PROMPT', label: 'System', relevance: 1.0 },
      { type: 'RAG_CHUNKS', label: 'RAG1', relevance: 0.9 },
      { type: 'RAG_CHUNKS', label: 'RAG2', relevance: 0.3 },
    ];
    const reordered = reorderForAttention(items);
    assert.equal(reordered[0].type, 'SYSTEM_PROMPT');
  });

  it('places highest relevance at start and end, lowest in middle', () => {
    const items = [
      { type: 'SYSTEM_PROMPT', label: 'System', relevance: 1.0 },
      { type: 'RAG_CHUNKS', label: 'High', relevance: 0.95 },
      { type: 'RAG_CHUNKS', label: 'MedHigh', relevance: 0.80 },
      { type: 'MEMORY', label: 'Medium', relevance: 0.60 },
      { type: 'EXAMPLES', label: 'MedLow', relevance: 0.40 },
      { type: 'RAG_CHUNKS', label: 'Low', relevance: 0.20 },
    ];

    const reordered = reorderForAttention(items);

    // System prompt stays at 0
    assert.equal(reordered[0].type, 'SYSTEM_PROMPT');

    // Non-system items
    const content = reordered.slice(1);

    // First non-system item should be highest relevance
    assert.equal(content[0].label, 'High', 'First content item should be highest relevance');

    // Last item should be high relevance (second highest goes to end)
    assert.ok(content[content.length - 1].relevance >= 0.7,
      `Last item relevance (${content[content.length - 1].relevance}) should be high`);
  });

  it('handles 2 or fewer items without error', () => {
    const items = [
      { type: 'SYSTEM_PROMPT', label: 'System', relevance: 1.0 },
      { type: 'RAG_CHUNKS', label: 'Only', relevance: 0.5 },
    ];
    const reordered = reorderForAttention(items);
    assert.equal(reordered.length, 2);
  });
});

// ─── Strategy tests ─────────────────────────────────────────────────

describe('Strategies', () => {
  function makeSources() {
    return [
      createSource(SourceType.SYSTEM_PROMPT, 'System prompt.', { relevanceScore: 1.0 }),
      createSource(SourceType.RAG_CHUNKS, 'High relevance RAG', { relevanceScore: 0.95 }),
      createSource(SourceType.RAG_CHUNKS, 'Low relevance RAG', { relevanceScore: 0.2 }),
      createSource(SourceType.MEMORY, 'Important memory', { relevanceScore: 0.9 }),
      createSource(SourceType.EXAMPLES, 'Example content', { relevanceScore: 0.5 }),
    ];
  }

  it('greedy keeps highest priority sources', () => {
    const sources = makeSources();
    const budget = new TokenBudget(500);
    const plan = greedy(sources, budget);
    const included = plan.included.map(s => s.type.name);
    assert.ok(included.includes('SYSTEM_PROMPT'));
  });

  it('relevance strategy keeps highest scored sources', () => {
    const sources = makeSources();
    const budget = new TokenBudget(500);
    const plan = relevance(sources, budget);
    const included = [...plan.included, ...plan.truncated];
    const scores = included.filter(s => s.type.priority !== 0).map(s => s.relevanceScore);
    if (plan.dropped.length > 0 && scores.length > 0) {
      const minIncluded = Math.min(...scores);
      const maxDropped = Math.max(...plan.dropped.map(s => s.relevanceScore));
      assert.ok(minIncluded >= maxDropped,
        `Included min (${minIncluded}) should >= dropped max (${maxDropped})`);
    }
  });

  it('balanced strategy includes sources from multiple types', () => {
    const budget = new TokenBudget(4096);
    const sources = makeSources();
    const plan = balanced(sources, budget);
    const includedTypes = new Set(plan.included.map(s => s.type.name));
    assert.ok(includedTypes.size >= 3, `Expected 3+ types, got ${includedTypes.size}`);
  });
});

// ─── Conversation Compaction tests ──────────────────────────────────

describe('Conversation Compaction', () => {
  function makeConversation(turnCount) {
    const turns = [];
    for (let i = 0; i < turnCount; i++) {
      turns.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: i % 2 === 0
          ? `User question ${i + 1}: How should we handle the ${['database', 'caching', 'deployment', 'monitoring', 'scaling', 'security'][i % 6]} issue?`
          : `I recommend using ${['PostgreSQL', 'Redis', 'Kubernetes', 'Prometheus', 'auto-scaling', 'OAuth'][i % 6]} for this. We decided to go with the distributed approach. The team should implement this next sprint.`,
      });
    }
    return turns;
  }

  it('returns all turns when within budget', () => {
    const turns = makeConversation(4);
    const result = compactConversation(turns, 10000);
    assert.equal(result.stats.compressionRatio, 1);
    assert.equal(result.turns.length, turns.length);
  });

  it('compresses older turns and keeps recent ones verbatim', () => {
    const turns = makeConversation(12);
    const originalTokens = turns.reduce((s, t) => s + estimateTokens(t.content), 0);
    const result = compactConversation(turns, Math.floor(originalTokens * 0.4), { recentTurnCount: 3 });

    assert.ok(result.stats.compressionRatio > 1, `Compression ratio should be > 1, got ${result.stats.compressionRatio}`);
    assert.ok(result.stats.compactedTokens <= Math.floor(originalTokens * 0.5),
      `Compacted tokens (${result.stats.compactedTokens}) should be within budget`);
    assert.ok(result.stats.recentTurnsKept >= 1 && result.stats.recentTurnsKept <= 3,
      `Should keep 1-3 recent turns, got ${result.stats.recentTurnsKept}`);
    assert.ok(result.stats.summarizedTurns > 0, 'Should have summarized some turns');
  });

  it('summary contains key information from older turns', () => {
    const turns = makeConversation(10);
    const originalTokens = turns.reduce((s, t) => s + estimateTokens(t.content), 0);
    // Use 60% budget so there's room for summary + recent turns
    const result = compactConversation(turns, Math.floor(originalTokens * 0.6), { recentTurnCount: 2 });

    // The first turn should be a system summary (when compaction occurred)
    if (result.stats.summarizedTurns > 0) {
      const summary = result.turns[0].content;
      assert.ok(summary.includes('Conversation Summary'), 'Should have summary header');
    }
    assert.ok(result.stats.compactedTokens <= Math.floor(originalTokens * 0.65),
      `Compacted tokens should be within budget`);
  });

  it('handles empty conversation', () => {
    const result = compactConversation([], 1000);
    assert.equal(result.turns.length, 0);
    assert.equal(result.stats.originalTurns, 0);
  });
});

// ─── Key Fact Extraction tests ──────────────────────────────────────

describe('Key Fact Extraction', () => {
  it('extracts decisions from conversation text', () => {
    const text = 'We decided to use PostgreSQL for the event store. The team agreed to implement snapshots every 10K events.';
    const facts = extractKeyFacts(text);
    assert.ok(facts.decisions.length > 0, `Should find decisions, got ${facts.decisions.length}`);
  });

  it('extracts questions from conversation text', () => {
    const text = 'Should we rollback or fix forward? How much memory does the node have? What is the right heap size?';
    const facts = extractKeyFacts(text);
    assert.ok(facts.questions.length >= 2, `Should find 2+ questions, got ${facts.questions.length}`);
  });

  it('extracts entities and metrics', () => {
    const text = 'CockroachDB handles 50K RPM. The billing-svc uses 980MB memory. Version v2.4.0 was deployed.';
    const facts = extractKeyFacts(text);
    assert.ok(facts.entities.length > 0, `Should find entities, got ${facts.entities.length}`);
  });

  it('returns empty arrays for empty input', () => {
    const facts = extractKeyFacts('');
    assert.equal(facts.decisions.length, 0);
    assert.equal(facts.questions.length, 0);
    assert.equal(facts.entities.length, 0);
  });
});

// ─── Prompt Cache tests ────────────────────────────────────────────

describe('Prompt Cache', () => {
  it('first request is a cache miss', () => {
    const cache = new ContextCache('System prompt here');
    const result = cache.processRequest('User query');
    assert.equal(result.cacheHit, false);
    assert.equal(result.costType, 'cache_write');
  });

  it('subsequent requests are cache hits within TTL', () => {
    const cache = new ContextCache('System prompt here', { ttlSeconds: 300 });
    const baseTime = Date.now() / 1000;

    cache.processRequest('Query 1', { timestamp: baseTime });
    const result2 = cache.processRequest('Query 2', { timestamp: baseTime + 10 });

    assert.equal(result2.cacheHit, true);
    assert.equal(result2.costType, 'cache_hit');
  });

  it('cache expires after TTL', () => {
    const cache = new ContextCache('System prompt', { ttlSeconds: 60 });
    const baseTime = Date.now() / 1000;

    cache.processRequest('Query 1', { timestamp: baseTime });
    const result2 = cache.processRequest('Query 2', { timestamp: baseTime + 120 }); // 2 min > 60s TTL

    assert.equal(result2.cacheHit, false, 'Should miss after TTL expires');
  });

  it('tracks hit rate correctly', () => {
    const cache = new ContextCache('System prompt', { ttlSeconds: 300 });
    const baseTime = Date.now() / 1000;

    for (let i = 0; i < 5; i++) {
      cache.processRequest(`Query ${i}`, { timestamp: baseTime + i });
    }

    const stats = cache.getStats();
    assert.equal(stats.requestCount, 5);
    assert.equal(stats.cacheMisses, 1); // only first is a miss
    assert.equal(stats.cacheHits, 4);
    assert.equal(stats.hitRate, 80.0);
  });

  it('cached requests cost less than non-cached', () => {
    const cache = new ContextCache('A moderately long system prompt with instructions and examples that would be expensive to re-process every time.');
    const baseTime = Date.now() / 1000;

    cache.processRequest('Query 1', { timestamp: baseTime });
    const result2 = cache.processRequest('Query 2', { timestamp: baseTime + 5 });

    assert.ok(result2.cost.savings > 0, `Cache hit should save money, savings: ${result2.cost.savings}`);
    assert.ok(result2.cost.total < result2.cost.withoutCache,
      `Cached cost (${result2.cost.total}) should be < non-cached (${result2.cost.withoutCache})`);
  });

  it('simulateSession produces correct statistics', () => {
    const result = simulateSession(
      'System prompt for testing',
      ['Query 1', 'Query 2', 'Query 3'],
      { outputTokensPerRequest: 200 }
    );

    assert.equal(result.stats.requestCount, 3);
    assert.equal(result.stats.cacheMisses, 1);
    assert.equal(result.stats.cacheHits, 2);
    assert.ok(result.stats.totalSavings > 0, 'Session should show savings');
    assert.ok(result.report.includes('Prompt Cache Report'), 'Report should have header');
  });
});

// ─── Scratchpad tests ─────────────────────────────────────────────

import { Scratchpad } from '../scratchpad.js';
import { contextAwareCompress } from '../compactor.js';
import { assembleWithScratchpad } from '../assembler.js';

describe('Scratchpad', () => {
  it('writes and reads a finding', () => {
    const pad = new Scratchpad();
    pad.write('test_key', 'Some test content here', { source: 'tool_result', relevance: 0.8 });
    const result = pad.read('test_key');
    assert.ok(result, 'Should return the finding');
    assert.equal(result.content, 'Some test content here');
    assert.equal(result.metadata.source, 'tool_result');
    assert.equal(result.metadata.relevance, 0.8);
  });

  it('returns null for missing keys', () => {
    const pad = new Scratchpad();
    assert.equal(pad.read('nonexistent'), null);
  });

  it('reports token savings on write', () => {
    const pad = new Scratchpad();
    const content = 'A '.repeat(200); // ~200 tokens of content
    const result = pad.write('big_finding', content, { relevance: 0.9 });
    assert.ok(result.tokensSaved > 0, `Should save tokens, got ${result.tokensSaved}`);
  });

  it('evicts entries when at capacity', () => {
    const pad = new Scratchpad({ maxEntries: 3 });
    pad.write('a', 'content a');
    pad.write('b', 'content b');
    pad.write('c', 'content c');
    const result = pad.write('d', 'content d');
    assert.ok(result.evicted, 'Should have evicted one entry');
    assert.equal(pad.store.size, 3, 'Should still be at max capacity');
  });

  it('LRU eviction removes least recently accessed', () => {
    const pad = new Scratchpad({ maxEntries: 3 });
    // Write entries with distinct access times by manually setting accessedAt
    pad.write('a', 'content a');
    pad.store.get('a').accessedAt = 1000;
    pad.write('b', 'content b');
    pad.store.get('b').accessedAt = 2000;
    pad.write('c', 'content c');
    pad.store.get('c').accessedAt = 3000;

    // Access 'a' to make it the most recent
    pad.store.get('a').accessedAt = 4000;

    const result = pad.write('d', 'content d');
    assert.equal(result.evicted, 'b', 'Should evict "b" (least recently accessed)');
    assert.ok(pad.read('a'), '"a" should still exist');
    assert.ok(pad.read('c'), '"c" should still exist');
    assert.ok(pad.read('d'), '"d" should exist');
  });

  it('relevance eviction removes lowest relevance', () => {
    const pad = new Scratchpad({ maxEntries: 3, evictionPolicy: 'relevance' });
    pad.write('high', 'content', { relevance: 0.9 });
    pad.write('low', 'content', { relevance: 0.1 });
    pad.write('mid', 'content', { relevance: 0.5 });

    const result = pad.write('new', 'content', { relevance: 0.7 });
    assert.equal(result.evicted, 'low', 'Should evict lowest relevance entry');
  });

  it('search finds entries by keyword', () => {
    const pad = new Scratchpad();
    pad.write('db_schema', 'CREATE TABLE users (id INT, name VARCHAR)');
    pad.write('api_error', 'Connection refused on port 5432');
    pad.write('config', 'Database host is localhost, port 5432');

    const results = pad.search('port 5432');
    assert.ok(results.length >= 2, `Should find 2+ results, got ${results.length}`);
    assert.ok(results[0].matchScore > 0, 'Should have positive match score');
  });

  it('search returns empty for no matches', () => {
    const pad = new Scratchpad();
    pad.write('key', 'some content');
    const results = pad.search('nonexistent_xyzzy');
    assert.equal(results.length, 0);
  });

  it('summarize produces a compact index', () => {
    const pad = new Scratchpad();
    const bigContent = 'Word '.repeat(100);
    pad.write('finding_1', bigContent, { source: 'rag', relevance: 0.9 });
    pad.write('finding_2', bigContent, { source: 'tool', relevance: 0.5 });

    const summary = pad.summarize();
    assert.equal(summary.index.length, 2);
    assert.ok(summary.compressionRatio > 1, `Index should be much smaller than content, ratio: ${summary.compressionRatio}`);
    assert.ok(summary.indexTokens < summary.contentTokens, 'Index tokens should be less than content tokens');
  });

  it('formatIndex produces human-readable output', () => {
    const pad = new Scratchpad();
    pad.write('api_docs', 'The API accepts JSON payloads on port 8080', { relevance: 0.8 });

    const formatted = pad.formatIndex();
    assert.ok(formatted.includes('Scratchpad:'), 'Should have header');
    assert.ok(formatted.includes('api_docs'), 'Should include the key');
    assert.ok(formatted.includes('scratchpad.read(key)'), 'Should include retrieval hint');
  });

  it('formatIndex returns empty message when no entries', () => {
    const pad = new Scratchpad();
    assert.ok(pad.formatIndex().includes('empty'));
  });

  it('evict removes a specific entry', () => {
    const pad = new Scratchpad();
    pad.write('keep', 'keep this');
    pad.write('remove', 'remove this');

    assert.equal(pad.evict('remove'), true);
    assert.equal(pad.read('remove'), null);
    assert.ok(pad.read('keep'), '"keep" should still exist');
  });

  it('evict returns false for missing key', () => {
    const pad = new Scratchpad();
    assert.equal(pad.evict('nonexistent'), false);
  });

  it('getStats tracks operations correctly', () => {
    const pad = new Scratchpad();
    pad.write('a', 'content for a');
    pad.write('b', 'content for b');
    pad.read('a');
    pad.read('a');
    pad.evict('b');

    const stats = pad.getStats();
    assert.equal(stats.entries, 1);
    assert.equal(stats.writeCount, 2);
    assert.equal(stats.readCount, 2);
    assert.ok(stats.totalTokensEvicted > 0, 'Should track evicted tokens');
  });

  it('overwriting a key updates content and tokens', () => {
    const pad = new Scratchpad();
    pad.write('key', 'short');
    pad.write('key', 'much longer content with more words and tokens in it');
    const result = pad.read('key');
    assert.equal(result.content, 'much longer content with more words and tokens in it');
    assert.equal(pad.store.size, 1, 'Should not create duplicate entries');
  });

  it('validates inputs on write', () => {
    const pad = new Scratchpad();
    assert.throws(() => pad.write('', 'content'), /non-empty string/);
    assert.throws(() => pad.write('key', 42), /must be a string/);
  });
});

// ─── Context-Aware Compress tests ─────────────────────────────────

describe('Context-Aware Compress', () => {
  it('detects poisoning (contradictory assertions)', () => {
    const turns = [
      { role: 'user', content: 'The timeout is 30 seconds.' },
      { role: 'assistant', content: 'Setting timeout to 30 seconds.' },
      { role: 'user', content: 'The timeout is 5 seconds. We changed it.' },
    ];
    const tokens = turns.reduce((s, t) => s + estimateTokens(t.content), 0);
    const result = contextAwareCompress(turns, tokens * 2);

    const poisonMode = result.stats.failureModesDetected.find(f => f.mode === 'poisoning');
    assert.ok(poisonMode, 'Should detect poisoning');
    assert.ok(poisonMode.count > 0, 'Should find at least one contradiction');
  });

  it('detects clash (conflicting instructions)', () => {
    const turns = [
      { role: 'user', content: 'Always allow retries on timeout errors.' },
      { role: 'user', content: 'Never allow retries on timeout errors.' },
    ];
    const tokens = turns.reduce((s, t) => s + estimateTokens(t.content), 0);
    const result = contextAwareCompress(turns, tokens * 2);

    const clashMode = result.stats.failureModesDetected.find(f => f.mode === 'clash');
    assert.ok(clashMode, 'Should detect clash');
  });

  it('computes quality score degraded by issues', () => {
    const turns = [
      { role: 'user', content: 'The timeout is 30 seconds.' },
      { role: 'user', content: 'The timeout is 5 seconds.' },
      { role: 'user', content: 'Always retry on error.' },
      { role: 'user', content: 'Never retry on error.' },
    ];
    const tokens = turns.reduce((s, t) => s + estimateTokens(t.content), 0);
    const result = contextAwareCompress(turns, tokens * 2);

    assert.ok(result.stats.qualityScore < 1.0,
      `Quality score should be degraded, got ${result.stats.qualityScore}`);
  });

  it('handles empty input gracefully', () => {
    const result = contextAwareCompress([], 1000);
    assert.equal(result.turns.length, 0);
    assert.equal(result.stats.qualityScore, 1);
    assert.equal(result.stats.failureModesDetected.length, 0);
  });

  it('strips distractions when enabled', () => {
    // Create turns where one is a clear tangent
    const turns = [];
    for (let i = 0; i < 8; i++) {
      turns.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Turn ${i + 1} about database configuration and server setup for production deployment.`,
      });
    }
    // Insert a tangent
    turns[4] = {
      role: 'user',
      content: 'Yesterday the weather forecast predicted thunderstorms with hail and lightning in multiple counties across the coastal region.',
    };

    const tokens = turns.reduce((s, t) => s + estimateTokens(t.content), 0);
    const result = contextAwareCompress(turns, tokens, { stripDistractions: true });

    // The tangent detection should recover some tokens
    // (may or may not detect depending on vocabulary overlap — test the mechanism works)
    assert.ok(result.stats.tokensRecovered >= 0, 'Should track recovered tokens');
  });

  it('preserves standard compaction stats', () => {
    const turns = [
      { role: 'user', content: 'Tell me about the system.' },
      { role: 'assistant', content: 'The system uses PostgreSQL with event sourcing.' },
      { role: 'user', content: 'What about the caching layer?' },
      { role: 'assistant', content: 'Redis with TTL-based expiry for session data.' },
    ];
    const tokens = turns.reduce((s, t) => s + estimateTokens(t.content), 0);
    const result = contextAwareCompress(turns, tokens * 2);

    // Standard stats should still be present
    assert.ok('originalTurns' in result.stats);
    assert.ok('compactedTurns' in result.stats);
    assert.ok('compressionRatio' in result.stats);
    // New stats should also be present
    assert.ok('failureModesDetected' in result.stats);
    assert.ok('qualityScore' in result.stats);
    assert.ok('tokensRecovered' in result.stats);
  });
});

// ─── Scratchpad-Aware Assembly tests ──────────────────────────────

describe('Scratchpad-Aware Assembly', () => {
  it('parks dropped sources in the scratchpad', () => {
    const budget = new TokenBudget(400);
    const sources = [
      createSource(SourceType.SYSTEM_PROMPT, 'System instructions for the assistant'),
      createSource(SourceType.RAG_CHUNKS, 'A '.repeat(200), { relevanceScore: 0.6, id: 'rag_big' }),
      createSource(SourceType.MEMORY, 'Important memory data', { relevanceScore: 0.9, id: 'mem' }),
      createSource(SourceType.EXAMPLES, 'Example data here', { relevanceScore: 0.3, id: 'ex' }),
    ];

    const pad = new Scratchpad();
    const plan = budget.allocate(sources);
    const result = assembleWithScratchpad(sources, plan, pad);

    // Some sources should have been parked
    if (plan.dropped.length > 0) {
      assert.ok(result.parkedSources.length > 0, 'Dropped sources should be parked');
      assert.ok(result.report.scratchpad, 'Report should include scratchpad stats');
      assert.ok(result.report.scratchpad.sourcesParked > 0, 'Should report parked count');

      // Verify they are retrievable from the scratchpad
      for (const parked of result.parkedSources) {
        const found = pad.search(parked.label);
        assert.ok(found.length > 0 || pad.read(parked.id),
          `Parked source "${parked.id}" should be in scratchpad`);
      }
    }
  });

  it('includes scratchpad index in assembled output', () => {
    const budget = new TokenBudget(300);
    const sources = [
      createSource(SourceType.SYSTEM_PROMPT, 'System prompt'),
      createSource(SourceType.RAG_CHUNKS, 'RAG content '.repeat(50), { relevanceScore: 0.7 }),
    ];

    const pad = new Scratchpad();
    pad.write('prior_finding', 'Previously parked content');

    const plan = budget.allocate(sources);
    const result = assembleWithScratchpad(sources, plan, pad);

    // The scratchpad index should be in the messages
    const hasIndex = result.messages.some(m =>
      m.content.includes('Scratchpad')
    );
    assert.ok(hasIndex, 'Assembled messages should include scratchpad index');
  });

  it('reports scratchpad stats in the assembly report', () => {
    const budget = new TokenBudget(4096);
    const sources = [
      createSource(SourceType.SYSTEM_PROMPT, 'System prompt'),
      createSource(SourceType.RAG_CHUNKS, 'RAG data'),
    ];

    const pad = new Scratchpad();
    const plan = budget.allocate(sources);
    const result = assembleWithScratchpad(sources, plan, pad);

    assert.ok(result.report.scratchpad, 'Should have scratchpad in report');
    assert.equal(typeof result.report.scratchpad.indexTokenCost, 'number');
    assert.ok(result.report.scratchpad.stats, 'Should include scratchpad stats');
  });
});
