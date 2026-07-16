import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EvalSuite } from '../evalSuite.js';
import { BaselineComparator } from '../baseline.js';
import { QualityGate } from '../qualityGate.js';
import { AgentCICDPipeline } from '../pipeline.js';

// ─── Eval Suite ───

describe('Eval Suite', () => {
  function createSuite() {
    const suite = new EvalSuite({ dimensions: ['accuracy', 'safety'] });
    suite.addScorer('accuracy', async ({ output, expected }) => {
      if (!output || !expected) return 0;
      return output.toLowerCase().includes(expected.toLowerCase()) ? 1.0 : 0.3;
    });
    suite.addScorer('safety', async ({ output }) => {
      return output?.includes('password') ? 0.0 : 1.0;
    });
    return suite;
  }

  it('runs cases and returns scores', async () => {
    const suite = createSuite();
    suite.addCase({ name: 'test1', input: 'hi', expectedOutput: 'hello' });
    suite.addCase({ name: 'test2', input: 'bye', expectedOutput: 'goodbye' });

    const results = await suite.run(async (input) => ({ output: 'hello world', usage: { inputTokens: 10, outputTokens: 5 } }));
    assert.equal(results.totalCases, 2);
    assert.ok(results.aggregateScores.accuracy);
    assert.ok(results.duration >= 0);
  });

  it('handles agent errors gracefully', async () => {
    const suite = createSuite();
    suite.addCase({ name: 'test1', input: 'crash', expectedOutput: 'ok' });

    const results = await suite.run(async () => { throw new Error('boom'); });
    assert.equal(results.errors, 1);
    assert.equal(results.results[0].error, 'boom');
    assert.equal(results.results[0].scores.accuracy, 0);
  });

  it('filters by tags', async () => {
    const suite = createSuite();
    suite.addCase({ name: 'safety1', input: 'x', expectedOutput: 'y', tags: ['safety'] });
    suite.addCase({ name: 'basic1', input: 'a', expectedOutput: 'b', tags: ['basic'] });

    const results = await suite.run(async () => ({ output: 'test' }), { tags: ['safety'] });
    assert.equal(results.totalCases, 1);
  });

  it('respects thresholds', async () => {
    const suite = createSuite();
    suite.setThreshold('accuracy', 0.8);
    suite.addCase({ name: 'test1', input: 'hi', expectedOutput: 'hello' });

    const results = await suite.run(async () => ({ output: 'nope' }));
    assert.equal(results.passed, 0);
    assert.equal(results.failed, 1);
  });

  it('computes weighted aggregates', async () => {
    const suite = createSuite();
    suite.addCase({ name: 'important', input: 'a', expectedOutput: 'a match', weight: 3.0 });
    suite.addCase({ name: 'minor', input: 'b', expectedOutput: 'b', weight: 1.0 });

    const results = await suite.run(async (input) => ({ output: `${input} match` }));
    assert.ok(results.aggregateScores.accuracy.mean > 0);
  });
});

// ─── Baseline Comparator ───

describe('Baseline Comparator', () => {
  function makeEvalResult(scores, passed, total) {
    return {
      totalCases: total, passed, failed: total - passed, errors: 0, duration: 100,
      aggregateScores: scores,
      results: [],
    };
  }

  it('saves and compares baselines', () => {
    const bc = new BaselineComparator();
    bc.saveBaseline('v1', makeEvalResult({ accuracy: { mean: 0.8, min: 0.5, max: 1.0 } }, 8, 10));
    const comparison = bc.compare('v1', makeEvalResult({ accuracy: { mean: 0.85, min: 0.6, max: 1.0 } }, 9, 10));
    assert.equal(comparison.verdict, 'STABLE');
    assert.equal(comparison.passRate.current, 90);
  });

  it('detects regressions', () => {
    const bc = new BaselineComparator({ regressionThreshold: 0.05 });
    bc.saveBaseline('v1', makeEvalResult({ accuracy: { mean: 0.9, min: 0.7, max: 1.0 } }, 9, 10));
    const comparison = bc.compare('v1', makeEvalResult({ accuracy: { mean: 0.7, min: 0.3, max: 0.9 } }, 7, 10));
    assert.equal(comparison.verdict, 'REGRESSION');
    assert.equal(comparison.regressions.length, 1);
  });

  it('detects improvements', () => {
    const bc = new BaselineComparator({ improvementThreshold: 0.10 });
    bc.saveBaseline('v1', makeEvalResult({ accuracy: { mean: 0.6, min: 0.4, max: 0.8 } }, 6, 10));
    const comparison = bc.compare('v1', makeEvalResult({ accuracy: { mean: 0.9, min: 0.7, max: 1.0 } }, 9, 10));
    assert.equal(comparison.verdict, 'IMPROVED');
    assert.equal(comparison.improvements.length, 1);
  });

  it('handles missing baseline', () => {
    const bc = new BaselineComparator();
    const result = bc.compare('nonexistent', makeEvalResult({}, 0, 0));
    assert.ok(result.error);
  });

  it('lists saved baselines', () => {
    const bc = new BaselineComparator();
    bc.saveBaseline('v1', makeEvalResult({ accuracy: { mean: 0.8 } }, 8, 10));
    bc.saveBaseline('v2', makeEvalResult({ accuracy: { mean: 0.9 } }, 9, 10));
    assert.equal(bc.listBaselines().length, 2);
  });
});

// ─── Quality Gate ───

describe('Quality Gate', () => {
  it('passes when all thresholds met', () => {
    const qg = new QualityGate();
    qg.addRule({ name: 'accuracy', type: 'threshold', dimension: 'accuracy', operator: 'gte', value: 0.7 });
    const result = qg.evaluate({ aggregateScores: { accuracy: { mean: 0.85 } } });
    assert.equal(result.verdict, 'PASS');
    assert.equal(result.violations.length, 0);
  });

  it('blocks when threshold violated', () => {
    const qg = new QualityGate();
    qg.addRule({ name: 'accuracy', type: 'threshold', dimension: 'accuracy', operator: 'gte', value: 0.8 });
    const result = qg.evaluate({ aggregateScores: { accuracy: { mean: 0.5 } } });
    assert.equal(result.verdict, 'BLOCK');
    assert.equal(result.violations.length, 1);
  });

  it('warns but does not block for warning severity', () => {
    const qg = new QualityGate();
    qg.addRule({ name: 'cost', type: 'threshold', dimension: 'cost', operator: 'lte', value: 0.5, severity: 'warning' });
    const result = qg.evaluate({ aggregateScores: { cost: { mean: 0.8 } } });
    assert.equal(result.verdict, 'WARN');
    assert.equal(result.warnings.length, 1);
    assert.equal(result.violations.length, 0);
  });

  it('checks regression rules', () => {
    const qg = new QualityGate();
    qg.addRule({ name: 'no-regression', type: 'regression', dimension: 'accuracy' });
    const comparison = { comparisons: { accuracy: { status: 'regression', pctChange: -0.15 } } };
    const result = qg.evaluate({ aggregateScores: {} }, comparison);
    assert.equal(result.verdict, 'BLOCK');
  });

  it('supports custom rules', () => {
    const qg = new QualityGate();
    qg.addRule({
      name: 'min-cases', type: 'custom',
      check: (evalResults) => ({
        passed: evalResults.totalCases >= 5,
        detail: `Only ${evalResults.totalCases} cases`,
      }),
    });
    const result = qg.evaluate({ totalCases: 3, aggregateScores: {} });
    assert.equal(result.verdict, 'BLOCK');
  });

  it('tracks evaluation history', () => {
    const qg = new QualityGate();
    qg.addRule({ name: 'test', type: 'threshold', dimension: 'x', operator: 'gte', value: 0.5 });
    qg.evaluate({ aggregateScores: { x: { mean: 0.6 } } });
    qg.evaluate({ aggregateScores: { x: { mean: 0.3 } } });
    assert.equal(qg.history.length, 2);
  });
});

// ─── Full Pipeline Integration ───

describe('Agent CI/CD Pipeline Integration', () => {
  function createPipeline() {
    const pipeline = new AgentCICDPipeline({
      eval: { dimensions: ['accuracy', 'safety'] },
      baseline: { regressionThreshold: 0.05 },
    });

    pipeline.evalSuite.addScorer('accuracy', async ({ output, expected }) => {
      if (!output || !expected) return 0;
      return output.includes(expected) ? 1.0 : 0.3;
    });
    pipeline.evalSuite.addScorer('safety', async ({ output }) => {
      return output?.includes('password') ? 0.0 : 1.0;
    });

    for (let i = 0; i < 6; i++) {
      pipeline.evalSuite.addCase({ name: `case${i}`, input: `q${i}`, expectedOutput: `a${i}` });
    }

    pipeline.qualityGate.addRule({ name: 'accuracy', type: 'threshold', dimension: 'accuracy', operator: 'gte', value: 0.5 });
    pipeline.qualityGate.addRule({ name: 'safety', type: 'threshold', dimension: 'safety', operator: 'gte', value: 0.8 });

    return pipeline;
  }

  it('promotes a good agent', async () => {
    const pipeline = createPipeline();
    const run = await pipeline.runPipeline(async (input) => ({ output: input.replace('q', 'a') }));
    assert.equal(run.promotion.action, 'promote');
    assert.equal(run.stages.length, 4);
  });

  it('blocks an unsafe agent', async () => {
    const pipeline = createPipeline();
    const run = await pipeline.runPipeline(async () => ({ output: 'password leaked' }));
    assert.equal(run.promotion.action, 'block');
    assert.ok(run.gateResult.violations.some(v => v.name === 'safety'));
  });

  it('detects regression against baseline', async () => {
    const pipeline = createPipeline();
    const goodAgent = async (input) => ({ output: input.replace('q', 'a') });
    await pipeline.runPipeline(goodAgent, { baseline: 'latest', updateBaseline: true });

    const badAgent = async () => ({ output: 'wrong' });
    const run2 = await pipeline.runPipeline(badAgent, { baseline: 'latest' });
    assert.ok(run2.baselineComparison);
    assert.equal(run2.baselineComparison.verdict, 'REGRESSION');
  });

  it('generates readable report', async () => {
    const pipeline = createPipeline();
    const run = await pipeline.runPipeline(async (input) => ({ output: input.replace('q', 'a') }));
    const report = pipeline.generateReport(run.runId);
    assert.ok(report.includes('PASS'));
    assert.ok(report.includes('PROMOTE'));
  });

  it('tracks run history', async () => {
    const pipeline = createPipeline();
    await pipeline.runPipeline(async () => ({ output: 'test' }));
    await pipeline.runPipeline(async () => ({ output: 'test' }));
    assert.equal(pipeline.getRunHistory().length, 2);
  });

  it('blocks when too few eval cases', async () => {
    const pipeline = new AgentCICDPipeline({ eval: { dimensions: ['accuracy'] } });
    pipeline.evalSuite.addScorer('accuracy', async () => 1.0);
    pipeline.evalSuite.addCase({ name: 'only-one', input: 'x', expectedOutput: 'y' });
    const run = await pipeline.runPipeline(async () => ({ output: 'y' }));
    assert.equal(run.promotion.action, 'block');
    assert.ok(run.promotion.reason.includes('Insufficient'));
  });
});
