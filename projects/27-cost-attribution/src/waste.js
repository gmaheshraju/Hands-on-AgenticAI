export class WasteDetector {
  constructor(collector) {
    this.collector = collector;
    this.patterns = [];
  }

  analyze(filters = {}) {
    const events = this.collector.query(filters);
    this.patterns = [];

    this._detectOverpoweredModels(events);
    this._detectDuplicateRequests(events);
    this._detectRetryWaste(events);
    this._detectLowCacheHitRate(events);
    this._detectHighFailureRate(events);
    this._detectIdleAgents(events);

    return this.patterns.sort((a, b) => b.savingsUsd - a.savingsUsd);
  }

  _detectOverpoweredModels(events) {
    const premium = ['claude-opus-4', 'gpt-4o'];
    const premiumSimple = events.filter(e =>
      premium.includes(e.model) && e.inputTokens < 500 && e.outputTokens < 200
    );

    if (premiumSimple.length > 0) {
      const wastedCost = premiumSimple.reduce((s, e) => s + e.costUsd * 0.85, 0);
      this.patterns.push({
        pattern: 'overpowered_model',
        description: 'Premium models used for simple tasks (< 500 input tokens)',
        count: premiumSimple.length,
        savingsUsd: Math.round(wastedCost * 10000) / 10000,
        recommendation: 'Route simple tasks to Haiku or GPT-4o-mini — same quality at 85% less cost',
        examples: premiumSimple.slice(0, 3).map(e => ({ agentId: e.agentId, model: e.model, tokens: e.inputTokens + e.outputTokens })),
      });
    }
  }

  _detectDuplicateRequests(events) {
    const seen = new Map();
    let count = 0, wastedCost = 0;

    for (const e of events) {
      const key = `${e.agentId}:${e.model}:${e.inputTokens}`;
      const prev = seen.get(key);
      if (prev && e.timestamp - prev.timestamp < 60000) {
        count++;
        wastedCost += e.costUsd;
      }
      seen.set(key, e);
    }

    if (count > 0) {
      this.patterns.push({
        pattern: 'duplicate_requests',
        description: 'Near-identical requests within 60 seconds',
        count,
        savingsUsd: Math.round(wastedCost * 10000) / 10000,
        recommendation: 'Enable semantic caching — hash prompts and return cached responses for duplicates',
      });
    }
  }

  _detectRetryWaste(events) {
    const byTask = {};
    for (const e of events) {
      if (!e.taskId) continue;
      if (!byTask[e.taskId]) byTask[e.taskId] = [];
      byTask[e.taskId].push(e);
    }

    let retryCount = 0, retryCost = 0;
    for (const [taskId, taskEvents] of Object.entries(byTask)) {
      const failures = taskEvents.filter(e => e.outcome === 'failure');
      if (failures.length > 1) {
        retryCount += failures.length - 1;
        retryCost += failures.slice(1).reduce((s, e) => s + e.costUsd, 0);
      }
    }

    if (retryCount > 0) {
      this.patterns.push({
        pattern: 'excessive_retries',
        description: 'Multiple failures per task — wasted tokens on doomed retries',
        count: retryCount,
        savingsUsd: Math.round(retryCost * 10000) / 10000,
        recommendation: 'Add early-exit logic: if first retry fails with same error class, stop retrying',
      });
    }
  }

  _detectLowCacheHitRate(events) {
    const total = events.length;
    const cached = events.filter(e => e.cached).length;
    const hitRate = total > 0 ? cached / total : 0;

    if (total > 10 && hitRate < 0.1) {
      const potentialSavings = events.reduce((s, e) => s + e.costUsd, 0) * 0.15;
      this.patterns.push({
        pattern: 'low_cache_hit_rate',
        description: `Cache hit rate is ${Math.round(hitRate * 100)}% — most requests are cold`,
        count: total - cached,
        savingsUsd: Math.round(potentialSavings * 10000) / 10000,
        recommendation: 'Enable prompt caching for repeated system prompts and common query patterns',
      });
    }
  }

  _detectHighFailureRate(events) {
    const byAgent = {};
    for (const e of events) {
      if (!byAgent[e.agentId]) byAgent[e.agentId] = { total: 0, failures: 0, cost: 0 };
      byAgent[e.agentId].total++;
      if (e.outcome === 'failure') {
        byAgent[e.agentId].failures++;
        byAgent[e.agentId].cost += e.costUsd;
      }
    }

    for (const [agentId, data] of Object.entries(byAgent)) {
      const failRate = data.total > 5 ? data.failures / data.total : 0;
      if (failRate > 0.3) {
        this.patterns.push({
          pattern: 'high_failure_rate',
          description: `Agent ${agentId} has ${Math.round(failRate * 100)}% failure rate`,
          count: data.failures,
          savingsUsd: Math.round(data.cost * 10000) / 10000,
          recommendation: `Investigate ${agentId} — high failure rate wastes tokens on no-value completions`,
        });
      }
    }
  }

  _detectIdleAgents(events) {
    const byAgent = {};
    for (const e of events) {
      if (!byAgent[e.agentId]) byAgent[e.agentId] = { last: 0, totalCost: 0 };
      byAgent[e.agentId].last = Math.max(byAgent[e.agentId].last, e.timestamp);
      byAgent[e.agentId].totalCost += e.costUsd;
    }

    const hourAgo = Date.now() - 3600000;
    for (const [agentId, data] of Object.entries(byAgent)) {
      if (data.last < hourAgo && data.totalCost > 0.01) {
        this.patterns.push({
          pattern: 'idle_agent',
          description: `Agent ${agentId} last active ${Math.round((Date.now() - data.last) / 60000)} min ago but still provisioned`,
          count: 1,
          savingsUsd: 0,
          recommendation: `Consider deprovisioning ${agentId} — idle agents still consume resources`,
        });
      }
    }
  }
}
