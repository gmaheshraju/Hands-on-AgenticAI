import { randomUUID } from 'crypto';

// Cost per 1M tokens (USD)
export const MODEL_PRICING = {
  'claude-3-opus':    { input: 15.0,  output: 75.0  },
  'claude-3-sonnet':  { input: 3.0,   output: 15.0  },
  'claude-3-haiku':   { input: 0.25,  output: 1.25  },
  'claude-3.5-sonnet':{ input: 3.0,   output: 15.0  },
  'gpt-4-turbo':      { input: 10.0,  output: 30.0  },
  'gpt-4o':           { input: 2.5,   output: 10.0  },
  'gpt-4o-mini':      { input: 0.15,  output: 0.60  },
};

function calculateCost(model, promptTokens, completionTokens) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (promptTokens / 1_000_000) * pricing.input
       + (completionTokens / 1_000_000) * pricing.output;
}

class Span {
  constructor({ id, traceId, parentSpanId, name, model, provider, store }) {
    this.id = id;
    this.traceId = traceId;
    this.parentSpanId = parentSpanId || null;
    this.name = name;
    this.model = model;
    this.provider = provider || null;
    this.promptTokens = 0;
    this.completionTokens = 0;
    this.totalTokens = 0;
    this.latencyMs = 0;
    this.cost = 0;
    this.status = 'in_progress';
    this.toolCalls = null;
    this.startedAt = new Date().toISOString();
    this.endedAt = null;
    this.metadata = null;
    this._store = store;
    this._startTime = performance.now();
  }

  setTokens({ promptTokens = 0, completionTokens = 0 }) {
    this.promptTokens = promptTokens;
    this.completionTokens = completionTokens;
    this.totalTokens = promptTokens + completionTokens;
  }

  setToolCalls(toolCalls) {
    this.toolCalls = toolCalls;
  }

  setMetadata(metadata) {
    this.metadata = metadata;
  }

  async end({ status = 'ok' } = {}) {
    this.endedAt = new Date().toISOString();
    this.latencyMs = Math.round(performance.now() - this._startTime);
    this.status = status;
    this.cost = calculateCost(this.model, this.promptTokens, this.completionTokens);

    const record = this._serialize();

    await this._store.insertSpan(record);
    await this._store.insertCostRecord({
      id: randomUUID(),
      spanId: this.id,
      traceId: this.traceId,
      model: this.model,
      provider: this.provider,
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.totalTokens,
      cost: this.cost,
      timestamp: this.endedAt,
    });

    return record;
  }

  _serialize() {
    return {
      id: this.id,
      traceId: this.traceId,
      parentSpanId: this.parentSpanId,
      name: this.name,
      model: this.model,
      provider: this.provider,
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.totalTokens,
      latencyMs: this.latencyMs,
      cost: this.cost,
      status: this.status,
      toolCalls: this.toolCalls ? JSON.stringify(this.toolCalls) : null,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      metadata: this.metadata ? JSON.stringify(this.metadata) : null,
    };
  }
}

class Trace {
  constructor({ id, agent, model, workflow, userId, store }) {
    this.id = id;
    this.agent = agent;
    this.model = model;
    this.workflow = workflow || null;
    this.userId = userId || null;
    this.startedAt = new Date().toISOString();
    this.endedAt = null;
    this.totalTokens = 0;
    this.totalCost = 0;
    this.status = 'in_progress';
    this.spans = [];
    this._store = store;
  }

  startSpan({ name, model, provider, parentSpanId } = {}) {
    const span = new Span({
      id: randomUUID(),
      traceId: this.id,
      parentSpanId: parentSpanId || null,
      name,
      model: model || this.model,
      provider,
      store: this._store,
    });
    this.spans.push(span);
    return span;
  }

  async end({ status = 'completed' } = {}) {
    this.endedAt = new Date().toISOString();
    this.status = status;

    this.totalTokens = this.spans.reduce((sum, s) => sum + s.totalTokens, 0);
    this.totalCost = this.spans.reduce((sum, s) => sum + s.cost, 0);

    const record = {
      id: this.id,
      agent: this.agent,
      model: this.model,
      workflow: this.workflow,
      userId: this.userId,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      totalTokens: this.totalTokens,
      totalCost: this.totalCost,
      status: this.status,
      spans: this.spans.map(s => s.id),
    };

    await this._store.insertTrace(record);
    return record;
  }
}

export class Tracer {
  constructor(store) {
    this._store = store;
  }

  startTrace({ agent, model, workflow, userId } = {}) {
    return new Trace({
      id: randomUUID(),
      agent,
      model,
      workflow,
      userId,
      store: this._store,
    });
  }
}
