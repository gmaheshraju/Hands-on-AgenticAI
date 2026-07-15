# Capstone 08: Eval Harness for a RAG System

## The Problem

Your team shipped a RAG-powered Q&A bot. It works great on the demo. Then a customer reports: "It told me our refund policy is 90 days. It's actually 30 days." Nobody noticed because there's no systematic evaluation. You need an eval harness that catches these failures before customers do — and runs automatically in CI.

## What You Build

A complete evaluation pipeline for any RAG-based Q&A system.

**Input:** A RAG system (any endpoint that takes a question and returns an answer with sources), plus a golden dataset.

**Output:** A quality report with pass/fail per question, aggregate metrics, and regression detection.

## Architecture Requirements

1. **Golden dataset** — Build a dataset of 30+ question-answer pairs with:
   - The question
   - The expected answer (ground truth)
   - The source documents that should be retrieved
   - Difficulty level (easy / medium / hard)
   - Category (factual / reasoning / multi-hop)

2. **Three evaluation dimensions:**
   - **Retrieval quality:** Did the system retrieve the right documents? Measure: precision@5, recall@5, MRR (Mean Reciprocal Rank)
   - **Answer correctness:** Is the answer factually correct? Measure: LLM-as-judge with a rubric (1-5 scale for correctness, completeness, conciseness)
   - **Faithfulness:** Is the answer grounded in the retrieved documents, or did the model hallucinate? Measure: for each claim in the answer, check if it appears in the retrieved context

3. **LLM-as-judge** — Build a judge prompt that evaluates answers on a structured rubric:
   ```
   Given the question, expected answer, and model's answer:
   - Correctness (1-5): Are the facts right?
   - Completeness (1-5): Does it cover all key points?
   - Conciseness (1-5): Is it unnecessarily verbose?
   - Faithfulness (1-5): Is every claim supported by the context?
   Provide scores and a one-line justification for each.
   ```

4. **Regression detection** — Store results from each eval run. Compare current run against the baseline:
   - Flag any question that dropped more than 1 point on any dimension
   - Flag if aggregate metrics dropped more than 5%
   - Generate a diff report: "3 questions regressed, 2 improved, 25 unchanged"

5. **CI integration** — The eval runs as a script that exits with code 1 if regressions are detected. Include a sample GitHub Actions workflow file.

## What Makes This Not a Toy

- Building the golden dataset is the hardest part — and the most valuable. Most teams skip it
- LLM-as-judge has its own failure modes: it's lenient, inconsistent, and expensive. You'll need to calibrate it against human judgments
- Faithfulness checking requires decomposing the answer into individual claims — this is non-trivial
- Regression detection across runs requires versioned storage — you're building a lightweight experiment tracker
- Running this in CI means it needs to be fast (under 5 minutes) and cheap (under $2 per run)

## Evaluation Criteria

- Golden dataset quality: are the ground truth answers accurate and comprehensive?
- Judge accuracy: manually review 10 judge evaluations. Does the judge agree with your assessment?
- Regression detection: introduce a deliberate regression (change a prompt template) and verify the harness catches it
- CI integration: does the pipeline run end-to-end and produce a clear pass/fail?
- Cost per eval run

## Stack

- Node.js or Python
- Any LLM API for the judge
- SQLite or JSON files for storing eval results across runs
- The RAG system under test (use your Capstone 05 system, or mock one)

## Staff+ Interview Angle

"I built an eval harness with three dimensions: retrieval quality, answer correctness, and faithfulness. The LLM-as-judge approach worked but needed calibration — out of the box, it rated everything 4 or 5 out of 5. I fixed it by adding concrete failure examples to the rubric prompt and requiring one-line justifications for each score. The regression detection caught a subtle bug where a prompt template change improved average scores but caused 3 specific questions to hallucinate."
