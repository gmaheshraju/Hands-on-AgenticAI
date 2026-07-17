# Project 16: AI Coding Agent

A mini version of Claude Code/Devin — takes a GitHub issue, reads the codebase, plans a fix, applies it, runs tests, self-corrects on failure, and generates a PR description.

## Quick Start

```bash
node src/demo.js
```

No dependencies needed. The demo runs against a bundled sample project with a planted bug.

## What It Does

The demo issue: **"GET /users/:id returns 500 when user not found"**

The agent:
1. **Parses the issue** — extracts title, labels, error snippets, mentioned files
2. **Explores the codebase** — lists files, reads source, searches for patterns
3. **Plans the fix** — identifies root cause (missing null check), plans the code change
4. **Generates + applies the fix** — adds `if (!user) return 404` before the crash line
5. **Runs tests** — if tests fail, reads errors, generates a correction, retries (max 3)
6. **Generates a PR** — summary, files changed, test results, link to issue

## Architecture

```
Issue → Parser → Explorer → Planner → Coder → Test Runner → PR Generator
                                         ↑          |
                                         └──────────┘
                                       self-correction loop
```

### Key Files

| File | Purpose |
|------|---------|
| `src/agent.js` | Orchestrates the full 6-step pipeline |
| `src/issueParser.js` | Parse GitHub issues (mock + real API) |
| `src/repoExplorer.js` | Codebase navigation: listFiles, readFile, searchCode, gitLog |
| `src/planner.js` | Analyze issue + code → plan with steps |
| `src/coder.js` | Generate code changes, create diffs, apply patches |
| `src/testRunner.js` | Run tests, parse output (Node v23 + TAP), self-correction loop |
| `src/prGenerator.js` | Generate PR title, body, labels from results |
| `sample-project/` | Buggy Express API for the demo |

### The Self-Correction Loop

```
1. Apply fix → Run tests
2. Tests pass? → Done ✓
3. Tests fail? → Parse error output
4. Generate targeted fix based on error pattern
5. Apply fix → Run tests again
6. Max 3 retries before giving up
```

The test runner handles both Node.js v23 spec reporter (`✔`/`✗`) and TAP format (`ok`/`not ok`).

