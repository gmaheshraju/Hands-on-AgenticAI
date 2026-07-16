import { redactMessages } from './pii.js';
import { TokenBucketLimiter } from './rateLimit.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { ModelRouter } from './router.js';
import { CostTracker } from './costTracker.js';
import { AuditLog } from './audit.js';

export class LLMGateway {
  constructor(config = {}) {
    this.rateLimiter = new TokenBucketLimiter(config.rateLimit);
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    this.router = new ModelRouter(config.routing);
    this.costTracker = new CostTracker(config.cost);
    this.auditLog = new AuditLog(config.audit);
    this.providers = new Map();
    this.middleware = [];
    this.piiRedaction = config.piiRedaction !== false;
    this.retryConfig = {
      maxRetries: config.maxRetries || 2,
      backoffMs: config.backoffMs || 1000,
    };
  }

  registerProvider(name, handler) {
    this.providers.set(name, handler);
  }

  use(fn) {
    this.middleware.push(fn);
  }

  async request(req) {
    const requestId = `gw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();
    const ctx = { requestId, teamId: req.teamId || 'default', userId: req.userId || 'anonymous', startTime };

    // 1. Budget check
    const budgetCheck = this.costTracker.checkBudget(ctx.teamId);
    if (!budgetCheck.allowed) {
      this.auditLog.log({ ...ctx, action: 'blocked', status: 'blocked', errorType: 'budget_exceeded', metadata: { requestId } });
      return { error: 'BUDGET_EXCEEDED', detail: budgetCheck, requestId };
    }

    // 2. Rate limit check
    const estimatedTokens = this._estimateTokens(req);
    const rateCheck = this.rateLimiter.check(ctx.teamId, estimatedTokens);
    if (!rateCheck.allowed) {
      this.auditLog.log({ ...ctx, action: 'blocked', status: 'rate_limited', rateLimited: true, metadata: { requestId, retryAfterMs: rateCheck.retryAfterMs } });
      return { error: 'RATE_LIMITED', retryAfterMs: rateCheck.retryAfterMs, requestId };
    }

    // 3. PII redaction
    let piiFindings = [];
    let messages = req.messages;
    if (this.piiRedaction && messages) {
      const result = redactMessages(messages);
      messages = result.messages;
      piiFindings = result.findings;
      if (piiFindings.length > 0) {
        this.auditLog.log({
          ...ctx, action: 'pii_detected', piiDetected: true,
          piiTypes: [...new Set(piiFindings.map(f => f.type))],
          status: 'success', metadata: { requestId, findingsCount: piiFindings.length },
        });
      }
    }

    // 4. Route to model
    const route = this.router.route({ ...req, messages }, this.circuitBreaker);
    if (!route.model) {
      this.auditLog.log({ ...ctx, action: 'blocked', status: 'error', errorType: 'no_available_provider', metadata: { requestId } });
      return { error: 'ALL_PROVIDERS_DOWN', requestId };
    }

    // 5. Custom middleware
    for (const mw of this.middleware) {
      const result = await mw({ ...ctx, route, messages, originalRequest: req });
      if (result?.block) {
        this.auditLog.log({ ...ctx, action: 'blocked', status: 'blocked', errorType: result.reason, model: route.model, metadata: { requestId } });
        return { error: 'MIDDLEWARE_BLOCKED', reason: result.reason, requestId };
      }
    }

    // 6. Execute with retry + failover
    const response = await this._executeWithRetry(ctx, { ...req, messages }, route);

    // 7. Track cost
    if (response.usage) {
      const cost = this.router.estimateCost(response.model, response.usage.inputTokens, response.usage.outputTokens);
      this.rateLimiter.consume(ctx.teamId, response.usage.inputTokens + response.usage.outputTokens);
      this.costTracker.record({
        teamId: ctx.teamId, model: response.model, provider: response.provider,
        inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens,
        costUsd: cost, latencyMs: Date.now() - startTime,
      });

      this.auditLog.log({
        ...ctx, action: 'response', model: response.model, provider: response.provider,
        inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens,
        costUsd: cost, latencyMs: Date.now() - startTime, routingReason: route.reason,
        piiDetected: piiFindings.length > 0, piiTypes: [...new Set(piiFindings.map(f => f.type))],
        status: 'success', metadata: { requestId },
      });

      return {
        ...response, requestId, costUsd: cost, latencyMs: Date.now() - startTime,
        routingReason: route.reason, piiRedacted: piiFindings.length,
      };
    }

    return { ...response, requestId, latencyMs: Date.now() - startTime };
  }

  async _executeWithRetry(ctx, req, route) {
    let lastError;
    let currentRoute = route;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      const provider = this.providers.get(currentRoute.provider);
      if (!provider) {
        lastError = new Error(`No handler registered for provider: ${currentRoute.provider}`);
        currentRoute = this._failover(currentRoute);
        if (!currentRoute) break;
        continue;
      }

      try {
        const response = await provider({ ...req, model: currentRoute.model });
        this.circuitBreaker.recordSuccess(currentRoute.provider);
        return { ...response, model: currentRoute.model, provider: currentRoute.provider };
      } catch (error) {
        lastError = error;
        this.circuitBreaker.recordFailure(currentRoute.provider, error);
        this.auditLog.log({
          ...ctx, action: 'failover', model: currentRoute.model, provider: currentRoute.provider,
          status: 'error', errorType: error.code || error.message,
          circuitBreakerState: this.circuitBreaker.status(currentRoute.provider).state,
          metadata: { requestId: ctx.requestId, attempt, failedProvider: currentRoute.provider },
        });

        if (attempt < this.retryConfig.maxRetries) {
          currentRoute = this._failover(currentRoute);
          if (!currentRoute) break;
          await this._backoff(attempt);
        }
      }
    }

    return { error: 'ALL_RETRIES_EXHAUSTED', detail: lastError?.message, model: route.model };
  }

  _failover(currentRoute) {
    const alternatives = this.router.fallbackChain
      .filter(m => {
        const model = this.router.models[m];
        return model && model.provider !== currentRoute.provider && this.circuitBreaker.canRequest(model.provider).allowed;
      });

    if (alternatives.length === 0) return null;
    const model = alternatives[0];
    return { model, ...this.router.models[model], reason: 'failover' };
  }

  _backoff(attempt) {
    const delay = this.retryConfig.backoffMs * Math.pow(2, attempt);
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  _estimateTokens(req) {
    if (!req.messages) return 1000;
    const text = req.messages.map(m => typeof m.content === 'string' ? m.content : '').join('');
    return Math.max(Math.ceil(text.length / 4), 100);
  }

  // --- Dashboard methods ---

  dashboard() {
    return {
      providers: this.circuitBreaker.allStatus(),
      costs: this._allTeamCosts(),
      alerts: this.costTracker.alerts.filter(a => this.costTracker._isToday(a.timestamp)),
      waste: this.costTracker.wasteReport(),
    };
  }

  _allTeamCosts() {
    const teams = new Set(this.costTracker.records.map(r => r.teamId));
    const reports = {};
    for (const t of teams) reports[t] = this.costTracker.teamReport(t);
    return reports;
  }
}
