/**
 * Human approval gate node.
 *
 * In demo mode, auto-approves after a short delay.
 * In production, this would pause the workflow and wait for:
 *   - CLI confirmation (readline)
 *   - Webhook callback
 *   - Slack interaction
 */

/**
 * Approval handler registry — allows swapping in real approval mechanisms.
 */
let approvalHandler = null;

/**
 * Set a custom approval handler.
 * @param {Function} handler — async (nodeId, config, input) => { approved: boolean, approver: string, comment?: string }
 */
export function setApprovalHandler(handler) {
  approvalHandler = handler;
}

/**
 * Auto-approve handler for demo/testing.
 */
async function autoApprove(nodeId, config, input) {
  await new Promise((r) => setTimeout(r, 30));

  // Simulate rejection based on config
  if (config.rejectIf) {
    const value = config.rejectIf.field.split('.').reduce((o, k) => o?.[k], input);
    if (value === config.rejectIf.equals) {
      return {
        approved: false,
        approver: 'auto-reviewer',
        comment: config.rejectIf.reason || 'Condition met for rejection',
        decidedAt: new Date().toISOString(),
      };
    }
  }

  return {
    approved: true,
    approver: config.approver || 'auto-reviewer',
    comment: config.autoComment || 'Auto-approved in demo mode',
    decidedAt: new Date().toISOString(),
  };
}

/**
 * Execute an approval node.
 *
 * Config:
 *   - approver: string — who should approve (for display/routing)
 *   - message: string — approval prompt message
 *   - rejectIf: { field, equals, reason } — auto-reject condition (demo)
 *   - autoComment: string — comment when auto-approved
 *   - outputKey: string — key for approval result (default "approval")
 */
export async function executeApprovalNode(config, input) {
  const { outputKey = 'approval' } = config;

  const handler = approvalHandler || autoApprove;
  const result = await handler(config._nodeId || 'unknown', config, input);

  if (!result.approved) {
    const err = new Error(`Approval rejected by ${result.approver}: ${result.comment || 'no reason'}`);
    err.approvalResult = result;
    throw err;
  }

  return {
    ...input,
    [outputKey]: result,
  };
}
