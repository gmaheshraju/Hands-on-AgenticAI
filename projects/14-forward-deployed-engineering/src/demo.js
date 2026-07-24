/**
 * End-to-End Onboarding Demo
 *
 * Runs the complete FDE customer onboarding pipeline:
 *   1. Connect to data sources (filesystem + mock API)
 *   2. Ingest and process all documents
 *   3. Run domain adaptation (vocabulary + few-shot + system prompt)
 *   4. Generate and auto-accept eval set
 *   5. Run deployment checklist
 *   6. Start dashboard with real data
 *
 * Usage:
 *   node src/demo.js                  # full pipeline + dashboard
 *   node src/demo.js --no-server      # pipeline only, no dashboard
 *   node src/demo.js --checklist-only # just the checklist
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { FilesystemConnector } from './connectors/filesystem.js';
import { ApiConnector } from './connectors/api.js';
import { DocumentProcessor } from './processor.js';
import { DomainAdapter } from './domainAdapter.js';
import { EvalBuilder } from './evalBuilder.js';
import { DeploymentChecklist } from './checklist.js';
import { createDashboardServer } from './dashboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const startTime = Date.now();
  console.log('='.repeat(62));
  console.log('  FDE CUSTOMER ONBOARDING TOOLKIT — End-to-End Demo');
  console.log('='.repeat(62));
  console.log();

  // ── Step 1: Connect to data sources ──────────────────────────────────
  console.log('Step 1: Connecting to data sources...');

  const fsConnector = new FilesystemConnector({
    basePath: path.resolve(__dirname, '..', 'data', 'sample-docs'),
  });
  const fsHealth = await fsConnector.healthCheck();
  console.log(`  Filesystem: ${fsHealth.ok ? 'OK' : 'FAILED'} (${fsHealth.documentCount} documents)`);

  const apiConnector = new ApiConnector({
    endpoint: 'https://api.mock-dms.example.com/v1',
    apiKey: 'mock-api-key-12345',
  });
  const apiHealth = await apiConnector.healthCheck();
  console.log(`  API (mock): ${apiHealth.ok ? 'OK' : 'FAILED'} (${apiHealth.documentCount} documents)`);
  console.log();

  // ── Step 2: Process documents ────────────────────────────────────────
  console.log('Step 2: Processing documents...');

  const processor = new DocumentProcessor();

  // Process filesystem documents
  const fsDocs = await processor.processAll(fsConnector);
  console.log(`  Filesystem: ${fsDocs.length} documents processed`);

  // Process API documents
  const apiDocs = await processor.processAll(apiConnector);
  console.log(`  API:        ${apiDocs.length} documents processed`);

  const allDocs = [...fsDocs, ...apiDocs];
  const procSummary = processor.getSummary();
  console.log(`  Total:      ${procSummary.processed} processed, ${procSummary.succeeded} succeeded, ${procSummary.failed} failed`);
  console.log(`  Quality:    ${procSummary.avgQuality} average, ${procSummary.successRate} success rate`);

  // Show any warnings
  const warningDocs = allDocs.filter(d => d.quality.warnings.length > 0);
  if (warningDocs.length > 0) {
    console.log(`  Warnings:`);
    for (const d of warningDocs) {
      console.log(`    - ${d.metadata.name}: ${d.quality.warnings.join('; ')}`);
    }
  }
  console.log();

  // ── Step 3: Domain adaptation ────────────────────────────────────────
  console.log('Step 3: Running domain adaptation...');

  const adapter = new DomainAdapter();
  const { vocabulary, fewShotExamples, systemPrompt, stats: domainStats } = await adapter.adapt(allDocs);

  console.log(`  Vocabulary: ${domainStats.uniqueTermsFound} terms across ${domainStats.categoriesFound.length} categories`);
  console.log(`  Categories: ${domainStats.categoriesFound.join(', ')}`);
  console.log(`  Few-shot:   ${domainStats.fewShotCount} examples generated`);
  console.log(`  Prompt:     ${systemPrompt.length} chars`);

  // Show top vocabulary terms
  console.log(`\n  Top domain terms:`);
  for (const term of vocabulary.slice(0, 10)) {
    console.log(`    [${term.count}x] ${term.term} (${term.category}) — ${term.definition.slice(0, 60)}...`);
  }

  // Show sample few-shot examples
  console.log(`\n  Sample few-shot examples:`);
  for (const ex of fewShotExamples.slice(0, 3)) {
    console.log(`    Q: ${ex.question.slice(0, 80)}...`);
    console.log(`    A: ${ex.answer.slice(0, 80)}...`);
    console.log();
  }

  // ── Step 4: Build eval set ───────────────────────────────────────────
  console.log('Step 4: Building evaluation set...');

  const evalBuilder = new EvalBuilder();
  const candidates = evalBuilder.generateCandidates(allDocs);
  console.log(`  Generated: ${candidates.length} candidate questions`);

  // Auto-accept for demo (in production, FDE reviews interactively)
  const reviewResult = evalBuilder.acceptAll();
  console.log(`  Accepted:  ${reviewResult.accepted} questions (auto-accept for demo)`);

  const evalOutputPath = path.resolve(__dirname, '..', 'data', 'eval-set.json');
  const evalSet = await evalBuilder.export(evalOutputPath);

  // Show question type distribution
  const typeDistribution = {};
  for (const q of evalSet.questions) {
    typeDistribution[q.type] = (typeDistribution[q.type] || 0) + 1;
  }
  console.log(`  Types:     ${Object.entries(typeDistribution).map(([t, c]) => `${t}=${c}`).join(', ')}`);
  console.log();

  // ── Step 5: Deployment checklist ─────────────────────────────────────
  console.log('Step 5: Running deployment checklist...');

  const checklist = new DeploymentChecklist({
    docsPath: path.resolve(__dirname, '..', 'data', 'sample-docs'),
    evalPath: evalOutputPath,
  });

  const checklistReport = await checklist.run({
    connectorHealth: fsHealth,
    connectorType: 'filesystem + API (mock)',
    processingStats: procSummary,
    domainStats: domainStats,
    systemPrompt: systemPrompt,
    evalStats: { accepted: reviewResult.accepted, rejected: reviewResult.rejected },
  });

  checklist.print(checklistReport);

  // ── Step 6: Start dashboard ──────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Pipeline completed in ${elapsed}s\n`);

  if (process.argv.includes('--checklist-only') || process.argv.includes('--no-server')) {
    console.log('Dashboard not started (use without --no-server flag to start).');
    return;
  }

  console.log('Step 6: Starting pilot dashboard...\n');

  const dashboardState = {
    customer: 'Legal Tech Solutions (Demo)',
    pilotStart: new Date().toISOString().split('T')[0],
    pilotDays: 14,
    documents: {
      total: procSummary.processed,
      succeeded: procSummary.succeeded,
      failed: procSummary.failed,
      warnings: procSummary.warnings,
      avgQuality: procSummary.avgQuality,
      details: allDocs.map(d => ({
        name: d.metadata.name,
        quality: d.quality.score,
        status: d.quality.status,
        words: d.quality.wordCount,
      })),
    },
    domain: {
      vocabularyCount: domainStats.uniqueTermsFound,
      categories: domainStats.categoriesFound,
      fewShotCount: domainStats.fewShotCount,
      systemPromptLength: systemPrompt.length,
    },
    eval: {
      totalCandidates: candidates.length,
      accepted: reviewResult.accepted,
      rejected: reviewResult.rejected,
    },
    checklist: {
      passed: checklistReport.passed,
      failed: checklistReport.failed,
      warnings: checklistReport.warnings,
      ready: checklistReport.ready,
      checks: checklistReport.checks,
    },
    issues: [
      { id: 'issue-1', text: 'Need access to SharePoint API credentials', severity: 'high', status: 'open', createdAt: new Date().toISOString() },
      { id: 'issue-2', text: 'PDF extraction library not configured for scanned documents', severity: 'medium', status: 'open', createdAt: new Date().toISOString() },
    ],
    activity: [
      { timestamp: new Date().toISOString(), action: 'Pipeline run', detail: `Processed ${procSummary.processed} docs, extracted ${domainStats.uniqueTermsFound} terms, built ${reviewResult.accepted}-question eval set` },
      { timestamp: new Date().toISOString(), action: 'Checklist', detail: `${checklistReport.passed}/${checklistReport.total} checks passed` },
    ],
  };

  const port = process.env.PORT || 3014;
  const app = createDashboardServer(dashboardState);
  app.listen(port, () => {
    console.log(`  Dashboard: http://localhost:${port}`);
    console.log(`  API state: http://localhost:${port}/api/state`);
    console.log('\n  Press Ctrl+C to stop.\n');
  });
}

run().catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
