import { EvalSuite } from './evalSuite.js';
import { BaselineComparator } from './baseline.js';
import { QualityGate } from './qualityGate.js';

export class AgentCICDPipeline {
  constructor(config = {}) {
    this.evalSuite = new EvalSuite(config.eval);
    this.baseline = new BaselineComparator(config.baseline);
    this.qualityGate = new QualityGate(config.gate);
    this.runs = [];
    this.promotionRules = config.promotionRules || {
      autoPromote: true,
      requireBaseline: true,
      minCases: 5,
    };
  }

  async runPipeline(agentFn, options = {}) {
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const startTime = Date.now();
    const stages = [];

    // Stage 1: Eval Suite
    const evalResults = await this.evalSuite.run(agentFn, { tags: options.tags });
    stages.push({
      name: 'eval', status: evalResults.errors > 0 ? 'warning' : 'passed',
      duration: evalResults.duration,
      summary: `${evalResults.passed}/${evalResults.totalCases} passed, ${evalResults.errors} errors`,
    });

    // Stage 2: Baseline Comparison
    let baselineComparison = null;
    const baselineName = options.baseline || 'latest';
    if (this.baseline.baselines.has(baselineName)) {
      baselineComparison = this.baseline.compare(baselineName, evalResults);
      stages.push({
        name: 'baseline', status: baselineComparison.verdict === 'REGRESSION' ? 'failed' : 'passed',
        summary: `${baselineComparison.verdict} — pass rate: ${baselineComparison.passRate.baseline}% → ${baselineComparison.passRate.current}%`,
        regressions: baselineComparison.regressions.length,
        improvements: baselineComparison.improvements.length,
      });
    } else {
      stages.push({ name: 'baseline', status: 'skipped', summary: 'No baseline found' });
    }

    // Stage 3: Quality Gate
    const gateResult = this.qualityGate.evaluate(evalResults, baselineComparison);
    stages.push({
      name: 'quality_gate', status: gateResult.verdict === 'BLOCK' ? 'failed' : 'passed',
      summary: `${gateResult.verdict} — ${gateResult.violations.length} violations, ${gateResult.warnings.length} warnings`,
      violations: gateResult.violations,
      warnings: gateResult.warnings,
    });

    // Stage 4: Promotion Decision
    const promotion = this._decide(evalResults, baselineComparison, gateResult);
    stages.push({
      name: 'promotion', status: promotion.action,
      summary: promotion.reason,
    });

    const run = {
      runId,
      stages,
      evalResults,
      baselineComparison,
      gateResult,
      promotion,
      duration: Date.now() - startTime,
      timestamp: Date.now(),
    };

    this.runs.push(run);

    if (promotion.action === 'promote' && options.updateBaseline !== false) {
      this.baseline.saveBaseline(baselineName, evalResults);
    }

    return run;
  }

  _decide(evalResults, baselineComparison, gateResult) {
    if (gateResult.verdict === 'BLOCK') {
      return { action: 'block', reason: `Quality gate blocked: ${gateResult.violations.map(v => v.name).join(', ')}` };
    }

    if (this.promotionRules.requireBaseline && baselineComparison?.verdict === 'REGRESSION') {
      return { action: 'block', reason: `Regression detected: ${baselineComparison.regressions.map(r => r.dimension).join(', ')}` };
    }

    if (evalResults.totalCases < this.promotionRules.minCases) {
      return { action: 'block', reason: `Insufficient eval cases: ${evalResults.totalCases} < ${this.promotionRules.minCases}` };
    }

    if (gateResult.verdict === 'WARN') {
      return { action: 'promote_with_warnings', reason: `Promoted with ${gateResult.warnings.length} warnings` };
    }

    return { action: 'promote', reason: 'All checks passed' };
  }

  getRunHistory() {
    return this.runs.map(r => ({
      runId: r.runId, timestamp: r.timestamp, duration: r.duration,
      promotion: r.promotion.action,
      passRate: r.evalResults.totalCases > 0 ? Math.round((r.evalResults.passed / r.evalResults.totalCases) * 100) : 0,
    }));
  }

  generateReport(runId) {
    const run = this.runs.find(r => r.runId === runId);
    if (!run) return null;

    const lines = [];
    lines.push(`# Agent CI/CD Report — ${run.runId}`);
    lines.push(`Duration: ${run.duration}ms\n`);

    for (const stage of run.stages) {
      const icon = stage.status === 'passed' ? 'PASS' : stage.status === 'failed' ? 'FAIL' : stage.status === 'skipped' ? 'SKIP' : stage.status.toUpperCase();
      lines.push(`## [${icon}] ${stage.name}`);
      lines.push(`  ${stage.summary}`);
      if (stage.violations?.length) {
        for (const v of stage.violations) lines.push(`  VIOLATION: ${v.name} — ${v.detail}`);
      }
      if (stage.warnings?.length) {
        for (const w of stage.warnings) lines.push(`  WARNING: ${w.name} — ${w.detail}`);
      }
      lines.push('');
    }

    lines.push(`## Verdict: ${run.promotion.action.toUpperCase()}`);
    lines.push(`Reason: ${run.promotion.reason}`);

    return lines.join('\n');
  }
}
