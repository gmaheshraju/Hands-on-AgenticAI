# Project 09: Three Approaches, One Problem — Customer Support Q&A

## The Problem

Your company has 500 support articles. Customers ask questions in chat. Today, a support agent searches manually and copy-pastes answers. You've been asked to automate this. Your CTO wants to see a comparison: prompting vs RAG vs fine-tuning. Not a theoretical analysis — an actual head-to-head on real data.

## What You Build

The same customer support Q&A feature, built three ways, evaluated against the same test set.

**Approach 1: Prompt Engineering** — Stuff the most relevant articles into the context window. No retrieval infrastructure.

**Approach 2: RAG** — Embed and index all articles. Retrieve relevant chunks per question. Generate answer from retrieved context.

**Approach 3: Fine-tuned model** — Fine-tune a small model on question-answer pairs extracted from the articles. No retrieval at inference time.

## Architecture Requirements

1. **Dataset preparation:**
   - Source: use a real public knowledge base. Good options: Stripe docs, Twilio docs, or any product with substantial public documentation.
   - Extract 500+ Q&A pairs from the docs (use an LLM to generate realistic questions per article)
   - Split: 400 for training (fine-tuning), 50 for validation, 50 for testing
   - The test set is sacred — same 50 questions evaluated across all 3 approaches

2. **Approach 1: Prompt Engineering**
   - For each question, use BM25 or simple keyword matching to find the top 3 most relevant articles
   - Stuff them into the context window with the question
   - Evaluate: quality, cost per query, latency

3. **Approach 2: RAG Pipeline**
   - Chunk articles, embed, store in a vector DB
   - For each question: retrieve top 5 chunks via vector search, generate answer
   - Evaluate: quality, cost per query (embedding + generation), latency, retrieval precision

4. **Approach 3: Fine-tuning**
   - Format 400 Q&A pairs into training format (JSONL for OpenAI, or appropriate format for the provider)
   - Fine-tune a small model (GPT-4o-mini, or Mistral 7B via together.ai / fireworks.ai)
   - Evaluate: quality, cost per query (inference only — note training cost separately), latency

5. **Head-to-head evaluation:**
   - Run all 50 test questions through all 3 approaches
   - Use LLM-as-judge (from Project 08) to score each answer on correctness and completeness
   - Produce a comparison table:
     ```
     | Approach     | Avg Score | Cost/Query | Latency | Setup Cost | Maintenance |
     |-------------|-----------|------------|---------|------------|-------------|
     | Prompting   |           |            |         | None       | Low         |
     | RAG         |           |            |         | Medium     | Medium      |
     | Fine-tuned  |           |            |         | High       | High        |
     ```

## Evaluation Criteria

- Did you use the same test set across all approaches? (methodological rigor)
- Are the quality scores credible? (judge calibration)
- Is the comparison table filled with real numbers, not estimates?
- Did you document when each approach fails? (failure analysis per approach)
- What's your recommendation and why? (the actual deliverable for the CTO)

## Stack

- Node.js or Python
- Vector DB for RAG (ChromaDB, LanceDB)
- Fine-tuning API (OpenAI fine-tuning, together.ai, fireworks.ai)
- LLM-as-judge for evaluation

