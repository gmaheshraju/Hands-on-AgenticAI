export class EvalSuite {
  constructor(config = {}) {
    this.cases = [];
    this.dimensions = config.dimensions || ['faithfulness', 'safety', 'cost', 'latency'];
    this.scorers = new Map();
    this.thresholds = config.thresholds || {};
  }

  addCase(testCase) {
    const record = {
      id: testCase.id || `eval_${this.cases.length + 1}`,
      name: testCase.name,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      context: testCase.context || {},
      tags: testCase.tags || [],
      weight: testCase.weight || 1.0,
      dimensions: testCase.dimensions || this.dimensions,
    };
    this.cases.push(record);
    return record;
  }

  addScorer(dimension, scorerFn) {
    this.scorers.set(dimension, scorerFn);
  }

  setThreshold(dimension, threshold) {
    this.thresholds[dimension] = threshold;
  }

  async run(agentFn, options = {}) {
    const results = [];
    const startTime = Date.now();
    const casesToRun = options.tags
      ? this.cases.filter(c => c.tags.some(t => options.tags.includes(t)))
      : this.cases;

    for (const testCase of casesToRun) {
      const caseStart = Date.now();
      let output, error, tokenUsage;

      try {
        const response = await agentFn(testCase.input, testCase.context);
        output = response.output || response;
        tokenUsage = response.usage || { inputTokens: 0, outputTokens: 0 };
      } catch (e) {
        error = e.message;
      }

      const scores = {};
      for (const dim of testCase.dimensions) {
        const scorer = this.scorers.get(dim);
        if (scorer && !error) {
          scores[dim] = await scorer({
            input: testCase.input,
            output,
            expected: testCase.expectedOutput,
            context: testCase.context,
          });
        } else if (error) {
          scores[dim] = 0;
        }
      }

      const latencyMs = Date.now() - caseStart;
      const passed = this._checkThresholds(scores);

      results.push({
        caseId: testCase.id,
        name: testCase.name,
        scores,
        passed,
        latencyMs,
        tokenUsage: tokenUsage || null,
        error: error || null,
        weight: testCase.weight,
      });
    }

    return {
      totalCases: casesToRun.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      errors: results.filter(r => r.error).length,
      results,
      aggregateScores: this._aggregate(results),
      duration: Date.now() - startTime,
    };
  }

  _checkThresholds(scores) {
    for (const [dim, score] of Object.entries(scores)) {
      const threshold = this.thresholds[dim];
      if (threshold !== undefined && score < threshold) return false;
    }
    return true;
  }

  _aggregate(results) {
    const agg = {};
    const validResults = results.filter(r => !r.error);

    for (const dim of this.dimensions) {
      const scores = validResults.map(r => r.scores[dim]).filter(s => s !== undefined);
      if (scores.length === 0) continue;

      const weights = validResults.filter(r => r.scores[dim] !== undefined).map(r => r.weight);
      const weightedSum = scores.reduce((s, score, i) => s + score * weights[i], 0);
      const totalWeight = weights.reduce((s, w) => s + w, 0);

      agg[dim] = {
        mean: Math.round((weightedSum / totalWeight) * 100) / 100,
        min: Math.min(...scores),
        max: Math.max(...scores),
        count: scores.length,
      };
    }
    return agg;
  }
}
