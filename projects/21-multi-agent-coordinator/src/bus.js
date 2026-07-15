/**
 * Message bus — typed pub/sub for agent-to-agent communication.
 *
 * Message types:
 *   TASK_REQUEST    — coordinator assigns a task to an agent
 *   TASK_RESULT     — agent reports completion
 *   TASK_FAILED     — agent reports failure
 *   ESCALATION      — agent can't handle it, escalates up
 *   HEARTBEAT       — agent alive signal
 *   BROADCAST       — coordinator announces to all agents
 */

export class MessageBus {
  constructor() {
    this.subscribers = new Map(); // channel → Set<handler>
    this.history = [];
    this.maxHistory = 500;
  }

  subscribe(channel, handler) {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    this.subscribers.get(channel).add(handler);
    return () => this.subscribers.get(channel)?.delete(handler);
  }

  publish(channel, message) {
    const envelope = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      channel,
      timestamp: Date.now(),
      ...message,
    };

    this.history.push(envelope);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    const handlers = this.subscribers.get(channel) || new Set();
    const wildcardHandlers = this.subscribers.get('*') || new Set();

    for (const handler of handlers) {
      try { handler(envelope); } catch (_) { /* handler error isolation */ }
    }
    for (const handler of wildcardHandlers) {
      try { handler(envelope); } catch (_) { /* handler error isolation */ }
    }

    return envelope;
  }

  getHistory(channel, limit = 50) {
    const msgs = channel
      ? this.history.filter(m => m.channel === channel)
      : this.history;
    return msgs.slice(-limit);
  }

  getStats() {
    const channels = new Map();
    for (const msg of this.history) {
      channels.set(msg.channel, (channels.get(msg.channel) || 0) + 1);
    }
    return {
      totalMessages: this.history.length,
      channels: Object.fromEntries(channels),
      activeSubscriptions: [...this.subscribers.entries()]
        .map(([ch, subs]) => ({ channel: ch, count: subs.size })),
    };
  }
}
