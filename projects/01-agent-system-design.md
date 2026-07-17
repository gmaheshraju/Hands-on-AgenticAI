# Project 01: PR Review Agent

## The Problem

Your team merges 30 PRs a week. Reviewers miss bugs, style drifts, and security issues because they're skimming 500-line diffs at 6pm. You need an agent that reads a GitHub PR, understands the codebase context, and produces structured review comments — not "looks good" fluff, but actual bugs and design concerns.

## What You Build

A CLI agent that takes a GitHub PR URL and produces a structured code review.

**Input:** `node review-agent.js https://github.com/org/repo/pull/42`

**Output:** A list of findings, each with:
- File path and line number
- Severity (bug / suggestion / nit)
- What's wrong and why
- Suggested fix (if applicable)

## Architecture Requirements

1. **Tool layer** — The agent needs tools: `read_file` (fetch file contents from the repo), `search_codebase` (grep for symbols/patterns), `get_pr_diff` (fetch the diff), `list_files` (directory listing). Use the GitHub API — no mocking.

2. **ReAct loop** — The agent should reason about what to review, use tools to gather context (e.g., "this function changed — let me check who calls it"), then produce findings. Not a single prompt-and-pray call.

3. **Iteration cap** — Max 15 tool calls per review. Track token usage. If the agent loops without making progress, terminate.

4. **Structured output** — Findings must be JSON-parseable. Each finding has `file`, `line`, `severity`, `issue`, `suggestion`.

5. **Deduplication** — If the agent finds the same issue in multiple places, group them ("this pattern appears in 4 files").

## Evaluation Criteria

Run your agent on 5 real open-source PRs (pick repos you know). For each:
- Did it find real issues? (precision)
- Did it miss obvious issues you'd catch? (recall)
- Did it stay within the iteration cap?
- Total cost per review (tokens * price)

A good agent finds 2-3 real issues per PR at under $0.50 per review.

## Stack

- Node.js or Python
- GitHub REST API (via `octokit` or `requests`)
- Any LLM API (Claude, GPT-4, etc.)
- No frameworks — build the ReAct loop yourself

