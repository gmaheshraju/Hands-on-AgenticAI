/**
 * Workflow state machine + execution trace.
 *
 * States: PENDING → RUNNING → WAITING_APPROVAL → COMPLETED | FAILED
 *
 * Each WorkflowRun tracks:
 *   - overall status
 *   - per-node execution records (input, output, duration, retries)
 *   - full ordered trace log
 */

const VALID_TRANSITIONS = {
  PENDING:          ['RUNNING'],
  RUNNING:          ['WAITING_APPROVAL', 'COMPLETED', 'FAILED'],
  WAITING_APPROVAL: ['RUNNING', 'FAILED'],
  COMPLETED:        [],
  FAILED:           [],
};

export class WorkflowRun {
  constructor(workflowId, inputData = {}) {
    this.id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.workflowId = workflowId;
    this.status = 'PENDING';
    this.inputData = structuredClone(inputData);
    this.nodeResults = new Map();   // nodeId → { status, input, output, durationMs, retries, error }
    this.trace = [];                // ordered list of trace events
    this.startedAt = null;
    this.completedAt = null;
    this.error = null;
  }

  transition(newStatus) {
    const allowed = VALID_TRANSITIONS[this.status];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(`Invalid transition: ${this.status} → ${newStatus}`);
    }
    const prev = this.status;
    this.status = newStatus;
    this.addTrace('state_change', { from: prev, to: newStatus });

    if (newStatus === 'RUNNING' && !this.startedAt) {
      this.startedAt = new Date();
    }
    if (newStatus === 'COMPLETED' || newStatus === 'FAILED') {
      this.completedAt = new Date();
    }
  }

  recordNodeStart(nodeId, input) {
    this.nodeResults.set(nodeId, {
      status: 'running',
      input: structuredClone(input),
      output: null,
      durationMs: null,
      retries: 0,
      error: null,
      startedAt: Date.now(),
    });
    this.addTrace('node_start', { nodeId, input });
  }

  recordNodeSuccess(nodeId, output, retries = 0) {
    const record = this.nodeResults.get(nodeId);
    if (record) {
      record.status = 'completed';
      record.output = structuredClone(output);
      record.durationMs = Date.now() - record.startedAt;
      record.retries = retries;
    }
    this.addTrace('node_complete', { nodeId, durationMs: record?.durationMs, retries });
  }

  recordNodeFailure(nodeId, error, retries = 0) {
    const record = this.nodeResults.get(nodeId);
    if (record) {
      record.status = 'failed';
      record.error = error;
      record.durationMs = Date.now() - record.startedAt;
      record.retries = retries;
    }
    this.addTrace('node_failed', { nodeId, error, retries });
  }

  recordNodeSkipped(nodeId, reason) {
    this.nodeResults.set(nodeId, {
      status: 'skipped',
      input: null,
      output: null,
      durationMs: 0,
      retries: 0,
      error: null,
      reason,
    });
    this.addTrace('node_skipped', { nodeId, reason });
  }

  addTrace(event, data = {}) {
    this.trace.push({
      timestamp: new Date().toISOString(),
      event,
      ...data,
    });
  }

  /**
   * Returns a compact summary of the run for display.
   */
  summary() {
    const nodes = [];
    for (const [nodeId, rec] of this.nodeResults) {
      nodes.push({
        node: nodeId,
        status: rec.status,
        durationMs: rec.durationMs,
        retries: rec.retries,
        ...(rec.error ? { error: rec.error } : {}),
        ...(rec.reason ? { reason: rec.reason } : {}),
      });
    }

    const totalMs = this.completedAt && this.startedAt
      ? this.completedAt.getTime() - this.startedAt.getTime()
      : null;

    return {
      runId: this.id,
      workflowId: this.workflowId,
      status: this.status,
      totalMs,
      nodes,
      traceCount: this.trace.length,
    };
  }
}
