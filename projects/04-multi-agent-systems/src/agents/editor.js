/**
 * Editor Agent
 *
 * Personality: critical, precise, focused on clarity and structure.
 * Reviews a draft and either accepts it or rejects it with feedback.
 * No tools — works directly on the draft text.
 *
 * Scoring is content-derived (not attempt-number-derived): it looks at the
 * actual draft — length vs target, presence of code, section structure,
 * and concrete evidence — and produces issues that describe what is
 * actually wrong with THIS draft.
 */

const SYSTEM_PROMPT = `You are a senior technical editor. Review the draft for:
1. STRUCTURE: Does it flow logically? Is there a clear intro, body, conclusion?
2. CLARITY: Can a mid-level engineer follow it without re-reading?
3. DEPTH: Are claims backed by evidence or examples?
4. CODE: Are code snippets correct, minimal, and well-commented?
5. LENGTH: Is it within 800-1200 words?

Output a JSON object:
{
  "verdict": "ACCEPT" | "REJECT",
  "score": 1-10,
  "issues": [{ "location": "...", "severity": "major|minor", "comment": "..." }],
  "summary": "one-paragraph summary of your review"
}

Be tough. A score below 7 means REJECT.`;

const TARGET_MIN_WORDS = 800;
const TARGET_MAX_WORDS = 1200;
const PASS_THRESHOLD = 7;

const INTRO_HEADER_RE = /^#{1,3}\s*(the problem|introduction|why|overview|background)/im;
const CONCLUSION_HEADER_RE = /^#{1,3}\s*(takeaways|conclusion|summary|key takeaways|wrap[- ]?up)/im;
const BENCHMARK_RE = /p50|p99|p95|\bms\b.*\bms\b|before[^.\n]*after|\d+ms\s*(vs\.?|to|→)\s*\d+ms/i;
const HEADER_RE = /^#{1,3}\s+.+$/gm;
const CODE_FENCE_RE = /```/g;

/**
 * Analyze a draft and derive a 0-10 score plus itemized issues.
 * @param {string} draft
 * @returns {{ score: number, issues: object[], metrics: object }}
 */
function scoreDraft(draft) {
  const wordCount = draft.trim().split(/\s+/).filter(Boolean).length;
  const codeBlockCount = (draft.match(CODE_FENCE_RE) || []).length / 2;
  const headerCount = (draft.match(HEADER_RE) || []).length;
  const hasBenchmarkEvidence = BENCHMARK_RE.test(draft);
  const hasIntro = INTRO_HEADER_RE.test(draft);
  const hasConclusion = CONCLUSION_HEADER_RE.test(draft);

  const issues = [];
  let score = 0;

  // 1. Length vs target (max 5 points)
  let lengthPoints;
  if (wordCount >= TARGET_MIN_WORDS && wordCount <= TARGET_MAX_WORDS) {
    lengthPoints = 5;
  } else if (wordCount >= 400) {
    lengthPoints = 3;
    issues.push({
      location: 'Overall',
      severity: 'major',
      comment: `Word count is ${wordCount}, below the ${TARGET_MIN_WORDS}-${TARGET_MAX_WORDS} target. Expand the depth sections with more explanation and examples.`,
    });
  } else if (wordCount >= 200) {
    lengthPoints = 1;
    issues.push({
      location: 'Overall',
      severity: 'major',
      comment: `Word count is ${wordCount}, well below the ${TARGET_MIN_WORDS}-${TARGET_MAX_WORDS} target. The draft reads as an outline, not a finished post.`,
    });
  } else {
    lengthPoints = 0;
    issues.push({
      location: 'Overall',
      severity: 'major',
      comment: `Word count is ${wordCount}, far too short for a technical deep-dive. Needs a full rewrite with substantially more depth.`,
    });
  }
  score += lengthPoints;

  // 2. Code coverage (max 2 points)
  if (codeBlockCount >= 2) {
    score += 2;
  } else if (codeBlockCount >= 1) {
    score += 1;
    issues.push({
      location: 'Code Snippet',
      severity: 'minor',
      comment: 'Only one code example. Consider adding a second snippet showing usage or error handling, not just configuration.',
    });
  } else {
    issues.push({
      location: 'Code',
      severity: 'major',
      comment: 'No code snippets found. A technical deep-dive needs at least one concrete, runnable example.',
    });
  }

  // 3. Structural depth — multiple sections (max 1 point)
  if (headerCount >= 4) {
    score += 1;
  } else {
    issues.push({
      location: 'Structure',
      severity: 'major',
      comment: `Only ${headerCount} section header(s) found. Break the content into more sections (problem, mechanics, config, performance, pitfalls) so it is scannable.`,
    });
  }

  // 4. Concrete quantitative evidence (max 1 point)
  if (hasBenchmarkEvidence) {
    score += 1;
  } else {
    issues.push({
      location: 'Performance',
      severity: 'major',
      comment: 'Performance claims lack concrete before/after numbers (e.g. p50/p99 latency). Add a real or clearly-labeled benchmark comparison.',
    });
  }

  // 5. Intro + conclusion arc (max 1 point)
  if (hasIntro && hasConclusion) {
    score += 1;
  } else {
    issues.push({
      location: 'Introduction',
      severity: hasIntro ? 'minor' : 'major',
      comment: !hasIntro
        ? 'The opening does not clearly frame the problem. Start with a concrete scenario the reader recognizes.'
        : 'Missing a clear takeaways/conclusion section to close the piece with actionable next steps.',
    });
  }

  return { score: Math.min(10, score), issues, metrics: { wordCount, codeBlockCount, headerCount, hasBenchmarkEvidence, hasIntro, hasConclusion } };
}

/**
 * Run the editor agent.
 * @param {string} draft — the writer's draft
 * @param {number} attempt — which review round (1-based), used only for logging
 * @returns {object} { verdict, score, issues, summary, tokenUsage }
 */
export async function runEditor(draft, attempt = 1) {
  console.log('\n--- Editor Agent ---');
  console.log(`System prompt: "${SYSTEM_PROMPT.slice(0, 80)}..."`);
  console.log(`Review attempt: ${attempt}`);
  console.log(`Draft length: ${draft.length} chars`);

  const { score, issues, metrics } = scoreDraft(draft);
  console.log(`  Word count: ${metrics.wordCount}`);
  console.log(`  Code blocks: ${metrics.codeBlockCount}, Headers: ${metrics.headerCount}, Benchmark evidence: ${metrics.hasBenchmarkEvidence}`);

  const verdict = score >= PASS_THRESHOLD ? 'ACCEPT' : 'REJECT';

  const majorCount = issues.filter((i) => i.severity === 'major').length;
  const summary =
    verdict === 'ACCEPT'
      ? `Strong draft (score ${score}/10). Length, structure, code coverage, and evidence are all solid. ${issues.length > 0 ? `${issues.length} minor/major suggestion(s) remain for future polish.` : 'No outstanding issues.'}`
      : `Draft needs revision (score ${score}/10). ${majorCount} major issue(s) found${majorCount > 0 ? ': ' + issues.filter((i) => i.severity === 'major').map((i) => i.location).join(', ') : ''}. Needs another pass before it is publish-ready.`;

  const review = { verdict, score, issues, summary };

  const tokenUsage = { prompt: 2100, completion: 480, total: 2580 };
  console.log(`  Verdict: ${review.verdict} (score: ${review.score}/10)`);
  console.log(`  Issues found: ${review.issues.length}`);
  console.log(`  Tokens used: ${tokenUsage.total}`);

  return { ...review, tokenUsage };
}
