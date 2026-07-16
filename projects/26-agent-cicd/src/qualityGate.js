export class QualityGate {
  constructor(config = {}) {
    this.rules = [];
    this.history = [];
  }

  addRule(rule) {
    const record = {
      id: rule.id || `rule_${this.rules.length + 1}`,
      name: rule.name,
      type: rule.type, // 'threshold' | 'regression' | 'custom'
      dimension: rule.dimension,
      operator: rule.operator, // 'gte' | 'lte' | 'eq' | 'gt' | 'lt'
      value: rule.value,
      severity: rule.severity || 'error', // 'error' | 'warning'
      check: rule.check, // custom function for type='custom'
    };
    this.rules.push(record);
    return record;
  }

  evaluate(evalResults, baselineComparison) {
    const violations = [];
    const warnings = [];
    const passed = [];

    for (const rule of this.rules) {
      const result = this._evaluateRule(rule, evalResults, baselineComparison);

      if (result.passed) {
        passed.push({ ruleId: rule.id, name: rule.name });
      } else if (rule.severity === 'warning') {
        warnings.push({ ruleId: rule.id, name: rule.name, detail: result.detail });
      } else {
        violations.push({ ruleId: rule.id, name: rule.name, detail: result.detail });
      }
    }

    const verdict = violations.length > 0 ? 'BLOCK' : (warnings.length > 0 ? 'WARN' : 'PASS');

    const decision = {
      verdict,
      violations,
      warnings,
      passed,
      totalRules: this.rules.length,
      timestamp: Date.now(),
    };

    this.history.push(decision);
    return decision;
  }

  _evaluateRule(rule, evalResults, baselineComparison) {
    if (rule.type === 'threshold') {
      const score = evalResults.aggregateScores?.[rule.dimension]?.mean;
      if (score === undefined) {
        return { passed: false, detail: `Dimension ${rule.dimension} not found in results` };
      }
      const passed = this._compare(score, rule.operator, rule.value);
      return { passed, detail: passed ? null : `${rule.dimension}: ${score} ${rule.operator} ${rule.value} failed` };
    }

    if (rule.type === 'regression') {
      if (!baselineComparison || baselineComparison.error) {
        return { passed: true, detail: 'No baseline to compare against' };
      }
      const comparison = baselineComparison.comparisons?.[rule.dimension];
      if (!comparison) {
        return { passed: false, detail: `Dimension ${rule.dimension} missing from comparison` };
      }
      const passed = comparison.status !== 'regression';
      return { passed, detail: passed ? null : `${rule.dimension} regressed: ${comparison.pctChange * 100}%` };
    }

    if (rule.type === 'custom' && rule.check) {
      const result = rule.check(evalResults, baselineComparison);
      return { passed: result.passed, detail: result.detail };
    }

    return { passed: true };
  }

  _compare(actual, operator, expected) {
    switch (operator) {
      case 'gte': return actual >= expected;
      case 'lte': return actual <= expected;
      case 'gt': return actual > expected;
      case 'lt': return actual < expected;
      case 'eq': return actual === expected;
      default: return false;
    }
  }
}
