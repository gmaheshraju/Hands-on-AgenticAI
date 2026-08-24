"""Spec — 05-rag-pipeline, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
    "id":      "hoa_rag_pipeline_v1",
    "name":    "05 RAG Pipeline — Architecture",
    "desc":    "Hybrid codebase Q&A in one Node process: a demo that supplies its own corpus, a "
               "chunker feeding two independent indexes, BM25 and vector retrieval fused by RRF, "
               "a re-ranker, and answer generation over two LLM seams that are mock by default. "
               "Every element cites a source line in FACTS.md.",
    "theme":   "hoa-default.json",
    "drawio":  "HOA_RagPipeline_v1.drawio",
    "svg":     "rag-pipeline.svg",
    "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_entry","① Entry (CLI) — node src/demo.js","boundary.datasource",   24, 280, 192, 176),
 ("z_proc", "② 05-rag-pipeline process (Node ESM, zero npm deps)","boundary.primary", 280, 88, 1056, 696),
 ("z_flow", "③ Query path — search() :210 then ask() :261","boundary.functional", 576, 200, 704, 344),
 ("z_ext",  "④ Pluggable seams — MOCK by default","boundary.external", 1400, 216, 224, 296),
 ("z_out",  "⑤ Returned to caller","boundary.observability", 1400, 576, 224, 176),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_demo","component.entry",
  "<b>demo.js</b><br>SAMPLE_CODEBASE :16<br>5 questions :474", 40, 316, 160, 64),
 ("n_pipeline","component.service",
  "<b>RAGPipeline</b><br>owns every stage :104<br>indexFile :145 ask :261", 360, 252, 176, 64),
 ("n_chunker","component.service",
  "<b>chunker.js</b><br>chunkFile :112<br>shouldIndex :209", 360, 412, 176, 64),
 ("n_bm25","component.service",
  "<b>BM25Index</b><br>inverted index :76<br>k1=1.2 b=0.75 :67", 600, 252, 176, 64),
 ("n_vector","component.service",
  "<b>VectorIndex</b><br>sparse cosine :94<br>in-memory :131", 600, 412, 176, 64),
 ("n_fusion","component.service",
  "<b>reciprocalRankFusion</b><br>1/(k + rank) :63<br>rank-based merge :43", 840, 332, 176, 64),
 ("n_rerank","component.agent",
  "<b>Reranker.rerank</b><br>heuristic | llm :157<br>score 0-10 :96", 1080, 332, 176, 64),
 ("n_answer","component.service",
  "<b>Answer generation</b><br>buildAnswerPrompt :25<br>mock fallback :55", 1080, 460, 176, 64),
 ("n_llm","component.external",
  "<b>llmCall(prompt)</b><br>caller-supplied :113<br>default null :123", 1424, 252, 176, 64),
 ("n_embed","component.mock",
  "<b>MockEmbedding</b><br>bag-of-words :36<br>no network call :46", 1424, 412, 176, 64),
 ("n_ret","component.artifact",
  "<b>{answer,sources,debug}</b><br>pipeline.js:288", 1424, 608, 176, 48),
 ("n_console","component.artifact",
  "<b>stdout</b><br>demo.js:489 :490", 1424, 692, 176, 48),

 ("card_funnel","card.invariant",
  "<b>CANDIDATE FUNNEL — every knob, in constructor order</b><br>"
  "1 bm25TopK 20 :117 · 2 vectorTopK 20 :118 — candidates<br>"
  "3 fusionTopK 15 :119 — survive RRF · 5 rrfK 60 :121<br>"
  "4 rerankerTopK 5 :120 — reach the answer prompt<br>"
  "6 llmCall null :123 · 7 rerankerMode 'heuristic' :129<br>"
  "every one is options.X || literal — no config file, no env<br>"
  "20+20 → 15 → 5, applied at :216 :222 :230 :238",
  304, 560, 456, 116),

 ("card_degrade","card.failure",
  "<b>SILENT DEGRADATIONS ON THE QUERY PATH — in call order</b><br>"
  "1 bm25.search: query tokenizes to nothing → [] bm25.js:159<br>"
  "2 cosineSimilarity: either norm 0 → 0 vectorSearch.js:115<br>"
  "3 rerank: no candidates → [] reranker.js:158<br>"
  "4 LLM JSON unparseable → heuristic; console.warn only :190<br>"
  "5 candidate absent from LLM scores → rerankerScore 0 :199<br>"
  "6 no llmCall → mockGenerateAnswer pipeline.js:276<br>"
  "7 zero chunks → fixed 'not found' string :57 — see below",
  792, 560, 456, 116),

 ("card_index","card.primitive",
  "<b>chunker.js shouldIndex() REJECTS — complete, code order</b><br>"
  "1 path part in SKIP_DIRS, n=11 :213 · 2 part starts '.' :214<br>"
  "3 ext in SKIP_EXTENSIONS, n=19 :219 · 4 ext over 6 chars :222<br>"
  "else return true :224 — reject is counted, never logged :147<br>"
  "the ONE throw in the whole project: fusion.js:48 (weights len)",
  304, 692, 456, 76),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_run","n_demo","n_pipeline","6 files · 5 Qs","edge.primary",
  (1,0.5),(0,0.5),[(272,348),(272,284)]),
 ("e_idx","n_pipeline","n_chunker","indexFile :145","edge.primary",
  (0.5,1),(0.5,0),[(448,368)]),
 ("e_qb","n_pipeline","n_bm25","query","edge.primary",
  (1,0.5),(0,0.5),[(568,284)]),
 ("e_qv","n_pipeline","n_vector","query :222","edge.primary",
  (0.75,1),(0,0.25),[(492,316),(492,348),(580,348),(580,428)]),
 ("e_cb","n_chunker","n_bm25","addDocument :168","edge.data_in",
  (1,0.25),(0.25,0),[(556,428),(556,248),(644,248)]),
 ("e_cv","n_chunker","n_vector","chunks","edge.data_in",
  (1,0.75),(0,0.75),[(568,460)]),
 ("e_bf","n_bm25","n_fusion","top-20","edge.primary",
  (1,0.5),(0,0.25),[(808,284),(808,348)]),
 ("e_vf","n_vector","n_fusion","top-20","edge.primary",
  (1,0.5),(0,0.75),[(808,444),(808,380)]),
 ("e_fr","n_fusion","n_rerank","top-15","edge.primary",
  (1,0.5),(0,0.5),[(1048,364)]),
 ("e_ra","n_rerank","n_answer","top-5","edge.primary",
  (0.5,1),(0.5,0),[(1168,428)]),
 ("e_rl","n_rerank","n_llm","mode 'llm' only :162","edge.call",
  (1,0.5),(0,0.25),[(1288,364),(1288,268)]),
 ("e_al","n_answer","n_llm","llmCall(prompt) :272","edge.call",
  (1,0.75),(0,0.75),[(1312,508),(1312,300)]),
 ("e_ve","n_vector","n_embed","embed(text) :166","edge.data_in",
  (0.75,1),(0,0.5),[(732,532),(1384,532),(1384,444)]),
 ("e_ar","n_answer","n_ret","return :288","edge.artifact",
  (1,0.25),(0,0.5),[(1336,476),(1336,632)]),
 ("e_rc","n_ret","n_console","printed :489","edge.artifact",
  (0.5,1),(0.5,0),[(1512,676)]),
]
