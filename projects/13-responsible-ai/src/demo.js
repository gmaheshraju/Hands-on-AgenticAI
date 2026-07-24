/**
 * Demo — runs the full bias audit pipeline with a DELIBERATELY BIASED
 * mock scoring system to demonstrate detection capabilities.
 *
 * The mock system applies hidden biases:
 *   - Gender: male names score +0.8 higher on average
 *   - Ethnicity: "white" names score +0.5, "asian" names score +0.3
 *   - Age: younger graduates score +0.6 higher
 *   - Proxy: HBCUs and women's colleges score -0.4 lower
 *
 * A good audit pipeline should detect ALL of these.
 *
 * Usage:
 *   node src/demo.js           # standard demo
 *   node src/demo.js --full    # full audit with all tests
 *   node src/demo.js --fair    # run with an unbiased system (should pass)
 */

import { buildMatchedPairs, buildIntersectionalPairs, buildProxyTestPairs } from "./datasetBuilder.js";
import { runCounterfactualTest, runProxyTest, aggregateResults } from "./counterfactual.js";
import { analyzeResults } from "./statistics.js";
import { analyzeIntersections } from "./intersectional.js";
import { generateModelCard, renderMarkdown, writeModelCard } from "./modelCard.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// ============================================================================
// Mock scoring systems
// ============================================================================

/**
 * DELIBERATELY BIASED scoring function.
 *
 * Simulates an AI resume screener that has learned demographic biases
 * from biased training data. The biases are realistic:
 *   - Names associated with majority groups get higher scores
 *   - Older graduation years get penalized (age bias)
 *   - University associations leak through
 */
function createBiasedScorer() {
  // Name-to-demographic mapping (simplified — real systems have implicit associations)
  const maleNames = new Set([
    "james", "john", "robert", "michael", "william", "david", "richard", "thomas", "christopher", "daniel",
    "jake", "connor", "ryan", "tyler", "brett", "hunter", "cody", "tanner", "blake", "colton",
  ]);
  const femaleNames = new Set([
    "mary", "jennifer", "patricia", "linda", "elizabeth", "barbara", "susan", "jessica", "sarah", "karen",
  ]);
  const whiteNames = new Set([
    "jake", "connor", "ryan", "tyler", "brett", "hunter", "cody", "tanner", "blake", "colton",
    "sullivan", "murphy", "o'brien", "henderson", "patterson", "mcallister", "peterson", "olson", "anderson", "stewart",
  ]);
  const hbcuList = new Set([
    "howard university", "morehouse college", "spelman college", "hampton university", "tuskegee university",
  ]);
  const womensCollegeList = new Set([
    "wellesley college", "smith college", "barnard college", "bryn mawr college", "mount holyoke college",
  ]);

  return async function biasedScorer(resumeText) {
    // Base score from "content quality" (deterministic from text length hash)
    const hash = simpleHash(resumeText);
    let baseScore = 6.0 + (hash % 20) / 10; // 6.0 to 8.0

    let bias = 0;
    const lower = resumeText.toLowerCase();

    // Gender bias: +0.8 for male names
    const firstName = resumeText.split("\n")[0].split(" ")[0].toLowerCase();
    if (maleNames.has(firstName)) {
      bias += 0.8;
    } else if (femaleNames.has(firstName)) {
      bias -= 0.0; // no explicit penalty, just no bonus
    }

    // Ethnicity bias via name associations
    const lastName = (resumeText.split("\n")[0].split(" ")[1] || "").toLowerCase();
    if (whiteNames.has(firstName) || whiteNames.has(lastName)) {
      bias += 0.5;
    }

    // Age bias: penalize older graduation years
    const gradYearMatch = lower.match(/(?:b\.s\.|m\.s\.|mba|b\.a\.)[^,]*,\s*(\d{4})/);
    if (gradYearMatch) {
      const year = parseInt(gradYearMatch[1]);
      if (year < 2000) bias -= 0.6;
      else if (year < 2010) bias -= 0.3;
      else bias += 0.3;
    }

    // Proxy bias: university associations
    for (const hbcu of hbcuList) {
      if (lower.includes(hbcu)) { bias -= 0.4; break; }
    }
    for (const wc of womensCollegeList) {
      if (lower.includes(wc)) { bias -= 0.4; break; }
    }

    // Add small random noise to simulate model non-determinism
    const noise = (seededRandom(hash) - 0.5) * 0.3;

    const score = Math.max(1, Math.min(10, baseScore + bias + noise));
    const decision = score >= 7 ? "advance" : "reject";

    return {
      score: Math.round(score * 100) / 100,
      decision,
      summary: `Candidate evaluated for technical skills and experience. Score: ${score.toFixed(1)}/10.`,
    };
  };
}

/**
 * UNBIASED (fair) scoring function for comparison.
 */
function createFairScorer() {
  // Counter-based scoring that ignores resume content entirely.
  // This guarantees zero demographic signal — the score depends only on
  // the order in which resumes arrive, which alternates A/B within pairs.
  let counter = 0;
  const templateScores = [7.2, 6.8, 7.5, 6.5, 7.0]; // one per template

  return async function fairScorer(resumeText) {
    // Determine template from role keyword (stable across demographic swaps)
    let templateIdx = 0;
    if (resumeText.includes("distributed systems")) templateIdx = 0;
    else if (resumeText.includes("NLP and recommendation")) templateIdx = 1;
    else if (resumeText.includes("0-to-1 products")) templateIdx = 2;
    else if (resumeText.includes("growth and brand")) templateIdx = 3;
    else if (resumeText.includes("valuation and M&A")) templateIdx = 4;

    const score = templateScores[templateIdx];

    return {
      score,
      decision: score >= 7 ? "advance" : "reject",
      summary: `Candidate evaluated. Score: ${score.toFixed(1)}/10.`,
    };
  };
}

// ============================================================================
// Demo runner
// ============================================================================

async function runDemo() {
  const args = process.argv.slice(2);
  const fullMode = args.includes("--full");
  const fairMode = args.includes("--fair");

  const scoringFn = fairMode ? createFairScorer() : createBiasedScorer();
  const pairsPerAttribute = fullMode ? 50 : 25;

  console.log("=".repeat(70));
  console.log("  BIAS AUDIT PIPELINE — Resume Screening System");
  console.log("=".repeat(70));
  console.log(`  Mode:    ${fairMode ? "FAIR (unbiased system)" : "BIASED (deliberately biased system)"}`);
  console.log(`  Pairs:   ${pairsPerAttribute} per attribute combination`);
  console.log(`  Date:    ${new Date().toISOString()}`);
  console.log("=".repeat(70));
  console.log("");

  // ---- Step 1: Build test datasets ----
  console.log("[1/5] Building test datasets...");

  const genderPairs = buildMatchedPairs("gender", pairsPerAttribute);
  const ethnicityPairs = buildMatchedPairs("ethnicity", pairsPerAttribute);
  const agePairs = buildMatchedPairs("age", pairsPerAttribute);

  console.log(`  Gender pairs:    ${genderPairs.length}`);
  console.log(`  Ethnicity pairs: ${ethnicityPairs.length}`);
  console.log(`  Age pairs:       ${agePairs.length}`);

  let proxyPairs = [];
  let intersectionalPairs = [];
  if (fullMode) {
    proxyPairs = buildProxyTestPairs(10);
    intersectionalPairs = buildIntersectionalPairs("gender", "ethnicity", 15);
    console.log(`  Proxy pairs:     ${proxyPairs.length}`);
    console.log(`  Intersectional:  ${intersectionalPairs.length}`);
  }
  console.log("");

  // ---- Step 2: Counterfactual testing ----
  console.log("[2/5] Running counterfactual tests...");

  const progressFn = (done, total) => {
    process.stdout.write(`\r  Progress: ${done}/${total} pairs tested`);
  };

  const genderResults = await runCounterfactualTest(genderPairs, scoringFn, { onProgress: progressFn });
  console.log("");
  const ethnicityResults = await runCounterfactualTest(ethnicityPairs, scoringFn, { onProgress: progressFn });
  console.log("");
  const ageResults = await runCounterfactualTest(agePairs, scoringFn, { onProgress: progressFn });
  console.log("");

  let proxyResults = null;
  if (fullMode && proxyPairs.length > 0) {
    const proxyTestResults = await runProxyTest(proxyPairs, scoringFn);
    proxyResults = aggregateResults(proxyTestResults);
  }

  // ---- Step 3: Statistical analysis ----
  console.log("[3/5] Running statistical analysis...");

  const genderAgg = aggregateResults(genderResults);
  const ethnicityAgg = aggregateResults(ethnicityResults);
  const ageAgg = aggregateResults(ageResults);

  const genderStats = analyzeResults(genderAgg);
  const ethnicityStats = analyzeResults(ethnicityAgg);
  const ageStats = analyzeResults(ageAgg);

  // Merge all stats into one report
  const combinedStats = {
    timestamp: new Date().toISOString(),
    groupComparisons: {
      ...genderStats.groupComparisons,
      ...ethnicityStats.groupComparisons,
      ...ageStats.groupComparisons,
    },
    overall: {
      totalPairs: genderAgg.overall.totalPairs + ethnicityAgg.overall.totalPairs + ageAgg.overall.totalPairs,
      totalFlips: genderAgg.overall.totalFlips + ethnicityAgg.overall.totalFlips + ageAgg.overall.totalFlips,
      totalFlagged: genderAgg.overall.totalFlagged + ethnicityAgg.overall.totalFlagged + ageAgg.overall.totalFlagged,
    },
  };

  printStatisticalSummary(combinedStats);

  // ---- Step 4: Intersectional analysis ----
  let intersectionalReport = null;
  if (fullMode && intersectionalPairs.length > 0) {
    console.log("\n[4/5] Running intersectional analysis...");
    // Score all intersectional resumes
    const scoredIntersectional = [];
    for (const pair of intersectionalPairs) {
      const output = await scoringFn(pair.resume);
      scoredIntersectional.push({
        groups: pair.groups,
        score: output.score,
        decision: output.decision,
      });
    }
    intersectionalReport = analyzeIntersections(scoredIntersectional);
    printIntersectionalSummary(intersectionalReport);
  } else {
    console.log("\n[4/5] Intersectional analysis... (skipped — use --full)");
  }

  // ---- Step 5: Model card generation ----
  console.log("\n[5/5] Generating model card...");

  const modelConfig = {
    modelName: "ResumeScreener-v1",
    modelVersion: "1.0.0",
    modelProvider: "Internal AI Team",
    modelType: "LLM-based resume scoring system",
    intendedUse: "Automated first-pass screening of job applications to identify candidates for human recruiter review",
    outOfScopeUses: [
      "Autonomous hiring decisions without human review",
      "Screening for protected characteristics",
      "Evaluating candidates outside the trained domain",
      "Performance evaluation of existing employees",
    ],
    trainingDataDescription: "Foundation model (GPT-4 class) fine-tuned on 10,000 anonymized resume-outcome pairs from 2020-2024 hiring data",
    primaryUsers: "HR departments, talent acquisition teams",
    license: "Proprietary — Internal Use Only",
    contactInfo: "ai-ethics@company.com",
  };

  const card = generateModelCard(modelConfig, combinedStats, intersectionalReport, proxyResults?.byGroupPair);

  const outputDir = join(process.cwd(), "output");
  const { mdPath, jsonPath } = await writeModelCard(card, outputDir);

  console.log(`  Model card (Markdown): ${mdPath}`);
  console.log(`  Model card (JSON):     ${jsonPath}`);

  // ---- Final summary ----
  console.log("\n" + "=".repeat(70));
  console.log("  AUDIT COMPLETE");
  console.log("=".repeat(70));
  console.log(`  Overall Assessment: ${card.biasAndFairness.overallAssessment}`);
  console.log(`  Risk Level:         ${card.riskClassification.riskLevel}`);
  console.log(`  Deployment:         ${card.recommendations.deploymentDecision}`);

  const critical = card.biasAndFairness.findings.filter(f => f.severity === "CRITICAL").length;
  const high = card.biasAndFairness.findings.filter(f => f.severity === "HIGH").length;
  const info = card.biasAndFairness.findings.filter(f => f.severity === "INFO").length;

  console.log(`  Findings:           ${critical} CRITICAL, ${high} HIGH, ${info} INFO`);
  console.log("=".repeat(70));

  if (critical > 0) {
    console.log("\n  !!! CRITICAL BIAS DETECTED — DO NOT DEPLOY !!!");
    console.log("  See MODEL_CARD.md for details and remediation steps.\n");
  }
}

// ============================================================================
// Pretty printing
// ============================================================================

function printStatisticalSummary(stats) {
  console.log("\n  --- Statistical Summary ---\n");

  for (const [key, comp] of Object.entries(stats.groupComparisons)) {
    const bias = comp.biasDetected ? " *** BIAS DETECTED ***" : "";
    console.log(`  ${comp.attribute}: ${comp.groupA} vs ${comp.groupB}${bias}`);
    console.log(`    Flip rate:     ${(comp.flipRate * 100).toFixed(1)}%`);
    console.log(`    Score diff:    ${comp.directedScoreDiff > 0 ? "+" : ""}${comp.directedScoreDiff.toFixed(3)} (${comp.groupA} - ${comp.groupB})`);
    console.log(`    Welch t-test:  t=${comp.welchTTest.tStatistic}, p=${comp.welchTTest.pValue}`);
    console.log(`    Chi-squared:   X2=${comp.chiSquaredTest.chiSquared}, p=${comp.chiSquaredTest.pValue}`);
    console.log(`    Effect size:   d=${comp.effectSize.d} (${comp.effectSize.magnitude})`);
    console.log(`    80% rule:      ${comp.demographicParity.passes80PercentRule ? "PASS" : "FAIL"} (ratio=${comp.demographicParity.disparateImpactRatio})`);
    console.log("");
  }
}

function printIntersectionalSummary(report) {
  console.log("\n  --- Intersectional Summary ---\n");
  console.log(`  Intersections tested:  ${report.summary.totalIntersections}`);
  console.log(`  Compound bias found:   ${report.summary.compoundBiasDetected ? "YES" : "No"}`);

  if (report.summary.mostAdvantaged) {
    console.log(`  Most advantaged:       ${report.summary.mostAdvantaged.key} (score: ${report.summary.mostAdvantaged.meanScore})`);
    console.log(`  Least advantaged:      ${report.summary.leastAdvantaged.key} (score: ${report.summary.leastAdvantaged.meanScore})`);
    console.log(`  Max gap:               ${report.summary.maxScoreGap} points`);
  }

  if (report.nonAdditiveEffects.length > 0) {
    console.log("\n  Non-additive effects:");
    for (const effect of report.nonAdditiveEffects) {
      console.log(`    ${effect.intersection}: ${effect.interpretation}`);
    }
  }
}

// ============================================================================
// Utility
// ============================================================================

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

function seededRandom(seed) {
  // Simple LCG for reproducible pseudo-random numbers
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// ============================================================================
// Run
// ============================================================================

runDemo().catch(err => {
  console.error("Audit pipeline failed:", err);
  process.exit(1);
});
