// cache.js — Prompt cache simulation
// Models Anthropic-style prompt caching where a static prefix (system prompt,
// few-shot examples) is cached across requests, and only the dynamic suffix
// (user query, RAG results) is re-processed each time.
//
// Real numbers: cached tokens cost 90% less than fresh tokens.
// A 2K-token system prompt across 100 requests: $0.30 fresh vs $0.03 cached.

import { estimateTokens } from './tokenizer.js';

/**
 * Pricing per 1M tokens (Anthropic Claude 3.5 Sonnet tier, as of 2024).
 * Input: $3/M tokens. Cached input: $0.30/M tokens (90% cheaper).
 * Output: $15/M tokens (not affected by caching).
 */
const PRICING = {
  inputPerMillion: 3.00,
  cachedInputPerMillion: 0.30,
  outputPerMillion: 15.00,
  cacheWritePerMillion: 3.75, // first write costs 25% more than normal input
};

/**
 * Calculate cost for a given token count at a given rate.
 */
function tokenCost(tokens, ratePerMillion) {
  return (tokens / 1_000_000) * ratePerMillion;
}

/**
 * ContextCache — tracks static prefix caching across multiple requests.
 *
 * Usage:
 *   const cache = new ContextCache(systemPrompt, examples);
 *   for (const query of queries) {
 *     const result = cache.processRequest(query, ragChunks);
 *   }
 *   console.log(cache.report());
 */
export class ContextCache {
  /**
   * @param {string} staticPrefix - The cacheable portion (system prompt + few-shot examples)
   * @param {object} opts - { model: string, ttlSeconds: number }
   */
  constructor(staticPrefix, opts = {}) {
    this.staticPrefix = staticPrefix;
    this.staticTokens = estimateTokens(staticPrefix);
    this.model = opts.model || 'claude-3.5-sonnet';
    this.ttlSeconds = opts.ttlSeconds || 300; // 5 minute cache TTL

    // Cache state
    this.cacheWarmed = false;
    this.lastAccessTime = null;
    this.cacheCreatedAt = null;

    // Tracking
    this.requests = [];
    this.totalInputTokens = 0;
    this.totalCachedTokens = 0;
    this.totalDynamicTokens = 0;
    this.totalOutputTokens = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.totalCostWithCache = 0;
    this.totalCostWithoutCache = 0;
  }

  /**
   * Check if the cache is still valid (within TTL).
   * @param {number} timestamp - Current timestamp in seconds
   * @returns {boolean}
   */
  isCacheValid(timestamp) {
    if (!this.cacheWarmed || !this.cacheCreatedAt) return false;
    return (timestamp - this.cacheCreatedAt) < this.ttlSeconds;
  }

  /**
   * Process a single request, tracking cache behavior.
   *
   * @param {string} dynamicContent - The non-cached portion (user query + RAG)
   * @param {object} opts - { estimatedOutputTokens: number, timestamp: number }
   * @returns {object} Request result with cost breakdown
   */
  processRequest(dynamicContent, opts = {}) {
    const dynamicTokens = estimateTokens(dynamicContent);
    const outputTokens = opts.estimatedOutputTokens || 500;
    const timestamp = opts.timestamp || (Date.now() / 1000);

    const requestNum = this.requests.length + 1;
    const cacheHit = this.isCacheValid(timestamp);

    // Calculate costs
    let staticCost;
    let costType;

    if (!cacheHit) {
      // Cache miss: pay cache write cost for static prefix
      staticCost = tokenCost(this.staticTokens, PRICING.cacheWritePerMillion);
      costType = 'cache_write';
      this.cacheMisses++;
      this.cacheWarmed = true;
      this.cacheCreatedAt = timestamp;
    } else {
      // Cache hit: pay reduced rate for static prefix
      staticCost = tokenCost(this.staticTokens, PRICING.cachedInputPerMillion);
      costType = 'cache_hit';
      this.cacheHits++;
    }

    const dynamicCost = tokenCost(dynamicTokens, PRICING.inputPerMillion);
    const outputCost = tokenCost(outputTokens, PRICING.outputPerMillion);
    const totalCost = staticCost + dynamicCost + outputCost;

    // Cost without caching (everything at full input price)
    const costWithoutCache = tokenCost(
      this.staticTokens + dynamicTokens,
      PRICING.inputPerMillion
    ) + outputCost;

    const savings = costWithoutCache - totalCost;

    // Track cumulative stats
    this.totalInputTokens += this.staticTokens + dynamicTokens;
    this.totalCachedTokens += cacheHit ? this.staticTokens : 0;
    this.totalDynamicTokens += dynamicTokens;
    this.totalOutputTokens += outputTokens;
    this.totalCostWithCache += totalCost;
    this.totalCostWithoutCache += costWithoutCache;
    this.lastAccessTime = timestamp;

    const result = {
      requestNum,
      cacheHit,
      costType,
      tokens: {
        static: this.staticTokens,
        dynamic: dynamicTokens,
        output: outputTokens,
        total: this.staticTokens + dynamicTokens + outputTokens,
      },
      cost: {
        static: +staticCost.toFixed(6),
        dynamic: +dynamicCost.toFixed(6),
        output: +outputCost.toFixed(6),
        total: +totalCost.toFixed(6),
        withoutCache: +costWithoutCache.toFixed(6),
        savings: +savings.toFixed(6),
      },
    };

    this.requests.push(result);
    return result;
  }

  /**
   * Get cumulative statistics across all requests.
   * @returns {object}
   */
  getStats() {
    const totalSavings = this.totalCostWithoutCache - this.totalCostWithCache;
    const savingsPercent = this.totalCostWithoutCache > 0
      ? +((totalSavings / this.totalCostWithoutCache) * 100).toFixed(1)
      : 0;

    return {
      requestCount: this.requests.length,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      hitRate: this.requests.length > 0
        ? +((this.cacheHits / this.requests.length) * 100).toFixed(1)
        : 0,
      staticPrefixTokens: this.staticTokens,
      totalInputTokens: this.totalInputTokens,
      totalCachedTokens: this.totalCachedTokens,
      totalOutputTokens: this.totalOutputTokens,
      costWithCache: +this.totalCostWithCache.toFixed(6),
      costWithoutCache: +this.totalCostWithoutCache.toFixed(6),
      totalSavings: +totalSavings.toFixed(6),
      savingsPercent,
    };
  }

  /**
   * Generate a human-readable report of cache performance.
   * @returns {string}
   */
  report() {
    const stats = this.getStats();
    const lines = [];

    lines.push(`Prompt Cache Report (${this.model})`);
    lines.push(`${'='.repeat(50)}`);
    lines.push(`Static prefix: ${stats.staticPrefixTokens} tokens (cached)`);
    lines.push(`Requests: ${stats.requestCount}`);
    lines.push(`Cache hits: ${stats.cacheHits}/${stats.requestCount} (${stats.hitRate}%)`);
    lines.push('');
    lines.push('Per-request breakdown:');

    for (const req of this.requests) {
      const status = req.cacheHit ? 'HIT ' : 'MISS';
      lines.push(
        `  Request ${req.requestNum}: [${status}] ` +
        `${req.tokens.static}+${req.tokens.dynamic} tokens, ` +
        `$${req.cost.total.toFixed(4)} ` +
        `(saved $${req.cost.savings.toFixed(4)})`
      );
    }

    lines.push('');
    lines.push('Totals:');
    lines.push(`  Cost with caching:    $${stats.costWithCache.toFixed(4)}`);
    lines.push(`  Cost without caching: $${stats.costWithoutCache.toFixed(4)}`);
    lines.push(`  Total savings:        $${stats.totalSavings.toFixed(4)} (${stats.savingsPercent}%)`);

    return lines.join('\n');
  }
}

/**
 * Simulate a session of multiple requests to demonstrate cache economics.
 *
 * @param {string} staticPrefix - System prompt + examples
 * @param {Array<string>} dynamicQueries - Series of user queries
 * @param {object} opts - { outputTokensPerRequest: number, interRequestDelayMs: number }
 * @returns {{ requests: Array, stats: object, report: string }}
 */
export function simulateSession(staticPrefix, dynamicQueries, opts = {}) {
  const outputTokens = opts.outputTokensPerRequest || 500;
  const delayMs = opts.interRequestDelayMs || 1000; // 1 second between requests

  const cache = new ContextCache(staticPrefix, {
    ttlSeconds: opts.ttlSeconds || 300,
  });

  const baseTime = Date.now() / 1000;

  for (let i = 0; i < dynamicQueries.length; i++) {
    const timestamp = baseTime + (i * delayMs / 1000);
    cache.processRequest(dynamicQueries[i], {
      estimatedOutputTokens: outputTokens,
      timestamp,
    });
  }

  return {
    requests: cache.requests,
    stats: cache.getStats(),
    report: cache.report(),
  };
}
