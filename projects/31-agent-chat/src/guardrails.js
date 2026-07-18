import config from './config.js';

const { guardrails: cfg, features } = config;

export class Guardrails {
  constructor(db) {
    this.db = db;
  }

  scanInput(text, threadId) {
    const results = { allowed: true, flags: [], redactedText: text };

    for (const pattern of cfg.injectionPatterns) {
      if (pattern.test(text)) {
        results.flags.push({
          type: 'injection',
          severity: 'high',
          detail: `Prompt injection pattern detected: ${pattern.source.slice(0, 40)}`,
        });
      }
    }

    let redacted = text;
    for (const { type, pattern, mask } of cfg.piiPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        results.flags.push({
          type: 'pii',
          severity: 'medium',
          detail: `${type} detected (${matches.length} instance${matches.length > 1 ? 's' : ''})`,
          piiType: type,
          count: matches.length,
        });
        redacted = redacted.replace(pattern, mask);
      }
    }

    results.redactedText = redacted;

    if (results.flags.some(f => f.type === 'injection' && f.severity === 'high')) {
      results.allowed = false;
      results.reason = 'Blocked: potential prompt injection detected';
    }

    if (features.auditTrail && results.flags.length > 0) {
      this.db.addAuditEntry({
        type: 'guardrail_input',
        threadId,
        detail: JSON.stringify({
          flags: results.flags,
          allowed: results.allowed,
          inputLength: text.length,
        }),
      });
    }

    return results;
  }

  scanOutput(text, threadId) {
    const results = { allowed: true, flags: [], cleanedText: text };

    for (const { type, pattern, mask } of cfg.piiPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        results.flags.push({
          type: 'pii_leak',
          severity: 'high',
          detail: `LLM output contains ${type}`,
          piiType: type,
        });
        results.cleanedText = results.cleanedText.replace(pattern, mask);
      }
    }

    for (const pattern of cfg.outputBlockPatterns) {
      if (pattern.test(text)) {
        results.flags.push({
          type: 'output_quality',
          severity: 'low',
          detail: 'Generic AI disclaimer detected',
        });
      }
    }

    if (features.auditTrail && results.flags.length > 0) {
      this.db.addAuditEntry({
        type: 'guardrail_output',
        threadId,
        detail: JSON.stringify({
          flags: results.flags,
          outputLength: text.length,
        }),
      });
    }

    return results;
  }

  getStats() {
    const entries = this.db.getAuditEntries('guardrail_input', cfg.auditLookbackLimit);
    let totalScans = entries.length;
    let blocked = 0;
    let piiDetected = 0;
    let injectionAttempts = 0;

    for (const entry of entries) {
      try {
        const detail = JSON.parse(entry.detail);
        if (!detail.allowed) blocked++;
        for (const f of detail.flags || []) {
          if (f.type === 'pii') piiDetected++;
          if (f.type === 'injection') injectionAttempts++;
        }
      } catch { /* skip malformed */ }
    }

    return { totalScans, blocked, piiDetected, injectionAttempts };
  }
}
