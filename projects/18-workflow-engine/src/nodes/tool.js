/**
 * Tool execution node — runs a registered function (API call, DB query, file op, etc.)
 *
 * Tools are registered in a global registry. Each tool is an async function
 * that receives (params, input) and returns a result object.
 */

/** Global tool registry */
const toolRegistry = new Map();

/**
 * Register a tool function.
 * @param {string}   name — unique tool name
 * @param {Function} fn   — async (params, input) => result
 */
export function registerTool(name, fn) {
  toolRegistry.set(name, fn);
}

/**
 * Check if a tool is registered.
 */
export function hasTool(name) {
  return toolRegistry.has(name);
}

/**
 * Execute a tool node.
 *
 * Config:
 *   - tool: string — registered tool name
 *   - params: object — parameters passed to the tool function
 *   - outputKey: string — key for result in output (default: tool name)
 */
export async function executeToolNode(config, input) {
  const { tool, params = {}, outputKey } = config;

  if (!tool) throw new Error('Tool node requires a "tool" name in config');

  const fn = toolRegistry.get(tool);
  if (!fn) throw new Error(`Tool "${tool}" is not registered`);

  const result = await fn(params, input);
  const key = outputKey || tool;

  return {
    ...input,
    [key]: result,
  };
}

// ─── Built-in demo tools ───────────────────────────────────────────

registerTool('verifyEmail', async (params, input) => {
  await new Promise((r) => setTimeout(r, 30));
  const email = input.email || params.email || 'user@example.com';
  const valid = email.includes('@') && email.includes('.');
  return {
    email,
    valid,
    provider: email.split('@')[1] || 'unknown',
    checkedAt: new Date().toISOString(),
  };
});

registerTool('creditCheck', async (params, input) => {
  await new Promise((r) => setTimeout(r, 50));
  const score = 650 + Math.floor(Math.random() * 200); // 650–850
  return {
    customerId: input.customerId || params.customerId || 'CUST-001',
    creditScore: score,
    rating: score >= 750 ? 'excellent' : score >= 700 ? 'good' : 'fair',
    approved: score >= 650,
    checkedAt: new Date().toISOString(),
  };
});

registerTool('sendEmail', async (params, input) => {
  await new Promise((r) => setTimeout(r, 20));
  return {
    to: params.to || input.email || 'user@example.com',
    subject: params.subject || 'Notification',
    status: 'sent',
    messageId: `msg_${Date.now()}`,
    sentAt: new Date().toISOString(),
  };
});

registerTool('detectIncident', async (params, input) => {
  await new Promise((r) => setTimeout(r, 40));
  return {
    incidentId: `INC-${Date.now().toString(36).toUpperCase()}`,
    source: params.source || 'monitoring',
    metric: params.metric || 'error_rate',
    currentValue: 12.5,
    threshold: 5.0,
    detectedAt: new Date().toISOString(),
    description: input.alertMessage || 'Error rate exceeded threshold by 2.5x',
  };
});

registerTool('routeToTeam', async (params, input) => {
  await new Promise((r) => setTimeout(r, 20));
  const severity = input.severity || 'MEDIUM';
  const teamMap = {
    CRITICAL: { team: 'SRE-Oncall', channel: '#sre-critical', escalation: 'immediate' },
    HIGH:     { team: 'Platform-Engineering', channel: '#platform-incidents', escalation: '15min' },
    MEDIUM:   { team: 'DevOps', channel: '#devops-alerts', escalation: '1hr' },
    LOW:      { team: 'Engineering', channel: '#eng-notifications', escalation: '4hr' },
  };
  return teamMap[severity] || teamMap.MEDIUM;
});

registerTool('notifyTeam', async (params, input) => {
  await new Promise((r) => setTimeout(r, 20));
  return {
    notified: true,
    channel: input.routeToTeam?.channel || params.channel || '#general',
    team: input.routeToTeam?.team || params.team || 'Engineering',
    method: 'slack+pagerduty',
    notifiedAt: new Date().toISOString(),
  };
});

registerTool('publishContent', async (params, input) => {
  await new Promise((r) => setTimeout(r, 30));
  return {
    published: true,
    url: `https://blog.example.com/posts/${Date.now().toString(36)}`,
    publishedAt: new Date().toISOString(),
    contentLength: (input.llmResponse || input.finalContent || '').length,
  };
});
