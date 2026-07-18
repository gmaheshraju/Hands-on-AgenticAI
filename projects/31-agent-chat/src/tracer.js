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

  _computeToolRelevance(toolResult, finalAnswer) {
    if (!toolResult || !finalAnswer) return 0;

    const resultNgrams = this._extractNgrams(toolResult.toLowerCase(), 2);
    const answerNgrams = new Set(this._extractNgrams(finalAnswer.toLowerCase(), 2));

    if (resultNgrams.length === 0) return 0;

    let matches = 0;
    for (const ng of resultNgrams) {
      if (answerNgrams.has(ng)) matches++;
    }

    return Math.min(1, matches / Math.min(resultNgrams.length, 20));
  }

  _extractNgrams(text, n) {
    const stopWords = new Set(['the', 'a', 'an', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'only', 'same', 'than', 'too', 'very', 'just', 'because', 'this', 'that', 'these', 'those', 'it', 'its']);

    const words = text.split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length > 2 && !stopWords.has(w));

    const ngrams = [];
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(' '));
    }
    return ngrams;
  }

  _assessProductivity(decision, finalAnswer) {
    if (decision.action === 'respond') return true;

    if (decision.toolError) return false;

    if (!decision.toolResult || decision.toolResult.length < 10) return false;

    const relevance = this._computeToolRelevance(decision.toolResult, finalAnswer);
    decision.toolRelevanceScore = Math.round(relevance * 100) / 100;
    decision.toolResultUsed = relevance >= 0.15;

    return decision.toolResultUsed;
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
