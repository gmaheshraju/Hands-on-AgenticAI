export class AuditLog {
  constructor(config = {}) {
    this.entries = [];
    this.maxEntries = config.maxEntries || 10000;
    this.retentionDays = config.retentionDays || 30;
  }

  log(entry) {
    const record = {
      id: `audit_${Date.now()}_${this.entries.length}`,
      timestamp: Date.now(),
      teamId: entry.teamId || 'unknown',
      userId: entry.userId || 'unknown',
      action: entry.action,           // 'request' | 'response' | 'blocked' | 'failover' | 'pii_detected'
      model: entry.model,
      provider: entry.provider,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costUsd: entry.costUsd,
      latencyMs: entry.latencyMs,
      routingReason: entry.routingReason,
      piiDetected: entry.piiDetected || false,
      piiTypes: entry.piiTypes || [],
      rateLimited: entry.rateLimited || false,
      circuitBreakerState: entry.circuitBreakerState,
      status: entry.status || 'success', // 'success' | 'error' | 'blocked' | 'rate_limited'
      errorType: entry.errorType,
      metadata: entry.metadata || {},
    };

    this.entries.push(record);

    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-Math.floor(this.maxEntries * 0.8));
    }

    return record;
  }

  query(filters = {}) {
    let results = [...this.entries];

    if (filters.teamId) results = results.filter(e => e.teamId === filters.teamId);
    if (filters.userId) results = results.filter(e => e.userId === filters.userId);
    if (filters.action) results = results.filter(e => e.action === filters.action);
    if (filters.status) results = results.filter(e => e.status === filters.status);
    if (filters.model) results = results.filter(e => e.model === filters.model);
    if (filters.piiDetected) results = results.filter(e => e.piiDetected);
    if (filters.since) results = results.filter(e => e.timestamp >= filters.since);
    if (filters.until) results = results.filter(e => e.timestamp <= filters.until);

    return results;
  }

  complianceReport(teamId, startTime, endTime) {
    const entries = this.query({ teamId, since: startTime, until: endTime || Date.now() });

    const piiEvents = entries.filter(e => e.piiDetected);
    const blockedEvents = entries.filter(e => e.status === 'blocked' || e.status === 'rate_limited');
    const failoverEvents = entries.filter(e => e.action === 'failover');
    const errorEvents = entries.filter(e => e.status === 'error');

    const piiByType = {};
    for (const e of piiEvents) {
      for (const t of e.piiTypes) {
        piiByType[t] = (piiByType[t] || 0) + 1;
      }
    }

    return {
      teamId,
      period: { start: new Date(startTime).toISOString(), end: new Date(endTime || Date.now()).toISOString() },
      totalRequests: entries.length,
      successRate: entries.length > 0 ? Math.round((entries.filter(e => e.status === 'success').length / entries.length) * 100) : 0,
      piiDetectionEvents: piiEvents.length,
      piiByType,
      blockedRequests: blockedEvents.length,
      failoverEvents: failoverEvents.length,
      errors: errorEvents.length,
      modelsUsed: [...new Set(entries.map(e => e.model).filter(Boolean))],
      totalCostUsd: Math.round(entries.reduce((sum, e) => sum + (e.costUsd || 0), 0) * 10000) / 10000,
    };
  }

  replayTrace(requestId) {
    return this.entries.filter(e =>
      e.metadata?.requestId === requestId
    ).sort((a, b) => a.timestamp - b.timestamp);
  }
}
