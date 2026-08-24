# FACTS — 07-guardrails (L1 architecture, extracted 2026-08-24)

Source of truth: `projects/07-guardrails/src/`, n=4 JS modules (1579 lines) +
6 JSON attack corpora (682 lines). **Every element in the diagram appears below
with a `file:line` citation. The diagram may contain nothing that is not on this
page, and this page may contain nothing without a citation.** The project README
ships an ASCII diagram; it was treated as a claim, not as evidence — every fact
below was read from source, and two README claims did not survive that reading
(see "README claims that did not verify").

Altitude: **L1 — space** (where things live, what talks to what, what crosses a
boundary), per `DIAGRAM_RULES.md`. The regex-by-regex matching logic inside
`scanInput`, and the branch tree inside `simulateNaiveLLM`, are L2 concerns and
are deliberately NOT drawn here.

---

## Entry point — `src/demo.js`

| Fact | Citation |
|---|---|
| CLI reads `process.argv.slice(2)` | demo.js:164 |
| Three modes: default, `--e2e`, `--verbose` | demo.js:163, :165, :166 |
| Imports `runAllAttacks` from the runner | demo.js:17 |
| Imports `calculateScores` / `printScoreReport` from the scorer | demo.js:18 |
| Imports `defend`, `validateOutput`, `buildSandwichedPrompt`, `CANARY_TOKEN`, `LEGITIMATE_QUERIES` from the defense layer | demo.js:19-25 |
| Part 1 — five hand-written defense examples | demo.js:31, :174 |
| Part 2 — the full suite, then the score report | demo.js:108, :117, :153, :154 |
| Failure path: `main().catch` → `process.exit(1)` | demo.js:204-207 |

`src/runner.js` and `src/scorer.js` each also carry their own CLI `main()`
(runner.js:261, scorer.js:285), wired in `package.json` as `test` and `score`.
Only `demo.js` is drawn as the entry component; the other two are drawn as the
services they are.

## Inputs — the attack corpora and the control set

| Fact | Citation |
|---|---|
| `ATTACK_FILES` — the 5 TRAINING corpora, in load order | runner.js:24-30 |
| Training totals, read from the JSON: directOverride 12, indirectInjection 11, roleHijacking 12, extraction 12, encoding 12 = **59** | `src/attacks/*.json` (`attacks[]` lengths) |
| `HELD_OUT_FILE = 'held-out.json'` — loaded separately | runner.js:35 |
| Held-out totals: direct_override 7, role_hijacking 6, extraction 6, encoding 5, indirect_injection 5 = **29** | `src/attacks/held-out.json` (`datasets[].attacks[]` lengths) |
| Held-out is loaded through a different shape (`parsed.datasets`) than training (one dataset per file) | runner.js:59 vs :46 |
| `LEGITIMATE_QUERIES` — 50 benign customer-support strings, the false-positive control set | defense.js:601 |
| The control set lives in `defense.js`, not in `attacks/` — it is imported by the runner | runner.js:15, :181 |

## The runner — `src/runner.js`

| Fact | Citation |
|---|---|
| `async function runAllAttacks(options)` — the orchestrator | runner.js:128 |
| Loads training then held-out before running anything | runner.js:130, :131 |
| One closure, `runDataset(dataset, source)`, runs BOTH sets — same code path | runner.js:135, :176, :177 |
| Each attack goes through `defend(attack.prompt, { blockThreshold })` | runner.js:138 |
| `source` ('training' \| 'held-out') is stamped on every result row | runner.js:164 |
| Every result is pushed to one flat `results[]` | runner.js:160 |
| The 50 legitimate queries are run through the same `defend()` | runner.js:181-182 |
| `buildSummary(results, falsePositives)` | runner.js:196, :204 |
| `SYSTEM_PROMPT` — the simulated Acme Corp support prompt | runner.js:66-69 |
| `printResults(...)` writes the per-category + verdict block to stdout | runner.js:280, :283 |
| `--json` dumps the whole result object instead of printing | runner.js:274-275 |
| Exports `runAllAttacks`, `loadAttacks`, `loadHeldOutAttacks`, `simulateNaiveLLM`, `SYSTEM_PROMPT` | runner.js:387 |

## The simulated target — `src/runner.js`

| Fact | Citation |
|---|---|
| `function simulateNaiveLLM(userInput)` — **no API call, no model** | runner.js:75 |
| Six injection-success branches, then one safe default | runner.js:79, :82, :85, :88, :91, :94, :99 |
| Only reached in `--e2e` mode, and only when the input was NOT blocked at L1 | runner.js:151 |
| Its response is checked by `validateOutput(...)` with the system prompt and 5 allowed topics | runner.js:153 |
| An output-layer catch re-labels the result as `blocked` | runner.js:155-157 |

## The defense layer — `src/defense.js`

| Fact | Citation |
|---|---|
| `function defend(userInput, options)` — the single public pipeline entry | defense.js:553 |
| Defaults `blockThreshold = 0.5`, `warnThreshold = 0.3` | defense.js:555 |
| Layer 1 call: `scanInput(userInput)` | defense.js:558 |
| Picks the single highest-confidence detection | defense.js:561-566 |
| `latencyMs` measured with `performance.now()` around the whole check | defense.js:554, :568 |
| No detection → `{ blocked:false, action:'allow', category:'clean' }` | defense.js:570-578 |
| `blocked = topDetection.confidence >= blockThreshold` | defense.js:581 |
| `action = blocked ? 'block' : conf >= warnThreshold ? 'warn' : 'allow'` | defense.js:582 |
| `function scanInput(input)` | defense.js:231 |
| `function normalizeInput(input)` — zero-width strip, emoji strip, Cyrillic homoglyph map, whitespace collapse | defense.js:338, :341, :344, :351, :360 |
| `function scanDecodedContent(decoded)` — 7 patterns applied to decoded payloads | defense.js:369, :370-378 |
| `function validateOutput(output, systemPrompt, allowedTopics)` | defense.js:406 |
| `function detectSystemPromptLeak(...)` — exact substring, then 5-word n-gram overlap > 30% | defense.js:475, :481, :495 |
| `function buildSandwichedPrompt(systemPrompt, userInput)` | defense.js:510 |
| `CANARY_TOKEN = '[[CANARY::xK9mP2qR7vL4]]'` | defense.js:18 |
| Module exports the pipeline plus all 5 pattern arrays | defense.js:658-673 |

### Pattern inventory — counted from source, not from the README

| Array | Declared | Regex literals |
|---|---|---|
| `DIRECT_OVERRIDE_PATTERNS` | defense.js:25 | 37 (defense.js:26-71) |
| `ROLE_HIJACKING_PATTERNS` | defense.js:75 | 33 (defense.js:76-113) |
| `EXTRACTION_PATTERNS` | defense.js:117 | 36 (defense.js:118-156) |
| `ENCODING_PATTERNS` | defense.js:160 | 21 (defense.js:161-186) |
| `INDIRECT_INJECTION_PATTERNS` | defense.js:190 | 29 (defense.js:191-224) |
| **Total** | | **156** |

---

### INVARIANT CARD 1 — `scanInput()`: 9 checks, complete, in code order

Five weighted regex categories run first in a single loop, then four standalone
heuristics append their own detections. Nothing short-circuits: **every check
runs on every input**, and `defend()` afterwards keeps only the maximum.

| # | Check | Weight / confidence | Citation |
|---|---|---|---|
| 1 | `direct_override` | weight 1.0 | defense.js:236 |
| 2 | `role_hijacking` | weight 1.0 | defense.js:237 |
| 3 | `extraction` | weight 0.95 | defense.js:238 |
| 4 | `encoding` | weight 0.95 | defense.js:239 |
| 5 | `indirect_injection` | weight 1.0 | defense.js:240 |
| 6 | `context_flooding` — len > 2000 **and** > 20 newlines | fixed 0.40 | defense.js:267, :269, :270 |
| 7 | zero-width characters > 3 → category `encoding` | fixed 0.70 | defense.js:278, :281 |
| 8 | base64 run ≥ 20 chars: decode, then re-scan the **content** | fixed 0.85 | defense.js:288, :294, :298 |
| 9 | hex byte-pairs ≥ 6: decode, then re-scan the content | fixed 0.85 | defense.js:310, :317, :320 |

Category confidence is `min(1.0, (0.65 + 0.15 × (matches − 1)) × weight)` —
base 0.65 defense.js:254, +0.15 per extra match defense.js:255, combined and
capped defense.js:256, :259. Both the raw and the normalized string are tested
against every pattern (defense.js:246). Loop bounds: defense.js:243, return
defense.js:331.

### INVARIANT CARD 2 — the three layers, complete, in call order

| Layer | Function | What it does | Citation |
|---|---|---|---|
| L1 input | `defend()` → `scanInput()` | block at conf ≥ 0.5, warn at ≥ 0.3, else allow | defense.js:553, :558, :581, :582 |
| — | (runner) | a blocked input **never reaches the target**: the e2e branch is guarded by `!defenseResult.blocked` | runner.js:151 |
| L2 prompt | `buildSandwichedPrompt()` | system block, `[USER INPUT START/END]` untrusted markers, closing `[SYSTEM REMINDER]` block, canary embedded | defense.js:510, :512, :516, :518, :520, :514 |
| L3 output | `validateOutput()` | 5 violation checks (below), `safe = violations.length === 0` | defense.js:406, :467 |

`validateOutput()`'s five checks, complete and in code order:

| # | Violation type | Severity | Citation |
|---|---|---|---|
| 1 | `canary_leak` — literal `CANARY_TOKEN` in output | critical | defense.js:410, :412 |
| 2 | `system_prompt_leak` — exact substring or > 30% 5-gram overlap | critical | defense.js:419, :421, :475 |
| 3 | `pii_leak` — 5 PII regexes: email, phone, ssn, creditCard, apiKey | high | defense.js:428, :432, :390-396 |
| 4 | `injection_success_marker` — `PWNED`, `INJECTION SUCCESSFUL`, `ACCESS GRANTED`, `ROOT ACCESS GRANTED` | critical | defense.js:441, :445 |
| 5 | `topic_drift` — no allowed topic present and output > 50 chars | medium | defense.js:453, :456, :458 |

### INVARIANT CARD 3 — the grade is gated on held-out only

This is the project's whole thesis, and it is enforced in code, not in prose.

| Fact | Citation |
|---|---|
| Training (59) and held-out (29) run through the **same** `runDataset` closure and the same `defend()` | runner.js:135, :138, :176, :177 |
| `bySource` counters are kept separate from first count to final report | runner.js:206-209, :222-225, :250-253 |
| The scorer re-exposes the split rather than merging it | scorer.js:59, :60, :102-113 |
| `grade: computeGrade(heldOutDetectionRate, falsePositiveRate, avgLatency)` — the **held-out** rate is the argument, not the combined one | scorer.js:130 |
| `computeGrade` scoring bands: detection 0-50, false positives 0-30, latency 0-20 | scorer.js:138, :142-146, :149-153, :156-160 |
| Letter thresholds A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, else F | scorer.js:162-166 |
| Verdict gates printed by the runner: held-out ≥ 70%, FP < 5%, avg latency < 100ms | runner.js:362-364, :368, :369, :370 |
| The combined rate is printed but explicitly labelled as not a standalone claim | runner.js:351 |

Observed on an actual run (`node src/runner.js`, 2026-08-24): 88 attacks, 84
blocked, 0 partial, 4 gaps — training 100.0% (59/59), held-out 86.2% (25/29),
0 false positives on 50 legitimate queries, 0.25 ms average latency. These are
outputs, not source lines; they are drawn on the card labelled as an observed
run, and the formulas that produce them are cited above.

---

## Artifacts written

**None.** Unlike `03-agent-harness`, this project writes no file: every output
goes to stdout via `console.log`.

| Output | Written by | Citation |
|---|---|---|
| Per-category + gap + false-positive + verdict block | `printResults()` | runner.js:283, :368-370 |
| Security score report with letter grade | `printScoreReport()` | scorer.js:182, :189 |
| Machine-readable dump (`--json`) | runner `main()` | runner.js:274-275 |

`p95` / `max` latency are computed by `percentile()` (scorer.js:172) and printed
in the same report.

## README claims that did not verify

1. **The README's ASCII labels Layer 1 "Regex patterns (5 attack classes)"** and
   stops there. The regex loop is 5 of **9** checks in `scanInput` — four
   standalone heuristics (context flooding, zero-width, base64 decode-and-rescan,
   hex decode-and-rescan) append detections after the loop and are invisible in
   the ASCII. Counted: defense.js:267, :278, :288, :310. The diagram draws all 9.
2. **The README's ASCII draws Layer 2 as "LLM + SANDWICH DEFENSE"**, implying the
   sandwiched prompt is what the target receives. In code the two are never
   joined: `buildSandwichedPrompt` is only ever called from the demo
   (demo.js:89), while `simulateNaiveLLM` receives the **raw** `attack.prompt`
   (runner.js:152). The diagram draws L2 as a demonstrated-but-unwired layer and
   labels the edge accordingly. This is the single most load-bearing correction
   on this page.

## Folded into one box (to hold the 6-12 component-box rule)

The page draws **12 component boxes**. Three pairs were folded; each fold keeps
both citations on the surviving box, so nothing became untraceable.

| Folded | Into | Why it is legitimate |
|---|---|---|
| `scanInput()` (defense.js:231) | the L1 `defend()` box | `scanInput` is only ever called from `defend` (defense.js:558) — it is not a separate address in the system, and its full anatomy is the subject of invariant card 1 |
| `computeGrade()` (scorer.js:138) | the `calculateScores()` box | `computeGrade` is called only from inside `calculateScores` (scorer.js:130), same module, same file |
| `printResults()` (runner.js:283) + `printScoreReport()` (scorer.js:182) | one "stdout report" box | same destination (stdout), same phase; the split is a module boundary, not an architectural one |

## Deliberately NOT drawn (L1 scope discipline)

- The 156 individual regexes — L2 detail; the diagram carries their **counts and
  category weights**, which is the L1-relevant fact.
- `simulateNaiveLLM`'s six-branch decision tree (runner.js:79-99) — L2.
- `normalizeInput`'s four normalization steps and the 12-entry homoglyph map
  (defense.js:341-361) — folded into one box, enumerated here only.
- The 4 held-out attacks that still get through; they are data, documented
  in `held-out.json`, not architecture.
- `printResults` / `printScoreReport` formatting internals (`makeBar`,
  `padRight` — scorer.js:272, :277).

## Portability notes — rules that needed bending for this domain

Third codebase for this harness; recorded because "rules bent per new domain" is
the portability metric.

1. **`component.artifact` had no true referent.** This project persists nothing —
   its deliverable is stdout. The token was reused for the two *print* functions,
   which is a stretch: they are emitters, not durable artifacts. A
   `component.report` or `component.stdout` token would be honest.
2. **`component.mock` vs `component.external`** cut differently here than in
   `03-agent-harness`. There the mock was fake *data standing in for a network*;
   here the mock is a fake *LLM* (`component.agent` + a SIMULATED label was used,
   because it occupies the agent's structural position), while the JSON corpora
   are real files read from disk and took `component.external`.
   `component.mock` went to `LEGITIMATE_QUERIES`, an in-code control set.
3. **`boundary.observability` labels a zone that writes nothing.** Kept, because
   the semantic role — "where the run becomes visible" — is exactly right even
   though nothing is persisted. The token name over-promises durability.
4. **No `edge.data_out` token exists.** Corpora → runner used `edge.data_in`;
   the reverse direction (results → stdout) had to borrow `edge.artifact`.
