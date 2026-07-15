// tokenizer.js — BPE-approximation token estimator
// Zero external dependencies. Approximates byte-pair encoding token counts
// by analyzing character patterns, word frequency, and content type.
// Real systems use tiktoken; this is meaningfully more accurate than word counting.

/**
 * Common English words that typically encode as a single token in BPE.
 * Based on analysis of GPT tokenizer behavior — the 200 most frequent
 * English words almost always map to one token.
 */
const SINGLE_TOKEN_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
  'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
  'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
  'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see',
  'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over',
  'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work',
  'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
  'give', 'day', 'most', 'us', 'is', 'are', 'was', 'were', 'been', 'has',
  'had', 'did', 'does', 'am', 'may', 'must', 'should', 'need', 'let', 'put',
  'set', 'run', 'got', 'yet', 'try', 'ask', 'too', 'own', 'still', 'keep',
  'end', 'show', 'part', 'old', 'long', 'much', 'big', 'here', 'while',
  'under', 'last', 'turn', 'same', 'start', 'point', 'each', 'help',
  'home', 'hand', 'high', 'line', 'off', 'play', 'man', 'few', 'left',
  'state', 'world', 'very', 'right', 'name', 'call', 'place', 'number',
  'where', 'why', 'should', 'every', 'move', 'tell', 'true', 'false',
  'null', 'return', 'function', 'class', 'const', 'let', 'var', 'if',
  'else', 'for', 'while', 'import', 'export', 'from', 'new', 'this',
  'data', 'type', 'value', 'error', 'string', 'test', 'user', 'code',
]);

/**
 * Patterns that BPE tokenizers handle with known token costs.
 * Each pattern has a regex and a token cost per match.
 */
const TOKEN_PATTERNS = [
  // Whitespace: leading spaces often merge into tokens (GPT uses space-prefixed tokens)
  { regex: /^ +/gm, costFn: (match) => Math.ceil(match.length / 4) },
  // Numbers: each digit group is typically 1-2 tokens
  { regex: /\d+/g, costFn: (match) => Math.ceil(match.length / 3) },
  // Punctuation clusters (e.g., "===" or "///" or "---")
  { regex: /([^\w\s])\1{2,}/g, costFn: (match) => Math.ceil(match.length / 2) },
  // URLs: expensive, many tokens
  { regex: /https?:\/\/[^\s]+/g, costFn: (match) => Math.ceil(match.length / 3.5) },
  // Camel/Pascal case splits (each sub-word is usually a token)
  { regex: /[a-z][A-Z]/g, costFn: () => 0.5 }, // adds 0.5 per boundary
  // Snake_case (underscores often split into separate tokens)
  { regex: /_/g, costFn: () => 1 },
];

/**
 * Detect if content is code-like (vs natural language).
 * Code has more punctuation, brackets, and specific patterns.
 */
function detectContentType(text) {
  const codeIndicators = [
    /[{}[\]();]/g,           // brackets and parens
    /=>|->|::|\.\.|\?\./g,  // operators
    /^\s*(import|export|const|let|var|function|class|def|fn|pub|async)\b/gm,
    /\b(return|throw|catch|try|finally|yield|await)\b/g,
    /[a-zA-Z_]\w*\([^)]*\)/g, // function calls
  ];

  let codeScore = 0;
  for (const pattern of codeIndicators) {
    const matches = text.match(pattern);
    codeScore += matches ? matches.length : 0;
  }

  // Normalize by text length
  const density = codeScore / (text.length / 100);
  return density > 2 ? 'code' : 'text';
}

/**
 * Estimate the number of tokens using BPE approximation.
 *
 * Strategy:
 * 1. Split into words
 * 2. Common words = 1 token each
 * 3. Uncommon words = estimated by character length with BPE heuristics
 * 4. Apply content-type multiplier (code is ~1.5x more expensive)
 * 5. Account for punctuation, numbers, and special patterns
 *
 * @param {string} text - The text to estimate
 * @param {object} opts - { mode: 'text' | 'code' | 'auto' }
 * @returns {number} Estimated token count
 */
export function estimateTokens(text, opts = {}) {
  if (!text || typeof text !== 'string') return 0;
  if (text.trim().length === 0) return 0;

  const mode = opts.mode || 'auto';
  const contentType = mode === 'auto' ? detectContentType(text) : mode;

  // Step 1: Count whitespace-separated "words" (includes punctuation-attached)
  const rawWords = text.split(/\s+/).filter(w => w.length > 0);
  let tokenCount = 0;

  // Step 2: Estimate tokens per word
  for (const word of rawWords) {
    // Strip leading/trailing punctuation for lookup
    const stripped = word.toLowerCase().replace(/^[^\w]+|[^\w]+$/g, '');
    const punctuation = word.length - stripped.length;

    if (SINGLE_TOKEN_WORDS.has(stripped)) {
      // Common word = 1 token
      tokenCount += 1;
    } else if (stripped.length === 0) {
      // Pure punctuation
      tokenCount += Math.max(1, Math.ceil(word.length / 2));
    } else if (stripped.length <= 4) {
      // Short words are usually 1 token
      tokenCount += 1;
    } else if (stripped.length <= 8) {
      // Medium words: 1-2 tokens
      tokenCount += Math.ceil(stripped.length / 5);
    } else if (stripped.length <= 13) {
      // Longer words: 2-3 tokens
      tokenCount += Math.ceil(stripped.length / 5);
    } else {
      // Very long / rare words: roughly 1 token per 3.5 chars
      tokenCount += Math.ceil(stripped.length / 3.5);
    }

    // Punctuation tokens (each punctuation char is often its own token)
    tokenCount += Math.ceil(punctuation * 0.7);

    // CamelCase splits within words
    const camelSplits = stripped.match(/[a-z][A-Z]/g);
    if (camelSplits) {
      tokenCount += camelSplits.length * 0.5;
    }
  }

  // Step 3: Account for newlines (each newline is typically its own token)
  const newlines = (text.match(/\n/g) || []).length;
  tokenCount += newlines * 0.5;

  // Step 4: Apply content-type multiplier
  // Code has more symbols, shorter variable names that don't merge well in BPE
  if (contentType === 'code') {
    tokenCount = Math.ceil(tokenCount * 1.3);
  }

  return Math.max(1, Math.round(tokenCount));
}

/**
 * Naive word-based estimation (the old method) — kept for comparison.
 * Uses ~4 chars per token heuristic.
 */
export function estimateTokensNaive(text) {
  if (!text || typeof text !== 'string') return 0;
  const charEstimate = Math.ceil(text.length / 4);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordEstimate = Math.ceil(words.length * 1.33);
  return Math.max(charEstimate, wordEstimate, 1);
}

/**
 * Compare BPE and naive estimates side-by-side.
 * Useful for demonstrating why tokenization matters.
 *
 * @param {string} text
 * @param {object} opts - { mode: 'text' | 'code' | 'auto' }
 * @returns {{ bpe: number, naive: number, delta: number, deltaPercent: string }}
 */
export function compareEstimates(text, opts = {}) {
  const bpe = estimateTokens(text, opts);
  const naive = estimateTokensNaive(text);
  const delta = bpe - naive;
  const deltaPercent = naive > 0
    ? `${delta >= 0 ? '+' : ''}${Math.round((delta / naive) * 100)}%`
    : '0%';
  return { bpe, naive, delta, deltaPercent };
}

/**
 * Truncate text to fit within a token budget.
 * Preserves complete words. Returns the truncated text.
 */
export function truncateToTokens(text, maxTokens, opts = {}) {
  if (!text || typeof text !== 'string') return '';
  if (maxTokens <= 0) return '';

  const currentTokens = estimateTokens(text, opts);
  if (currentTokens <= maxTokens) return text;

  // Binary search for the right word boundary
  const words = text.split(/(\s+)/); // preserve whitespace
  let lo = 0;
  let hi = words.length;

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = words.slice(0, mid).join('');
    if (estimateTokens(candidate, opts) <= maxTokens) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  const result = words.slice(0, lo).join('').trimEnd();
  // Final verification
  if (estimateTokens(result, opts) > maxTokens && lo > 1) {
    return words.slice(0, lo - 1).join('').trimEnd();
  }
  return result;
}

/**
 * Truncate from the middle, keeping start and end intact.
 * Inserts a marker where content was removed.
 */
export function truncateMiddle(text, maxTokens, marker = '\n[...truncated...]\n', opts = {}) {
  if (!text || typeof text !== 'string') return '';
  if (maxTokens <= 0) return '';

  const currentTokens = estimateTokens(text, opts);
  if (currentTokens <= maxTokens) return text;

  const markerTokens = estimateTokens(marker, opts);
  const contentBudget = maxTokens - markerTokens;
  if (contentBudget <= 0) return marker.trim();

  // Split budget: 60% to start (more important), 40% to end
  const startBudget = Math.floor(contentBudget * 0.6);
  const endBudget = contentBudget - startBudget;

  const startText = truncateToTokens(text, startBudget, opts);
  // For the end, estimate characters from token budget and take from tail
  const endCharBudget = endBudget * 4;
  let endText = text.slice(-endCharBudget);
  const firstSpace = endText.indexOf(' ');
  if (firstSpace > 0 && firstSpace < endText.length * 0.3) {
    endText = endText.slice(firstSpace + 1);
  }

  return startText + marker + endText;
}
