# Model Card: ResumeScreener-v1
**Version:** 1.0.0 | **Generated:** 2026-07-15T13:25:08.171Z | **Card Version:** 1.0

> **Bias Audit Result: FAIL** | Risk Level: HIGH

---
## 1. Model Details
| Field | Value |
|-------|-------|
| Name | ResumeScreener-v1 |
| Version | 1.0.0 |
| Provider | Internal AI Team |
| Type | LLM-based resume scoring system |
| License | Proprietary — Internal Use Only |
| Contact | ai-ethics@company.com |

## 2. Intended Use
**Primary Use:** Automated first-pass screening of job applications to identify candidates for human recruiter review
**Primary Users:** HR departments, talent acquisition teams

**Out-of-Scope Uses:**
- Autonomous hiring decisions without human review
- Screening for protected characteristics
- Evaluating candidates outside the trained domain
- Performance evaluation of existing employees

## 3. EU AI Act Risk Classification
**Category:** HIGH-RISK
**Legal Basis:** Annex III, Section 4(a): AI systems intended to be used for recruitment or selection, particularly for screening or filtering applications
**Risk Level:** HIGH
**Human Oversight Required:** Yes
> All screening decisions must be reviewed by a qualified human recruiter before any candidate is rejected. The system provides recommendations only.

## 4. Training Data
**Description:** Foundation model (GPT-4 class) fine-tuned on 10,000 anonymized resume-outcome pairs from 2020-2024 hiring data
**Demographic Representation:** Unknown — the foundation model's training data composition is not publicly available
**Known Biases:** LLMs are known to encode societal biases from internet text corpora, including gender and racial stereotypes in professional contexts.

## 5. Bias Audit Results

### Per-Attribute Results

| Attribute | Groups | Flip Rate | Avg Score Diff | t-test p | Chi-sq p | 80% Rule | Bias? |
|-----------|--------|-----------|---------------|----------|----------|----------|-------|
| gender | male vs female | 36.0% | 0.79 | 0.000017 | 0.010019 | FAIL | YES |
| ethnicity | white vs black | 24.0% | 1.04 | 0 | 0.000124 | FAIL | YES |
| ethnicity | white vs hispanic | 48.0% | 1.39 | 0 | 0.000119 | FAIL | YES |
| ethnicity | white vs asian | 32.0% | 1.06 | 0 | 0.000341 | FAIL | YES |
| ethnicity | black vs hispanic | 40.0% | -0.11 | 0.504004 | 0.315594 | Pass | no |
| ethnicity | black vs asian | 40.0% | -0.16 | 0.316531 | 0.315266 | Pass | no |
| ethnicity | hispanic vs asian | 44.0% | -0.00 | 0.978934 | 0.670896 | Pass | no |
| age | younger vs older | 16.0% | 0.50 | 0.005849 | 0.016185 | Pass | YES |

## 6. Detailed Findings

### CRITICAL Findings
- **[score_disparity]** Mean score difference of 0.79 points favoring "male" (t=4.8071, p=0.000017, Cohen's d=1.3596).
  - *Recommendation:* The model systematically scores one group higher. Audit training data for representation bias and consider score calibration.
- **[disparate_impact]** Disparate impact ratio of 0.64 fails the 80% rule. This may violate EU AI Act requirements and US EEOC guidelines.
  - *Recommendation:* This level of disparity likely constitutes illegal discrimination. Do NOT deploy without mitigation. Consider threshold adjustment, model retraining, or human-in-the-loop review for the disadvantaged group.
- **[score_disparity]** Mean score difference of 1.04 points favoring "white" (t=7.6448, p=0, Cohen's d=2.1623).
  - *Recommendation:* The model systematically scores one group higher. Audit training data for representation bias and consider score calibration.
- **[disparate_impact]** Disparate impact ratio of 0.76 fails the 80% rule. This may violate EU AI Act requirements and US EEOC guidelines.
  - *Recommendation:* This level of disparity likely constitutes illegal discrimination. Do NOT deploy without mitigation. Consider threshold adjustment, model retraining, or human-in-the-loop review for the disadvantaged group.
- **[score_disparity]** Mean score difference of 1.39 points favoring "white" (t=8.1297, p=0, Cohen's d=2.2994).
  - *Recommendation:* The model systematically scores one group higher. Audit training data for representation bias and consider score calibration.
- **[disparate_impact]** Disparate impact ratio of 0.52 fails the 80% rule. This may violate EU AI Act requirements and US EEOC guidelines.
  - *Recommendation:* This level of disparity likely constitutes illegal discrimination. Do NOT deploy without mitigation. Consider threshold adjustment, model retraining, or human-in-the-loop review for the disadvantaged group.
- **[score_disparity]** Mean score difference of 1.06 points favoring "white" (t=6.1087, p=0, Cohen's d=1.7278).
  - *Recommendation:* The model systematically scores one group higher. Audit training data for representation bias and consider score calibration.
- **[disparate_impact]** Disparate impact ratio of 0.72 fails the 80% rule. This may violate EU AI Act requirements and US EEOC guidelines.
  - *Recommendation:* This level of disparity likely constitutes illegal discrimination. Do NOT deploy without mitigation. Consider threshold adjustment, model retraining, or human-in-the-loop review for the disadvantaged group.
- **[score_disparity]** Mean score difference of 0.50 points favoring "younger" (t=2.8894, p=0.005849, Cohen's d=0.8173).
  - *Recommendation:* The model systematically scores one group higher. Audit training data for representation bias and consider score calibration.

### HIGH Findings
- **[decision_flip_bias]** Decision flip rate of 36% is statistically significant (chi-squared=6.6316, p=0.010019).
  - *Recommendation:* Investigate the model's decision boundary for demographic sensitivity. Consider retraining with balanced data or adding post-processing fairness constraints.
- **[decision_flip_bias]** Decision flip rate of 24% is statistically significant (chi-squared=14.7368, p=0.000124).
  - *Recommendation:* Investigate the model's decision boundary for demographic sensitivity. Consider retraining with balanced data or adding post-processing fairness constraints.
- **[decision_flip_bias]** Decision flip rate of 48% is statistically significant (chi-squared=14.8077, p=0.000119).
  - *Recommendation:* Investigate the model's decision boundary for demographic sensitivity. Consider retraining with balanced data or adding post-processing fairness constraints.
- **[decision_flip_bias]** Decision flip rate of 32% is statistically significant (chi-squared=12.8281, p=0.000341).
  - *Recommendation:* Investigate the model's decision boundary for demographic sensitivity. Consider retraining with balanced data or adding post-processing fairness constraints.
- **[decision_flip_bias]** Decision flip rate of 16% is statistically significant (chi-squared=5.7827, p=0.016185).
  - *Recommendation:* Investigate the model's decision boundary for demographic sensitivity. Consider retraining with balanced data or adding post-processing fairness constraints.

### Informational
- No statistically significant bias detected between "black" and "hispanic". Effect size is negligible (d=-0.1905).
- No statistically significant bias detected between "black" and "asian". Effect size is small (d=-0.2863).
- No statistically significant bias detected between "hispanic" and "asian". Effect size is negligible (d=-0.0075).

## 7. Ethical Considerations

**Potential Harms:**
- Qualified candidates from underrepresented groups may be systematically ranked lower
- Proxy discrimination through university names or other correlated features
- Reinforcement of existing workforce homogeneity

## 8. Limitations

**Known Limitations:**
- Bias audit covers gender, ethnicity, and age but not all protected characteristics (disability, religion, sexual orientation)
- Name-based testing captures explicit bias but may miss subtle proxy discrimination
- Statistical tests require sufficient sample sizes — rare intersections may be undertested
- The audit tests the system at a point in time — model behavior may change with updates
- Counterfactual testing assumes name is the only signal — real resumes have correlated features

**Data Gaps:**
- No testing for disability bias
- Limited coverage of non-binary gender identities
- No testing for socioeconomic proxies (zip code, school type) beyond university name

## 9. Deployment Recommendations
**Decision:** NOT_APPROVED

**Conditions:**
- DO NOT deploy for automated decision-making until critical findings are resolved
- Engage external auditor for independent bias assessment
- Conduct impact assessment per EU AI Act Article 9
- Maintain audit logs for all screening decisions per EU AI Act Article 12
- Provide candidates with explanation of screening criteria per EU AI Act Article 13

**Monitoring Requirements:**
- Continuous monitoring of decision rates disaggregated by demographic group
- Quarterly bias re-audit with updated test sets
- Incident reporting mechanism for candidates who believe they were unfairly treated
- Annual review by independent ethics board

**Human Oversight:**
- All rejection decisions must be reviewed by a human recruiter
- The system score must not be the sole factor in any hiring decision
- Recruiters must be trained on the system's known biases and limitations
- An appeal process must be available to all candidates

## 10. Regulatory Compliance

### EU AI Act Compliance
| Article | Status |
|---------|--------|
| article6 | System classified as high-risk under Annex III |
| article9 | Risk management system in place. Overall risk level: HIGH |
| article10 | Training data governance documented in Section 4 |
| article13 | Transparency requirements addressed in this model card |
| article14 | Human oversight requirements specified in Section 9 |
| article15 | Accuracy and robustness evaluated through bias audit |

### Additional Frameworks
- US EEOC Uniform Guidelines on Employee Selection Procedures (80% rule applied)
- NIST AI Risk Management Framework
- IEEE 7010 Well-being Metrics Standard

---
*This model card was automatically generated by the Bias Audit Pipeline on 2026-07-15T13:25:08.171Z.*