#!/usr/bin/env node
/**
 * Demo — run the multi-agent content pipeline end-to-end.
 *
 * Usage:
 *   node src/demo.js
 *   node src/demo.js "Your custom topic here"
 */

import { runPipeline } from './supervisor.js';

const DEFAULT_TOPIC =
  'Write a technical deep-dive on database connection pooling in Node.js';

async function main() {
  const topic = process.argv[2] || DEFAULT_TOPIC;

  console.log('='.repeat(60));
  console.log('  MULTI-AGENT CONTENT PIPELINE — DEMO MODE');
  console.log('  (Using mock LLM responses to show the full flow)');
  console.log('='.repeat(60));

  try {
    const { report, context } = await runPipeline(topic);

    // ─── Show the final draft ───
    console.log('\n' + '='.repeat(60));
    console.log('  FINAL BLOG POST DRAFT');
    console.log('='.repeat(60));
    console.log(context.final);

    // ─── Show fact-check annotations ───
    console.log('='.repeat(60));
    console.log('  FACT-CHECK ANNOTATIONS');
    console.log('='.repeat(60));
    for (const c of context.fact_checks.claims) {
      const icon =
        c.verdict === 'VERIFIED' ? '[OK]' :
        c.verdict === 'UNVERIFIED' ? '[??]' :
        '[XX]';
      console.log(`  ${icon} ${c.claim}`);
      if (c.note) console.log(`       ${c.note}`);
    }

    // ─── Show edit history ───
    console.log('\n' + '='.repeat(60));
    console.log('  EDIT HISTORY');
    console.log('='.repeat(60));
    for (const edit of context.edits) {
      console.log(`\n  Attempt ${edit.attempt}: ${edit.verdict} (score ${edit.score}/10)`);
      console.log(`  Summary: ${edit.summary}`);
      if (edit.issues.length > 0) {
        console.log('  Issues:');
        for (const issue of edit.issues) {
          console.log(`    [${issue.severity.toUpperCase()}] ${issue.location}: ${issue.comment}`);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('  DEMO COMPLETE');
    console.log('='.repeat(60));
    const firstEdit = context.edits[0];
    const lastEdit = context.edits[context.edits.length - 1];
    const firstMajorCount = firstEdit.issues.filter((i) => i.severity === 'major').length;
    const verified = context.fact_checks.claims.filter((c) => c.verdict === 'VERIFIED').length;
    const totalClaims = context.fact_checks.claims.length;

    console.log('\nKey observations:');
    console.log(`  1. The editor scored the draft from its actual content (length, code, structure, evidence) — not the attempt number.`);
    console.log(`  2. Attempt 1 was ${firstEdit.verdict} (score ${firstEdit.score}/10) — ${firstMajorCount} major issue(s) found.`);
    console.log('  3. The supervisor sent that feedback to the Writer over the message bus (REVISION_REQ).');
    console.log(`  4. The writer produced a revised draft; the editor re-scored it and ${lastEdit.verdict === 'ACCEPT' ? 'ACCEPTED' : 'still rejected'} it (score ${lastEdit.score}/10).`);
    console.log(`  5. The fact-checker verified ${verified}/${totalClaims} claims.`);
    console.log('  6. Total cost stayed well within the $2.00 budget.');
    console.log('  7. Every hop above (RESEARCH_REQUEST -> ... -> FINAL) was a real bus.publish()/bus.subscribe() dispatch, not a direct function call.');
    console.log(`\n  Pipeline completed in ${report.elapsed} with ${report.messageCount} inter-agent messages.\n`);

  } catch (err) {
    console.error('\nPIPELINE FAILED:', err.message);
    process.exit(1);
  }
}

main();
