# Project 03: Research Agent with Observable Harness

## The Problem

You ask an AI to "research the competitive landscape for vector databases" and it gives you a shallow summary from training data. You need an agent that actually searches the web, reads sources, cross-references claims, tracks its own cost and progress, and produces a cited report — with a harness that lets you watch it work and kill it if it goes off track.

## What You Build

A research agent with a fully instrumented harness. The agent takes a research question and produces a structured report with citations.

**Input:** `node research.js "Compare Pinecone vs Weaviate vs Qdrant for production RAG at 10M+ documents"`

**Output:**
- A markdown report with sections, citations, and a summary
- A trace log showing every iteration: what the agent thought, what tool it called, how long it took, how much it cost

## Architecture Requirements

1. **The loop** — Observe → Think → Act → Evaluate. Each iteration:
   - **Observe:** What do I know so far? What's missing?
   - **Think:** What should I do next? (search, read a page, compare two sources)
   - **Act:** Call a tool (web search, fetch URL, extract data)
   - **Evaluate:** Did this action give me useful information? Am I making progress?

2. **Termination conditions** (must implement all three):
   - **Iteration cap:** Max 20 iterations. Hard stop.
   - **Cost cap:** Max $1.00 total spend. Track input + output tokens per call.
   - **Convergence detection:** If 3 consecutive iterations don't add new information to the report, stop early.

3. **Tracing** — Every iteration writes a structured trace entry:
   ```
   { iteration: 5, thought: "Need pricing data for Qdrant",
     tool: "web_search", query: "Qdrant pricing 2024",
     duration_ms: 1200, tokens_in: 450, tokens_out: 120,
     cost_usd: 0.008, cumulative_cost: 0.045,
     new_facts_added: 2 }
   ```

4. **Tools:** `web_search` (via SerpAPI, Tavily, or Brave Search API), `fetch_url` (fetch and extract text from a URL), `add_to_report` (structured tool to add a section/fact to the report).

5. **Report structure** — Not a blob of text. Sections with headers, each claim linked to a source URL. A summary table comparing the options on key dimensions.

## What Makes This Not a Toy

- Web search results are noisy — the agent must judge which results are worth reading
- URLs return messy HTML — you need real text extraction (Readability, Cheerio, etc.)
- Convergence detection is hard: how do you know when you've "learned enough"?
- Cost tracking across nested LLM calls requires careful instrumentation
- The trace log is what makes this production-grade — without it, you can't debug or improve the agent

## Evaluation Criteria

Run the agent on 3 different research questions. For each:
- Report quality: are the facts accurate? Are sources cited?
- Convergence: did it stop at the right time, or did it loop uselessly?
- Cost efficiency: total cost per report
- Trace completeness: can you reconstruct exactly what happened from the trace?

## Stack

- Node.js or Python
- Web search API (Tavily, SerpAPI, or Brave)
- URL text extraction (Mozilla Readability, newspaper3k)
- Any LLM API
- File-based trace output (JSONL)

