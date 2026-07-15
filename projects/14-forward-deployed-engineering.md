# Capstone 14: Customer Onboarding Toolkit for an AI Product

## The Problem

You're an FDE at an AI startup. You've just been assigned to a new enterprise customer — a mid-size law firm that wants to use your document analysis platform. Their data is in SharePoint, their documents are a mix of PDFs and Word files, their lawyers don't trust AI, and they need to see results within 2 weeks or they'll cancel the pilot. You need a toolkit that lets you onboard any new customer fast: connect to their data, adapt the AI to their domain, build an eval set from their documents, and track the pilot.

## What You Build

A reusable customer onboarding toolkit that an FDE would use on their first day at a new customer site.

## Architecture Requirements

### 1. Data Connector Framework

Build a pluggable data connector that can ingest documents from different sources:
- **Local filesystem** (folder of PDFs/DOCX files)
- **S3 bucket** (list and download files)
- **API endpoint** (paginated REST API that returns documents)

Each connector implements the same interface:
```
{ listDocuments() → [{id, name, type, size, modified}],
  fetchDocument(id) → {content, metadata} }
```

Include document processing: extract text from PDF (via pdf-parse) and DOCX (via mammoth or docx). Track extraction quality — flag documents where extraction fails or produces garbage.

### 2. Domain Adaptation Pipeline

A script that takes the customer's documents and adapts the AI system:
- **Domain vocabulary extraction** — Identify domain-specific terms (legal terms, medical terms, internal jargon) that the base model might not handle well
- **Few-shot example generation** — From the customer's documents, generate 10-20 example question-answer pairs that demonstrate the kind of queries their users will ask
- **System prompt builder** — Generate a domain-specific system prompt that includes the vocabulary, example Q&A patterns, and customer-specific instructions
- **Test it** — Run the adapted system against the generated examples and verify it handles domain terminology correctly

### 3. Eval Set Builder

A tool that helps the FDE quickly build a golden evaluation set from customer data:
- **Auto-generate candidate questions** — Given a document, use an LLM to generate 5 questions that the document should answer
- **Human review interface** — A simple CLI that shows each question + suggested answer and lets the FDE accept, edit, or reject
- **Export** — Save the reviewed eval set as JSON, ready to feed into the eval harness (Capstone 08)

Target: build a 30-question eval set in under 1 hour of FDE time.

### 4. Pilot Dashboard

A simple dashboard that tracks the pilot's progress:
- Documents ingested (count, success/failure rate)
- Eval set size and quality scores over time
- Usage metrics (queries per day, if connected to a live system)
- Open issues / blockers (manual log)
- Days remaining in pilot

### 5. Deployment Checklist

An automated checklist that verifies readiness:
- [ ] Data connector configured and tested
- [ ] Documents ingested (count: X, failed: Y)
- [ ] Domain vocabulary extracted (X terms)
- [ ] System prompt customized
- [ ] Eval set built (X questions)
- [ ] Baseline eval score: X/5
- [ ] Customer stakeholder demo scheduled
- [ ] Feedback loop configured

## What Makes This Not a Toy

- Real customer documents are messy: scanned PDFs with no OCR, Word files with embedded images, documents in the wrong format
- Domain adaptation is where FDE value lives — a generic AI fails on legal jargon, medical abbreviations, or internal acronyms
- The eval set builder must be fast because FDE time is expensive — the human review loop must be frictionless
- The deployment checklist is what separates "I set it up" from "I verified it works end-to-end"
- This toolkit is reusable across customers — build it for one, use it for ten

## Evaluation Criteria

- Connector: can you ingest 50+ documents from at least 2 different sources?
- Domain adaptation: does the adapted system handle domain-specific terminology that the base model gets wrong?
- Eval set builder: can you build a 30-question eval set in under 1 hour?
- Checklist: does it catch a real issue (e.g., documents that failed extraction)?
- Reusability: could another FDE use this toolkit on a different customer without modifying the code?

## Stack

- Node.js or Python
- pdf-parse / mammoth for document extraction
- Any LLM API for domain adaptation and question generation
- SQLite for tracking pilot metrics
- Simple HTML dashboard or CLI-based reporting

## Staff+ Interview Angle

"I built a reusable FDE onboarding toolkit that compresses customer setup from weeks to days. The domain adaptation pipeline was the highest-value piece — it extracts domain vocabulary from the customer's documents, generates few-shot examples, and builds a customized system prompt automatically. Before adaptation, the model got 40% of domain-specific questions right. After, it hit 85% — that's the difference between a failed pilot and a signed contract. The toolkit is designed for reuse: same framework, different data connector and domain vocabulary per customer."
