# aidev — AI-Powered Developer CLI

A zero-dependency Node.js CLI tool that generates commit messages, reviews code, and explains files using LLM analysis. Works in demo mode without an API key.

## Installation

```bash
# Global install
npm install -g .

# Or run directly
node bin/aidev.js --help
```

## Quick Start

```bash
# Works immediately — no API key needed (demo/heuristic mode)
aidev commit          # Generate commit message from staged changes
aidev review          # Review unstaged changes for issues
aidev explain src/app.js  # Explain what a file does

# For LLM-powered analysis, add an API key
aidev config --set api_key=sk-your-key-here
aidev config --set provider=openai    # or: anthropic
```

## Commands

### `aidev commit` (alias: `c`)

1. Reads `git diff --staged`
2. Analyzes changes (LLM or heuristic)
3. Generates conventional commit message (feat/fix/refactor/docs/test/chore)
4. Interactive: accept, edit, regenerate, or quit
5. Commits with the approved message
6. Shows token usage and cost

```bash
aidev commit          # Interactive commit flow
aidev commit --yes    # Auto-accept the generated message
```

### `aidev review` (alias: `r`)

1. Reads diff (unstaged, staged, or branch comparison)
2. Analyzes for bugs, security issues, performance, style
3. Outputs findings with file:line, severity, and fix suggestions
4. Exit code: 0 (clean) or 1 (critical issues found)

```bash
aidev review              # Review current changes
aidev review main         # Review diff against main branch
aidev review --json       # JSON output for CI pipelines
aidev review HEAD~3..HEAD # Review last 3 commits
```

### `aidev explain` (alias: `e`)

1. Reads a source file
2. Generates: summary, purpose, key functions, dependencies, complexity
3. Great for onboarding to unfamiliar codebases

```bash
aidev explain src/server.js
aidev explain lib/auth.js --json
```

### `aidev config`

```bash
aidev config                          # Show current config
aidev config --set api_key=sk-...     # Set API key
aidev config --set provider=openai    # Set provider (openai/anthropic)
aidev config --set model=gpt-4o      # Set model
aidev config --set daily_budget_usd=2 # Set daily spending limit
aidev config --path                   # Show config file location
```

### `aidev status`

Shows daily token usage, cost breakdown, and budget remaining.

## Configuration

Config stored in `~/.aidev.json`:

| Key | Default | Description |
|-----|---------|-------------|
| `api_key` | (none) | OpenAI or Anthropic API key |
| `provider` | `openai` | `openai`, `anthropic`, or `mock` |
| `model` | `gpt-4o-mini` | Model to use |
| `daily_budget_usd` | `1.00` | Daily spending limit |
| `max_tokens_per_request` | `4096` | Max tokens per LLM call |
| `conventional_commit` | `true` | Use conventional commit format |
| `color` | `true` | Colored terminal output |

## Token Budget Tracking

Usage is tracked across sessions in `~/.aidev-usage.json`:

- Per-operation cost tracking (model, tokens, timestamp)
- Daily budget enforcement with automatic fallback to heuristic mode
- 30-day rolling history
- `aidev status` shows current spend

## Demo Mode

When no API key is configured, aidev uses heuristic analysis:

- **Commit**: Parses diff for file types, additions/deletions, conventional commit patterns
- **Review**: Pattern-matches for console.log, TODO, hardcoded secrets, eval(), innerHTML
- **Explain**: Extracts function names, imports, and estimates complexity

## CI Integration

```yaml
# GitHub Actions example
- name: Code Review
  run: |
    npx aidev review --json > review.json
    # Exit code 1 if critical issues found
```

## Architecture

```
                              ┌──────────────────────────────────┐
                              │        bin/aidev.js              │
                              │    process.argv → switch/case    │
                              │   (commit|review|explain|config  │
                              │    status|demo|help|--version)   │
                              └──────────┬───────────────────────┘
                                         │
              ┌──────────────────────────┬┴──────────────────────────┐
              │                          │                           │
              ▼                          ▼                           ▼
┌─────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│  commands/commit.js  │  │  commands/review.js  │  │ commands/explain.js  │
│                      │  │                      │  │                      │
│ 1. isGitRepo()       │  │ 1. isGitRepo()       │  │ 1. fs.readFileSync() │
│ 2. getStagedDiff()   │  │ 2. getDiffForReview() │  │ 2. Size guard 500KB │
│ 3. checkBudget()     │  │ 3. checkBudget()     │  │ 3. checkBudget()     │
│ 4. generateCommit    │  │ 4. reviewCode()      │  │ 4. explainFile()     │
│    Message()         │  │ 5. Group by severity │  │ 5. Show summary,     │
│ 5. Interactive loop: │  │    (critical/warn/   │  │    functions, deps,  │
│    accept/edit/      │  │     info)            │  │    complexity        │
│    regenerate/quit   │  │ 6. Exit code 1 if    │  │                      │
│ 6. git.commit(msg)   │  │    critical found    │  │                      │
│    ──────────────    │  │    ──────────────    │  │                      │
│    --yes auto-accept │  │    --json CI output  │  │    --json output     │
└──────────┬───────────┘  └──────────┬───────────┘  └──────────┬───────────┘
           │                         │                          │
           └─────────────────────────┼──────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                          src/llm.js                                       │
│                                                                           │
│  isDemoMode()?─── YES ──▶ Mock Heuristics                                │
│       │                  ┌──────────────────────────────────────────────┐ │
│       │                  │ mockCommitMessage(): parse diff, detect type │ │
│       NO                 │ mockReview(): regex patterns (eval, secrets) │ │
│       │                  │ mockExplain(): extract functions, imports    │ │
│       ▼                  └──────────────────────────────────────────────┘ │
│  callLLM(config, messages)                                                │
│       │                                                                   │
│       ├── provider=openai ────▶ callOpenAI()                             │
│       │                        POST api.openai.com/v1/chat/completions   │
│       │                                                                   │
│       └── provider=anthropic ─▶ callAnthropic()                          │
│                                 POST api.anthropic.com/v1/messages       │
│                                 (converts OpenAI msg format → Anthropic) │
│                                                                           │
│  After each call: recordUsage(model, tokens, command)                    │
│  Input truncated to 8-12K chars via truncate()                           │
│  Token estimation: ~4 chars/token via estimateTokens()                   │
└────────────────────────────────────────────────────────────────────────────┘
           │                         │                          │
           ▼                         ▼                          ▼
┌─────────────────┐  ┌───────────────────────┐  ┌──────────────────────────┐
│   src/git.js    │  │    src/budget.js      │  │     src/config.js        │
│                 │  │                       │  │                          │
│ isGitRepo()     │  │ checkBudget()         │  │ loadConfig()             │
│ getStagedDiff() │  │   ▶ overBudget?       │  │   ~/.aidev.json          │
│ getUnstagedDiff │  │     fallback to mock  │  │   DEFAULTS + stored      │
│ getBranchDiff() │  │ recordUsage()         │  │                          │
│ getDiffForReview│  │   ▶ per-op tracking   │  │ isDemoMode()             │
│ commit(msg)     │  │   ▶ 30-day rolling    │  │   !api_key || mock       │
│ readFileContent │  │ calculateCost()       │  │                          │
│ getStagedFiles()│  │   ▶ model pricing     │  │ getModelPricing()        │
│ getDiffFiles()  │  │   ~/.aidev-usage.json │  │   6 models: gpt-4o-mini, │
│ getRecentCommits│  │ formatCost()          │  │   gpt-4o, gpt-4-turbo,  │
│ getCurrentBranch│  │ formatTokens()        │  │   claude-3-haiku/sonnet/ │
│                 │  │ getTodayUsage()       │  │   opus, claude-sonnet-4, │
│ execSync +      │  │                       │  │   claude-opus-4          │
│ execFileSync    │  │                       │  │                          │
│ (no shell for   │  │                       │  │ saveConfig()             │
│  user input)    │  │                       │  │                          │
└─────────────────┘  └───────────────────────┘  └──────────────────────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │     src/ui.js       │
                   │                     │
                   │ color() — ANSI codes│
                   │ heading(), box()    │
                   │ prompt() — readline │
                   │ status/statusDone() │
                   │ costLine()          │
                   │ severityBadge()     │
                   │ setColor(false)     │
                   │   for --no-color    │
                   │   and --json        │
                   └─────────────────────┘
```

**Key data flows:**

- **Budget gate**: Every command calls `checkBudget()` before the LLM call. If `overBudget`, the provider is silently switched to `mock` (graceful degradation -- no crash, no error).
- **Git safety**: `git.js` uses `execFileSync` (no shell) for any command that takes user input (branch names, commit messages) to prevent command injection. `execSync` is only used for fixed commands.
- **Dual output**: All commands support `--json` for CI pipelines (disables color, structured JSON to stdout, exit code signals severity).

### File Map

```
bin/aidev.js          CLI entry point, command routing (process.argv)
src/
  commands/
    commit.js         Commit message generator with interactive loop
    review.js         Code reviewer with severity grouping
    explain.js        File explainer with structured output
  git.js              Git operations (diff, status, commit, log)
  llm.js              LLM client — mock + OpenAI + Anthropic, cost tracking
  config.js           Config file management (~/.aidev.json)
  budget.js           Token/cost budget tracking (~/.aidev-usage.json)
  ui.js               Terminal UI — colors, prompts, formatting
  demo.js             Demo mode samples and info
```

## Design Decisions

- **Zero dependencies**: Uses only Node.js built-ins (fs, path, https, child_process)
- **ESM throughout**: `"type": "module"` with proper imports
- **No CLI framework**: Raw `process.argv` parsing — shows you understand what Commander/yargs abstract
- **Graceful degradation**: API key missing? Works in heuristic mode. Budget exceeded? Falls back automatically.
- **Structured output**: `--json` flag on every command for machine consumption
- **Cost awareness**: Every LLM call shows model, tokens, and cost

## Interview Talking Points

1. **CLI Design**: How to build production CLIs without frameworks — argument parsing, exit codes, stdin/stdout, colored output
2. **LLM Integration**: Prompt engineering for structured output, token estimation, cost tracking
3. **Graceful Degradation**: Demo mode, budget fallback, offline heuristics
4. **Developer UX**: Interactive prompts, conventional commits, CI-friendly JSON output
5. **Budget Management**: Cross-session state, daily limits, per-operation tracking
6. **Security**: API keys in config files (not CLI args), no secrets in git
7. **Testing Strategy**: Mock LLM for deterministic tests, real git operations for integration tests
