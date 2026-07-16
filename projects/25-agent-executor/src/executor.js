import { PolicyEngine } from './policy.js';
import { ActionRegistry } from './actionRegistry.js';
import { Sandbox } from './sandbox.js';
import { ApprovalQueue } from './approvals.js';
import { AuditTrail } from './auditTrail.js';

export class AgentExecutor {
  constructor(config = {}) {
    this.policy = new PolicyEngine();
    this.actions = new ActionRegistry();
    this.sandbox = new Sandbox(config.sandbox);
    this.approvals = new ApprovalQueue(config.approvals);
    this.audit = new AuditTrail(config.audit);
    this.agents = new Map();
    this.activeSessions = new Map();
  }

  registerAgent(agent) {
    const record = {
      id: agent.id,
      name: agent.name,
      roles: agent.roles || [],
      trustLevel: agent.trustLevel || 'untrusted', // 'untrusted' | 'basic' | 'elevated' | 'admin'
      permissions: agent.permissions || {},
      registeredAt: Date.now(),
    };
    this.agents.set(agent.id, record);
    return record;
  }

  startSession(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Unknown agent: ${agentId}`);

    const session = this.sandbox.createSession(agentId, agent.permissions);
    this.activeSessions.set(session.id, { agentId, startedAt: Date.now() });
    return session;
  }

  async execute(sessionId, actionId, params = {}) {
    const session = this.sandbox.getSession(sessionId);
    if (!session) return { error: 'SESSION_NOT_FOUND' };
    if (session.state !== 'active') return { error: 'SESSION_NOT_ACTIVE', state: session.state };

    const agent = this.agents.get(session.agentId);
    const action = this.actions.get(actionId);
    if (!action) return { error: 'UNKNOWN_ACTION', actionId };

    // 1. Validate params against schema
    const validation = this.actions.validate(actionId, params);
    if (!validation.valid) {
      this.audit.record({
        agentId: session.agentId, sessionId, action: actionId,
        params, result: 'denied', riskLevel: action.riskLevel,
        error: `Validation failed: ${validation.errors?.join(', ') || validation.error}`,
      });
      return { error: 'VALIDATION_FAILED', details: validation.errors || [validation.error] };
    }

    // 2. Check policy
    const resource = `${action.category}/${actionId}`;
    const policyResult = this.policy.evaluate({
      principal: session.agentId,
      action: actionId,
      resource,
      context: {
        riskLevel: action.riskLevel,
        trustLevel: agent.trustLevel,
        sessionAge: Date.now() - session.startedAt,
        violationCount: session.violations.length,
        ...params,
      },
    });

    if (!policyResult.allowed) {
      this.audit.record({
        agentId: session.agentId, sessionId, action: actionId,
        params, resource, result: 'denied', riskLevel: action.riskLevel,
        policyId: policyResult.policy, policyName: policyResult.policyName,
        error: `Policy denied: ${policyResult.reason}`,
      });
      return { error: 'POLICY_DENIED', reason: policyResult.reason, policy: policyResult.policy };
    }

    // 3. Check if approval required
    if (action.requiresApproval) {
      const approval = this.approvals.submit({
        agentId: session.agentId, action: actionId, params,
        riskLevel: action.riskLevel,
        reason: `${action.name} requires human approval`,
        context: { sessionId, trustLevel: agent.trustLevel },
      });

      if (approval.status === 'pending') {
        this.audit.record({
          agentId: session.agentId, sessionId, action: actionId,
          params, resource, result: 'approval_required',
          riskLevel: action.riskLevel, approvalId: approval.id,
        });
        return { error: 'APPROVAL_REQUIRED', approvalId: approval.id, expiresAt: approval.expiresAt };
      }
    }

    // 4. Execute in sandbox
    const startTime = Date.now();
    try {
      const result = await this._sandboxedExecute(session, action, params);
      const duration = Date.now() - startTime;

      this.audit.record({
        agentId: session.agentId, sessionId, action: actionId,
        params, resource, result: 'allowed', riskLevel: action.riskLevel,
        policyId: policyResult.policy, policyName: policyResult.policyName,
        duration, output: typeof result === 'string' ? result : JSON.stringify(result)?.slice(0, 500),
      });

      return { success: true, result, duration, actionId };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.audit.record({
        agentId: session.agentId, sessionId, action: actionId,
        params, resource, result: 'error', riskLevel: action.riskLevel,
        duration, error: error.message,
      });
      return { error: 'EXECUTION_FAILED', message: error.message, duration };
    }
  }

  async _sandboxedExecute(session, action, params) {
    if (action.timeout) {
      return Promise.race([
        action.handler(params, { sessionId: session.id, agentId: session.agentId }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Action timed out')), action.timeout)),
      ]);
    }
    return action.handler(params, { sessionId: session.id, agentId: session.agentId });
  }

  endSession(sessionId) {
    this.sandbox.terminateSession(sessionId);
    this.activeSessions.delete(sessionId);
  }

  dashboard() {
    const since = Date.now() - 3600000;
    return {
      agents: [...this.agents.values()].map(a => ({
        id: a.id, name: a.name, trustLevel: a.trustLevel,
      })),
      activeSessions: this.activeSessions.size,
      pendingApprovals: this.approvals.getPending().length,
      security: this.audit.securityReport(since),
      actions: this.actions.summary(),
    };
  }
}
