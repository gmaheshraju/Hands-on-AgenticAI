import { CostCollector } from './collector.js';
import { CostAttribution } from './attribution.js';
import { WasteDetector } from './waste.js';
import { ROICalculator } from './roi.js';

export class CostAttributionEngine {
  constructor(config = {}) {
    this.collector = new CostCollector(config);
    this.attribution = new CostAttribution(this.collector);
    this.waste = new WasteDetector(this.collector);
    this.roi = new ROICalculator(this.collector);
    this.budgets = new Map();
    this.alerts = [];
  }

  record(event) {
    const record = this.collector.record(event);
    this._checkBudget(event.teamId || 'default');
    return record;
  }

  setBudget(teamId, dailyUsd) {
    this.budgets.set(teamId, dailyUsd);
  }

  _checkBudget(teamId) {
    const budget = this.budgets.get(teamId);
    if (!budget) return;

    const todayEvents = this.collector.query({ teamId }).filter(e => {
      return new Date(e.timestamp).toDateString() === new Date().toDateString();
    });
    const spent = todayEvents.reduce((s, e) => s + e.costUsd, 0);
    const ratio = spent / budget;

    const thresholds = [0.5, 0.8, 0.95, 1.0];
    for (const t of thresholds) {
      if (ratio >= t) {
        const exists = this.alerts.find(a => a.teamId === teamId && a.threshold === t &&
          new Date(a.timestamp).toDateString() === new Date().toDateString());
        if (!exists) {
          this.alerts.push({
            teamId, threshold: t, ratio: Math.round(ratio * 100) / 100,
            spent: Math.round(spent * 10000) / 10000, budget, timestamp: Date.now(),
            level: t >= 1.0 ? 'critical' : t >= 0.8 ? 'warning' : 'info',
          });
        }
      }
    }
  }

  dashboard(filters = {}) {
    return {
      byAgent: this.attribution.byAgent(filters),
      byTeam: this.attribution.byTeam(filters),
      byTaskType: this.attribution.byTaskType(filters),
      byModel: this.attribution.byModel(filters),
      waste: this.waste.analyze(filters),
      alerts: this.alerts.filter(a =>
        new Date(a.timestamp).toDateString() === new Date().toDateString()
      ),
      totalCost: Math.round(
        this.collector.query(filters).reduce((s, e) => s + e.costUsd, 0) * 10000
      ) / 10000,
      totalRequests: this.collector.query(filters).length,
    };
  }

  executiveSummary(filters = {}) {
    const events = this.collector.query(filters);
    const totalCost = events.reduce((s, e) => s + e.costUsd, 0);
    const successes = events.filter(e => e.outcome === 'success').length;
    const failures = events.filter(e => e.outcome === 'failure').length;
    const waste = this.waste.analyze(filters);
    const totalSavings = waste.reduce((s, w) => s + w.savingsUsd, 0);

    return {
      totalCost: Math.round(totalCost * 100) / 100,
      totalRequests: events.length,
      successRate: events.length > 0 ? Math.round((successes / events.length) * 100) : 0,
      costPerSuccess: successes > 0 ? Math.round((totalCost / successes) * 10000) / 10000 : null,
      wastePatterns: waste.length,
      potentialSavings: Math.round(totalSavings * 100) / 100,
      savingsPercent: totalCost > 0 ? Math.round((totalSavings / totalCost) * 100) : 0,
      topWaste: waste[0] || null,
    };
  }
}
