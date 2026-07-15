/**
 * Supervisor Agent — the orchestrator.
 *
 * Responsibilities:
 *   1. Run the pipeline: Researcher -> Writer -> Editor -> Fact-Checker
 *   2. Handle retries: if the Editor rejects, send feedback to the Writer
 *   3. Track cost per agent (tokens * price-per-token)
 *   4. Abort if total cost exceeds budget
 *   5. Produce a final report with each agent's contribution
 *
 * The supervisor does NOT generate content — it coordinates.
 */

import { createMessageBus } from './messageBus.js';
import { runResearcher } from './agents/researcher.js';
import { runWriter } from './agents/writer.js';
import { runEditor } from './agents/editor.js';
import { runFactChecker } from './agents/factChecker.js';

// Pricing (mock): $0.01 per 1K tokens (input+output blended)
const PRICE_PER_1K_TOKENS = 0.01;
const MAX_BUDGET = 2.0; // abort if total cost exceeds $2
const MAX_RETRIES = 2;  // writer gets at most 2 revision attempts

/**
 * Run the full content pipeline.
 * @param {string} topic — the blog post topic
 * @returns {object} final report
 */
export async function runPipeline(topic) {
  console.log('\n====================================================');
  console.log('  MULTI-AGENT CONTENT PIPELINE');
  console.log('====================================================');
  console.log(`Topic: "${topic}"`);
  console.log(`Budget: $${MAX_BUDGET.toFixed(2)}`);
  console.log(`Max writer retries: ${MAX_RETRIES}`);
  console.log('====================================================\n');

  const bus = createMessageBus();
  const costTracker = { researcher: 0, writer: 0, editor: 0, factChecker: 0 };
  const startTime = Date.now();

  // Shared context — all agents contribute to this
  const context = {
    topic,
    research_notes: null,
    drafts: [],          // all draft versions
    edits: [],           // all edit reviews
    fact_checks: null,
    final: '',
  };

  // ─── STEP 1: Research ───
  console.log('\n>> STEP 1: Research');
  const research = await runResearcher(topic);
  context.research_notes = research;
  costTracker.researcher = trackCost(research.tokenUsage);

  bus.publish({
    from: 'Researcher',
    to: 'Supervisor',
    type: 'RESEARCH_NOTES',
    payload: {
      noteCount: research.notes.length,
      sourceCount: research.sources.length,
      subQuestions: research.sub_questions,
    },
  });

  checkBudget(costTracker);

  // ─── STEP 2: Write + Edit Loop ───
  let accepted = false;
  let attempt = 0;
  let currentDraft = '';
  let revisionFeedback = null;

  while (!accepted && attempt <= MAX_RETRIES) {
    attempt++;
    console.log(`\n>> STEP 2.${attempt}: Write (attempt ${attempt})`);

    // Writer produces draft
    const writerResult = await runWriter(research, revisionFeedback, attempt);
    currentDraft = writerResult.draft;
    context.drafts.push({ attempt, draft: currentDraft });
    costTracker.writer += trackCost(writerResult.tokenUsage);

    bus.publish({
      from: 'Writer',
      to: 'Supervisor',
      type: 'DRAFT',
      payload: { attempt, length: currentDraft.length, wordCount: currentDraft.split(/\s+/).length },
    });

    checkBudget(costTracker);

    // Editor reviews
    console.log(`\n>> STEP 2.${attempt}: Edit (review ${attempt})`);
    const editResult = await runEditor(currentDraft, attempt);
    context.edits.push({ attempt, ...editResult });
    costTracker.editor += trackCost(editResult.tokenUsage);

    bus.publish({
      from: 'Editor',
      to: 'Supervisor',
      type: 'EDIT_REVIEW',
      payload: { attempt, verdict: editResult.verdict, score: editResult.score, issueCount: editResult.issues.length },
    });

    checkBudget(costTracker);

    if (editResult.verdict === 'ACCEPT') {
      accepted = true;
      console.log(`\n  >> Supervisor: Draft ACCEPTED on attempt ${attempt} (score: ${editResult.score}/10)`);
    } else if (attempt <= MAX_RETRIES) {
      // Build revision feedback from editor's issues
      revisionFeedback = editResult.issues
        .filter((i) => i.severity === 'major')
        .map((i) => `[${i.location}] ${i.comment}`)
        .join('\n');

      console.log(`\n  >> Supervisor: Draft REJECTED (score: ${editResult.score}/10). Sending revision feedback to Writer.`);

      bus.publish({
        from: 'Supervisor',
        to: 'Writer',
        type: 'REVISION_REQ',
        payload: { attempt, feedback: revisionFeedback },
      });
    } else {
      console.log(`\n  >> Supervisor: Draft REJECTED after ${MAX_RETRIES} retries. Proceeding with best draft.`);
    }
  }

  // ─── STEP 3: Fact-Check ───
  console.log('\n>> STEP 3: Fact-Check');
  const factResult = await runFactChecker(currentDraft, research);
  context.fact_checks = factResult;
  costTracker.factChecker = trackCost(factResult.tokenUsage);

  bus.publish({
    from: 'FactChecker',
    to: 'Supervisor',
    type: 'FACT_CHECK',
    payload: {
      overall: factResult.overall,
      verified: factResult.claims.filter((c) => c.verdict === 'VERIFIED').length,
      unverified: factResult.claims.filter((c) => c.verdict === 'UNVERIFIED').length,
      incorrect: factResult.claims.filter((c) => c.verdict === 'INCORRECT').length,
    },
  });

  checkBudget(costTracker);

  // ─── STEP 4: Final Assembly ───
  console.log('\n>> STEP 4: Final Assembly');
  context.final = currentDraft;

  bus.publish({
    from: 'Supervisor',
    to: 'Output',
    type: 'FINAL',
    payload: { status: 'COMPLETE', draftAttempts: attempt, factCheckResult: factResult.overall },
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalCost = Object.values(costTracker).reduce((a, b) => a + b, 0);

  // ─── Report ───
  const report = {
    topic,
    status: 'COMPLETE',
    draftAttempts: attempt,
    editorAccepted: accepted,
    factCheckPassed: factResult.overall === 'PASS',
    costs: {
      researcher: `$${costTracker.researcher.toFixed(4)}`,
      writer: `$${costTracker.writer.toFixed(4)}`,
      editor: `$${costTracker.editor.toFixed(4)}`,
      factChecker: `$${costTracker.factChecker.toFixed(4)}`,
      total: `$${totalCost.toFixed(4)}`,
      withinBudget: totalCost <= MAX_BUDGET,
    },
    elapsed: `${elapsed}s`,
    messageCount: bus.getLog().length,
  };

  // Print final report
  console.log('\n====================================================');
  console.log('  PIPELINE REPORT');
  console.log('====================================================');
  console.log(`  Topic:           ${report.topic}`);
  console.log(`  Status:          ${report.status}`);
  console.log(`  Draft Attempts:  ${report.draftAttempts}`);
  console.log(`  Editor Accepted: ${report.editorAccepted}`);
  console.log(`  Fact-Check:      ${report.factCheckPassed ? 'PASS' : 'FAIL'}`);
  console.log('  ---- Cost Breakdown ----');
  console.log(`  Researcher:      ${report.costs.researcher}`);
  console.log(`  Writer:          ${report.costs.writer}`);
  console.log(`  Editor:          ${report.costs.editor}`);
  console.log(`  Fact-Checker:    ${report.costs.factChecker}`);
  console.log(`  TOTAL:           ${report.costs.total}`);
  console.log(`  Within Budget:   ${report.costs.withinBudget}`);
  console.log(`  Elapsed:         ${report.elapsed}`);
  console.log(`  Messages:        ${report.messageCount}`);
  console.log('====================================================\n');

  // Show message bus log
  bus.printSummary();

  return { report, context, messageLog: bus.getLog() };
}

// ─── Helpers ───

function trackCost(tokenUsage) {
  return (tokenUsage.total / 1000) * PRICE_PER_1K_TOKENS;
}

function checkBudget(costTracker) {
  const total = Object.values(costTracker).reduce((a, b) => a + b, 0);
  if (total > MAX_BUDGET) {
    throw new Error(
      `BUDGET EXCEEDED: $${total.toFixed(4)} > $${MAX_BUDGET.toFixed(2)}. Pipeline aborted.`
    );
  }
}
