/**
 * Demo: RAG Eval Harness in action.
 *
 * Shows three scenarios:
 *   1. Perfect RAG — echoes expected answers (baseline)
 *   2. Degraded RAG — introduces hallucinations and omissions
 *   3. Regression detection — compares degraded vs perfect baseline
 *
 * Run: node src/demo.js
 * Uses mock judge by default. Set GEMINI_API_KEY for real LLM judge.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createMockJudge, createJudge } from './evaluator.js';
import { loadBaseline, saveBaseline, detectRegressions, formatRegressionDetails } from './regression.js';
import { generateReport, writeReport } from './reporter.js';
import { DIMENSIONS } from './dimensions.js';
import { runEval } from './runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const GOLDEN_SET_PATH = join(ROOT, 'data', 'golden-set.json');
const BASELINE_PATH = join(ROOT, 'baselines', 'demo-baseline.json');

const goldenSet = JSON.parse(readFileSync(GOLDEN_SET_PATH, 'utf-8'));

// ─── Mock RAG Systems ───────────────────────────────────────────────

/**
 * Perfect RAG: returns the expected answer verbatim.
 * This is the best possible score — useful as a baseline.
 */
function createPerfectRAG() {
  const lookup = {};
  for (const q of goldenSet.questions) {
    lookup[q.question] = q.expected_answer;
  }

  return async (question) => ({
    answer: lookup[question] || 'I do not know.',
    sourceContent: lookup[question] || '',
  });
}

/**
 * Degraded RAG: simulates common RAG failure modes.
 *  - Some answers have wrong facts (hallucination)
 *  - Some answers are incomplete (missing key points)
 *  - Some answers are off-topic (relevance failure)
 */
function createDegradedRAG() {
  const lookup = {};
  for (const q of goldenSet.questions) {
    lookup[q.question] = q.expected_answer;
  }

  return async (question) => {
    const expected = lookup[question];
    if (!expected) {
      return { answer: 'I do not have information about that.', sourceContent: '' };
    }

    // Deterministic degradation based on question hash
    const hash = simpleHash(question);
    const degradationType = hash % 4;

    switch (degradationType) {
      case 0:
        // Hallucination: change key numbers/facts
        return {
          answer: introduceHallucination(expected),
          sourceContent: expected,
        };
      case 1:
        // Incomplete: return only first half of answer
        return {
          answer: expected.split('. ').slice(0, Math.ceil(expected.split('. ').length / 2)).join('. ') + '.',
          sourceContent: expected,
        };
      case 2:
        // Off-topic: return a vague non-answer
        return {
          answer: 'Thank you for your question. TechCorp is committed to providing excellent service. Please contact our support team for more specific information about your query.',
          sourceContent: expected,
        };
      default:
        // Perfect answer (some questions should still pass)
        return { answer: expected, sourceContent: expected };
    }
  };
}

/**
 * Introduce factual errors into an answer.
 */
function introduceHallucination(answer) {
  return answer
    .replace(/30-day/g, '90-day')
    .replace(/99\.9%/g, '99.999%')
    .replace(/100MB/g, '1GB')
    .replace(/72 hours/g, '7 days')
    .replace(/AES-256/g, 'AES-128')
    .replace(/\$49/g, '$99');
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ─── Demo Runner ────────────────────────────────────────────────────

async function runDemo() {
  const useLLM = !!process.env.GEMINI_API_KEY;

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║        RAG Eval Harness — Demo               ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`Judge mode: ${useLLM ? 'Gemini LLM (real scoring)' : 'Mock (heuristic scoring)'}`);
  console.log(`Golden set: ${goldenSet.questions.length} questions, v${goldenSet.version}`);
  console.log('');

  // ── Step 1: Show the evaluation dimensions ──
  console.log('=== Evaluation Dimensions ===');
  for (const dim of DIMENSIONS) {
    console.log(`  ${dim.name}: ${dim.description}`);
  }
  console.log('');

  // ── Step 2: Run Perfect RAG as baseline ──
  console.log('=== Step 1: Establish Baseline (Perfect RAG) ===');
  console.log('Running perfect RAG system that returns expected answers...');
  console.log('');

  const baselineResult = await runEval({
    ragSystem: createPerfectRAG(),
    ragSystemName: 'Perfect RAG (Echo)',
    useMock: !useLLM,
    saveAsBaseline: true,
    ciMode: false,
    apiKey: process.env.GEMINI_API_KEY,
  });

  console.log('\n');

  // ── Step 3: Run Degraded RAG and detect regressions ──
  console.log('=== Step 2: Test Degraded RAG (Detect Regressions) ===');
  console.log('Running degraded RAG with hallucinations, incomplete answers, and off-topic responses...');
  console.log('');

  const degradedResult = await runEval({
    ragSystem: createDegradedRAG(),
    ragSystemName: 'Degraded RAG (Simulated Failures)',
    useMock: !useLLM,
    saveAsBaseline: false,
    ciMode: false,
    apiKey: process.env.GEMINI_API_KEY,
  });

  // ── Step 4: Show what the harness caught ──
  console.log('\n');
  console.log('=== What the Harness Caught ===');
  console.log('');

  if (degradedResult.regressionReport.regressions.length > 0) {
    console.log(`REGRESSIONS DETECTED: ${degradedResult.regressionReport.regressions.length} question(s)`);
    for (const reg of degradedResult.regressionReport.regressions) {
      console.log(`  ${reg.id}: ${reg.question.slice(0, 60)}...`);
      for (const [dim, diff] of Object.entries(reg.diffs)) {
        if (diff.diff < 0) {
          console.log(`    ${dim}: ${diff.baseline} -> ${diff.current} (${diff.diff})`);
        }
      }
    }
  } else {
    console.log('No regressions detected (mock heuristics may not catch all issues).');
    console.log('Set GEMINI_API_KEY to use the real LLM judge for better detection.');
  }

  console.log('\n');
  console.log('=== Demo Complete ===');
  console.log(`Reports saved to: ${ROOT}/reports/`);
  console.log('');
  console.log('Key takeaways:');
  console.log('  1. The LLM judge scores each answer on faithfulness, relevance, and completeness');
  console.log('  2. Regression detection compares current run against a saved baseline');
  console.log('  3. CI mode (--ci) exits with code 1 when regressions are found');
  console.log('  4. The real power is in the rubric prompts — see src/dimensions.js');
}

runDemo().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
