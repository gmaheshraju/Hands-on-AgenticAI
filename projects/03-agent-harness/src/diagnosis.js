/**
 * Primitive-Layer Failure Diagnosis
 *
 * Maps agent run failures to the 10 harness primitives that underpin any
 * agent system.  Each primitive gets a health score (0.0 = broken, 1.0 = fine)
 * based on symptoms found in the trace.
 *
 * The 10 primitives:
 *   1. Instructions           — Was the agent's goal clear?
 *   2. Context Delivery       — Did relevant context reach the agent?
 *   3. Context Management     — Did the context window overflow or get polluted?
 *   4. Tool Interface         — Did tools return what the agent expected?
 *   5. Execution Environment  — Did the runtime behave correctly?
 *   6. Durable State          — Was state persisted correctly across iterations?
 *   7. Orchestration          — Was the agent loop well-structured?
 *   8. Sub-agents             — (N/A for single agent, but flagged if delegation would help)
 *   9. Skills & Procedures    — Did the agent follow the right procedure?
 *  10. Verification           — Could we see what happened?
 */

// ── Primitive definitions ──────────────────────────────────────────────

const PRIMITIVES = [
  'instructions',
  'contextDelivery',
  'contextManagement',
  'toolInterface',
  'executionEnvironment',
  'durableState',
  'orchestration',
  'subAgents',
  'skillsProcedures',
  'verification',
];

// ── Diagnosis engine ───────────────────────────────────────────────────

/**
 * Analyze a completed run and score each primitive.
 *
 * @param {object} runResult — the object returned by AgentHarness.run()
 * @param {object[]} traceEntries — the tracer's entries array
 * @returns {{
 *   primitiveScores: Record<string, number>,
 *   weakestPrimitive: string,
 *   diagnosis: string,
 *   details: Record<string, string>
 * }}
 */
export function diagnosePrimitives(runResult, traceEntries) {
  const scores = {};
  const details = {};
  for (const p of PRIMITIVES) {
    scores[p] = 1.0;
    details[p] = 'No issues detected.';
  }

  const stopType = runResult.stopReason?.split(':')[0] ?? 'UNKNOWN';
  const totalIters = traceEntries.length;

  if (totalIters === 0) {
    scores.orchestration = 0.0;
    details.orchestration = 'Zero iterations completed — the agent loop never executed.';
    return buildResult(scores, details);
  }

  // ── 1. Instructions ──────────────────────────────────────────────
  // Symptom: agent never reached synthesis, or hit iteration cap with
  // very few facts — suggests the goal wasn't clear enough to act on.
  const totalFacts = traceEntries.reduce((sum, e) => sum + e.new_facts_added, 0);
  const reachedSynthesis = traceEntries.some((e) => e.tool === 'synthesize');

  if (!reachedSynthesis && stopType !== 'AGENT_DONE') {
    // Agent never synthesized — couldn't figure out when to stop
    scores.instructions -= 0.3;
    details.instructions = 'Agent never reached synthesis phase. Goal may be too open-ended or unclear.';
  }

  if (totalFacts === 0 && totalIters > 2) {
    scores.instructions -= 0.4;
    details.instructions = `Zero facts gathered over ${totalIters} iterations. The task may be impossible with available tools, or the instructions were ambiguous.`;
  }

  // ── 2. Context Delivery ──────────────────────────────────────────
  // Symptom: searches return zero facts (agent looked but didn't find).
  const searchEntries = traceEntries.filter((e) => e.tool === 'webSearch');
  const emptySearches = searchEntries.filter((e) => e.new_facts_added === 0);

  if (searchEntries.length > 0) {
    const emptyRatio = emptySearches.length / searchEntries.length;
    if (emptyRatio > 0.7) {
      scores.contextDelivery -= 0.5;
      details.contextDelivery = `${Math.round(emptyRatio * 100)}% of searches returned no usable facts. Retrieval pipeline may be failing, or queries don't match available data.`;
    } else if (emptyRatio > 0.4) {
      scores.contextDelivery -= 0.2;
      details.contextDelivery = `${Math.round(emptyRatio * 100)}% of searches were unproductive. Consider better query formulation or additional data sources.`;
    }
  }

  // ── 3. Context Management ────────────────────────────────────────
  // Symptom: later iterations are less productive than early ones
  // (context pollution / window overflow makes the agent lose focus).
  if (totalIters >= 6) {
    const firstHalf = traceEntries.slice(0, Math.floor(totalIters / 2));
    const secondHalf = traceEntries.slice(Math.floor(totalIters / 2));

    const firstHalfFacts = firstHalf.reduce((s, e) => s + e.new_facts_added, 0);
    const secondHalfFacts = secondHalf.reduce((s, e) => s + e.new_facts_added, 0);

    if (firstHalfFacts > 0 && secondHalfFacts === 0) {
      scores.contextManagement -= 0.4;
      details.contextManagement = 'Agent was productive in the first half but completely stalled in the second half. Context window may have filled up or become polluted with irrelevant data.';
    } else if (firstHalfFacts > secondHalfFacts * 3 && secondHalfFacts > 0) {
      scores.contextManagement -= 0.2;
      details.contextManagement = 'Significant productivity drop in later iterations. Consider summarizing accumulated context periodically.';
    }
  }

  // ── 4. Tool Interface ────────────────────────────────────────────
  // Symptom: tools ran (consumed tokens) but produced zero facts.
  const readEntries = traceEntries.filter((e) => e.tool === 'readPage');
  const emptyReads = readEntries.filter((e) => e.new_facts_added === 0 && e.tokens_out > 100);

  if (readEntries.length > 0 && emptyReads.length / readEntries.length > 0.5) {
    scores.toolInterface -= 0.4;
    details.toolInterface = `${emptyReads.length}/${readEntries.length} page reads consumed tokens but extracted zero facts. Tool output schema may not match what the agent expects, or content validation is missing.`;
  }

  // Check for unknown/missing tools
  const knownTools = new Set(['webSearch', 'readPage', 'noteFindings', 'synthesize']);
  const unknownTools = traceEntries
    .map((e) => e.tool)
    .filter((t) => !knownTools.has(t));
  if (unknownTools.length > 0) {
    scores.toolInterface -= 0.3;
    details.toolInterface = `Agent called unknown tools: [${[...new Set(unknownTools)].join(', ')}]. Tool registry may be incomplete or agent is hallucinating tool names.`;
  }

  // ── 5. Execution Environment ─────────────────────────────────────
  // Symptom: abnormally long iterations suggest runtime issues.
  const durations = traceEntries.map((e) => e.duration_ms);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const maxDuration = Math.max(...durations);

  if (maxDuration > avgDuration * 10 && maxDuration > 1000) {
    scores.executionEnvironment -= 0.3;
    details.executionEnvironment = `Iteration duration spike: max ${maxDuration}ms vs avg ${Math.round(avgDuration)}ms. Possible timeout, network issue, or resource contention.`;
  }

  // ── 6. Durable State ─────────────────────────────────────────────
  // Symptom: duplicate facts being added (same fact added multiple times
  // suggests state isn't being read back correctly).
  const noteEntries = traceEntries.filter((e) => e.tool === 'noteFindings');
  if (noteEntries.length >= 2) {
    // If noteFindings consistently adds 0 after the first few, it might be
    // re-processing already-seen data (state read OK) or the facts are dupes
    const lateNotes = noteEntries.slice(Math.floor(noteEntries.length / 2));
    const allLateZero = lateNotes.every((e) => e.new_facts_added === 0);
    if (allLateZero && lateNotes.length >= 2) {
      scores.durableState -= 0.2;
      details.durableState = 'Later noteFindings calls consistently added zero facts. Either the agent is re-finding known information (state is readable but retrieval isn\'t adapting), or deduplication is too aggressive.';
    }
  }

  // ── 7. Orchestration ─────────────────────────────────────────────
  // Symptom: iteration cap hit, or the loop structure caused waste.
  if (stopType === 'ITERATION_CAP') {
    scores.orchestration -= 0.3;
    details.orchestration = 'Agent hit iteration cap without completing. The loop may need better planning, earlier exit conditions, or a higher cap for this task complexity.';
  }

  if (stopType === 'CONVERGENCE') {
    // Convergence is fine if we got facts, bad if we didn't
    if (totalFacts < 3) {
      scores.orchestration -= 0.4;
      details.orchestration = `Converged with only ${totalFacts} facts. The agent loop couldn't make progress — orchestration should detect this earlier and try a different approach.`;
    }
  }

  // Check for tool call ordering issues
  const toolSequence = traceEntries.map((e) => e.tool);
  const synthesizeIndex = toolSequence.indexOf('synthesize');
  if (synthesizeIndex >= 0 && synthesizeIndex < totalIters - 1) {
    scores.orchestration -= 0.2;
    details.orchestration = 'Synthesize was called before the final iteration. The loop should terminate after synthesis.';
  }

  // ── 8. Sub-agents ────────────────────────────────────────────────
  // N/A for single agent, but flag if task complexity suggests delegation.
  const uniqueTopics = new Set();
  for (const entry of traceEntries) {
    if (entry.tool_input?.query) {
      const words = entry.tool_input.query.toLowerCase().split(/\s+/);
      const topicWord = words.find((w) => w.length > 4) ?? words[0];
      uniqueTopics.add(topicWord);
    }
  }

  if (uniqueTopics.size > 8) {
    scores.subAgents -= 0.2;
    details.subAgents = `Agent covered ${uniqueTopics.size} distinct topic areas. Consider splitting into sub-agents — one per topic — for parallel research.`;
  } else {
    details.subAgents = 'Single-agent scope appears manageable. No delegation needed.';
  }

  // ── 9. Skills & Procedures ───────────────────────────────────────
  // Symptom: agent didn't follow the expected phase order
  // (search → read → note → synthesize).
  const expectedPhases = ['webSearch', 'readPage', 'noteFindings', 'synthesize'];
  let lastPhaseIndex = -1;
  let outOfOrderCount = 0;

  for (const entry of traceEntries) {
    const idx = expectedPhases.indexOf(entry.tool);
    if (idx >= 0) {
      if (idx < lastPhaseIndex - 1) {
        outOfOrderCount++;
      }
      lastPhaseIndex = idx;
    }
  }

  if (outOfOrderCount > 2) {
    scores.skillsProcedures -= 0.3;
    details.skillsProcedures = `Agent went out of phase order ${outOfOrderCount} times. The procedure (search → read → note → synthesize) wasn't followed consistently.`;
  }

  // Check if agent recorded findings (used noteFindings at all)
  if (noteEntries.length === 0 && totalIters > 3) {
    scores.skillsProcedures -= 0.3;
    details.skillsProcedures = 'Agent never called noteFindings. It gathered data but never recorded structured findings — the procedure is incomplete.';
  }

  // ── 10. Verification & Observability ─────────────────────────────
  // Symptom: trace entries are missing fields, or no thoughts recorded.
  const missingThoughts = traceEntries.filter((e) => !e.thought || e.thought.length < 5);
  if (missingThoughts.length / totalIters > 0.3) {
    scores.verification -= 0.3;
    details.verification = `${missingThoughts.length}/${totalIters} iterations have missing or trivial thought fields. The agent's reasoning is not observable — debugging failures will be harder.`;
  }

  // Check that cost tracking is present
  const missingCost = traceEntries.filter((e) => e.cost_usd === undefined || e.cost_usd === null);
  if (missingCost.length > 0) {
    scores.verification -= 0.2;
    details.verification = `${missingCost.length} entries missing cost data. Cost observability is incomplete.`;
  }

  // ── Clamp all scores to [0, 1] ───────────────────────────────────
  for (const p of PRIMITIVES) {
    scores[p] = Math.max(0, Math.min(1, Math.round(scores[p] * 100) / 100));
  }

  return buildResult(scores, details);
}

// ── Helpers ────────────────────────────────────────────────────────────

function buildResult(scores, details) {
  let weakest = PRIMITIVES[0];
  let weakestScore = scores[weakest];

  for (const p of PRIMITIVES) {
    if (scores[p] < weakestScore) {
      weakest = p;
      weakestScore = scores[p];
    }
  }

  const problemPrimitives = PRIMITIVES.filter((p) => scores[p] < 1.0);
  let diagnosis;

  if (problemPrimitives.length === 0) {
    diagnosis = 'All primitives healthy. The run completed without detectable issues.';
  } else if (problemPrimitives.length === 1) {
    diagnosis = `Single point of failure: ${weakest} (score: ${weakestScore}). ${details[weakest]}`;
  } else {
    diagnosis = `${problemPrimitives.length} primitives degraded. ` +
      `Weakest: ${weakest} (${weakestScore}). ` +
      `Also affected: ${problemPrimitives.filter((p) => p !== weakest).join(', ')}. ` +
      `Start debugging at ${weakest}: ${details[weakest]}`;
  }

  return {
    primitiveScores: { ...scores },
    weakestPrimitive: weakest,
    diagnosis,
    details: { ...details },
  };
}

/**
 * Pretty-print the diagnosis to stdout.
 */
export function printDiagnosis(result) {
  console.log('\n' + '='.repeat(70));
  console.log('PRIMITIVE-LAYER DIAGNOSIS');
  console.log('='.repeat(70));

  const maxNameLen = Math.max(...PRIMITIVES.map((p) => formatPrimitiveName(p).length));

  for (const p of PRIMITIVES) {
    const name = formatPrimitiveName(p).padEnd(maxNameLen + 2);
    const score = result.primitiveScores[p];
    const bar = renderBar(score);
    const marker = score < 0.7 ? ' <<<' : '';
    console.log(`  ${name} ${bar} ${score.toFixed(2)}${marker}`);
  }

  console.log('\n' + '-'.repeat(70));
  console.log(`  Weakest: ${formatPrimitiveName(result.weakestPrimitive)}`);
  console.log(`  ${result.diagnosis}`);
  console.log('='.repeat(70) + '\n');
}

function formatPrimitiveName(camelCase) {
  return camelCase
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function renderBar(score) {
  const width = 20;
  const filled = Math.round(score * width);
  const empty = width - filled;
  const char = score >= 0.7 ? '#' : score >= 0.4 ? '~' : '!';
  return '[' + char.repeat(filled) + '.'.repeat(empty) + ']';
}
