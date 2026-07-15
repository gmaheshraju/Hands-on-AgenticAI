# Project 22: Context Window Optimizer

A production-grade context engineering system that takes heterogeneous sources (system prompts, RAG chunks, memory entries, tool results, conversation history, few-shot examples) and assembles the best possible context window within a token budget.

## Quick Start

```bash
# Run the interactive demo
node src/demo.js

# Run all tests (38 tests)
node --test src/tests/*.test.js
```

## Architecture

```
                         ┌─────────────────────────────────────────────────────────────────┐
                         │                     INPUT SOURCES                               │
                         │                                                                 │
                         │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
                         │  │System Prompt │ │  RAG Chunks  │ │   Memory     │             │
                         │  │ (priority 0) │ │ (priority 2) │ │ (priority 3) │             │
                         │  │ never dropped│ │ relevance    │ │ key-value    │             │
                         │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘             │
                         │         │                │                │                     │
                         │  ┌──────┴───────┐ ┌──────┴───────┐ ┌──────┴───────┐             │
                         │  │ Conversation │ │ Tool Results │ │  Examples    │             │
                         │  │ (priority 1) │ │ (priority 4) │ │ (priority 5) │             │
                         │  │ history      │ │ function out │ │ few-shot     │             │
                         │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘             │
                         └─────────┼────────────────┼────────────────┼─────────────────────┘
                                   │                │                │
                                   ▼                ▼                ▼
                         ┌─────────────────────────────────────────────────────────────────┐
                         │                createSource() — sources.js                      │
                         │          Auto-estimates tokens, assigns relevance 0-1           │
                         └────────────────────────────┬────────────────────────────────────┘
                                                      │
              ┌───────────────────────────────────────┼──────────────────────────────┐
              │                                       │                              │
              ▼                                       ▼                              ▼
┌───────────────────────────┐           ┌───────────────────────────┐  ┌──────────────────────────┐
│   BPE Tokenizer           │           │  Conversation Compactor   │  │    Prompt Cache           │
│   tokenizer.js            │           │  compactor.js             │  │    cache.js               │
│                           │           │                           │  │                           │
│ estimateTokens()          │           │ extractKeyFacts()         │  │ ContextCache              │
│  ├─ detectContentType()   │           │  ├─ decisions             │  │  ├─ static prefix (sys    │
│  ├─ SINGLE_TOKEN_WORDS    │           │  ├─ questions             │  │  │   prompt + examples)   │
│  ├─ CamelCase splits      │           │  ├─ entities              │  │  ├─ TTL-based (300s)      │
│  └─ code 1.3x multiplier  │           │  ├─ actionItems           │  │  ├─ cache hit/miss track  │
│                           │           │  └─ keyValues             │  │  └─ 90% cost savings      │
│ truncateToTokens()        │           │                           │  │                           │
│  └─ binary search word    │           │ compactConversation()     │  │ simulateSession()         │
│     boundary              │           │  ├─ keep last N verbatim  │  │  └─ multi-request cost    │
│                           │           │  ├─ summarize older turns  │  │     analysis              │
│ truncateMiddle()          │           │  └─ 60/40 start/end split │  │                           │
│  └─ 60% start + 40% end  │           │                           │  │ report()                  │
│     + [...truncated...]   │           │ Compression ratio tracked │  │  └─ per-request breakdown │
└───────────────────────────┘           └───────────────────────────┘  └──────────────────────────┘
              │                                       │                              │
              └───────────────────────────────────────┼──────────────────────────────┘
                                                      │
                                                      ▼
                         ┌─────────────────────────────────────────────────────────────────┐
                         │                  TokenBudget — budget.js                        │
                         │                                                                 │
                         │  Total tokens ──▶ 25% output buffer ──▶ available budget        │
                         │                                                                 │
                         │  allocate():                                                    │
                         │   1. Reserve system prompts (priority 0, always fit)             │
                         │   2. Fill remaining by priority order                            │
                         │   3. Partial fit ──▶ truncate    (>= 50 tokens remaining)       │
                         │   4. No fit ──▶ drop             (< 50 tokens remaining)        │
                         │                                                                 │
                         │  Returns: { included[], truncated[], dropped[], budget{} }      │
                         └────────────────────────────┬────────────────────────────────────┘
                                                      │
                                    ┌─────────────────┼─────────────────┐
                                    ▼                 ▼                 ▼
                         ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
                         │   GREEDY     │  │  RELEVANCE   │  │  BALANCED    │
                         │              │  │              │  │              │
                         │ Fill by      │  │ Sort ALL by  │  │ Proportional │
                         │ priority     │  │ relevance    │  │ budget per   │
                         │ tier, drop   │  │ score, pack  │  │ source type, │
                         │ lowest when  │  │ highest      │  │ then fill by │
                         │ over budget  │  │ signal first │  │ relevance    │
                         └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
                                │                 │                 │
                                └─────────────────┼─────────────────┘
                                                  │
                                      strategies.js (pick one)
                                                  │
                                                  ▼
                         ┌─────────────────────────────────────────────────────────────────┐
                         │                   Assembler — assembler.js                      │
                         │                                                                 │
                         │  1. Process included sources (full content)                     │
                         │  2. Process truncated sources (truncateMiddle)                  │
                         │  3. Sort by assembly order:                                     │
                         │     System Prompt ▶ Conversation ▶ RAG ▶ Memory ▶ Tools ▶ Ex.  │
                         │                                                                 │
                         │  4. reorderForAttention()     "Lost in the Middle" (Liu 2023)   │
                         │     ┌─────────────────────────────────────────────────────┐     │
                         │     │ [SYS] [HIGH rel.] ... [LOW rel.] ... [HIGH rel.]   │     │
                         │     │  ^      ^start          ^middle         ^end        │     │
                         │     │  |      most attended   attention       most        │     │
                         │     │  |                      valley          attended    │     │
                         │     └─────────────────────────────────────────────────────┘     │
                         │                                                                 │
                         │  5. Build chat messages[] (system/user roles)                   │
                         │  6. Generate utilization report                                 │
                         └────────────────────────────┬────────────────────────────────────┘
                                                      │
                                                      ▼
                                        ┌──────────────────────────┐
                                        │   Optimized Context      │
                                        │                          │
                                        │  { messages[], report,   │
                                        │    totalTokens }         │
                                        │                          │
                                        │         │                │
                                        │         ▼                │
                                        │       ┌─────┐           │
                                        │       │ LLM │           │
                                        │       └─────┘           │
                                        └──────────────────────────┘
```

The system has four core components that form a pipeline, with two supporting subsystems:

### 1. Tokenizer (`src/tokenizer.js`)
Simple token estimator using character-based heuristics (~4 chars/token). Provides `estimateTokens()`, `truncateToTokens()`, and `truncateMiddle()` (keeps start + end, inserts `[...truncated...]` marker). Zero external dependencies — real systems would use tiktoken.

### 2. Sources (`src/sources.js`)
Defines 6 source types with priority tiers:
- **Priority 0**: System Prompt (never dropped)
- **Priority 1**: Conversation History
- **Priority 2**: RAG Chunks
- **Priority 3**: Memory
- **Priority 4**: Tool Results
- **Priority 5**: Examples

Each source carries a 0-1 relevance score that affects ranking within its priority tier. `createSource()` auto-estimates token count.

### 3. Budget (`src/budget.js`)
`TokenBudget` class manages allocation:
- Reserves 25% for model output buffer
- System prompts always fit (priority 0)
- Remaining budget fills by priority order
- Sources that partially fit get truncated; those that don't fit get dropped
- Generates human-readable budget reports

### 4. Strategies (`src/strategies.js`)
Three assembly strategies show different tradeoffs:

| Strategy | Approach | Best When |
|----------|----------|-----------|
| **Greedy** | Fill by priority tier, drop lowest | You trust your priority ordering |
| **Relevance** | Sort all sources by relevance score | You have good relevance scores |
| **Balanced** | Proportional budget per type | You need representation from every category |

### 5. Assembler (`src/assembler.js`)
Takes an allocation plan and produces the final ordered context:
- System prompt first
- Conversation history (recent turns prioritized)
- RAG chunks (highest relevance first)
- Memory, tool results, examples
- Truncated sources use middle-truncation to preserve start and end
- `reorderForAttention()` implements the Stanford "Lost in the Middle" finding (Liu et al. 2023) — high-relevance content placed at start and end, low-relevance in the middle attention valley

### 6. Conversation Compactor (`src/compactor.js`)
Compresses older conversation turns when history exceeds the token budget:
- Keeps the last N turns verbatim (recent context is critical)
- Extracts key facts from older turns via regex-based NLP (decisions, questions, entities, action items, key-value pairs)
- Generates a structured summary to replace older turns
- Tracks compression ratio statistics

### 7. Prompt Cache (`src/cache.js`)
Simulates Anthropic-style prompt caching where a static prefix (system prompt + few-shot examples) is cached across requests:
- TTL-based cache (default 300s) with hit/miss tracking
- Cached tokens cost 90% less than fresh tokens ($0.30/M vs $3.00/M)
- `simulateSession()` models multi-request cost savings
- Generates per-request cost breakdown reports

## Design Decisions

**Why context engineering matters:** A naive approach stuffs everything into the context window until it overflows, wasting tokens on low-relevance content while potentially dropping high-relevance content. The demo shows 29 sources totaling ~3,300 tokens competing for a 1,536-token budget — each strategy makes different tradeoffs about what to keep, producing meaningfully different contexts.

**Why no external dependencies:** This project demonstrates the concepts without tiktoken, LLM calls, or embedding models. The token estimator is approximate but sufficient for budget planning. Real systems would use tiktoken for exact counts and vector similarity for relevance scoring.

**Why multiple strategies:** There is no single "best" strategy. Greedy is predictable, relevance maximizes signal density, and balanced prevents blind spots. The right choice depends on the use case.

## File Structure

```
22-context-engineering/
  package.json          # ESM project config
  README.md             # This file
  src/
    tokenizer.js        # BPE-approximation token estimation and truncation
    sources.js          # Source types, creation, sorting by priority/relevance
    budget.js           # Token budget allocation with output buffer
    strategies.js       # Greedy, relevance, balanced assembly strategies
    assembler.js        # Final context assembly with attention reordering
    compactor.js        # Conversation history compression via fact extraction
    cache.js            # Prompt cache simulation with cost tracking
    demo.js             # Interactive demo with realistic data
    tests/
      context.test.js   # 38 tests across 9 suites
```
