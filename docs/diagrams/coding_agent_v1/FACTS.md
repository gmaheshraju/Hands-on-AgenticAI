# FACTS — 16-ai-coding-agent (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/16-ai-coding-agent/src/`, n=8 modules, 1736 lines
(`agent.js` 174, `coder.js` 307, `demo.js` 133, `issueParser.js` 172,
`planner.js` 289, `prGenerator.js` 165, `repoExplorer.js` 200, `testRunner.js` 296).
**Every element in the diagram appears below with a `file:line` citation. The
diagram may contain nothing that is not on this page, and this page may contain
nothing without a citation.**

The project README ships an ASCII diagram. It was treated as a CLAIM, not as
evidence. Two of its claims did not survive reading the code and are corrected
below (see *Where the README is wrong*).

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The self-correction retry loop's internal
control flow is L2b and is drawn as a CARD, not as a cycle of boxes.

---

## What this project is

A miniature Claude-Code / Devin. Given a GitHub issue it parses the issue,
explores a target repository on disk, plans a fix, writes the patch, runs the
target's test suite in a child process, retries on failure, and emits a pull
request description. It has **no LLM and no network in the demo path** — the
planner and the coder are rule-based pattern matchers (`planner.js:34`,
`coder.js:5`), and the only network call is an optional GitHub REST fetch
(`issueParser.js:155`).

---

## Components

| # | Component | What it is | Citation |
|---|---|---|---|
| 1 | `demo.js` | CLI entry. Restores a clean copy of the target repo, then calls `runAgent` with mock issue #1 | demo.js:34, :81-87 |
| 2 | `runAgent(config)` | The orchestrator. Six numbered steps, straight-line, no loop of its own | agent.js:41, :60, :68, :74, :85, :111, :148 |
| 3 | `parseIssue(input)` | Issue ingestion — three accepted input forms | issueParser.js:106 |
| 4 | `createPlan(issue, explorer)` | Rule-based planner: gather context, classify the bug, emit steps | planner.js:41, :42, :43, :44 |
| 5 | `createCoder(projectRoot)` | Generates fixes, builds unified diffs, applies patches, can roll back | coder.js:31, :43, :86, :108, :123 |
| 6 | `selfCorrectLoop(...)` | Runs tests, parses failures, applies corrections, retries | testRunner.js:186 |
| 7 | `generatePR({...})` | Assembles PR title, body, branch, labels | prGenerator.js:23 |
| 8 | `createExplorer(projectRoot)` | Shared read-only tool surface; **five** tools returned | repoExplorer.js:24, :199 |
| 9 | `sample-project/` on disk | The target repo with a planted bug | sample-project/src/app.js:60, :68 |
| 10 | Test child process | `execSync(command, { cwd, timeout })` — a real OS process | testRunner.js:52 |
| 11 | GitHub REST API | Only reached when the input is a `http…` URL | issueParser.js:116, :155 |

### The explorer's five tools (repoExplorer.js)

`listFiles` :32 · `readFile` :67 · `searchCode` :87 · `readGitLog` :142 ·
`getStructure` :160 — all five returned from one factory, repoExplorer.js:199.
`readFile` refuses to escape the project root (repoExplorer.js:70-71).
`searchCode` caps results at 50 and filters by extension (repoExplorer.js:88).
`IGNORE_DIRS` skips 9 directories during any walk (repoExplorer.js:13-16).

---

## Flows

| Flow | From → To | What crosses | Citation |
|---|---|---|---|
| CLI start | demo.js → runAgent | `{ issue: 1, projectRoot, maxRetries: 3, testCommand }` | demo.js:81-87 |
| Issue in | GitHub REST → parseIssue | issue JSON, only for URL input | issueParser.js:155-161 |
| Step 1 | runAgent → parseIssue | issue number / URL / object | agent.js:61 |
| Step 2 | runAgent → createExplorer | absolute project root | agent.js:69-70 |
| Step 3 | parseIssue → createPlan | parsed issue + explorer | agent.js:75 |
| Step 4 | createPlan → coder.executePlan | `plan.steps[]`, sorted by priority | agent.js:87, coder.js:45 |
| Step 5 | coder → selfCorrectLoop | coder + explorer handles | agent.js:116 |
| Step 6 | selfCorrectLoop → generatePR | `testResult` + `iterations[]` | agent.js:132-133, :149 |
| Planner reads code | createPlan → explorer | `getStructure`, `readFile`, `searchCode` | planner.js:68, :74, :86, :97, :109 |
| Coder reads code | coder.executeStep → explorer | `explorer.readFile(step.file)` | coder.js:67 |
| Corrector reads code | attemptCorrection → explorer | `readFile`, `searchCode` | testRunner.js:239, :257 |
| Explorer → disk | explorer → sample-project | `readdir` / `readFile` / `execSync git log` | repoExplorer.js:41, :73, :146 |
| Coder → disk | applyChanges → sample-project | `mkdir` + `writeFile` per change | coder.js:113-114 |
| Tests → child process | runTests → `execSync` | the test command, 30s timeout | testRunner.js:45, :52 |
| Child process → back | raw stdout/stderr → parseFailures | exit code + combined output | testRunner.js:60-61, :64 |
| PR out | generatePR → PR object | `{ title, body, branch, labels }` | prGenerator.js:29 |
| PR to stdout | formatPRForDisplay → console | rendered PR block | prGenerator.js:144, agent.js:150 |

---

## INVARIANT CARD 1 — the self-correction loop, complete and in code order

`testRunner.js:186-225`. This is the only loop in the system; `runAgent` itself
is straight-line.

| Step | Behaviour | Citation |
|---|---|---|
| bound | `for (attempt = 0; attempt <= maxRetries; attempt++)` — so up to `maxRetries + 1` test runs inside the loop | testRunner.js:190 |
| default | `maxRetries = 3` in the loop, and `maxRetries = 3` again in `runAgent` | testRunner.js:187, agent.js:45 |
| 1 | `runTests()` on EVERY attempt — fresh `execSync`, nothing cached | testRunner.js:195 |
| 2 | `if (result.passed)` → push iteration and return immediately | testRunner.js:208-210 |
| 3 | else `if (attempt < maxRetries)` → `attemptCorrection(...)` | testRunner.js:214-216 |
| 4 | retries exhausted → **one more** `runTests()` outside the loop, and that is the returned `finalResult` | testRunner.js:223-224 |
| write path | the corrector writes the file **itself** via `fs/promises.writeFile`, it does NOT go through the coder | testRunner.js:242-243 |

`passed` is defined as `exitCode === 0 && failures.length === 0` — both, not
either (testRunner.js:68).

## INVARIANT CARD 2 — bug-type taxonomy, 4 branches, first match wins

`planner.js:137-153`. Classification is driven by two booleans computed from the
issue body (`has500` :134, `has404` :135) plus a regex over the error blocks
(`hasNullError` :131-133).

| # | `bugType` | Condition | Citation |
|---|---|---|---|
| 1 | `missing-null-check` | `hasNullError && has500` | planner.js:137-140 |
| 2 | `unhandled-error` | `has500` alone | planner.js:141-144 |
| 3 | `missing-route` | `has404` alone | planner.js:145-148 |
| 4 | `general` | fallback; summary becomes `Fix: <issue title>` | planner.js:149-153 |

**The load-bearing consequence:** `generateSteps` only emits code-modifying
steps for branch 1 (`planner.js:186`). Branches 2-4 fall through to the test-step
block (`planner.js:231-239`) and produce no source change at all. Two fixed risk
strings are always attached (`planner.js:172-175`).

## INVARIANT CARD 3 — fix emitters, `generateFix` switch in code order

`coder.js:163-174`.

| # | Case | Emitter | Citation |
|---|---|---|---|
| 1 | `missing-null-check` | `fixMissingNullCheck` | coder.js:164-165, :183 |
| 2 | `unhandled-error` | `fixUnhandledError` — **returns the input unchanged** | coder.js:166-167, :220 |
| 3 | `default` | `replace(oldCode, newCode)` only if both are set, else input | coder.js:168-173 |

Inside `fixMissingNullCheck` the null-check *shape* is chosen by sniffing the
file's own text, in this order (coder.js:197-206):
`isExpress` → `res.status(404).json(...)` :200-201 · `isRawHttp` →
`res.writeHead(404)` :202-203 · else → `throw new Error(...)` :204-205.
The guard is spliced in immediately after the lookup line (coder.js:209).
Indentation is copied from the lookup line (coder.js:194).

---

## Where the README is wrong (claim vs code)

1. The README's box diagram draws **Repo Explorer as a pipeline stage** between
   the issue parser and the planner. In code it is not a stage: it is a factory
   (`repoExplorer.js:24`) whose handle is created once (`agent.js:69`) and passed
   as an argument to the planner (`agent.js:75`), the coder (`agent.js:87`) and
   the self-correction loop (`agent.js:116`). It is a **shared tool surface**, and
   the diagram draws it as one.
2. The README's self-correction box says "apply fix ◂─ analyze" through the
   Coder. In code, `attemptCorrection` receives the coder but never calls it —
   it writes the file directly with `fs/promises.writeFile`
   (`testRunner.js:232`, :242-243).

---

## Artifacts written

| Artifact | Written by | Citation |
|---|---|---|
| Patched source in `sample-project/` | `coder.applyChanges()` | coder.js:113-114 |
| Corrected source during retries | `attemptCorrection` directly | testRunner.js:243 |
| PR object `{title, body, branch, labels}` | `generatePR` | prGenerator.js:29 |
| PR rendered to stdout | `formatPRForDisplay` | prGenerator.js:144, agent.js:150 |
| `.sample-project-backup/` | `demo.js` on first run, restored every run after | demo.js:37, :41-42 |

No file is written outside the target project root: the coder resolves against
`root` (coder.js:111) and the explorer blocks traversal (repoExplorer.js:70-71).

---

## Deliberately NOT drawn (L1 scope discipline)

- **The retry cycle as a cycle of boxes.** It is one function
  (`testRunner.js:186`); drawing it as a loop of nodes would be L2b. It is on the
  page as INVARIANT CARD 1 instead.
- **Test-output parsing internals** — three failure patterns
  (testRunner.js:87, :110, :124) and three count parsers (:140, :153, :163).
  Function-level detail; the diagram shows only that raw output crosses back.
- **`coder.rollback()`** (coder.js:123) — implemented and exported (:149) but
  never called by `runAgent`. Drawing an unreachable edge would be a lie.
- **`readGitLog`** (repoExplorer.js:142) — one of the five tools, named on the
  explorer box, but no caller in the demo path invokes it.
- **PR body section assembly** (prGenerator.js:42-120) — internal formatting.
- **The mock issue corpus contents** (issueParser.js:10-42).

---

## Portability notes — rules bent for this codebase

Recorded because "rules bent per new domain" is the harness's portability metric.
The theme is `agent_harness_v1/hoa-default.json` copied unchanged; no token was
added or renamed for this diagram.

1. **`component.mock` did not fit.** In `03-agent-harness` the mock layer was the
   data source. Here the demo target is a *real* directory with real files on
   disk that really get rewritten (coder.js:114). Drawing it as `component.mock`
   would understate what happens. Used **`component.artifact`** for the target
   repo and **`component.external`** for the child process, which is genuinely
   outside the Node process.
2. **`boundary.datasource` for an entry zone** carries the same strain as it did
   in the exemplar — the zone holds a CLI and a REST endpoint, neither of which
   is a "data source" in the usual sense. Kept for consistency with the exemplar
   rather than inventing a `boundary.entry` token for one diagram.
3. **No `edge.stop` needed.** This system has no stop conditions to draw at L1 —
   its only bound is the retry count, which lives on a card. The token went
   unused; that is not a gap.
4. **`card.primitive`** was named for the harness-primitive scoring in
   `03-agent-harness`. Reused here for the third card purely as a third colour.
   The token name is domain-specific and should be renamed (e.g. `card.detail`)
   the next time the theme is revised.
