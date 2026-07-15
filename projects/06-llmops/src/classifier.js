/**
 * Complexity Classifier
 *
 * Scores a query's complexity on a 0-1 scale using heuristics:
 *   - length of the query
 *   - presence of complex keywords (reasoning, analysis, multi-step)
 *   - structural indicators (questions, code blocks, lists)
 *   - domain-specific markers (legal, financial, technical)
 *
 * This replaces calling an LLM classifier — zero cost, <1ms latency.
 */

// ── keyword dictionaries ────────────────────────────────────────────────
const SIMPLE_KEYWORDS = [
  'hello', 'hi', 'hey', 'thanks', 'thank you', 'ok', 'yes', 'no',
  'status', 'order status', 'tracking', 'password', 'reset',
  'what time', 'where is', 'how much', 'price', 'cost',
  'cancel', 'refund', 'return', 'shipping', 'delivery',
  'hours', 'open', 'close', 'address', 'phone', 'contact',
  'format', 'convert', 'translate', 'spell', 'define',
];

const COMPLEX_KEYWORDS = [
  'analyze', 'analyse', 'analysis', 'evaluate', 'compare and contrast',
  'reasoning', 'reason through', 'step by step', 'multi-step',
  'architecture', 'design pattern', 'system design', 'trade-off',
  'liability', 'compliance', 'regulatory', 'legal implications',
  'optimize', 'refactor', 'debug this', 'root cause',
  'write a program', 'implement', 'algorithm', 'data structure',
  'creative writing', 'story', 'essay', 'poem',
  'financial model', 'forecast', 'projection', 'risk assessment',
  'explain why', 'what are the implications', 'pros and cons',
  'contract', 'clause', 'negotiate', 'strategy',
];

const MEDIUM_KEYWORDS = [
  'summarize', 'summary', 'explain', 'describe', 'list',
  'what is', 'how does', 'overview', 'outline',
  'code explanation', 'review', 'feedback',
  'rewrite', 'improve', 'suggest', 'recommend',
  'email', 'draft', 'template', 'example',
];

// ── scoring functions ───────────────────────────────────────────────────

function lengthScore(query) {
  const len = query.length;
  if (len < 30)  return 0.0;
  if (len < 80)  return 0.1;
  if (len < 200) return 0.25;
  if (len < 500) return 0.45;
  if (len < 1000) return 0.65;
  return 0.8;
}

function keywordScore(query) {
  const lower = query.toLowerCase();

  let simpleHits = 0;
  for (const kw of SIMPLE_KEYWORDS) {
    if (lower.includes(kw)) simpleHits++;
  }

  let mediumHits = 0;
  for (const kw of MEDIUM_KEYWORDS) {
    if (lower.includes(kw)) mediumHits++;
  }

  let complexHits = 0;
  for (const kw of COMPLEX_KEYWORDS) {
    if (lower.includes(kw)) complexHits++;
  }

  // Complex keywords dominate
  if (complexHits >= 2) return 0.9;
  if (complexHits === 1) return 0.65;
  if (mediumHits >= 2) return 0.45;
  if (mediumHits === 1) return 0.3;
  if (simpleHits >= 1) return 0.1;
  return 0.2; // unknown — default to low-medium
}

function structureScore(query) {
  let score = 0;

  // Multiple questions
  const questionMarks = (query.match(/\?/g) || []).length;
  if (questionMarks >= 3) score += 0.3;
  else if (questionMarks >= 2) score += 0.15;

  // Code blocks or technical markers
  if (query.includes('```') || query.includes('function ') || query.includes('class ')) {
    score += 0.25;
  }

  // Numbered lists or bullet points (multi-step instructions)
  if (/\d+\.\s/.test(query) || /[-*]\s/.test(query)) {
    score += 0.15;
  }

  // Long paragraphs (multi-paragraph input)
  const paragraphs = query.split(/\n\s*\n/).length;
  if (paragraphs >= 3) score += 0.2;
  else if (paragraphs >= 2) score += 0.1;

  return Math.min(score, 1.0);
}

// ── public API ──────────────────────────────────────────────────────────

/**
 * Classify query complexity.
 *
 * @param {string} query - The user's prompt
 * @returns {{ score: number, tier: 'simple'|'medium'|'complex', signals: object }}
 */
export function classify(query) {
  if (!query || typeof query !== 'string') {
    return { score: 0, tier: 'simple', signals: {} };
  }

  const len   = lengthScore(query);
  const kw    = keywordScore(query);
  const struc = structureScore(query);

  // Weighted combination: keywords matter most, then length, then structure
  const raw = kw * 0.50 + len * 0.30 + struc * 0.20;
  const score = Math.round(raw * 100) / 100; // 2 decimal places

  let tier;
  if (score < 0.30)      tier = 'simple';
  else if (score < 0.55) tier = 'medium';
  else                   tier = 'complex';

  return {
    score,
    tier,
    signals: {
      lengthScore: len,
      keywordScore: kw,
      structureScore: struc,
    },
  };
}
