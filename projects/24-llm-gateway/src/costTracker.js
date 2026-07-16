export class CostTracker {
  constructor(config = {}) {
    this.records = [];
    this.budgets = new Map();
    this.alertThresholds = config.alertThresholds || [0.5, 0.8, 0.95];
    this.alerts = [];
  }

  setBudget(teamId, dailyBudgetUsd) {
    this.budgets.set(teamId, { daily: dailyBudgetUsd });
  }

  record(entry) {
    const record = {
      id: `req_${this.records.length + 1}`,
      timestamp: Date.now(),
      teamId: entry.teamId || 'default',
      model: entry.model,
      provider: entry.provider,
      inputTokens: entry.inputTokens || 0,
      outputTokens: entry.outputTokens || 0,
      costUsd: entry.costUsd || 0,
      latencyMs: entry.latencyMs || 0,
      cached: entry.cached || false,
      endpoint: entry.endpoint || 'chat',
    };
    this.records.push(record);
    this._checkBudget(record.teamId);
    return record;
  }

  _checkBudget(teamId) {
    const budget = this.budgets.get(teamId);
    if (!budget) return;
    const todaySpend = this.todaySpend(teamId);
    const ratio = todaySpend / budget.daily;

    for (const threshold of this.alertThresholds) {
      if (ratio >= threshold) {
        const existing = this.alerts.find(a => a.teamId === teamId && a.threshold === threshold && this._isToday(a.timestamp));
        if (!existing) {
          this.alerts.push({ teamId, threshold, ratio, spend: todaySpend, budget: budget.daily, timestamp: Date.now() });
        }
      }
    }
  }

  _isToday(ts) {
    const d = new Date(ts);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }

  checkBudget(teamId) {
    const budget = this.budgets.get(teamId);
    if (!budget) return { allowed: true, reason: 'no_budget_set' };
    const spent = this.todaySpend(teamId);
    if (spent >= budget.daily) {
      return { allowed: false, reason: 'daily_budget_exceeded', spent, budget: budget.daily };
    }
    return { allowed: true, spent, budget: budget.daily, remainingUsd: budget.daily - spent };
  }

  todaySpend(teamId) {
    const today = new Date().toDateString();
    return this.records
      .filter(r => r.teamId === teamId && new Date(r.timestamp).toDateString() === today)
      .reduce((sum, r) => sum + r.costUsd, 0);
  }

  teamReport(teamId) {
    const teamRecords = this.records.filter(r => r.teamId === teamId);
    if (teamRecords.length === 0) return { teamId, totalCostUsd: 0, requestCount: 0 };

    const byModel = {};
    let totalInput = 0, totalOutput = 0, totalCost = 0, totalLatency = 0, cacheHits = 0;

    for (const r of teamRecords) {
      if (!byModel[r.model]) byModel[r.model] = { requests: 0, costUsd: 0, tokens: 0 };
      byModel[r.model].requests++;
      byModel[r.model].costUsd += r.costUsd;
      byModel[r.model].tokens += r.inputTokens + r.outputTokens;
      totalInput += r.inputTokens;
      totalOutput += r.outputTokens;
      totalCost += r.costUsd;
      totalLatency += r.latencyMs;
      if (r.cached) cacheHits++;
    }

    return {
      teamId,
      requestCount: teamRecords.length,
      totalCostUsd: Math.round(totalCost * 10000) / 10000,
      totalTokens: totalInput + totalOutput,
      avgLatencyMs: Math.round(totalLatency / teamRecords.length),
      cacheHitRate: Math.round((cacheHits / teamRecords.length) * 100),
      costByModel: byModel,
      todaySpend: this.todaySpend(teamId),
    };
  }

  wasteReport() {
    const patterns = [];

    const byTeam = {};
    for (const r of this.records) {
      if (!byTeam[r.teamId]) byTeam[r.teamId] = [];
      byTeam[r.teamId].push(r);
    }

    for (const [teamId, records] of Object.entries(byTeam)) {
      const premiumForSimple = records.filter(r =>
        r.model.includes('opus') && r.inputTokens < 500 && r.outputTokens < 200
      );
      if (premiumForSimple.length > 0) {
        const wastedUsd = premiumForSimple.reduce((sum, r) => sum + r.costUsd * 0.85, 0);
        patterns.push({
          teamId,
          pattern: 'premium_model_for_simple_tasks',
          count: premiumForSimple.length,
          potentialSavingsUsd: Math.round(wastedUsd * 10000) / 10000,
          suggestion: 'Route short/simple requests to Haiku or GPT-4o-mini',
        });
      }

      const duplicates = this._findDuplicateRequests(records);
      if (duplicates.count > 0) {
        patterns.push({
          teamId,
          pattern: 'duplicate_requests',
          count: duplicates.count,
          potentialSavingsUsd: duplicates.wastedUsd,
          suggestion: 'Enable semantic caching for repeated queries',
        });
      }
    }
    return patterns;
  }

  _findDuplicateRequests(records) {
    const seen = new Map();
    let count = 0, wastedUsd = 0;
    for (const r of records) {
      const key = `${r.model}:${r.inputTokens}`;
      if (seen.has(key)) {
        const timeDiff = r.timestamp - seen.get(key).timestamp;
        if (timeDiff < 60000) { count++; wastedUsd += r.costUsd; }
      }
      seen.set(key, r);
    }
    return { count, wastedUsd: Math.round(wastedUsd * 10000) / 10000 };
  }
}
