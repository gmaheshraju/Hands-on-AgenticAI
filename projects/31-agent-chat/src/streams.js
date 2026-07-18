import config from './config.js';

export class StreamManager {
  constructor() {
    this.active = new Map();
    this.threadStreams = new Map();
  }

  start(messageId, threadId) {
    const stream = { events: [], clients: new Set(), done: false, threadId };
    this.active.set(messageId, stream);
    this.threadStreams.set(threadId, messageId);
    return stream;
  }

  emit(messageId, event, data) {
    const stream = this.active.get(messageId);
    if (!stream) return;

    const entry = { event, data, seq: stream.events.length };
    stream.events.push(entry);

    const ssePayload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of stream.clients) {
      try { client.write(ssePayload); } catch { stream.clients.delete(client); }
    }
  }

  subscribe(messageId, res) {
    const stream = this.active.get(messageId);
    if (!stream) return false;

    for (const entry of stream.events) {
      res.write(`event: ${entry.event}\ndata: ${JSON.stringify(entry.data)}\n\n`);
    }

    if (stream.done) {
      return 'completed';
    }

    stream.clients.add(res);
    return true;
  }

  unsubscribe(messageId, res) {
    const stream = this.active.get(messageId);
    if (stream) stream.clients.delete(res);
  }

  finish(messageId) {
    const stream = this.active.get(messageId);
    if (stream) {
      stream.done = true;
      this.threadStreams.delete(stream.threadId);
    }
    setTimeout(() => this.active.delete(messageId), config.server.streamBufferTtlMs);
  }

  getActiveMessageForThread(threadId) {
    return this.threadStreams.get(threadId) || null;
  }

  isStreaming(messageId) {
    const stream = this.active.get(messageId);
    return stream ? !stream.done : false;
  }

  abort(messageId) {
    const stream = this.active.get(messageId);
    if (stream) {
      stream.aborted = true;
      this.finish(messageId);
    }
  }

  isAborted(messageId) {
    return this.active.get(messageId)?.aborted ?? false;
  }
}
