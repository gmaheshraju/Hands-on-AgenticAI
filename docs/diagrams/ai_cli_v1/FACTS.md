# FACTS — 20-ai-cli-tool (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/20-ai-cli-tool/`, n=10 JS modules (1448 lines) + a
zero-dependency `package.json`. **Every element in the diagram appears below with
a `file:line` citation. The diagram may contain nothing that is not on this page,
and this page may contain nothing without a citation.** The project README ships
an ASCII architecture diagram; it was treated as a claim, not evidence — every
fact below was read from source. The README is largely accurate here (unlike some
sibling projects); the one imprecision that did not survive reading is recorded
under "README claims that did not verify".

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The interactive commit accept/edit/regenerate
loop (commit.js:57-102), the diff-parsing regex heuristics inside the mock
functions, and the switch/case body of the CLI are L2 concerns and are
deliberately NOT drawn here.

---

## Entry point — `bin/aidev.js`

| Fact | Citation |
|---|---|
| CLI reads `process.argv.slice(2)`, `command = args[0]` | aidev.js:15, :16 |
| Global `--no-color` flag toggles `ui.setColor(false)` | aidev.js:20 |
| `switch (command)` dispatches all verbs | aidev.js:26 |
| `commit` / `c` → `commitCommand` | aidev.js:27, :28, :29 |
| `review` / `r` → `reviewCommand` | aidev.js:32, :33, :34 |
| `explain` / `e` → `explainCommand` | aidev.js:37, :38, :39 |
| `config` → `configCommand` (inline, sync) | aidev.js:42, :83 |
| `status` / `budget` → `statusCommand` (inline) | aidev.js:46, :47, :143 |
| `demo` → `runDemo` (banner) | aidev.js:51, :52 |
| `--version` / `help` / undefined handled inline | aidev.js:55, :60-65 |
| Top-level `try/catch` → `ui.error` + `process.exit(1)`; `--verbose` prints stack | aidev.js:72-78 |

## The command handlers — `src/commands/`

| Fact | Citation |
|---|---|
| `commitCommand(args)` — staged-diff → message → interactive commit | commit.js:7 |
| commit reads staged diff via git | commit.js:16 |
| commit calls `generateCommitMessage(config, diff)` | commit.js:47 |
| `reviewCommand(args)` — diff → issues, `--json` + exit codes | review.js:7 |
| review reads diff (unstaged→staged, or target) via git | review.js:24 |
| review calls `reviewCode(config, diff)` | review.js:54 |
| review exits 1 when critical issues found | review.js:84, :124 |
| `explainCommand(args)` — file → structured explanation | explain.js:8 |
| **explain reads the file with `fs.readFileSync`, NOT git** | explain.js:57 |
| explain 500KB size guard | explain.js:48 |
| explain calls `explainFile(config, content, filePath)` | explain.js:75 |
| every command starts with `loadConfig()` | commit.js:8, review.js:8, explain.js:9 |

## The git adapter — `src/git.js`

| Fact | Citation |
|---|---|
| imports both `execSync` and `execFileSync` | git.js:1 |
| `run(cmd)` = `execSync` (shell), fixed commands only | git.js:3, :5 |
| `runSafe(exe, args)` = `execFileSync` (no shell), for user input | git.js:16-18, :20 |
| `isGitRepo`, `getStagedDiff`, `getUnstagedDiff`, `getStatus`, `getCurrentBranch`, `getStagedFiles` use `run` | git.js:32, :36, :44, :70, :78, :94 |
| `getBranchDiff(base)`, `getDiffForReview(target)`, `getRecentCommits(count)`, `commit(message)`, `getDiffFiles(target)` use `runSafe` | git.js:49, :61, :74, :82, :101 |
| `readFileContent` uses `execFileSync('cat', …)` directly | git.js:87 |
| `commit()` passes `throwOnError` so a failed commit propagates | git.js:82 |

## The LLM client — `src/llm.js`

| Fact | Citation |
|---|---|
| Public API: `generateCommitMessage`, `reviewCode`, `explainFile` | llm.js:183, :218, :256 |
| Each public fn branches on `isDemoMode(config)` first | llm.js:184, :219, :257 |
| Mock heuristics: `mockCommitMessage`, `mockReview`, `mockExplain` | llm.js:8, :39, :85 |
| Real path: `callLLM(config, messages)` dispatcher | llm.js:300 |
| `provider === 'anthropic'` → `callAnthropic`, else `callOpenAI` | llm.js:301, :302, :304 |
| `callOpenAI` POSTs `https://api.openai.com/v1/chat/completions` | llm.js:129, :137 |
| `callAnthropic` POSTs `https://api.anthropic.com/v1/messages`, converts OpenAI msg format → Anthropic | llm.js:152, :154-161, :165 |
| shared `httpRequest` via Node `https`, rejects on status ≥ 400 | llm.js:110, :116 |
| after every REAL call: `recordUsage(model, in, out, command)` | llm.js:207, :244, :279 |
| input truncated (8k commit / 12k review / 10k explain) via `truncate()` | llm.js:203, :240, :275, :324 |
| token estimate ~4 chars/token via `estimateTokens()` | llm.js:329-331 |

## Config + budget — `src/config.js`, `src/budget.js`

| Fact | Citation |
|---|---|
| `CONFIG_PATH = ~/.aidev.json` | config.js:5 |
| `loadConfig()` = DEFAULTS ∪ stored (corrupt → defaults) | config.js:28, :34, :37 |
| `saveConfig()` writes the JSON | config.js:41 |
| `isDemoMode(config)` = `!api_key || provider === 'mock'` | config.js:48, :49 |
| `MODEL_PRICING` — 6 priced models + `mock` | config.js:18-26 |
| `BUDGET_PATH = ~/.aidev-usage.json` | budget.js:6 |
| `recordUsage()` appends an op, writes usage, prunes to 30 days | budget.js:32, :43, :53-56, :58 |
| `saveUsage()` writes the JSON | budget.js:18 |
| `calculateCost()` = tokens/1M × {input,output} price | budget.js:25, :27-29 |
| `checkBudget()` → `{spent, budget, remaining, overBudget, nearBudget}` | budget.js:68, :71-78 |

## External surface — the two LLM APIs (real network)

| Fact | Citation |
|---|---|
| OpenAI Chat Completions endpoint | llm.js:137 |
| Anthropic Messages endpoint (own auth headers + version) | llm.js:165, :167-171 |

Unlike sibling harness projects where `component.external` had no real occupant,
here the external boundary is genuine: both are live HTTPS calls to third-party
APIs, reached only outside demo mode.

## Artifacts written (home directory)

| Output | Written by | Citation |
|---|---|---|
| `~/.aidev.json` — config | `saveConfig()` | config.js:41 |
| `~/.aidev-usage.json` — per-op cost ledger, 30-day rolling | `saveUsage()` via `recordUsage()` | budget.js:18, :32 |

Terminal output (stdout) is produced by `src/ui.js` for every command; it is a
cross-cutting presentation utility and is folded out of the drawing (see below).

---

### INVARIANT CARD 1 — graceful fallback to mock (the project thesis)

The tool never fails for lack of a key or budget; it degrades to heuristics.

| Fact | Citation |
|---|---|
| `isDemoMode` = `!api_key` OR `provider === 'mock'` | config.js:48, :49 |
| demo mode → `mock*` heuristics, `cost 0`, no network, no `recordUsage` | llm.js:184, :185-187, :219, :257 |
| live + `overBudget` → `config.provider = 'mock'` (silent switch) | commit.js:26-29, review.js:40-42, explain.js:62-64 |
| **budget is checked ONLY in live mode** (`if (!isDemoMode)`) | commit.js:24, review.js:38, explain.js:60 |
| `nearBudget` = remaining < 20% of daily budget → warn | budget.js:76, commit.js:30 |
| `overBudget` = remaining ≤ 0 | budget.js:75 |

### INVARIANT CARD 2 — git execution safety (no shell for user input)

Complete split of the two executors, in code order.

| Executor | Functions | Citation |
|---|---|---|
| `execFileSync` (no shell — user input) | `getBranchDiff` :49, `getDiffForReview` :61, `getRecentCommits` :74, `commit` :82, `readFileContent` :87, `getDiffFiles(target)` :101 | git.js:18, :49, :61, :74, :82, :87, :101 |
| `execSync` (shell — fixed commands only) | `isGitRepo` :32, `getStagedDiff` :36, `getUnstagedDiff` :44, `getStatus` :70, `getCurrentBranch` :78, `getStagedFiles` :94 | git.js:5, :32, :36, :44, :70, :78, :94 |

### INVARIANT CARD 3 — providers and the 6 priced models

| Fact | Citation |
|---|---|
| `callLLM`: `provider === 'anthropic'` → `callAnthropic` | llm.js:301, :302 |
| else → `callOpenAI` (also the default `provider`) | llm.js:304, config.js:10 |
| OpenAI: `api.openai.com/v1/chat/completions` | llm.js:137 |
| Anthropic: `api.anthropic.com/v1/messages` (format converted) | llm.js:165 |
| priced models (config.js:19-24): gpt-4o-mini, gpt-4o, gpt-4-turbo, claude-haiku-4-5, claude-sonnet-5, claude-opus-5 | config.js:19, :20, :21, :22, :23, :24 |
| `mock` priced at 0 / 0 | config.js:25 |
| cost = tokens/1M × price; unknown model → gpt-4o-mini | budget.js:27-29, config.js:45 |

---

## README claims that did not verify

1. **The README states "Every command calls `checkBudget()` before the LLM
   call."** In code the budget check is guarded by `if (!isDemoMode(config))` in
   all three commands (commit.js:24, review.js:38, explain.js:60) — so in demo
   mode `checkBudget` is not called at all, and demo runs are never recorded to
   the usage ledger (`recordUsage` is only reached on the real path, llm.js:207,
   :244, :279). The `status` command also calls `checkBudget` (aidev.js:145),
   which is not "before an LLM call". The diagram draws the budget check as
   live-mode-only and labels the fallback card accordingly. This is the single
   correction on this page.

Everything else in the README ASCII verified: the `bin/aidev.js` switch/case
routing, the `isDemoMode? mock : callLLM` fork, the `execFileSync`-for-user-input
git safety split, the `truncate()` input caps, and the two config/usage files.

## Folded / deliberately NOT drawn (L1 scope discipline)

| Item | Why |
|---|---|
| `src/ui.js` (colors, prompts, `box`, `severityBadge`, stdout) | cross-cutting presentation utility used uniformly by all commands; crosses no boundary. Documented, not drawn. |
| `src/demo.js` (`SAMPLE_DIFF`, `SAMPLE_FILE`, `runDemo` banner) | static sample data + a help banner; not on the money/analysis path. |
| commit interactive loop accept/edit/regenerate/quit (commit.js:57-102) | L2 control flow. |
| the mock heuristics' regex internals (llm.js:56-80 etc.) | L2 detail; the card carries the L1-relevant fact that they exist and cost 0. |
| `configCommand` / `statusCommand` bodies (aidev.js:83, :143) | inline CLI utilities reading config/usage; their reads/writes are represented by the config box + artifact edges. |
| the second git-diff edge (git → review, review.js:24) | git feeds BOTH commit (git.js getStagedDiff, commit.js:16) and review (getDiffForReview, review.js:24). Drawing two near-parallel edges into the stacked command column bundled illegibly, so the single `git → commit` edge is labelled `diff read :16 :24` and carries both consumers; explain remains distinct (fs, no git). |

## Portability notes — vocabulary strain recorded per new domain

Built for a trading system; recorded because "rules bent per new domain" is the
tracked metric.

1. **`component.external` fits honestly here** — the OpenAI and Anthropic HTTPS
   endpoints (llm.js:137, :165) are real third-party network calls, not a
   hardcoded mock. This is the strain *not* present, worth noting since the token
   frequently has no true occupant in sibling diagrams.
2. **`component.agent` has no honest in-process occupant.** The real "agent" (the
   LLM) lives *across* the external boundary as `component.external`; the
   in-process stand-in is the `mock*` heuristics, which are stateless pure
   functions. They were tagged `component.mock` (they are literally mocks) and
   labelled SIMULATED, rather than forcing `component.agent`. The `component.agent`
   token therefore goes unused on this page.
3. **`component.service` covers both true services and thin adapters.** `git.js`
   is an exec adapter and `config.js`/`budget.js` are file-backed stores; all
   three took `component.service` because no `component.store`/`component.adapter`
   token exists. Noted, not invented.
4. **No `edge.data_out` token exists.** The write edges to the two JSON artifacts
   used `edge.artifact`; git→command diff reads used `edge.data_in`.
