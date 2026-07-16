import { AgentExecutor } from './executor.js';

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       Zero-Trust Agent Executor — Production Demo       ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const executor = new AgentExecutor({
    sandbox: { maxFileOps: 10, blockedPaths: ['/etc', '.env', '.ssh', 'secrets'] },
    approvals: {
      timeout: 60000,
      autoApproveRules: [
        { name: 'auto_approve_low_risk', maxRisk: 'low' },
      ],
      escalationChain: ['team-lead', 'engineering-manager', 'cto'],
    },
  });

  // --- Register actions ---
  executor.actions.register({
    id: 'db:query', name: 'Database Query', category: 'database', riskLevel: 'low',
    schema: { required: ['query'], properties: { query: { type: 'string', maxLength: 5000 } } },
    handler: async (params) => ({ rows: [{ id: 1, name: 'Example' }], rowCount: 1, query: params.query }),
  });

  executor.actions.register({
    id: 'db:write', name: 'Database Write', category: 'database', riskLevel: 'medium',
    schema: { required: ['table', 'data'], properties: { table: { type: 'string' }, data: { type: 'object' } } },
    handler: async (params) => ({ inserted: 1, table: params.table }),
  });

  executor.actions.register({
    id: 'db:delete', name: 'Database Delete', category: 'database', riskLevel: 'high',
    requiresApproval: true,
    schema: { required: ['table', 'where'], properties: { table: { type: 'string' }, where: { type: 'string' } } },
    handler: async (params) => ({ deleted: 5, table: params.table }),
  });

  executor.actions.register({
    id: 'api:call', name: 'External API Call', category: 'api', riskLevel: 'medium',
    schema: { required: ['url', 'method'], properties: { url: { type: 'string' }, method: { type: 'string', enum: ['GET', 'POST', 'PUT'] } } },
    handler: async (params) => ({ status: 200, url: params.url }),
  });

  executor.actions.register({
    id: 'deploy:production', name: 'Production Deploy', category: 'deployment', riskLevel: 'critical',
    requiresApproval: true,
    schema: { required: ['service', 'version'], properties: { service: { type: 'string' }, version: { type: 'string' } } },
    handler: async (params) => ({ deployed: true, service: params.service, version: params.version }),
  });

  executor.actions.register({
    id: 'file:read', name: 'Read File', category: 'filesystem', riskLevel: 'low',
    schema: { required: ['path'], properties: { path: { type: 'string' } } },
    handler: async (params) => ({ content: `Contents of ${params.path}`, size: 1024 }),
  });

  // --- Set up policies ---
  executor.policy.addPolicy({
    id: 'allow-reads', name: 'Allow Read Operations', effect: 'allow', priority: 1,
    principals: ['*'], actions: ['db:query', 'file:read'], resources: ['*'],
  });

  executor.policy.addPolicy({
    id: 'allow-writes-elevated', name: 'Allow Writes for Elevated Agents', effect: 'allow', priority: 2,
    principals: ['*'], actions: ['db:write', 'api:call'], resources: ['*'],
    conditions: { trustLevel: { in: ['elevated', 'admin'] } },
  });

  executor.policy.addPolicy({
    id: 'allow-deploy-admin', name: 'Allow Deploy for Admin Only', effect: 'allow', priority: 3,
    principals: ['*'], actions: ['deploy:production', 'db:delete'], resources: ['*'],
    conditions: { trustLevel: { equals: 'admin' } },
  });

  executor.policy.addPolicy({
    id: 'deny-suspicious', name: 'Deny Agents with Violations', effect: 'deny', priority: 10,
    principals: ['*'], actions: ['*'], resources: ['*'],
    conditions: { violationCount: { greaterThan: 2 } },
  });

  // --- Register agents ---
  executor.registerAgent({
    id: 'data-analyst', name: 'Data Analyst Agent', trustLevel: 'basic',
    roles: ['reader'], permissions: { canReadFiles: true, canAccessDb: true },
  });

  executor.registerAgent({
    id: 'backend-worker', name: 'Backend Worker Agent', trustLevel: 'elevated',
    roles: ['reader', 'writer'], permissions: { canReadFiles: true, canWriteFiles: true, canAccessDb: true, canNetwork: true },
  });

  executor.registerAgent({
    id: 'deploy-bot', name: 'Deployment Bot', trustLevel: 'admin',
    roles: ['admin'], permissions: { canReadFiles: true, canNetwork: true, canExecProcess: true },
  });

  // --- Scenario 1: Least-privilege in action ---
  console.log('━━━ Scenario 1: Least-Privilege Access ━━━\n');

  const analystSession = executor.startSession('data-analyst');

  const readResult = await executor.execute(analystSession.id, 'db:query', { query: 'SELECT * FROM users LIMIT 10' });
  console.log(`  Analyst → db:query: ${readResult.success ? 'ALLOWED' : readResult.error}`);

  const writeResult = await executor.execute(analystSession.id, 'db:write', { table: 'users', data: { name: 'hack' } });
  console.log(`  Analyst → db:write: ${writeResult.success ? 'ALLOWED' : writeResult.error} (${writeResult.reason || ''})`);

  const deployResult = await executor.execute(analystSession.id, 'deploy:production', { service: 'api', version: '2.0' });
  console.log(`  Analyst → deploy:production: ${deployResult.success ? 'ALLOWED' : deployResult.error}`);

  // --- Scenario 2: Elevated trust ---
  console.log('\n━━━ Scenario 2: Elevated Trust Level ━━━\n');

  const workerSession = executor.startSession('backend-worker');

  const workerWrite = await executor.execute(workerSession.id, 'db:write', { table: 'logs', data: { msg: 'hello' } });
  console.log(`  Worker → db:write: ${workerWrite.success ? 'ALLOWED' : workerWrite.error}`);

  const workerApi = await executor.execute(workerSession.id, 'api:call', { url: 'https://api.internal/health', method: 'GET' });
  console.log(`  Worker → api:call: ${workerApi.success ? 'ALLOWED' : workerApi.error}`);

  const workerDeploy = await executor.execute(workerSession.id, 'deploy:production', { service: 'api', version: '2.0' });
  console.log(`  Worker → deploy:production: ${workerDeploy.success ? 'ALLOWED' : workerDeploy.error}`);

  // --- Scenario 3: Approval flow ---
  console.log('\n━━━ Scenario 3: Human-in-the-Loop Approval ━━━\n');

  const adminSession = executor.startSession('deploy-bot');

  const deleteReq = await executor.execute(adminSession.id, 'db:delete', { table: 'old_logs', where: 'created_at < 2024-01-01' });
  console.log(`  Deploy Bot → db:delete: ${deleteReq.error} (approval ID: ${deleteReq.approvalId})`);

  if (deleteReq.approvalId) {
    console.log(`  Escalating approval...`);
    const esc = executor.approvals.escalate(deleteReq.approvalId);
    console.log(`  Escalated to: ${esc.escalatedTo} (level ${esc.level})`);

    console.log(`  Team lead approves...`);
    executor.approvals.approve(deleteReq.approvalId, 'team-lead', 'Safe to delete old logs');
    const history = executor.approvals.getHistory({ action: 'db:delete' });
    console.log(`  Approval status: ${history[0].status}`);
  }

  // --- Scenario 4: Schema validation ---
  console.log('\n━━━ Scenario 4: Schema Validation ━━━\n');

  const badQuery = await executor.execute(analystSession.id, 'db:query', {});
  console.log(`  Empty query params: ${badQuery.error} — ${badQuery.details}`);

  const badMethod = await executor.execute(workerSession.id, 'api:call', { url: 'https://api.com', method: 'DELETE' });
  console.log(`  Invalid HTTP method: ${badMethod.error} — ${badMethod.details}`);

  // --- Scenario 5: Sandbox boundaries ---
  console.log('\n━━━ Scenario 5: Sandbox Enforcement ━━━\n');

  const sbCheck1 = executor.sandbox.checkPermission(analystSession.id, { type: 'file_read', target: '/app/data/report.csv' });
  console.log(`  Analyst file read (allowed dir): ${sbCheck1.allowed ? 'ALLOWED' : sbCheck1.reason}`);

  const sbCheck2 = executor.sandbox.checkPermission(analystSession.id, { type: 'file_read', target: '/etc/passwd' });
  console.log(`  Analyst read /etc/passwd: ${sbCheck2.allowed ? 'ALLOWED' : sbCheck2.reason}`);

  const sbCheck3 = executor.sandbox.checkPermission(analystSession.id, { type: 'file_read', target: '/app/.env' });
  console.log(`  Analyst read .env: ${sbCheck3.allowed ? 'ALLOWED' : sbCheck3.reason}`);

  const sbCheck4 = executor.sandbox.checkPermission(analystSession.id, { type: 'network', target: 'https://evil.com' });
  console.log(`  Analyst network call: ${sbCheck4.allowed ? 'ALLOWED' : sbCheck4.reason}`);

  const session = executor.sandbox.getSession(analystSession.id);
  console.log(`  Session state after violations: ${session.state} (${session.violations.length} violations)`);

  // --- Scenario 6: Dashboard ---
  console.log('\n━━━ Scenario 6: Security Dashboard ━━━\n');

  const dash = executor.dashboard();
  console.log(`  Active sessions: ${dash.activeSessions}`);
  console.log(`  Pending approvals: ${dash.pendingApprovals}`);
  console.log(`  Registered actions: ${dash.actions.totalActions} (${JSON.stringify(dash.actions.byRisk)})`);
  console.log(`  Security:`);
  console.log(`    Total actions: ${dash.security.totalActions}`);
  console.log(`    Denial rate: ${dash.security.denialRate}%`);
  console.log(`    Unique agents: ${dash.security.uniqueAgents}`);

  // Clean up
  executor.endSession(analystSession.id);
  executor.endSession(workerSession.id);
  executor.endSession(adminSession.id);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                    Demo Complete                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
}

main().catch(console.error);
