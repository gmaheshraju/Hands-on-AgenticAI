/**
 * Agent definitions — each agent is a capability card with skill handlers.
 *
 * In production, these would be separate processes or containers.
 * Here they're simulated with async functions that mimic real work.
 */

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Create a simulated skill handler.
 * Each handler takes { description, attempt, escalatedFrom, reason }
 * and returns a result with _durationMs.
 */
function createHandler(agentName, skillName, simulateFn) {
  return async (input) => {
    const start = Date.now();
    const result = await simulateFn(input);
    return { ...result, _durationMs: Date.now() - start, _agent: agentName, _skill: skillName };
  };
}

// ─── Junior Developer Agent ──────────────────────────────────────

export const juniorDevCard = {
  id: 'junior-dev',
  name: 'Junior Developer',
  maxConcurrency: 3,
  escalatesTo: 'senior-dev',
  skills: [
    {
      name: 'code',
      cost: 0.02,
      latencyMs: 200,
      handler: createHandler('Junior Dev', 'code', async (input) => {
        await delay(80 + Math.random() * 120);
        // 30% chance of failure to demonstrate escalation
        if (input.attempt === 0 && Math.random() < 0.3) {
          throw new Error('Complexity exceeds junior capability — needs senior review');
        }
        return {
          output: `Implementation draft for: ${input.description.slice(0, 60)}`,
          linesOfCode: 50 + Math.floor(Math.random() * 150),
          testsWritten: Math.floor(Math.random() * 5),
          confidence: 0.7,
        };
      }),
    },
    {
      name: 'test',
      cost: 0.01,
      latencyMs: 100,
      handler: createHandler('Junior Dev', 'test', async (input) => {
        await delay(50 + Math.random() * 80);
        const testCount = 5 + Math.floor(Math.random() * 10);
        return {
          output: `Test suite for: ${input.description.slice(0, 60)}`,
          testsWritten: testCount,
          coverage: (60 + Math.random() * 25).toFixed(1) + '%',
          passed: testCount,
          failed: 0,
        };
      }),
    },
  ],
};

// ─── Senior Developer Agent ──────────────────────────────────────

export const seniorDevCard = {
  id: 'senior-dev',
  name: 'Senior Developer',
  maxConcurrency: 2,
  escalatesTo: null,
  skills: [
    {
      name: 'code',
      cost: 0.08,
      latencyMs: 300,
      handler: createHandler('Senior Dev', 'code', async (input) => {
        await delay(100 + Math.random() * 200);
        return {
          output: `Production implementation: ${input.description.slice(0, 60)}`,
          linesOfCode: 100 + Math.floor(Math.random() * 300),
          testsWritten: 5 + Math.floor(Math.random() * 10),
          confidence: 0.95,
          escalatedFrom: input.escalatedFrom || null,
        };
      }),
    },
    {
      name: 'review',
      cost: 0.05,
      latencyMs: 200,
      handler: createHandler('Senior Dev', 'review', async (input) => {
        await delay(80 + Math.random() * 120);
        return {
          output: `Code review for: ${input.description.slice(0, 60)}`,
          findings: Math.floor(Math.random() * 5),
          severity: Math.random() > 0.7 ? 'high' : 'low',
          approved: Math.random() > 0.2,
        };
      }),
    },
    {
      name: 'design',
      cost: 0.06,
      latencyMs: 250,
      handler: createHandler('Senior Dev', 'design', async (input) => {
        await delay(100 + Math.random() * 150);
        return {
          output: `Architecture design: ${input.description.slice(0, 60)}`,
          components: ['API Gateway', 'Service Layer', 'Data Store', 'Cache'],
          patterns: ['Repository', 'Event-Driven', 'CQRS'],
        };
      }),
    },
    {
      name: 'test',
      cost: 0.04,
      latencyMs: 150,
      handler: createHandler('Senior Dev', 'test', async (input) => {
        await delay(60 + Math.random() * 100);
        const testCount = 10 + Math.floor(Math.random() * 15);
        return {
          output: `Comprehensive test suite: ${input.description.slice(0, 60)}`,
          testsWritten: testCount,
          coverage: (80 + Math.random() * 15).toFixed(1) + '%',
          passed: testCount,
          failed: 0,
          includesEdgeCases: true,
        };
      }),
    },
  ],
};

// ─── Data Analyst Agent ──────────────────────────────────────────

export const dataAnalystCard = {
  id: 'data-analyst',
  name: 'Data Analyst',
  maxConcurrency: 3,
  escalatesTo: null,
  skills: [
    {
      name: 'analyze',
      cost: 0.03,
      latencyMs: 200,
      handler: createHandler('Data Analyst', 'analyze', async (input) => {
        await delay(80 + Math.random() * 120);
        return {
          output: `Analysis: ${input.description.slice(0, 60)}`,
          dataPoints: 1000 + Math.floor(Math.random() * 5000),
          insights: ['Trend detected: 40% increase', 'Anomaly in Q3 data', 'Correlation found'],
          confidence: 0.88,
        };
      }),
    },
    {
      name: 'research',
      cost: 0.02,
      latencyMs: 300,
      handler: createHandler('Data Analyst', 'research', async (input) => {
        await delay(100 + Math.random() * 200);
        return {
          output: `Research findings: ${input.description.slice(0, 60)}`,
          sources: 5 + Math.floor(Math.random() * 10),
          keyFindings: ['Market growing 15% YoY', 'Three competitors', 'Regulatory changes pending'],
        };
      }),
    },
    {
      name: 'monitor',
      cost: 0.01,
      latencyMs: 100,
      handler: createHandler('Data Analyst', 'monitor', async (input) => {
        await delay(40 + Math.random() * 60);
        return {
          output: `Monitoring check: ${input.description.slice(0, 60)}`,
          metrics: { errorRate: '0.2%', p99Latency: '45ms', uptime: '99.97%' },
          alerts: [],
          healthy: true,
        };
      }),
    },
  ],
};

// ─── DevOps Agent ────────────────────────────────────────────────

export const devOpsCard = {
  id: 'devops',
  name: 'DevOps Engineer',
  maxConcurrency: 2,
  escalatesTo: 'senior-dev',
  skills: [
    {
      name: 'deploy',
      cost: 0.04,
      latencyMs: 500,
      handler: createHandler('DevOps', 'deploy', async (input) => {
        await delay(150 + Math.random() * 250);
        return {
          output: `Deployment: ${input.description.slice(0, 60)}`,
          environment: 'production',
          version: `v1.${Math.floor(Math.random() * 20)}.${Math.floor(Math.random() * 100)}`,
          status: 'healthy',
          rollbackAvailable: true,
        };
      }),
    },
    {
      name: 'monitor',
      cost: 0.01,
      latencyMs: 100,
      handler: createHandler('DevOps', 'monitor', async (input) => {
        await delay(40 + Math.random() * 60);
        return {
          output: `Health check: ${input.description.slice(0, 60)}`,
          metrics: { cpu: '23%', memory: '45%', disk: '62%' },
          services: { api: 'healthy', db: 'healthy', cache: 'healthy' },
          healthy: true,
        };
      }),
    },
  ],
};

// ─── Writer Agent ────────────────────────────────────────────────

export const writerCard = {
  id: 'writer',
  name: 'Technical Writer',
  maxConcurrency: 2,
  escalatesTo: null,
  skills: [
    {
      name: 'write',
      cost: 0.03,
      latencyMs: 300,
      handler: createHandler('Writer', 'write', async (input) => {
        await delay(100 + Math.random() * 200);
        return {
          output: `Document: ${input.description.slice(0, 60)}`,
          wordCount: 500 + Math.floor(Math.random() * 1500),
          sections: ['Executive Summary', 'Analysis', 'Recommendations', 'Appendix'],
          readabilityScore: (70 + Math.random() * 20).toFixed(1),
        };
      }),
    },
  ],
};

// ─── Operations Agent ────────────────────────────────────────────

export const opsCard = {
  id: 'ops',
  name: 'Operations Agent',
  maxConcurrency: 5,
  escalatesTo: null,
  skills: [
    {
      name: 'validate',
      cost: 0.01,
      latencyMs: 50,
      handler: createHandler('Ops', 'validate', async (input) => {
        await delay(20 + Math.random() * 40);
        return {
          output: `Validation: ${input.description.slice(0, 60)}`,
          valid: true,
          checks: ['schema', 'permissions', 'eligibility'],
          passed: 3,
          failed: 0,
        };
      }),
    },
    {
      name: 'provision',
      cost: 0.02,
      latencyMs: 200,
      handler: createHandler('Ops', 'provision', async (input) => {
        await delay(80 + Math.random() * 120);
        return {
          output: `Provisioned: ${input.description.slice(0, 60)}`,
          resources: ['account', 'storage', 'api-key'],
          status: 'active',
        };
      }),
    },
    {
      name: 'notify',
      cost: 0.005,
      latencyMs: 30,
      handler: createHandler('Ops', 'notify', async (input) => {
        await delay(10 + Math.random() * 30);
        return {
          output: `Notification sent: ${input.description.slice(0, 60)}`,
          channel: 'email+slack',
          delivered: true,
        };
      }),
    },
  ],
};

export const ALL_AGENTS = [
  juniorDevCard,
  seniorDevCard,
  dataAnalystCard,
  devOpsCard,
  writerCard,
  opsCard,
];
