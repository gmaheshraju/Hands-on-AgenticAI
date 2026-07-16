export class CostCollector {
  constructor(config = {}) {
    this.events = [];
    this.pricing = config.pricing || {
      'claude-opus-4': { input: 0.015, output: 0.075 },
      'claude-sonnet-4': { input: 0.003, output: 0.015 },
      'claude-haiku-3.5': { input: 0.0008, output: 0.004 },
      'gpt-4o': { input: 0.005, output: 0.015 },
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gemini-2.5-pro': { input: 0.00125, output: 0.01 },
      'gemini-2.5-flash': { input: 0.000075, output: 0.0003 },
    };
  }

  record(event) {
    const cost = event.costUsd || this.calculateCost(event.model, event.inputTokens, event.outputTokens);
    const record = {
      id: `evt_${this.events.length + 1}`,
      timestamp: Date.now(),
      agentId: event.agentId,
      teamId: event.teamId || 'default',
      taskId: event.taskId,
      taskType: event.taskType,
      model: event.model,
      provider: event.provider,
      inputTokens: event.inputTokens || 0,
      outputTokens: event.outputTokens || 0,
      costUsd: cost,
      latencyMs: event.latencyMs || 0,
      cached: event.cached || false,
      outcome: event.outcome || null, // 'success' | 'failure' | 'partial' | null
      outcomeValue: event.outcomeValue || null,
      metadata: event.metadata || {},
    };
    this.events.push(record);
    return record;
  }

  calculateCost(model, inputTokens, outputTokens) {
    const price = this.pricing[model];
    if (!price) return 0;
    return (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output;
  }

  query(filters = {}) {
    let results = [...this.events];
    if (filters.agentId) results = results.filter(e => e.agentId === filters.agentId);
    if (filters.teamId) results = results.filter(e => e.teamId === filters.teamId);
    if (filters.taskId) results = results.filter(e => e.taskId === filters.taskId);
    if (filters.taskType) results = results.filter(e => e.taskType === filters.taskType);
    if (filters.model) results = results.filter(e => e.model === filters.model);
    if (filters.since) results = results.filter(e => e.timestamp >= filters.since);
    if (filters.until) results = results.filter(e => e.timestamp <= filters.until);
    return results;
  }
}
