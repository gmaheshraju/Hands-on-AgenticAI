# Project 09: Same Problem Three Ways

Customer support ticket classification using three approaches — **Prompting**, **RAG**, and **Fine-Tuning** — evaluated head-to-head on the same test set.

## The Problem

Classify incoming support tickets into four categories: `billing`, `technical`, `account`, `feature-request`.

## Three Approaches

### 1. Prompt Engineering (`src/prompting.js`)
- **Zero-shot**: Send the ticket text with category list. No examples.
- **Few-shot**: Include 8 hand-picked examples (2 per category) in the prompt.
- **Pros**: Zero setup, cheapest per query, instant iteration.
- **Cons**: Least accurate on ambiguous tickets, no learning from history.

### 2. RAG — Retrieval-Augmented Generation (`src/rag.js`)
- Build a TF-IDF vector index of 100 training tickets.
- For each new ticket, retrieve the 5 most similar past tickets.
- Use retrieved examples as context for LLM classification.
- **Pros**: Improves with more data, handles edge cases, provides evidence.
- **Cons**: Retrieval quality is the bottleneck, higher latency.

### 3. Fine-Tuning (`src/fineTuning.js`)
- Prepare training data in JSONL format (OpenAI, Gemini, Together.ai formats).
- Validate data quality (balance, duplicates, length distribution).
- Train a model on 100 labeled examples (mocked in demo, setup is production-ready).
- **Pros**: Highest accuracy, lowest inference latency, shortest prompts.
- **Cons**: Training cost, retraining needed when categories change, data curation effort.

## Architecture

```
                        Support Ticket
                             |
            ┌────────────────┼────────────────┐
            v                v                v
   ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
   │  Prompting  │  │     RAG      │  │ Fine-Tuning  │
   │             │  │              │  │              │
   │ Zero-shot / │  │ TF-IDF index │  │ JSONL prep   │
   │ Few-shot    │  │ Top-5 retriv │  │ Train model  │
   │ examples    │  │ + LLM class. │  │ Inference    │
   └──────┬──────┘  └──────┬───────┘  └──────┬───────┘
          |                |                  |
          v                v                  v
   ┌──────────────────────────────────────────────┐
   │              Evaluation Harness              │
   │  30 held-out tickets, same test set for all  │
   │                                              │
   │  Metrics: accuracy, F1, latency, cost/query  │
   └──────────────────┬───────────────────────────┘
                      |
                      v
            ┌──────────────────┐
            │  COMPARISON.md   │
            │  Side-by-side    │
            │  recommendation  │
            └──────────────────┘
```

## Quick Start

```bash
npm install

# Full demo (works without API key — uses sample data)
node src/demo.js

# With live API evaluation
GEMINI_API_KEY=your-key node src/demo.js

# Use cached results from a previous live run
GEMINI_API_KEY=your-key node src/demo.js --skip-eval
```

## Individual Components

```bash
# Test prompting approach
GEMINI_API_KEY=your-key node src/prompting.js

# Test RAG approach
GEMINI_API_KEY=your-key node src/rag.js

# Test fine-tuning data prep + mock inference
GEMINI_API_KEY=your-key node src/fineTuning.js

# Run full evaluation
GEMINI_API_KEY=your-key node src/evaluate.js

# Generate comparison table
node src/comparison.js
```

## Data

- `data/tickets.json` — 100 labeled training tickets (25 per category)
- `data/test-set.json` — 30 held-out test tickets
- `data/fine-tuning/` — Generated training files in multiple formats

## Output

The main deliverable is `COMPARISON.md` — a markdown comparison table showing:
- Accuracy across all approaches
- Per-category F1 scores
- Latency (avg, P50, P95)
- Cost per query and total cost of ownership
- Misclassification analysis
- When to use each approach
- CTO recommendation

## Key Takeaways

1. **Few-shot prompting gets you 90% of the way** with zero infrastructure.
2. **RAG shines on ambiguous tickets** where retrieved examples disambiguate.
3. **Fine-tuning has the highest accuracy** but the maintenance cost is real.
4. **Start simple, graduate when data justifies it** — most teams should begin with few-shot, build RAG when volume grows, and fine-tune only with evidence it's needed.

