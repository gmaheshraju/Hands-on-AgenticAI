import { randomUUID } from 'crypto';
import { Store } from './store.js';
import { Tracer, MODEL_PRICING } from './tracer.js';
import { CostTracker } from './costTracker.js';
// QualityScorer and DriftDetector imported when available;
// simulator inserts directly via Store for timestamp control.
// import { QualityScorer } from './qualityScorer.js';
// import { DriftDetector } from './driftDetector.js';

const AGENTS = ['research-agent', 'code-assistant', 'customer-support', 'data-analyst'];
const MODELS = ['claude-3-sonnet', 'claude-3-haiku', 'gpt-4o', 'gpt-4o-mini'];
const WORKFLOWS = ['summarize', 'code-review', 'question-answer', 'data-extraction', 'chat'];
const USERS = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];
const TOOLS = ['web_search', 'code_execute', 'file_read', 'database_query', 'calculator'];

// ─── Helpers ────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

/** Weighted random hour — peaks during 9am-6pm business hours. */
function weightedHour() {
  // 70% chance of business hours (9-18), 30% off-hours
  if (Math.random() < 0.7) {
    return randInt(9, 17); // 9am-5pm
  }
  // off-hours: 0-8 or 18-23
  return Math.random() < 0.5 ? randInt(0, 8) : randInt(18, 23);
}

function calculateCost(model, promptTokens, completionTokens) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (promptTokens / 1_000_000) * pricing.input
       + (completionTokens / 1_000_000) * pricing.output;
}

/** Token ranges vary by model. */
function tokenRangeForModel(model) {
  switch (model) {
    case 'claude-3-haiku':
    case 'gpt-4o-mini':
      return { promptMin: 200, promptMax: 1200, compMin: 100, compMax: 800 };
    case 'claude-3-sonnet':
    case 'gpt-4o':
    default:
      return { promptMin: 400, promptMax: 2000, compMin: 200, compMax: 1500 };
  }
}

function generateToolCalls() {
  const count = randInt(1, 3);
  const calls = [];
  for (let i = 0; i < count; i++) {
    calls.push({
      name: pick(TOOLS),
      duration_ms: randInt(50, 500),
      status: Math.random() < 0.95 ? 'ok' : 'error',
    });
  }
  return calls;
}

// ─── Main simulation ────────────────────────────────────────

export async function simulate(options = {}) {
  const {
    totalRequests = 500,
    daysBack = 7,
    dbPath = './observability.db',
  } = options;

  const store = new Store(dbPath);
  const costTracker = new CostTracker(store);

  const now = Date.now();
  const startTime = now - daysBack * 86400000;

  // Drift config: days 6-7 (last 2 days) inject drift in research-agent
  const driftDayThreshold = daysBack - 2; // days 0-4 = baseline, days 5-6 = drift

  let grandTotalCost = 0;

  let traceCount = 0;
  let spanCount = 0;
  let qualityCount = 0;

  for (let i = 0; i < totalRequests; i++) {
    // Progress logging when run directly
    if ((i + 1) % 100 === 0 && isMain()) {
      console.log(`Simulating request ${i + 1}/${totalRequests}...`);
    }

    const agent = pick(AGENTS);
    const model = pick(MODELS);
    const workflow = pick(WORKFLOWS);
    const userId = pick(USERS);

    // Spread across daysBack with business-hour weighting
    const dayOffset = Math.floor(Math.random() * daysBack);
    const hour = weightedHour();
    const minute = randInt(0, 59);
    const second = randInt(0, 59);
    const timestamp = startTime
      + dayOffset * 86400000
      + hour * 3600000
      + minute * 60000
      + second * 1000;

    // Determine if this request is in the drift window
    const isDriftAgent = agent === 'research-agent';
    const isDriftPeriod = dayOffset >= driftDayThreshold;
    const applyDrift = isDriftAgent && isDriftPeriod;

    // Generate 1-4 spans
    const spanCountForTrace = randInt(1, 4);
    const traceId = randomUUID();
    const status = Math.random() < 0.95 ? 'ok' : 'error';

    let totalTokens = 0;
    let totalCost = 0;
    const spans = [];

    for (let s = 0; s < spanCountForTrace; s++) {
      const spanId = randomUUID();
      const isRoot = s === 0;
      const parentSpanId = isRoot ? null : spans[0].id;

      const tokenRange = tokenRangeForModel(model);
      let promptTokens = randInt(tokenRange.promptMin, tokenRange.promptMax);
      let completionTokens = randInt(tokenRange.compMin, tokenRange.compMax);

      // Drift: increase tokens by 40%
      if (applyDrift) {
        promptTokens = Math.round(promptTokens * 1.4);
        completionTokens = Math.round(completionTokens * 1.4);
      }

      const spanTotalTokens = promptTokens + completionTokens;
      const cost = calculateCost(model, promptTokens, completionTokens);

      // Latency
      let latencyMs;
      if (isRoot) {
        latencyMs = randInt(500, 5000) + randInt(0, 500); // variance
      } else {
        latencyMs = randInt(200, 1000) + randInt(0, 200);
      }

      // Drift: increase latency by 60%
      if (applyDrift) {
        latencyMs = Math.round(latencyMs * 1.6);
      }

      // Tool calls: 30% chance baseline, higher during drift
      const toolCallChance = applyDrift ? 0.55 : 0.3;
      const hasToolCalls = Math.random() < toolCallChance;
      const toolCalls = hasToolCalls ? generateToolCalls() : null;

      // If drift, add extra tool calls
      if (applyDrift && toolCalls) {
        const extra = randInt(1, 2);
        for (let e = 0; e < extra; e++) {
          toolCalls.push({
            name: pick(TOOLS),
            duration_ms: randInt(50, 500),
            status: 'ok',
          });
        }
      }

      const spanName = isRoot ? workflow : `tool-${pick(TOOLS)}`;
      const provider = model.startsWith('claude') ? 'anthropic' : 'openai';

      const spanStarted = timestamp + s * randInt(100, 500);
      const spanEnded = spanStarted + latencyMs;

      const spanRecord = {
        id: spanId,
        trace_id: traceId,
        parent_span_id: parentSpanId,
        name: spanName,
        model,
        provider,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: spanTotalTokens,
        latency_ms: latencyMs,
        cost,
        status: isRoot ? status : (Math.random() < 0.97 ? 'ok' : 'error'),
        tool_calls: toolCalls ? JSON.stringify(toolCalls) : null,
        started_at: spanStarted,
        ended_at: spanEnded,
        metadata: null,
      };

      totalTokens += spanTotalTokens;
      totalCost += cost;

      spans.push({ id: spanId, startedAt: spanStarted, endedAt: spanEnded, record: spanRecord, costRecord: {
        trace_id: traceId,
        span_id: spanId,
        agent,
        model,
        user_id: userId,
        workflow,
        input_tokens: promptTokens,
        output_tokens: completionTokens,
        cost,
        timestamp: spanStarted,
      }});
    }

    // Insert trace FIRST (before spans, to satisfy FK constraint)
    const traceStarted = spans[0].startedAt;
    const traceEnded = spans[spans.length - 1].endedAt;

    store.insertTrace({
      id: traceId,
      agent,
      model,
      workflow,
      user_id: userId,
      started_at: traceStarted,
      ended_at: traceEnded,
      total_tokens: totalTokens,
      total_cost: totalCost,
      status,
    });

    // Now insert spans and cost records
    for (const s of spans) {
      store.insertSpan(s.record);
      spanCount++;
      store.insertCostRecord(s.costRecord);
    }
    traceCount++;
    grandTotalCost += totalCost;

    // Quality scores: sample ~30% of traces
    if (Math.random() < 0.3) {
      // Realistic distribution: most scores 4.0-4.5, some lower
      let score;
      const r = Math.random();
      if (r < 0.05) {
        score = randFloat(3.0, 3.5);       // 5% poor
      } else if (r < 0.20) {
        score = randFloat(3.5, 4.0);       // 15% below average
      } else if (r < 0.70) {
        score = randFloat(4.0, 4.5);       // 50% average-good
      } else {
        score = randFloat(4.5, 5.0);       // 30% excellent
      }

      // Drift: quality drops by 0.5 points
      if (applyDrift) {
        score = Math.max(1.0, score - 0.5);
      }

      score = Math.round(score * 100) / 100;

      store.insertQualityScore({
        trace_id: traceId,
        span_id: spans[0].id,
        agent,
        model,
        score,
        criteria: 'auto-eval',
        feedback: score >= 4.0 ? 'Good response' : 'Below expectations',
        timestamp: traceStarted,
      });
      qualityCount++;
    }
  }

  // ─── Post-simulation: drift detection ──────────────────────

  // Manually compute drift alerts since DriftDetector may not exist yet.
  // Compare baseline (days 1-5) vs recent (days 6-7) for research-agent.
  const baselineEnd = startTime + driftDayThreshold * 86400000;

  const baselineSpans = store.db.prepare(`
    SELECT AVG(s.latency_ms) AS avg_latency, AVG(s.total_tokens) AS avg_tokens
    FROM spans s
    JOIN traces t ON s.trace_id = t.id
    WHERE t.agent = 'research-agent' AND s.started_at < @cutoff
  `).get({ cutoff: baselineEnd });

  const recentSpans = store.db.prepare(`
    SELECT AVG(s.latency_ms) AS avg_latency, AVG(s.total_tokens) AS avg_tokens
    FROM spans s
    JOIN traces t ON s.trace_id = t.id
    WHERE t.agent = 'research-agent' AND s.started_at >= @cutoff
  `).get({ cutoff: baselineEnd });

  const baselineQuality = store.db.prepare(`
    SELECT AVG(score) AS avg_score, COUNT(*) AS cnt
    FROM quality_scores
    WHERE agent = 'research-agent' AND timestamp < @cutoff
  `).get({ cutoff: baselineEnd });

  const recentQuality = store.db.prepare(`
    SELECT AVG(score) AS avg_score, COUNT(*) AS cnt
    FROM quality_scores
    WHERE agent = 'research-agent' AND timestamp >= @cutoff
  `).get({ cutoff: baselineEnd });

  let alertCount = 0;

  // Latency drift alert
  if (baselineSpans?.avg_latency && recentSpans?.avg_latency) {
    const pctChange = ((recentSpans.avg_latency - baselineSpans.avg_latency) / baselineSpans.avg_latency) * 100;
    if (pctChange > 20) {
      store.insertDriftAlert({
        metric: 'latency_ms',
        agent: 'research-agent',
        model: null,
        severity: pctChange > 40 ? 'critical' : 'warning',
        baseline_mean: Math.round(baselineSpans.avg_latency * 100) / 100,
        baseline_std: 0,
        current_value: Math.round(recentSpans.avg_latency * 100) / 100,
        z_score: Math.round(pctChange * 100) / 100,
        message: `research-agent latency increased ${Math.round(pctChange)}% (${Math.round(baselineSpans.avg_latency)}ms -> ${Math.round(recentSpans.avg_latency)}ms)`,
        timestamp: now,
      });
      alertCount++;
    }
  }

  // Token usage drift alert
  if (baselineSpans?.avg_tokens && recentSpans?.avg_tokens) {
    const pctChange = ((recentSpans.avg_tokens - baselineSpans.avg_tokens) / baselineSpans.avg_tokens) * 100;
    if (pctChange > 20) {
      store.insertDriftAlert({
        metric: 'total_tokens',
        agent: 'research-agent',
        model: null,
        severity: pctChange > 30 ? 'critical' : 'warning',
        baseline_mean: Math.round(baselineSpans.avg_tokens),
        baseline_std: 0,
        current_value: Math.round(recentSpans.avg_tokens),
        z_score: Math.round(pctChange * 100) / 100,
        message: `research-agent token usage increased ${Math.round(pctChange)}% (${Math.round(baselineSpans.avg_tokens)} -> ${Math.round(recentSpans.avg_tokens)} avg tokens)`,
        timestamp: now,
      });
      alertCount++;
    }
  }

  // Quality drift alert
  if (baselineQuality?.avg_score && recentQuality?.avg_score) {
    const drop = baselineQuality.avg_score - recentQuality.avg_score;
    if (drop > 0.2) {
      store.insertDriftAlert({
        metric: 'quality_score',
        agent: 'research-agent',
        model: null,
        severity: drop > 0.4 ? 'critical' : 'warning',
        baseline_mean: Math.round(baselineQuality.avg_score * 1000) / 1000,
        baseline_std: 0,
        current_value: Math.round(recentQuality.avg_score * 1000) / 1000,
        z_score: Math.round(drop * 1000) / 1000,
        message: `research-agent quality dropped by ${drop.toFixed(2)} points (${baselineQuality.avg_score.toFixed(2)} -> ${recentQuality.avg_score.toFixed(2)})`,
        timestamp: now,
      });
      alertCount++;
    }
  }

  // ─── Set demo budgets ──────────────────────────────────────

  costTracker.setBudget('agent', 'research-agent', { daily: 5.0, weekly: 25.0, monthly: 100.0 });
  costTracker.setBudget('agent', 'code-assistant', { daily: 10.0, weekly: 50.0, monthly: 200.0 });
  costTracker.setBudget('agent', 'customer-support', { daily: 3.0, weekly: 15.0, monthly: 60.0 });
  costTracker.setBudget('agent', 'data-analyst', { daily: 8.0, weekly: 40.0, monthly: 150.0 });

  const summary = {
    traces: traceCount,
    spans: spanCount,
    qualityScores: qualityCount,
    driftAlerts: alertCount,
    totalCost: grandTotalCost,
  };

  return summary;
}

// ─── CLI entry point ────────────────────────────────────────

function isMain() {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
}

if (isMain()) {
  console.log('Starting agent observability simulation...\n');

  const summary = await simulate();

  console.log(`\nDone! Generated ${summary.traces} traces, ${summary.spans} spans, ${summary.qualityScores} quality scores, ${summary.driftAlerts} drift alerts`);
}
