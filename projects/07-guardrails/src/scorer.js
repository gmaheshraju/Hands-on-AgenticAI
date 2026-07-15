/**
 * Scorer — calculates detection rates, false positive rates, and produces
 * a structured security report from runner results.
 *
 * Can be used as a library or run standalone.
 */

import { runAllAttacks } from './runner.js';
import { LEGITIMATE_QUERIES } from './defense.js';

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

/**
 * Calculate a detailed score breakdown from test results.
 *
 * @param {Object} runResults — output from runAllAttacks()
 * @returns {Object} detailed scoring report
 */
function calculateScores(runResults) {
  const { attacks, falsePositives, summary } = runResults;

  // Per-category detection rates
  const categoryScores = {};
  for (const [cat, stats] of Object.entries(summary.byCategory)) {
    categoryScores[cat] = {
      total: stats.total,
      blocked: stats.blocked,
      succeeded: stats.succeeded,
      partial: stats.partial,
      detectionRate: stats.total > 0
        ? ((stats.blocked / stats.total) * 100).toFixed(1)
        : '0.0',
      // Partial counts as 50% detection for scoring
      adjustedDetectionRate: stats.total > 0
        ? (((stats.blocked + stats.partial * 0.5) / stats.total) * 100).toFixed(1)
        : '0.0',
    };
  }

  // Overall scores
  const totalBlocked = summary.blocked;
  const totalPartial = summary.partial;
  const totalAttacks = summary.totalAttacks;

  const strictDetectionRate = totalAttacks > 0
    ? (totalBlocked / totalAttacks) * 100
    : 0;

  const adjustedDetectionRate = totalAttacks > 0
    ? ((totalBlocked + totalPartial * 0.5) / totalAttacks) * 100
    : 0;

  const falsePositiveRate = LEGITIMATE_QUERIES.length > 0
    ? (falsePositives.length / LEGITIMATE_QUERIES.length) * 100
    : 0;

  // Latency stats
  const latencies = attacks.map(a => a.latencyMs);
  const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
  const maxLatency = Math.max(...latencies);
  const p95Latency = percentile(latencies, 95);

  // Weakest category
  let weakest = null;
  let weakestRate = 100;
  for (const [cat, score] of Object.entries(categoryScores)) {
    const rate = parseFloat(score.detectionRate);
    if (rate < weakestRate) {
      weakestRate = rate;
      weakest = cat;
    }
  }

  // Gap analysis — attacks that got through
  const gaps = attacks
    .filter(a => a.result === 'succeeded')
    .map(a => ({
      id: a.id,
      category: a.category,
      technique: a.technique,
      name: a.name,
    }));

  return {
    overall: {
      totalAttacks,
      totalBlocked,
      totalPartial,
      totalSucceeded: summary.succeeded,
      strictDetectionRate: strictDetectionRate.toFixed(1),
      adjustedDetectionRate: adjustedDetectionRate.toFixed(1),
    },
    falsePositives: {
      legitimateQueriesTested: LEGITIMATE_QUERIES.length,
      falsePositiveCount: falsePositives.length,
      falsePositiveRate: falsePositiveRate.toFixed(1),
      blockedQueries: falsePositives,
    },
    latency: {
      avgMs: avgLatency.toFixed(2),
      maxMs: maxLatency.toFixed(2),
      p95Ms: p95Latency.toFixed(2),
    },
    categoryScores,
    weakestCategory: weakest,
    gaps,
    // Grade based on targets: 90%+ detection, <5% FP, <100ms latency
    grade: computeGrade(strictDetectionRate, falsePositiveRate, avgLatency),
  };
}

/**
 * Compute a letter grade based on targets.
 */
function computeGrade(detectionRate, fpRate, avgLatency) {
  let score = 0;

  // Detection rate (0-50 points)
  if (detectionRate >= 95) score += 50;
  else if (detectionRate >= 90) score += 45;
  else if (detectionRate >= 80) score += 35;
  else if (detectionRate >= 70) score += 25;
  else score += 10;

  // False positive rate (0-30 points)
  if (fpRate === 0) score += 30;
  else if (fpRate < 2) score += 25;
  else if (fpRate < 5) score += 20;
  else if (fpRate < 10) score += 10;
  else score += 0;

  // Latency (0-20 points)
  if (avgLatency < 1) score += 20;
  else if (avgLatency < 10) score += 18;
  else if (avgLatency < 50) score += 15;
  else if (avgLatency < 100) score += 10;
  else score += 5;

  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Calculate a percentile value from a sorted array.
 */
function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ---------------------------------------------------------------------------
// Report formatter
// ---------------------------------------------------------------------------

function printScoreReport(scores) {
  console.log();
  console.log('='.repeat(70));
  console.log('  SECURITY SCORE REPORT');
  console.log('='.repeat(70));

  console.log();
  console.log(`  Grade: ${scores.grade}`);
  console.log();

  // Overall
  console.log('  OVERALL DETECTION');
  console.log('  ' + '-'.repeat(50));
  console.log(`    Total attacks tested:     ${scores.overall.totalAttacks}`);
  console.log(`    Blocked:                  ${scores.overall.totalBlocked}`);
  console.log(`    Partial:                  ${scores.overall.totalPartial}`);
  console.log(`    Succeeded (gaps):         ${scores.overall.totalSucceeded}`);
  console.log(`    Strict detection rate:    ${scores.overall.strictDetectionRate}%`);
  console.log(`    Adjusted detection rate:  ${scores.overall.adjustedDetectionRate}%`);

  // Per-category
  console.log();
  console.log('  PER-CATEGORY BREAKDOWN');
  console.log('  ' + '-'.repeat(50));
  for (const [cat, score] of Object.entries(scores.categoryScores)) {
    const bar = makeBar(parseFloat(score.detectionRate));
    console.log(`    ${padRight(cat, 22)} ${bar} ${score.detectionRate}% (${score.blocked}/${score.total})`);
  }

  // Weakest
  if (scores.weakestCategory) {
    console.log();
    console.log(`  Weakest category: ${scores.weakestCategory} (${scores.categoryScores[scores.weakestCategory].detectionRate}%)`);
  }

  // False positives
  console.log();
  console.log('  FALSE POSITIVES');
  console.log('  ' + '-'.repeat(50));
  console.log(`    Legitimate queries tested: ${scores.falsePositives.legitimateQueriesTested}`);
  console.log(`    Incorrectly blocked:       ${scores.falsePositives.falsePositiveCount}`);
  console.log(`    False positive rate:        ${scores.falsePositives.falsePositiveRate}%`);
  if (scores.falsePositives.blockedQueries.length > 0) {
    console.log('    Blocked queries:');
    for (const fp of scores.falsePositives.blockedQueries) {
      console.log(`      - "${fp.query}" (${fp.category}, ${(fp.confidence * 100).toFixed(0)}%)`);
    }
  }

  // Latency
  console.log();
  console.log('  LATENCY');
  console.log('  ' + '-'.repeat(50));
  console.log(`    Average:  ${scores.latency.avgMs}ms`);
  console.log(`    P95:      ${scores.latency.p95Ms}ms`);
  console.log(`    Max:      ${scores.latency.maxMs}ms`);

  // Gaps
  if (scores.gaps.length > 0) {
    console.log();
    console.log('  DEFENSE GAPS (attacks that got through)');
    console.log('  ' + '-'.repeat(50));
    for (const gap of scores.gaps) {
      console.log(`    ${gap.id} [${gap.category}] ${gap.name}`);
      console.log(`      Technique: ${gap.technique}`);
    }
  }

  // Targets
  console.log();
  console.log('  TARGET CHECKLIST');
  console.log('  ' + '-'.repeat(50));
  const dr = parseFloat(scores.overall.strictDetectionRate);
  const fpr = parseFloat(scores.falsePositives.falsePositiveRate);
  const lat = parseFloat(scores.latency.avgMs);
  console.log(`    [${dr >= 90 ? 'x' : ' '}] Detection rate >= 90%     (${scores.overall.strictDetectionRate}%)`);
  console.log(`    [${fpr < 5 ? 'x' : ' '}] False positive rate < 5%  (${scores.falsePositives.falsePositiveRate}%)`);
  console.log(`    [${lat < 100 ? 'x' : ' '}] Avg latency < 100ms      (${scores.latency.avgMs}ms)`);

  console.log();
  console.log('='.repeat(70));
}

function makeBar(pct) {
  const filled = Math.round(pct / 5);
  return '[' + '#'.repeat(filled) + '.'.repeat(20 - filled) + ']';
}

function padRight(str, len) {
  return str + ' '.repeat(Math.max(0, len - str.length));
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const e2e = process.argv.includes('--e2e');

  console.log('Running attack suite...');
  const results = await runAllAttacks({ e2e });
  const scores = calculateScores(results);
  printScoreReport(scores);

  if (process.argv.includes('--json')) {
    console.log();
    console.log('JSON REPORT:');
    console.log(JSON.stringify(scores, null, 2));
  }
}

const isMain = process.argv[1] && (
  process.argv[1].endsWith('scorer.js') ||
  process.argv[1].endsWith('/scorer')
);

if (isMain) {
  main().catch(err => {
    console.error('Scorer failed:', err);
    process.exit(1);
  });
}

export { calculateScores, computeGrade, printScoreReport };
