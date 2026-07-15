const METRICS = ['token_usage', 'latency', 'cost', 'tool_usage', 'quality'];

const HOUR_MS = 3600000;
const DAY_MS = 86400000;

export class DriftDetector {
  constructor(store, options = {}) {
    this.store = store;
    this.baselineWindowDays = options.baselineWindowDays ?? 7;
    this.recentWindowHours = options.recentWindowHours ?? 6;
    this.zScoreThreshold = options.zScoreThreshold ?? 2.0;
    this.checkIntervalMs = options.checkIntervalMs ?? 60000;
    this._timer = null;
  }

  // ─── Z-Score ──────────────────────────────────────────────

  calculateZScore(current, baselineMean, baselineStd) {
    if (baselineStd === 0) return 0;
    return (current - baselineMean) / baselineStd;
  }

  // ─── Percentile helper ────────────────────────────────────

  percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
  }

  // ─── Baseline stats ──────────────────────────────────────

  getBaselineStats(metric, agent, model) {
    const now = Date.now();
    const baselineStart = now - this.baselineWindowDays * DAY_MS;
    const baselineEnd = now - this.recentWindowHours * HOUR_MS;

    const values = this._getMetricValues(metric, agent, model, baselineStart, baselineEnd);

    if (values.length < 2) {
      return { mean: 0, std: 0, count: values.length };
    }

    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);

    return { mean, std, count: values.length };
  }

  // ─── Current value ───────────────────────────────────────

  getCurrentValue(metric, agent, model) {
    const now = Date.now();
    const recentStart = now - this.recentWindowHours * HOUR_MS;

    const values = this._getMetricValues(metric, agent, model, recentStart, now);

    if (values.length === 0) return null;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  // ─── Internal: extract metric values from store ──────────

  _getMetricValues(metric, agent, model, start, end) {
    const db = this.store.db;

    const agentCondition = agent ? 'AND t.agent = @agent' : '';
    const modelCondition = model ? 'AND s.model = @model' : '';
    const params = { start, end };
    if (agent) params.agent = agent;
    if (model) params.model = model;

    switch (metric) {
      case 'token_usage': {
        const rows = db.prepare(`
          SELECT s.total_tokens AS val
          FROM spans s
          JOIN traces t ON s.trace_id = t.id
          WHERE s.started_at >= @start AND s.started_at <= @end
            AND s.total_tokens > 0
            ${agentCondition} ${modelCondition}
        `).all(params);
        return rows.map(r => r.val);
      }

      case 'latency': {
        const rows = db.prepare(`
          SELECT s.latency_ms AS val
          FROM spans s
          JOIN traces t ON s.trace_id = t.id
          WHERE s.started_at >= @start AND s.started_at <= @end
            AND s.latency_ms > 0
            ${agentCondition} ${modelCondition}
        `).all(params);
        return rows.map(r => r.val);
      }

      case 'cost': {
        const costAgentCond = agent ? 'AND agent = @agent' : '';
        const costModelCond = model ? 'AND model = @model' : '';
        const rows = db.prepare(`
          SELECT cost AS val
          FROM cost_records
          WHERE timestamp >= @start AND timestamp <= @end
            AND cost > 0
            ${costAgentCond} ${costModelCond}
        `).all(params);
        return rows.map(r => r.val);
      }

      case 'tool_usage': {
        const rows = db.prepare(`
          SELECT s.tool_calls AS tc
          FROM spans s
          JOIN traces t ON s.trace_id = t.id
          WHERE s.started_at >= @start AND s.started_at <= @end
            ${agentCondition} ${modelCondition}
        `).all(params);
        return rows.map(r => {
          if (!r.tc || r.tc === 'null') return 0;
          try {
            const parsed = JSON.parse(r.tc);
            return Array.isArray(parsed) ? parsed.length : 0;
          } catch {
            return 0;
          }
        });
      }

      case 'quality': {
        const qualAgentCond = agent ? 'AND agent = @agent' : '';
        const qualModelCond = model ? 'AND model = @model' : '';
        const rows = db.prepare(`
          SELECT score AS val
          FROM quality_scores
          WHERE timestamp >= @start AND timestamp <= @end
            ${qualAgentCond} ${qualModelCond}
        `).all(params);
        return rows.map(r => r.val);
      }

      default:
        return [];
    }
  }

  // ─── Detect drift for one metric ─────────────────────────

  detectDrift(metric, agent, model) {
    const baseline = this.getBaselineStats(metric, agent, model);
    const currentValue = this.getCurrentValue(metric, agent, model);

    const label = `${agent || 'all'}/${model || 'all'}`;

    if (currentValue === null || baseline.count < 2) {
      return {
        metric,
        agent,
        model,
        drifted: false,
        severity: 'none',
        baselineMean: baseline.mean,
        baselineStd: baseline.std,
        currentValue,
        zScore: 0,
        message: `Insufficient data for ${metric} drift detection on ${label}`,
      };
    }

    const zScore = this.calculateZScore(currentValue, baseline.mean, baseline.std);
    const absZ = Math.abs(zScore);

    let severity = 'none';
    if (absZ >= 3.0) {
      severity = 'critical';
    } else if (absZ >= this.zScoreThreshold) {
      severity = 'warning';
    }

    const drifted = severity !== 'none';
    const direction = zScore > 0 ? 'increased' : 'decreased';
    const metricLabel = metric.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const message = drifted
      ? `${metricLabel} for ${label} ${direction} by ${absZ.toFixed(1)} standard deviations (baseline: ${baseline.mean.toFixed(1)}±${baseline.std.toFixed(1)}, current: ${currentValue.toFixed(1)})`
      : `${metricLabel} for ${label} is within normal range (z=${zScore.toFixed(2)})`;

    return {
      metric,
      agent,
      model,
      drifted,
      severity,
      baselineMean: baseline.mean,
      baselineStd: baseline.std,
      currentValue,
      zScore,
      message,
    };
  }

  // ─── Run all checks ──────────────────────────────────────

  runAllChecks(agents = [], models = []) {
    const results = [];

    const agentList = agents.length > 0 ? agents : [null];
    const modelList = models.length > 0 ? models : [null];

    for (const agent of agentList) {
      for (const model of modelList) {
        for (const metric of METRICS) {
          const result = this.detectDrift(metric, agent, model);
          results.push(result);

          if (result.drifted) {
            this.store.insertDriftAlert({
              metric: result.metric,
              agent: result.agent,
              model: result.model,
              severity: result.severity,
              baseline_mean: result.baselineMean,
              baseline_std: result.baselineStd,
              current_value: result.currentValue,
              z_score: result.zScore,
              message: result.message,
              timestamp: Date.now(),
            });
          }
        }
      }
    }

    return results;
  }

  // ─── Alerts ──────────────────────────────────────────────

  getActiveAlerts() {
    return this.store.getDriftAlerts({ resolved: false });
  }

  resolveAlert(alertId) {
    this.store.resolveDriftAlert(alertId);
  }

  // ─── Latency percentiles ─────────────────────────────────

  getLatencyPercentiles(agent, model, windowHours) {
    const now = Date.now();
    const start = now - (windowHours || this.recentWindowHours) * HOUR_MS;
    const values = this._getMetricValues('latency', agent, model, start, now);

    return {
      p50: this.percentile(values, 50),
      p95: this.percentile(values, 95),
      p99: this.percentile(values, 99),
    };
  }

  // ─── Token stats ─────────────────────────────────────────

  getTokenStats(agent, model, windowHours) {
    const now = Date.now();
    const start = now - (windowHours || this.recentWindowHours) * HOUR_MS;
    const db = this.store.db;

    const agentCondition = agent ? 'AND t.agent = @agent' : '';
    const modelCondition = model ? 'AND s.model = @model' : '';
    const params = { start, end: now };
    if (agent) params.agent = agent;
    if (model) params.model = model;

    const rows = db.prepare(`
      SELECT s.prompt_tokens, s.completion_tokens, s.total_tokens
      FROM spans s
      JOIN traces t ON s.trace_id = t.id
      WHERE s.started_at >= @start AND s.started_at <= @end
        AND s.total_tokens > 0
        ${agentCondition} ${modelCondition}
    `).all(params);

    if (rows.length === 0) {
      return { avgPromptTokens: 0, avgCompletionTokens: 0, avgTotalTokens: 0 };
    }

    const sum = rows.reduce(
      (acc, r) => ({
        prompt: acc.prompt + r.prompt_tokens,
        completion: acc.completion + r.completion_tokens,
        total: acc.total + r.total_tokens,
      }),
      { prompt: 0, completion: 0, total: 0 }
    );

    return {
      avgPromptTokens: Math.round(sum.prompt / rows.length),
      avgCompletionTokens: Math.round(sum.completion / rows.length),
      avgTotalTokens: Math.round(sum.total / rows.length),
    };
  }

  // ─── Tool usage rate ─────────────────────────────────────

  getToolUsageRate(agent, model, windowHours) {
    const now = Date.now();
    const start = now - (windowHours || this.recentWindowHours) * HOUR_MS;
    const db = this.store.db;

    const agentCondition = agent ? 'AND t.agent = @agent' : '';
    const modelCondition = model ? 'AND s.model = @model' : '';
    const params = { start, end: now };
    if (agent) params.agent = agent;
    if (model) params.model = model;

    const rows = db.prepare(`
      SELECT s.tool_calls AS tc
      FROM spans s
      JOIN traces t ON s.trace_id = t.id
      WHERE s.started_at >= @start AND s.started_at <= @end
        ${agentCondition} ${modelCondition}
    `).all(params);

    const totalSpans = rows.length;
    let totalToolCalls = 0;
    let spansWithTools = 0;

    for (const row of rows) {
      if (!row.tc || row.tc === 'null') continue;
      try {
        const parsed = JSON.parse(row.tc);
        if (Array.isArray(parsed) && parsed.length > 0) {
          spansWithTools++;
          totalToolCalls += parsed.length;
        }
      } catch {
        // skip malformed JSON
      }
    }

    return {
      avgToolCallsPerSpan: totalSpans > 0 ? Math.round((totalToolCalls / totalSpans) * 100) / 100 : 0,
      spansWithTools,
      totalSpans,
    };
  }
}

export default DriftDetector;
