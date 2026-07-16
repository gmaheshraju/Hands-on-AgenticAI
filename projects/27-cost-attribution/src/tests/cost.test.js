import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CostCollector } from '../collector.js';
import { CostAttribution } from '../attribution.js';
import { WasteDetector } from '../waste.js';
import { ROICalculator } from '../roi.js';
import { CostAttributionEngine } from '../engine.js';

function seedCollector() {
  const c = new CostCollector();
  c.record({ agentId: 'a1', teamId: 'eng', taskType: 'review', model: 'claude-sonnet-4', inputTokens: 1000, outputTokens: 500, outcome: 'success', latencyMs: 2000 });
  c.record({ agentId: 'a1', teamId: 'eng', taskType: 'review', model: 'claude-sonnet-4', inputTokens: 800, outputTokens: 400, outcome: 'success', latencyMs: 1500 });
  c.record({ agentId: 'a2', teamId: 'eng', taskType: 'triage', model: 'claude-haiku-3.5', inputTokens: 500, outputTokens: 200, outcome: 'success', latencyMs: 300 });
  c.record({ agentId: 'a2', teamId: 'eng', taskType: 'triage', model: 'claude-haiku-3.5', inputTokens: 400, outputTokens: 150, outcome: 'failure', latencyMs: 250 });
  c.record({ agentId: 'a3', teamId: 'mkt', taskType: 'content', model: 'gpt-4o', inputTokens: 600, outputTokens: 300, outcome: 'success', latencyMs: 1000 });
  return c;
}

// ─── Cost Collector ───

describe('Cost Collector', () => {
  it('records events with auto-calculated cost', () => {
    const c = new CostCollector();
    const r = c.record({ agentId: 'a1', model: 'claude-sonnet-4', inputTokens: 1000, outputTokens: 500 });
    assert.ok(r.costUsd > 0);
    assert.equal(r.costUsd, (1000 / 1000) * 0.003 + (500 / 1000) * 0.015);
  });

  it('uses explicit cost when provided', () => {
    const c = new CostCollector();
    const r = c.record({ agentId: 'a1', model: 'claude-sonnet-4', costUsd: 0.42 });
    assert.equal(r.costUsd, 0.42);
  });

  it('filters by agent and team', () => {
    const c = seedCollector();
    assert.equal(c.query({ agentId: 'a1' }).length, 2);
    assert.equal(c.query({ teamId: 'mkt' }).length, 1);
  });

  it('filters by task type', () => {
    const c = seedCollector();
    assert.equal(c.query({ taskType: 'review' }).length, 2);
  });
});

// ─── Cost Attribution ───

describe('Cost Attribution', () => {
  it('attributes cost by agent', () => {
    const c = seedCollector();
    const attr = new CostAttribution(c);
    const byAgent = attr.byAgent();
    assert.equal(byAgent.length, 3);
    const a1 = byAgent.find(a => a.agentId === 'a1');
    assert.equal(a1.requests, 2);
    assert.equal(a1.successRate, 100);
  });

  it('attributes cost by team', () => {
    const c = seedCollector();
    const attr = new CostAttribution(c);
    const byTeam = attr.byTeam();
    assert.equal(byTeam.length, 2);
    const eng = byTeam.find(t => t.teamId === 'eng');
    assert.equal(eng.requests, 4);
    assert.equal(eng.uniqueAgents, 2);
  });

  it('attributes cost by task type', () => {
    const c = seedCollector();
    const attr = new CostAttribution(c);
    const byType = attr.byTaskType();
    const review = byType.find(t => t.taskType === 'review');
    assert.equal(review.requests, 2);
    assert.equal(review.successRate, 100);
    assert.ok(review.costPerSuccess > 0);
  });

  it('attributes cost by model', () => {
    const c = seedCollector();
    const attr = new CostAttribution(c);
    const byModel = attr.byModel();
    assert.ok(byModel.length >= 2);
    const sonnet = byModel.find(m => m.model === 'claude-sonnet-4');
    assert.equal(sonnet.requests, 2);
  });

  it('sorts by highest cost first', () => {
    const c = seedCollector();
    const attr = new CostAttribution(c);
    const byAgent = attr.byAgent();
    for (let i = 1; i < byAgent.length; i++) {
      assert.ok(byAgent[i - 1].totalCost >= byAgent[i].totalCost);
    }
  });
});

// ─── Waste Detection ───

describe('Waste Detection', () => {
  it('detects overpowered models', () => {
    const c = new CostCollector();
    c.record({ agentId: 'a1', model: 'claude-opus-4', inputTokens: 200, outputTokens: 80 });
    c.record({ agentId: 'a1', model: 'claude-opus-4', inputTokens: 100, outputTokens: 50 });
    const wd = new WasteDetector(c);
    const patterns = wd.analyze();
    const op = patterns.find(p => p.pattern === 'overpowered_model');
    assert.ok(op);
    assert.equal(op.count, 2);
    assert.ok(op.savingsUsd > 0);
  });

  it('detects duplicate requests', () => {
    const c = new CostCollector();
    c.record({ agentId: 'a1', model: 'claude-sonnet-4', inputTokens: 500, outputTokens: 200, costUsd: 0.05 });
    c.record({ agentId: 'a1', model: 'claude-sonnet-4', inputTokens: 500, outputTokens: 200, costUsd: 0.05 });
    const wd = new WasteDetector(c);
    const patterns = wd.analyze();
    const dup = patterns.find(p => p.pattern === 'duplicate_requests');
    assert.ok(dup);
  });

  it('detects low cache hit rate', () => {
    const c = new CostCollector();
    for (let i = 0; i < 15; i++) {
      c.record({ agentId: 'a1', model: 'claude-sonnet-4', inputTokens: 500, outputTokens: 200, costUsd: 0.05, cached: false });
    }
    const wd = new WasteDetector(c);
    const patterns = wd.analyze();
    const cache = patterns.find(p => p.pattern === 'low_cache_hit_rate');
    assert.ok(cache);
  });

  it('returns no patterns for clean usage', () => {
    const c = new CostCollector();
    c.record({ agentId: 'a1', model: 'claude-haiku-3.5', inputTokens: 500, outputTokens: 200, outcome: 'success' });
    const wd = new WasteDetector(c);
    const patterns = wd.analyze();
    assert.equal(patterns.filter(p => p.pattern === 'overpowered_model').length, 0);
  });
});

// ─── ROI Calculator ───

describe('ROI Calculator', () => {
  it('calculates agent ROI', () => {
    const c = new CostCollector();
    c.record({ agentId: 'a1', taskType: 'review', model: 'claude-sonnet-4', inputTokens: 1000, outputTokens: 500, outcome: 'success' });
    c.record({ agentId: 'a1', taskType: 'review', model: 'claude-sonnet-4', inputTokens: 800, outputTokens: 400, outcome: 'success' });
    const roi = new ROICalculator(c);
    roi.setOutcomeValue('review', () => 5.00);
    const result = roi.agentROI('a1');
    assert.ok(result.roi > 0);
    assert.equal(result.totalValue, 10.00);
    assert.equal(result.successRate, 100);
  });

  it('handles agents with no events', () => {
    const c = new CostCollector();
    const roi = new ROICalculator(c);
    assert.equal(roi.agentROI('nonexistent'), null);
  });

  it('uses outcomeValue when no valueFn set', () => {
    const c = new CostCollector();
    c.record({ agentId: 'a1', taskType: 'custom', model: 'gpt-4o', inputTokens: 100, outputTokens: 50, outcome: 'success', outcomeValue: 3.50 });
    const roi = new ROICalculator(c);
    const result = roi.agentROI('a1');
    assert.equal(result.totalValue, 3.50);
  });

  it('calculates cost efficiency', () => {
    const c = seedCollector();
    const roi = new ROICalculator(c);
    const efficiency = roi.costEfficiency();
    assert.ok(efficiency.length > 0);
    assert.ok(efficiency[0].costPerToken > 0);
    assert.ok(efficiency[0].tokensPerRequest > 0);
  });
});

// ─── Full Engine Integration ───

describe('Cost Attribution Engine Integration', () => {
  it('records and produces dashboard', () => {
    const engine = new CostAttributionEngine();
    engine.record({ agentId: 'a1', teamId: 'eng', taskType: 'review', model: 'claude-sonnet-4', inputTokens: 1000, outputTokens: 500, outcome: 'success' });
    engine.record({ agentId: 'a2', teamId: 'eng', taskType: 'triage', model: 'claude-haiku-3.5', inputTokens: 500, outputTokens: 200, outcome: 'success' });
    const dash = engine.dashboard();
    assert.equal(dash.totalRequests, 2);
    assert.ok(dash.totalCost > 0);
    assert.ok(dash.byAgent.length > 0);
    assert.ok(dash.byTeam.length > 0);
  });

  it('generates executive summary', () => {
    const engine = new CostAttributionEngine();
    engine.record({ agentId: 'a1', model: 'claude-sonnet-4', inputTokens: 1000, outputTokens: 500, outcome: 'success' });
    engine.record({ agentId: 'a1', model: 'claude-sonnet-4', inputTokens: 800, outputTokens: 400, outcome: 'failure' });
    const summary = engine.executiveSummary();
    assert.equal(summary.totalRequests, 2);
    assert.equal(summary.successRate, 50);
    assert.ok(summary.totalCost > 0);
  });

  it('triggers budget alerts', () => {
    const engine = new CostAttributionEngine();
    engine.setBudget('eng', 0.01);
    engine.record({ agentId: 'a1', teamId: 'eng', model: 'claude-sonnet-4', inputTokens: 5000, outputTokens: 2000 });
    assert.ok(engine.alerts.length > 0);
    assert.equal(engine.alerts[0].teamId, 'eng');
  });
});
