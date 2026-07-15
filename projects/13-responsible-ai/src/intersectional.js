/**
 * Intersectional Analysis — detects compound bias when multiple demographic
 * attributes interact (e.g., gender + ethnicity).
 *
 * Key insight: bias can be non-additive. A system might show no gender bias
 * and no ethnicity bias individually, but discriminate against a specific
 * intersection (e.g., Black women).
 */

import { welchTTest, cohensD, demographicParity } from "./statistics.js";

/**
 * Run intersectional analysis on a set of scored resumes.
 *
 * Takes intersectional pairs (each tagged with multiple group memberships)
 * and their scores, then checks whether specific intersections are
 * disproportionately affected.
 *
 * @param {Array} scoredPairs — array of { groups: {attr: group}, score, decision }
 * @param {object} opts
 * @param {number} opts.minGroupSize — minimum samples per intersection (default 5)
 * @returns {object} intersectional analysis report
 */
export function analyzeIntersections(scoredPairs, opts = {}) {
  const { minGroupSize = 5 } = opts;

  // Group scores by intersection
  const intersections = {};
  for (const pair of scoredPairs) {
    const key = Object.entries(pair.groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([attr, group]) => `${attr}:${group}`)
      .join("+");

    if (!intersections[key]) {
      intersections[key] = {
        groups: { ...pair.groups },
        key,
        scores: [],
        decisions: [],
      };
    }
    intersections[key].scores.push(pair.score);
    intersections[key].decisions.push(pair.decision);
  }

  // Compute stats per intersection
  const intersectionStats = {};
  for (const [key, data] of Object.entries(intersections)) {
    if (data.scores.length < minGroupSize) continue;

    const positiveRate = data.decisions.filter(d => d === "advance").length / data.decisions.length;
    intersectionStats[key] = {
      groups: data.groups,
      sampleSize: data.scores.length,
      meanScore: round(mean(data.scores), 4),
      stdDev: round(Math.sqrt(variance(data.scores)), 4),
      positiveRate: round(positiveRate, 4),
      scores: data.scores,
    };
  }

  // Pairwise comparisons between all intersections
  const comparisons = [];
  const keys = Object.keys(intersectionStats);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = intersectionStats[keys[i]];
      const b = intersectionStats[keys[j]];

      const tTest = welchTTest(a.scores, b.scores);
      const effectSize = cohensD(a.scores, b.scores);
      const parity = demographicParity(a.positiveRate, b.positiveRate);

      comparisons.push({
        groupA: keys[i],
        groupB: keys[j],
        meanDiff: round(a.meanScore - b.meanScore, 4),
        tTest,
        effectSize,
        parity,
        compoundBias: tTest.significant && effectSize.magnitude !== "negligible",
      });
    }
  }

  // Detect non-additive effects
  const nonAdditiveEffects = detectNonAdditiveEffects(intersectionStats, scoredPairs);

  // Find most/least advantaged intersections
  const ranked = Object.entries(intersectionStats)
    .sort(([, a], [, b]) => b.meanScore - a.meanScore);

  const mostAdvantaged = ranked[0] ? { key: ranked[0][0], ...ranked[0][1] } : null;
  const leastAdvantaged = ranked[ranked.length - 1]
    ? { key: ranked[ranked.length - 1][0], ...ranked[ranked.length - 1][1] }
    : null;

  const maxGap = mostAdvantaged && leastAdvantaged
    ? round(mostAdvantaged.meanScore - leastAdvantaged.meanScore, 4)
    : 0;

  return {
    intersectionStats,
    comparisons: comparisons.filter(c => c.compoundBias),
    allComparisons: comparisons,
    nonAdditiveEffects,
    summary: {
      totalIntersections: Object.keys(intersectionStats).length,
      compoundBiasDetected: comparisons.some(c => c.compoundBias),
      mostAdvantaged: mostAdvantaged ? { key: mostAdvantaged.key, groups: mostAdvantaged.groups, meanScore: mostAdvantaged.meanScore } : null,
      leastAdvantaged: leastAdvantaged ? { key: leastAdvantaged.key, groups: leastAdvantaged.groups, meanScore: leastAdvantaged.meanScore } : null,
      maxScoreGap: maxGap,
      nonAdditiveEffectsFound: nonAdditiveEffects.length > 0,
    },
    findings: generateIntersectionalFindings(intersectionStats, comparisons, nonAdditiveEffects, maxGap),
  };
}

/**
 * Detect non-additive (synergistic) effects.
 *
 * If gender bias = X and ethnicity bias = Y, but the intersection shows
 * bias > X + Y, that's a non-additive effect indicating compounding
 * discrimination.
 */
function detectNonAdditiveEffects(intersectionStats, scoredPairs) {
  const effects = [];

  // Get the overall mean score
  const allScores = scoredPairs.map(p => p.score);
  const overallMean = mean(allScores);

  // Get marginal effects per attribute
  const marginals = {};
  for (const pair of scoredPairs) {
    for (const [attr, group] of Object.entries(pair.groups)) {
      const key = `${attr}:${group}`;
      if (!marginals[key]) marginals[key] = [];
      marginals[key].push(pair.score);
    }
  }

  const marginalMeans = {};
  for (const [key, scores] of Object.entries(marginals)) {
    marginalMeans[key] = mean(scores);
  }

  // For each intersection, check if the actual effect exceeds the sum of marginal effects
  for (const [intKey, stats] of Object.entries(intersectionStats)) {
    const parts = intKey.split("+");
    const marginalEffects = parts.map(part => (marginalMeans[part] || overallMean) - overallMean);
    const expectedEffect = marginalEffects.reduce((a, b) => a + b, 0);
    const actualEffect = stats.meanScore - overallMean;

    // Non-additive if actual deviates from expected by more than 0.5 points
    const nonAdditivity = actualEffect - expectedEffect;
    if (Math.abs(nonAdditivity) > 0.5) {
      effects.push({
        intersection: intKey,
        groups: stats.groups,
        actualEffect: round(actualEffect, 4),
        expectedAdditiveEffect: round(expectedEffect, 4),
        nonAdditivity: round(nonAdditivity, 4),
        direction: nonAdditivity > 0 ? "synergistic_advantage" : "synergistic_disadvantage",
        interpretation: nonAdditivity < 0
          ? `Compound penalty: ${intKey} scores ${Math.abs(round(nonAdditivity, 2))} points lower than the sum of individual attribute effects would predict. Bias compounds at this intersection.`
          : `Compound advantage: ${intKey} scores ${round(nonAdditivity, 2)} points higher than predicted by individual effects.`,
      });
    }
  }

  return effects;
}

function generateIntersectionalFindings(stats, comparisons, nonAdditiveEffects, maxGap) {
  const findings = [];

  const compoundBias = comparisons.filter(c => c.compoundBias);
  if (compoundBias.length > 0) {
    findings.push({
      severity: "CRITICAL",
      type: "intersectional_bias",
      detail: `Found ${compoundBias.length} statistically significant intersectional disparities. Maximum score gap: ${maxGap} points.`,
      recommendation: "Intersectional bias requires targeted mitigation. Standard single-attribute fairness constraints may be insufficient. Consider multi-attribute fairness constraints or group-specific calibration.",
    });
  }

  for (const effect of nonAdditiveEffects) {
    if (effect.direction === "synergistic_disadvantage") {
      findings.push({
        severity: "CRITICAL",
        type: "compound_discrimination",
        detail: effect.interpretation,
        recommendation: `The intersection ${effect.intersection} experiences compounding discrimination beyond what individual attribute analysis would reveal. This intersection needs dedicated testing and mitigation.`,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      severity: "INFO",
      type: "no_compound_bias",
      detail: "No significant intersectional bias detected. Individual attribute effects appear additive.",
      recommendation: "Continue monitoring intersections as model updates may introduce compound effects.",
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
}

function round(n, decimals) {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
