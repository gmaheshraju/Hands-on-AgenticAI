# Bias Audit Pipeline + Model Card Generator

A complete bias detection and documentation system for AI resume screening tools, built to meet EU AI Act transparency requirements.

## What It Does

1. **Test Dataset Construction** — Generates matched resume pairs that differ only on a demographic attribute (gender, ethnicity, age). Each pair isolates a single variable so any output difference is attributable to that attribute.

2. **Counterfactual Testing** — Sends both versions of each pair through the AI system and compares scores, decisions, and summaries. Flags meaningful differences (decision flips, score gaps).

3. **Statistical Analysis** — Applies rigorous significance tests implemented from scratch:
   - **Chi-squared test** for independence of decision flip rates
   - **Welch's t-test** for score differences between groups
   - **Cohen's d** effect size measurement
   - **Demographic parity** (80% rule / disparate impact ratio)

4. **Intersectional Analysis** — Tests whether bias compounds at specific intersections (e.g., gender + ethnicity). Detects non-additive effects where compound discrimination exceeds the sum of individual biases.

5. **Model Card Generator** — Produces EU AI Act-compliant documentation in both Markdown and JSON, covering all required sections: model details, intended use, risk classification, training data, bias metrics, ethical considerations, limitations, and deployment recommendations.

## Quick Start

```bash
# Run with the deliberately biased mock system (should detect bias)
node src/demo.js

# Full audit including intersectional and proxy tests
node src/demo.js --full

# Run with the fair system (should pass)
node src/demo.js --fair
```

Output files are written to `output/`:
- `MODEL_CARD.md` — Human-readable model card
- `model_card.json` — Machine-readable model card

## Architecture

```
AI Resume Screener (system under test)
                │
                ▼
┌──────────────────────────────┐
│ 1. Dataset Builder           │
│    Matched resume pairs      │
│    (differ only on name/     │
│     pronouns/demographics)   │
│                              │
│  ┌────────┐    ┌────────┐   │
│  │Resume A│    │Resume B│   │  50+ pairs per
│  │ (male) │    │(female)│   │  attribute
│  └────────┘    └────────┘   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ 2. Counterfactual Testing    │
│    Send both versions ──>    │
│    Compare scores, decisions │
│    Flag flips and gaps       │
└──────────────┬───────────────┘
               │
          ┌────┴─────┐
          ▼          ▼
┌──────────────┐ ┌───────────────┐
│3. Statistics │ │4. Intersect.  │
│  Chi-squared │ │  Compound     │
│  Welch's t   │ │  bias at      │
│  Cohen's d   │ │  intersections│
│  80% rule    │ │  (gender x    │
│              │ │   ethnicity)  │
└──────┬───────┘ └───────┬───────┘
       │                 │
       ▼                 ▼
┌──────────────────────────────┐
│ 5. Model Card Generator      │
│    EU AI Act-compliant docs  │
│    ┌──────────┐ ┌──────────┐ │
│    │ .md card │ │.json card│ │
│    └──────────┘ └──────────┘ │
└──────────────────────────────┘
```

### File Structure

```
src/
  datasetBuilder.js    — Matched pair generation (50+ per attribute)
  counterfactual.js    — Run pairs through AI system, compare outputs
  statistics.js        — Chi-squared, t-test, Cohen's d, demographic parity
  intersectional.js    — Compound bias detection
  modelCard.js         — EU AI Act-compliant model card generator
  demo.js              — Full pipeline demo with biased mock system

data/templates/
  resumeTemplates.js   — 5 resume templates + demographic attribute data
```

## Statistical Methods

All significance tests are implemented from first principles (no external dependencies):

- **Chi-squared**: Tests whether decision flip rates differ between groups more than chance. Uses Lanczos gamma approximation for p-value computation.
- **Welch's t-test**: Tests whether mean scores differ between groups, accounting for unequal variances. Uses regularized incomplete beta function for p-value.
- **Cohen's d**: Standardized effect size — negligible (<0.2), small (<0.5), medium (<0.8), large (>=0.8).
- **80% Rule**: EEOC/EU standard — if the positive rate for the disadvantaged group is less than 80% of the advantaged group's rate, it constitutes disparate impact.

## EU AI Act Compliance

The model card covers all transparency requirements for high-risk AI systems:

| Article | Requirement | Coverage |
|---------|-------------|----------|
| Art. 6  | Risk classification | Annex III high-risk classification |
| Art. 9  | Risk management | Risk level assessment from audit findings |
| Art. 10 | Data governance | Training data documentation |
| Art. 13 | Transparency | Full model card with capabilities and limitations |
| Art. 14 | Human oversight | Oversight requirements and conditions |
| Art. 15 | Accuracy & robustness | Bias audit metrics and evaluation methodology |

## Interview Angle

> "I built a bias audit pipeline for an AI resume screener using counterfactual testing — 50 matched resume pairs per demographic attribute, differing only on names and pronouns. The pipeline detected statistically significant gender bias: male names scored 0.8 points higher on average (Welch's t-test, p < 0.001, Cohen's d = 0.9). I implemented chi-squared and t-tests from scratch to understand the math, not just call a library. The model card generator produces EU AI Act-compliant documentation covering all Article 13 transparency requirements. The hardest part was intersectional analysis — individual attribute tests can miss compound discrimination at specific intersections."
