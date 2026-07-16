const MODEL_REGISTRY = {
  'claude-opus-4': { provider: 'anthropic', costPer1kInput: 0.015, costPer1kOutput: 0.075, maxTokens: 200000, tier: 'premium', latencyMs: 3000 },
  'claude-sonnet-4': { provider: 'anthropic', costPer1kInput: 0.003, costPer1kOutput: 0.015, maxTokens: 200000, tier: 'standard', latencyMs: 1500 },
  'claude-haiku-3.5': { provider: 'anthropic', costPer1kInput: 0.0008, costPer1kOutput: 0.004, maxTokens: 200000, tier: 'fast', latencyMs: 500 },
  'gpt-4o': { provider: 'openai', costPer1kInput: 0.005, costPer1kOutput: 0.015, maxTokens: 128000, tier: 'standard', latencyMs: 2000 },
  'gpt-4o-mini': { provider: 'openai', costPer1kInput: 0.00015, costPer1kOutput: 0.0006, maxTokens: 128000, tier: 'fast', latencyMs: 600 },
  'gemini-2.5-pro': { provider: 'google', costPer1kInput: 0.00125, costPer1kOutput: 0.01, maxTokens: 1000000, tier: 'standard', latencyMs: 1800 },
  'gemini-2.5-flash': { provider: 'google', costPer1kInput: 0.00015, costPer1kOutput: 0.0006, maxTokens: 1000000, tier: 'fast', latencyMs: 400 },
};

export class ModelRouter {
  constructor(config = {}) {
    this.models = { ...MODEL_REGISTRY };
    this.rules = config.rules || [];
    this.fallbackChain = config.fallbackChain || ['claude-sonnet-4', 'gpt-4o', 'gemini-2.5-pro'];
    this.teamOverrides = new Map();
  }

  setTeamModel(teamId, modelOrTier) {
    this.teamOverrides.set(teamId, modelOrTier);
  }

  classifyComplexity(request) {
    const content = typeof request.messages === 'string'
      ? request.messages
      : request.messages?.map(m => m.content).join(' ') || '';
    const tokenEstimate = Math.ceil(content.length / 4);

    let score = 0;
    if (tokenEstimate > 10000) score += 3;
    else if (tokenEstimate > 3000) score += 2;
    else score += 1;

    if (request.tools?.length > 5) score += 2;
    else if (request.tools?.length > 0) score += 1;

    if (/\b(?:analyze|compare|architect|design|evaluate|critique|synthesize)\b/i.test(content)) score += 2;
    if (/\b(?:code review|security audit|migration plan|system design)\b/i.test(content)) score += 3;
    if (/\b(?:summarize|translate|extract|classify|format|list)\b/i.test(content)) score -= 1;

    if (request.jsonMode || request.structuredOutput) score += 1;

    if (score >= 7) return 'premium';
    if (score >= 4) return 'standard';
    return 'fast';
  }

  route(request, circuitBreaker) {
    const teamOverride = request.teamId ? this.teamOverrides.get(request.teamId) : null;

    if (teamOverride && this.models[teamOverride]) {
      const model = this.models[teamOverride];
      if (!circuitBreaker || circuitBreaker.canRequest(model.provider).allowed) {
        return { model: teamOverride, ...model, reason: 'team_override' };
      }
    }

    if (request.model && this.models[request.model]) {
      const model = this.models[request.model];
      if (!circuitBreaker || circuitBreaker.canRequest(model.provider).allowed) {
        return { model: request.model, ...model, reason: 'explicit_model' };
      }
    }

    for (const rule of this.rules) {
      if (rule.match(request) && this.models[rule.model]) {
        const model = this.models[rule.model];
        if (!circuitBreaker || circuitBreaker.canRequest(model.provider).allowed) {
          return { model: rule.model, ...model, reason: `rule:${rule.name}` };
        }
      }
    }

    const tier = teamOverride && !this.models[teamOverride] ? teamOverride : this.classifyComplexity(request);
    const tierModels = Object.entries(this.models)
      .filter(([, m]) => m.tier === tier)
      .sort(([, a], [, b]) => a.costPer1kInput - b.costPer1kInput);

    for (const [name, model] of tierModels) {
      if (!circuitBreaker || circuitBreaker.canRequest(model.provider).allowed) {
        return { model: name, ...model, reason: `complexity:${tier}` };
      }
    }

    for (const fallback of this.fallbackChain) {
      if (this.models[fallback]) {
        const model = this.models[fallback];
        if (!circuitBreaker || circuitBreaker.canRequest(model.provider).allowed) {
          return { model: fallback, ...model, reason: 'fallback_chain' };
        }
      }
    }

    return { model: null, reason: 'all_providers_down' };
  }

  estimateCost(model, inputTokens, outputTokens) {
    const m = this.models[model];
    if (!m) return 0;
    return (inputTokens / 1000) * m.costPer1kInput + (outputTokens / 1000) * m.costPer1kOutput;
  }
}
