/**
 * Configurable Compliance Framework
 *
 * Maps compliance rules to regulations: EU AI Act, SOC2, GDPR.
 * Each rule has a check function, evidence collection, and remediation guidance.
 */

// ── Rule definitions ─────────────────────────────────────────────────

const EU_AI_ACT_RULES = [
  {
    id: 'eu-ai-transparency-001',
    regulation: 'EU AI Act',
    category: 'transparency',
    name: 'Decision Explainability',
    description: 'All AI decisions must include a rationale explaining the reasoning',
    severity: 'high',
    check: (logger) => {
      const entries = logger.getAll().filter(e => e.decision !== null);
      const missing = entries.filter(e => !e.rationale || e.rationale.trim() === '');
      return {
        pass: missing.length === 0,
        total: entries.length,
        failing: missing.length,
        evidence: missing.map(e => ({ id: e.id, action: e.action, timestamp: e.timestamp })),
      };
    },
    remediation: 'Ensure every agent decision includes a non-empty rationale field explaining the reasoning process.',
  },
  {
    id: 'eu-ai-transparency-002',
    regulation: 'EU AI Act',
    category: 'transparency',
    name: 'Audit Trail Completeness',
    description: 'A tamper-evident audit trail must exist for all agent actions',
    severity: 'critical',
    check: (logger) => {
      const chainResult = logger.verifyChain();
      return {
        pass: chainResult.valid,
        total: logger.length,
        failing: chainResult.valid ? 0 : 1,
        evidence: chainResult.valid
          ? [{ status: 'Chain integrity verified' }]
          : [{ brokenAt: chainResult.brokenAt, status: 'Hash chain broken' }],
      };
    },
    remediation: 'Investigate hash chain breach. Restore from backup or re-seal the chain from the point of failure.',
  },
  {
    id: 'eu-ai-oversight-001',
    regulation: 'EU AI Act',
    category: 'human_oversight',
    name: 'Human Review for High-Risk Decisions',
    description: 'High-risk decisions must have human_reviewed flag in metadata',
    severity: 'high',
    check: (logger) => {
      const highRisk = logger.getAll().filter(
        e => e.metadata?.riskLevel === 'high' || e.metadata?.riskLevel === 'critical'
      );
      const unreviewed = highRisk.filter(e => !e.metadata?.humanReviewed);
      return {
        pass: unreviewed.length === 0,
        total: highRisk.length,
        failing: unreviewed.length,
        evidence: unreviewed.map(e => ({
          id: e.id,
          action: e.action,
          riskLevel: e.metadata?.riskLevel,
        })),
      };
    },
    remediation: 'Implement human-in-the-loop review for all high-risk and critical decisions before execution.',
  },
  {
    id: 'eu-ai-nondiscrimination-001',
    regulation: 'EU AI Act',
    category: 'non_discrimination',
    name: 'Protected Attribute Exclusion',
    description: 'Decision inputs must not contain protected demographic attributes',
    severity: 'critical',
    check: (logger) => {
      const protectedKeys = new Set(['race', 'ethnicity', 'gender', 'religion', 'sexual_orientation', 'disability', 'age_group']);
      const decisions = logger.getAll().filter(e => e.decision !== null);
      const violations = [];
      for (const entry of decisions) {
        if (entry.input && typeof entry.input === 'object') {
          const found = Object.keys(entry.input).filter(k => protectedKeys.has(k));
          if (found.length > 0) {
            violations.push({ id: entry.id, protectedKeys: found });
          }
        }
      }
      return {
        pass: violations.length === 0,
        total: decisions.length,
        failing: violations.length,
        evidence: violations,
      };
    },
    remediation: 'Remove protected demographic attributes from decision inputs. Use proxy-free feature sets.',
  },
];

const SOC2_RULES = [
  {
    id: 'soc2-access-001',
    regulation: 'SOC2',
    category: 'access_control',
    name: 'Agent Identity Tracking',
    description: 'Every logged event must have a non-empty agentId',
    severity: 'high',
    check: (logger) => {
      const entries = logger.getAll();
      const missing = entries.filter(e => !e.agentId || e.agentId.trim() === '');
      return {
        pass: missing.length === 0,
        total: entries.length,
        failing: missing.length,
        evidence: missing.map(e => ({ id: e.id, timestamp: e.timestamp })),
      };
    },
    remediation: 'Enforce non-empty agentId on all event log entries. Reject events without identity.',
  },
  {
    id: 'soc2-audit-001',
    regulation: 'SOC2',
    category: 'audit_trail',
    name: 'Immutable Audit Log',
    description: 'Audit log must be tamper-evident with cryptographic hash chain',
    severity: 'critical',
    check: (logger) => {
      const result = logger.verifyChain();
      return {
        pass: result.valid,
        total: logger.length,
        failing: result.valid ? 0 : 1,
        evidence: [{ chainValid: result.valid, brokenAt: result.brokenAt }],
      };
    },
    remediation: 'Restore audit log integrity. Investigate potential tampering. Escalate to security team.',
  },
  {
    id: 'soc2-audit-002',
    regulation: 'SOC2',
    category: 'audit_trail',
    name: 'Sensitive Data Redaction',
    description: 'Sensitive fields (passwords, tokens, keys) must be redacted in logs',
    severity: 'critical',
    check: (logger) => {
      const sensitivePatterns = ['password', 'secret', 'token', 'apiKey', 'api_key', 'privateKey', 'private_key'];
      const entries = logger.getAll();
      const violations = [];
      for (const entry of entries) {
        const json = JSON.stringify(entry.input) + JSON.stringify(entry.output);
        for (const pattern of sensitivePatterns) {
          // Check if a sensitive key has a non-redacted value
          const regex = new RegExp(`"${pattern}"\\s*:\\s*"(?!\\[REDACTED\\])`, 'i');
          if (regex.test(json)) {
            violations.push({ id: entry.id, pattern });
          }
        }
      }
      return {
        pass: violations.length === 0,
        total: entries.length,
        failing: violations.length,
        evidence: violations,
      };
    },
    remediation: 'Ensure the EventLogger redaction layer covers all sensitive field patterns.',
  },
  {
    id: 'soc2-change-001',
    regulation: 'SOC2',
    category: 'change_management',
    name: 'Configuration Change Logging',
    description: 'All configuration changes must be logged with before/after values',
    severity: 'medium',
    check: (logger) => {
      const configChanges = logger.queryByAction('config_change');
      const incomplete = configChanges.filter(
        e => !e.metadata?.before || !e.metadata?.after
      );
      return {
        pass: incomplete.length === 0,
        total: configChanges.length,
        failing: incomplete.length,
        evidence: incomplete.map(e => ({ id: e.id, timestamp: e.timestamp })),
      };
    },
    remediation: 'Include before/after snapshots in metadata for all configuration change events.',
  },
];

const GDPR_RULES = [
  {
    id: 'gdpr-minimization-001',
    regulation: 'GDPR',
    category: 'data_minimization',
    name: 'Input Data Minimization',
    description: 'Logged inputs should not contain excessive personal data fields',
    severity: 'high',
    check: (logger) => {
      const piiFields = new Set([
        'email', 'phone', 'address', 'dateOfBirth', 'date_of_birth',
        'socialSecurity', 'ssn', 'passport', 'fullName', 'full_name',
      ]);
      const entries = logger.getAll();
      const violations = [];
      for (const entry of entries) {
        if (entry.input && typeof entry.input === 'object') {
          const piiFound = Object.keys(entry.input).filter(k => piiFields.has(k));
          if (piiFound.length > 2) {
            violations.push({ id: entry.id, excessivePii: piiFound });
          }
        }
      }
      return {
        pass: violations.length === 0,
        total: entries.length,
        failing: violations.length,
        evidence: violations,
      };
    },
    remediation: 'Minimize personal data in agent inputs. Only include fields strictly necessary for the decision.',
  },
  {
    id: 'gdpr-purpose-001',
    regulation: 'GDPR',
    category: 'purpose_limitation',
    name: 'Purpose Documentation',
    description: 'Each agent action must document its purpose in metadata',
    severity: 'medium',
    check: (logger) => {
      const entries = logger.getAll();
      const missing = entries.filter(e => !e.metadata?.purpose);
      return {
        pass: missing.length === 0,
        total: entries.length,
        failing: missing.length,
        evidence: missing.slice(0, 10).map(e => ({ id: e.id, action: e.action })),
      };
    },
    remediation: 'Add a purpose field to metadata for every logged event, describing why the data is being processed.',
  },
  {
    id: 'gdpr-erasure-001',
    regulation: 'GDPR',
    category: 'erasure',
    name: 'Erasure Request Handling',
    description: 'System must support data erasure requests (right to be forgotten)',
    severity: 'high',
    check: (logger) => {
      const erasureRequests = logger.queryByAction('erasure_request');
      const unprocessed = erasureRequests.filter(
        e => e.metadata?.status !== 'completed' && e.metadata?.status !== 'acknowledged'
      );
      return {
        pass: unprocessed.length === 0,
        total: erasureRequests.length,
        failing: unprocessed.length,
        evidence: unprocessed.map(e => ({ id: e.id, status: e.metadata?.status })),
      };
    },
    remediation: 'Process all pending erasure requests within the GDPR-mandated 30-day window.',
  },
  {
    id: 'gdpr-retention-001',
    regulation: 'GDPR',
    category: 'erasure',
    name: 'Data Retention Limits',
    description: 'Logged data must not exceed configured retention period',
    severity: 'medium',
    check: (logger, config = {}) => {
      const retentionDays = config.retentionDays ?? 365;
      const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
      const entries = logger.getAll();
      const expired = entries.filter(e => e.timestamp < cutoff);
      return {
        pass: expired.length === 0,
        total: entries.length,
        failing: expired.length,
        evidence: expired.slice(0, 5).map(e => ({ id: e.id, timestamp: e.timestamp })),
      };
    },
    remediation: 'Implement automated data purging for entries exceeding the retention period.',
  },
];

// ── ComplianceFramework ──────────────────────────────────────────────

export class ComplianceFramework {
  #rules = new Map();

  constructor() {
    // Register all built-in rules
    for (const rule of [...EU_AI_ACT_RULES, ...SOC2_RULES, ...GDPR_RULES]) {
      this.#rules.set(rule.id, rule);
    }
  }

  /** Add a custom compliance rule. */
  addRule(rule) {
    if (!rule.id || !rule.regulation || !rule.check) {
      throw new Error('Rule must have id, regulation, and check function');
    }
    this.#rules.set(rule.id, rule);
  }

  /** Remove a rule by ID. */
  removeRule(id) {
    return this.#rules.delete(id);
  }

  /** Get all rules, optionally filtered by regulation. */
  getRules(regulation = null) {
    const rules = [...this.#rules.values()];
    if (!regulation) return rules;
    return rules.filter(r => r.regulation === regulation);
  }

  /** Get supported regulations. */
  getRegulations() {
    const regs = new Set();
    for (const rule of this.#rules.values()) {
      regs.add(rule.regulation);
    }
    return [...regs];
  }

  /**
   * Run compliance checks for a specific regulation (or all).
   * Returns per-rule results with evidence.
   */
  check(logger, regulation = null, config = {}) {
    const rules = this.getRules(regulation);
    const results = [];
    let passCount = 0;
    let failCount = 0;

    for (const rule of rules) {
      const result = rule.check(logger, config);
      const entry = {
        ruleId: rule.id,
        regulation: rule.regulation,
        category: rule.category,
        name: rule.name,
        description: rule.description,
        severity: rule.severity,
        pass: result.pass,
        total: result.total,
        failing: result.failing,
        evidence: result.evidence,
        remediation: result.pass ? null : rule.remediation,
      };
      results.push(entry);
      if (result.pass) passCount++;
      else failCount++;
    }

    return {
      regulation: regulation ?? 'ALL',
      timestamp: new Date().toISOString(),
      summary: {
        totalRules: rules.length,
        passed: passCount,
        failed: failCount,
        score: rules.length > 0 ? Math.round((passCount / rules.length) * 100) : 100,
      },
      results,
    };
  }

  /**
   * Risk assessment across all regulations.
   */
  riskAssessment(logger, config = {}) {
    const allResults = this.check(logger, null, config);
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    const failedRules = allResults.results.filter(r => !r.pass);

    for (const rule of failedRules) {
      bySeverity[rule.severity] = (bySeverity[rule.severity] || 0) + 1;
    }

    let overallRisk = 'low';
    if (bySeverity.critical > 0) overallRisk = 'critical';
    else if (bySeverity.high > 1) overallRisk = 'high';
    else if (bySeverity.high > 0 || bySeverity.medium > 1) overallRisk = 'medium';

    return {
      overallRisk,
      failedBySeverity: bySeverity,
      totalFailures: failedRules.length,
      criticalFindings: failedRules
        .filter(r => r.severity === 'critical')
        .map(r => ({ ruleId: r.ruleId, name: r.name, remediation: r.remediation })),
    };
  }
}

export { EU_AI_ACT_RULES, SOC2_RULES, GDPR_RULES };
