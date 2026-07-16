import { computeHash } from './eventLogger.js';

/**
 * Decision Replay Engine
 *
 * Reconstructs the full chain of events that led to a specific decision.
 * Supports deterministic replay: given the same inputs, verifies the
 * same decision would be reached.
 */

export class DecisionReplay {
  #logger;

  constructor(logger) {
    if (!logger) throw new Error('EventLogger instance is required');
    this.#logger = logger;
  }

  /**
   * Reconstruct the decision chain for a given decision entry ID.
   * Walks backward through the log to find all causally-related events.
   *
   * Causal relation: same agentId, or referenced in metadata.parentId,
   * or same metadata.sessionId.
   */
  reconstruct(decisionId) {
    const target = this.#logger.getById(decisionId);
    if (!target) {
      return { found: false, error: `Decision ${decisionId} not found` };
    }

    const allEntries = this.#logger.getAll();
    const targetIndex = allEntries.findIndex(e => e.id === decisionId);

    // Collect the causal chain: same agent + before this entry, or linked via session
    const sessionId = target.metadata?.sessionId;
    const agentId = target.agentId;

    const chain = [];
    for (let i = 0; i <= targetIndex; i++) {
      const entry = allEntries[i];
      const isRelevant =
        entry.agentId === agentId ||
        (sessionId && entry.metadata?.sessionId === sessionId) ||
        entry.metadata?.parentId === decisionId ||
        target.metadata?.parentId === entry.id;

      if (isRelevant) {
        chain.push(entry);
      }
    }

    // Categorize events in the chain
    const context = chain.filter(e => e.action === 'context_load' || e.action === 'data_retrieval');
    const toolCalls = chain.filter(e => e.action === 'tool_call' || e.action === 'tool_execution');
    const decisions = chain.filter(e => e.decision !== null);
    const outcome = target.output;

    return {
      found: true,
      decisionId,
      target,
      chain,
      summary: {
        totalEvents: chain.length,
        contextEvents: context.length,
        toolCalls: toolCalls.length,
        decisions: decisions.length,
      },
      breakdown: {
        context,
        toolCalls,
        decisions,
        outcome,
      },
      timeline: chain.map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        action: e.action,
        decision: e.decision,
        rationale: e.rationale,
      })),
    };
  }

  /**
   * Deterministic replay: given a decision function and the original
   * inputs, verify that the same decision would be produced.
   *
   * @param {string} decisionId - The original decision entry ID
   * @param {Function} decisionFn - (context) => { decision, rationale }
   * @returns {{ match: boolean, original, replayed, drift }}
   */
  replay(decisionId, decisionFn) {
    const reconstruction = this.reconstruct(decisionId);
    if (!reconstruction.found) {
      return { match: false, error: reconstruction.error };
    }

    const target = reconstruction.target;

    // Build the context that was available at decision time
    const replayContext = {
      agentId: target.agentId,
      input: target.input,
      priorEvents: reconstruction.breakdown.context,
      toolResults: reconstruction.breakdown.toolCalls.map(t => ({
        action: t.action,
        output: t.output,
      })),
      metadata: target.metadata,
    };

    let replayed;
    try {
      replayed = decisionFn(replayContext);
    } catch (err) {
      return {
        match: false,
        error: `Replay function threw: ${err.message}`,
        original: { decision: target.decision, rationale: target.rationale },
      };
    }

    const match =
      replayed.decision === target.decision &&
      replayed.rationale === target.rationale;

    return {
      match,
      original: { decision: target.decision, rationale: target.rationale },
      replayed: { decision: replayed.decision, rationale: replayed.rationale },
      drift: match ? null : {
        decisionChanged: replayed.decision !== target.decision,
        rationaleChanged: replayed.rationale !== target.rationale,
      },
    };
  }

  /**
   * Produce an audit-ready summary of a decision, suitable for
   * compliance evidence.
   */
  auditSummary(decisionId) {
    const reconstruction = this.reconstruct(decisionId);
    if (!reconstruction.found) return null;

    const target = reconstruction.target;
    return {
      decisionId,
      agent: target.agentId,
      timestamp: target.timestamp,
      action: target.action,
      decision: target.decision,
      rationale: target.rationale,
      inputHash: computeHash('', { input: target.input }),
      chainLength: reconstruction.chain.length,
      chainIntegrity: this.#logger.verifyChain().valid,
      timeline: reconstruction.timeline,
    };
  }
}
