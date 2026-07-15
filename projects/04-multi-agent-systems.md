# Capstone 04: Multi-Agent Content Pipeline

## The Problem

Your company publishes weekly technical blog posts. The process is painful: someone researches a topic, writes a draft, another person edits it, someone fact-checks the technical claims. It takes 3 people and 2 weeks. You want to compress this into a multi-agent pipeline that produces a reviewed, fact-checked draft in minutes.

## What You Build

A pipeline of 4 specialized agents that collaborate to produce a technical blog post.

**Input:** `node pipeline.js "Write a technical deep-dive on database connection pooling in Node.js"`

**Output:** A blog post with:
- Research notes (from the researcher)
- Draft content (from the writer)
- Edit markup (from the editor)
- Fact-check results (from the verifier)
- Final merged draft

## Architecture Requirements

1. **Four agents, each with a distinct system prompt and tools:**
   - **Researcher** — Searches the web, reads documentation, produces structured research notes with source URLs. Tools: `web_search`, `fetch_url`.
   - **Writer** — Takes research notes and produces a blog post draft. No tools — pure generation. Follows a style guide you define.
   - **Editor** — Reviews the draft for clarity, structure, and technical accuracy. Produces inline comments and a revised version. Tools: none (works on the draft text).
   - **Verifier** — Takes every technical claim in the draft and verifies it against the research sources. Flags claims that aren't supported. Tools: `fetch_url` (to re-check sources).

2. **Orchestration pattern** — Sequential pipeline, not parallel. Researcher → Writer → Editor → Verifier. Each agent's output is the next agent's input.

3. **Shared context** — All agents share a structured context object:
   ```
   { topic, research_notes: [], draft: "", 
     edits: [], fact_checks: [], final: "" }
   ```

4. **Supervisor** — A lightweight supervisor that runs the pipeline, handles failures (if an agent produces garbage, retry once with feedback), and produces the final report showing each agent's contribution.

5. **Cost tracking** — Track tokens and cost per agent. The researcher should use most of the budget (it's doing the hard work). If total cost exceeds $2, abort.

## What Makes This Not a Toy

- Agent handoff is where things break: the writer gets research notes that are too vague, the editor doesn't understand the writer's intent, the verifier can't match claims to sources
- Each agent needs a different personality: the researcher is thorough, the writer is concise, the editor is critical, the verifier is skeptical
- The supervisor's retry logic matters: when the writer produces a bad draft, what feedback do you give?
- You'll discover that 4 sequential LLM calls are slow — this is where you learn why people reach for parallelism (and when it's appropriate)

## Evaluation Criteria

Run the pipeline on 3 different technical topics. For each:
- Research quality: did the researcher find real, relevant sources?
- Draft quality: is the blog post readable and technically sound?
- Edit quality: did the editor catch real issues (not just rewording)?
- Fact-check quality: did the verifier flag actual inaccuracies?
- Total cost and latency per post

## Stack

- Node.js or Python
- Web search API for the researcher
- Any LLM API (use the same model for all agents, or route different agents to different models)
- Structured JSON for inter-agent communication

## Staff+ Interview Angle

"I built a 4-agent content pipeline: researcher, writer, editor, fact-checker. The most interesting finding was that agent handoff quality depends almost entirely on the output schema of the upstream agent. When the researcher returned structured notes with source URLs and key claims, the writer produced dramatically better drafts than when it got freeform text. Inter-agent contracts matter more than individual agent quality."
