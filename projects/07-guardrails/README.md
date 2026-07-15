# Project 07: Prompt Injection Test Suite + Defense Layer

A security testing framework for LLM applications. Includes 59 prompt injection attacks across 5 categories and a layered defense system that detects and blocks them.

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

### Attack Suite (59 attacks, 5 categories)

| Category | Count | Description |
|----------|-------|-------------|
| Direct Override | 12 | "Ignore previous instructions", system override claims |
| Indirect Injection | 11 | Hidden instructions in resumes, tickets, emails, code |
| Role Hijacking | 12 | DAN, personas, sudo mode, roleplay escapes |
| Extraction | 12 | System prompt, API keys, config extraction |
| Encoding | 12 | Base64, ROT13, Unicode homoglyphs, leetspeak, zero-width |

### Defense Layer (3 layers)

1. **Input Sanitizer** — regex patterns + heuristics across all 5 attack categories, Unicode normalization, base64 auto-decode, zero-width character detection
2. **Output Validator** — system prompt leak detection (exact + n-gram fuzzy), PII regex (email, phone, SSN, credit card, API keys), injection success markers, topic drift
3. **Canary Token** — a unique string embedded in the system prompt; if it appears in output, the prompt was leaked

### Sandwich Defense

User input is bracketed between system instructions with explicit boundary markers and a reminder block, making it harder for injected text to override the system prompt.

## Scoring

The scorer produces a letter grade (A-F) based on three targets:

- Detection rate >= 90%
- False positive rate < 5% (tested against 50 legitimate customer support queries)
- Average latency < 100ms per check

## File Structure

```
src/
  attacks/
    directOverride.json     # 12 direct instruction override attempts
    indirectInjection.json  # 11 hidden instruction attacks
    roleHijacking.json      # 12 role manipulation attacks
    extraction.json         # 12 system prompt extraction attempts
    encoding.json           # 12 encoding-based bypass attempts
  defense.js                # Layered defense (input + output + canary)
  runner.js                 # Test runner — executes all attacks
  scorer.js                 # Detection rate and false positive calculation
  demo.js                   # Full demo with examples and report
```

## Key Learnings

- **Regex catches the obvious attacks** but fails against creative rephrasing. "Ignore previous instructions" has infinite variants.
- **Unicode normalization is essential** — Cyrillic homoglyphs, zero-width characters, and emoji interleaving bypass naive string matching.
- **Base64 auto-decode** catches a common bypass where attackers encode instructions and ask the model to decode them.
- **False positives are the real enemy** — "Can you help me draft instructions for my team?" must not be blocked, even though it contains the word "instructions."
- **Defense-in-depth works** — no single layer catches everything, but three layers together achieve 90%+ detection.
- **Output validation is the last line** — if an attack bypasses input scanning, checking the response for leaked prompts, PII, or known markers catches it.
