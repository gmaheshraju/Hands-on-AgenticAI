# Capstone 14: FDE Customer Onboarding Toolkit

A reusable toolkit for Forward Deployed Engineers to onboard enterprise customers onto an AI document analysis platform. Compresses customer setup from weeks to days.

## Quick Start

```bash
npm install
node src/demo.js          # Full pipeline + dashboard at http://localhost:3014
node src/demo.js --no-server   # Pipeline only, no dashboard
node src/checklist.js      # Just the deployment readiness check
node src/evalBuilder.js --auto # Generate + auto-accept eval set
```

## Architecture

```
Data Sources              Processing              Adaptation           Output
+-----------+
| Filesystem|--+
+-----------+  |    +----------+    +-----------+    +----------+
               +--->| Document |    |  Domain   |    |  Eval    |
+-----------+  |    | Process  +--->|  Adapter  +--->|  Builder |
| API (mock)|--+    +----------+    +-----------+    +----------+
+-----------+            |                |               |
                         v                v               v
                    +-----------+   +-----------+   +-----------+
                    | Quality   |   | Vocab +   |   | Golden    |
                    | Tracking  |   | Prompt    |   | Q&A Set   |
                    +-----------+   +-----------+   +-----------+
                                         \          /
                                    +------------------+
                                    | Deploy Checklist |
                                    +------------------+
                                            |
                                    +------------------+
                                    | Pilot Dashboard  |
                                    +------------------+
```

## Components

### 1. Data Connector Framework (`src/connectors/`)

Pluggable connectors with a common interface:

```js
connector.listDocuments()    // [{id, name, type, size, modified}]
connector.fetchDocument(id)  // {content, metadata}
connector.healthCheck()      // {ok, documentCount, errors}
```

**Included connectors:**
- `FilesystemConnector` — reads from a local directory
- `ApiConnector` — simulates a paginated REST API (mock)
- `BaseConnector` — abstract interface for building new connectors

### 2. Document Processor (`src/processor.js`)

Extracts text from multiple formats and assesses quality:
- Plain text, Markdown, JSON extraction
- PDF/DOCX interface stubs (production would use pdf-parse/mammoth)
- Quality scoring: word count, alpha ratio, encoding issues, completeness

### 3. Domain Adaptation (`src/domainAdapter.js`)

The highest-value FDE pattern:
- **Vocabulary extraction** — identifies 25+ legal terms with definitions and categories
- **Few-shot generation** — creates Q&A examples from actual document content
- **System prompt builder** — assembles vocabulary, examples, and guidelines into a domain-specific prompt

### 4. Eval Set Builder (`src/evalBuilder.js`)

Auto-generates candidate Q&A pairs across 5 question types:
- Factual recall (amounts, dates)
- Comprehension (explain a section)
- Analytical (identify risks)
- Extraction (timeframes, deadlines)
- Application (obligations, requirements)

Includes interactive CLI review: accept, edit, reject, or skip each question.

### 5. Pilot Dashboard (`src/dashboard.js` + `public/dashboard.html`)

Real-time dashboard tracking:
- Pilot timeline with days remaining
- Document ingestion stats and quality
- Domain adaptation metrics
- Eval set progress toward 30-question target
- Deployment checklist with pass/fail/warn
- Issue tracker and activity log

### 6. Deployment Checklist (`src/checklist.js`)

Automated readiness verification with 9 checks:
- Data connector health
- Document ingestion count and failure threshold
- Extraction quality score
- Domain vocabulary count
- System prompt generation
- Eval set size
- Eval file export
- Pilot timeline
- Few-shot example count

## Sample Data

10 legal documents in `data/sample-docs/`:
- NDA template, Employment agreement, Commercial lease
- Merger agreement, IP assignment, Privacy policy
- Terms of service, Power of attorney, Settlement agreement
- Compliance memorandum

Plus 5 mock API documents (client intake, deposition, research memo, board resolution, regulatory filing).

