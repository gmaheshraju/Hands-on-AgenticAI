/**
 * CheckpointStore — in-memory durable state store for long-running agent tasks.
 *
 * Every completed step is checkpointed so the executor can resume after a crash
 * without re-running work that already succeeded.
 */
export class CheckpointStore {
  /** @type {Map<string, Array<{version: number, state: object, timestamp: number}>>} */
  #store = new Map();

  /**
   * Save a checkpoint for a task. Auto-increments version.
   * @param {string} taskId
   * @param {object} state — serialisable task state
   * @returns {{version: number, timestamp: number}}
   */
  save(taskId, state) {
    if (!this.#store.has(taskId)) {
      this.#store.set(taskId, []);
    }
    const history = this.#store.get(taskId);
    const version = history.length + 1;
    const timestamp = Date.now();
    // Deep-clone to prevent external mutation of stored state
    const entry = { version, state: JSON.parse(JSON.stringify(state)), timestamp };
    history.push(entry);
    return { version, timestamp };
  }

  /**
   * Load the latest checkpoint for a task.
   * @param {string} taskId
   * @returns {object|null} — the state object, or null if no checkpoint exists
   */
  load(taskId) {
    const history = this.#store.get(taskId);
    if (!history || history.length === 0) return null;
    return JSON.parse(JSON.stringify(history[history.length - 1].state));
  }

  /**
   * List all checkpoints for a task (version, timestamp).
   * @param {string} taskId
   * @returns {Array<{version: number, timestamp: string}>}
   */
  listCheckpoints(taskId) {
    const history = this.#store.get(taskId);
    if (!history) return [];
    return history.map(e => ({
      version: e.version,
      timestamp: new Date(e.timestamp).toISOString(),
    }));
  }

  /**
   * Remove all checkpoints for a task.
   * @param {string} taskId
   */
  clear(taskId) {
    this.#store.delete(taskId);
  }

  /**
   * Number of checkpoints stored for a task.
   * @param {string} taskId
   * @returns {number}
   */
  count(taskId) {
    return this.#store.get(taskId)?.length ?? 0;
  }
}
