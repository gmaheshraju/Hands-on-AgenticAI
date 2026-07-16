export class AuditTrail {
  constructor(config = {}) {
    this.entries = [];
    this.maxEntries = config.maxEntries || 50000;
  }

  record(event) {
    const entry = {
      id: `audit_${this.entries.length + 1}`,
      timestamp: Date.now(),
      agentId: event.agentId,
      sessionId: event.sessionId,
      action: event.action,
      params: event.params,
      resource: event.resource,
      result: event.result, // 'allowed' | 'denied' | 'error' | 'timeout' | 'approval_required'
      policyId: event.policyId,
      policyName: event.policyName,
      riskLevel: event.riskLevel,
      duration: event.duration,
      error: event.error,
      approvalId: event.approvalId,
      output: event.output,
      metadata: event.metadata || {},
    };

    this.entries.push(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-Math.floor(this.maxEntries * 0.8));
    }

    return entry;
  }

  query(filters = {}) {
    let results = [...this.entries];

    if (filters.agentId) results = results.filter(e => e.agentId === filters.agentId);
    if (filters.sessionId) results = results.filter(e => e.sessionId === filters.sessionId);
    if (filters.action) results = results.filter(e => e.action === filters.action);
    if (filters.result) results = results.filter(e => e.result === filters.result);
    if (filters.riskLevel) results = results.filter(e => e.riskLevel === filters.riskLevel);
    if (filters.since) results = results.filter(e => e.timestamp >= filters.since);
    if (filters.until) results = results.filter(e => e.timestamp <= filters.until);

    return results;
  }

  agentReport(agentId, since) {
    const entries = this.query({ agentId, since });

    const actions = {};
    let allowed = 0, denied = 0, errors = 0;
    let totalDuration = 0;
    const riskBreakdown = { low: 0, medium: 0, high: 0, critical: 0 };

    for (const e of entries) {
      actions[e.action] = (actions[e.action] || 0) + 1;
      if (e.result === 'allowed') allowed++;
      if (e.result === 'denied') denied++;
      if (e.result === 'error') errors++;
      if (e.duration) totalDuration += e.duration;
      if (e.riskLevel) riskBreakdown[e.riskLevel]++;
    }

    return {
      agentId,
      totalActions: entries.length,
      allowed,
      denied,
      errors,
      denyRate: entries.length > 0 ? Math.round((denied / entries.length) * 100) : 0,
      avgDurationMs: entries.length > 0 ? Math.round(totalDuration / entries.length) : 0,
      actionBreakdown: actions,
      riskBreakdown,
      violations: entries.filter(e => e.result === 'denied'),
    };
  }

  sessionReplay(sessionId) {
    return this.query({ sessionId }).sort((a, b) => a.timestamp - b.timestamp);
  }

  securityReport(since) {
    const entries = this.query({ since });
    const denials = entries.filter(e => e.result === 'denied');
    const byAgent = {};

    for (const e of denials) {
      if (!byAgent[e.agentId]) byAgent[e.agentId] = [];
      byAgent[e.agentId].push({ action: e.action, resource: e.resource, timestamp: e.timestamp });
    }

    const highRisk = entries.filter(e => e.riskLevel === 'high' || e.riskLevel === 'critical');

    return {
      totalActions: entries.length,
      totalDenials: denials.length,
      denialRate: entries.length > 0 ? Math.round((denials.length / entries.length) * 100) : 0,
      denialsByAgent: byAgent,
      highRiskActions: highRisk.length,
      uniqueAgents: new Set(entries.map(e => e.agentId)).size,
    };
  }
}
