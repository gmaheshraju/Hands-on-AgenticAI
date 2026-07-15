/**
 * Statistical Analysis — implements significance tests from scratch.
 *
 * All formulas are implemented directly (no external dependencies) to
 * demonstrate understanding of the underlying statistics.
 *
 * Tests included:
 *   - Chi-squared test for independence (decision flip rates)
 *   - Welch's t-test (score differences between groups)
 *   - Demographic parity difference
 *   - Effect size (Cohen's d)
 */

// ============================================================================
// Mathematical helpers
// ============================================================================

/** Gamma function approximation (Lanczos, needed for chi-squared p-value). */
function gammaLn(z) {
  const g = 7;
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - gammaLn(1 - z);
  }
  z -= 1;
  let x = coef[0];
  for (let i = 1; i < g + 2; i++) {
    x += coef[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Lower regularized incomplete gamma function P(a, x) via series expansion. */
function lowerGammaP(a, x) {
  if (x < 0) return 0;
  if (x === 0) return 0;

  const lnGammaA = gammaLn(a);

  // Use series for x < a + 1
  if (x < a + 1) {
    let sum = 1 / a;
    let term = 1 / a;
    for (let n = 1; n < 200; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGammaA);
  }

  // Use continued fraction for x >= a + 1
  return 1 - upperGammaQ(a, x);
}

/** Upper regularized incomplete gamma function Q(a, x) via continued fraction. */
function upperGammaQ(a, x) {
  const lnGammaA = gammaLn(a);
  let f = x + 1 - a;
  let c = 1e30;
  let d = 1 / f;
  let h = d;

  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    const bn = x + 2 * i + 1 - a;
    d = bn + an * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = bn + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = c * d;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGammaA) * h;
}

/** Regularized incomplete beta function I_x(a, b) via continued fraction. */
function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Symmetry transformation for numerical stability
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedBeta(1 - x, b, a);
  }

  const lnPrefix = a * Math.log(x) + b * Math.log(1 - x) -
    Math.log(a) - gammaLn(a) - gammaLn(b) + gammaLn(a + b);

  // Lentz continued fraction
  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let result = d;

  for (let m = 1; m <= 200; m++) {
    // Even step
    let numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    result *= c * d;

    // Odd step
    numerator = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    const delta = c * d;
    result *= delta;

    if (Math.abs(delta - 1) < 1e-14) break;
  }

  return Math.exp(lnPrefix) * result;
}

// ============================================================================
// Distribution p-value functions
// ============================================================================

/**
 * P-value from chi-squared distribution.
 * P(X^2 >= observed | df degrees of freedom)
 */
export function chiSquaredPValue(chiSq, df) {
  if (chiSq <= 0) return 1;
  // P-value = 1 - CDF = upper incomplete gamma
  return upperGammaQ(df / 2, chiSq / 2);
}

/**
 * P-value from t-distribution (two-tailed).
 * Uses the relationship between the t-distribution and the beta distribution.
 */
export function tDistPValue(t, df) {
  const x = df / (df + t * t);
  const p = regularizedBeta(x, df / 2, 0.5);
  return p; // two-tailed
}

// ============================================================================
// Statistical tests
// ============================================================================

/**
 * Chi-squared test for independence of decision flips.
 *
 * Tests whether the decision flip rate differs significantly from what would
 * be expected if the demographic attribute had no effect.
 *
 * @param {number} flipsA — number of flips favoring group A
 * @param {number} noFlipsA — number of non-flips when A is the "advantaged" pair
 * @param {number} flipsB — number of flips favoring group B
 * @param {number} noFlipsB — number of non-flips when B is the "advantaged" pair
 * @returns {{ chiSquared, pValue, df, significant, interpretation }}
 */
export function chiSquaredTest(flipsA, noFlipsA, flipsB, noFlipsB) {
  // 2x2 contingency table:
  //              | Flip  | No Flip |
  //  Group A adv |  a    |    b    |
  //  Group B adv |  c    |    d    |
  const a = flipsA, b = noFlipsA, c = flipsB, d = noFlipsB;
  const n = a + b + c + d;

  if (n === 0) {
    return { chiSquared: 0, pValue: 1, df: 1, significant: false, interpretation: "No data" };
  }

  const rowTotals = [a + b, c + d];
  const colTotals = [a + c, b + d];

  // Expected values
  const expected = [
    [rowTotals[0] * colTotals[0] / n, rowTotals[0] * colTotals[1] / n],
    [rowTotals[1] * colTotals[0] / n, rowTotals[1] * colTotals[1] / n],
  ];

  const observed = [[a, b], [c, d]];
  let chiSq = 0;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      if (expected[i][j] > 0) {
        chiSq += (observed[i][j] - expected[i][j]) ** 2 / expected[i][j];
      }
    }
  }

  const df = 1;
  const pValue = chiSquaredPValue(chiSq, df);

  return {
    chiSquared: round(chiSq, 4),
    pValue: round(pValue, 6),
    df,
    significant: pValue < 0.05,
    interpretation: pValue < 0.05
      ? `Statistically significant bias detected (p=${round(pValue, 4)}). The decision flip rate differs significantly between groups.`
      : `No statistically significant bias detected (p=${round(pValue, 4)}). Observed differences are within random noise.`,
  };
}

/**
 * Welch's t-test for independent samples with unequal variances.
 *
 * Tests whether the mean scores differ significantly between two groups.
 *
 * @param {number[]} scoresA — scores for group A
 * @param {number[]} scoresB — scores for group B
 * @returns {{ tStatistic, pValue, df, meanA, meanB, meanDiff, significant, interpretation }}
 */
export function welchTTest(scoresA, scoresB) {
  const nA = scoresA.length;
  const nB = scoresB.length;

  if (nA < 2 || nB < 2) {
    return {
      tStatistic: 0, pValue: 1, df: 0,
      meanA: 0, meanB: 0, meanDiff: 0,
      significant: false,
      interpretation: "Insufficient data for t-test (need at least 2 samples per group).",
    };
  }

  const meanA = mean(scoresA);
  const meanB = mean(scoresB);
  const varA = variance(scoresA);
  const varB = variance(scoresB);

  const seA = varA / nA;
  const seB = varB / nB;
  const seDiff = Math.sqrt(seA + seB);

  if (seDiff === 0) {
    return {
      tStatistic: 0, pValue: 1, df: nA + nB - 2,
      meanA: round(meanA, 4), meanB: round(meanB, 4), meanDiff: 0,
      significant: false,
      interpretation: "Zero variance in both groups — all scores identical.",
    };
  }

  const t = (meanA - meanB) / seDiff;

  // Welch-Satterthwaite degrees of freedom
  const df = (seA + seB) ** 2 / (seA ** 2 / (nA - 1) + seB ** 2 / (nB - 1));

  const pValue = tDistPValue(t, df);

  return {
    tStatistic: round(t, 4),
    pValue: round(pValue, 6),
    df: round(df, 2),
    meanA: round(meanA, 4),
    meanB: round(meanB, 4),
    meanDiff: round(meanA - meanB, 4),
    significant: pValue < 0.05,
    interpretation: pValue < 0.05
      ? `Statistically significant score difference detected (t=${round(t, 3)}, p=${round(pValue, 4)}). Group "${scoresA._label || "A"}" averages ${round(meanA, 2)} vs "${scoresB._label || "B"}" at ${round(meanB, 2)}.`
      : `No statistically significant score difference (t=${round(t, 3)}, p=${round(pValue, 4)}).`,
  };
}

/**
 * Cohen's d effect size — standardized mean difference.
 *
 * Interpretation:
 *   |d| < 0.2  — negligible
 *   |d| < 0.5  — small
 *   |d| < 0.8  — medium
 *   |d| >= 0.8 — large
 */
export function cohensD(scoresA, scoresB) {
  const nA = scoresA.length;
  const nB = scoresB.length;
  if (nA < 2 || nB < 2) return { d: 0, magnitude: "insufficient_data" };

  const meanDiff = mean(scoresA) - mean(scoresB);
  const pooledVar = ((nA - 1) * variance(scoresA) + (nB - 1) * variance(scoresB)) / (nA + nB - 2);
  const pooledSD = Math.sqrt(pooledVar);

  if (pooledSD === 0) return { d: 0, magnitude: "zero_variance" };

  const d = meanDiff / pooledSD;
  const absD = Math.abs(d);

  let magnitude;
  if (absD < 0.2) magnitude = "negligible";
  else if (absD < 0.5) magnitude = "small";
  else if (absD < 0.8) magnitude = "medium";
  else magnitude = "large";

  return { d: round(d, 4), magnitude };
}

/**
 * Demographic parity difference.
 *
 * Measures the difference in positive decision rates between groups.
 * EU AI Act threshold: typically 80% rule (disparate impact ratio >= 0.8).
 *
 * @param {number} positiveRateA — proportion of group A getting positive decisions
 * @param {number} positiveRateB — proportion of group B getting positive decisions
 * @returns {{ parityDiff, disparateImpactRatio, passes80PercentRule, interpretation }}
 */
export function demographicParity(positiveRateA, positiveRateB) {
  const diff = Math.abs(positiveRateA - positiveRateB);

  // Disparate impact ratio: min(rateA/rateB, rateB/rateA)
  let disparateImpactRatio;
  if (positiveRateA === 0 && positiveRateB === 0) {
    disparateImpactRatio = 1; // Both zero — no disparity
  } else if (positiveRateA === 0 || positiveRateB === 0) {
    disparateImpactRatio = 0; // One group has zero positive rate
  } else {
    disparateImpactRatio = Math.min(positiveRateA / positiveRateB, positiveRateB / positiveRateA);
  }

  const passes = disparateImpactRatio >= 0.8;

  return {
    positiveRateA: round(positiveRateA, 4),
    positiveRateB: round(positiveRateB, 4),
    parityDiff: round(diff, 4),
    disparateImpactRatio: round(disparateImpactRatio, 4),
    passes80PercentRule: passes,
    interpretation: passes
      ? `Passes the 80% rule (ratio=${round(disparateImpactRatio, 3)}). Positive rates are comparable between groups.`
      : `FAILS the 80% rule (ratio=${round(disparateImpactRatio, 3)}). The disadvantaged group's positive rate is less than 80% of the advantaged group's rate. This may constitute disparate impact under EU AI Act and US EEOC guidelines.`,
  };
}

/**
 * Run full statistical analysis on counterfactual test results.
 *
 * @param {object} aggregated — from counterfactual.aggregateResults()
 * @returns {object} comprehensive statistical report
 */
export function analyzeResults(aggregated) {
  const report = {
    timestamp: new Date().toISOString(),
    groupComparisons: {},
    overall: aggregated.overall,
  };

  for (const [key, bucket] of Object.entries(aggregated.byGroupPair)) {
    // Chi-squared: are the flips distributed evenly?
    // Split flips into directional: how many favor A vs B
    const flipsForA = bucket.flagged.filter(r => r.outputA.score > r.outputB.score).length;
    const flipsForB = bucket.flagged.filter(r => r.outputB.score > r.outputA.score).length;
    const noFlips = bucket.totalPairs - bucket.flips;

    const chiSq = chiSquaredTest(flipsForA, Math.floor(noFlips / 2), flipsForB, Math.ceil(noFlips / 2));

    // Welch's t-test: do scores differ?
    const tTest = welchTTest(bucket.scoresA, bucket.scoresB);

    // Effect size
    const effectSize = cohensD(bucket.scoresA, bucket.scoresB);

    // Demographic parity
    const posRateA = bucket.scoresA.filter(s => s >= 7).length / bucket.scoresA.length;
    const posRateB = bucket.scoresB.filter(s => s >= 7).length / bucket.scoresB.length;
    const parity = demographicParity(posRateA, posRateB);

    report.groupComparisons[key] = {
      attribute: bucket.attribute,
      groupA: bucket.groupA,
      groupB: bucket.groupB,
      sampleSize: bucket.totalPairs,
      flipRate: round(bucket.flipRate, 4),
      avgScoreA: round(bucket.avgScoreA, 4),
      avgScoreB: round(bucket.avgScoreB, 4),
      directedScoreDiff: round(bucket.directedScoreDiff, 4),
      chiSquaredTest: chiSq,
      welchTTest: tTest,
      effectSize,
      demographicParity: parity,
      biasDetected: chiSq.significant || tTest.significant || !parity.passes80PercentRule,
      findings: generateFindings(bucket, chiSq, tTest, effectSize, parity),
    };
  }

  return report;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr) {
  const m = mean(arr);
  return arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
}

function round(n, decimals) {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function generateFindings(bucket, chiSq, tTest, effectSize, parity) {
  const findings = [];

  if (chiSq.significant) {
    findings.push({
      severity: "HIGH",
      type: "decision_flip_bias",
      detail: `Decision flip rate of ${round(bucket.flipRate * 100, 1)}% is statistically significant (chi-squared=${chiSq.chiSquared}, p=${chiSq.pValue}).`,
      recommendation: "Investigate the model's decision boundary for demographic sensitivity. Consider retraining with balanced data or adding post-processing fairness constraints.",
    });
  }

  if (tTest.significant) {
    const favored = tTest.meanDiff > 0 ? bucket.groupA : bucket.groupB;
    findings.push({
      severity: effectSize.magnitude === "large" ? "CRITICAL" : "HIGH",
      type: "score_disparity",
      detail: `Mean score difference of ${Math.abs(tTest.meanDiff).toFixed(2)} points favoring "${favored}" (t=${tTest.tStatistic}, p=${tTest.pValue}, Cohen's d=${effectSize.d}).`,
      recommendation: "The model systematically scores one group higher. Audit training data for representation bias and consider score calibration.",
    });
  }

  if (!parity.passes80PercentRule) {
    findings.push({
      severity: "CRITICAL",
      type: "disparate_impact",
      detail: `Disparate impact ratio of ${parity.disparateImpactRatio} fails the 80% rule. This may violate EU AI Act requirements and US EEOC guidelines.`,
      recommendation: "This level of disparity likely constitutes illegal discrimination. Do NOT deploy without mitigation. Consider threshold adjustment, model retraining, or human-in-the-loop review for the disadvantaged group.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "INFO",
      type: "no_bias_detected",
      detail: `No statistically significant bias detected between "${bucket.groupA}" and "${bucket.groupB}". Effect size is ${effectSize.magnitude} (d=${effectSize.d}).`,
      recommendation: "Continue monitoring. Absence of evidence is not evidence of absence — consider larger sample sizes and additional test scenarios.",
    });
  }

  return findings;
}
