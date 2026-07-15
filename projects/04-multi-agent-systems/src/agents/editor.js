/**
 * Editor Agent
 *
 * Personality: critical, precise, focused on clarity and structure.
 * Reviews a draft and either accepts it or rejects it with feedback.
 * No tools — works directly on the draft text.
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

/**
 * Run the editor agent.
 * @param {string} draft — the writer's draft
 * @param {number} attempt — which review round (1-based)
 * @returns {object} { verdict, score, issues, summary, tokenUsage }
 */
export async function runEditor(draft, attempt = 1) {
  console.log('\n--- Editor Agent ---');
  console.log(`System prompt: "${SYSTEM_PROMPT.slice(0, 80)}..."`);
  console.log(`Review attempt: ${attempt}`);
  console.log(`Draft length: ${draft.length} chars`);

  const wordCount = draft.split(/\s+/).length;
  console.log(`  Word count: ${wordCount}`);

  // Simulate: first attempt gets rejected (score 5), second attempt passes (score 8)
  let review;
  if (attempt === 1) {
    review = {
      verdict: 'REJECT',
      score: 5,
      issues: [
        {
          location: 'Introduction',
          severity: 'major',
          comment: 'The opening is too abrupt. Start with a concrete scenario the reader recognizes — e.g., "Your dashboard is timing out under load."',
        },
        {
          location: 'How It Works',
          severity: 'major',
          comment: 'The taxi analogy is good but the section jumps straight to code without explaining what happens internally (checkout, return, queue, eviction).',
        },
        {
          location: 'Performance',
          severity: 'major',
          comment: 'Claims "30-50% latency reduction" but provides no benchmark methodology or numbers. Add concrete before/after measurements.',
        },
        {
          location: 'Code Snippet',
          severity: 'minor',
          comment: 'The code sample uses magic numbers (20, 30000). Add comments explaining why these values were chosen.',
        },
        {
          location: 'Overall',
          severity: 'minor',
          comment: `Word count is ${wordCount}, which is ${wordCount < 800 ? 'below' : 'within'} the 800-1200 target. ${wordCount < 800 ? 'Expand the depth sections.' : ''}`,
        },
      ],
      summary:
        'The draft covers the right topics but lacks depth. The introduction does not motivate the reader, the technical explanation skips internal mechanics, and the performance claims are unsubstantiated. Needs a significant revision pass.',
    };
  } else {
    review = {
      verdict: 'ACCEPT',
      score: 8,
      issues: [
        {
          location: 'Sizing the Pool',
          severity: 'minor',
          comment: 'The formula reference is useful but could cite the original source (PostgreSQL wiki).',
        },
        {
          location: 'Common Pitfalls',
          severity: 'minor',
          comment: 'Consider adding a note about connection pooling in serverless environments (Lambda cold starts).',
        },
      ],
      summary:
        'Strong revision. The introduction now motivates the reader with concrete latency numbers. The mental model section is clear and memorable. Code snippets are well-commented. Performance section includes real benchmark data. Two minor suggestions for future improvement, but the draft is ready for fact-checking.',
    };
  }

  const tokenUsage = { prompt: 2100, completion: 480, total: 2580 };
  console.log(`  Verdict: ${review.verdict} (score: ${review.score}/10)`);
  console.log(`  Issues found: ${review.issues.length}`);
  console.log(`  Tokens used: ${tokenUsage.total}`);

  return { ...review, tokenUsage };
}
