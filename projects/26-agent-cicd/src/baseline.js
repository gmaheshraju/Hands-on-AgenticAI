export class BaselineComparator {
  constructor(config = {}) {
    this.baselines = new Map();
    this.regressionThreshold = config.regressionThreshold || 0.05; // 5% degradation = regression
    this.improvementThreshold = config.improvementThreshold || 0.10; // 10% improvement = noteworthy
  }

  saveBaseline(name, evalResults) {
    const baseline = {
      name,
      savedAt: Date.now(),
      scores: evalResults.aggregateScores,
      totalCases: evalResults.totalCases,
      passRate: evalResults.totalCases > 0 ? evalResults.passed / evalResults.totalCases : 0,
      duration: evalResults.duration,
      perCase: evalResults.results.map(r => ({
        caseId: r.caseId, scores: r.scores, latencyMs: r.latencyMs,
      })),
    };
    this.baselines.set(name, baseline);
    return baseline;
  }

  compare(baselineName, currentResults) {
    const baseline = this.baselines.get(baselineName);
    if (!baseline) return { error: 'baseline_not_found', name: baselineName };

    const currentScores = currentResults.aggregateScores;
    const currentPassRate = currentResults.totalCases > 0 ? currentResults.passed / currentResults.totalCases : 0;
    const comparisons = {};
    const regressions = [];
    const improvements = [];

    for (const [dim, baselineScore] of Object.entries(baseline.scores)) {
      const currentScore = currentScores[dim];
      if (!currentScore) {
        regressions.push({ dimension: dim, reason: 'dimension_missing' });
        continue;
      }

      const delta = currentScore.mean - baselineScore.mean;
      const pctChange = baselineScore.mean > 0 ? delta / baselineScore.mean : 0;

      comparisons[dim] = {
        baseline: baselineScore.mean,
        current: currentScore.mean,
        delta: Math.round(delta * 100) / 100,
        pctChange: Math.round(pctChange * 100) / 100,
        status: this._classifyChange(pctChange),
      };

      if (pctChange < -this.regressionThreshold) {
        regressions.push({ dimension: dim, delta, pctChange, baseline: baselineScore.mean, current: currentScore.mean });
      }
      if (pctChange > this.improvementThreshold) {
        improvements.push({ dimension: dim, delta, pctChange, baseline: baselineScore.mean, current: currentScore.mean });
      }
    }

    const passRateDelta = currentPassRate - baseline.passRate;

    return {
      baselineName,
      comparisons,
      regressions,
      improvements,
      passRate: {
        baseline: Math.round(baseline.passRate * 100),
        current: Math.round(currentPassRate * 100),
        delta: Math.round(passRateDelta * 100),
      },
      verdict: regressions.length > 0 ? 'REGRESSION' : (improvements.length > 0 ? 'IMPROVED' : 'STABLE'),
    };
  }

  _classifyChange(pctChange) {
    if (pctChange < -this.regressionThreshold) return 'regression';
    if (pctChange > this.improvementThreshold) return 'improved';
    return 'stable';
  }

  listBaselines() {
    return [...this.baselines.entries()].map(([name, b]) => ({
      name, savedAt: b.savedAt, totalCases: b.totalCases, passRate: Math.round(b.passRate * 100),
    }));
  }
}
