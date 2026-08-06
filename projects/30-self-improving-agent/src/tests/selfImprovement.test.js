/**
 * Tests for the deterministic core of the self-improving agent:
 * postmortem detectors, the scoring evaluator, prompt patching, the
 * versioned prompt store, and the scratchpad.
 *
 * These are the parts that must be correct BEFORE an LLM is in the loop —
 * a self-improving system that mis-scores its own runs will happily evolve
 * its prompt in the wrong direction.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { analyzeRun } from '../postmortem.js';
import { evaluate } from '../evaluator.js';
import { applyPatch } from '../improver.js';
import { loadHistory, saveVersion, getLatestPrompt, getBasePrompt } from '../prompts.js';
import { Scratchpad } from '../scratchpad.js';

const entry = (over = {}) => ({
  iteration: 1,
  tool: 'wikipedia_search',
  toolInput: { query: 'x' },
  toolResult: 'ok',
  newFactsAdded: 0,
  tokensIn: 100,
  timestamp: 1,
  ...over,
});

const DONE = { stopReason: 'AGENT_DONE', totalIterations: 5 };

// ═══════════════════════════════════════════
// Suite 1: postmortem detectors
// ═══════════════════════════════════════════
describe('analyzeRun — detectors', () => {
  it('flags single_source when synthesis happens off one article', () => {
    const trace = [
      entry({ iteration: 1, tool: 'wikipedia_article', toolInput: { title: 'CRISPR' }, newFactsAdded: 9 }),
      entry({ iteration: 2, tool: 'synthesize', toolInput: { answer: 'a' } }),
    ];
    const types = analyzeRun(DONE, trace).findings.map(f => f.type);
    assert.ok(types.includes('single_source'));
  });

  it('does not flag single_source when two distinct articles were read', () => {
    const trace = [
      entry({ iteration: 1, tool: 'wikipedia_article', toolInput: { title: 'CRISPR' }, newFactsAdded: 5 }),
      entry({ iteration: 2, tool: 'wikipedia_article', toolInput: { title: 'Cas9' }, newFactsAdded: 4 }),
      entry({ iteration: 3, tool: 'synthesize', toolInput: { answer: 'a' } }),
    ];
    const types = analyzeRun(DONE, trace).findings.map(f => f.type);
    assert.ok(!types.includes('single_source'));
  });

  it('flags premature_synthesis when fewer than 5 facts precede synthesize', () => {
    const trace = [
      entry({ iteration: 1, tool: 'wikipedia_article', toolInput: { title: 'A' }, newFactsAdded: 2 }),
      entry({ iteration: 2, tool: 'wikipedia_article', toolInput: { title: 'B' }, newFactsAdded: 1 }),
      entry({ iteration: 3, tool: 'synthesize', toolInput: { answer: 'a' } }),
    ];
    const f = analyzeRun(DONE, trace).findings.find(x => x.type === 'premature_synthesis');
    assert.ok(f, 'expected premature_synthesis');
    assert.equal(f.iteration, 3);
    assert.match(f.description, /only 3 facts/);
  });

  it('counts facts strictly BEFORE the synthesize iteration', () => {
    // 6 facts gathered before synthesis — above the threshold.
    const trace = [
      entry({ iteration: 1, tool: 'wikipedia_article', toolInput: { title: 'A' }, newFactsAdded: 6 }),
      entry({ iteration: 2, tool: 'wikipedia_article', toolInput: { title: 'B' }, newFactsAdded: 3 }),
      entry({ iteration: 3, tool: 'synthesize', toolInput: { answer: 'a' } }),
    ];
    const types = analyzeRun(DONE, trace).findings.map(f => f.type);
    assert.ok(!types.includes('premature_synthesis'));
  });

  it('flags repeated_action on an identical tool + input pair', () => {
    const trace = [
      entry({ iteration: 1, toolInput: { query: 'crispr' } }),
      entry({ iteration: 2, toolInput: { query: 'crispr' } }),
    ];
    const f = analyzeRun(DONE, trace).findings.find(x => x.type === 'repeated_action');
    assert.ok(f);
    assert.equal(f.severity, 'medium');
    assert.equal(f.iteration, 2);
  });

  it('flags no_synthesis and convergence_stall when the run stalls', () => {
    const trace = [entry({ iteration: 1 }), entry({ iteration: 2, toolInput: { query: 'y' } })];
    const types = analyzeRun({ stopReason: 'CONVERGENCE', totalIterations: 2 }, trace)
      .findings.map(f => f.type);
    assert.ok(types.includes('convergence_stall'));
    assert.ok(types.includes('no_synthesis'));
  });

  it('sorts findings high → medium → low so findings[0] is the top issue', () => {
    const trace = [
      entry({ iteration: 1, toolInput: { query: 'q' }, toolResult: 'article not found' }),
      entry({ iteration: 2, toolInput: { query: 'q' } }), // repeated → medium
      entry({ iteration: 3, tool: 'wikipedia_article', toolInput: { title: 'A' }, newFactsAdded: 1 }),
      entry({ iteration: 4, tool: 'synthesize', toolInput: { answer: 'a' } }), // → high
    ];
    const sev = analyzeRun(DONE, trace).findings.map(f => f.severity);
    assert.equal(sev[0], 'high');
    const rank = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < sev.length; i++) {
      assert.ok(rank[sev[i - 1]] <= rank[sev[i]], `unsorted at ${i}: ${sev.join(',')}`);
    }
  });

  it('scores primitives and names the weakest one', () => {
    const trace = [
      entry({ iteration: 1, tokensIn: 100 }),
      entry({ iteration: 2, toolInput: { query: 'y' }, toolResult: 'not found', tokensIn: 800 }),
      entry({ iteration: 3, toolInput: { query: 'z' }, tokensIn: 900 }),
    ];
    const { primitiveScores, weakestPrimitive, summary } = analyzeRun(
      { stopReason: 'MAX_ITERATIONS', totalIterations: 3 },
      trace,
    );
    // No search produced facts → contextDelivery floors at 0.3.
    assert.equal(primitiveScores.contextDelivery, 0.3);
    assert.equal(primitiveScores.orchestration, 0.3);
    const min = Math.min(...Object.values(primitiveScores));
    assert.equal(primitiveScores[weakestPrimitive], min);
    assert.match(summary, /Stop reason: MAX_ITERATIONS after 3 iterations/);
  });
});

// ═══════════════════════════════════════════
// Suite 2: evaluator
// ═══════════════════════════════════════════
describe('evaluate — scoring', () => {
  it('returns an all-zero scorecard when no answer was produced', async () => {
    const res = await evaluate({ question: 'q', answer: '', traceEntries: [], llm: null });
    assert.equal(res.composite, 0);
    assert.deepStrictEqual(res.scores, {
      factCount: 0, sourceDiversity: 0, coherence: 0, completeness: 0,
    });
    assert.equal(res.details.error, 'No answer produced');
  });

  it('falls back to 0.5 on LLM-graded dimensions when no llm is supplied', async () => {
    const res = await evaluate({ question: 'q', answer: 'A short line.', traceEntries: [], llm: null });
    assert.equal(res.scores.coherence, 0.5);
    assert.equal(res.scores.completeness, 0.5);
  });

  it('penalises a single source and rewards diversity', async () => {
    const one = [entry({ tool: 'wikipedia_article', toolInput: { title: 'A' } })];
    const five = ['A', 'B', 'C', 'D', 'E'].map(t =>
      entry({ tool: 'wikipedia_article', toolInput: { title: t } }));
    const answer = 'x'.repeat(50) + '.';

    const a = await evaluate({ question: 'q', answer, traceEntries: one, llm: null });
    const b = await evaluate({ question: 'q', answer, traceEntries: five, llm: null });

    assert.equal(a.scores.sourceDiversity, 0.2);
    assert.equal(b.scores.sourceDiversity, 1.0);
    assert.equal(b.details.sourcesRaw, 5);
    assert.ok(b.composite > a.composite);
  });

  it('deduplicates sources by article title', async () => {
    const trace = ['A', 'A', 'B'].map(t =>
      entry({ tool: 'wikipedia_article', toolInput: { title: t } }));
    const res = await evaluate({ question: 'q', answer: 'text.', traceEntries: trace, llm: null });
    assert.equal(res.details.sourcesRaw, 2);
  });

  it('caps factCount at 1.0 and composites the four weights', async () => {
    const answer = Array.from({ length: 12 }, (_, i) => `Fact number ${i} is long enough to count here`).join('. ') + '.';
    const trace = ['A', 'B', 'C', 'D', 'E'].map(t =>
      entry({ tool: 'wikipedia_article', toolInput: { title: t } }));
    const res = await evaluate({ question: 'q', answer, traceEntries: trace, llm: null });
    assert.equal(res.scores.factCount, 1.0);
    // 0.25*1 + 0.20*1 + 0.25*0.5 + 0.30*0.5 = 0.725 → rounded to 0.73
    assert.equal(res.composite, 0.73);
  });
});

// ═══════════════════════════════════════════
// Suite 3: prompt patching
// ═══════════════════════════════════════════
describe('applyPatch', () => {
  const PROMPT = '## Role\nYou are a research agent.\n\n## Process\nSearch, then read.\n';

  it('appends "add" patches with exactly one blank line and a trailing newline', () => {
    const out = applyPatch(PROMPT, { action: 'add', content: '\n## Quality\nCite sources.\n' });
    assert.ok(out.endsWith('## Quality\nCite sources.\n'));
    assert.ok(out.includes('read.\n\n## Quality'));
    assert.ok(!out.includes('\n\n\n'), 'should not accumulate blank lines');
  });

  it('is idempotent in shape — patching twice keeps the file well-formed', () => {
    const once = applyPatch(PROMPT, { action: 'add', content: 'A' });
    const twice = applyPatch(once, { action: 'add', content: 'B' });
    assert.equal(twice, PROMPT.trimEnd() + '\n\nA\n\nB\n');
  });

  it('replaces a named section in place, leaving later sections intact', () => {
    const out = applyPatch(
      PROMPT + '\n## Tools\nwikipedia_search\n',
      { action: 'replace', section: 'Process', content: '## Process\nRead three articles.' },
    );
    assert.ok(out.includes('## Process\nRead three articles.'));
    assert.ok(!out.includes('Search, then read.'));
    assert.ok(out.includes('## Tools'), 'must not swallow the following section');
    assert.ok(out.includes('## Role'));
  });

  it('degrades a replace of an unknown section into an append (never a data loss)', () => {
    const out = applyPatch(PROMPT, { action: 'replace', section: 'Nonexistent', content: '## New\nhi' });
    assert.ok(out.includes('## Role'));
    assert.ok(out.includes('## Process'));
    assert.ok(out.trimEnd().endsWith('## New\nhi'));
  });

  it('removes a named section', () => {
    const out = applyPatch(PROMPT, { action: 'remove', section: 'Process', content: '' });
    assert.ok(!out.includes('Search, then read.'));
    assert.ok(out.includes('## Role'));
  });

  it('treats an unknown action as an append rather than dropping the change', () => {
    const out = applyPatch(PROMPT, { action: 'sideways', content: 'kept' });
    assert.ok(out.trimEnd().endsWith('kept'));
  });
});

// ═══════════════════════════════════════════
// Suite 4: versioned prompt store
// ═══════════════════════════════════════════
describe('prompt history', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'prompts-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns the base prompt at version 1 when no history exists', () => {
    const { version, prompt } = getLatestPrompt(join(dir, 'missing'));
    assert.equal(version, 1);
    assert.equal(prompt, getBasePrompt());
    assert.deepStrictEqual(loadHistory(join(dir, 'missing')), []);
  });

  it('orders history numerically, not lexicographically (v10 after v9)', () => {
    for (const v of [1, 2, 9, 10, 11]) {
      saveVersion({ version: v, prompt: `p${v}`, composite: v / 100 }, dir);
    }
    assert.deepStrictEqual(loadHistory(dir).map(h => h.version), [1, 2, 9, 10, 11]);
    assert.equal(getLatestPrompt(dir).version, 11);
    assert.equal(getLatestPrompt(dir).prompt, 'p11');
  });

  it('round-trips the full version record', () => {
    const rec = { version: 3, prompt: 'x', composite: 0.61, patch: { action: 'add', content: 'y' } };
    saveVersion(rec, dir);
    assert.deepStrictEqual(loadHistory(dir)[0], rec);
  });
});

// ═══════════════════════════════════════════
// Suite 5: scratchpad
// ═══════════════════════════════════════════
describe('Scratchpad', () => {
  it('rejects empty keys or content', () => {
    const pad = new Scratchpad();
    assert.throws(() => pad.write('', 'body'), /required/);
    assert.throws(() => pad.write('k', ''), /required/);
  });

  it('estimates tokens and tracks read/write counters', () => {
    const pad = new Scratchpad();
    const tokens = pad.write('note', 'x'.repeat(40));
    assert.equal(tokens, 10);
    assert.equal(pad.read('note'), 'x'.repeat(40));
    assert.equal(pad.read('absent'), null);
    assert.deepStrictEqual(pad.stats(), { entries: 1, totalTokens: 10, writes: 1, reads: 1 });
  });

  it('evicts the oldest entry at capacity but overwrites in place', () => {
    const pad = new Scratchpad({ maxEntries: 3 });
    pad.write('a', 'A'); pad.write('b', 'B'); pad.write('c', 'C');
    pad.write('a', 'A2'); // overwrite — must not evict
    assert.equal(pad.stats().entries, 3);
    assert.equal(pad.read('a'), 'A2');

    pad.write('d', 'D'); // new key at capacity — evicts oldest ('a')
    assert.equal(pad.stats().entries, 3);
    assert.equal(pad.read('a'), null);
    assert.equal(pad.read('d'), 'D');
  });

  it('ranks search hits by fraction of query terms matched', () => {
    const pad = new Scratchpad();
    pad.write('crispr', 'CRISPR gene editing uses Cas9 protein');
    pad.write('solar', 'Solar panels convert light');
    const hits = pad.search('cas9 gene');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].key, 'crispr');
    assert.equal(hits[0].score, 1);
    assert.deepStrictEqual(pad.search('nothingmatcheshere'), []);
  });

  it('formats an index the model can read, and reports empty state', () => {
    const pad = new Scratchpad();
    assert.equal(pad.formatIndex(), '[Scratchpad is empty]');
    pad.write('finding-1', 'Line one\nLine two');
    const idx = pad.formatIndex();
    assert.match(idx, /finding-1/);
    assert.ok(!idx.includes('Line one\nLine two'), 'preview must be newline-flattened');
    pad.clear();
    assert.equal(pad.stats().entries, 0);
  });
});
