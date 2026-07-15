/**
 * Counterfactual Testing — sends matched pairs through an AI scoring system
 * and compares outputs to detect decision differences attributable to
 * demographic attributes.
 */

// ---------------------------------------------------------------------------
// Output comparison
// ---------------------------------------------------------------------------

/**
 * Determine whether two AI outputs differ meaningfully.
 *
 * A "meaningful" difference is one that would change a hiring decision:
 *   - Different recommended action (accept vs reject)
 *   - Score difference > threshold (default 0.5 on a 0-10 scale)
 *
 * Wording differences in summaries are NOT considered meaningful on their own.
 */
export function outputsDifferMeaningfully(outputA, outputB, scoreThreshold = 0.5) {
  const reasons = [];

  // Decision flip
  if (outputA.decision !== outputB.decision) {
    reasons.push({
      type: "decision_flip",
      detail: `${outputA.decision} -> ${outputB.decision}`,
    });
  }

  // Score gap
  const scoreDiff = Math.abs(outputA.score - outputB.score);
  if (scoreDiff > scoreThreshold) {
    reasons.push({
      type: "score_gap",
      detail: `${outputA.score.toFixed(2)} vs ${outputB.score.toFixed(2)} (diff=${scoreDiff.toFixed(2)})`,
    });
  }

  return {
    meaningful: reasons.length > 0,
    reasons,
    scoreDiff,
    decisionFlip: outputA.decision !== outputB.decision,
  };
}

// ---------------------------------------------------------------------------
// Run pairs through the system
// ---------------------------------------------------------------------------

/**
 * Run a single matched pair through the scoring function.
 *
 * @param {object} pair — from datasetBuilder (has resumeA, resumeB)
 * @param {function} scoringFn — async (resumeText) => { score, decision, summary }
 * @param {number} scoreThreshold — minimum score gap to flag
 * @returns {object} comparison result
 */
export async function testPair(pair, scoringFn, scoreThreshold = 0.5) {
  const [outputA, outputB] = await Promise.all([
    scoringFn(pair.resumeA),
    scoringFn(pair.resumeB),
  ]);

  const comparison = outputsDifferMeaningfully(outputA, outputB, scoreThreshold);

  return {
    pairId: pair.id,
    attribute: pair.attribute,
    groupA: pair.groupA,
    groupB: pair.groupB,
    outputA,
    outputB,
    ...comparison,
  };
}

/**
 * Run all matched pairs for a given attribute through the scoring function.
 *
 * @param {Array} pairs — array from buildMatchedPairs
 * @param {function} scoringFn — the AI system under test
 * @param {object} opts
 * @param {number} opts.concurrency — max concurrent requests (default 5)
 * @param {number} opts.scoreThreshold — minimum score gap to flag
 * @param {function} opts.onProgress — called with (completed, total)
 * @returns {Array} array of comparison results
 */
export async function runCounterfactualTest(pairs, scoringFn, opts = {}) {
  const { concurrency = 5, scoreThreshold = 0.5, onProgress } = opts;
  const results = [];
  let completed = 0;

  // Process in batches for concurrency control
  for (let i = 0; i < pairs.length; i += concurrency) {
    const batch = pairs.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(pair => testPair(pair, scoringFn, scoreThreshold))
    );
    results.push(...batchResults);
    completed += batch.length;
    if (onProgress) onProgress(completed, pairs.length);
  }

  return results;
}

/**
 * Run proxy discrimination tests. Same structure but tests university bias.
 */
export async function runProxyTest(pairs, scoringFn, opts = {}) {
  // Identical flow — just uses proxy pairs
  return runCounterfactualTest(pairs, scoringFn, opts);
}

/**
 * Aggregate results by group comparison.
 *
 * @param {Array} results — from runCounterfactualTest
 * @returns {object} { byGroupPair, overall }
 */
export function aggregateResults(results) {
  const byGroupPair = {};

  for (const r of results) {
    const key = `${r.groupA}_vs_${r.groupB}`;
    if (!byGroupPair[key]) {
      byGroupPair[key] = {
        groupA: r.groupA,
        groupB: r.groupB,
        attribute: r.attribute,
        totalPairs: 0,
        flips: 0,
        scoreDiffs: [],
        scoresA: [],
        scoresB: [],
        flagged: [],
      };
    }
    const bucket = byGroupPair[key];
    bucket.totalPairs++;
    if (r.decisionFlip) bucket.flips++;
    bucket.scoreDiffs.push(r.scoreDiff);
    bucket.scoresA.push(r.outputA.score);
    bucket.scoresB.push(r.outputB.score);
    if (r.meaningful) bucket.flagged.push(r);
  }

  // Compute summary stats per group pair
  for (const bucket of Object.values(byGroupPair)) {
    bucket.flipRate = bucket.flips / bucket.totalPairs;
    bucket.avgScoreDiff = mean(bucket.scoreDiffs);
    bucket.avgScoreA = mean(bucket.scoresA);
    bucket.avgScoreB = mean(bucket.scoresB);
    bucket.directedScoreDiff = bucket.avgScoreA - bucket.avgScoreB;
  }

  return {
    byGroupPair,
    overall: {
      totalPairs: results.length,
      totalFlips: results.filter(r => r.decisionFlip).length,
      totalFlagged: results.filter(r => r.meaningful).length,
      overallFlipRate: results.filter(r => r.decisionFlip).length / results.length,
    },
  };
}

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
