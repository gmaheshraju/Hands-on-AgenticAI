import crypto from 'node:crypto';

export class AgentObserver {
  constructor(db) {
    this.db = db;
  }

  startRun(threadId, userMessage) {
    const id = crypto.randomUUID();
    this.db.createAgentRun({
      id,
      threadId,
      userMessage: userMessage.slice(0, 500),
      startTime: Date.now(),
    });
    return new AgentRun(this.db, id, userMessage);
  }
}

class AgentRun {
  constructor(db, runId, userMessage) {
    this.db = db;
    this.runId = runId;
    this.userMessage = userMessage;
    this._decisions = [];
    this._sequence = 0;
  }

  get traceId() { return this.runId; }

  recordDecision({ thought, action, input, tokensIn, tokensOut, latencyMs, provider }) {
    this._sequence++;
    const decision = {
      id: crypto.randomUUID(),
      runId: this.runId,
      sequence: this._sequence,
      thought: thought || '',
      action: action || 'respond',
      input: input || {},
      tokensIn: tokensIn || 0,
      tokensOut: tokensOut || 0,
      latencyMs: latencyMs || 0,
      provider: provider || null,
      toolResult: null,
      toolResultUsed: false,
      productive: null,
      confidenceSignals: [],
    };
    this._decisions.push(decision);
    return new DecisionHandle(decision);
  }

  attachToolResult(decisionHandle, { result, durationMs, error }) {
    const d = decisionHandle._decision;
    d.toolResult = (result || '').slice(0, 2000);
    d.toolDurationMs = durationMs || 0;
    d.toolError = error || null;
  }

  end(finalAnswer, { totalTokensIn, totalTokensOut, provider, outcome }) {
    const endTime = Date.now();

    for (const d of this._decisions) {
      if (d.action !== 'respond' && d.toolResult !== null) {
        d.toolResultUsed = finalAnswer.toLowerCase().includes(
          this._extractKeyPhrase(d.toolResult)
        );
      }

      d.productive = this._assessProductivity(d, finalAnswer);

      d.confidenceSignals = this._extractConfidenceSignals(d.thought);
    }

    const productiveCount = this._decisions.filter(d => d.productive === true).length;
    const wastedCount = this._decisions.filter(d => d.productive === false).length;
    const toolDecisions = this._decisions.filter(d => d.action !== 'respond' && d.toolResult !== null);
    const toolsUsedInAnswer = toolDecisions.filter(d => d.toolResultUsed).length;
    const toolRoi = toolDecisions.length > 0 ? toolsUsedInAnswer / toolDecisions.length : 1;

    const coherence = this._assessCoherence();

    const strategy = this._classifyStrategy();

    for (const d of this._decisions) {
      this.db.createDecision({
        ...d,
        input: JSON.stringify(d.input),
        confidenceSignals: JSON.stringify(d.confidenceSignals),
      });
    }

    this.db.endAgentRun(this.runId, {
      endTime,
      outcome: outcome || 'answered',
      strategy,
      totalDecisions: this._decisions.length,
      productiveDecisions: productiveCount,
      wastedDecisions: wastedCount,
      toolRoiScore: Math.round(toolRoi * 100) / 100,
      reasoningCoherence: Math.round(coherence * 100) / 100,
      tokensIn: totalTokensIn || 0,
      tokensOut: totalTokensOut || 0,
      provider: provider || null,
    });

    return {
      runId: this.runId,
      strategy,
      decisions: this._decisions.length,
      productive: productiveCount,
      wasted: wastedCount,
      toolRoi,
      coherence,
    };
  }

  _extractKeyPhrase(text) {
    if (!text) return '';
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    return words.slice(0, 3).join(' ');
  }

  _assessProductivity(decision, finalAnswer) {
    if (decision.action === 'respond') return true;

    if (decision.toolError) return false;

    if (decision.toolResultUsed) return true;

    if (!decision.toolResult || decision.toolResult.length < 10) return false;

    const thoughtWords = decision.thought.toLowerCase().split(/\s+/);
    const answerWords = finalAnswer.toLowerCase().split(/\s+/);
    const overlap = thoughtWords.filter(w => w.length > 4 && answerWords.includes(w));
    return overlap.length >= 2;
  }

  _assessCoherence() {
    if (this._decisions.length <= 1) return 1.0;

    let coherent = 0;
    for (let i = 1; i < this._decisions.length; i++) {
      const prev = this._decisions[i - 1];
      const curr = this._decisions[i];

      const prevWords = new Set(prev.thought.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      const currWords = curr.thought.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const references = currWords.filter(w => prevWords.has(w)).length;

      if (references >= 2 || curr.action === 'respond') coherent++;
    }

    return coherent / (this._decisions.length - 1);
  }

  _classifyStrategy() {
    const actions = this._decisions.map(d => d.action);
    if (actions.length === 1 && actions[0] === 'respond') return 'direct';
    const toolCalls = actions.filter(a => a !== 'respond');
    if (toolCalls.length === 1) return 'single_tool';
    const uniqueTools = new Set(toolCalls);
    if (uniqueTools.size > 1) return 'multi_tool';
    return 'iterative';
  }

  _extractConfidenceSignals(thought) {
    if (!thought) return [];
    const signals = [];
    const low = thought.toLowerCase();

    if (/\b(i need to|let me|should|might)\b/.test(low)) {
      signals.push('hedging');
    }
    if (/\b(i know|clearly|obviously|the answer is)\b/.test(low)) {
      signals.push('confident');
    }
    if (/\b(not sure|uncertain|maybe|perhaps)\b/.test(low)) {
      signals.push('uncertain');
    }
    if (/\b(search|find|look up|check)\b/.test(low)) {
      signals.push('seeking_info');
    }
    if (/\b(enough|sufficient|can answer|have the information)\b/.test(low)) {
      signals.push('ready_to_answer');
    }

    return signals;
  }
}

class DecisionHandle {
  constructor(decision) {
    this._decision = decision;
  }
  get id() { return this._decision.id; }
}
