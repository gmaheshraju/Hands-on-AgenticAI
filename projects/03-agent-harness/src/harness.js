/**
 * Observable Agent Harness
 *
 * The harness wraps any agent loop and enforces three termination conditions:
 *   1. Iteration cap   — hard stop after N iterations
 *   2. Cost cap        — hard stop after $X total spend
 *   3. Convergence     — stop when K consecutive iterations add zero new facts
 *
 * Every iteration is traced to a JSONL file via the Tracer.
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
}
