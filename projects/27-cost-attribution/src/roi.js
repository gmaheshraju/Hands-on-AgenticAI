export class ROICalculator {
  constructor(collector) {
    this.collector = collector;
    this.valueMetrics = new Map();
  }

  setOutcomeValue(taskType, valueFn) {
    this.valueMetrics.set(taskType, valueFn);
  }

  agentROI(agentId, filters = {}) {
    const events = this.collector.query({ ...filters, agentId });
    if (events.length === 0) return null;

    let totalCost = 0, totalValue = 0, successCount = 0, totalRequests = 0;

    for (const e of events) {
      totalCost += e.costUsd;
      totalRequests++;
      if (e.outcome === 'success') {
        successCount++;
        const valueFn = this.valueMetrics.get(e.taskType);
        if (valueFn) {
          totalValue += valueFn(e);
        } else if (e.outcomeValue) {
          totalValue += e.outcomeValue;
        }
      }
    }

    const roi = totalCost > 0 ? (totalValue - totalCost) / totalCost : 0;

    return {
      agentId,
      totalCost: Math.round(totalCost * 10000) / 10000,
      totalValue: Math.round(totalValue * 100) / 100,
      roi: Math.round(roi * 100) / 100,
      requests: totalRequests,
      successRate: totalRequests > 0 ? Math.round((successCount / totalRequests) * 100) : 0,
      costPerSuccess: successCount > 0 ? Math.round((totalCost / successCount) * 10000) / 10000 : null,
      valuePerDollar: totalCost > 0 ? Math.round((totalValue / totalCost) * 100) / 100 : 0,
    };
  }

  teamROI(teamId, filters = {}) {
    const events = this.collector.query({ ...filters, teamId });
    const agents = [...new Set(events.map(e => e.agentId))];
    const agentROIs = agents.map(a => this.agentROI(a, filters)).filter(Boolean);

    const totalCost = agentROIs.reduce((s, a) => s + a.totalCost, 0);
    const totalValue = agentROIs.reduce((s, a) => s + a.totalValue, 0);

    return {
      teamId,
      totalCost: Math.round(totalCost * 10000) / 10000,
      totalValue: Math.round(totalValue * 100) / 100,
      roi: totalCost > 0 ? Math.round(((totalValue - totalCost) / totalCost) * 100) / 100 : 0,
      agents: agentROIs.sort((a, b) => b.roi - a.roi),
      topPerformer: agentROIs.length > 0 ? agentROIs[0].agentId : null,
      worstPerformer: agentROIs.length > 0 ? agentROIs[agentROIs.length - 1].agentId : null,
    };
  }

  costEfficiency(filters = {}) {
    const events = this.collector.query(filters);
    const byAgent = {};

    for (const e of events) {
      if (!byAgent[e.agentId]) {
        byAgent[e.agentId] = { cost: 0, successes: 0, tokens: 0, latency: 0, requests: 0 };
      }
      const a = byAgent[e.agentId];
      a.cost += e.costUsd;
      a.tokens += e.inputTokens + e.outputTokens;
      a.latency += e.latencyMs;
      a.requests++;
      if (e.outcome === 'success') a.successes++;
    }

    return Object.entries(byAgent).map(([agentId, d]) => ({
      agentId,
      costPerToken: d.tokens > 0 ? Math.round((d.cost / d.tokens) * 1000000) / 1000000 : 0,
      costPerSuccess: d.successes > 0 ? Math.round((d.cost / d.successes) * 10000) / 10000 : null,
      tokensPerRequest: d.requests > 0 ? Math.round(d.tokens / d.requests) : 0,
      avgLatencyMs: d.requests > 0 ? Math.round(d.latency / d.requests) : 0,
    })).sort((a, b) => (a.costPerSuccess || Infinity) - (b.costPerSuccess || Infinity));
  }
}
