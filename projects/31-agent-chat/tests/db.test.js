import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DB } from '../src/db.js';

describe('DB', () => {
  let db;

  beforeEach(() => {
    db = new DB(':memory:');
  });

  describe('threads', () => {
    it('creates and retrieves a thread', () => {
      const thread = db.createThread('ollama');
      assert.ok(thread.id);
      assert.equal(thread.provider, 'ollama');

      const fetched = db.getThread(thread.id);
      assert.equal(fetched.id, thread.id);
    });

    it('lists threads ordered by updated_at', () => {
      db.createThread('ollama');
      db.createThread('nvidia');
      const threads = db.listThreads();
      assert.equal(threads.length, 2);
    });

    it('updates thread title', () => {
      const thread = db.createThread('ollama');
      db.updateThreadTitle(thread.id, 'My Chat');
      const updated = db.getThread(thread.id);
      assert.equal(updated.title, 'My Chat');
    });
  });

  describe('messages', () => {
    it('adds and retrieves messages', () => {
      const thread = db.createThread('ollama');
      const msg = db.addMessage(thread.id, 'user', 'Hello');
      assert.ok(msg.id);
      assert.equal(msg.role, 'user');
      assert.equal(msg.content, 'Hello');
    });

    it('builds parent-child chain', () => {
      const thread = db.createThread('ollama');
      const m1 = db.addMessage(thread.id, 'user', 'Q1');
      const m2 = db.addMessage(thread.id, 'assistant', 'A1', { parentId: m1.id });
      const m3 = db.addMessage(thread.id, 'user', 'Q2', { parentId: m2.id });

      const chain = db.getAncestorChain(m3.id);
      assert.equal(chain.length, 3);
      assert.equal(chain[0].content, 'Q1');
      assert.equal(chain[2].content, 'Q2');
    });

    it('detects branch points', () => {
      const thread = db.createThread('ollama');
      const m1 = db.addMessage(thread.id, 'user', 'Q1');
      db.addMessage(thread.id, 'assistant', 'A1', { parentId: m1.id });
      db.addMessage(thread.id, 'assistant', 'A2', { parentId: m1.id });

      const parent = db.getMessage(m1.id);
      assert.equal(parent.branch_point, 1);
    });

    it('gets active branch (latest path)', () => {
      const thread = db.createThread('ollama');
      const m1 = db.addMessage(thread.id, 'user', 'Q1');
      const m2 = db.addMessage(thread.id, 'assistant', 'A1', { parentId: m1.id });
      db.addMessage(thread.id, 'user', 'Q2', { parentId: m2.id });

      const branch = db.getActiveBranch(thread.id);
      assert.equal(branch.length, 3);
    });
  });

  describe('agent runs', () => {
    it('creates and ends a run', () => {
      db.createAgentRun({ id: 'run-1', threadId: null, userMessage: 'test', startTime: 1000 });
      db.endAgentRun('run-1', {
        endTime: 2000, outcome: 'answered', strategy: 'direct',
        totalDecisions: 1, productiveDecisions: 1, wastedDecisions: 0,
        toolRoiScore: 1, reasoningCoherence: 1, tokensIn: 100, tokensOut: 50, provider: 'test',
      });

      const run = db.getAgentRun('run-1');
      assert.equal(run.outcome, 'answered');
      assert.equal(run.duration_ms, 1000);
      assert.equal(run.strategy, 'direct');
    });

    it('stores and retrieves decisions', () => {
      db.createAgentRun({ id: 'run-2', threadId: null, userMessage: 'test', startTime: 1000 });
      db.createDecision({
        id: 'dec-1', runId: 'run-2', sequence: 1, thought: 'thinking',
        action: 'respond', input: '{}', tokensIn: 50, tokensOut: 20,
        latencyMs: 200, provider: 'test', toolResult: null, toolDurationMs: null,
        toolError: null, toolResultUsed: false, productive: true,
        confidenceSignals: '["confident"]',
      });

      const withDecisions = db.getRunWithDecisions('run-2');
      assert.equal(withDecisions.decisions.length, 1);
      assert.equal(withDecisions.decisions[0].action, 'respond');
      assert.deepEqual(withDecisions.decisions[0].confidenceSignals, ['confident']);
      assert.equal(withDecisions.decisions[0].productive, true);
    });

    it('computes tool effectiveness', () => {
      db.createAgentRun({ id: 'run-3', threadId: null, userMessage: 'test', startTime: 1000 });

      db.createDecision({
        id: 'dec-2', runId: 'run-3', sequence: 1, thought: 'search',
        action: 'wikipedia_search', input: '{}', tokensIn: 100, tokensOut: 30,
        latencyMs: 500, provider: 'test', toolResult: 'some result', toolDurationMs: 200,
        toolError: null, toolResultUsed: true, productive: true,
        confidenceSignals: '[]',
      });

      db.createDecision({
        id: 'dec-3', runId: 'run-3', sequence: 2, thought: 'search again',
        action: 'wikipedia_search', input: '{}', tokensIn: 100, tokensOut: 30,
        latencyMs: 500, provider: 'test', toolResult: 'nothing useful', toolDurationMs: 100,
        toolError: null, toolResultUsed: false, productive: false,
        confidenceSignals: '[]',
      });

      const effectiveness = db.getToolEffectiveness();
      assert.equal(effectiveness.length, 1);
      assert.equal(effectiveness[0].tool_name, 'wikipedia_search');
      assert.equal(effectiveness[0].times_called, 2);
      assert.equal(effectiveness[0].times_used_in_answer, 1);
      assert.equal(effectiveness[0].roi_pct, 50);
    });
  });

  describe('context summaries', () => {
    it('saves and retrieves summary', () => {
      const thread = db.createThread('ollama');
      db.saveContextSummary(thread.id, 'User asked about Tokyo', 5);

      const summary = db.getContextSummary(thread.id);
      assert.equal(summary.summary, 'User asked about Tokyo');
      assert.equal(summary.message_count, 5);
    });

    it('upserts on same thread', () => {
      const thread = db.createThread('ollama');
      db.saveContextSummary(thread.id, 'First summary', 3);
      db.saveContextSummary(thread.id, 'Updated summary', 6);

      const summary = db.getContextSummary(thread.id);
      assert.equal(summary.summary, 'Updated summary');
      assert.equal(summary.message_count, 6);
    });
  });

  describe('facts', () => {
    it('adds and searches facts via FTS', () => {
      db.addFact('Tokyo', 'has population', '14 million');
      const results = db.searchFacts('Tokyo population');
      assert.ok(results.length > 0);
      assert.equal(results[0].subject, 'Tokyo');
    });

    it('reinforces existing facts', () => {
      db.addFact('Paris', 'is capital of', 'France');
      const result = db.addFact('Paris', 'is capital of', 'France');
      assert.equal(result.action, 'reinforced');
    });
  });
});
