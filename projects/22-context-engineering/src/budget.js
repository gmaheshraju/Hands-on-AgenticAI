// budget.js — Token budget manager

import { sortByPriority, groupByType, totalTokens } from './sources.js';

/**
 * Token budget manager.
 * Handles allocation of a fixed token budget across heterogeneous sources.
 */
export class TokenBudget {
  /**
   * @param {number} total - Total token budget (e.g., 4096)
   * @param {object} opts - { outputBuffer: fraction reserved for model output (default 0.25) }
   */
  constructor(total, opts = {}) {
    this.total = total;
    this.outputBufferFraction = opts.outputBuffer ?? 0.25;
    this.outputBuffer = Math.floor(total * this.outputBufferFraction);
    this.available = total - this.outputBuffer;
    this.systemReserved = 0;
  }

  /**
   * Allocate sources within the available budget.
   * System prompts are always included (reserved). Remaining budget is
   * distributed to other sources by priority.
   *
   * @param {Array} sources - Array of source objects
   * @returns {object} Allocation plan
   */
  allocate(sources) {
    const sorted = sortByPriority(sources);
    const included = [];
    const truncated = [];
    const dropped = [];
    let usedTokens = 0;
    let remaining = this.available;

    // First pass: reserve system prompts (priority 0, never dropped)
    for (const source of sorted) {
      if (source.type.priority === 0) {
        included.push({ ...source, allocatedTokens: source.tokens });
        usedTokens += source.tokens;
        remaining -= source.tokens;
        this.systemReserved = usedTokens;
      }
    }

    // Second pass: fit remaining sources by priority order
    const nonSystem = sorted.filter(s => s.type.priority !== 0);
    for (const source of nonSystem) {
      if (remaining <= 0) {
        dropped.push({ ...source, reason: 'budget_exhausted' });
        continue;
      }

      if (source.tokens <= remaining) {
        // Fits entirely
        included.push({ ...source, allocatedTokens: source.tokens });
        usedTokens += source.tokens;
        remaining -= source.tokens;
      } else if (remaining >= 50) {
        // Partial fit — truncate to remaining budget
        truncated.push({
          ...source,
          allocatedTokens: remaining,
          originalTokens: source.tokens,
          reason: 'truncated_to_fit',
        });
        usedTokens += remaining;
        remaining = 0;
      } else {
        // Too little remaining to be useful
        dropped.push({ ...source, reason: 'insufficient_remaining' });
      }
    }

    return {
      included,
      truncated,
      dropped,
      budget: {
        total: this.total,
        outputBuffer: this.outputBuffer,
        available: this.available,
        used: usedTokens,
        remaining,
        systemReserved: this.systemReserved,
      },
    };
  }

  /**
   * Generate a human-readable budget breakdown report.
   */
  report(plan) {
    const lines = [];
    lines.push(`Total budget: ${plan.budget.total} tokens`);
    lines.push(`Output buffer: ${plan.budget.outputBuffer} tokens (${Math.round(this.outputBufferFraction * 100)}%)`);
    lines.push(`Available for context: ${plan.budget.available} tokens`);
    lines.push('');

    // Group included + truncated by type
    const allKept = [...plan.included, ...plan.truncated];
    const groups = groupByType(allKept);

    for (const [typeName, sources] of Object.entries(groups)) {
      const label = sources[0].type.label;
      const allocated = sources.reduce((s, x) => s + x.allocatedTokens, 0);
      const original = sources.reduce((s, x) => s + (x.originalTokens || x.tokens), 0);
      const count = sources.length;
      lines.push(`  ${label}: ${allocated}/${original} tokens (${count} source${count > 1 ? 's' : ''})`);
    }

    if (plan.dropped.length > 0) {
      const droppedTokens = totalTokens(plan.dropped);
      const types = [...new Set(plan.dropped.map(d => d.type.label))];
      lines.push(`  Dropped: ${plan.dropped.length} sources (${droppedTokens} tokens) [${types.join(', ')}]`);
    }

    lines.push('');
    lines.push(`Used: ${plan.budget.used}/${plan.budget.available} tokens (${Math.round(plan.budget.used / plan.budget.available * 100)}%)`);

    return lines.join('\n');
  }
}
