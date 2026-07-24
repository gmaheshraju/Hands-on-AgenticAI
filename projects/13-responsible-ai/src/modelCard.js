/**
 * Model Card Generator — produces EU AI Act-compliant model cards from
 * bias audit results in both Markdown and JSON formats.
 *
 * Structure follows:
 *   - EU AI Act (Article 13 transparency requirements for high-risk AI)
 *   - Google's Model Cards for Model Reporting (Mitchell et al., 2019)
 *   - Hugging Face model card template
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

// ============================================================================
// Model card data structure
// ============================================================================

/**
 * Generate a complete model card from audit results.
 *
 * @param {object} config — model metadata
 * @param {string} config.modelName
 * @param {string} config.modelVersion
 * @param {string} config.modelProvider
 * @param {string} config.modelType
 * @param {string} config.intendedUse
 * @param {string[]} config.outOfScopeUses
 * @param {string} config.trainingDataDescription
 * @param {object} auditResults — from statistics.analyzeResults()
 * @param {object} intersectionalResults — from intersectional.analyzeIntersections()
 * @param {object} proxyResults — from proxy discrimination tests
 * @returns {object} structured model card
 */
export function generateModelCard(config, auditResults, intersectionalResults = null, proxyResults = null) {
  const now = new Date().toISOString();

  const allFindings = collectAllFindings(auditResults, intersectionalResults, proxyResults);
  const riskLevel = assessRiskLevel(allFindings);

  const card = {
    // ---- Section 1: Model Details ----
    modelDetails: {
      name: config.modelName,
      version: config.modelVersion,
      provider: config.modelProvider,
      type: config.modelType,
      dateGenerated: now,
      cardVersion: "1.0",
      license: config.license || "Proprietary",
      contactInfo: config.contactInfo || "AI Ethics Team",
    },

    // ---- Section 2: Intended Use (EU AI Act Art. 13(3)(b)) ----
    intendedUse: {
      primaryUse: config.intendedUse,
      primaryUsers: config.primaryUsers || "HR departments, recruitment teams",
      outOfScopeUses: config.outOfScopeUses || [
        "Autonomous hiring decisions without human review",
        "Screening for protected characteristics",
        "Evaluating candidates outside the trained domain",
      ],
    },

    // ---- Section 3: Risk Classification (EU AI Act Art. 6) ----
    riskClassification: {
      euAiActCategory: "HIGH-RISK",
      euAiActBasis: "Annex III, Section 4(a): AI systems intended to be used for recruitment or selection, particularly for screening or filtering applications",
      riskLevel: riskLevel.level,
      riskJustification: riskLevel.justification,
      humanOversightRequired: true,
      humanOversightDescription: "All screening decisions must be reviewed by a qualified human recruiter before any candidate is rejected. The system provides recommendations only.",
    },

    // ---- Section 4: Training Data (EU AI Act Art. 10) ----
    trainingData: {
      description: config.trainingDataDescription || "Not disclosed by model provider",
      demographicRepresentation: config.demographicRepresentation || "Unknown — the foundation model's training data composition is not publicly available",
      dataGovernance: config.dataGovernance || "Foundation model training data is managed by the model provider. Fine-tuning data (if any) follows internal data governance policy.",
      biasesInTrainingData: config.knownTrainingBiases || "LLMs are known to encode societal biases from internet text corpora, including gender and racial stereotypes in professional contexts.",
    },

    // ---- Section 5: Evaluation Metrics ----
    metrics: {
      biasAudit: formatBiasMetrics(auditResults),
      intersectionalAnalysis: intersectionalResults ? formatIntersectionalMetrics(intersectionalResults) : null,
      proxyDiscrimination: proxyResults ? formatProxyMetrics(proxyResults) : null,
      evaluationDate: now,
      evaluationMethodology: "Counterfactual testing with matched resume pairs differing only on demographic attributes (name, pronouns, graduation year). Statistical significance assessed via Welch's t-test and chi-squared test.",
      sampleSizes: extractSampleSizes(auditResults),
    },

    // ---- Section 6: Bias & Fairness Results (EU AI Act Art. 13(3)(b)(ii)) ----
    biasAndFairness: {
      overallAssessment: riskLevel.level === "LOW" ? "PASS" : riskLevel.level === "MEDIUM" ? "CONDITIONAL_PASS" : "FAIL",
      findings: allFindings,
      mitigationSteps: generateMitigationSteps(allFindings),
      residualRisks: generateResidualRisks(allFindings),
    },

    // ---- Section 7: Ethical Considerations ----
    ethicalConsiderations: {
      identifiedBiases: allFindings.filter(f => f.severity === "CRITICAL" || f.severity === "HIGH"),
      potentialHarms: [
        "Qualified candidates from underrepresented groups may be systematically ranked lower",
        "Proxy discrimination through university names or other correlated features",
        "Reinforcement of existing workforce homogeneity",
      ],
      mitigationSteps: generateMitigationSteps(allFindings),
    },

    // ---- Section 8: Limitations ----
    limitations: {
      knownLimitations: [
        "Bias audit covers gender, ethnicity, and age but not all protected characteristics (disability, religion, sexual orientation)",
        "Name-based testing captures explicit bias but may miss subtle proxy discrimination",
        "Statistical tests require sufficient sample sizes — rare intersections may be undertested",
        "The audit tests the system at a point in time — model behavior may change with updates",
        "Counterfactual testing assumes name is the only signal — real resumes have correlated features",
      ],
      dataGaps: [
        "No testing for disability bias",
        "Limited coverage of non-binary gender identities",
        "No testing for socioeconomic proxies (zip code, school type) beyond university name",
      ],
      performanceBoundaries: config.performanceBoundaries || [
        "Accuracy degrades for non-English resumes",
        "System is designed for professional/white-collar roles; may not generalize to trade/manual labor positions",
      ],
    },

    // ---- Section 9: Deployment Recommendations (EU AI Act Art. 13(3)(d)) ----
    recommendations: {
      deploymentDecision: riskLevel.level === "LOW" ? "APPROVED_WITH_MONITORING" : riskLevel.level === "MEDIUM" ? "APPROVED_WITH_RESTRICTIONS" : "NOT_APPROVED",
      conditions: generateDeploymentConditions(riskLevel, allFindings),
      monitoringRequirements: [
        "Continuous monitoring of decision rates disaggregated by demographic group",
        "Quarterly bias re-audit with updated test sets",
        "Incident reporting mechanism for candidates who believe they were unfairly treated",
        "Annual review by independent ethics board",
      ],
      humanOversight: [
        "All rejection decisions must be reviewed by a human recruiter",
        "The system score must not be the sole factor in any hiring decision",
        "Recruiters must be trained on the system's known biases and limitations",
        "An appeal process must be available to all candidates",
      ],
    },

    // ---- Section 10: Regulatory Compliance ----
    regulatoryCompliance: {
      euAiAct: {
        article6: "System classified as high-risk under Annex III",
        article9: `Risk management system in place. Overall risk level: ${riskLevel.level}`,
        article10: "Training data governance documented in Section 4",
        article13: "Transparency requirements addressed in this model card",
        article14: "Human oversight requirements specified in Section 9",
        article15: "Accuracy and robustness evaluated through bias audit",
      },
      additionalFrameworks: [
        "US EEOC Uniform Guidelines on Employee Selection Procedures (80% rule applied)",
        "NIST AI Risk Management Framework",
        "IEEE 7010 Well-being Metrics Standard",
      ],
    },
  };

  return card;
}

// ============================================================================
// Output generators
// ============================================================================

/**
 * Render the model card as Markdown.
 */
export function renderMarkdown(card) {
  const lines = [];
  const hr = "---";

  lines.push(`# Model Card: ${card.modelDetails.name}`);
  lines.push(`**Version:** ${card.modelDetails.version} | **Generated:** ${card.modelDetails.dateGenerated} | **Card Version:** ${card.modelDetails.cardVersion}`);
  lines.push("");

  // Risk badge
  const riskBadge = card.biasAndFairness.overallAssessment === "PASS"
    ? "PASS" : card.biasAndFairness.overallAssessment === "CONDITIONAL_PASS"
    ? "CONDITIONAL PASS" : "FAIL";
  lines.push(`> **Bias Audit Result: ${riskBadge}** | Risk Level: ${card.riskClassification.riskLevel}`);
  lines.push("");
  lines.push(hr);

  // Section 1: Model Details
  lines.push("## 1. Model Details");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Name | ${card.modelDetails.name} |`);
  lines.push(`| Version | ${card.modelDetails.version} |`);
  lines.push(`| Provider | ${card.modelDetails.provider} |`);
  lines.push(`| Type | ${card.modelDetails.type} |`);
  lines.push(`| License | ${card.modelDetails.license} |`);
  lines.push(`| Contact | ${card.modelDetails.contactInfo} |`);
  lines.push("");

  // Section 2: Intended Use
  lines.push("## 2. Intended Use");
  lines.push(`**Primary Use:** ${card.intendedUse.primaryUse}`);
  lines.push(`**Primary Users:** ${card.intendedUse.primaryUsers}`);
  lines.push("");
  lines.push("**Out-of-Scope Uses:**");
  for (const use of card.intendedUse.outOfScopeUses) {
    lines.push(`- ${use}`);
  }
  lines.push("");

  // Section 3: Risk Classification
  lines.push("## 3. EU AI Act Risk Classification");
  lines.push(`**Category:** ${card.riskClassification.euAiActCategory}`);
  lines.push(`**Legal Basis:** ${card.riskClassification.euAiActBasis}`);
  lines.push(`**Risk Level:** ${card.riskClassification.riskLevel}`);
  lines.push(`**Human Oversight Required:** Yes`);
  lines.push(`> ${card.riskClassification.humanOversightDescription}`);
  lines.push("");

  // Section 4: Training Data
  lines.push("## 4. Training Data");
  lines.push(`**Description:** ${card.trainingData.description}`);
  lines.push(`**Demographic Representation:** ${card.trainingData.demographicRepresentation}`);
  lines.push(`**Known Biases:** ${card.trainingData.biasesInTrainingData}`);
  lines.push("");

  // Section 5: Evaluation Metrics
  lines.push("## 5. Bias Audit Results");
  lines.push("");

  if (card.metrics.biasAudit) {
    lines.push("### Per-Attribute Results");
    lines.push("");
    lines.push("| Attribute | Groups | Flip Rate | Avg Score Diff | t-test p | Chi-sq p | 80% Rule | Bias? |");
    lines.push("|-----------|--------|-----------|---------------|----------|----------|----------|-------|");
    for (const m of card.metrics.biasAudit) {
      const biasFlag = m.biasDetected ? "YES" : "no";
      lines.push(`| ${m.attribute} | ${m.groupA} vs ${m.groupB} | ${(m.flipRate * 100).toFixed(1)}% | ${m.directedScoreDiff.toFixed(2)} | ${m.tTestP} | ${m.chiSqP} | ${m.passes80Pct ? "Pass" : "FAIL"} | ${biasFlag} |`);
    }
    lines.push("");
  }

  if (card.metrics.intersectionalAnalysis) {
    lines.push("### Intersectional Analysis");
    lines.push(`**Compound Bias Detected:** ${card.metrics.intersectionalAnalysis.compoundBiasDetected ? "YES" : "No"}`);
    if (card.metrics.intersectionalAnalysis.mostAdvantaged) {
      lines.push(`**Most Advantaged Group:** ${card.metrics.intersectionalAnalysis.mostAdvantaged}`);
      lines.push(`**Least Advantaged Group:** ${card.metrics.intersectionalAnalysis.leastAdvantaged}`);
      lines.push(`**Maximum Score Gap:** ${card.metrics.intersectionalAnalysis.maxGap} points`);
    }
    lines.push("");
  }

  if (card.metrics.proxyDiscrimination) {
    lines.push("### Proxy Discrimination");
    lines.push("");
    lines.push("| Proxy Type | Avg Score Diff | Significant? |");
    lines.push("|------------|---------------|-------------|");
    for (const p of card.metrics.proxyDiscrimination) {
      lines.push(`| ${p.proxyType} | ${p.avgScoreDiff.toFixed(2)} | ${p.significant ? "YES" : "no"} |`);
    }
    lines.push("");
  }

  // Section 6: Findings
  lines.push("## 6. Detailed Findings");
  lines.push("");

  const critical = card.biasAndFairness.findings.filter(f => f.severity === "CRITICAL");
  const high = card.biasAndFairness.findings.filter(f => f.severity === "HIGH");
  const info = card.biasAndFairness.findings.filter(f => f.severity === "INFO");

  if (critical.length > 0) {
    lines.push("### CRITICAL Findings");
    for (const f of critical) {
      lines.push(`- **[${f.type}]** ${f.detail}`);
      lines.push(`  - *Recommendation:* ${f.recommendation}`);
    }
    lines.push("");
  }

  if (high.length > 0) {
    lines.push("### HIGH Findings");
    for (const f of high) {
      lines.push(`- **[${f.type}]** ${f.detail}`);
      lines.push(`  - *Recommendation:* ${f.recommendation}`);
    }
    lines.push("");
  }

  if (info.length > 0) {
    lines.push("### Informational");
    for (const f of info) {
      lines.push(`- ${f.detail}`);
    }
    lines.push("");
  }

  // Section 7: Ethical Considerations
  lines.push("## 7. Ethical Considerations");
  lines.push("");
  lines.push("**Potential Harms:**");
  for (const harm of card.ethicalConsiderations.potentialHarms) {
    lines.push(`- ${harm}`);
  }
  lines.push("");

  // Section 8: Limitations
  lines.push("## 8. Limitations");
  lines.push("");
  lines.push("**Known Limitations:**");
  for (const lim of card.limitations.knownLimitations) {
    lines.push(`- ${lim}`);
  }
  lines.push("");
  lines.push("**Data Gaps:**");
  for (const gap of card.limitations.dataGaps) {
    lines.push(`- ${gap}`);
  }
  lines.push("");

  // Section 9: Deployment
  lines.push("## 9. Deployment Recommendations");
  lines.push(`**Decision:** ${card.recommendations.deploymentDecision}`);
  lines.push("");
  if (card.recommendations.conditions.length > 0) {
    lines.push("**Conditions:**");
    for (const cond of card.recommendations.conditions) {
      lines.push(`- ${cond}`);
    }
    lines.push("");
  }
  lines.push("**Monitoring Requirements:**");
  for (const req of card.recommendations.monitoringRequirements) {
    lines.push(`- ${req}`);
  }
  lines.push("");
  lines.push("**Human Oversight:**");
  for (const oversight of card.recommendations.humanOversight) {
    lines.push(`- ${oversight}`);
  }
  lines.push("");

  // Section 10: Regulatory
  lines.push("## 10. Regulatory Compliance");
  lines.push("");
  lines.push("### EU AI Act Compliance");
  lines.push("| Article | Status |");
  lines.push("|---------|--------|");
  for (const [article, status] of Object.entries(card.regulatoryCompliance.euAiAct)) {
    lines.push(`| ${article} | ${status} |`);
  }
  lines.push("");
  lines.push("### Additional Frameworks");
  for (const fw of card.regulatoryCompliance.additionalFrameworks) {
    lines.push(`- ${fw}`);
  }
  lines.push("");

  lines.push(hr);
  lines.push(`*This model card was automatically generated by the Bias Audit Pipeline on ${card.modelDetails.dateGenerated}.*`);

  return lines.join("\n");
}

/**
 * Write model card to files (Markdown + JSON).
 */
export async function writeModelCard(card, outputDir) {
  await mkdir(outputDir, { recursive: true });

  const mdPath = join(outputDir, "MODEL_CARD.md");
  const jsonPath = join(outputDir, "model_card.json");

  const markdown = renderMarkdown(card);
  await writeFile(mdPath, markdown, "utf-8");
  await writeFile(jsonPath, JSON.stringify(card, null, 2), "utf-8");

  return { mdPath, jsonPath };
}

// ============================================================================
// Internal helpers
// ============================================================================

function collectAllFindings(auditResults, intersectionalResults, proxyResults) {
  const findings = [];

  if (auditResults?.groupComparisons) {
    for (const comparison of Object.values(auditResults.groupComparisons)) {
      if (comparison.findings) findings.push(...comparison.findings);
    }
  }

  if (intersectionalResults?.findings) {
    findings.push(...intersectionalResults.findings);
  }

  if (proxyResults) {
    for (const comparison of Object.values(proxyResults)) {
      if (comparison.findings) findings.push(...comparison.findings);
    }
  }

  return findings;
}

function assessRiskLevel(findings) {
  const critical = findings.filter(f => f.severity === "CRITICAL").length;
  const high = findings.filter(f => f.severity === "HIGH").length;

  if (critical > 0) {
    return {
      level: "HIGH",
      justification: `${critical} critical finding(s) detected. The system shows statistically significant bias that may constitute illegal discrimination.`,
    };
  }
  if (high > 0) {
    return {
      level: "MEDIUM",
      justification: `${high} high-severity finding(s) detected. Bias exists but may be within acceptable bounds with mitigation.`,
    };
  }
  return {
    level: "LOW",
    justification: "No significant bias detected across tested attributes. System appears to treat demographic groups comparably.",
  };
}

function formatBiasMetrics(auditResults) {
  if (!auditResults?.groupComparisons) return null;
  return Object.values(auditResults.groupComparisons).map(c => ({
    attribute: c.attribute,
    groupA: c.groupA,
    groupB: c.groupB,
    flipRate: c.flipRate,
    directedScoreDiff: c.directedScoreDiff,
    tTestP: c.welchTTest.pValue,
    chiSqP: c.chiSquaredTest.pValue,
    passes80Pct: c.demographicParity.passes80PercentRule,
    biasDetected: c.biasDetected,
  }));
}

function formatIntersectionalMetrics(results) {
  if (!results?.summary) return null;
  return {
    compoundBiasDetected: results.summary.compoundBiasDetected,
    mostAdvantaged: results.summary.mostAdvantaged?.key || "N/A",
    leastAdvantaged: results.summary.leastAdvantaged?.key || "N/A",
    maxGap: results.summary.maxScoreGap,
  };
}

function formatProxyMetrics(proxyResults) {
  if (!proxyResults) return null;
  // Group by proxy type
  const byType = {};
  for (const [key, bucket] of Object.entries(proxyResults)) {
    const type = bucket.proxyType || "unknown";
    if (!byType[type]) byType[type] = { diffs: [], significant: false };
    byType[type].diffs.push(bucket.directedScoreDiff || 0);
    if (bucket.biasDetected) byType[type].significant = true;
  }
  return Object.entries(byType).map(([type, data]) => ({
    proxyType: type,
    avgScoreDiff: data.diffs.reduce((a, b) => a + b, 0) / data.diffs.length,
    significant: data.significant,
  }));
}

function extractSampleSizes(auditResults) {
  if (!auditResults?.groupComparisons) return {};
  const sizes = {};
  for (const c of Object.values(auditResults.groupComparisons)) {
    sizes[`${c.groupA}_vs_${c.groupB}`] = c.sampleSize;
  }
  return sizes;
}

function generateMitigationSteps(findings) {
  const steps = [];
  const hasCritical = findings.some(f => f.severity === "CRITICAL");

  if (hasCritical) {
    steps.push("IMMEDIATE: Halt automated screening for affected demographic groups until bias is remediated");
    steps.push("Implement human-in-the-loop review for all candidate evaluations");
    steps.push("Audit training data for demographic representation imbalances");
    steps.push("Consider post-processing fairness constraints (equalized odds, demographic parity)");
  }

  steps.push("Implement continuous monitoring dashboards disaggregated by demographic group");
  steps.push("Establish regular re-audit schedule (quarterly recommended)");
  steps.push("Create incident reporting and appeals process for candidates");
  steps.push("Train recruiters on system limitations and bias risks");

  return steps;
}

function generateResidualRisks(findings) {
  return [
    "Bias in attributes not tested (disability, religion, sexual orientation)",
    "Subtle proxy discrimination through features correlated with protected attributes",
    "Temporal drift — model behavior may change with updates",
    "Intersectional bias in rare combinations may be undetected due to small sample sizes",
  ];
}

function generateDeploymentConditions(riskLevel, findings) {
  const conditions = [];

  if (riskLevel.level === "HIGH") {
    conditions.push("DO NOT deploy for automated decision-making until critical findings are resolved");
    conditions.push("Engage external auditor for independent bias assessment");
    conditions.push("Conduct impact assessment per EU AI Act Article 9");
  } else if (riskLevel.level === "MEDIUM") {
    conditions.push("Deploy only with mandatory human review of all decisions");
    conditions.push("Implement bias monitoring dashboard before launch");
    conditions.push("Schedule re-audit within 30 days of deployment");
  } else {
    conditions.push("Deploy with standard monitoring");
    conditions.push("Re-audit within 90 days and after any model update");
  }

  conditions.push("Maintain audit logs for all screening decisions per EU AI Act Article 12");
  conditions.push("Provide candidates with explanation of screening criteria per EU AI Act Article 13");

  return conditions;
}
