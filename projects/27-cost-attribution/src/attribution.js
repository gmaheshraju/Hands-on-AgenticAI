export class CostAttribution {
  constructor(collector) {
    this.collector = collector;
  }

  byAgent(filters = {}) {
    const events = this.collector.query(filters);
    const agents = {};

    for (const e of events) {
      if (!agents[e.agentId]) {
        agents[e.agentId] = { agentId: e.agentId, totalCost: 0, requests: 0, tokens: 0, outcomes: { success: 0, failure: 0, partial: 0 } };
      }
      const a = agents[e.agentId];
      a.totalCost += e.costUsd;
      a.requests++;
      a.tokens += e.inputTokens + e.outputTokens;
      if (e.outcome) a.outcomes[e.outcome]++;
    }

    return Object.values(agents).map(a => ({
      ...a,
      totalCost: Math.round(a.totalCost * 10000) / 10000,
      avgCostPerRequest: a.requests > 0 ? Math.round((a.totalCost / a.requests) * 10000) / 10000 : 0,
      successRate: a.outcomes.success + a.outcomes.failure > 0
        ? Math.round((a.outcomes.success / (a.outcomes.success + a.outcomes.failure)) * 100) : 0,
    })).sort((a, b) => b.totalCost - a.totalCost);
  }

  byTeam(filters = {}) {
    const events = this.collector.query(filters);
    const teams = {};

    for (const e of events) {
      if (!teams[e.teamId]) {
        teams[e.teamId] = { teamId: e.teamId, totalCost: 0, requests: 0, agents: new Set(), models: {} };
      }
      const t = teams[e.teamId];
      t.totalCost += e.costUsd;
      t.requests++;
      t.agents.add(e.agentId);
      if (!t.models[e.model]) t.models[e.model] = { cost: 0, requests: 0 };
      t.models[e.model].cost += e.costUsd;
      t.models[e.model].requests++;
    }

    return Object.values(teams).map(t => ({
      teamId: t.teamId,
      totalCost: Math.round(t.totalCost * 10000) / 10000,
      requests: t.requests,
      uniqueAgents: t.agents.size,
      modelBreakdown: Object.fromEntries(
        Object.entries(t.models).map(([m, d]) => [m, { cost: Math.round(d.cost * 10000) / 10000, requests: d.requests }])
      ),
    })).sort((a, b) => b.totalCost - a.totalCost);
  }

  byTaskType(filters = {}) {
    const events = this.collector.query(filters);
    const types = {};

    for (const e of events) {
      const type = e.taskType || 'unknown';
      if (!types[type]) {
        types[type] = { taskType: type, totalCost: 0, requests: 0, successes: 0, failures: 0, totalLatency: 0 };
      }
      const t = types[type];
      t.totalCost += e.costUsd;
      t.requests++;
      t.totalLatency += e.latencyMs;
      if (e.outcome === 'success') t.successes++;
      if (e.outcome === 'failure') t.failures++;
    }

    return Object.values(types).map(t => ({
      ...t,
      totalCost: Math.round(t.totalCost * 10000) / 10000,
      costPerSuccess: t.successes > 0 ? Math.round((t.totalCost / t.successes) * 10000) / 10000 : null,
      avgLatencyMs: t.requests > 0 ? Math.round(t.totalLatency / t.requests) : 0,
      successRate: t.successes + t.failures > 0
        ? Math.round((t.successes / (t.successes + t.failures)) * 100) : 0,
    })).sort((a, b) => b.totalCost - a.totalCost);
  }

  byModel(filters = {}) {
    const events = this.collector.query(filters);
    const models = {};

    for (const e of events) {
      if (!models[e.model]) {
        models[e.model] = { model: e.model, totalCost: 0, requests: 0, inputTokens: 0, outputTokens: 0, cachedRequests: 0 };
      }
      const m = models[e.model];
      m.totalCost += e.costUsd;
      m.requests++;
      m.inputTokens += e.inputTokens;
      m.outputTokens += e.outputTokens;
      if (e.cached) m.cachedRequests++;
    }

    return Object.values(models).map(m => ({
      ...m,
      totalCost: Math.round(m.totalCost * 10000) / 10000,
      avgCostPerRequest: m.requests > 0 ? Math.round((m.totalCost / m.requests) * 10000) / 10000 : 0,
      cacheHitRate: m.requests > 0 ? Math.round((m.cachedRequests / m.requests) * 100) : 0,
    })).sort((a, b) => b.totalCost - a.totalCost);
  }
}
