/**
 * Eval runner: orchestrates the full pipeline.
 *
 * golden-set.json → RAG system → LLM judge → regression check → report
 *
 * Usage:
 *   node src/runner.js                  # Interactive run with report
 *   node src/runner.js --ci             # CI mode: exits 1 on regressions
 *   node src/runner.js --save-baseline  # Save this run as the new baseline
 *   node src/runner.js --mock           # Use mock judge (no API calls)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createJudge, createMockJudge } from './evaluator.js';
import { loadBaseline, saveBaseline, detectRegressions } from './regression.js';
import { generateReport, writeReport } from './reporter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const GOLDEN_SET_PATH = join(ROOT, 'data', 'golden-set.json');
const BASELINE_PATH = join(ROOT, 'baselines', 'baseline.json');
const REPORT_PATH = join(ROOT, 'reports');

/**
 * Run the full eval pipeline.
 *
 * @param {Object} options
 * @param {Function} options.ragSystem - async (question) => { answer, sourceContent }
 * @param {string}   options.ragSystemName - Name for reporting
 * @param {boolean}  options.useMock - Use mock judge instead of real LLM
 * @param {boolean}  options.saveAsBaseline - Save results as new baseline
 * @param {boolean}  options.ciMode - Exit with code 1 on regressions
 * @param {string}   options.apiKey - Gemini API key (required if not mock)
 */
export async function runEval(options) {
  const {
    ragSystem,
    ragSystemName = 'Unknown RAG System',
    useMock = false,
    saveAsBaseline = false,
    ciMode = false,
    apiKey,
  } = options;

  const startTime = Date.now();
  console.log(`\n=== RAG Eval Harness ===`);
  console.log(`RAG System: ${ragSystemName}`);
  console.log(`Judge: ${useMock ? 'Mock (heuristic)' : 'Gemini LLM'}`);
  console.log('');

  // 1. Load golden dataset
  const goldenSet = JSON.parse(readFileSync(GOLDEN_SET_PATH, 'utf-8'));
  console.log(`Loaded ${goldenSet.questions.length} questions from golden set v${goldenSet.version}`);

  // 2. Create judge
  const judge = useMock ? createMockJudge() : createJudge(apiKey);

  // 3. Run each question through the RAG system and evaluate
  const questionResults = [];
  let completed = 0;

  for (const q of goldenSet.questions) {
    completed++;
    process.stdout.write(`\rEvaluating: ${completed}/${goldenSet.questions.length} — ${q.id}`);

    try {
      // Get RAG system's response
      const ragResponse = await ragSystem(q.question);

      // Build source content string from the golden set's source docs
      // (In a real system, this would come from the actual retrieved docs)
      const sourceContent = ragResponse.sourceContent
        || `Source documents: ${q.source_documents.join(', ')}\n\nExpected content:\n${q.expected_answer}`;

      // Evaluate with the judge
      const scores = await judge.evaluate({
        question: q.question,
        answer: ragResponse.answer,
        expectedAnswer: q.expected_answer,
        sourceContent,
        keyPoints: q.key_points,
      });

      questionResults.push({
        id: q.id,
        question: q.question,
        difficulty: q.difficulty,
        category: q.category,
        ragAnswer: ragResponse.answer,
        expectedAnswer: q.expected_answer,
        scores,
      });
    } catch (err) {
      console.error(`\nError evaluating ${q.id}: ${err.message}`);
      questionResults.push({
        id: q.id,
        question: q.question,
        difficulty: q.difficulty,
        category: q.category,
        ragAnswer: '',
        expectedAnswer: q.expected_answer,
        scores: {
          faithfulness: { score: 0, justification: `Error: ${err.message}`, parseError: true },
          relevance: { score: 0, justification: `Error: ${err.message}`, parseError: true },
          completeness: { score: 0, justification: `Error: ${err.message}`, parseError: true },
          composite: 0,
        },
        error: err.message,
      });
    }
  }

  console.log('\n');

  // 4. Compute aggregate metrics
  const aggregate = computeAggregate(questionResults);

  const results = {
    version: goldenSet.version,
    questions: questionResults,
    aggregate,
  };

  // 5. Load baseline and detect regressions
  const baseline = loadBaseline(BASELINE_PATH);
  const regressionReport = detectRegressions(results, baseline);

  // 6. Generate report
  const durationMs = Date.now() - startTime;
  const meta = {
    timestamp: new Date().toISOString(),
    ragSystem: ragSystemName,
    goldenSetVersion: goldenSet.version,
    durationMs,
  };

  const report = generateReport({ results, regression: regressionReport, meta });

  // Write report
  const { mkdirSync, existsSync } = await import('fs');
  if (!existsSync(REPORT_PATH)) {
    mkdirSync(REPORT_PATH, { recursive: true });
  }
  const reportFile = join(REPORT_PATH, `eval-${Date.now()}.md`);
  writeReport(reportFile, report);
  console.log(`Report written to: ${reportFile}`);

  // 7. Save baseline if requested or if first run
  if (saveAsBaseline || !baseline) {
    saveBaseline(BASELINE_PATH, results);
    console.log(`Baseline saved to: ${BASELINE_PATH}`);
  }

  // 8. Print summary
  console.log('\n--- Summary ---');
  console.log(`Faithfulness: ${aggregate.faithfulness.toFixed(2)}/5`);
  console.log(`Relevance:    ${aggregate.relevance.toFixed(2)}/5`);
  console.log(`Completeness: ${aggregate.completeness.toFixed(2)}/5`);
  console.log(`Composite:    ${aggregate.composite.toFixed(2)}/5`);
  console.log('');
  console.log(`Regression: ${regressionReport.summary}`);
  console.log(`Verdict: ${regressionReport.hasRegressions ? 'FAIL' : 'PASS'}`);

  // 9. CI exit code
  if (ciMode && regressionReport.hasRegressions) {
    console.error('\nCI FAILURE: Regressions detected. See report for details.');
    process.exit(1);
  }

  return { results, regressionReport, report, reportFile };
}

/**
 * Compute aggregate scores across all questions.
 */
function computeAggregate(questions) {
  const dims = ['faithfulness', 'relevance', 'completeness'];
  const totals = { faithfulness: 0, relevance: 0, completeness: 0, composite: 0 };
  let validCount = 0;

  for (const q of questions) {
    if (q.scores.faithfulness?.parseError && q.scores.relevance?.parseError) continue;
    validCount++;
    for (const dim of dims) {
      totals[dim] += q.scores[dim]?.score ?? 0;
    }
    totals.composite += q.scores.composite ?? 0;
  }

  if (validCount === 0) return { faithfulness: 0, relevance: 0, completeness: 0, composite: 0 };

  return {
    faithfulness: totals.faithfulness / validCount,
    relevance: totals.relevance / validCount,
    completeness: totals.completeness / validCount,
    composite: totals.composite / validCount,
  };
}

// CLI entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const useMock = args.includes('--mock');
  const ciMode = args.includes('--ci');
  const saveAsBaseline = args.includes('--save-baseline');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!useMock && !apiKey) {
    console.error('Error: Set GEMINI_API_KEY or use --mock flag');
    process.exit(1);
  }

  // Default mock RAG system that echoes the expected answer (for testing the harness itself)
  const goldenSet = JSON.parse(readFileSync(GOLDEN_SET_PATH, 'utf-8'));
  const expectedByQuestion = {};
  for (const q of goldenSet.questions) {
    expectedByQuestion[q.question] = q.expected_answer;
  }

  const echoRag = async (question) => ({
    answer: expectedByQuestion[question] || 'I do not know.',
    sourceContent: expectedByQuestion[question] || '',
  });

  runEval({
    ragSystem: echoRag,
    ragSystemName: 'Echo RAG (returns expected answers)',
    useMock,
    saveAsBaseline,
    ciMode,
    apiKey,
  }).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
