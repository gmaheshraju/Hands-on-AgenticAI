import { useState } from 'react';
import { Link } from 'react-router-dom';
import Decision, { Pill } from '../../components/Decision';
import Insight from '../../components/Insight';
import CodeBlock from '../../components/CodeBlock';
import FadeIn from '../../components/FadeIn';

const CHUNKER_CODE = `function recursiveSplit(text, { maxTokens = 512, overlap = 100 } = {}) {
  const separators = ['\\n\\n', '\\n', '. ', ' '];

  function split(text, sepIndex = 0) {
    // Base case: text fits in one chunk
    if (estimateTokens(text) <= maxTokens) return [text.trim()].filter(Boolean);

    // Try splitting by current separator
    const sep = separators[sepIndex];
    if (sepIndex >= separators.length) {
      // Last resort: hard split by character count
      return [text.slice(0, maxTokens * 4), text.slice(maxTokens * 4 - overlap * 4)]
        .flatMap(chunk => split(chunk, 0));
    }

    const parts = text.split(sep);
    const chunks = [];
    let current = '';

    for (const part of parts) {
      const candidate = current ? current + sep + part : part;
      if (estimateTokens(candidate) > maxTokens && current) {
        chunks.push(current.trim());
        // Overlap: start next chunk with tail of current
        const words = current.split(' ');
        current = words.slice(-Math.floor(overlap / 1.5)).join(' ') + sep + part;
      } else {
        current = candidate;
      }
    }
    if (current.trim()) chunks.push(current.trim());

    // If no splits happened, try next separator
    if (chunks.length <= 1) return split(text, sepIndex + 1);
    return chunks;
  }

  return split(text);
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);  // rough estimate: 1 token ≈ 4 chars
}`;

const CHUNKER_OUTPUT = `> const text = fs.readFileSync("product-docs.md", "utf8")
> console.log("Input:", estimateTokens(text), "tokens")
Input: 2847 tokens

> const chunks = recursiveSplit(text, { maxTokens: 512, overlap: 100 })
> console.log("Output:", chunks.length, "chunks")
Output: 7 chunks

> chunks.forEach((c, i) =>
    console.log(\`  chunk \${i+1}: \${estimateTokens(c)} tokens\`))
  chunk 1: 487 tokens  (Introduction + Overview)
  chunk 2: 501 tokens  (Installation Guide)
  chunk 3: 445 tokens  (API Reference - Auth)
  chunk 4: 510 tokens  (API Reference - Users)
  chunk 5: 389 tokens  (API Reference - Orders)
  chunk 6: 312 tokens  (Error Handling)
  chunk 7: 203 tokens  (FAQ)

Split by: paragraph boundaries (separator: "\\\\n\\\\n")
Overlap: ~100 tokens between adjacent chunks`;

const HYBRID_SEARCH_CODE = `async function hybridSearch(query, { topK = 5, retrieveK = 20 } = {}) {
  // Run vector search and keyword search in parallel
  const [vectorResults, bm25Results] = await Promise.all([
    vectorDB.search(await embed(query), { limit: retrieveK }),
    textIndex.search(query, { limit: retrieveK }),  // BM25 via Elasticsearch/pg full-text
  ]);

  // Reciprocal Rank Fusion (RRF) — combine rankings
  // Score = 1/(k + rank). k=60 is standard — dampens top-rank dominance
  const scores = new Map();
  const K = 60;

  vectorResults.forEach((doc, rank) => {
    const id = doc.id;
    scores.set(id, (scores.get(id) || 0) + 1 / (K + rank + 1));
  });

  bm25Results.forEach((doc, rank) => {
    const id = doc.id;
    scores.set(id, (scores.get(id) || 0) + 1 / (K + rank + 1));
  });

  // Sort by fused score, take top candidates
  const candidates = [...scores.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, retrieveK)
    .map(([id]) => id);

  // Rerank with cross-encoder for final precision
  const docs = await Promise.all(candidates.map(id => docStore.get(id)));
  const reranked = await reranker.rank(query, docs);

  return reranked.slice(0, topK);
}

// Full RAG pipeline: retrieve → rerank → generate
async function ragAnswer(query) {
  const context = await hybridSearch(query);
  const answer = await callLLM([
    { role: 'system', content: \`Answer based ONLY on the provided context.
If the context doesn't contain the answer, say so.

Context:
\\\${context.map((doc, i) => \\\`[\\\${i + 1}] \\\${doc.text}\\\`).join('\\n\\n')}\` },
    { role: 'user', content: query },
  ]);
  return { answer: answer.text, sources: context.map(d => d.metadata.source) };
}`;

const HYBRID_SEARCH_OUTPUT = `> await ragAnswer("How do I handle authentication errors?")

[hybridSearch] Running parallel retrieval...
  vector: 20 results (cosine similarity, 84ms)
  bm25:   20 results (keyword match, 12ms)

[RRF fusion] k=60, merging rankings...
  doc-0847: vector rank 1 + bm25 rank 3  → score: 0.0328
  doc-1204: vector rank 4 + bm25 rank 1  → score: 0.0322
  doc-0293: vector rank 2 + bm25 rank 12 → score: 0.0300
  doc-0651: vector rank 8 + bm25 rank 2  → score: 0.0311

[reranker] Cross-encoder scoring 20 candidates → top 5
  1. doc-0847 (score: 0.94) "Error Handling → Auth Errors"
  2. doc-1204 (score: 0.91) "JWT Token Expiration Guide"
  3. doc-0651 (score: 0.87) "OAuth2 Error Codes Reference"

{
  answer: "To handle authentication errors, catch 401 responses
    and refresh the JWT token. If the refresh token is also
    expired, redirect to login. See the Error Handling guide
    for the full error code reference.",
  sources: ["Error Handling", "JWT Guide", "OAuth2 Reference"]
}`;

const TABS = ['Chunking', 'Embeddings', 'Hybrid Search', 'Reranking', 'Production Pitfalls'];

export default function RagDeepDive() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <Link to="/blog" style={styles.back}>&larr; AI Engineering</Link>
      <p style={styles.eyebrow}>Post 05</p>
      <h1 style={styles.h1}>RAG Pipeline Deep Dive</h1>
      <p style={styles.subtitle}>
        The engineering details that make RAG actually work in production — chunking
        strategies, embedding model selection, hybrid search, reranking, and the
        pitfalls that cause silent quality degradation.
      </p>

      <div style={styles.tabWrap}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{ ...styles.tabBtn, ...(tab === i ? styles.tabActive : {}) }}>{t}</button>
        ))}
      </div>

      {tab === 0 && <ChunkingPanel />}
      {tab === 1 && <EmbeddingsPanel />}
      {tab === 2 && <HybridSearchPanel />}
      {tab === 3 && <RerankingPanel />}
      {tab === 4 && <PitfallsPanel />}

      <FadeIn><div style={{ marginTop: 48, padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Capstone Project</p>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-h)', marginBottom: 6 }}>Codebase Q&A with Hybrid RAG</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Build the real thing. Production-grade project brief with architecture requirements, evaluation criteria, and staff+ interview angles.</p>
        <a href="https://github.com/gmaheshraju/Hands-on-AgenticAI/blob/main/projects/05-rag-pipeline.md" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--text-accent)', textDecoration: 'none', fontWeight: 500 }}>View project brief on GitHub →</a>
      </div></FadeIn>
    </div>
  );
}

function SectionHead({ title, desc }) {
  return (
    <>
      <h2 style={styles.sh}>{title}</h2>
      <p style={styles.ss}>{desc}</p>
    </>
  );
}

function ChunkComparisonDiagram() {
  const f = 'var(--font-body)';
  const fm = 'var(--font-mono)';

  return (
    <div style={{ overflowX: 'auto', margin: '20px 0' }}>
      <svg viewBox="0 0 720 310" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', display: 'block' }}>
        <text x="360" y="22" textAnchor="middle" fontSize="14" fontWeight="400" fill="var(--text-h)" fontFamily="var(--font-display)">Chunking Strategies Compared</text>

        {/* Fixed-size */}
        <rect x="20" y="50" width="210" height="240" rx="10" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="125" y="72" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Fixed-size</text>
        <text x="125" y="88" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>split every N tokens</text>

        <rect x="36" y="100" width="178" height="20" rx="3" fill="#3F8624" opacity="0.15" stroke="#3F8624" strokeWidth="0.5" />
        <text x="125" y="114" textAnchor="middle" fontSize="7" fill="var(--text-p)" fontFamily={fm}>chunk 1: 512 tokens</text>
        <rect x="36" y="124" width="178" height="20" rx="3" fill="#3F8624" opacity="0.15" stroke="#3F8624" strokeWidth="0.5" />
        <text x="125" y="138" textAnchor="middle" fontSize="7" fill="var(--text-p)" fontFamily={fm}>chunk 2: 512 tokens</text>
        <rect x="36" y="148" width="178" height="20" rx="3" fill="#ED7100" opacity="0.15" stroke="#ED7100" strokeWidth="0.5" />
        <text x="125" y="162" textAnchor="middle" fontSize="7" fill="var(--text-p)" fontFamily={fm}>↑ splits mid-sentence ↑</text>
        <rect x="36" y="172" width="178" height="20" rx="3" fill="#3F8624" opacity="0.15" stroke="#3F8624" strokeWidth="0.5" />
        <text x="125" y="186" textAnchor="middle" fontSize="7" fill="var(--text-p)" fontFamily={fm}>chunk 3: 512 tokens</text>

        <text x="36" y="220" fontSize="8" fontWeight="600" fill="var(--text-success)" fontFamily={f}>+ Simple, predictable size</text>
        <text x="36" y="235" fontSize="8" fontWeight="600" fill="var(--text-success)" fontFamily={f}>+ Uniform embedding quality</text>
        <text x="36" y="255" fontSize="8" fontWeight="600" fill="var(--text-error)" fontFamily={f}>− Breaks semantic units</text>
        <text x="36" y="270" fontSize="8" fontWeight="600" fill="var(--text-error)" fontFamily={f}>− Lost context at boundaries</text>

        {/* Recursive */}
        <rect x="255" y="50" width="210" height="240" rx="10" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="360" y="72" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Recursive</text>
        <text x="360" y="88" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>paragraph → sentence → char</text>

        <rect x="271" y="100" width="178" height="30" rx="3" fill="#3949AB" opacity="0.15" stroke="#3949AB" strokeWidth="0.5" />
        <text x="360" y="118" textAnchor="middle" fontSize="7" fill="var(--text-p)" fontFamily={fm}>chunk 1: full paragraph (380 tok)</text>
        <rect x="271" y="134" width="178" height="22" rx="3" fill="#3949AB" opacity="0.15" stroke="#3949AB" strokeWidth="0.5" />
        <text x="360" y="148" textAnchor="middle" fontSize="7" fill="var(--text-p)" fontFamily={fm}>chunk 2: paragraph (510 tok)</text>
        <rect x="271" y="160" width="178" height="28" rx="3" fill="#3949AB" opacity="0.15" stroke="#3949AB" strokeWidth="0.5" />
        <text x="360" y="178" textAnchor="middle" fontSize="7" fill="var(--text-p)" fontFamily={fm}>chunk 3: paragraph (440 tok)</text>

        <text x="271" y="220" fontSize="8" fontWeight="600" fill="var(--text-success)" fontFamily={f}>+ Respects natural boundaries</text>
        <text x="271" y="235" fontSize="8" fontWeight="600" fill="var(--text-success)" fontFamily={f}>+ Best general-purpose choice</text>
        <text x="271" y="255" fontSize="8" fontWeight="600" fill="var(--text-error)" fontFamily={f}>− Variable chunk sizes</text>
        <text x="271" y="270" fontSize="8" fontWeight="600" fill="var(--text-error)" fontFamily={f}>− Long paragraphs still split</text>

        {/* Semantic */}
        <rect x="490" y="50" width="210" height="240" rx="10" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.8" />
        <text x="595" y="72" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-h)" fontFamily={f}>Semantic</text>
        <text x="595" y="88" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily={fm}>embedding-based topic detection</text>

        <rect x="506" y="100" width="178" height="26" rx="3" fill="#C925D1" opacity="0.15" stroke="#C925D1" strokeWidth="0.5" />
        <text x="595" y="116" textAnchor="middle" fontSize="7" fill="var(--text-p)" fontFamily={fm}>chunk 1: topic A (290 tok)</text>
        <rect x="506" y="130" width="178" height="34" rx="3" fill="#E7157B" opacity="0.15" stroke="#E7157B" strokeWidth="0.5" />
        <text x="595" y="150" textAnchor="middle" fontSize="7" fill="var(--text-p)" fontFamily={fm}>chunk 2: topic B (680 tok)</text>
        <rect x="506" y="168" width="178" height="22" rx="3" fill="#8C4FFF" opacity="0.15" stroke="#8C4FFF" strokeWidth="0.5" />
        <text x="595" y="182" textAnchor="middle" fontSize="7" fill="var(--text-p)" fontFamily={fm}>chunk 3: topic C (200 tok)</text>

        <text x="506" y="220" fontSize="8" fontWeight="600" fill="var(--text-success)" fontFamily={f}>+ Best retrieval quality</text>
        <text x="506" y="235" fontSize="8" fontWeight="600" fill="var(--text-success)" fontFamily={f}>+ Topic-coherent chunks</text>
        <text x="506" y="255" fontSize="8" fontWeight="600" fill="var(--text-error)" fontFamily={f}>− 2-3x slower to ingest</text>
        <text x="506" y="270" fontSize="8" fontWeight="600" fill="var(--text-error)" fontFamily={f}>− Highly variable sizes</text>
      </svg>
    </div>
  );
}

function ChunkingPanel() {
  return (
    <div>
      <SectionHead
        title="Chunking — the foundation of RAG quality"
        desc={<>Chunking determines what units of information your RAG pipeline can retrieve. Mahesh's Top 8 advice #1: <strong>"Smart defaults over infinite customization."</strong> Don't offer 15 chunking options — pick recursive splitting at 512 tokens as the default and validate it works. Get it wrong and even perfect search returns garbage.</>}
      />

      <ChunkComparisonDiagram />

      <FadeIn><CodeBlock filename="recursive-splitter.js" code={CHUNKER_CODE} output={CHUNKER_OUTPUT} /></FadeIn>

      <FadeIn><Decision question="Which chunking strategy should you use?">
        <Pill type="green">Recursive character splitting (default)</Pill> Split by paragraph → sentence → character, trying to respect natural text boundaries. Set a target of 512-1024 tokens with 20% overlap. Works for 80% of use cases.
        <br /><br />
        <Pill type="amber">Semantic chunking</Pill> Use embeddings to detect where topics change, then split at topic boundaries. Better retrieval quality but 2-3x slower ingestion. Use when documents mix multiple topics and recursive splitting produces incoherent chunks.
        <br /><br />
        <Pill type="amber">Document-aware splitting</Pill> Use document structure (headers, sections, code blocks) to split. Best for structured documents like API docs, legal contracts, or technical manuals where the formatting carries semantic meaning.
        <br /><br />
        <strong>Start with recursive. Measure retrieval quality. Switch to semantic only if retrieval quality is provably poor.</strong>
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Chunk size — the critical parameter">
        <strong>Small chunks (256-512 tokens):</strong>
        <br />
        + More precise retrieval — each chunk is one focused idea
        <br />
        + Better for Q&A where the answer is a single fact
        <br />
        − May lack context — "the protein" without knowing which protein
        <br /><br />
        <strong>Large chunks (1024-2048 tokens):</strong>
        <br />
        + More context per chunk — the LLM gets the full picture
        <br />
        + Better for summarization or complex explanations
        <br />
        − Includes irrelevant content that dilutes relevance
        <br /><br />
        <strong>The sweet spot:</strong> 512-1024 tokens for most use cases. Smaller for factual Q&A, larger for analysis tasks. Test both with your actual queries and measure answer quality.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Overlap — preventing information loss at boundaries">
        Without overlap, information that spans two chunks is split and neither chunk is retrievable for queries about that information.
        <br /><br />
        <strong>Recommended:</strong> 10-20% overlap. A 512-token chunk overlaps by 50-100 tokens with the next chunk.
        <br /><br />
        <strong>Tradeoff:</strong> Overlap increases storage by 10-20% and can cause duplicate search results (both chunks contain the overlapping content). Deduplicate by checking if retrieved chunks are from adjacent positions in the same document.
      </Decision></FadeIn>

      <FadeIn><Insight>
        "Mahesh's advice #1: 'Smart defaults over infinite customization.' Chunking is the perfect example — don't build a settings panel with 15 chunking strategies. Pick recursive splitting at 512 tokens with 20% overlap as the default. Then validate by manually checking 50 retrievals. The staff+ answer in interviews starts with: 'The first question is how we chunk. If the answer spans two chunks, no amount of search quality saves us.' Then describe your validation process — that's what separates builders from readers."
      </Insight></FadeIn>
    </div>
  );
}

function EmbeddingsPanel() {
  return (
    <div>
      <SectionHead
        title="Embedding models — choosing and using"
        desc="Embeddings convert text to vectors for similarity search. The model choice affects retrieval quality, cost, latency, and storage. It's also the hardest thing to change later — migrating embeddings means re-embedding your entire corpus."
      />

      <FadeIn><Decision question="Which embedding model?">
        <Pill type="green">text-embedding-3-large (OpenAI)</Pill> 3072 dimensions. Best quality for English. $0.13 per million tokens. The default choice unless you have specific constraints.
        <br /><br />
        <Pill type="green">Cohere embed-v3</Pill> 1024 dimensions. Competitive quality, better multilingual support. Search-optimized variant available. Good alternative to OpenAI.
        <br /><br />
        <Pill type="amber">BGE-large (open-source)</Pill> 1024 dimensions. Run locally — no API costs. 3-5% lower quality than commercial models. Best for privacy-sensitive use cases or cost-constrained deployments.
        <br /><br />
        <Pill type="red">text-embedding-ada-002 (legacy)</Pill> Don't use. text-embedding-3 is strictly better at the same price.
        <br /><br />
        <strong>Critical rule:</strong> Use the SAME model for indexing and querying. Mixing models (embed with OpenAI, query with Cohere) produces garbage results — the vector spaces don't align.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Dimensions — bigger isn't always better">
        Higher dimensions capture more nuance but cost more to store and search:
        <br /><br />
        <strong>3072d (text-embedding-3-large):</strong> Best quality. 12KB per vector. At 1M chunks, that's 12GB of vectors.
        <br /><br />
        <strong>1536d (text-embedding-3-small or Matryoshka truncation):</strong> 95% of the quality at 50% of the storage. 6GB for 1M chunks.
        <br /><br />
        <strong>256d (Matryoshka at 256):</strong> 85% of the quality. 1GB for 1M chunks. Good for prototyping or cost-constrained deployments.
        <br /><br />
        <strong>Matryoshka embeddings</strong> (supported by text-embedding-3) let you truncate the vector to any dimension. Embed at full 3072d, store at 1536d or 256d. Trade quality for cost dynamically.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Embedding pipeline — batch vs real-time">
        <strong>Ingestion (offline):</strong> Batch embed all documents. Use the async/batch API for 50% cost savings. Process in parallel — 1000 documents can be embedded in minutes.
        <br /><br />
        <strong>Query (real-time):</strong> Embed the user's query synchronously. Must be fast — target under 20ms. Cache frequently asked queries.
        <br /><br />
        <strong>Updates:</strong> When a document changes, re-embed only that document's chunks. Don't re-embed the entire corpus.
        <br /><br />
        <strong>Versioning:</strong> When you switch embedding models, you must re-embed everything. Plan for this — keep the original text stored alongside the vectors so you can re-embed without re-ingesting from source.
      </Decision></FadeIn>

      <FadeIn><Insight>
        "The interview trap is fixating on the embedding model choice. Mahesh's advice #3 applies here: go vertical-first. Don't build a 'universal RAG platform' — build one that works perfectly for your specific document type. An e-Commerce product catalog needs different chunking, metadata, and retrieval strategies than a legal document corpus. The real engineering challenge is the pipeline: batch ingestion, incremental updates, model versioning. Mention the migration cost explicitly — 'choosing an embedding model is a one-way door because migration means re-embedding our entire corpus' — and the interviewer knows you've done this for real."
      </Insight></FadeIn>
    </div>
  );
}

function HybridSearchPanel() {
  return (
    <div>
      <SectionHead
        title="Hybrid search — vector + keyword"
        desc="Vector search alone misses exact matches. Keyword search alone misses semantic meaning. Hybrid search combines both — and it's the standard for production RAG."
      />

      <FadeIn><CodeBlock filename="hybrid-search.js" code={HYBRID_SEARCH_CODE} output={HYBRID_SEARCH_OUTPUT} /></FadeIn>

      <FadeIn><Decision question="Why not just vector search?">
        Vector search finds semantically similar content — great for "how do I handle authentication?" → retrieves docs about auth flows even if they don't contain the word "authentication."
        <br /><br />
        <strong>But it fails on:</strong>
        <br />
        — Exact terms: error code "E_AUTH_TIMEOUT" → vector search returns generic timeout docs
        <br />
        — Proper nouns: "What did Jane say in the Q3 report?" → vector search finds any Q3 content
        <br />
        — Acronyms and jargon: "RBAC permissions" → might retrieve docs about "access control" but miss the RBAC-specific docs
        <br /><br />
        These are exactly the queries where users are most frustrated when the agent gets them wrong.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="BM25 — the keyword search component">
        BM25 is the standard keyword ranking algorithm (used by Elasticsearch, Lucene). It scores documents by term frequency and inverse document frequency.
        <br /><br />
        <strong>Strengths:</strong> Exact matches, rare terms (IDs, error codes, names), boolean-style queries.
        <br /><br />
        <strong>Weaknesses:</strong> No semantic understanding. "car" doesn't match "automobile." Sensitive to phrasing.
        <br /><br />
        <strong>Implementation:</strong> Most vector databases now support BM25 natively (Pinecone, Weaviate, Qdrant). For pgvector, use PostgreSQL's full-text search alongside vector similarity.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="How to combine vector + BM25 scores?">
        <Pill type="green">Reciprocal Rank Fusion (RRF)</Pill> Score = 1/(k + rank_vector) + 1/(k + rank_bm25), where k=60 is standard. Rank-based, so it's invariant to score scale differences between the two systems. The default choice.
        <br /><br />
        <Pill type="amber">Weighted linear combination</Pill> Score = α × vector_score + (1-α) × bm25_score. Requires normalizing both scores to the same range. α=0.7 (vector-heavy) is a common starting point.
        <br /><br />
        <Pill type="amber">Conditional routing</Pill> If the query contains quoted strings, IDs, or error codes → use BM25 only. Otherwise → use hybrid. Simpler, works well for support/docs use cases.
        <br /><br />
        <strong>RRF is the safest default.</strong> It doesn't require tuning weights and handles score scale differences automatically.
      </Decision></FadeIn>

      <FadeIn><Insight>
        "Hybrid search is the answer to 'but what about exact matches?' Mahesh covers this in his Agent System Design video under the RAG + Vector DB chapter — vector search alone misses exact terms like product SKUs, error codes, and customer IDs. His e-Commerce example: a customer asks about order #ORD-28491 — vector search returns general order FAQ, but BM25 catches the exact order ID. Every production RAG system uses hybrid. The RRF formula is the specific signal: 'I'd combine results using reciprocal rank fusion with k=60 — it's rank-based so I don't need to normalize scores.'"
      </Insight></FadeIn>
    </div>
  );
}

function RerankingPanel() {
  return (
    <div>
      <SectionHead
        title="Reranking — the quality multiplier"
        desc="Retrieval gets you candidates. Reranking sorts them by actual relevance to the query. It's the single biggest improvement you can make to RAG quality — 15-30% better answers with one additional step."
      />

      <FadeIn><Decision question="How does reranking work?">
        <strong>Step 1:</strong> Retrieve top-20 candidates via hybrid search (fast, approximate).
        <br />
        <strong>Step 2:</strong> Pass each candidate + the query through a cross-encoder model that scores relevance (slow, precise).
        <br />
        <strong>Step 3:</strong> Sort by cross-encoder score. Take top-5.
        <br /><br />
        The cross-encoder sees the query and the document together — it can understand the relationship between them, not just the independent similarity. This is why it's more accurate than embedding-based similarity, which embeds query and document independently.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Which reranker?">
        <Pill type="green">Cohere Rerank</Pill> API-based. Best quality among commercial options. $1 per 1000 queries. Supports 100+ languages. The default choice for production.
        <br /><br />
        <Pill type="green">BGE Reranker (open-source)</Pill> Run locally. Competitive quality. No API costs. Requires GPU for acceptable latency (~50ms per query on GPU, ~500ms on CPU).
        <br /><br />
        <Pill type="amber">LLM-as-reranker</Pill> Use Claude/GPT-4 to score relevance. Best quality but 10-100x more expensive per query. Only worth it for high-value queries (legal, medical, financial).
        <br /><br />
        <strong>For most production systems:</strong> Cohere Rerank. The cost is negligible compared to the LLM call that follows, and the quality improvement is significant.
      </Decision></FadeIn>

      <FadeIn delay={160}><Decision question="Reranking latency budget">
        Reranking adds 50-150ms to the retrieval pipeline. This matters for real-time agents:
        <br /><br />
        <strong>Full pipeline latency:</strong>
        <br />
        — Embed query: 15-25ms
        <br />
        — Hybrid search: 30-60ms
        <br />
        — Rerank 20 → 5: 50-150ms
        <br />
        — Total retrieval: 100-250ms
        <br />
        — LLM generation: 1000-5000ms
        <br /><br />
        <strong>Retrieval is &lt;5% of total latency.</strong> The reranking cost (50-150ms) is invisible next to the LLM call (1-5 seconds). The quality gain is 15-30%. It's almost always worth it.
      </Decision></FadeIn>

      <FadeIn delay={240}><Decision question="When to skip reranking">
        (1) Extremely latency-sensitive applications (&lt;200ms total target — but then you probably can't afford an LLM call either).
        <br /><br />
        (2) Homogeneous corpus where all chunks are similarly relevant (rare — if this is true, you probably don't need RAG at all).
        <br /><br />
        (3) Very small corpus (&lt;100 chunks). Vector search is accurate enough when the search space is tiny.
        <br /><br />
        <strong>For everything else: always rerank.</strong> It's the highest ROI improvement in the RAG pipeline.
      </Decision></FadeIn>

      <FadeIn><Insight>
        "Reranking is the answer to 'how would you improve retrieval quality?' in the interview. Retrieve 20 with hybrid search, rerank to 5 with a cross-encoder. The 15-30% improvement costs 50-150ms and pennies per query. Knowing this pattern — and the specific latency numbers — signals that you've tuned a production RAG pipeline, not just read about one."
      </Insight></FadeIn>
    </div>
  );
}

function PitfallsPanel() {
  return (
    <div>
      <SectionHead
        title="Production RAG pitfalls"
        desc="The failure modes that don't show up in tutorials but destroy RAG quality in production. These are the issues that take days to debug because everything 'looks like it's working.'"
      />

      <div style={styles.anti}>
        <p style={styles.strike}>"Our RAG works great in testing but answers are wrong in production."</p>
        <p style={styles.better}><span style={{...styles.dot, background: 'var(--text-success)'}} /><strong>Stale embeddings.</strong> You updated the source documents but didn't re-embed the chunks. The vector store has the old version. Solution: track document version hashes. On update, re-embed changed chunks only. Alert if any source doc is newer than its latest embedding.</p>
      </div>

      <div style={styles.anti}>
        <p style={styles.strike}>"The retriever returns relevant documents but the LLM ignores them."</p>
        <p style={styles.better}><span style={{...styles.dot, background: 'var(--text-success)'}} /><strong>Lost in the middle.</strong> The relevant chunk is buried in position 8 of 15. The LLM barely reads positions 4-12. Solution: limit to top-5 chunks. If you need more context, summarize the chunks before injecting them. Quality beats quantity.</p>
      </div>

      <div style={styles.anti}>
        <p style={styles.strike}>"The retriever returns the right document but the wrong section."</p>
        <p style={styles.better}><span style={{...styles.dot, background: 'var(--text-success)'}} /><strong>Chunk too large.</strong> A 2000-token chunk from a 10-page document matches the query because of one relevant sentence. The other 1900 tokens are noise. Solution: smaller chunks (512 tokens) with overlap. Or hierarchical indexing: embed both the full document and individual paragraphs.</p>
      </div>

      <div style={styles.anti}>
        <p style={styles.strike}>"Retrieval works for some queries but fails for domain-specific terms."</p>
        <p style={styles.better}><span style={{...styles.dot, background: 'var(--text-success)'}} /><strong>Embedding model doesn't know your jargon.</strong> General embedding models struggle with domain-specific terms (medical codes, financial instruments, internal acronyms). Solution: hybrid search (BM25 catches exact terms). Or fine-tune an embedding model on your domain data — this is one case where fine-tuning the embedder (not the LLM) pays off.</p>
      </div>

      <div style={styles.anti}>
        <p style={styles.strike}>"We can't tell if RAG is helping or hurting the answers."</p>
        <p style={styles.better}><span style={{...styles.dot, background: 'var(--text-success)'}} /><strong>No retrieval evaluation.</strong> You need metrics: precision@k (are the retrieved chunks relevant?), recall@k (did we miss relevant chunks?), answer correctness (does the final answer match the expected answer?). Without these, you're flying blind — a broken retriever looks identical to a working one from the outside.</p>
      </div>

      <FadeIn><Decision question="The RAG evaluation framework">
        <strong>Three metrics, in order of importance:</strong>
        <br /><br />
        <strong>1. Context relevance</strong> — Are the retrieved chunks actually relevant to the query? Measure: have an LLM judge rate each chunk's relevance (1-5). Target: top-5 chunks average {'>'} 3.5.
        <br /><br />
        <strong>2. Groundedness</strong> — Does the answer only contain information from the retrieved context? Measure: check if each claim in the answer can be traced to a specific chunk. Target: {'>'} 90% of claims are grounded.
        <br /><br />
        <strong>3. Answer correctness</strong> — Is the answer factually correct? Measure: compare against golden answers for a test set of 50-100 queries. Target: {'>'} 85% correctness.
        <br /><br />
        Run this evaluation on every change to chunking strategy, embedding model, search parameters, or prompt template. This is your RAG CI/CD.
      </Decision></FadeIn>

      <FadeIn delay={80}><Decision question="Mahesh's vertical-first rule for RAG">
        Mahesh's Top 8 advice #3: go vertical-first. Don't build a "universal RAG platform" — build one that works perfectly for one domain.
        <br /><br />
        <strong>Why it matters for RAG:</strong>
        <br />
        — An e-Commerce product catalog needs: structured metadata (price, category, size), short chunks (one product per chunk), BM25-heavy hybrid search (exact SKUs and product names).
        <br />
        — A legal document corpus needs: large chunks (preserve clause context), semantic chunking (respect section boundaries), citation-aware retrieval (link back to exact paragraphs).
        <br />
        — A codebase needs: AST-aware chunking (functions and classes as natural units), language-specific tokenization, hybrid search heavy on keyword (function names, variable names).
        <br /><br />
        <strong>The trap:</strong> Building a RAG pipeline that "handles any document type" before you've proven it works for ONE type. Start vertical. Nail the quality. Then generalize by extracting the configurable parts — chunking strategy, metadata schema, retrieval weights.
        <br /><br />
        This is advice #4 too: "Examples must be carefully balanced." Your golden test set should represent the specific domain, not generic Q&A. 50 domain-specific test cases beat 500 generic ones.
      </Decision></FadeIn>

      <FadeIn><Insight>
        "Mahesh's Top 8 advice #8: 'Add continuous evals.' The production pitfalls are invisible without them — stale embeddings, lost-in-the-middle, domain vocabulary gaps all look like 'the agent works' from the outside. You need precision@k, groundedness, and answer correctness running on every change. Mahesh's rule: 'Evals + Memory are the moats of AI products.' The eval pipeline IS the product quality. Without it, you're flying blind — and in an interview, describing these failure modes with specific metrics shifts you from 'has read about RAG' to 'has operated a RAG pipeline at scale.'"
      </Insight></FadeIn>
        </div>
  );
}

const styles = {
  back: { fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-block', marginBottom: 16, fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' },
  eyebrow: { fontSize: 11, fontWeight: 500, color: 'var(--text-accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontFamily: 'var(--font-mono)' },
  h1: { fontSize: 34, fontWeight: 400, color: 'var(--text-h)', marginBottom: 10, lineHeight: 1.15, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 14, color: 'var(--text-p)', marginBottom: 8, lineHeight: 1.75 },
  source: { fontSize: 12, color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.6 },
  sourceLink: { color: 'var(--text-accent)', textDecoration: 'underline', textUnderlineOffset: '2px' },
  tabWrap: { display: 'flex', gap: 0, marginBottom: '2rem', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', overflowX: 'auto', scrollbarWidth: 'none' },
  tabBtn: { background: 'transparent', borderTopWidth: 0, borderRightWidth: 0, borderLeftWidth: 0, borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: 'transparent', padding: '10px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', cursor: 'pointer', transition: 'all var(--dur) var(--ease)', fontFamily: 'inherit', whiteSpace: 'nowrap', letterSpacing: '-0.01em' },
  tabActive: { color: 'var(--text-h)', fontWeight: 600, borderBottomColor: 'var(--bg-accent-strong)' },
  sh: { fontSize: 17, fontWeight: 600, color: 'var(--text-h)', marginBottom: 8, letterSpacing: '-0.01em' },
  ss: { fontSize: 13, color: 'var(--text-p)', marginBottom: 16, lineHeight: 1.7 },
  anti: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 18px', marginBottom: 10 },
  strike: { textDecoration: 'line-through', opacity: 0.5, fontSize: 13, color: 'var(--text-p)', lineHeight: 1.6 },
  better: { fontSize: 13, color: 'var(--text-h)', fontWeight: 500, lineHeight: 1.6, marginTop: 6 },
  dot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 8, verticalAlign: 'middle' },
};
