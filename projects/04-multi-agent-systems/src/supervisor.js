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
 *
 * Dispatch model: every agent is a *subscriber* on the message bus, keyed
 * by its own channel name. Nothing calls another agent's function
 * directly — the supervisor publishes a request message, the bus routes
 * it to whichever agent subscribed to that channel, and the agent
 * publishes its result to the *next* channel in the pipeline. The
 * supervisor itself is just another subscriber, listening on the
 * 'Supervisor' channel for the messages that require an orchestration
 * decision (accept vs. retry, when to fact-check, when to finish).
 *
 * Flow:
 *   Supervisor  --RESEARCH_REQUEST-->  Researcher
 *   Researcher  --RESEARCH_COMPLETE--> Writer
 *   Writer      --DRAFT_COMPLETE-->    Editor
 *   Editor      --REVIEW_COMPLETE-->   Supervisor  (accept -> fact-check, reject -> revise)
 *   Supervisor  --REVISION_REQ-->      Writer       (retry loop)
 *   Supervisor  --FACT_CHECK_REQUEST-> FactChecker
 *   FactChecker --FACT_CHECK_COMPLETE->Supervisor  (final assembly)
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
export function runPipeline(topic) {
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

  let latestResearch = null;
  let currentDraft = '';

  return new Promise((resolve, reject) => {
    const fail = (err) => {
      console.error('\nPIPELINE ERROR:', err.message);
      reject(err);
    };

    // ─── Researcher subscribes to its own channel ───
    bus.subscribe('Researcher', async (msg) => {
      if (msg.type !== 'RESEARCH_REQUEST') return;
      try {
        console.log('\n>> STEP 1: Research');
        const research = await runResearcher(msg.payload.topic);
        latestResearch = research;
        context.research_notes = research;

        bus.publish({
          from: 'Researcher',
          to: 'Writer',
          type: 'RESEARCH_COMPLETE',
          payload: research,
        });
      } catch (err) {
        fail(err);
      }
    });

    // ─── Writer subscribes to its own channel — handles both the first
    //     RESEARCH_COMPLETE handoff and subsequent REVISION_REQ retries ───
    bus.subscribe('Writer', async (msg) => {
      try {
        if (msg.type === 'RESEARCH_COMPLETE') {
          costTracker.researcher += trackCost(msg.payload.tokenUsage);
          checkBudget(costTracker);

          const attempt = 1;
          console.log(`\n>> STEP 2.${attempt}: Write (attempt ${attempt})`);
          const writerResult = await runWriter(msg.payload, null, attempt);
          currentDraft = writerResult.draft;
          context.drafts.push({ attempt, draft: currentDraft });

          bus.publish({
            from: 'Writer',
            to: 'Editor',
            type: 'DRAFT_COMPLETE',
            payload: { attempt, draft: currentDraft, tokenUsage: writerResult.tokenUsage },
          });
        } else if (msg.type === 'REVISION_REQ') {
          const attempt = msg.payload.attempt + 1;
          console.log(`\n>> STEP 2.${attempt}: Write (attempt ${attempt})`);
          const writerResult = await runWriter(latestResearch, msg.payload.feedback, attempt);
          currentDraft = writerResult.draft;
          context.drafts.push({ attempt, draft: currentDraft });

          bus.publish({
            from: 'Writer',
            to: 'Editor',
            type: 'DRAFT_COMPLETE',
            payload: { attempt, draft: currentDraft, tokenUsage: writerResult.tokenUsage },
          });
        }
      } catch (err) {
        fail(err);
      }
    });

    // ─── Editor subscribes to its own channel ───
    bus.subscribe('Editor', async (msg) => {
      if (msg.type !== 'DRAFT_COMPLETE') return;
      try {
        costTracker.writer += trackCost(msg.payload.tokenUsage);
        checkBudget(costTracker);

        console.log(`\n>> STEP 2.${msg.payload.attempt}: Edit (review ${msg.payload.attempt})`);
        const editResult = await runEditor(msg.payload.draft, msg.payload.attempt);
        context.edits.push({ attempt: msg.payload.attempt, ...editResult });

        bus.publish({
          from: 'Editor',
          to: 'Supervisor',
          type: 'REVIEW_COMPLETE',
          payload: { attempt: msg.payload.attempt, draft: msg.payload.draft, ...editResult },
        });
      } catch (err) {
        fail(err);
      }
    });

    // ─── Fact-Checker subscribes to its own channel ───
    bus.subscribe('FactChecker', async (msg) => {
      if (msg.type !== 'FACT_CHECK_REQUEST') return;
      try {
        console.log('\n>> STEP 3: Fact-Check');
        const factResult = await runFactChecker(msg.payload.draft, msg.payload.research);
        context.fact_checks = factResult;

        bus.publish({
          from: 'FactChecker',
          to: 'Supervisor',
          type: 'FACT_CHECK_COMPLETE',
          payload: factResult,
        });
      } catch (err) {
        fail(err);
      }
    });

    // ─── Supervisor subscribes to its own channel — this is where
    //     orchestration decisions (retry vs. accept, when to finish) live ───
    bus.subscribe('Supervisor', (msg) => {
      try {
        if (msg.type === 'REVIEW_COMPLETE') {
          costTracker.editor += trackCost(msg.payload.tokenUsage);
          checkBudget(costTracker);

          if (msg.payload.verdict === 'ACCEPT') {
            currentDraft = msg.payload.draft;
            console.log(`\n  >> Supervisor: Draft ACCEPTED on attempt ${msg.payload.attempt} (score: ${msg.payload.score}/10)`);

            bus.publish({
              from: 'Supervisor',
              to: 'FactChecker',
              type: 'FACT_CHECK_REQUEST',
              payload: { draft: currentDraft, research: latestResearch },
            });
          } else if (msg.payload.attempt <= MAX_RETRIES) {
            const feedback = msg.payload.issues
              .filter((i) => i.severity === 'major')
              .map((i) => `[${i.location}] ${i.comment}`)
              .join('\n');

            console.log(`\n  >> Supervisor: Draft REJECTED (score: ${msg.payload.score}/10). Sending revision feedback to Writer.`);

            bus.publish({
              from: 'Supervisor',
              to: 'Writer',
              type: 'REVISION_REQ',
              payload: { attempt: msg.payload.attempt, feedback },
            });
          } else {
            console.log(`\n  >> Supervisor: Draft REJECTED after ${MAX_RETRIES} retries. Proceeding with best draft.`);
            currentDraft = msg.payload.draft;

            bus.publish({
              from: 'Supervisor',
              to: 'FactChecker',
              type: 'FACT_CHECK_REQUEST',
              payload: { draft: currentDraft, research: latestResearch },
            });
          }
        } else if (msg.type === 'FACT_CHECK_COMPLETE') {
          costTracker.factChecker += trackCost(msg.payload.tokenUsage);
          checkBudget(costTracker);

          console.log('\n>> STEP 4: Final Assembly');
          context.final = currentDraft;

          const attempt = context.drafts[context.drafts.length - 1].attempt;
          const accepted = context.edits[context.edits.length - 1].verdict === 'ACCEPT';

          bus.publish({
            from: 'Supervisor',
            to: 'Output',
            type: 'FINAL',
            payload: { status: 'COMPLETE', draftAttempts: attempt, factCheckResult: msg.payload.overall },
          });

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const totalCost = Object.values(costTracker).reduce((a, b) => a + b, 0);

          const report = {
            topic,
            status: 'COMPLETE',
            draftAttempts: attempt,
            editorAccepted: accepted,
            factCheckPassed: msg.payload.overall === 'PASS',
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

          bus.printSummary();

          resolve({ report, context, messageLog: bus.getLog() });
        }
      } catch (err) {
        fail(err);
      }
    });

    // ─── Kick off the pipeline: Supervisor publishes the first request ───
    bus.publish({
      from: 'Supervisor',
      to: 'Researcher',
      type: 'RESEARCH_REQUEST',
      payload: { topic },
    });
  });
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
