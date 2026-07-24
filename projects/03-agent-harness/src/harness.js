/**
 * Observable Agent Harness
 *
 * The harness wraps any agent loop and enforces three termination conditions:
 *   1. Iteration cap   — hard stop after N iterations
 *   2. Cost cap        — hard stop after $X total spend
 *   3. Convergence     — stop when K consecutive iterations add zero new facts
 *
 * Every iteration is traced to a JSONL file via the Tracer.
 *
 * After a run completes, the postmortem() method analyzes trace entries and
 * maps failure patterns to concrete fixes (the "Postmortem Loop" from
 * Carbon Layer).
 */

import { Tracer } from './tracer.js';

// ── Cost model (Claude Sonnet pricing as reference) ─────────────────────

const COST_PER_INPUT_TOKEN = 3.0 / 1_000_000;   // $3 per 1M input tokens
const COST_PER_OUTPUT_TOKEN = 15.0 / 1_000_000;  // $15 per 1M output tokens

export function computeCost(tokensIn, tokensOut) {
  return tokensIn * COST_PER_INPUT_TOKEN + tokensOut * COST_PER_OUTPUT_TOKEN;
}

// ── Harness ─────────────────────────────────────────────────────────────

export class AgentHarness {
  /**
   * @param {object} opts
   * @param {number} [opts.maxIterations=20]       — iteration cap
   * @param {number} [opts.maxCostUsd=1.0]         — cost cap in USD
   * @param {number} [opts.convergenceWindow=3]    — consecutive zero-fact iterations before stop
   * @param {string} [opts.traceDir='.']           — directory for trace output
   * @param {boolean} [opts.verbose=true]          — print live iteration updates
   */
  constructor({
    maxIterations = 20,
    maxCostUsd = 1.0,
    convergenceWindow = 3,
    traceDir = '.',
    verbose = true,
  } = {}) {
    this.maxIterations = maxIterations;
    this.maxCostUsd = maxCostUsd;
    this.convergenceWindow = convergenceWindow;
    this.verbose = verbose;

    this.tracer = new Tracer({ outDir: traceDir });
    this.cumulativeCost = 0;
    this.iteration = 0;
    this.convergenceCounter = 0;  // consecutive iterations with 0 new facts
    this.stopReason = null;
  }

  /**
   * Run the agent loop.
   *
   * The `agentStepFn` is called each iteration and must return:
   *   {
   *     thought: string,        — what the agent decided
   *     tool: string,           — tool name
   *     toolInput: object,      — arguments
   *     tokensIn: number,
   *     tokensOut: number,
   *     newFactsAdded: number,  — how many new facts this iteration produced
   *     done: boolean,          — agent declares itself done (e.g. after synthesize)
   *   }
   *
   * @param {Function} agentStepFn — async (iteration, harness) => StepResult
   * @returns {object} { stopReason, totalIterations, totalCost, traceFile }
   */
  async run(agentStepFn) {
    if (this.verbose) {
      console.log('\n' + '~'.repeat(70));
      console.log('HARNESS START');
      console.log(`  Caps: ${this.maxIterations} iterations | $${this.maxCostUsd} cost | ${this.convergenceWindow}-iter convergence window`);
      console.log('~'.repeat(70) + '\n');
    }

    while (true) {
      this.iteration++;

      // ── Check iteration cap ───────────────────────────────────────
      if (this.iteration > this.maxIterations) {
        this.stopReason = `ITERATION_CAP: reached ${this.maxIterations} iterations`;
        break;
      }

      // ── Run one agent step ────────────────────────────────────────
      const t0 = performance.now();
      const step = await agentStepFn(this.iteration, this);
      const durationMs = Math.round(performance.now() - t0);

      // ── Cost tracking ─────────────────────────────────────────────
      const iterCost = computeCost(step.tokensIn, step.tokensOut);
      this.cumulativeCost += iterCost;

      // ── Trace this iteration ──────────────────────────────────────
      this.tracer.log({
        iteration: this.iteration,
        thought: step.thought,
        tool: step.tool,
        toolInput: step.toolInput,
        durationMs,
        tokensIn: step.tokensIn,
        tokensOut: step.tokensOut,
        costUsd: iterCost,
        cumulativeCost: this.cumulativeCost,
        newFactsAdded: step.newFactsAdded,
      });

      if (this.verbose) {
        console.log(
          `  [iter ${this.iteration}] tool=${step.tool}  +${step.newFactsAdded} facts  ` +
          `cost=$${iterCost.toFixed(4)}  cumul=$${this.cumulativeCost.toFixed(4)}  ` +
          `${durationMs}ms`
        );
        if (step.thought) {
          console.log(`           thought: "${step.thought}"`);
        }
      }

      // ── Agent says it's done ──────────────────────────────────────
      if (step.done) {
        this.stopReason = 'AGENT_DONE: agent declared completion';
        break;
      }

      // ── Check cost cap ────────────────────────────────────────────
      if (this.cumulativeCost >= this.maxCostUsd) {
        this.stopReason = `COST_CAP: cumulative cost $${this.cumulativeCost.toFixed(4)} >= $${this.maxCostUsd}`;
        break;
      }

      // ── Check convergence ─────────────────────────────────────────
      if (step.newFactsAdded === 0) {
        this.convergenceCounter++;
        if (this.convergenceCounter >= this.convergenceWindow) {
          this.stopReason = `CONVERGENCE: ${this.convergenceWindow} consecutive iterations added no new facts`;
          break;
        }
      } else {
        this.convergenceCounter = 0;  // reset on productive iteration
      }
    }

    if (this.verbose) {
      console.log(`\n  STOP: ${this.stopReason}\n`);
    }

    this.tracer.printSummary();

    return {
      stopReason: this.stopReason,
      totalIterations: this.tracer.entries.length,
      totalCost: this.cumulativeCost,
      traceFile: this.tracer.filePath,
    };
  }

  /**
   * Postmortem Loop — analyze what went wrong and map failures to fixes.
   *
   * Runs after a completed run() call. Inspects the stop reason and trace
   * entries to identify failure patterns and produce actionable recommendations.
   *
   * Failure pattern taxonomy:
   *   - context_miss        → agent searched but didn't find what it needed
   *   - bad_tool_result     → tool returned data the agent couldn't use
   *   - wasteful_action     → high-cost iteration with zero payoff
   *   - hallucinated_tool_loop → same tool+input repeated in a tight loop
   *   - convergence_stall   → ran out of productive moves
   *   - cost_overrun        → budget burned before task completed
   *   - iteration_cap       → hit the hard iteration limit
   *   - tool_imbalance      → over-reliance on a single tool
   *
   * @param {object} runResult — the object returned by run()
   * @param {object[]} traceEntries — this.tracer.entries (or a subset)
   * @returns {{ findings: object[], recommendations: string[] }}
   */
  postmortem(runResult, traceEntries) {
    const findings = [];
    const recommendations = [];

    const stopType = runResult.stopReason?.split(':')[0] ?? 'UNKNOWN';

    // ── Convergence stall ───────────────────────────────────────────
    if (stopType === 'CONVERGENCE') {
      const staleStart = traceEntries.length - this.convergenceWindow;
      const staleEntries = traceEntries.slice(Math.max(0, staleStart));
      const toolsUsed = [...new Set(staleEntries.map((e) => e.tool))];

      findings.push({
        type: 'convergence_stall',
        iteration: staleStart + 1,
        description: `Agent produced no new facts for ${this.convergenceWindow} consecutive iterations. ` +
          `Tools used during stall: [${toolsUsed.join(', ')}].`,
        suggestedFix: 'Add a re-planning step that detects repeated zero-fact iterations and switches strategy — ' +
          'try different search terms, broaden/narrow scope, or switch tools.',
      });
      recommendations.push('Implement adaptive planning: after 2 zero-fact iterations, force a tool or query change.');
    }

    // ── Cost overrun ────────────────────────────────────────────────
    if (stopType === 'COST_CAP') {
      const productiveIters = traceEntries.filter((e) => e.new_facts_added > 0).length;
      const wastedCost = traceEntries
        .filter((e) => e.new_facts_added === 0)
        .reduce((sum, e) => sum + e.cost_usd, 0);

      findings.push({
        type: 'cost_overrun',
        iteration: runResult.totalIterations,
        description: `Hit cost cap at $${runResult.totalCost.toFixed(4)}. ` +
          `${productiveIters}/${runResult.totalIterations} iterations were productive. ` +
          `$${wastedCost.toFixed(4)} spent on zero-fact iterations.`,
        suggestedFix: 'Front-load cheaper tools (search) before expensive ones (page reads). ' +
          'Set per-iteration cost budgets. Kill unproductive tool calls earlier.',
      });
      recommendations.push(`Reduce waste: ${Math.round((1 - productiveIters / runResult.totalIterations) * 100)}% of spend produced no new facts.`);
    }

    // ── Iteration cap ───────────────────────────────────────────────
    if (stopType === 'ITERATION_CAP') {
      const factsTotal = traceEntries.reduce((sum, e) => sum + e.new_facts_added, 0);
      const lastProductiveIter = findLastProductiveIteration(traceEntries);

      findings.push({
        type: 'iteration_cap',
        iteration: runResult.totalIterations,
        description: `Hit iteration cap (${this.maxIterations}). ` +
          `Gathered ${factsTotal} facts. Last productive iteration: ${lastProductiveIter}.`,
        suggestedFix: lastProductiveIter < runResult.totalIterations - 3
          ? 'Agent was unproductive in its final iterations — tighten convergence window or add early-exit logic.'
          : 'Agent was still productive when cut off — raise iteration cap or prioritize higher-value actions earlier.',
      });
      recommendations.push(
        lastProductiveIter < runResult.totalIterations - 3
          ? 'Lower convergence window — agent was spinning without progress before hitting the cap.'
          : 'Raise iteration cap or budget more tokens for this query complexity.'
      );
    }

    // ── Scan all entries for per-iteration issues ───────────────────
    const toolUsageCounts = {};
    let consecutiveSameTool = 0;
    let prevTool = null;

    for (let i = 0; i < traceEntries.length; i++) {
      const entry = traceEntries[i];
      const tool = entry.tool;

      toolUsageCounts[tool] = (toolUsageCounts[tool] || 0) + 1;

      // Detect repeated identical tool calls (potential hallucinated loop)
      if (tool === prevTool) {
        consecutiveSameTool++;
        if (consecutiveSameTool >= 3) {
          const inputs = traceEntries.slice(i - 2, i + 1).map((e) => JSON.stringify(e.tool_input));
          const allSame = inputs.every((inp) => inp === inputs[0]);
          if (allSame) {
            findings.push({
              type: 'hallucinated_tool_loop',
              iteration: i - 1,
              description: `Tool "${tool}" called ${consecutiveSameTool + 1}x in a row with identical inputs.`,
              suggestedFix: 'Add deduplication: track (tool, input) pairs and block exact repeats. ' +
                'If the agent needs to retry, force it to vary the input.',
            });
          }
        }
      } else {
        consecutiveSameTool = 0;
      }
      prevTool = tool;

      // Detect context miss: back-to-back searches both returning nothing
      if (tool === 'webSearch' && i > 0 && traceEntries[i - 1].tool === 'webSearch' &&
          entry.new_facts_added === 0 && traceEntries[i - 1].new_facts_added === 0) {
        findings.push({
          type: 'context_miss',
          iteration: i + 1,
          description: `Back-to-back searches at iterations ${i} and ${i + 1} both returned zero new facts. ` +
            `The agent couldn't find what it needed.`,
          suggestedFix: 'Add a retrieval rule: after a zero-result search, reformulate the query ' +
            '(synonyms, broader scope) or switch to a different information source.',
        });
      }

      // Detect bad tool result: tool consumed tokens but produced nothing
      if (tool === 'readPage' && entry.new_facts_added === 0 && entry.tokens_out > 200) {
        findings.push({
          type: 'bad_tool_result',
          iteration: i + 1,
          description: `readPage at iteration ${i + 1} consumed ${entry.tokens_out} output tokens but added 0 facts. ` +
            `The page content didn't match what the agent expected.`,
          suggestedFix: 'Validate page content before full extraction — check for relevance markers ' +
            'in the first 500 chars. Add a content-type check to avoid parsing error pages.',
        });
      }

      // Detect wasteful action: high cost iteration with zero payoff
      if (entry.new_facts_added === 0 && entry.cost_usd > 0.01) {
        findings.push({
          type: 'wasteful_action',
          iteration: i + 1,
          description: `Iteration ${i + 1} cost $${entry.cost_usd.toFixed(4)} but produced zero facts.`,
          suggestedFix: 'Gate expensive operations behind a relevance check. ' +
            'Consider a two-phase approach: cheap probe first, then commit to the full operation.',
        });
      }
    }

    // ── Tool distribution warnings ──────────────────────────────────
    const totalCalls = traceEntries.length;
    for (const [tool, count] of Object.entries(toolUsageCounts)) {
      const pct = count / totalCalls;
      if (pct > 0.6 && totalCalls > 4) {
        findings.push({
          type: 'tool_imbalance',
          iteration: null,
          description: `"${tool}" accounts for ${Math.round(pct * 100)}% of all tool calls (${count}/${totalCalls}). ` +
            `The agent may be over-relying on one approach.`,
          suggestedFix: 'Encourage tool diversity in the planning phase. ' +
            'After 2 consecutive calls to the same tool, prompt the agent to consider alternatives.',
        });
      }
    }

    // ── Dedup findings by type+iteration ────────────────────────────
    const seen = new Set();
    const dedupedFindings = findings.filter((f) => {
      const key = `${f.type}:${f.iteration}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // ── Always provide at least one recommendation ──────────────────
    if (recommendations.length === 0 && stopType === 'AGENT_DONE') {
      const wasteRatio = traceEntries.filter((e) => e.new_facts_added === 0).length / totalCalls;
      if (wasteRatio > 0.3) {
        recommendations.push(`${Math.round(wasteRatio * 100)}% of iterations produced no facts — review tool selection efficiency.`);
      } else {
        recommendations.push('Run completed successfully. No critical issues detected.');
      }
    }

    return { findings: dedupedFindings, recommendations };
  }
}

// ── Postmortem helpers ─────────────────────────────────────────────────

function findLastProductiveIteration(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].new_facts_added > 0) return i + 1;
  }
  return 0;
}
