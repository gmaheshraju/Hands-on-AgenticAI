import { createHash, randomUUID } from 'node:crypto';

/**
 * Immutable, tamper-evident event log with SHA-256 hash chain.
 *
 * Every entry links to the previous entry's hash, forming an append-only
 * chain that makes retroactive tampering detectable. Deleting or modifying
 * any entry breaks the chain from that point forward.
 *
 * Fields per entry:
 *   id, timestamp, agentId, action, input (redacted), output (redacted),
 *   decision, rationale, metadata, previousHash, hash
 */

const REDACT_KEYS = new Set([
  'password', 'secret', 'token', 'apiKey', 'api_key',
  'authorization', 'credential', 'ssn', 'creditCard',
  'credit_card', 'privateKey', 'private_key',
]);

const REDACTED = '[REDACTED]';

// ── helpers ──────────────────────────────────────────────────────────

function deepRedact(value, depth = 0) {
  if (depth > 10) return value;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(v => deepRedact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT_KEYS.has(k) ? REDACTED : deepRedact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function computeHash(previousHash, data) {
  const payload = JSON.stringify({ previousHash, ...data });
  return createHash('sha256').update(payload).digest('hex');
}

// ── EventLogger ──────────────────────────────────────────────────────

export class EventLogger {
  #entries = [];
  #index = {
    byId: new Map(),
    byAgent: new Map(),
    byAction: new Map(),
  };

  /** Total logged entries. */
  get length() {
    return this.#entries.length;
  }

  /**
   * Append an event to the immutable log.
   * Returns the frozen entry (with hash).
   */
  log({ agentId, action, input, output, decision, rationale, metadata = {} }) {
    if (!agentId) throw new Error('agentId is required');
    if (!action) throw new Error('action is required');

    const previousHash = this.#entries.length > 0
      ? this.#entries[this.#entries.length - 1].hash
      : '0'.repeat(64);

    const entry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      agentId,
      action,
      input: deepRedact(input),
      output: deepRedact(output),
      decision: decision ?? null,
      rationale: rationale ?? null,
      metadata,
      previousHash,
    };

    entry.hash = computeHash(previousHash, entry);

    const frozen = Object.freeze({ ...entry });
    this.#entries.push(frozen);

    // index
    this.#index.byId.set(frozen.id, frozen);
    if (!this.#index.byAgent.has(agentId)) this.#index.byAgent.set(agentId, []);
    this.#index.byAgent.get(agentId).push(frozen);
    if (!this.#index.byAction.has(action)) this.#index.byAction.set(action, []);
    this.#index.byAction.get(action).push(frozen);

    return frozen;
  }

  /** Retrieve entry by ID. */
  getById(id) {
    return this.#index.byId.get(id) ?? null;
  }

  /** Query entries by agentId. */
  queryByAgent(agentId) {
    return this.#index.byAgent.get(agentId) ?? [];
  }

  /** Query entries by action type. */
  queryByAction(action) {
    return this.#index.byAction.get(action) ?? [];
  }

  /** Query entries within a time range (ISO strings). */
  queryByTimeRange(startISO, endISO) {
    const start = new Date(startISO).getTime();
    const end = new Date(endISO).getTime();
    return this.#entries.filter(e => {
      const t = new Date(e.timestamp).getTime();
      return t >= start && t <= end;
    });
  }

  /** Return all entries (defensive copy). */
  getAll() {
    return [...this.#entries];
  }

  /**
   * Verify the integrity of the full chain.
   * Returns { valid, brokenAt } where brokenAt is the index of the
   * first tampered entry, or -1 if the chain is intact.
   */
  verifyChain() {
    for (let i = 0; i < this.#entries.length; i++) {
      const entry = this.#entries[i];
      const expectedPrevHash = i === 0
        ? '0'.repeat(64)
        : this.#entries[i - 1].hash;

      if (entry.previousHash !== expectedPrevHash) {
        return { valid: false, brokenAt: i };
      }

      // Recompute hash from data
      const { hash, ...data } = entry;
      const recomputed = computeHash(entry.previousHash, data);
      if (recomputed !== hash) {
        return { valid: false, brokenAt: i };
      }
    }
    return { valid: true, brokenAt: -1 };
  }

  /**
   * Export the log for external audit systems (JSON serializable).
   */
  export() {
    return {
      exportedAt: new Date().toISOString(),
      entryCount: this.#entries.length,
      chainValid: this.verifyChain().valid,
      entries: this.getAll(),
    };
  }
}

export { deepRedact, computeHash, REDACT_KEYS };
