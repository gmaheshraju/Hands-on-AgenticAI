/**
 * Regression detection: compare current eval run against a saved baseline.
 *
 * Flags:
 *  - Per-question regressions (any dimension drops > 1 point)
 *  - Aggregate regressions (overall metric drops > 5%)
 *  - Generates a diff summary: N regressed, N improved, N unchanged
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const REGRESSION_THRESHOLD_POINTS = 1;    // Flag if any dimension drops more than this
const AGGREGATE_THRESHOLD_PERCENT = 0.05; // Flag if aggregate drops more than 5%
const IMPROVEMENT_THRESHOLD_POINTS = 1;   // Count as improved if any dimension gains more than this

/**
 * Load a baseline file. Returns null if not found.
 */
export function loadBaseline(baselinePath) {
  if (!existsSync(baselinePath)) {
    return null;
  }
  const raw = readFileSync(baselinePath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Save current results as a new baseline.
 */
export function saveBaseline(baselinePath, results) {
  const dir = dirname(baselinePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const baseline = {
    timestamp: new Date().toISOString(),
    version: results.version || '1.0.0',
    aggregate: results.aggregate,
    questions: results.questions.map(q => ({
      id: q.id,
      question: q.question,
      scores: {
        faithfulness: q.scores.faithfulness.score,
        relevance: q.scores.relevance.score,
        completeness: q.scores.completeness.score,
        composite: q.scores.composite,
      },
    })),
  };

  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
  return baseline;
}

/**
 * Compare current results against baseline.
 * Returns a detailed regression report.
 */
export function detectRegressions(currentResults, baseline) {
  if (!baseline) {
    return {
      hasBaseline: false,
      hasRegressions: false,
      aggregateRegression: false,
      summary: 'No baseline found — this run becomes the new baseline.',
      regressions: [],
      improvements: [],
      unchanged: [],
      aggregateDiff: null,
    };
  }

  const dimensions = ['faithfulness', 'relevance', 'completeness'];
  const regressions = [];
  const improvements = [];
  const unchanged = [];

  // Build a lookup from baseline
  const baselineByID = {};
  for (const q of baseline.questions) {
    baselineByID[q.id] = q;
  }

  // Per-question comparison
  for (const current of currentResults.questions) {
    const base = baselineByID[current.id];
    if (!base) {
      // New question, not in baseline
      unchanged.push({
        id: current.id,
        question: current.question,
        note: 'New question — not in baseline',
      });
      continue;
    }

    let questionRegressed = false;
    let questionImproved = false;
    const diffs = {};

    for (const dim of dimensions) {
      const currentScore = current.scores[dim]?.score ?? current.scores[dim] ?? 0;
      const baseScore = base.scores[dim] ?? 0;
      const diff = currentScore - baseScore;
      diffs[dim] = { current: currentScore, baseline: baseScore, diff };

      if (diff < -REGRESSION_THRESHOLD_POINTS) {
        questionRegressed = true;
      }
      if (diff > IMPROVEMENT_THRESHOLD_POINTS) {
        questionImproved = true;
      }
    }

    // Composite diff
    const currentComposite = current.scores.composite ?? 0;
    const baseComposite = base.scores.composite ?? 0;
    diffs.composite = {
      current: currentComposite,
      baseline: baseComposite,
      diff: currentComposite - baseComposite,
    };

    const entry = {
      id: current.id,
      question: current.question,
      diffs,
    };

    if (questionRegressed) {
      regressions.push(entry);
    } else if (questionImproved) {
      improvements.push(entry);
    } else {
      unchanged.push(entry);
    }
  }

  // Aggregate comparison
  const currentAggregate = currentResults.aggregate;
  const baseAggregate = baseline.aggregate;
  let aggregateRegression = false;
  const aggregateDiff = {};

  if (baseAggregate) {
    for (const dim of [...dimensions, 'composite']) {
      const curr = currentAggregate?.[dim] ?? 0;
      const base = baseAggregate?.[dim] ?? 0;
      const diff = curr - base;
      const pctChange = base > 0 ? diff / base : 0;
      aggregateDiff[dim] = { current: curr, baseline: base, diff, pctChange };

      if (pctChange < -AGGREGATE_THRESHOLD_PERCENT) {
        aggregateRegression = true;
      }
    }
  }

  const hasRegressions = regressions.length > 0 || aggregateRegression;

  const summary = [
    `${regressions.length} question(s) regressed`,
    `${improvements.length} improved`,
    `${unchanged.length} unchanged`,
  ].join(', ');

  return {
    hasBaseline: true,
    hasRegressions,
    aggregateRegression,
    summary,
    regressions,
    improvements,
    unchanged,
    aggregateDiff,
  };
}

/**
 * Format regression details for human consumption.
 */
export function formatRegressionDetails(report) {
  const lines = [];

  if (!report.hasBaseline) {
    lines.push('No baseline to compare against.');
    return lines.join('\n');
  }

  lines.push(`## Regression Summary: ${report.summary}`);
  lines.push('');

  if (report.aggregateRegression) {
    lines.push('### AGGREGATE REGRESSION DETECTED');
    for (const [dim, diff] of Object.entries(report.aggregateDiff)) {
      if (diff.pctChange < -AGGREGATE_THRESHOLD_PERCENT) {
        lines.push(`  - ${dim}: ${diff.baseline.toFixed(2)} -> ${diff.current.toFixed(2)} (${(diff.pctChange * 100).toFixed(1)}%)`);
      }
    }
    lines.push('');
  }

  if (report.regressions.length > 0) {
    lines.push('### Per-Question Regressions');
    for (const reg of report.regressions) {
      lines.push(`\n**${reg.id}**: ${reg.question}`);
      for (const [dim, diff] of Object.entries(reg.diffs)) {
        if (diff.diff < -REGRESSION_THRESHOLD_POINTS) {
          lines.push(`  - ${dim}: ${diff.baseline} -> ${diff.current} (${diff.diff > 0 ? '+' : ''}${diff.diff})`);
        }
      }
    }
    lines.push('');
  }

  if (report.improvements.length > 0) {
    lines.push('### Improvements');
    for (const imp of report.improvements) {
      lines.push(`- **${imp.id}**: ${imp.question}`);
      for (const [dim, diff] of Object.entries(imp.diffs)) {
        if (diff.diff > IMPROVEMENT_THRESHOLD_POINTS) {
          lines.push(`  - ${dim}: ${diff.baseline} -> ${diff.current} (+${diff.diff})`);
        }
      }
    }
  }

  return lines.join('\n');
}
