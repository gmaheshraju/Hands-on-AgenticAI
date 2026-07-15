/**
 * Cost tracking and budget alerting system.
 *
 * Aggregates token-level cost records written by the tracer,
 * exposes hourly / daily / weekly rollups, per-dimension attribution,
 * and enforces budget limits (warn at 80 %, block at 100 %).
 */

export class CostTracker {
  constructor(store) {
    this.store = store;
  }

  // ─── Record a cost event ────────────────────────────────────

  recordCost({ traceId, spanId, agent, model, userId, workflow, inputTokens, outputTokens, cost }) {
    this.store.insertCostRecord({
      trace_id: traceId,
      span_id: spanId,
      agent,
      model,
      user_id: userId,
      workflow,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost,
      timestamp: Date.now(),
    });
  }

  // ─── Time-bucketed aggregations ─────────────────────────────

  getHourlyCosts(timeRange = {}, filters = {}) {
    const rows = this.store.getCostAggregation('hour', timeRange, filters);
    return rows.map(r => ({
      hour: new Date(r.bucket).toISOString(),
      cost: Math.round(r.total_cost * 10000) / 10000,
      tokens: r.total_input_tokens + r.total_output_tokens,
    }));
  }

  getDailyCosts(timeRange = {}, filters = {}) {
    const rows = this.store.getCostAggregation('day', timeRange, filters);
    return rows.map(r => ({
      date: new Date(r.bucket).toISOString().slice(0, 10),
      cost: Math.round(r.total_cost * 10000) / 10000,
      tokens: r.total_input_tokens + r.total_output_tokens,
    }));
  }

  getWeeklyCosts(timeRange = {}, filters = {}) {
    const rows = this.store.getCostAggregation('week', timeRange, filters);
    return rows.map(r => ({
      week: new Date(r.bucket).toISOString().slice(0, 10),
      cost: Math.round(r.total_cost * 10000) / 10000,
      tokens: r.total_input_tokens + r.total_output_tokens,
    }));
  }

  // ─── Cost attribution ───────────────────────────────────────

  _attributeBy(column, timeRange = {}) {
    const conditions = [];
    const params = {};

    if (timeRange.start) {
      conditions.push('timestamp >= @timeStart');
      params.timeStart = timeRange.start;
    }
    if (timeRange.end) {
      conditions.push('timestamp <= @timeEnd');
      params.timeEnd = timeRange.end;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = this.store.db.prepare(`
      SELECT
        ${column} AS dimension,
        SUM(cost) AS total_cost
      FROM cost_records
      ${where}
      GROUP BY ${column}
      ORDER BY total_cost DESC
    `).all(params);

    const grandTotal = rows.reduce((sum, r) => sum + r.total_cost, 0);

    return rows.map(r => ({
      [column]: r.dimension,
      cost: Math.round(r.total_cost * 10000) / 10000,
      percentage: grandTotal > 0
        ? Math.round((r.total_cost / grandTotal) * 10000) / 100
        : 0,
    }));
  }

  getCostByAgent(timeRange) {
    return this._attributeBy('agent', timeRange);
  }

  getCostByModel(timeRange) {
    return this._attributeBy('model', timeRange);
  }

  getCostByUser(timeRange) {
    return this._attributeBy('user_id', timeRange).map(r => ({
      userId: r.user_id,
      cost: r.cost,
      percentage: r.percentage,
    }));
  }

  getCostByWorkflow(timeRange) {
    return this._attributeBy('workflow', timeRange);
  }

  // ─── Budget management ──────────────────────────────────────

  setBudget(scope, scopeValue, { daily, weekly, monthly }) {
    this.store.setBudget(scope, scopeValue, {
      daily_limit: daily ?? null,
      weekly_limit: weekly ?? null,
      monthly_limit: monthly ?? null,
    });
  }

  getBudgetStatus(scope, scopeValue) {
    const budget = this.store.getBudget(scope, scopeValue);
    if (!budget) {
      return { limit: null, spent: 0, remaining: null, percentage: 0, alert: null };
    }

    // Use the most restrictive active limit
    const dailySpent = this.store.getDailyCost(scope === 'agent' ? scopeValue : null);
    const weeklySpent = this.store.getWeeklyCost(scope === 'agent' ? scopeValue : null);

    // Check daily first (tightest window)
    if (budget.daily_limit) {
      const pct = (dailySpent / budget.daily_limit) * 100;
      return {
        limit: budget.daily_limit,
        spent: Math.round(dailySpent * 10000) / 10000,
        remaining: Math.round((budget.daily_limit - dailySpent) * 10000) / 10000,
        percentage: Math.round(pct * 100) / 100,
        alert: pct >= 100 ? 'blocked' : pct >= 80 ? 'warning' : null,
      };
    }

    if (budget.weekly_limit) {
      const pct = (weeklySpent / budget.weekly_limit) * 100;
      return {
        limit: budget.weekly_limit,
        spent: Math.round(weeklySpent * 10000) / 10000,
        remaining: Math.round((budget.weekly_limit - weeklySpent) * 10000) / 10000,
        percentage: Math.round(pct * 100) / 100,
        alert: pct >= 100 ? 'blocked' : pct >= 80 ? 'warning' : null,
      };
    }

    return { limit: null, spent: 0, remaining: null, percentage: 0, alert: null };
  }

  // ─── Pre-request budget gate ────────────────────────────────

  checkBudget(agent) {
    const budget = this.store.getBudget('agent', agent);
    if (!budget) {
      return { allowed: true, reason: 'no budget set', percentUsed: 0 };
    }

    const dailySpent = this.store.getDailyCost(agent);

    if (budget.daily_limit) {
      const pct = (dailySpent / budget.daily_limit) * 100;
      if (pct >= 100) {
        return {
          allowed: false,
          reason: `Daily budget exhausted ($${dailySpent.toFixed(4)} / $${budget.daily_limit.toFixed(4)})`,
          percentUsed: Math.round(pct * 100) / 100,
        };
      }
      if (pct >= 80) {
        return {
          allowed: true,
          reason: `Warning: ${Math.round(pct)}% of daily budget used`,
          percentUsed: Math.round(pct * 100) / 100,
        };
      }
    }

    const weeklySpent = this.store.getWeeklyCost(agent);

    if (budget.weekly_limit) {
      const pct = (weeklySpent / budget.weekly_limit) * 100;
      if (pct >= 100) {
        return {
          allowed: false,
          reason: `Weekly budget exhausted ($${weeklySpent.toFixed(4)} / $${budget.weekly_limit.toFixed(4)})`,
          percentUsed: Math.round(pct * 100) / 100,
        };
      }
      if (pct >= 80) {
        return {
          allowed: true,
          reason: `Warning: ${Math.round(pct)}% of weekly budget used`,
          percentUsed: Math.round(pct * 100) / 100,
        };
      }
    }

    return { allowed: true, reason: 'within budget', percentUsed: 0 };
  }

  // ─── Dashboard summary ─────────────────────────────────────

  getTodaySummary() {
    const now = Date.now();
    const startOfDay = now - (now % 86400000);

    const row = this.store.db.prepare(`
      SELECT
        COALESCE(SUM(cost), 0)            AS total_cost,
        COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens,
        COUNT(*)                           AS request_count
      FROM cost_records
      WHERE timestamp >= @startOfDay
    `).get({ startOfDay });

    const topAgent = this.store.db.prepare(`
      SELECT agent, SUM(cost) AS total
      FROM cost_records
      WHERE timestamp >= @startOfDay AND agent IS NOT NULL
      GROUP BY agent
      ORDER BY total DESC
      LIMIT 1
    `).get({ startOfDay });

    const topModel = this.store.db.prepare(`
      SELECT model, SUM(cost) AS total
      FROM cost_records
      WHERE timestamp >= @startOfDay AND model IS NOT NULL
      GROUP BY model
      ORDER BY total DESC
      LIMIT 1
    `).get({ startOfDay });

    return {
      totalCost: Math.round(row.total_cost * 10000) / 10000,
      totalTokens: row.total_tokens,
      requestCount: row.request_count,
      topAgent: topAgent?.agent ?? null,
      topModel: topModel?.model ?? null,
    };
  }
}

export default CostTracker;
