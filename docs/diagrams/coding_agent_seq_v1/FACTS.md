# FACTS — 16-ai-coding-agent, two fixes to one file (L2b, extracted 2026-08-25)

Source of truth: `projects/16-ai-coding-agent/src/coder.js`, `src/agent.js`,
`src/prGenerator.js`. **Every participant, message and note below cites code. The
diagram may contain nothing that is not on this page.**

Altitude: **L2b — time.** Which module reads and which writes is L1. This page is
about one thing: that *every* read happens before *any* write.

Claims marked `[RAN]` were produced by running the real `createCoder` and
`applyChanges` against a two-route fixture. Transcript at the bottom.

## Why this project earned an L2b

There is no concurrency here at all — it is a plain `for` loop. The defect is
still an ordering one: the code separates a read phase from a write phase, and
two steps that touch the same file both compute their result from the same
pre-write bytes. An L1 map shows a coder that reads files and writes files, which
is true and says nothing. There is no mutated status field, so there is no L2.
Only the read-then-read-then-write-then-write order exposes it.

## Participants

| Lifeline | What it is | Where |
|---|---|---|
| `Agent` | the orchestrator, calls the two phases | `agent.js:87`, `agent.js:106` |
| `Coder` | `executePlan` then `applyChanges` | `coder.js:43`, `coder.js:108` |
| `src/app.js` | the file on disk | `coder.js:67`, `coder.js:114` |
| `PR body` | the pull request written from the changes | `prGenerator.js:23` |

## The order

`executePlan` sorts the steps by priority (`coder.js:45`) and runs them in one
loop (`coder.js:47-51`). Each `executeStep` reads the file (`coder.js:67-68`),
computes a new version from what it read (`coder.js:75`), and returns a change
object carrying both `originalContent` and `newContent` (`coder.js:95-101`).
**Nothing is written during this phase.**

`applyChanges` (`coder.js:108-118`) then walks the collected changes and writes
each one's full `newContent` over the path (`coder.js:114`), pushing the filename
onto `applied` (`coder.js:115`). There is no re-read, no conflict check, and no
comparison against what is currently on disk.

So for two steps targeting the same file:

| # | What happens | Where |
|---|---|---|
| 1 | step one reads `src/app.js` | `coder.js:67` |
| 2 | step one computes its fix from those bytes | `coder.js:75`, `coder.js:183` |
| 3 | step two reads `src/app.js` — **unchanged, step one wrote nothing** | `coder.js:67` |
| 4 | step two computes its fix from the same bytes | `coder.js:75` |
| 5 | step one's `newContent` is written | `coder.js:114` |
| 6 | step two's `newContent` is written, **overwriting it** | `coder.js:114` |

## The finding `[RAN]`

A fixture with two independent unguarded lookups in one file — a `/users/:id`
route and a `/todos/:id` route — and a plan with one `missing-null-check` step
for each:

```
changes produced             : 2
both read the SAME original  : true
   step 1 diff adds a guard for : user
   step 2 diff adds a guard for : todo
applyChanges reported applied: 2

ON DISK AFTER APPLY:
  user guard present : false
  todo guard present : true
```

Two fixes were generated, two were reported applied, and one is on disk. The
first is gone, with no error, no warning and no record that it was lost.

### Why the first one loses, precisely

`fixMissingNullCheck` inserts a line into the array it was given
(`coder.js:209`), so step two's `newContent` is *the original file plus the todo
guard* — the user guard was never in the bytes it started from. Writing it at
`coder.js:114` therefore reverts step one.

Which step survives is **deterministic, not arbitrary**: `coder.js:45` sorts by
priority, `Array.prototype.sort` is stable, so steps of equal priority keep plan
order and the **last** step targeting a file wins. Nothing about that is
signalled anywhere.

## The report is wrong, not just the file `[RAN]`

`applyChanges` returns one entry per change (`coder.js:115`), so the agent is
told 2 files were written. `generatePR` (`prGenerator.js:23`) then loops every
change and embeds each one's diff in a fenced block
(`prGenerator.js:66-71`) — including step one's, whose `diff` was computed at
`coder.js:86-93` against content that no longer describes the file.

The pull request therefore shows a reviewer a diff adding the user guard, while
the branch does not contain it. A reviewer approving that diff approves
something that was never applied.

## Deliberately NOT drawn

- `planner.js` and `issueParser.js` — how the plan was produced does not affect
  the ordering, and a plan from any source hits this the same way.
- `testRunner.js` and the iteration loop in `agent.js`. A test run *could* catch
  the lost fix, but only if a test covers the reverted route; it is not a guard.
- `revertChanges` (`coder.js:127`), which writes `originalContent` back. It has
  the same shape and would restore a file to a state neither step intended, but
  it is a separate path and belongs on its own page.
- The specific fixers (`fixMissingNullCheck`, `fixUnhandledError`). Which fix is
  generated is irrelevant; any two edits to one file collide identically.

## Verification

```
$ npm ci --ignore-scripts      # lockfile sha256 unchanged before and after
$ node probe_coder.mjs
changes produced             : 2
both read the SAME original  : true
   step 1 diff adds a guard for : user
   step 2 diff adds a guard for : todo
applyChanges reported applied: 2

ON DISK AFTER APPLY:
  user guard present : false
  todo guard present : true
```
