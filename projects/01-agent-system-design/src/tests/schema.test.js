import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  SEVERITY,
  CATEGORY,
  validateFinding,
  deduplicateFindings,
  sortFindings,
} from '../schema.js';

function makeFinding(overrides = {}) {
  return {
    file: 'src/index.js',
    line: 10,
    severity: SEVERITY.BUG,
    category: CATEGORY.LOGIC_ERROR,
    issue: 'Off-by-one in loop bound',
    suggestion: 'Use < instead of <=',
    ...overrides,
  };
}

describe('validateFinding', () => {
  it('accepts a well-formed finding', () => {
    const { valid, errors } = validateFinding(makeFinding());
    assert.strictEqual(valid, true);
    assert.deepStrictEqual(errors, []);
  });

  it('flags every missing required field', () => {
    const { valid, errors } = validateFinding({});
    assert.strictEqual(valid, false);
    // file, line, severity, category, issue, suggestion
    assert.strictEqual(errors.length, 6);
  });

  it('rejects an unknown severity value', () => {
    const { valid, errors } = validateFinding(makeFinding({ severity: 'catastrophic' }));
    assert.strictEqual(valid, false);
    assert.ok(errors.some((e) => e.includes('Invalid severity')));
  });

  it('rejects an unknown category value', () => {
    const { valid, errors } = validateFinding(makeFinding({ category: 'vibes' }));
    assert.strictEqual(valid, false);
    assert.ok(errors.some((e) => e.includes('Invalid category')));
  });

  it('rejects a negative line number', () => {
    const { valid, errors } = validateFinding(makeFinding({ line: -1 }));
    assert.strictEqual(valid, false);
    assert.ok(errors.some((e) => e.includes('Invalid line number')));
  });

  it('rejects a non-numeric line number', () => {
    const { valid, errors } = validateFinding(makeFinding({ line: '10' }));
    assert.strictEqual(valid, false);
    assert.ok(errors.some((e) => e.includes('Invalid line number')));
  });

  it('allows line 0 (file-level finding)', () => {
    const { valid } = validateFinding(makeFinding({ line: 0 }));
    assert.strictEqual(valid, true);
  });
});

describe('deduplicateFindings', () => {
  it('leaves distinct findings untouched', () => {
    const findings = [
      makeFinding({ file: 'a.js', issue: 'Issue A' }),
      makeFinding({ file: 'b.js', issue: 'Issue B' }),
    ];
    const result = deduplicateFindings(findings);
    assert.strictEqual(result.length, 2);
  });

  it('merges the same issue across files into one, tracking groupedFiles', () => {
    const findings = [
      makeFinding({ file: 'a.js', line: 5, issue: 'Missing null check' }),
      makeFinding({ file: 'b.js', line: 12, issue: 'Missing null check' }),
      makeFinding({ file: 'c.js', line: 1, issue: 'Missing null check' }),
    ];
    const result = deduplicateFindings(findings);
    assert.strictEqual(result.length, 1);
    // first occurrence is the base finding; the other two are recorded as groupedFiles
    assert.deepStrictEqual(result[0].groupedFiles, ['b.js:12', 'c.js:1']);
  });

  it('treats issue text case-insensitively and trims whitespace', () => {
    const findings = [
      makeFinding({ file: 'a.js', issue: 'Missing null check' }),
      makeFinding({ file: 'b.js', issue: '  MISSING NULL CHECK  ' }),
    ];
    const result = deduplicateFindings(findings);
    assert.strictEqual(result.length, 1);
  });

  it('keeps findings with the same issue text but different severity separate', () => {
    const findings = [
      makeFinding({ file: 'a.js', severity: SEVERITY.BUG, issue: 'Same issue' }),
      makeFinding({ file: 'b.js', severity: SEVERITY.NIT, issue: 'Same issue' }),
    ];
    const result = deduplicateFindings(findings);
    assert.strictEqual(result.length, 2);
  });

  it('returns an empty array for empty input', () => {
    assert.deepStrictEqual(deduplicateFindings([]), []);
  });
});

describe('sortFindings', () => {
  it('orders bug > security > suggestion > nit', () => {
    const findings = [
      makeFinding({ severity: SEVERITY.NIT }),
      makeFinding({ severity: SEVERITY.SUGGESTION }),
      makeFinding({ severity: SEVERITY.SECURITY }),
      makeFinding({ severity: SEVERITY.BUG }),
    ];
    const result = sortFindings(findings);
    assert.deepStrictEqual(
      result.map((f) => f.severity),
      [SEVERITY.BUG, SEVERITY.SECURITY, SEVERITY.SUGGESTION, SEVERITY.NIT],
    );
  });

  it('does not mutate the input array', () => {
    const findings = [makeFinding({ severity: SEVERITY.NIT }), makeFinding({ severity: SEVERITY.BUG })];
    const original = [...findings];
    sortFindings(findings);
    assert.deepStrictEqual(findings, original);
  });

  it('pushes unknown severities to the end', () => {
    const findings = [
      makeFinding({ severity: 'mystery' }),
      makeFinding({ severity: SEVERITY.NIT }),
    ];
    const result = sortFindings(findings);
    assert.strictEqual(result[result.length - 1].severity, 'mystery');
  });
});
