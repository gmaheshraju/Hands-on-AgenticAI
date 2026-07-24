import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export class Harness {
  constructor(opts = {}) {
    this.maxIterations = opts.maxIterations ?? 15;
    this.maxCostUsd = opts.maxCostUsd ?? 0.50;
    this.convergenceWindow = opts.convergenceWindow ?? 3;
    this.traceDir = opts.traceDir ?? './data/traces';
    this.verbose = opts.verbose ?? true;
    this.entries = [];
    this.totalCost = 0;
  }

  async run(stepFn) {
    mkdirSync(this.traceDir, { recursive: true });
    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    let zeroFactStreak = 0;
    let stopReason = 'MAX_ITERATIONS';

    if (this.verbose) {
      console.log(`  ${'Iter'.padEnd(5)} ${'Tool'.padEnd(20)} ${'Time'.padEnd(8)} ${'Tok In'.padEnd(8)} ${'Tok Out'.padEnd(8)} ${'Cost'.padEnd(10)} Facts`);
      console.log('  ' + '-'.repeat(75));
    }

    for (let i = 1; i <= this.maxIterations; i++) {
      const start = Date.now();
      let step;

      try {
        step = await stepFn(i);
      } catch (err) {
        if (this.verbose) console.log(`  [${i}] Step error: ${err.message}`);
        this.entries.push({ iteration: i, error: err.message, timestamp: new Date().toISOString() });
        continue;
      }

      const durationMs = Date.now() - start;
      const iterCost = this._estimateCost(step.tokensIn, step.tokensOut);
      this.totalCost += iterCost;

      const entry = {
        iteration: i,
        timestamp: new Date().toISOString(),
        thought: step.thought,
        tool: step.tool,
        toolInput: step.toolInput,
        toolResult: step.toolResult?.slice(0, 500),
        durationMs,
        tokensIn: step.tokensIn,
        tokensOut: step.tokensOut,
        costUsd: iterCost,
        cumulativeCost: this.totalCost,
        newFactsAdded: step.newFactsAdded || 0,
        done: step.done || false,
      };
      this.entries.push(entry);

      if (this.verbose) {
        console.log(
          `  ${String(i).padEnd(5)} ${(step.tool || 'think').padEnd(20)} ${(durationMs + 'ms').padEnd(8)} ` +
          `${String(step.tokensIn || 0).padEnd(8)} ${String(step.tokensOut || 0).padEnd(8)} ` +
          `${'$' + iterCost.toFixed(4).padEnd(9)} ${step.newFactsAdded || 0}`
        );
      }

      if (step.done) {
        stopReason = 'AGENT_DONE';
        break;
      }

      if (this.totalCost >= this.maxCostUsd) {
        stopReason = 'COST_CAP';
        break;
      }

      if (step.newFactsAdded === 0) {
        zeroFactStreak++;
        if (zeroFactStreak >= this.convergenceWindow) {
          stopReason = 'CONVERGENCE';
          break;
        }
      } else {
        zeroFactStreak = 0;
      }
    }

    const traceFile = join(this.traceDir, `trace-${runId}.jsonl`);
    const traceContent = this.entries.map(e => JSON.stringify(e)).join('\n');
    writeFileSync(traceFile, traceContent);

    return {
      runId,
      stopReason,
      totalIterations: this.entries.length,
      totalCost: this.totalCost,
      traceEntries: this.entries,
      traceFile,
    };
  }

  _estimateCost(tokensIn, tokensOut) {
    return ((tokensIn || 0) * 0.4 + (tokensOut || 0) * 0.4) / 1_000_000;
  }
}
