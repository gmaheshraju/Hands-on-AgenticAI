export function analyzeRun(runResult, traceEntries) {
  const findings = [];

  detectSingleSource(traceEntries, findings);
  detectPrematureSynthesis(traceEntries, findings);
  detectRepeatedActions(traceEntries, findings);
  detectToolFailures(traceEntries, findings);
  detectConvergenceStall(traceEntries, runResult, findings);
  detectNoSynthesis(runResult, findings);
  detectContextBloat(traceEntries, findings);

  const primitiveScores = scorePrimitives(runResult, traceEntries);
  const weakest = Object.entries(primitiveScores)
    .sort(([, a], [, b]) => a - b)[0];

  const summary = buildSummary(findings, weakest, runResult);

  return {
    findings: findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    primitiveScores,
    weakestPrimitive: weakest[0],
    summary,
  };
}

function severityRank(s) {
  return { high: 0, medium: 1, low: 2 }[s] ?? 3;
}

function detectSingleSource(entries, findings) {
  const sources = new Set();
  for (const e of entries) {
    if (e.tool === 'wikipedia_article' && e.toolInput?.title) sources.add(e.toolInput.title);
  }
  if (sources.size <= 1 && entries.some(e => e.tool === 'synthesize')) {
    findings.push({
      type: 'single_source',
      severity: 'high',
      description: `Only ${sources.size} Wikipedia article(s) consulted. Diverse sources produce better answers.`,
      iteration: null,
      suggestedFix: 'Add instruction: "Consult at least 3 different Wikipedia articles covering different aspects before synthesizing."',
    });
  }
}

function detectPrematureSynthesis(entries, findings) {
  const synthesisEntry = entries.find(e => e.tool === 'synthesize');
  if (!synthesisEntry) return;

  const factsBefore = entries
    .filter(e => e.iteration < synthesisEntry.iteration)
    .reduce((sum, e) => sum + (e.newFactsAdded || 0), 0);

  if (factsBefore < 5) {
    findings.push({
      type: 'premature_synthesis',
      severity: 'high',
      description: `Synthesized after gathering only ${factsBefore} facts. Minimum 5-8 facts recommended.`,
      iteration: synthesisEntry.iteration,
      suggestedFix: 'Add instruction: "Do NOT synthesize until you have gathered at least 8 facts from multiple sources."',
    });
  }
}

function detectRepeatedActions(entries, findings) {
  const seen = new Map();
  for (const e of entries) {
    if (!e.tool) continue;
    const key = `${e.tool}:${JSON.stringify(e.toolInput)}`;
    if (seen.has(key)) {
      findings.push({
        type: 'repeated_action',
        severity: 'medium',
        description: `Repeated ${e.tool} call with same input at iterations ${seen.get(key)} and ${e.iteration}.`,
        iteration: e.iteration,
        suggestedFix: 'Add instruction: "Never repeat the same tool call with identical inputs. Vary your search terms."',
      });
    }
    seen.set(key, e.iteration);
  }
}

function detectToolFailures(entries, findings) {
  for (const e of entries) {
    if (e.toolResult?.includes('not found') || e.toolResult?.includes('failed') || e.toolResult?.includes('error')) {
      findings.push({
        type: 'tool_failure',
        severity: 'low',
        description: `${e.tool} at iteration ${e.iteration} returned an error or empty result.`,
        iteration: e.iteration,
        suggestedFix: 'Add instruction: "If a Wikipedia article is not found, try searching with alternative terms or broader topics."',
      });
    }
  }
}

function detectConvergenceStall(entries, runResult, findings) {
  if (runResult.stopReason === 'CONVERGENCE') {
    findings.push({
      type: 'convergence_stall',
      severity: 'high',
      description: `Agent stalled — multiple consecutive iterations with no new facts.`,
      iteration: entries.length,
      suggestedFix: 'Add instruction: "If searches return nothing new, try: (1) synonyms, (2) broader topic, (3) related concepts, or (4) synthesize what you have."',
    });
  }
}

function detectNoSynthesis(runResult, findings) {
  if (runResult.stopReason !== 'AGENT_DONE') {
    findings.push({
      type: 'no_synthesis',
      severity: 'high',
      description: `Agent never synthesized — stopped due to ${runResult.stopReason}.`,
      iteration: null,
      suggestedFix: 'Add instruction: "You MUST call synthesize before iteration 12. Budget your research accordingly."',
    });
  }
}

function detectContextBloat(entries, findings) {
  if (entries.length < 4) return;
  const firstHalf = entries.slice(0, Math.floor(entries.length / 2));
  const secondHalf = entries.slice(Math.floor(entries.length / 2));
  const avgFirst = firstHalf.reduce((s, e) => s + (e.tokensIn || 0), 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, e) => s + (e.tokensIn || 0), 0) / secondHalf.length;

  if (avgSecond > avgFirst * 1.5 && avgSecond > 500) {
    findings.push({
      type: 'context_bloat',
      severity: 'medium',
      description: `Token input grew ${((avgSecond / avgFirst - 1) * 100).toFixed(0)}% from first to second half. Context window is bloating.`,
      iteration: null,
      suggestedFix: 'Add instruction: "Use the note tool to park findings in the scratchpad. Keep your working context lean."',
    });
  }
}

function scorePrimitives(runResult, entries) {
  const scores = {};

  scores.instructions = runResult.stopReason === 'AGENT_DONE' ? 1.0 : 0.4;

  const searchEntries = entries.filter(e => e.tool === 'wikipedia_search');
  const successfulSearches = searchEntries.filter(e => e.newFactsAdded > 0);
  scores.contextDelivery = searchEntries.length > 0
    ? Math.max(0.3, successfulSearches.length / searchEntries.length)
    : 0.5;

  const tokenGrowth = entries.length > 2
    ? (entries[entries.length - 1]?.tokensIn || 0) / Math.max(1, entries[0]?.tokensIn || 1)
    : 1;
  scores.contextManagement = tokenGrowth < 3 ? 1.0 : tokenGrowth < 5 ? 0.6 : 0.3;

  const failedTools = entries.filter(e => e.toolResult?.includes('error') || e.toolResult?.includes('not found'));
  scores.toolInterface = Math.max(0.3, 1.0 - failedTools.length * 0.15);

  scores.orchestration = runResult.stopReason === 'AGENT_DONE' ? 1.0
    : runResult.stopReason === 'CONVERGENCE' ? 0.5 : 0.3;

  const hasTrace = entries.length > 0 && entries[0].timestamp;
  scores.verification = hasTrace ? 1.0 : 0.5;

  return scores;
}

function buildSummary(findings, weakest, runResult) {
  const highCount = findings.filter(f => f.severity === 'high').length;
  const parts = [];

  if (highCount > 0) parts.push(`${highCount} high-severity issue(s) found.`);
  parts.push(`Weakest primitive: ${weakest[0]} (${weakest[1].toFixed(2)}).`);
  parts.push(`Stop reason: ${runResult.stopReason} after ${runResult.totalIterations} iterations.`);

  if (findings.length > 0) {
    parts.push(`Top issue: ${findings[0].type} — ${findings[0].description}`);
  }

  return parts.join(' ');
}
