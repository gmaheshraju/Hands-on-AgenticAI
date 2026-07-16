export class TokenBucketLimiter {
  constructor(config = {}) {
    this.buckets = new Map();
    this.defaultConfig = {
      tokensPerMinute: config.tokensPerMinute || 100000,
      requestsPerMinute: config.requestsPerMinute || 60,
      burstMultiplier: config.burstMultiplier || 1.5,
    };
    this.teamConfigs = new Map();
  }

  setTeamLimit(teamId, config) {
    this.teamConfigs.set(teamId, { ...this.defaultConfig, ...config });
  }

  _getBucket(teamId) {
    if (!this.buckets.has(teamId)) {
      const config = this.teamConfigs.get(teamId) || this.defaultConfig;
      this.buckets.set(teamId, {
        tokens: config.tokensPerMinute * config.burstMultiplier,
        requests: config.requestsPerMinute * config.burstMultiplier,
        maxTokens: config.tokensPerMinute * config.burstMultiplier,
        maxRequests: config.requestsPerMinute * config.burstMultiplier,
        tokenRefillRate: config.tokensPerMinute / 60000,
        requestRefillRate: config.requestsPerMinute / 60000,
        lastRefill: Date.now(),
      });
    }
    return this.buckets.get(teamId);
  }

  _refill(bucket) {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + elapsed * bucket.tokenRefillRate);
    bucket.requests = Math.min(bucket.maxRequests, bucket.requests + elapsed * bucket.requestRefillRate);
    bucket.lastRefill = now;
  }

  check(teamId, estimatedTokens = 1000) {
    const bucket = this._getBucket(teamId);
    this._refill(bucket);

    if (bucket.requests < 1) {
      const waitMs = Math.ceil((1 - bucket.requests) / bucket.requestRefillRate);
      return { allowed: false, reason: 'request_limit', retryAfterMs: waitMs, remaining: { tokens: Math.floor(bucket.tokens), requests: Math.floor(bucket.requests) } };
    }
    if (bucket.tokens < estimatedTokens) {
      const waitMs = Math.ceil((estimatedTokens - bucket.tokens) / bucket.tokenRefillRate);
      return { allowed: false, reason: 'token_limit', retryAfterMs: waitMs, remaining: { tokens: Math.floor(bucket.tokens), requests: Math.floor(bucket.requests) } };
    }

    return { allowed: true, remaining: { tokens: Math.floor(bucket.tokens), requests: Math.floor(bucket.requests) } };
  }

  consume(teamId, tokensUsed) {
    const bucket = this._getBucket(teamId);
    bucket.tokens -= tokensUsed;
    bucket.requests -= 1;
  }

  status(teamId) {
    const bucket = this._getBucket(teamId);
    this._refill(bucket);
    const config = this.teamConfigs.get(teamId) || this.defaultConfig;
    return {
      teamId,
      tokens: { remaining: Math.floor(bucket.tokens), limit: config.tokensPerMinute, utilizationPct: Math.round((1 - bucket.tokens / bucket.maxTokens) * 100) },
      requests: { remaining: Math.floor(bucket.requests), limit: config.requestsPerMinute, utilizationPct: Math.round((1 - bucket.requests / bucket.maxRequests) * 100) },
    };
  }
}
