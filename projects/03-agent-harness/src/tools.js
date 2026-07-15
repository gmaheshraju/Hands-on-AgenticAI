/**
 * Tool Implementations (mock data)
 *
 * Each tool returns { result, tokensIn, tokensOut } so the harness can
 * track cost.  In production you would swap these for real API calls to
 * Tavily / SerpAPI / Brave Search, a URL fetcher with Readability, etc.
 */

// ── Simulated latency helper ────────────────────────────────────────────

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Mock search corpus ──────────────────────────────────────────────────

const MOCK_SEARCH_RESULTS = {
  // Vector database comparisons
  'pinecone pricing': [
    { title: 'Pinecone Pricing 2024', url: 'https://pinecone.io/pricing', snippet: 'Pinecone offers a free tier (100K vectors), Starter at $70/mo, and Enterprise pricing. Serverless pods start at $0.096/hr.' },
    { title: 'Pinecone vs Self-Hosted Cost Analysis', url: 'https://blog.example.com/pinecone-cost', snippet: 'At 10M vectors, Pinecone costs approximately $800-1200/mo depending on pod type and replicas.' },
  ],
  'weaviate pricing': [
    { title: 'Weaviate Cloud Pricing', url: 'https://weaviate.io/pricing', snippet: 'Weaviate Cloud: Sandbox (free), Standard ($25/mo base), Enterprise (custom). Self-hosted is free and open-source (BSD-3).' },
    { title: 'Weaviate at Scale', url: 'https://blog.example.com/weaviate-scale', snippet: 'Running Weaviate self-hosted on 3 nodes for 10M vectors: ~$450/mo on AWS (r6g.xlarge instances).' },
  ],
  'qdrant pricing': [
    { title: 'Qdrant Cloud Pricing', url: 'https://qdrant.tech/pricing', snippet: 'Qdrant Cloud starts at $25/mo for 1M vectors. Free tier available. Open-source (Apache 2.0) for self-hosting.' },
    { title: 'Qdrant Performance Benchmarks', url: 'https://blog.example.com/qdrant-bench', snippet: 'Qdrant handles 10M vectors with p99 latency under 10ms on a single node with 32GB RAM.' },
  ],
  'pinecone vs weaviate vs qdrant': [
    { title: 'Vector Database Comparison 2024', url: 'https://blog.example.com/vdb-compare', snippet: 'Pinecone: fully managed, easiest setup. Weaviate: hybrid search + modules. Qdrant: fastest pure vector search, Rust-based.' },
    { title: 'Choosing a Vector DB for RAG', url: 'https://blog.example.com/rag-vdb', snippet: 'For RAG at scale: Pinecone for zero-ops, Weaviate for multimodal, Qdrant for performance-critical workloads.' },
  ],
  'vector database performance 10M documents': [
    { title: 'Benchmarking Vector DBs at Scale', url: 'https://ann-benchmarks.com/results', snippet: 'At 10M vectors (768-dim): Qdrant 8ms p99, Weaviate 15ms p99, Pinecone 12ms p99 (serverless pods).' },
    { title: 'Scaling Vector Search Beyond 1M', url: 'https://blog.example.com/scale-vectors', snippet: 'Key factors at 10M+: index type (HNSW vs IVF), memory requirements (~30GB for 10M 768-dim), and sharding strategy.' },
  ],
  'pinecone production RAG': [
    { title: 'Pinecone for Production RAG', url: 'https://docs.pinecone.io/guides/rag', snippet: 'Pinecone supports metadata filtering, namespaces for multi-tenancy, and hybrid search with sparse-dense vectors.' },
  ],
  'weaviate production RAG': [
    { title: 'Weaviate RAG Guide', url: 'https://weaviate.io/developers/weaviate/starter-guides/rag', snippet: 'Weaviate has built-in generative search modules, supports BM25 + vector hybrid, and offers multi-tenancy natively.' },
  ],
  'qdrant production RAG': [
    { title: 'Qdrant for RAG Pipelines', url: 'https://qdrant.tech/documentation/guides/rag', snippet: 'Qdrant supports payload filtering, quantization for memory savings (4x reduction), and built-in replication.' },
  ],

  // Generic fallback
  'default': [
    { title: 'General AI Research', url: 'https://example.com/ai-research', snippet: 'Various AI topics and research findings.' },
  ],
};

const MOCK_PAGES = {
  'https://blog.example.com/vdb-compare': `
# Vector Database Comparison 2024

## Pinecone
- **Type:** Fully managed SaaS
- **License:** Proprietary
- **Language:** Python/Go backend
- **Key Feature:** Zero-ops, serverless pods
- **Indexing:** Proprietary (based on Faiss)
- **Max Scale:** Billions of vectors (with pods)
- **Hybrid Search:** Yes (sparse-dense)
- **Multi-tenancy:** Via namespaces

## Weaviate
- **Type:** Open-source + managed cloud
- **License:** BSD-3-Clause
- **Language:** Go
- **Key Feature:** Module system (vectorizers, generative, readers)
- **Indexing:** HNSW with flat fallback
- **Max Scale:** Tested to 100M+ vectors
- **Hybrid Search:** Yes (BM25 + vector)
- **Multi-tenancy:** Native support

## Qdrant
- **Type:** Open-source + managed cloud
- **License:** Apache 2.0
- **Language:** Rust
- **Key Feature:** Fastest pure vector search, quantization
- **Indexing:** Custom HNSW (modified for filtering)
- **Max Scale:** Tested to 100M+ vectors
- **Hybrid Search:** Via sparse vectors (v1.7+)
- **Multi-tenancy:** Via collection separation

## Performance at 10M vectors (768 dimensions)
| Database | p99 Latency | QPS    | Memory Usage |
|----------|-------------|--------|--------------|
| Pinecone | 12ms        | 1,500  | Managed      |
| Weaviate | 15ms        | 1,200  | ~35GB        |
| Qdrant   | 8ms         | 2,100  | ~28GB (with quantization: ~7GB) |
`,
  'https://blog.example.com/rag-vdb': `
# Choosing a Vector DB for RAG at Scale

## Decision Framework

### When to choose Pinecone
- You want zero operational overhead
- Your team is small and doesn't want to manage infrastructure
- You need enterprise compliance (SOC2, HIPAA)
- Budget is not the primary concern

### When to choose Weaviate
- You need multimodal search (images, text, etc.)
- You want built-in ML model integration
- You prefer open-source with managed option
- You need advanced hybrid search (BM25 + vector)

### When to choose Qdrant
- Performance is critical (lowest latency)
- You need memory-efficient storage (quantization)
- You want the most permissive license (Apache 2.0)
- You're building on Rust or need Rust-native integration

## Cost Comparison at 10M Documents
| Provider        | Managed       | Self-Hosted  |
|-----------------|---------------|--------------|
| Pinecone        | $800-1200/mo  | N/A          |
| Weaviate Cloud  | $400-700/mo   | ~$450/mo     |
| Qdrant Cloud    | $300-500/mo   | ~$350/mo     |

## RAG-Specific Features
- **Metadata filtering:** All three support it. Qdrant's payload indexes are fastest for complex filters.
- **Batch upsert:** Pinecone 100/batch, Weaviate 10K/batch, Qdrant 100K/batch
- **Real-time updates:** All three support it, but Weaviate and Qdrant handle concurrent reads/writes better.
`,
};

// ── Tool implementations ────────────────────────────────────────────────

/**
 * webSearch — simulates a web search API call.
 * Returns 2-4 results with titles, URLs, and snippets.
 */
export async function webSearch({ query }) {
  await delay(50 + Math.random() * 100); // simulate network

  const q = query.toLowerCase();
  let results = MOCK_SEARCH_RESULTS['default'];

  // Find best matching key
  for (const [key, value] of Object.entries(MOCK_SEARCH_RESULTS)) {
    if (key === 'default') continue;
    const keyWords = key.split(' ');
    const matchCount = keyWords.filter((w) => q.includes(w)).length;
    if (matchCount >= keyWords.length * 0.6) {
      results = value;
      break;
    }
  }

  const tokensIn = 30 + query.length;
  const tokensOut = results.length * 60;
  return { result: results, tokensIn, tokensOut };
}

/**
 * readPage — simulates fetching and extracting text from a URL.
 * Returns the cleaned text content of the page.
 */
export async function readPage({ url }) {
  await delay(80 + Math.random() * 120); // simulate fetch

  const content = MOCK_PAGES[url]
    ?? `# Content from ${url}\n\nThis page contains information related to the topic. Key points include general comparisons and standard features available in the product.`;

  const tokensIn = 20;
  const tokensOut = Math.ceil(content.length / 4);
  return { result: content, tokensIn, tokensOut };
}

/**
 * noteFindings — the agent records structured facts into the report.
 * Returns the count of new facts added.
 *
 * @param {object} input
 * @param {string} input.section    — report section (e.g. "Pricing")
 * @param {string[]} input.facts    — array of fact strings
 * @param {string[]} input.sources  — source URLs for these facts
 * @param {object} report           — the live report object (mutated in place)
 */
export async function noteFindings({ section, facts, sources }, report) {
  await delay(10);

  if (!report.sections[section]) {
    report.sections[section] = { facts: [], sources: new Set() };
  }

  const sec = report.sections[section];
  let newCount = 0;

  for (const fact of facts) {
    // Deduplicate: only add if this exact fact isn't already recorded
    if (!sec.facts.includes(fact)) {
      sec.facts.push(fact);
      newCount++;
    }
  }

  for (const src of sources) {
    sec.sources.add(src);
  }

  const tokensIn = 15 + facts.join(' ').length / 4;
  const tokensOut = 10;
  return { result: { newFactsAdded: newCount, totalFacts: sec.facts.length }, tokensIn, tokensOut };
}

/**
 * synthesize — produces the final markdown report from accumulated findings.
 */
export async function synthesize(_input, report) {
  await delay(30);

  let md = `# Research Report\n\n`;
  md += `> Generated at ${new Date().toISOString()}\n\n`;
  md += `## Question\n\n${report.question}\n\n`;

  // Table of contents
  const sectionNames = Object.keys(report.sections);
  if (sectionNames.length > 0) {
    md += `## Table of Contents\n\n`;
    for (const name of sectionNames) {
      md += `- [${name}](#${name.toLowerCase().replace(/\s+/g, '-')})\n`;
    }
    md += '\n';
  }

  // Each section
  for (const [name, sec] of Object.entries(report.sections)) {
    md += `## ${name}\n\n`;
    for (const fact of sec.facts) {
      md += `- ${fact}\n`;
    }
    if (sec.sources.size > 0) {
      md += `\n**Sources:**\n`;
      for (const src of sec.sources) {
        md += `- ${src}\n`;
      }
    }
    md += '\n';
  }

  // Summary
  md += `## Summary\n\n`;
  const totalFacts = Object.values(report.sections).reduce((n, s) => n + s.facts.length, 0);
  md += `This report covers ${sectionNames.length} sections with ${totalFacts} total findings across ${getAllSources(report).size} unique sources.\n`;

  const tokensIn = totalFacts * 20;
  const tokensOut = Math.ceil(md.length / 4);
  return { result: md, tokensIn, tokensOut };
}

// ── Tool registry (for the harness) ─────────────────────────────────────

export const TOOL_REGISTRY = {
  webSearch: {
    fn: webSearch,
    description: 'Search the web for information on a topic',
    params: ['query'],
  },
  readPage: {
    fn: readPage,
    description: 'Fetch and extract text content from a URL',
    params: ['url'],
  },
  noteFindings: {
    fn: noteFindings,
    description: 'Record structured facts into the research report',
    params: ['section', 'facts', 'sources'],
    needsReport: true,
  },
  synthesize: {
    fn: synthesize,
    description: 'Generate the final markdown report from accumulated findings',
    params: [],
    needsReport: true,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────

function getAllSources(report) {
  const all = new Set();
  for (const sec of Object.values(report.sections)) {
    for (const src of sec.sources) all.add(src);
  }
  return all;
}
