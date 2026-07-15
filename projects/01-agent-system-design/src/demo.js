#!/usr/bin/env node
// ─── Demo Runner ─────────────────────────────────────────────────────────────
// Runs the PR Review Agent in demo mode with mock data and a simulated LLM.
// No API keys required — demonstrates the full ReAct loop end-to-end.
//
// Usage: node src/demo.js

import { runReActLoop } from './agent.js';
import { createTools } from './tools.js';
import { MOCK_PR_DATA } from './mock-data.js';

// ─── Simulated LLM ──────────────────────────────────────────────────────────
// Pre-scripted responses that walk through the ReAct loop realistically.
// Each call returns the next response in sequence.

function createMockLLM() {
  const responses = [
    // Step 1: Fetch PR metadata
    `THOUGHT: I need to start by understanding what this PR is about. Let me fetch the PR metadata first.
ACTION: fetchPR
ACTION_INPUT: {}`,

    // Step 2: Fetch the diff
    `THOUGHT: This PR adds user authentication — a security-critical area. 5 files changed with 187 additions. I need to see the diff to understand what was added.
ACTION: fetchDiff
ACTION_INPUT: {}`,

    // Step 3: Read the auth controller (the most critical file)
    `THOUGHT: The diff reveals several concerning patterns:
1. A hardcoded JWT secret ('super-secret-key-12345') in src/controllers/auth.js
2. Plain text password comparison (password === user.password) — no hashing
3. The validateToken middleware doesn't check if the Authorization header exists before splitting
4. No input validation on email/password in login or register
5. No rate limiting despite the PR description claiming it

Let me fetch the full auth controller to see the complete context.
ACTION: fetchFile
ACTION_INPUT: {"path": "src/controllers/auth.js"}`,

    // Step 4: Search for password hashing
    `THOUGHT: Confirmed — the full file shows plaintext password comparison and storage. Let me search for any bcrypt or hashing usage in the codebase to see if this is handled elsewhere.
ACTION: searchCode
ACTION_INPUT: {"query": "bcrypt"}`,

    // Step 5: Search for rate limiting
    `THOUGHT: No bcrypt anywhere in the codebase. The passwords are stored and compared in plaintext — this is a critical security vulnerability. Let me also check if rate limiting exists anywhere.
ACTION: searchCode
ACTION_INPUT: {"query": "rateLimit"}`,

    // Step 6: Check the user model
    `THOUGHT: No rate limiting either, despite the PR description claiming it's included. Let me check the User model to see if there's any pre-save hook for password hashing.
ACTION: fetchFile
ACTION_INPUT: {"path": "src/models/user.js"}`,

    // Step 7: Check the test file
    `THOUGHT: The User model has no pre-save hook, no password hashing, and no email validation. The password is stored as a plain string. Let me check the tests to see if they at least test the right things.
ACTION: fetchFile
ACTION_INPUT: {"path": "tests/auth.test.js"}`,

    // Step 8: Final — produce findings
    `THOUGHT: I've reviewed all the key files. The tests only test JWT generation/verification — they don't test the actual auth flow, password handling, or error cases. They also hardcode the same secret that's in the controller.

Here are my findings, ordered by severity:
1. CRITICAL: Hardcoded JWT secret — this should come from an environment variable
2. CRITICAL: Plaintext password storage and comparison — needs bcrypt
3. BUG: validateToken crashes if Authorization header is missing (no null check before .split)
4. SECURITY: No input validation — can register with empty password or invalid email
5. BUG: getProfile returns null user without error handling if user is deleted
6. MISSING: PR claims rate limiting but none is implemented
7. TEST: Tests hardcode the secret and only test JWT, not the auth flow
8. NIT: Role is included in login JWT but not in register JWT — inconsistent

FINISH:
{
  "findings": [
    {
      "file": "src/controllers/auth.js",
      "line": 4,
      "severity": "security",
      "category": "security",
      "issue": "JWT secret is hardcoded as 'super-secret-key-12345'. This will be committed to version control and is trivially guessable. Any attacker can forge valid JWTs.",
      "suggestion": "Use an environment variable: const JWT_SECRET = process.env.JWT_SECRET; and validate it exists at startup. Add JWT_SECRET to .env.example with a placeholder.",
      "groupedFiles": ["tests/auth.test.js:3"]
    },
    {
      "file": "src/controllers/auth.js",
      "line": 15,
      "severity": "bug",
      "category": "security",
      "issue": "Passwords are compared in plaintext (password === user.password). The User model stores passwords as raw strings with no hashing. This means passwords are visible in the database, in logs, and in any backup.",
      "suggestion": "Use bcrypt: In the User model, add a pre-save hook to hash passwords with bcrypt.hash(password, 12). In login, use bcrypt.compare(password, user.password) instead of ===."
    },
    {
      "file": "src/controllers/auth.js",
      "line": 55,
      "severity": "bug",
      "category": "null_reference",
      "issue": "validateToken calls header.split(' ')[1] without checking if the Authorization header exists. If no header is sent, this throws 'Cannot read property split of undefined' — a 500 error instead of a 401.",
      "suggestion": "Add a guard: if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing or malformed Authorization header' });"
    },
    {
      "file": "src/controllers/auth.js",
      "line": 8,
      "severity": "bug",
      "category": "error_handling",
      "issue": "No input validation on login or register. A request with missing email/password fields will cause User.findOne({ email: undefined }) which may return unexpected results. Empty passwords would be accepted.",
      "suggestion": "Add validation at the top of each handler: if (!email || !password) return res.status(400).json({ error: 'Email and password are required' }); Consider using a validation library like zod or joi for email format checking."
    },
    {
      "file": "src/controllers/auth.js",
      "line": 49,
      "severity": "bug",
      "category": "error_handling",
      "issue": "getProfile does not handle the case where User.findById returns null (user was deleted after JWT was issued). It will return { user: null } with a 200 status.",
      "suggestion": "Add: if (!user) return res.status(404).json({ error: 'User not found' });"
    },
    {
      "file": "src/routes/auth.js",
      "line": 0,
      "severity": "suggestion",
      "category": "security",
      "issue": "PR description says 'Rate limiting on auth endpoints' but no rate limiting middleware is applied to any route. Auth endpoints are prime targets for brute-force attacks.",
      "suggestion": "Add rate limiting middleware: import rateLimit from 'express-rate-limit'; const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 10 }); router.post('/login', authLimiter, login);"
    },
    {
      "file": "tests/auth.test.js",
      "line": 0,
      "severity": "suggestion",
      "category": "missing_test",
      "issue": "Tests only verify JWT sign/verify — they don't test the actual login, register, or validateToken handlers. No test for: invalid credentials, missing fields, duplicate registration, expired tokens in middleware, or missing auth header.",
      "suggestion": "Add integration tests using supertest that hit the actual endpoints. Test: successful login, wrong password, missing email, duplicate register, request without auth header, request with expired token."
    },
    {
      "file": "src/controllers/auth.js",
      "line": 17,
      "severity": "nit",
      "category": "design",
      "issue": "Login JWT includes the user's role, but register JWT does not. This means a freshly registered user's token lacks role information, which could cause authorization issues downstream.",
      "suggestion": "Include role in the register JWT payload: { userId: user._id, email: user.email, role: user.role }"
    }
  ],
  "summary": "This PR has critical security vulnerabilities that MUST be fixed before merging: hardcoded JWT secret, plaintext password storage, and a null-reference crash in the auth middleware. Additionally, the PR description claims rate limiting but none is implemented. The test coverage only verifies JWT library behavior, not the actual authentication logic. Recommend blocking this PR until the security issues are resolved.",
  "filesReviewed": [
    "src/controllers/auth.js",
    "src/models/user.js",
    "src/routes/auth.js",
    "tests/auth.test.js",
    "src/app.js"
  ],
  "filesSkipped": []
}`,
  ];

  let callIndex = 0;
  return async function mockLLM(_messages) {
    // Simulate a small delay like a real API call
    await new Promise((r) => setTimeout(r, 100));
    const response = responses[callIndex] || responses[responses.length - 1];
    callIndex++;
    return response;
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(70));
  console.log('  PR Review Agent — Demo Mode');
  console.log('  ReAct Loop with Mock LLM and Sample PR Data');
  console.log('='.repeat(70));
  console.log();
  console.log('PR: feat: add user authentication endpoint');
  console.log('Author: junior-dev | Files: 5 | +187 / -12');
  console.log('-'.repeat(70));

  const tools = createTools();
  const mockLLM = createMockLLM();

  const result = await runReActLoop({
    llmCall: mockLLM,
    tools,
    toolContext: {
      owner: 'demo',
      repo: 'sample-app',
      number: 42,
      mockData: MOCK_PR_DATA,
    },
    config: {
      maxIterations: 15,
      verbose: true,
    },
  });

  // ── Print Results ──
  console.log('\n' + '='.repeat(70));
  console.log('  REVIEW COMPLETE');
  console.log('='.repeat(70));
  console.log();
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Est. tokens: ~${result.tokenEstimate.toLocaleString()}`);
  console.log(`Findings: ${result.output.findings.length}`);
  console.log(`Files reviewed: ${result.output.filesReviewed.join(', ')}`);
  console.log();

  // Print each finding
  for (const [i, f] of result.output.findings.entries()) {
    const severity = f.severity.toUpperCase().padEnd(10);
    const location = f.line > 0 ? `${f.file}:${f.line}` : f.file;
    console.log(`${i + 1}. [${severity}] ${location}`);
    console.log(`   Category: ${f.category}`);
    console.log(`   Issue: ${f.issue}`);
    console.log(`   Fix: ${f.suggestion}`);
    if (f.groupedFiles?.length) {
      console.log(`   Also in: ${f.groupedFiles.join(', ')}`);
    }
    console.log();
  }

  // Print summary
  console.log('-'.repeat(70));
  console.log('SUMMARY:');
  console.log(result.output.summary);
  console.log();

  // Print structured JSON output
  console.log('-'.repeat(70));
  console.log('STRUCTURED OUTPUT (JSON):');
  console.log(JSON.stringify(result.output, null, 2));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
