/**
 * Markdown report generator.
 * Produces a human-readable eval report with per-question scores,
 * aggregate metrics, and regression analysis.
 */

import { writeFileSync } from 'fs';
import { formatRegressionDetails } from './regression.js';

/**
 * Generate the full markdown eval report.
 *
 * @param {Object} params
 * @param {Object} params.results       - Eval results with per-question scores
 * @param {Object} params.regression    - Regression detection report
 * @param {Object} params.meta          - Run metadata (timestamp, RAG system info)
 * @returns {string} Markdown report
 */
export function generateReport({ results, regression, meta }) {
  const lines = [];

  // Header
  lines.push('# RAG Eval Report');
  lines.push('');
  lines.push(`**Date:** ${meta.timestamp}`);
  lines.push(`**RAG System:** ${meta.ragSystem || 'Unknown'}`);
  lines.push(`**Golden Set Version:** ${meta.goldenSetVersion || 'Unknown'}`);
  lines.push(`**Questions Evaluated:** ${results.questions.length}`);
  lines.push(`**Eval Duration:** ${meta.durationMs ? (meta.durationMs / 1000).toFixed(1) + 's' : 'N/A'}`);
  lines.push('');

  // Pass/Fail verdict
  const passed = !regression.hasRegressions;
  lines.push(`## Verdict: ${passed ? 'PASS' : 'FAIL'}`);
  lines.push('');
  if (!passed) {
    lines.push('> Regressions detected. See details below.');
  } else if (!regression.hasBaseline) {
    lines.push('> First run — no baseline to compare. This run becomes the baseline.');
  } else {
    lines.push('> No regressions detected against baseline.');
  }
  lines.push('');

  // Aggregate metrics
  lines.push('## Aggregate Scores');
  lines.push('');
  lines.push('| Dimension | Score | Baseline | Change |');
  lines.push('|-----------|-------|----------|--------|');

  const dimensions = ['faithfulness', 'relevance', 'completeness', 'composite'];
  for (const dim of dimensions) {
    const score = results.aggregate[dim]?.toFixed(2) ?? 'N/A';
    const baseline = regression.aggregateDiff?.[dim]?.baseline?.toFixed(2) ?? '—';
    const change = regression.aggregateDiff?.[dim]?.diff;
    const changeStr = change !== undefined
      ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}`
      : '—';
    lines.push(`| ${dim} | ${score} | ${baseline} | ${changeStr} |`);
  }
  lines.push('');

  // Score distribution
  lines.push('## Score Distribution');
  lines.push('');
  const dist = computeDistribution(results.questions);
  lines.push('| Score | Faithfulness | Relevance | Completeness |');
  lines.push('|-------|-------------|-----------|-------------|');
  for (let s = 5; s >= 1; s--) {
    lines.push(`| ${s} | ${dist.faithfulness[s] || 0} | ${dist.relevance[s] || 0} | ${dist.completeness[s] || 0} |`);
  }
  lines.push('');

  // Regression details
  if (regression.hasBaseline) {
    lines.push(formatRegressionDetails(regression));
    lines.push('');
  }

  // Per-question breakdown
  lines.push('## Per-Question Results');
  lines.push('');
  lines.push('| ID | Question | Faith. | Relev. | Compl. | Composite | Status |');
  lines.push('|----|----------|--------|--------|--------|-----------|--------|');

  for (const q of results.questions) {
    const faith = q.scores.faithfulness?.score ?? '?';
    const relev = q.scores.relevance?.score ?? '?';
    const compl = q.scores.completeness?.score ?? '?';
    const comp = q.scores.composite?.toFixed(2) ?? '?';

    // Determine status
    let status = 'OK';
    if (regression.hasBaseline) {
      const regressed = regression.regressions.find(r => r.id === q.id);
      const improved = regression.improvements.find(i => i.id === q.id);
      if (regressed) status = 'REGRESSED';
      else if (improved) status = 'IMPROVED';
    }

    const shortQ = q.question.length > 50
      ? q.question.slice(0, 47) + '...'
      : q.question;
    lines.push(`| ${q.id} | ${shortQ} | ${faith} | ${relev} | ${compl} | ${comp} | ${status} |`);
  }
  lines.push('');

  // Detailed justifications for low scores and regressions
  const problemQuestions = results.questions.filter(q => {
    const minScore = Math.min(
      q.scores.faithfulness?.score ?? 5,
      q.scores.relevance?.score ?? 5,
      q.scores.completeness?.score ?? 5
    );
    return minScore <= 3;
  });

  if (problemQuestions.length > 0) {
    lines.push('## Low-Score Details');
    lines.push('');
    for (const q of problemQuestions) {
      lines.push(`### ${q.id}: ${q.question}`);
      lines.push('');
      for (const dim of ['faithfulness', 'relevance', 'completeness']) {
        const s = q.scores[dim];
        if (s && s.score <= 3) {
          lines.push(`**${dim}** (${s.score}/5): ${s.justification || 'No justification'}`);
          if (s.unsupported_claims?.length > 0) {
            lines.push(`  - Unsupported claims: ${s.unsupported_claims.join('; ')}`);
          }
          if (s.missing_points?.length > 0) {
            lines.push(`  - Missing points: ${s.missing_points.join('; ')}`);
          }
        }
      }
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push(`*Generated by RAG Eval Harness v1.0.0 at ${meta.timestamp}*`);

  return lines.join('\n');
}

/**
 * Write a report to a file.
 */
export function writeReport(reportPath, content) {
  writeFileSync(reportPath, content, 'utf-8');
}

/**
 * Compute score distribution across questions.
 */
function computeDistribution(questions) {
  const dist = {
    faithfulness: {},
    relevance: {},
    completeness: {},
  };

  for (const q of questions) {
    for (const dim of ['faithfulness', 'relevance', 'completeness']) {
      const score = q.scores[dim]?.score;
      if (score) {
        dist[dim][score] = (dist[dim][score] || 0) + 1;
      }
    }
  }

  return dist;
}
