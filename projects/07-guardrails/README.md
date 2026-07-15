# Project 07: Prompt Injection Test Suite + Defense Layer

A security testing framework for LLM applications. Includes 59 training attacks + a 29-attack held-out set of novel paraphrases across 5 categories, and a layered defense system that detects and blocks them.

**Honest numbers, not vanity numbers.** The 59 "training" attacks are the ones `defense.js`'s regex patterns were built and tuned against — of course they hit ~100%. That number alone is meaningless, since it's graded on the same data it was tuned on. `src/attacks/held-out.json` holds a separate set of paraphrased/novel attacks the patterns were never shown, across all 5 categories, including new base64/hex payloads and a novel cipher scheme. The runner and scorer report both numbers separately (`Training: X%, Held-out: Y%`), and the pass/fail verdict and letter grade are gated on the **held-out** rate, not the training rate.

## Quick Start

```bash
# Run the full demo (no dependencies needed)
node src/demo.js

# End-to-end mode (input + simulated LLM + output validation)
node src/demo.js --e2e

# Verbose output (every attack detail)
node src/demo.js --verbose

# Just the test runner
node src/runner.js

# Just the scorer
node src/scorer.js
```

## Architecture

```
User Prompt
    │
    ▼
┌──────────────────────────────────────┐
│ Layer 1: INPUT SANITIZER             │
│  - Regex patterns (5 attack classes) │
│  - Unicode normalization             │
│  - Base64/hex auto-decode            │
│  - Zero-width char detection         │
├──────────────────────────────────────┤
│           BLOCKED? ──> Reject        │
└──────────┬───────────────────────────┘
           │  clean
           ▼
┌──────────────────────────────────────┐
│ Layer 2: LLM + SANDWICH DEFENSE      │
│  ┌────────────────────────────────┐  │
│  │ System prompt (boundary start) │  │
│  │ >>> User input <<<             │  │
│  │ System prompt (boundary end)   │  │
│  │ + Canary token embedded        │  │
│  └────────────────────────────────┘  │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Layer 3: OUTPUT VALIDATOR            │
│  - System prompt leak detection      │
│  - PII regex (email, SSN, keys)      │
│  - Canary token check                │
│  - Injection success markers         │
│  - Topic drift detection             │
├──────────────────────────────────────┤
│           LEAKED? ──> Reject         │
└──────────┬───────────────────────────┘
           │  safe
           ▼
      Safe Output


Testing Split:
┌──────────────────┐     ┌──────────────────┐
│ Training Set     │     │ Held-Out Set     │
│ 59 attacks       │     │ 29 novel attacks │
│ (tuned against)  │     │ (never seen)     │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         ▼                        ▼
┌──────────────────────────────────────────┐
│ Runner + Scorer                          │
│ Reports both rates — grade on held-out   │
└──────────────────────────────────────────┘
```

### Attack Suite

**Training set — 59 attacks, 5 categories** (the regexes were tuned against these):

| Category | Count | Description |
|----------|-------|-------------|
| Direct Override | 12 | "Ignore previous instructions", system override claims |
| Indirect Injection | 11 | Hidden instructions in resumes, tickets, emails, code |
| Role Hijacking | 12 | DAN, personas, sudo mode, roleplay escapes |
| Extraction | 12 | System prompt, API keys, config extraction |
| Encoding | 12 | Base64, ROT13, Unicode homoglyphs, leetspeak, zero-width |

**Held-out set — 29 attacks, 5 categories** (`src/attacks/held-out.json`, paraphrases/novel prompts never used to build the patterns):

| Category | Count | Description |
|----------|-------|-------------|
| Direct Override | 7 | Paraphrased invalidation/supersession language |
| Role Hijacking | 6 | Paraphrased persona-swap and no-restrictions framing |
| Extraction | 6 | Paraphrased setup/configuration extraction questions |
| Encoding | 5 | Novel base64/hex payloads, hyphen-spaced letters, a novel Caesar-shift cipher |
| Indirect Injection | 5 | Paraphrased quoted-source injection ("the document says...", "per the attached file...") |

### Defense Layer (3 layers)

1. **Input Sanitizer** — regex patterns + heuristics across all 5 attack categories, Unicode normalization, base64 auto-decode, zero-width character detection
2. **Output Validator** — system prompt leak detection (exact + n-gram fuzzy), PII regex (email, phone, SSN, credit card, API keys), injection success markers, topic drift
3. **Canary Token** — a unique string embedded in the system prompt; if it appears in output, the prompt was leaked

### Sandwich Defense

User input is bracketed between system instructions with explicit boundary markers and a reminder block, making it harder for injected text to override the system prompt.

## Scoring

The scorer produces a letter grade (A-F) based on three targets, all gated on the **held-out** detection rate (not the training rate, which is inflated by construction):

- Held-out detection rate >= 70%
- False positive rate < 5% (tested against 50 legitimate customer support queries)
- Average latency < 100ms per check

Current numbers as of the last pattern update: **Training 100.0% (59/59), Held-out 86.2% (25/29)**, 0.0% false positives. The 4 held-out misses are documented in `held-out.json` with the specific regex gap that lets each one through — they're intentionally left unfixed so the set keeps measuring something real instead of converging to another 100% that would just mean the patterns got tuned to this file too.

## File Structure

```
src/
  attacks/
    directOverride.json     # 12 direct instruction override attempts (training)
    indirectInjection.json  # 11 hidden instruction attacks (training)
    roleHijacking.json      # 12 role manipulation attacks (training)
    extraction.json         # 12 system prompt extraction attempts (training)
    encoding.json           # 12 encoding-based bypass attempts (training)
    held-out.json           # 29 paraphrased/novel attacks, 5 categories (NOT used to tune defense.js)
  defense.js                # Layered defense (input + output + canary)
  runner.js                 # Test runner — executes training + held-out, reports both separately
  scorer.js                 # Detection rate and false positive calculation, graded on held-out
  demo.js                   # Full demo with examples and report
```

## Key Learnings

- **A detection rate is only as honest as the test set it's measured against.** Regexes hand-tuned to match 59 known attack strings will trivially hit ~100% on those same 59 strings — that's pattern memorization, not detection. The first version of this project reported "100% detection" this way, and 9/10 novel paraphrases sailed straight through. Measuring generalization requires a held-out set the patterns were never shown.
- **Regex catches the obvious attacks** but fails against creative rephrasing. "Ignore previous instructions" has infinite variants — the fix is word-boundary patterns for paraphrase *structures* ("disregard ... told/instructions", invalidation language like "void/superseded", temporal markers like "from now on"/"going forward" combined with override intent) instead of exact-phrase regexes, which generalized training-set patterns from ~32% held-out detection up to ~86%.
- **Unicode normalization is essential** — Cyrillic homoglyphs, zero-width characters, and emoji interleaving bypass naive string matching.
- **Base64/hex auto-decode** catches a common bypass where attackers encode instructions and ask the model to decode them — this needs to decode-and-rescan the *content*, not pattern-match the encoded blob itself, or every new payload needs its own regex.
- **False positives are the real enemy** — "Can you help me draft instructions for my team?" must not be blocked, even though it contains the word "instructions." Generalizing patterns raises this risk; every new pattern was checked against all 50 legitimate queries (still 0.0% false positives after generalization).
- **Defense-in-depth works** — no single layer catches everything, but three layers together push held-out detection well past a regex-only ceiling. That ceiling is real, though: 4/29 held-out attacks still get through with zero literal overlap with the training set, and closing them needs semantic understanding a regex can't provide.
- **Output validation is the last line** — if an attack bypasses input scanning, checking the response for leaked prompts, PII, or known markers catches it.
