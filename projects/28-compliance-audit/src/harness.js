/**
 * Compliance Audit Harness
 *
 * Orchestrates event logging, decision replay, compliance checking,
 * and report generation into a unified audit workflow.
 */

import { EventLogger } from './eventLogger.js';
import { DecisionReplay } from './decisionReplay.js';
import { ComplianceFramework } from './complianceFramework.js';
import { ComplianceReporter } from './reporter.js';

export class AuditHarness {
  #logger;
  #replay;
  #framework;
  #reporter;
  #config;

  constructor(config = {}) {
    this.#logger = new EventLogger();
    this.#replay = new DecisionReplay(this.#logger);
    this.#framework = new ComplianceFramework();
    this.#reporter = new ComplianceReporter();
    this.#config = {
      retentionDays: config.retentionDays ?? 365,
      autoCheck: config.autoCheck ?? false,
      ...config,
    };
  }

  /** Access the underlying event logger. */
  get logger() {
    return this.#logger;
  }

  /** Access the decision replay engine. */
  get replay() {
    return this.#replay;
  }

  /** Access the compliance framework. */
  get framework() {
    return this.#framework;
  }

  /** Access the reporter. */
  get reporter() {
    return this.#reporter;
  }

  /**
   * Log an agent event. Convenience wrapper around EventLogger.log().
   */
  logEvent(eventData) {
    return this.#logger.log(eventData);
  }

  /**
   * Replay a decision by ID with an optional verification function.
   */
  replayDecision(decisionId, verifyFn = null) {
    if (verifyFn) {
      return this.#replay.replay(decisionId, verifyFn);
    }
    return this.#replay.reconstruct(decisionId);
  }

  /**
   * Run compliance checks for a regulation or all.
   */
  checkCompliance(regulation = null) {
    return this.#framework.check(this.#logger, regulation, this.#config);
  }

  /**
   * Generate a full compliance report.
   */
  generateReport(auditMeta = {}) {
    const allResults = this.#framework.check(this.#logger, null, this.#config);
    const risk = this.#framework.riskAssessment(this.#logger, this.#config);

    return this.#reporter.generate({
      complianceResults: allResults.results,
      riskAssessment: risk,
      auditMeta,
    });
  }

  /**
   * Generate a summary report.
   */
  generateSummary() {
    const allResults = this.#framework.check(this.#logger, null, this.#config);
    return this.#reporter.generateSummary(allResults.results);
  }

  /**
   * Full audit: log integrity + compliance check + risk + report.
   */
  fullAudit(auditMeta = {}) {
    const chainIntegrity = this.#logger.verifyChain();
    const compliance = this.#framework.check(this.#logger, null, this.#config);
    const risk = this.#framework.riskAssessment(this.#logger, this.#config);
    const report = this.generateReport(auditMeta);

    return {
      chainIntegrity,
      compliance,
      riskAssessment: risk,
      report,
      exportedLog: this.#logger.export(),
    };
  }

  /**
   * Dashboard: high-level view of audit status.
   */
  dashboard() {
    const chainIntegrity = this.#logger.verifyChain();
    const regulations = this.#framework.getRegulations();
    const regScores = {};

    for (const reg of regulations) {
      const result = this.#framework.check(this.#logger, reg, this.#config);
      regScores[reg] = {
        score: result.summary.score,
        passed: result.summary.passed,
        failed: result.summary.failed,
        total: result.summary.totalRules,
      };
    }

    const risk = this.#framework.riskAssessment(this.#logger, this.#config);
    const agents = new Set(this.#logger.getAll().map(e => e.agentId));

    return {
      timestamp: new Date().toISOString(),
      eventCount: this.#logger.length,
      chainIntegrity: chainIntegrity.valid,
      activeAgents: [...agents],
      overallRisk: risk.overallRisk,
      regulationScores: regScores,
      criticalFindings: risk.criticalFindings.length,
    };
  }

  /**
   * Add a custom compliance rule.
   */
  addRule(rule) {
    this.#framework.addRule(rule);
  }

  /**
   * Export audit data for external systems.
   */
  exportAuditData() {
    return this.#logger.export();
  }
}
