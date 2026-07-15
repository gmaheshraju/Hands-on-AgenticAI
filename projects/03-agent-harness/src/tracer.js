/**
 * JSONL Trace Writer
 *
 * Every agent iteration produces a structured trace entry written as one
 * JSON line to a .jsonl file.  The tracer also keeps an in-memory buffer
 * so the demo can pretty-print a summary without re-parsing the file.
 */

import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class Tracer {
  /**
   * @param {object} opts
   * @param {string} [opts.outDir]  — directory for the trace file
   * @param {string} [opts.runId]   — unique run identifier (defaults to ISO timestamp)
   */
  constructor({ outDir = '.', runId } = {}) {
    this.runId = runId ?? new Date().toISOString().replace(/[:.]/g, '-');
    this.filePath = join(outDir, `trace-${this.runId}.jsonl`);
    this.entries = [];

    // Write an empty file so appendFileSync doesn't fail on first call
    writeFileSync(this.filePath, '');
  }

  /**
   * Record one iteration.
   *
   * @param {object} entry
   * @param {number} entry.iteration
   * @param {string} entry.phase         — observe | think | act | evaluate
   * @param {string} entry.thought       — what the agent decided to do
   * @param {string} entry.tool          — tool name called (or "none")
   * @param {object} entry.toolInput     — arguments passed to the tool
   * @param {number} entry.durationMs    — wall-clock ms for this iteration
   * @param {number} entry.tokensIn      — input tokens consumed
   * @param {number} entry.tokensOut     — output tokens generated
   * @param {number} entry.costUsd       — cost for this iteration
   * @param {number} entry.cumulativeCost — running total cost
   * @param {number} entry.newFactsAdded — facts added to the report this iteration
   * @param {string} [entry.convergenceNote] — why convergence triggered (if applicable)
   */
  log(entry) {
    const record = {
      timestamp: new Date().toISOString(),
      run_id: this.runId,
      iteration: entry.iteration,
      phase: entry.phase ?? 'act',
      thought: entry.thought,
      tool: entry.tool,
      tool_input: entry.toolInput,
      duration_ms: entry.durationMs,
      tokens_in: entry.tokensIn,
      tokens_out: entry.tokensOut,
      cost_usd: round6(entry.costUsd),
      cumulative_cost: round6(entry.cumulativeCost),
      new_facts_added: entry.newFactsAdded,
    };

    if (entry.convergenceNote) {
      record.convergence_note = entry.convergenceNote;
    }

    this.entries.push(record);
    appendFileSync(this.filePath, JSON.stringify(record) + '\n');
  }

  /** Pretty-print a summary table to stdout. */
  printSummary() {
    console.log('\n' + '='.repeat(90));
    console.log('TRACE SUMMARY');
    console.log('='.repeat(90));
    console.log(
      pad('Iter', 5) +
      pad('Tool', 18) +
      pad('Duration', 10) +
      pad('Tokens', 12) +
      pad('Cost', 10) +
      pad('Cumul $', 10) +
      pad('New Facts', 10)
    );
    console.log('-'.repeat(90));

    for (const e of this.entries) {
      console.log(
        pad(String(e.iteration), 5) +
        pad(e.tool, 18) +
        pad(e.duration_ms + 'ms', 10) +
        pad(`${e.tokens_in}/${e.tokens_out}`, 12) +
        pad('$' + e.cost_usd.toFixed(4), 10) +
        pad('$' + e.cumulative_cost.toFixed(4), 10) +
        pad(String(e.new_facts_added), 10)
      );
    }

    console.log('-'.repeat(90));
    const last = this.entries[this.entries.length - 1];
    console.log(`Total iterations: ${this.entries.length}  |  Total cost: $${last?.cumulative_cost.toFixed(4) ?? '0.0000'}  |  Trace file: ${this.filePath}`);
    console.log('='.repeat(90) + '\n');
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

function pad(str, width) {
  return String(str).padEnd(width);
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}
