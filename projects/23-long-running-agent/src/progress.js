/**
 * ProgressReporter — collects step events and renders human-readable progress.
 */
export class ProgressReporter {
  #events = [];
  #totalSteps = 0;

  /**
   * @param {number} totalSteps
   */
  constructor(totalSteps) {
    this.#totalSteps = totalSteps;
  }

  /**
   * Record a progress event.
   * @param {{step: number, name: string, status: 'running'|'completed'|'failed'|'skipped'|'pending', elapsed?: number, cost?: number, message?: string}} event
   */
  record(event) {
    this.#events.push({ ...event, timestamp: Date.now() });
  }

  /**
   * Format current progress: step N/M, ETA based on average step duration.
   * @returns {string}
   */
  formatProgress() {
    const completed = this.#events.filter(e => e.status === 'completed');
    const running = this.#events.filter(e => e.status === 'running');
    const current = running.length > 0 ? running[running.length - 1] : null;

    const done = completed.length;
    const total = this.#totalSteps;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // ETA from average completed step duration
    let eta = '—';
    if (completed.length > 0) {
      const avgMs = completed.reduce((s, e) => s + (e.elapsed || 0), 0) / completed.length;
      const remaining = total - done;
      const etaMs = avgMs * remaining;
      eta = etaMs < 1000 ? `${Math.round(etaMs)}ms` : `${(etaMs / 1000).toFixed(1)}s`;
    }

    const stepInfo = current ? `  Current: ${current.name}` : '';
    return `Progress: ${done}/${total} (${pct}%)  ETA: ${eta}${stepInfo}`;
  }

  /**
   * Visual timeline of all steps with status icons.
   * @param {Array<{name: string}>} steps — the full step list
   * @returns {string}
   */
  formatTimeline(steps) {
    const statusIcon = {
      completed: '✓',
      running:   '▶',
      pending:   '○',
      failed:    '✗',
      skipped:   '⊘',
      aborted:   '⛔',
    };

    const lines = steps.map((step, i) => {
      // Find the latest event for this step
      const events = this.#events.filter(e => e.step === i);
      const latest = events.length > 0 ? events[events.length - 1] : null;
      const status = latest?.status ?? 'pending';
      const icon = statusIcon[status] || '?';
      const elapsed = latest?.elapsed != null ? ` (${latest.elapsed}ms)` : '';
      const msg = latest?.message ? ` — ${latest.message}` : '';
      return `  ${icon} Step ${i + 1}: ${step.name}${elapsed}${msg}`;
    });

    return lines.join('\n');
  }

  /** @returns {Array} raw event history */
  get events() { return [...this.#events]; }
}
