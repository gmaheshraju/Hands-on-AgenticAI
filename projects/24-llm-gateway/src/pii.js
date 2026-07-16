const PATTERNS = [
  { type: 'SSN',         regex: /\b\d{3}-\d{2}-\d{4}\b/g,                              replacement: '[SSN_REDACTED]' },
  { type: 'CREDIT_CARD', regex: /\b(?:\d[ -]*?){13,19}\b/g,                            replacement: '[CC_REDACTED]',  validate: luhnCheck },
  { type: 'EMAIL',       regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL_REDACTED]' },
  { type: 'PHONE_US',    regex: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '[PHONE_REDACTED]' },
  { type: 'PHONE_IN',    regex: /\b(?:\+91[-.\s]?)?\d{5}[-.\s]?\d{5}\b/g,              replacement: '[PHONE_REDACTED]' },
  { type: 'IP_ADDRESS',  regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,                        replacement: '[IP_REDACTED]' },
  { type: 'AWS_KEY',     regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,                      replacement: '[AWS_KEY_REDACTED]' },
  { type: 'API_KEY',     regex: /\b(?:sk-|pk_live_|pk_test_|rk_live_)[A-Za-z0-9]{20,}\b/g, replacement: '[API_KEY_REDACTED]' },
  { type: 'AADHAAR',     regex: /\b\d{4}\s?\d{4}\s?\d{4}\b/g,                          replacement: '[AADHAAR_REDACTED]' },
  { type: 'PAN',         regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g,                             replacement: '[PAN_REDACTED]' },
];

function luhnCheck(num) {
  const digits = num.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function redact(text) {
  const findings = [];
  let redacted = text;

  for (const pattern of PATTERNS) {
    const matches = redacted.matchAll(pattern.regex);
    for (const match of matches) {
      if (pattern.validate && !pattern.validate(match[0])) continue;
      findings.push({
        type: pattern.type,
        position: match.index,
        length: match[0].length,
      });
    }
    redacted = redacted.replace(pattern.regex, (m) => {
      if (pattern.validate && !pattern.validate(m)) return m;
      return pattern.replacement;
    });
  }

  return { redacted, findings, containsPII: findings.length > 0 };
}

export function redactMessages(messages) {
  const allFindings = [];
  const clean = messages.map(msg => {
    if (typeof msg.content !== 'string') return msg;
    const { redacted, findings } = redact(msg.content);
    allFindings.push(...findings);
    return { ...msg, content: redacted };
  });
  return { messages: clean, findings: allFindings };
}

export function scanOnly(text) {
  const findings = [];
  for (const pattern of PATTERNS) {
    const matches = text.matchAll(pattern.regex);
    for (const match of matches) {
      if (pattern.validate && !pattern.validate(match[0])) continue;
      findings.push({ type: pattern.type, position: match.index, snippet: match[0].substring(0, 4) + '***' });
    }
  }
  return findings;
}
