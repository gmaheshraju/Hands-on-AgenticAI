# RAG Eval Harness

A complete evaluation pipeline for RAG (Retrieval-Augmented Generation) systems. Scores answers across three dimensions using LLM-as-judge with calibrated rubrics, detects regressions against saved baselines, and generates markdown reports.

## Architecture

```
golden-set.json → RAG System → LLM Judge → Regression Check → Report
                                  │
                    ┌──────────────┼──────────────┐
                    │              │              │
               Faithfulness   Relevance    Completeness
              (grounded in   (answers the  (covers all
               sources?)      question?)    key points?)
```

## Quick Start

```bash
npm install

# Run with mock judge (no API key needed)
node src/demo.js

# Run with real Gemini LLM judge
GEMINI_API_KEY=your-key node src/demo.js

# Run eval pipeline directly
node src/runner.js --mock

# Save current run as baseline
node src/runner.js --mock --save-baseline

# CI mode (exits 1 on regressions)
node src/runner.js --mock --ci
```

## Key Files

| File | Purpose |
|------|---------|
| `data/golden-set.json` | 30 Q&A triples with expected answers, source docs, key points |
| `src/dimensions.js` | Scoring rubric prompts for each eval dimension |
| `src/evaluator.js` | LLM-as-judge implementation (Gemini + mock fallback) |
| `src/regression.js` | Compare runs, detect score drops, diff reporting |
| `src/reporter.js` | Markdown report generator with tables and details |
| `src/runner.js` | Pipeline orchestrator: eval → score → compare → report |
| `src/demo.js` | Demo showing perfect vs degraded RAG with regression detection |

## The LLM-as-Judge Pattern

The core insight: naive LLM judges rate everything 4-5 out of 5. The rubric prompts in `src/dimensions.js` combat this with:

1. **Concrete failure examples** — calibration examples showing what a 1, 2, 3 should look like
2. **Mandatory justifications** — forces the judge to explain each score
3. **Structured JSON output** — prevents vague prose responses
4. **Low temperature** — reduces scoring variance between runs

## Evaluation Dimensions

### Faithfulness (weight: 40%)
Is every claim in the answer grounded in the source documents? Catches hallucination.

### Relevance (weight: 30%)
Does the answer actually address the question asked? Catches off-topic responses.

### Completeness (weight: 30%)
Does the answer cover all key points? Catches partial/incomplete answers.

## Regression Detection

The harness stores baselines (JSON snapshots of scores) and compares each new run:

- **Per-question**: flags any dimension that drops more than 1 point
- **Aggregate**: flags if any overall metric drops more than 5%
- **Diff summary**: "3 regressed, 2 improved, 25 unchanged"

In CI mode (`--ci`), the process exits with code 1 when regressions are detected.

## Golden Dataset

The 30-question dataset covers a fictional company (TechCorp) knowledge base with:

- **Difficulty levels**: easy (7), medium (14), hard (9)
- **Categories**: factual (17), reasoning (8), multi-hop (5)
- **Each entry includes**: question, expected answer, source documents, key points

Building the golden dataset is the hardest and most valuable part of eval engineering.

