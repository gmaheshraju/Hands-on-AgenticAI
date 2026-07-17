# Project 13: Bias Audit Pipeline + Model Card Generator

## The Problem

Your company is shipping an AI-powered resume screening tool. Before launch, legal needs a bias audit: does the model treat candidates differently based on gender, ethnicity, or age? And regulatory compliance (EU AI Act classifies hiring AI as "high-risk") requires a model card documenting the system's capabilities, limitations, and fairness metrics. Nobody on the team has done this before.

## What You Build

Two tools:

**1. Bias audit pipeline** — A test harness that systematically checks an LLM-based system for demographic bias.

**2. Model card generator** — An automated tool that produces a standardized model card from the audit results.

## Architecture Requirements

### Bias Audit Pipeline

1. **Test dataset construction** — Create matched pairs of inputs that differ only on a demographic attribute:
   - Gender: same resume, change "John" to "Jane" (and corresponding pronouns)
   - Ethnicity: same resume, change names to statistically associated names
   - Age: same resume, change graduation year (1985 vs 2015)
   - Generate at least 50 matched pairs per attribute

2. **Counterfactual testing** — For each matched pair:
   - Send both versions through the AI system
   - Compare outputs: screening score, recommended action, generated summary
   - Flag any pair where the outputs differ meaningfully (not just wording — actual decision differences)

3. **Statistical analysis** — Across all pairs:
   - Compute the decision flip rate per attribute (what % of pairs get different decisions)
   - Compute the average score difference per attribute
   - Apply a significance test: is the difference statistically significant or within noise?
   - Demographic parity check: does the positive rate differ by more than a threshold across groups?

4. **Intersectional analysis** — Check combinations: does bias compound for specific intersections (e.g., gender + ethnicity)?

5. **Red-teaming** — Beyond matched pairs, test for:
   - Stereotyping: does the model associate certain roles with certain demographics?
   - Proxy discrimination: does the model use zip code, university name, or other proxies for protected attributes?
   - Test with 10 adversarial prompts designed to elicit biased behavior

### Model Card Generator

1. **Collect metadata automatically:**
   - Model name, version, provider
   - Intended use case and out-of-scope uses
   - Training data description (if available)
   - Evaluation metrics from the bias audit

2. **Generate structured sections:**
   - Model details (name, version, type)
   - Intended use (what it's for, what it's not for)
   - Metrics (performance on the test set, bias audit results)
   - Ethical considerations (identified biases, mitigation steps)
   - Limitations (known failure modes, data gaps)
   - Recommendations (how to deploy responsibly)

3. **Output format** — Generate both markdown (for GitHub) and a structured JSON file (for programmatic consumption).

## Evaluation Criteria

- Dataset: do the matched pairs isolate demographic attributes cleanly?
- Detection: test with a model you know is biased (e.g., use a deliberately biased system prompt). Does the pipeline detect it?
- Statistical rigor: are you using appropriate significance tests?
- Model card: does it contain all sections required by the EU AI Act's transparency requirements?
- Actionability: does the audit report tell you what to fix, not just that bias exists?

## Stack

- Python (better statistical libraries) or Node.js
- Any LLM API for the system under test
- Statistical libraries (scipy for Python, simple-statistics for Node)
- Markdown/JSON for model card output

