import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DB } from '../src/db.js';
import { AgentObserver } from '../src/tracer.js';

describe('AgentObserver', () => {
  let db;
  let observer;
  let threadId;

  beforeEach(() => {
    db = new DB(':memory:');
    observer = new AgentObserver(db);
    const thread = db.createThread('test');
    threadId = thread.id;
  });

  describe('tool ROI — n-gram relevance', () => {
    it('detects tool result used in answer via n-gram overlap', () => {
      const run = observer.startRun(threadId, 'What is the population of Tokyo?');

      const d1 = run.recordDecision({
        thought: 'I should search for Tokyo population',
        action: 'wikipedia_search',
        input: { query: 'Tokyo population' },
        tokensIn: 100, tokensOut: 30, latencyMs: 500,
      });
      run.attachToolResult(d1, {
        result: 'Tokyo population city proper 14 million residents metropolitan area 37 million',
        durationMs: 200,
      });

      const d2 = run.recordDecision({
        thought: 'I have the information now',
        action: 'respond',
        tokensIn: 200, tokensOut: 50, latencyMs: 300,
      });

      const report = run.end(
        'The population of Tokyo city proper is approximately 14 million residents. The greater metropolitan area has about 37 million people.',
        { totalTokensIn: 300, totalTokensOut: 80, provider: 'test', outcome: 'answered' }
      );

      assert.ok(report.toolRoi > 0.5, `Tool ROI should be > 0.5, got ${report.toolRoi}`);
      assert.equal(report.productive, 2);
      assert.equal(report.wasted, 0);
    });

    it('marks tool as wasted when result has no overlap with answer', () => {
      const run = observer.startRun(threadId, 'What is 2+2?');

      const d1 = run.recordDecision({
        thought: 'Let me search',
        action: 'wikipedia_search',
        input: { query: 'arithmetic' },
        tokensIn: 100, tokensOut: 30, latencyMs: 500,
      });
      run.attachToolResult(d1, {
        result: 'Quantum mechanics wavefunction probability amplitude Schrodinger equation eigenvalues',
        durationMs: 200,
      });

      run.recordDecision({
        thought: 'That was not helpful, I can answer directly',
        action: 'respond',
        tokensIn: 200, tokensOut: 50, latencyMs: 300,
      });

      const report = run.end(
        'The answer is 4.',
        { totalTokensIn: 300, totalTokensOut: 80, provider: 'test', outcome: 'answered' }
      );

      assert.equal(report.toolRoi, 0);
      assert.equal(report.wasted, 1);
    });

    it('handles multi-tool with mixed ROI', () => {
      const run = observer.startRun(threadId, 'Tell me about Paris');

      const d1 = run.recordDecision({
        thought: 'Search for Paris',
        action: 'wikipedia_search',
        input: { query: 'Paris' },
        tokensIn: 100, tokensOut: 30, latencyMs: 500,
      });
      run.attachToolResult(d1, {
        result: 'No results found for this query',
        durationMs: 100,
      });

      const d2 = run.recordDecision({
        thought: 'Try reading article directly',
        action: 'wikipedia_article',
        input: { title: 'Paris' },
        tokensIn: 100, tokensOut: 30, latencyMs: 500,
      });
      run.attachToolResult(d2, {
        result: 'Paris capital city France population 2.1 million Eiffel Tower Seine River cultural center',
        durationMs: 50,
      });

      run.recordDecision({
        thought: 'Now I can answer about Paris',
        action: 'respond',
        tokensIn: 200, tokensOut: 100, latencyMs: 1000,
      });

      const report = run.end(
        'Paris is the capital city of France with a population of about 2.1 million. It is known for the Eiffel Tower and the Seine River.',
        { totalTokensIn: 400, totalTokensOut: 160, provider: 'test', outcome: 'answered' }
      );

      assert.equal(report.toolRoi, 0.5, 'One of two tools should be useful');
      assert.equal(report.strategy, 'multi_tool');
    });
  });

  describe('strategy classification', () => {
    it('classifies direct answer', () => {
      const run = observer.startRun(threadId, 'Hi');
      run.recordDecision({ thought: 'Simple greeting', action: 'respond', tokensIn: 50, tokensOut: 20, latencyMs: 200 });
      const report = run.end('Hello!', { totalTokensIn: 50, totalTokensOut: 20, provider: 'test', outcome: 'answered' });
      assert.equal(report.strategy, 'direct');
    });

    it('classifies single tool', () => {
      const run = observer.startRun(threadId, 'Calculate 5*5');
      const d = run.recordDecision({ thought: 'Use calculator', action: 'calculator', input: { expression: '5*5' }, tokensIn: 100, tokensOut: 30, latencyMs: 500 });
      run.attachToolResult(d, { result: '25', durationMs: 1 });
      run.recordDecision({ thought: 'Done', action: 'respond', tokensIn: 150, tokensOut: 50, latencyMs: 300 });
      const report = run.end('5 times 5 equals 25.', { totalTokensIn: 250, totalTokensOut: 80, provider: 'test', outcome: 'answered' });
      assert.equal(report.strategy, 'single_tool');
    });

    it('classifies iterative (same tool repeated)', () => {
      const run = observer.startRun(threadId, 'Search twice');
      const d1 = run.recordDecision({ thought: 'First search', action: 'wikipedia_search', input: {}, tokensIn: 100, tokensOut: 30, latencyMs: 500 });
      run.attachToolResult(d1, { result: 'result 1', durationMs: 100 });
      const d2 = run.recordDecision({ thought: 'Search again', action: 'wikipedia_search', input: {}, tokensIn: 100, tokensOut: 30, latencyMs: 500 });
      run.attachToolResult(d2, { result: 'result 2', durationMs: 100 });
      run.recordDecision({ thought: 'Done', action: 'respond', tokensIn: 200, tokensOut: 50, latencyMs: 300 });
      const report = run.end('Results.', { totalTokensIn: 400, totalTokensOut: 110, provider: 'test', outcome: 'answered' });
      assert.equal(report.strategy, 'iterative');
    });
  });

  describe('coherence scoring', () => {
    it('scores 1.0 for single decision', () => {
      const run = observer.startRun(threadId, 'Hi');
      run.recordDecision({ thought: 'Greeting', action: 'respond', tokensIn: 50, tokensOut: 20, latencyMs: 200 });
      const report = run.end('Hello!', { totalTokensIn: 50, totalTokensOut: 20, provider: 'test', outcome: 'answered' });
      assert.equal(report.coherence, 1.0);
    });

    it('scores high when decisions reference each other', () => {
      const run = observer.startRun(threadId, 'Tokyo info');
      run.recordDecision({ thought: 'Search Tokyo population data', action: 'wikipedia_search', input: {}, tokensIn: 100, tokensOut: 30, latencyMs: 500 });
      run.recordDecision({ thought: 'Read Tokyo population article for more data', action: 'wikipedia_article', input: {}, tokensIn: 100, tokensOut: 30, latencyMs: 500 });
      run.recordDecision({ thought: 'Now I have Tokyo population data to respond', action: 'respond', tokensIn: 200, tokensOut: 50, latencyMs: 300 });
      const report = run.end('Tokyo has 14 million.', { totalTokensIn: 400, totalTokensOut: 110, provider: 'test', outcome: 'answered' });
      assert.equal(report.coherence, 1.0);
    });
  });

  describe('confidence signals', () => {
    it('extracts hedging signals', () => {
      const run = observer.startRun(threadId, 'test');
      run.recordDecision({ thought: 'I need to search for this information', action: 'respond', tokensIn: 50, tokensOut: 20, latencyMs: 200 });
      const report = run.end('Answer', { totalTokensIn: 50, totalTokensOut: 20, provider: 'test', outcome: 'answered' });
      const d = db.getRunWithDecisions(run.runId).decisions[0];
      assert.ok(d.confidenceSignals.includes('hedging'));
      assert.ok(d.confidenceSignals.includes('seeking_info'));
    });

    it('extracts confident signals', () => {
      const run = observer.startRun(threadId, 'test');
      run.recordDecision({ thought: 'I know the answer is straightforward', action: 'respond', tokensIn: 50, tokensOut: 20, latencyMs: 200 });
      run.end('Answer', { totalTokensIn: 50, totalTokensOut: 20, provider: 'test', outcome: 'answered' });
      const d = db.getRunWithDecisions(run.runId).decisions[0];
      assert.ok(d.confidenceSignals.includes('confident'));
    });
  });

  describe('DB persistence', () => {
    it('persists agent run and decisions', () => {
      const run = observer.startRun(threadId, 'test query');
      run.recordDecision({ thought: 'thinking', action: 'respond', tokensIn: 50, tokensOut: 20, latencyMs: 200 });
      run.end('answer text', { totalTokensIn: 50, totalTokensOut: 20, provider: 'ollama', outcome: 'answered' });

      const saved = db.getRunWithDecisions(run.runId);
      assert.ok(saved);
      assert.equal(saved.outcome, 'answered');
      assert.equal(saved.strategy, 'direct');
      assert.equal(saved.total_decisions, 1);
      assert.equal(saved.provider, 'ollama');
      assert.equal(saved.decisions.length, 1);
      assert.equal(saved.decisions[0].action, 'respond');
    });

    it('returns stats across multiple runs', () => {
      for (let i = 0; i < 3; i++) {
        const run = observer.startRun(threadId, `query ${i}`);
        run.recordDecision({ thought: 'ok', action: 'respond', tokensIn: 100, tokensOut: 50, latencyMs: 200 });
        run.end('answer', { totalTokensIn: 100, totalTokensOut: 50, provider: 'test', outcome: 'answered' });
      }

      const stats = db.getAgentRunStats();
      assert.equal(stats.total_runs, 3);
      assert.equal(stats.answered, 3);
      assert.equal(stats.total_tokens, 450);
    });
  });
});
