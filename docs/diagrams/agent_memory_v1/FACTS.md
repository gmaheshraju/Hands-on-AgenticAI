# FACTS — 02-agent-memory (L1 — space, extracted 2026-08-24)

Source of truth: `projects/02-agent-memory/`. **Every element in the diagram appears below with a `file:line` citation. The diagram may contain nothing that is not on this page, and this page may contain nothing without a citation.** Any README ASCII diagram in the project was treated as a CLAIM, not as evidence.

**Generated** from the structured extraction, not transcribed. All citations machine-verified by `_harness/verify_facts.py` against the source tree.

## What this project is

A Node.js CLI agent (CRMAgent) that logs every conversational turn as an episodic SQLite row, periodically consolidates unconsolidated episodes into subject-predicate-object semantic facts (via a pluggable real-LLM-or-mock extractor, with contradiction/decay/compression hygiene), and answers person/topic queries through a hybrid FTS+direct-lookup retrieval engine — all state persisted in one on-disk SQLite file so memory survives across process restarts.

## Altitude

L1 here is: the two process entry points (cli.js, demo.js), the CRMAgent orchestrator they both drive, the three engines it calls out to (MemoryStore, Consolidation Engine, Retrieval Engine), the mock-vs-real LLM boundary inside consolidation, the better-sqlite3 driver boundary, and the on-disk SQLite file as the persistence artifact — i.e. which module talks to which across a process/library/file boundary. Excluded as L2/L2b: classifyIntent's regex routing table (agent.js:97-173, an internal decision table, not a space boundary — though I did pull one related invariant card at the addFact/consolidation level since those ARE cross-boundary decision points); the runConsolidation control-flow sequence beyond its single gating decision; the CLI readline event loop (cli.js:43-71); demo.js's 4-session script ordering; and the internal mechanics of compressMemories/forgetFact/reinforceFact (these mutate the existing MemoryStore artifact, they aren't separate components).

## Components (the boxes)

| Component | Kind | Role | Citation |
|---|---|---|---|
| **CLI Entry (cli.js)** | `entry` | Interactive readline chat entry point; instantiates one CRMAgent per session | `src/cli.js:18` |
| **Demo Entry (demo.js)** | `entry` | Scripted 4-session demo driving the same CRMAgent API against a shared SQLite file | `src/demo.js:37` |
| **CRMAgent (agent.js)** | `service` | Orchestrator: classifies intent, routes to handlers, stores episodes, triggers consolidation | `src/agent.js:23` |
| **MemoryStore (memory.js)** | `service` | SQLite-backed store for episodic/semantic/procedural tables + FTS5 indexes | `src/memory.js:29` |
| **Consolidation Engine (consolidation.js)** | `service` | Distills unconsolidated episodes into semantic facts + procedural patterns | `src/consolidation.js:35` |
| **Retrieval Engine (retrieval.js)** | `service` | Hybrid FTS + direct-lookup + procedural-trigger search with relevance/recency/staleness scoring | `src/retrieval.js:28` |
| **Mock LLM Extractor** | `mock` | Regex/heuristic fact extractor used when no real llm option is supplied to the agent | `src/consolidation.js:95` |
| **better-sqlite3 (npm dependency)** | `external` | External synchronous SQLite driver backing all persistence | `package.json:13` |
| **SQLite DB file (crm_memory.db / demo_crm.db)** | `artifact` | On-disk persistence artifact for all three memory layers, survives across CLI sessions | `src/memory.js:27` |

## Flows (the edges)

| From | To | Label | Kind | Citation |
|---|---|---|---|---|
| CLI Entry (cli.js) | CRMAgent (agent.js) | instantiate+process | `primary` | `src/cli.js:59` |
| Demo Entry (demo.js) | CRMAgent (agent.js) | instantiate+process | `primary` | `src/demo.js:53` |
| CRMAgent (agent.js) | MemoryStore (memory.js) | addEpisode | `call` | `src/agent.js:88` |
| CRMAgent (agent.js) | Consolidation Engine (consolidation.js) | runConsolidation | `call` | `src/agent.js:478` |
| CRMAgent (agent.js) | Retrieval Engine (retrieval.js) | retrieve/retrievePerson | `call` | `src/agent.js:21` |
| Consolidation Engine (consolidation.js) | MemoryStore (memory.js) | read+write facts | `data_in` | `src/consolidation.js:50` |
| Consolidation Engine (consolidation.js) | Mock LLM Extractor | extractFacts fallback | `call` | `src/consolidation.js:23` |
| Retrieval Engine (retrieval.js) | MemoryStore (memory.js) | FTS+direct search | `data_in` | `src/retrieval.js:39` |
| MemoryStore (memory.js) | better-sqlite3 (npm dependency) | Database() driver | `call` | `src/memory.js:31` |
| MemoryStore (memory.js) | SQLite DB file (crm_memory.db / demo_crm.db) | persist WAL | `artifact` | `src/memory.js:32` |

## Invariant cards — COMPLETE enumerations, in code order

Per `DIAGRAM_RULES.md`: a card lists the REAL enumeration from code, complete and in code order. Never a summary, never "etc.". If an enumeration changes in code, the card is WRONG, not stale.

### Consolidation gate — what makes it fire?

Source: `src/consolidation.js:37-50`

- unconsolidatedCount = memory.countUnconsolidated()
- urgent = unconsolidatedCount > 0 AND at least one unconsolidated episode's raw_input matches URGENT_PATTERNS = /\b(?:moved\s+to|joined|switched\s+to|now\s+at|promoted\s+to|left|quit|fired\s+from)\b/i
- if NOT urgent AND unconsolidatedCount < threshold → return { ran: false, reason: ... } — no extraction happens
- else → gather episodes (urgent ? all unconsolidatedCount : threshold-many, oldest first) and proceed to extractFacts

### MemoryStore.addFact — create vs update vs contradiction

Source: `src/memory.js:157-237`

- Query for an existing non-archived semantic row with the same subject+predicate (case-insensitive)
- If none exists → INSERT a new row (action: 'created')
- If one exists → run detectContradiction(newFact, existing) and merge source_episode_ids
- If detectContradiction reports a contradiction → halve the existing row's confidence in place (kept, not deleted), INSERT the new fact as a separate row (action: 'contradiction_resolved')
- If no contradiction → UPDATE the existing row in place: object, confidence, merged sources, stale reset to 0 (action: 'updated')

### decayMemories — per-fact outcome

Source: `src/memory.js:268-317`

- ageDays = (now - fact.updated_at) in days; if ageDays <= 0 → untouched, no change
- else newConfidence = fact.confidence × 2^(-ageDays / semanticHalfLife) where semanticHalfLife defaults to 180 days
- if newConfidence < archiveThreshold (default 0.1) → archived = 1, stale = 1 (soft-deleted)
- else if |newConfidence - fact.confidence| > 0.001 → confidence updated in place (counted as decayed)
- else → untouched (change too small to matter)

## Artifacts written

| Artifact | Written by | Citation |
|---|---|---|
| `crm_memory.db / demo_crm.db (SQLite file, WAL mode)` | MemoryStore constructor | `src/memory.js:27,31-32` |
| `README ASCII architecture diagram` | README.md author — CLAIM, not verified against code by this extraction | `README.md:17-53` |

## Deliberately NOT drawn

- classifyIntent's regex routing table (agent.js:97-173) — internal decision table for one component, not a cross-boundary space element; L2
- runConsolidation's full step sequence beyond the single gating decision (extractFacts → addFact loop → markConsolidated → extractProcedures → markStaleFacts) — L2 control flow within one component
- CLI readline event loop (cli.js:43-71: line/close handlers) — L2b time-ordered interaction, not a space boundary
- demo.js's 4-session scripted narrative (session 1-4 input arrays, contradiction/decay/compression demo beats) — L2b choreography over time, not architecture
- extractProcedures' call_prep / introduction pattern detection (consolidation.js:320-356) — internal heuristic inside the Consolidation Engine, not a separate boundary-crossing component
- compressMemories / forgetFact / reinforceFact / getMemoryHealth (memory.js) — all mutate the same MemoryStore artifact already shown; treated as internal operations, not new components
- detectContradiction's own internal branching (memory.js:635-665) — folded as supporting detail into the addFact invariant card rather than given a separate card, to avoid a 4th card duplicating the same decision surface

## Portability notes — semantic tokens under strain

Recorded because the vocabulary was built for a trading system. "Rules bent per new domain" is the portability metric for the harness.

- Domain vocabulary is cognitive/CRM (episodic/semantic/procedural memory, confidence, staleness, contradiction) rather than trading — no natural analogue to broker/order/fill terms; edges labeled generically (call/data_in) instead.
- 'mock' component kind fits cleanly: mockLLMExtractor is the code's own explicit fallback when no real LLM is wired in (consolidation.js:23), directly analogous to a paper/mock broker.
- CRMAgent is classified 'service' not 'agent' — it has no autonomous loop or goal-seeking behavior, just synchronous intent→handler dispatch (agent.js:34-93); the diagram vocabulary's 'agent' kind implies more autonomy than this class exercises.
- No edge here maps to the trading vocabulary's 'stop' kind (e.g. kill switch) — this system has no equivalent circuit breaker at L1; omitted entirely rather than forced.

