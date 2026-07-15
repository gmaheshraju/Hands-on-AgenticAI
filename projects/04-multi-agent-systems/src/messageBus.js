/**
 * MessageBus — inter-agent communication layer.
 *
 * Every message flowing between agents passes through here.
 * The bus keeps a full ordered log so the supervisor (and humans)
 * can inspect the entire conversation after the pipeline finishes.
 *
 * Message shape:
 *   { id, from, to, type, payload, timestamp }
 *
 * Types:
 *   RESEARCH_NOTES  — Researcher  -> Writer
 *   DRAFT           — Writer      -> Editor
 *   EDIT_REVIEW     — Editor      -> Supervisor (accept / reject)
 *   REVISION_REQ    — Supervisor  -> Writer     (retry with feedback)
 *   FACT_CHECK      — Fact-Checker -> Supervisor
 *   FINAL           — Supervisor  -> output
 */

let counter = 0;

export function createMessageBus() {
  const log = [];
  const subscribers = new Map();   // channel -> [handler]

  function nextId() {
    return `msg_${++counter}`;
  }

  /** Subscribe to messages addressed to `channel` (an agent name). */
  function subscribe(channel, handler) {
    if (!subscribers.has(channel)) subscribers.set(channel, []);
    subscribers.get(channel).push(handler);
  }

  /** Publish a message. Synchronously invokes subscribers for `msg.to`. */
  function publish(msg) {
    const full = {
      id: nextId(),
      timestamp: new Date().toISOString(),
      ...msg,
    };
    log.push(full);
    printMessage(full);

    const handlers = subscribers.get(full.to) || [];
    for (const h of handlers) h(full);
    return full;
  }

  /** Return the full ordered log. */
  function getLog() {
    return [...log];
  }

  /** Pretty-print a single message to the console. */
  function printMessage(msg) {
    const arrow = `${msg.from} --> ${msg.to}`;
    const preview =
      typeof msg.payload === 'string'
        ? msg.payload.slice(0, 120)
        : JSON.stringify(msg.payload).slice(0, 120);
    console.log(
      `  [${msg.id}] ${arrow}  (${msg.type})  ${preview}${preview.length >= 120 ? '...' : ''}`
    );
  }

  /** Print a compact summary of all messages. */
  function printSummary() {
    console.log('\n=== Message Bus Log ===');
    console.log(`Total messages: ${log.length}\n`);
    for (const msg of log) {
      console.log(
        `  ${msg.id} | ${msg.timestamp} | ${msg.from} -> ${msg.to} | ${msg.type}`
      );
    }
    console.log('=== End Log ===\n');
  }

  return { subscribe, publish, getLog, printSummary };
}
