// scratchpad.js — The "Write" move from Carbon Layer's 4 Moves of Context Engineering
// When the context window fills up, park intermediate findings to a persistent
// scratchpad instead of keeping everything in-context. The agent maintains awareness
// via a compact index (table of contents) without paying the full token cost.
//
// Key insight: a scratchpad index entry is ~20 tokens vs hundreds for the full content.
// At 50 parked findings, you trade ~10K tokens for ~1K tokens of index.

import { estimateTokens } from './tokenizer.js';

/**
 * Scratchpad — persistent storage for intermediate findings.
 *
 * When the context window is getting full, the agent writes findings here
 * instead of keeping them in-context. A compact index (from summarize())
 * stays in-context so the agent knows what is available without holding
 * the full content.
 *
 * Usage:
 *   const pad = new Scratchpad({ maxEntries: 100 });
 *   pad.write('api_schema', schemaText, { source: 'tool_result', relevance: 0.8 });
 *   pad.write('error_trace', traceText, { source: 'debug_session' });
 *   const index = pad.summarize(); // tiny — goes into context
 *   // later, when the agent needs specific data:
 *   const schema = pad.read('api_schema');
 */
export class Scratchpad {
  /**
   * @param {object} opts
   * @param {number} opts.maxEntries - Maximum entries before oldest are evicted (default 100)
   * @param {string} opts.evictionPolicy - 'lru' (default) or 'relevance' (evict lowest relevance)
   */
  constructor(opts = {}) {
    this.maxEntries = opts.maxEntries ?? 100;
    this.evictionPolicy = opts.evictionPolicy || 'lru';

    /** @type {Map<string, { content: string, tokens: number, metadata: object, createdAt: number, accessedAt: number }>} */
    this.store = new Map();

    // Running totals for stats
    this.totalTokensWritten = 0;
    this.totalTokensEvicted = 0;
    this.readCount = 0;
    this.writeCount = 0;
  }

  /**
   * Park a finding in the scratchpad.
   *
   * @param {string} key - Unique identifier for this finding
   * @param {string} content - The full text content to park
   * @param {object} metadata - Optional metadata: { source, relevance, tags }
   * @returns {{ tokensSaved: number, evicted: string|null }} Token savings and any evicted key
   */
  write(key, content, metadata = {}) {
    if (!key || typeof key !== 'string') {
      throw new Error('Scratchpad key must be a non-empty string');
    }
    if (typeof content !== 'string') {
      throw new Error('Scratchpad content must be a string');
    }

    const tokens = estimateTokens(content);
    const now = Date.now();
    let evicted = null;

    // If key already exists, update it (subtract old tokens from running total)
    if (this.store.has(key)) {
      const existing = this.store.get(key);
      this.totalTokensWritten -= existing.tokens;
    }

    // Evict if at capacity and this is a new key
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      evicted = this._evictOne();
    }

    const entry = {
      content,
      tokens,
      metadata: {
        source: metadata.source || 'unknown',
        relevance: Math.max(0, Math.min(1, metadata.relevance ?? 0.5)),
        tags: metadata.tags || [],
        ...metadata,
      },
      createdAt: now,
      accessedAt: now,
    };

    this.store.set(key, entry);
    this.totalTokensWritten += tokens;
    this.writeCount++;

    // Token savings = tokens that no longer need to be in-context.
    // The index entry for this finding costs ~20 tokens vs the full content.
    const indexEntryCost = estimateTokens(`${key}: ${content.slice(0, 50)}...`);
    const tokensSaved = Math.max(0, tokens - indexEntryCost);

    return { tokensSaved, evicted };
  }

  /**
   * Retrieve a specific finding by key.
   *
   * @param {string} key
   * @returns {{ content: string, tokens: number, metadata: object }|null}
   */
  read(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    // Update access time for LRU
    entry.accessedAt = Date.now();
    this.readCount++;

    return {
      content: entry.content,
      tokens: entry.tokens,
      metadata: entry.metadata,
    };
  }

  /**
   * Search across all parked findings by keyword.
   * Simple keyword matching — good enough for a scratchpad. Real systems
   * would use embeddings or BM25.
   *
   * @param {string} query - Space-separated keywords to match
   * @returns {Array<{ key: string, snippet: string, tokens: number, relevance: number, matchScore: number }>}
   */
  search(query) {
    if (!query || typeof query !== 'string') return [];

    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 1);
    if (keywords.length === 0) return [];

    const results = [];

    for (const [key, entry] of this.store) {
      const searchText = `${key} ${entry.content} ${(entry.metadata.tags || []).join(' ')}`.toLowerCase();

      // Count keyword matches
      let matches = 0;
      for (const kw of keywords) {
        if (searchText.includes(kw)) matches++;
      }

      if (matches > 0) {
        const matchScore = matches / keywords.length;

        // Extract a snippet around the first match
        const firstKeyword = keywords.find(kw => searchText.includes(kw));
        const idx = entry.content.toLowerCase().indexOf(firstKeyword);
        let snippet;
        if (idx >= 0) {
          const start = Math.max(0, idx - 30);
          const end = Math.min(entry.content.length, idx + 70);
          snippet = (start > 0 ? '...' : '') + entry.content.slice(start, end).trim() + (end < entry.content.length ? '...' : '');
        } else {
          snippet = entry.content.slice(0, 80).trim() + (entry.content.length > 80 ? '...' : '');
        }

        results.push({
          key,
          snippet,
          tokens: entry.tokens,
          relevance: entry.metadata.relevance,
          matchScore,
        });
      }
    }

    // Sort by match score (descending), then by relevance
    results.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return b.relevance - a.relevance;
    });

    return results;
  }

  /**
   * Generate a compact index of everything parked.
   * This index goes INTO the context window as a "table of contents"
   * so the agent knows what is available without holding the full content.
   *
   * The index is tiny compared to the parked content — that is the whole point.
   *
   * @returns {{ index: Array<{ key: string, preview: string, tokens: number, source: string, relevance: number }>, indexTokens: number, contentTokens: number, compressionRatio: number }}
   */
  summarize() {
    const index = [];
    let contentTokens = 0;

    for (const [key, entry] of this.store) {
      const preview = entry.content.slice(0, 50).replace(/\n/g, ' ').trim() +
        (entry.content.length > 50 ? '...' : '');

      index.push({
        key,
        preview,
        tokens: entry.tokens,
        source: entry.metadata.source,
        relevance: entry.metadata.relevance,
      });

      contentTokens += entry.tokens;
    }

    // Sort by relevance for the index
    index.sort((a, b) => b.relevance - a.relevance);

    // Estimate the token cost of the index itself
    const indexText = index.map(e =>
      `[${e.key}] (${e.tokens}tok, ${e.source}) ${e.preview}`
    ).join('\n');
    const indexTokens = estimateTokens(indexText) || 0;

    return {
      index,
      indexTokens,
      contentTokens,
      compressionRatio: contentTokens > 0 ? +(contentTokens / Math.max(1, indexTokens)).toFixed(1) : 0,
    };
  }

  /**
   * Format the index as a string suitable for injecting into context.
   * This is what actually goes into the context window.
   *
   * @returns {string}
   */
  formatIndex() {
    const { index } = this.summarize();
    if (index.length === 0) return '[Scratchpad: empty]';

    const lines = [`[Scratchpad: ${index.length} findings parked]`];
    for (const entry of index) {
      lines.push(`  ${entry.key} (${entry.tokens}tok) — ${entry.preview}`);
    }
    lines.push('[Use scratchpad.read(key) to retrieve full content]');
    return lines.join('\n');
  }

  /**
   * Remove a specific finding from the scratchpad.
   *
   * @param {string} key
   * @returns {boolean} True if the entry existed and was removed
   */
  evict(key) {
    const entry = this.store.get(key);
    if (!entry) return false;

    this.totalTokensEvicted += entry.tokens;
    this.store.delete(key);
    return true;
  }

  /**
   * Get scratchpad statistics.
   *
   * @returns {{ entries: number, totalTokensParked: number, totalTokensWritten: number, totalTokensEvicted: number, readCount: number, writeCount: number, indexTokens: number, compressionRatio: number }}
   */
  getStats() {
    const { indexTokens, contentTokens, compressionRatio } = this.summarize();

    return {
      entries: this.store.size,
      totalTokensParked: contentTokens,
      totalTokensWritten: this.totalTokensWritten,
      totalTokensEvicted: this.totalTokensEvicted,
      readCount: this.readCount,
      writeCount: this.writeCount,
      indexTokens,
      compressionRatio,
    };
  }

  /**
   * Evict one entry based on the eviction policy.
   * @returns {string|null} The evicted key, or null
   * @private
   */
  _evictOne() {
    if (this.store.size === 0) return null;

    let evictKey = null;

    if (this.evictionPolicy === 'relevance') {
      // Evict the entry with lowest relevance
      let lowestRelevance = Infinity;
      for (const [key, entry] of this.store) {
        if (entry.metadata.relevance < lowestRelevance) {
          lowestRelevance = entry.metadata.relevance;
          evictKey = key;
        }
      }
    } else {
      // LRU: evict the entry accessed longest ago
      let oldestAccess = Infinity;
      for (const [key, entry] of this.store) {
        if (entry.accessedAt < oldestAccess) {
          oldestAccess = entry.accessedAt;
          evictKey = key;
        }
      }
    }

    if (evictKey) {
      this.evict(evictKey);
    }

    return evictKey;
  }
}
