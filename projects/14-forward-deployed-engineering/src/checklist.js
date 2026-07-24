/**
 * Deployment Readiness Checklist
 *
 * Automated verification that the onboarding is complete and ready for pilot.
 * Each check is a function that returns {pass: boolean, detail: string}.
 *
 * This is what separates "I set it up" from "I verified it works end-to-end."
 */

import fs from 'fs/promises';
import path from 'path';

export class DeploymentChecklist {
  constructor(config = {}) {
    this.config = {
      docsPath: config.docsPath || './data/sample-docs',
      evalPath: config.evalPath || './data/eval-set.json',
      minDocuments: config.minDocuments || 5,
      maxFailedDocs: config.maxFailedDocs || 2,
      minVocabTerms: config.minVocabTerms || 10,
      minEvalQuestions: config.minEvalQuestions || 15,
      pilotDays: config.pilotDays || 14,
      pilotStartDate: config.pilotStartDate || new Date().toISOString().split('T')[0],
      ...config,
    };
    this.results = [];
  }

  /**
   * Run all readiness checks.
   * @param {object} state — current onboarding state from the pipeline
   * @returns {{passed: number, failed: number, warnings: number, checks: Array, ready: boolean}}
   */
  async run(state = {}) {
    this.results = [];

    // 1. Data connector configured and tested
    this.results.push(
      this._check(
        'Data connector configured and tested',
        state.connectorHealth?.ok === true,
        state.connectorHealth?.ok
          ? `Connected to ${state.connectorType || 'unknown'} source`
          : `Connector health check failed: ${state.connectorHealth?.errors?.join(', ') || 'not configured'}`,
        'critical'
      )
    );

    // 2. Documents ingested
    const docCount = state.processingStats?.succeeded || 0;
    const failedCount = state.processingStats?.failed || 0;
    this.results.push(
      this._check(
        `Documents ingested (count: ${docCount}, failed: ${failedCount})`,
        docCount >= this.config.minDocuments && failedCount <= this.config.maxFailedDocs,
        docCount >= this.config.minDocuments
          ? `${docCount} documents processed successfully`
          : `Need at least ${this.config.minDocuments} documents (got ${docCount})`,
        'critical'
      )
    );

    // 3. Extraction quality
    const avgQuality = parseFloat(state.processingStats?.avgQuality || 0);
    this.results.push(
      this._check(
        `Extraction quality score: ${avgQuality}`,
        avgQuality >= 0.7,
        avgQuality >= 0.7
          ? `Average quality ${avgQuality} exceeds threshold 0.7`
          : `Average quality ${avgQuality} below threshold 0.7 — review failed extractions`,
        'warning'
      )
    );

    // 4. Domain vocabulary extracted
    const vocabCount = state.domainStats?.uniqueTermsFound || 0;
    const categories = state.domainStats?.categoriesFound || [];
    this.results.push(
      this._check(
        `Domain vocabulary extracted (${vocabCount} terms)`,
        vocabCount >= this.config.minVocabTerms,
        vocabCount >= this.config.minVocabTerms
          ? `${vocabCount} terms across ${categories.length} categories: ${categories.join(', ')}`
          : `Only ${vocabCount} terms found (need ${this.config.minVocabTerms}+). Add more domain documents.`,
        'critical'
      )
    );

    // 5. System prompt customized
    const promptLength = state.systemPrompt?.length || 0;
    this.results.push(
      this._check(
        'System prompt customized',
        promptLength > 500,
        promptLength > 500
          ? `Custom system prompt generated (${promptLength} chars)`
          : 'System prompt not generated or too short',
        'critical'
      )
    );

    // 6. Eval set built
    const evalCount = state.evalStats?.accepted || 0;
    this.results.push(
      this._check(
        `Eval set built (${evalCount} questions)`,
        evalCount >= this.config.minEvalQuestions,
        evalCount >= this.config.minEvalQuestions
          ? `${evalCount} reviewed questions ready`
          : `Only ${evalCount} questions reviewed (target: ${this.config.minEvalQuestions}+)`,
        'critical'
      )
    );

    // 7. Eval set file exists and is valid
    let evalFileValid = false;
    try {
      const evalData = await fs.readFile(path.resolve(this.config.evalPath), 'utf-8');
      const parsed = JSON.parse(evalData);
      evalFileValid = parsed.questions && parsed.questions.length > 0;
      this.results.push(
        this._check(
          'Eval set exported to file',
          evalFileValid,
          `Eval file contains ${parsed.questions?.length || 0} questions`,
          'warning'
        )
      );
    } catch {
      this.results.push(
        this._check(
          'Eval set exported to file',
          false,
          `Eval file not found at ${this.config.evalPath}`,
          'warning'
        )
      );
    }

    // 8. Pilot timeline
    const startDate = new Date(this.config.pilotStartDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + this.config.pilotDays);
    const daysRemaining = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
    this.results.push(
      this._check(
        `Pilot timeline (${daysRemaining} days remaining)`,
        daysRemaining > 0,
        daysRemaining > 0
          ? `Pilot ends ${endDate.toISOString().split('T')[0]} — ${daysRemaining} days remaining`
          : 'Pilot deadline has passed!',
        'warning'
      )
    );

    // 9. Few-shot examples generated
    const fewShotCount = state.domainStats?.fewShotCount || 0;
    this.results.push(
      this._check(
        `Few-shot examples generated (${fewShotCount})`,
        fewShotCount >= 5,
        fewShotCount >= 5
          ? `${fewShotCount} few-shot examples for system prompt`
          : `Only ${fewShotCount} examples — need at least 5 for reliable domain adaptation`,
        'warning'
      )
    );

    // Compute summary
    const passed = this.results.filter((r) => r.pass).length;
    const failed = this.results.filter((r) => !r.pass && r.severity === 'critical').length;
    const warnings = this.results.filter((r) => !r.pass && r.severity === 'warning').length;

    return {
      passed,
      failed,
      warnings,
      total: this.results.length,
      ready: failed === 0,
      checks: this.results,
    };
  }

  /**
   * Print the checklist to console.
   */
  print(report) {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║            DEPLOYMENT READINESS CHECKLIST                   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    for (const check of report.checks) {
      const icon = check.pass ? '[PASS]' : check.severity === 'critical' ? '[FAIL]' : '[WARN]';
      const pad = check.pass ? ' ' : '';
      console.log(`  ${icon}${pad} ${check.name}`);
      console.log(`         ${check.detail}`);
      console.log();
    }

    console.log('─'.repeat(62));
    console.log(`  Results: ${report.passed} passed, ${report.failed} failed, ${report.warnings} warnings`);
    console.log(`  Status:  ${report.ready ? 'READY FOR PILOT' : 'NOT READY — fix critical failures above'}`);
    console.log('─'.repeat(62));
    console.log();
  }

  _check(name, pass, detail, severity = 'warning') {
    return { name, pass, detail, severity };
  }
}

// --- CLI entry point ---
if (process.argv[1] && process.argv[1].endsWith('checklist.js')) {
  (async () => {
    const checklist = new DeploymentChecklist();
    // Run with empty state to show what's missing
    const report = await checklist.run({});
    checklist.print(report);
  })();
}
