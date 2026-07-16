export class ApprovalQueue {
  constructor(config = {}) {
    this.pending = new Map();
    this.history = [];
    this.autoApproveRules = config.autoApproveRules || [];
    this.timeout = config.timeout || 300000; // 5 min default
    this.escalationChain = config.escalationChain || [];
  }

  submit(request) {
    const id = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const autoResult = this._checkAutoApprove(request);
    if (autoResult) {
      const record = {
        id, ...request, status: 'auto_approved',
        decidedAt: Date.now(), decidedBy: 'system',
        rule: autoResult.rule, submittedAt: Date.now(),
      };
      this.history.push(record);
      return { status: 'auto_approved', id, rule: autoResult.rule };
    }

    const record = {
      id,
      agentId: request.agentId,
      action: request.action,
      params: request.params,
      riskLevel: request.riskLevel,
      reason: request.reason,
      context: request.context || {},
      status: 'pending',
      submittedAt: Date.now(),
      expiresAt: Date.now() + this.timeout,
      escalationLevel: 0,
    };

    this.pending.set(id, record);
    return { status: 'pending', id, expiresAt: record.expiresAt };
  }

  approve(id, approver, notes) {
    const request = this.pending.get(id);
    if (!request) return { error: 'not_found' };
    if (request.status !== 'pending') return { error: 'already_decided' };

    request.status = 'approved';
    request.decidedAt = Date.now();
    request.decidedBy = approver;
    request.notes = notes;

    this.pending.delete(id);
    this.history.push(request);
    return { status: 'approved', id };
  }

  deny(id, approver, reason) {
    const request = this.pending.get(id);
    if (!request) return { error: 'not_found' };
    if (request.status !== 'pending') return { error: 'already_decided' };

    request.status = 'denied';
    request.decidedAt = Date.now();
    request.decidedBy = approver;
    request.denyReason = reason;

    this.pending.delete(id);
    this.history.push(request);
    return { status: 'denied', id };
  }

  escalate(id) {
    const request = this.pending.get(id);
    if (!request) return { error: 'not_found' };

    request.escalationLevel++;
    const nextApprover = this.escalationChain[request.escalationLevel - 1];

    if (!nextApprover) {
      return { error: 'no_further_escalation', currentLevel: request.escalationLevel };
    }

    request.escalatedTo = nextApprover;
    request.escalatedAt = Date.now();

    return { status: 'escalated', level: request.escalationLevel, escalatedTo: nextApprover };
  }

  checkExpired() {
    const now = Date.now();
    const expired = [];

    for (const [id, request] of this.pending) {
      if (now > request.expiresAt) {
        request.status = 'expired';
        request.decidedAt = now;
        this.pending.delete(id);
        this.history.push(request);
        expired.push(id);
      }
    }

    return expired;
  }

  _checkAutoApprove(request) {
    for (const rule of this.autoApproveRules) {
      if (rule.action && rule.action !== request.action) continue;
      if (rule.maxRisk) {
        const riskLevels = { low: 0, medium: 1, high: 2, critical: 3 };
        if (riskLevels[request.riskLevel] > riskLevels[rule.maxRisk]) continue;
      }
      if (rule.agents && !rule.agents.includes(request.agentId)) continue;
      return { rule: rule.name || 'unnamed_rule' };
    }
    return null;
  }

  getPending() {
    return [...this.pending.values()];
  }

  getHistory(filters = {}) {
    let results = [...this.history];
    if (filters.agentId) results = results.filter(r => r.agentId === filters.agentId);
    if (filters.status) results = results.filter(r => r.status === filters.status);
    if (filters.action) results = results.filter(r => r.action === filters.action);
    return results;
  }
}
