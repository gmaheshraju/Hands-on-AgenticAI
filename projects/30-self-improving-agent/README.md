# Project 30: Self-Improving Research Agent

A compound agentic system that wires together an observable harness, cross-session memory, context scratchpad, and automated prompt evolution — all driven by real LLM calls. The agent researches a question using Wikipedia, evaluates its own output, runs a postmortem on its trace, generates a concrete prompt patch, and re-runs with the improved prompt. Scores are tracked across rounds to demonstrate measurable self-improvement.

Zero external dependencies beyond `better-sqlite3`. No LangChain, no frameworks — just `fetch()` and clear engineering.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        SELF-IMPROVEMENT LOOP                            │
│                                                                          │
│  Question ──▶ ┌────────────────────────────────────┐                     │
│               │     Agent Loop (harness.js)         │                     │
│               │                                      │                     │
│               │  System    ┌─────┐  JSON  ┌───────┐  │                     │
│               │  Prompt ──▶│ LLM │──────▶│ Parse │  │                     │
│               │  v{N}      │     │       │Action │  │                     │
│               │            └─────┘       └───┬───┘  │                     │
│               │                              │      │                     │
│               │  ┌──────────┐          ┌─────▼────┐ │                     │
│               │  │ Memory   │◂─────────│ Execute  │ │                     │
│               │  │(SQLite)  │  store   │  Tool    │ │                     │
│               │  └──────────┘  facts   │Wikipedia │ │                     │
│               │                        │Calc/Note │ │                     │
│               │  ┌──────────┐          └──────────┘ │                     │
│               │  │Scratchpad│◂── park findings       │                     │
│               │  └──────────┘                        │                     │
│               └──────────────┬───────────────────────┘                     │
│                              │                                             │
│                    ┌─────────▼─────────┐                                   │
│                    │ Answer + Trace     │                                   │
│                    └────────┬──────────┘                                   │
│                             │                                              │
│               ┌─────────────┼─────────────┐                                │
│               ▼             ▼             ▼                                │
│         ┌──────────┐ ┌──────────┐ ┌──────────┐                             │
│         │ Evaluate │ │Postmortem│ │  Store   │                             │
│         │ 4 scores │ │ failures │ │ episode  │                             │
│         └────┬─────┘ └────┬─────┘ └──────────┘                             │
│              │            │                                                │
│              └──────┬─────┘                                                │
│                     ▼                                                      │
│              ┌──────────┐                                                  │
│              │ Improver │──── LLM generates ──── Apply to ────────────────┘
│              │          │     prompt patch        prompt v{N+1}
│              └──────────┘
└──────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# 1. Install
cd projects/30-self-improving-agent
npm install

# 2. Set up an LLM provider (pick ONE):

# Option A: NVIDIA build.nvidia.com (free tier, best quality)
export NVIDIA_API_KEY=nvapi-your-key-here

# Option B: Ollama (local, unlimited, no key needed)
brew install ollama && ollama serve  # in one terminal
ollama pull llama3.2                 # in another terminal

# Option C: Google Gemini (free tier)
export GEMINI_API_KEY=AIza-your-key-here

# 3. Check connectivity
node src/demo.js --check

# 4. Run the full self-improvement loop
node src/demo.js

# 5. Custom question
node src/demo.js --question "How do black holes form?"

# 6. More rounds
node src/demo.js --rounds 5 --question "What is quantum computing?"

# 7. Force a specific provider
node src/demo.js --provider nvidia
```

## What Happens

**Round 1** — Agent gets a basic system prompt ("search Wikipedia, synthesize an answer"). It typically consults 1-2 sources and synthesizes too early.

**Postmortem** — Analyzes the trace: "single source consulted", "only 3 facts before synthesis", "no scratchpad usage". Scores each of the 10 harness primitives.

**Improvement** — LLM generates a concrete prompt patch: "Add instruction to consult 3+ sources before synthesizing."

**Round 2** — Agent runs with the patched prompt. More sources, more facts, better structure.

**Round 3** — Another patch, another improvement. The final comparison table shows the score trajectory.

**Cross-session memory** — Run the demo twice. The second run starts with facts from the first.

## Files

| File | Lines | Purpose |
|------|-------|---------|
| `llm.js` | 180 | Multi-provider LLM adapter (Ollama, NVIDIA, Gemini) — plain `fetch()`, zero SDKs |
| `tools.js` | 95 | Real tools: Wikipedia search + article, calculator, scratchpad note |
| `agent.js` | 165 | Research agent loop — observe/think/act/evaluate with tool dispatch |
| `harness.js` | 100 | Observable run wrapper — iteration cap, cost cap, convergence detection, JSONL tracing |
| `memory.js` | 140 | SQLite cross-session memory — episodes + semantic facts + FTS5 search + decay |
| `scratchpad.js` | 80 | The "Write" move — park findings, maintain compact index |
| `prompts.js` | 50 | System prompt templates + version history on disk |
| `evaluator.js` | 90 | 4-dimension scorer: fact count, source diversity, coherence, completeness |
| `postmortem.js` | 175 | Trace analysis — 7 failure patterns + 6 primitive scores |
| `improver.js` | 95 | LLM-powered prompt patch generation + application |
| `demo.js` | 225 | CLI entry point — full improvement loop with comparison table |

## Patterns Composed

This project wires together patterns from 6 other projects in this playbook:

| Pattern | Source | How It's Used |
|---------|--------|---------------|
| Agent loop | P01, P03 | observe/think/act/evaluate with tool dispatch |
| Observable harness | P03 | Termination conditions + JSONL tracing |
| Cross-session memory | P02 | SQLite episodic + semantic with FTS5, decay, contradictions |
| Scratchpad (Write move) | P22 | Park findings when context fills up |
| Postmortem loop | P03 | Map failures to fixes after each run |
| Context-aware assembly | P22 | Scratchpad index as compact context |

The self-improvement loop is new — it closes the feedback cycle by feeding postmortem findings back as prompt patches.

## Design Decisions

**Why no LangChain?** The LLM adapter is 20 lines of `fetch()` per provider. LangChain adds 50MB of dependencies to wrap the same call. For a system where you need to understand every byte flowing through the pipeline, abstractions are a liability.

**Why multiple LLM providers?** Free tiers have limits. The adapter tries providers in priority order and falls back automatically. NVIDIA's free tier gives you 70B-parameter models; Ollama runs locally with zero cost. The agent doesn't care which backend powers it.

**Why SQLite for memory?** It survives process crashes (WAL mode), supports full-text search (FTS5), and has zero configuration. The same patterns work at 100K facts. No Redis, no Postgres, no infrastructure.

**Why is the base prompt intentionally bad?** If v1 scored 0.95, there would be nothing to improve. The base prompt is bare-minimum — no source diversity guidance, no scratchpad instructions, no structure requirements. The self-improvement loop discovers and adds these, which is the whole point.
