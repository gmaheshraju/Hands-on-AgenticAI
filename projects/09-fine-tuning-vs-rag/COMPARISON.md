# Customer Support Ticket Classification: Three Approaches Compared

## Problem Statement

Classify incoming customer support tickets into one of four categories:
**billing**, **technical**, **account**, **feature-request**.

Evaluated on a held-out test set of 30 tickets.

---

## Head-to-Head Results

| Approach | Accuracy | Avg Latency | P95 Latency | Est. Cost/Query | Setup Cost | Maintenance |
|----------|----------|-------------|-------------|-----------------|------------|-------------|
| Zero-Shot Prompting | 80.0% | 470ms | 537ms | $0.000003 | None | None |
| Few-Shot Prompting | 90.0% | 528ms | 630ms | $0.000016 | Minimal (write 8 examples) | Low |
| RAG (Retrieval) | 93.3% | 639ms | 746ms | $0.000028 | Medium (index 100 tickets) | Medium (update index) |
| Fine-Tuned Model | 96.7% | 264ms | 341ms | $0.000002 | High ($0.07-$5 training) | High (retrain on changes) |

---

## Per-Category Accuracy (F1 Score)

| Approach | Billing | Technical | Account | Feature-Request |
|----------|---------|-----------|---------|----------------|
| Zero-Shot Prompting | 0.75 | 0.88 | 0.71 | 0.86 |
| Few-Shot Prompting | 0.94 | 0.88 | 0.92 | 0.86 |
| RAG (Retrieval) | 0.94 | 0.93 | 0.92 | 0.93 |
| Fine-Tuned Model | 1.00 | 0.93 | 1.00 | 0.93 |

---

## Misclassification Analysis

### Zero-Shot Prompting (6 errors)

- **"I was billed for a feature upgrade I never requested or approved."**
  Expected: `billing` | Predicted: `account`
- **"Can you add a bulk edit option for tasks in the list view?"**
  Expected: `feature-request` | Predicted: `technical`
- **"I need to change the primary admin of our organization to a different person."**
  Expected: `account` | Predicted: `billing`
- **"Why am I seeing charges in my statement from a plan I downgraded last month?"**
  Expected: `billing` | Predicted: `account`
- **"I accidentally accepted an invite to the wrong workspace. How do I leave?"**
  Expected: `account` | Predicted: `billing`
- _...and 1 more_

### Few-Shot Prompting (3 errors)

- **"Can you add a bulk edit option for tasks in the list view?"**
  Expected: `feature-request` | Predicted: `technical`
- **"I accidentally accepted an invite to the wrong workspace. How do I leave?"**
  Expected: `account` | Predicted: `billing`
- **"Charts render as blank white boxes on Firefox but work fine in Chrome."**
  Expected: `technical` | Predicted: `feature-request`

### RAG (Retrieval) (2 errors)

- **"I accidentally accepted an invite to the wrong workspace. How do I leave?"**
  Expected: `account` | Predicted: `billing`
- **"Charts render as blank white boxes on Firefox but work fine in Chrome."**
  Expected: `technical` | Predicted: `feature-request`

### Fine-Tuned Model (1 errors)

- **"Charts render as blank white boxes on Firefox but work fine in Chrome."**
  Expected: `technical` | Predicted: `feature-request`

---

## Total Cost of Ownership (1,000 tickets/month)

| Approach | Setup (one-time) | Monthly Inference | Monthly Total | 12-Month Total |
|----------|------------------|-------------------|---------------|----------------|
| Zero-Shot Prompting | $0.00 | $0.04 | $0.04 | $0.46 |
| Few-Shot Prompting | $0.00 | $0.07 | $0.07 | $0.90 |
| RAG (Retrieval) | $0.00 | $0.10 | $0.10 | $1.14 |
| Fine-Tuned Model | $0.50 | $0.02 | $0.06 | $0.68 |

---

## When to Use Each Approach

### Zero-Shot Prompting
- **Best for**: Prototyping, low-volume use cases, rapidly changing categories
- **Avoid when**: You need >90% accuracy or have ambiguous tickets
- **Time to production**: Minutes

### Few-Shot Prompting
- **Best for**: Quick accuracy boost without infrastructure, stable category definitions
- **Avoid when**: Examples don't cover edge cases well enough
- **Time to production**: Hours (curate examples)

### RAG (Retrieval-Augmented Generation)
- **Best for**: When you have a growing knowledge base, categories shift over time, need explainability
- **Avoid when**: Your ticket corpus is tiny (<50 examples) or all tickets are very similar
- **Time to production**: Days (build index, tune retrieval)

### Fine-Tuned Model
- **Best for**: High volume, stable categories, need lowest latency, regulatory constraints
- **Avoid when**: Categories change frequently, small dataset, budget constraints
- **Time to production**: Weeks (data curation, training, validation)

---

## Recommendation for the CTO

**Start with Few-Shot Prompting, graduate to RAG when volume justifies it.**

1. **Immediate (Week 1)**: Deploy few-shot prompting. It requires zero infrastructure,
   costs almost nothing, and typically achieves 85-93% accuracy on well-defined categories.

2. **Short-term (Month 1-2)**: As you accumulate labeled tickets from production,
   build a RAG pipeline. The retrieval step provides similar-ticket evidence that
   improves accuracy on ambiguous cases and gives agents context for resolution.

3. **Long-term (Month 3+)**: Consider fine-tuning only if:
   - Volume exceeds 10,000+ tickets/month (cost savings from shorter prompts)
   - Latency requirements are strict (<200ms)
   - Categories are stable (no new categories added monthly)
   - You have 500+ high-quality labeled examples

**Key insight**: The accuracy gap between approaches is smaller than most people expect.
The real differentiators are maintenance cost and adaptability to change.
