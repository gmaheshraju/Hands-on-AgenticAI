/**
 * Fact-Checker Agent
 *
 * Personality: skeptical, methodical, evidence-driven.
 * Takes every technical claim in the draft and verifies it against sources.
 * Tools available (simulated): fetch_url
 */

const SYSTEM_PROMPT = `You are a skeptical fact-checker for technical content. Your process:
1. Extract every factual claim from the draft (numbers, comparisons, "X causes Y").
2. For each claim, check whether the provided sources support it.
3. If a claim is unsupported, mark it as UNVERIFIED.
4. If a claim contradicts a source, mark it as INCORRECT.
5. If a claim is supported, mark it as VERIFIED.

Output JSON:
{
  "claims": [
    { "claim": "...", "verdict": "VERIFIED|UNVERIFIED|INCORRECT",
      "source": "url or null", "note": "..." }
  ],
  "overall": "PASS" | "FAIL",
  "summary": "..."
}

Be skeptical. Round numbers and vague comparisons are red flags.`;

const mockTools = {
  fetch_url(url) {
    return `[Re-checked content from ${url}] Content confirms: connection reuse reduces overhead, EMFILE errors occur without pooling, pool sizing depends on max_connections, benchmarks show 30-50% improvement, idle timeout best practice is 10-30s.`;
  },
};

/**
 * Run the fact-checker agent.
 * @param {string} draft    — the accepted draft
 * @param {object} research — original research notes (for source URLs)
 * @returns {object} { claims, overall, summary, tokenUsage }
 */
export async function runFactChecker(draft, research) {
  console.log('\n--- Fact-Checker Agent ---');
  console.log(`System prompt: "${SYSTEM_PROMPT.slice(0, 80)}..."`);
  console.log(`Draft length: ${draft.length} chars`);

  // Step 1 — extract claims from draft (mock)
  const extractedClaims = [
    'Connection pooling reuses existing connections instead of creating new ones.',
    'Without pooling, applications can exhaust OS file descriptors (EMFILE errors).',
    'Pool size depends on max_connections and number of app instances.',
    'Benchmarks show 30-50% latency reduction under sustained load.',
    'Idle connection timeouts should be 10-30 seconds.',
    'p50 = 45ms without pooling vs 12ms with pooling at 1000 concurrent users.',
    'The formula pool_size = (CPU_cores * 2) + effective_spindle_count.',
  ];
  console.log(`  Extracted ${extractedClaims.length} claims`);

  // Step 2 — re-check sources
  for (const url of research.sources.slice(0, 3)) {
    const _content = mockTools.fetch_url(url);
    console.log(`  fetch_url("${url.slice(0, 60)}...") -> re-checked`);
  }

  // Step 3 — verdict per claim
  const claims = [
    {
      claim: extractedClaims[0],
      verdict: 'VERIFIED',
      source: research.sources[0],
      note: 'Directly supported by primary source.',
    },
    {
      claim: extractedClaims[1],
      verdict: 'VERIFIED',
      source: research.sources[1],
      note: 'Confirmed: EMFILE is the specific error when file descriptors are exhausted.',
    },
    {
      claim: extractedClaims[2],
      verdict: 'VERIFIED',
      source: research.sources[2],
      note: 'Supported. The official docs recommend considering both factors.',
    },
    {
      claim: extractedClaims[3],
      verdict: 'VERIFIED',
      source: research.sources[1],
      note: 'Supported with caveat: the exact percentage depends heavily on workload type.',
    },
    {
      claim: extractedClaims[4],
      verdict: 'VERIFIED',
      source: research.sources[0],
      note: 'Confirmed. 30s is the most common default in major drivers.',
    },
    {
      claim: extractedClaims[5],
      verdict: 'UNVERIFIED',
      source: null,
      note: 'Specific p50/p99 numbers appear to be illustrative, not from a cited benchmark. Consider labeling as "example" or citing the source.',
    },
    {
      claim: extractedClaims[6],
      verdict: 'VERIFIED',
      source: 'https://wiki.postgresql.org/wiki/Number_Of_Database_Connections',
      note: 'This formula originates from the PostgreSQL wiki. Source should be cited.',
    },
  ];

  const verified = claims.filter((c) => c.verdict === 'VERIFIED').length;
  const unverified = claims.filter((c) => c.verdict === 'UNVERIFIED').length;
  const incorrect = claims.filter((c) => c.verdict === 'INCORRECT').length;

  const overall = incorrect === 0 && unverified <= 1 ? 'PASS' : 'FAIL';

  const summary = `${verified}/${claims.length} claims verified, ${unverified} unverified, ${incorrect} incorrect. ${
    overall === 'PASS'
      ? 'Draft passes fact-check with minor notes.'
      : 'Draft needs corrections before publishing.'
  }`;

  const tokenUsage = { prompt: 2400, completion: 550, total: 2950 };
  console.log(`  Results: ${verified} verified, ${unverified} unverified, ${incorrect} incorrect`);
  console.log(`  Overall: ${overall}`);
  console.log(`  Tokens used: ${tokenUsage.total}`);

  return { claims, overall, summary, tokenUsage };
}
