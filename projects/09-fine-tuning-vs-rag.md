# Capstone 09: Three Approaches, One Problem — Customer Support Q&A

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
   - Use LLM-as-judge (from Capstone 08) to score each answer on correctness and completeness
   - Produce a comparison table:
     ```
     | Approach     | Avg Score | Cost/Query | Latency | Setup Cost | Maintenance |
     |-------------|-----------|------------|---------|------------|-------------|
     | Prompting   |           |            |         | None       | Low         |
     | RAG         |           |            |         | Medium     | Medium      |
     | Fine-tuned  |           |            |         | High       | High        |
     ```

## What Makes This Not a Toy

- You'll discover that prompting works surprisingly well for the simple questions — the gap shows up on edge cases and questions requiring synthesis across multiple articles
- RAG retrieval quality is the bottleneck, not generation quality
- Fine-tuning is expensive to set up and hard to update when articles change — you'll feel the maintenance cost
- The comparison forces you to think about total cost of ownership, not just per-query cost
- Real-world decision: most teams should start with RAG and only fine-tune when they have evidence it's needed

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

## Staff+ Interview Angle

"I built the same Q&A system three ways and compared them on 50 test questions. Prompting scored well on simple factual questions but failed on multi-article synthesis. RAG handled synthesis well but retrieval precision was the bottleneck. Fine-tuning had the lowest latency but couldn't answer questions about articles added after training. My recommendation was RAG for most teams — it balances quality, cost, and maintainability. Fine-tuning only makes sense when you have stable knowledge and need sub-100ms latency."
