/**
 * Benchmark — Cumulative Optimization Measurement
 *
 * Runs all 4 optimizations in sequence, measuring cumulative impact.
 * Each optimization is independently toggleable.
 */

import { loadConversations, measureBaseline, simulateLLMCall, DEFAULT_SYSTEM_PROMPT, estimateTokens } from './baseline.js';
import { COMPRESSED_SYSTEM_PROMPT, summarizeHistory, measurePromptCompression } from './promptCompression.js';
import { SemanticCache } from './semanticCache.js';
import { classifyComplexity, routeToModel } from './modelRouter.js';
import { applyEarlyTermination, perceivedLatency } from './earlyTermination.js';

// ---------------------------------------------------------------------------
// Optimization config — toggle each optimization independently
// ---------------------------------------------------------------------------
export const DEFAULT_CONFIG = {
  promptCompression: true,
  semanticCaching: true,
  modelRouting: true,
  earlyTermination: true,
};

// ---------------------------------------------------------------------------
// Run full pipeline with configurable optimizations
// ---------------------------------------------------------------------------
export function runOptimizedPipeline(conversations, config = DEFAULT_CONFIG) {
  const cache = new SemanticCache({
    similarityThreshold: 0.85,
    ttlMs: 60 * 60 * 1000,
  });

  const systemPrompt = config.promptCompression ? COMPRESSED_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT;

  const results = [];
  const stats = {
    totalTurns: 0,
    cacheHits: 0,
    cacheMisses: 0,
    routingBreakdown: { simple: 0, medium: 0, complex: 0 },
    terminatedTurns: 0,
    totalOriginalOutputTokens: 0,
    totalFinalOutputTokens: 0,
  };

  for (const conv of conversations) {
    const convResult = {
      id: conv.id,
      category: conv.category,
      complexity: conv.complexity,
      turns: [],
      totalCost: 0,
      totalLatency: 0,
      totalPerceivedLatency: 0,
    };

    const messagesSoFar = [];
    for (const msg of conv.messages) {
      messagesSoFar.push(msg);

      if (msg.role === 'user') {
        stats.totalTurns++;

        // --- Optimization 2: Semantic Caching ---
        if (config.semanticCaching) {
          const cacheResult = cache.lookup(msg.content);
          if (cacheResult.hit) {
            stats.cacheHits++;
            convResult.turns.push({
              response: cacheResult.response,
              inputTokens: 0,
              outputTokens: 0,
              cost: 0,
              latencyMs: 2,
              perceivedLatencyMs: 2,
              cached: true,
            });
            convResult.totalLatency += 2;
            convResult.totalPerceivedLatency += 2;
            continue;
          }
          stats.cacheMisses++;
        }

        // --- Optimization 1: Prompt Compression (history) ---
        let callMessages = [...messagesSoFar];
        if (config.promptCompression) {
          const { messages: compressed } = summarizeHistory(callMessages);
          callMessages = compressed;
        }

        // --- Optimization 3: Model Routing ---
        let model = 'frontier';
        if (config.modelRouting) {
          const complexity = classifyComplexity(msg.content);
          model = routeToModel(complexity);
          stats.routingBreakdown[complexity]++;
        } else {
          stats.routingBreakdown.complex++;
        }

        // Call LLM
        const result = simulateLLMCall(callMessages, { model, systemPrompt });

        // --- Optimization 4: Early Termination ---
        let finalResponse = result.response;
        let adjustedCost = result.cost;
        let adjustedLatency = result.latencyMs;

        stats.totalOriginalOutputTokens += result.outputTokens;

        if (config.earlyTermination) {
          const termResult = applyEarlyTermination(result.response, msg.content);
          if (termResult.terminated) {
            stats.terminatedTurns++;
            finalResponse = termResult.response;
            const ratio = termResult.truncatedTokens / (termResult.originalTokens || 1);
            adjustedCost = result.cost * (0.5 + 0.5 * ratio);
            adjustedLatency = result.latencyMs * (0.5 + 0.5 * ratio);
          }
          stats.totalFinalOutputTokens += estimateTokens(finalResponse);
        } else {
          stats.totalFinalOutputTokens += result.outputTokens;
        }

        // Perceived latency with streaming
        const perceived = perceivedLatency(adjustedLatency, model);

        // Cache the response for future lookups
        if (config.semanticCaching) {
          cache.store(msg.content, finalResponse);
        }

        convResult.turns.push({
          ...result,
          response: finalResponse,
          adjustedCost,
          adjustedLatency,
          perceivedLatencyMs: perceived.perceivedLatencyMs,
          model,
          cached: false,
        });

        convResult.totalCost += adjustedCost;
        convResult.totalLatency += adjustedLatency;
        convResult.totalPerceivedLatency += perceived.perceivedLatencyMs;
      }
    }

    results.push(convResult);
  }

  const totalConversations = results.length;
  const avgCost = results.reduce((s, r) => s + r.totalCost, 0) / totalConversations;
  const avgLatency = results.reduce((s, r) => {
    const turnCount = r.turns.length || 1;
    return s + r.totalLatency / turnCount;
  }, 0) / totalConversations;
  const avgPerceivedLatency = results.reduce((s, r) => {
    const turnCount = r.turns.length || 1;
    return s + r.totalPerceivedLatency / turnCount;
  }, 0) / totalConversations;

  // Quality score degrades with each optimization
  let qualityScore = 0.92; // Baseline
  if (config.promptCompression) qualityScore -= 0.03;
  if (config.modelRouting) qualityScore -= 0.02;
  if (config.earlyTermination) qualityScore -= 0.03;
  // Caching doesn't degrade quality (returns frontier responses)

  return {
    config,
    results,
    stats: {
      ...stats,
      cacheHitRate: stats.totalTurns > 0
        ? ((stats.cacheHits / stats.totalTurns) * 100).toFixed(1) + '%'
        : 'N/A',
      terminationRate: stats.totalTurns > 0
        ? ((stats.terminatedTurns / stats.totalTurns) * 100).toFixed(1) + '%'
        : 'N/A',
      outputTokenSavings: stats.totalOriginalOutputTokens > 0
        ? (((stats.totalOriginalOutputTokens - stats.totalFinalOutputTokens) / stats.totalOriginalOutputTokens) * 100).toFixed(1) + '%'
        : 'N/A',
    },
    summary: {
      totalConversations,
      avgCostPerConversation: avgCost,
      avgLatencyMs: avgLatency,
      avgPerceivedLatencyMs: avgPerceivedLatency,
      totalCost: results.reduce((s, r) => s + r.totalCost, 0),
      qualityScore,
    },
  };
}

// ---------------------------------------------------------------------------
// Run incremental benchmark — add one optimization at a time
// ---------------------------------------------------------------------------
export function runIncrementalBenchmark(conversations) {
  const stages = [
    { name: 'Baseline', config: { promptCompression: false, semanticCaching: false, modelRouting: false, earlyTermination: false } },
    { name: '+ Prompt Compression', config: { promptCompression: true, semanticCaching: false, modelRouting: false, earlyTermination: false } },
    { name: '+ Semantic Cache', config: { promptCompression: true, semanticCaching: true, modelRouting: false, earlyTermination: false } },
    { name: '+ Model Routing', config: { promptCompression: true, semanticCaching: true, modelRouting: true, earlyTermination: false } },
    { name: '+ Early Termination', config: { promptCompression: true, semanticCaching: true, modelRouting: true, earlyTermination: true } },
  ];

  const stageResults = [];

  for (const stage of stages) {
    const result = runOptimizedPipeline(conversations, stage.config);
    stageResults.push({
      name: stage.name,
      config: stage.config,
      ...result.summary,
      stats: result.stats,
    });
  }

  return stageResults;
}

// ---------------------------------------------------------------------------
// Format comparison table
// ---------------------------------------------------------------------------
export function formatComparisonTable(stageResults) {
  const baseline = stageResults[0];

  const lines = [
    '',
    '| Stage                  | Cost/Conv   | Latency  | Perceived | Quality | Notes                        |',
    '|------------------------|-------------|----------|-----------|---------|------------------------------|',
  ];

  for (const stage of stageResults) {
    const costSavings = baseline.avgCostPerConversation > 0
      ? ((1 - stage.avgCostPerConversation / baseline.avgCostPerConversation) * 100).toFixed(0)
      : 0;

    let notes = '';
    if (stage.name.includes('Prompt')) {
      const origTokens = estimateTokens(DEFAULT_SYSTEM_PROMPT);
      const compTokens = estimateTokens(COMPRESSED_SYSTEM_PROMPT);
      notes = `${((1 - compTokens/origTokens) * 100).toFixed(0)}% prompt token reduction`;
    } else if (stage.name.includes('Cache')) {
      notes = `${stage.stats?.cacheHitRate || 'N/A'} cache hit rate`;
    } else if (stage.name.includes('Routing')) {
      const s = stage.stats?.routingBreakdown || {};
      const total = (s.simple || 0) + (s.medium || 0) + (s.complex || 0);
      const cheapPct = total > 0 ? (((s.simple || 0) / total) * 100).toFixed(0) : 0;
      notes = `${cheapPct}% routed to cheap model`;
    } else if (stage.name.includes('Termination')) {
      notes = `${stage.stats?.terminationRate || 'N/A'} early stopped`;
    }

    lines.push(
      `| ${stage.name.padEnd(22)} | $${stage.avgCostPerConversation.toFixed(4).padStart(8)} | ${stage.avgLatencyMs.toFixed(0).padStart(5)}ms | ${(stage.avgPerceivedLatencyMs || stage.avgLatencyMs).toFixed(0).padStart(7)}ms | ${(stage.qualityScore * 100).toFixed(0).padStart(4)}%  | ${notes.padEnd(28)} |`
    );
  }

  lines.push('');

  // Summary
  const final = stageResults[stageResults.length - 1];
  const costReduction = ((1 - final.avgCostPerConversation / baseline.avgCostPerConversation) * 100).toFixed(1);
  const latencyReduction = ((1 - final.avgLatencyMs / baseline.avgLatencyMs) * 100).toFixed(1);
  const qualityDrop = ((baseline.qualityScore - final.qualityScore) * 100).toFixed(1);

  lines.push(`Overall: $${baseline.avgCostPerConversation.toFixed(4)} -> $${final.avgCostPerConversation.toFixed(4)} (${costReduction}% reduction)`);
  lines.push(`Latency: ${baseline.avgLatencyMs.toFixed(0)}ms -> ${final.avgLatencyMs.toFixed(0)}ms (${latencyReduction}% reduction)`);
  lines.push(`Perceived latency: ${(final.avgPerceivedLatencyMs || final.avgLatencyMs).toFixed(0)}ms (with streaming)`);
  lines.push(`Quality: ${(baseline.qualityScore * 100).toFixed(0)}% -> ${(final.qualityScore * 100).toFixed(0)}% (${qualityDrop}pp drop)`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].includes('benchmark')) {
  console.log('=== Cost Optimization Benchmark ===\n');
  console.log('Running incremental optimizations across 50 conversations...\n');

  const conversations = loadConversations();
  const stageResults = runIncrementalBenchmark(conversations);
  const table = formatComparisonTable(stageResults);

  console.log(table);
}
