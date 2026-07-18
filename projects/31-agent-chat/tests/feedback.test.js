import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DB } from '../src/db.js';

describe('Feedback', () => {
  let db;

  beforeEach(() => {
    db = new DB(':memory:');
    db.createThread('ollama');
  });

  function getThreadId() {
    return db.listThreads()[0].id;
  }

  function addTestMessage() {
    const threadId = getThreadId();
    return db.addMessage(threadId, 'assistant', 'Test answer', {});
  }

  describe('addFeedback', () => {
    it('creates positive feedback', () => {
      const msg = addTestMessage();
      const result = db.addFeedback({
        messageId: msg.id,
        threadId: msg.threadId,
        rating: 1,
      });
      assert.equal(result.action, 'created');

      const saved = db.getFeedback(msg.id);
      assert.equal(saved.rating, 1);
      assert.equal(saved.message_id, msg.id);
    });

    it('creates negative feedback', () => {
      const msg = addTestMessage();
      db.addFeedback({ messageId: msg.id, threadId: msg.threadId, rating: -1 });
      const saved = db.getFeedback(msg.id);
      assert.equal(saved.rating, -1);
    });

    it('updates feedback on same message (toggle)', () => {
      const msg = addTestMessage();
      db.addFeedback({ messageId: msg.id, threadId: msg.threadId, rating: 1 });

      const result = db.addFeedback({ messageId: msg.id, threadId: msg.threadId, rating: -1 });
      assert.equal(result.action, 'updated');

      const saved = db.getFeedback(msg.id);
      assert.equal(saved.rating, -1);
    });

    it('saves optional comment', () => {
      const msg = addTestMessage();
      db.addFeedback({ messageId: msg.id, threadId: msg.threadId, rating: 1, comment: 'Very helpful' });
      const saved = db.getFeedback(msg.id);
      assert.equal(saved.comment, 'Very helpful');
    });
  });

  describe('getFeedbackStats', () => {
    it('returns aggregate stats', () => {
      const threadId = getThreadId();
      for (let i = 0; i < 5; i++) {
        const msg = db.addMessage(threadId, 'assistant', `Answer ${i}`, {});
        db.addFeedback({ messageId: msg.id, threadId, rating: i < 3 ? 1 : -1 });
      }

      const stats = db.getFeedbackStats();
      assert.equal(stats.total, 5);
      assert.equal(stats.positive, 3);
      assert.equal(stats.negative, 2);
      assert.equal(stats.satisfaction_pct, 60);
    });

    it('returns zeros when no feedback exists', () => {
      const stats = db.getFeedbackStats();
      assert.equal(stats.total, 0);
    });
  });
});
