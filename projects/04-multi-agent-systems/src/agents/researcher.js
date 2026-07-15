/**
 * Researcher Agent
 *
 * Personality: thorough, methodical, source-obsessed.
 * Takes a topic and produces structured research notes with sources.
 *
 * Tools available (simulated in demo mode):
 *   - web_search(query) -> results[]
 *   - fetch_url(url)    -> page text
 */

const SYSTEM_PROMPT = `You are a meticulous technical researcher. Your job:
1. Break the topic into 3-5 sub-questions.
2. Search for authoritative sources (official docs, reputable blogs, RFCs).
3. For each sub-question, produce a structured note with:
   - key_claim: the core technical fact
   - source_url: where you found it
   - confidence: high / medium / low
4. Return JSON: { sub_questions: [...], notes: [...] }
Never speculate. If you cannot find a source, say so.`;

/**
 * Mock tools — simulate web search and URL fetching.
 * In production these would call real APIs.
 */
const mockTools = {
  web_search(query) {
    return [
      {
        title: `Understanding ${query}`,
        url: `https://docs.example.com/${encodeURIComponent(query)}`,
        snippet: `A comprehensive guide to ${query} covering architecture, best practices, and common pitfalls.`,
      },
      {
        title: `${query} — Performance Deep Dive`,
        url: `https://blog.example.com/${encodeURIComponent(query)}-perf`,
        snippet: `Benchmarks and real-world measurements for ${query} under load.`,
      },
      {
        title: `Official Documentation: ${query}`,
        url: `https://official.example.com/docs/${encodeURIComponent(query)}`,
        snippet: `Reference documentation for configuring and tuning ${query}.`,
      },
    ];
  },

  fetch_url(url) {
    return `[Fetched content from ${url}]\nThis page explains the topic in detail including architecture diagrams, configuration parameters, and benchmarks showing 40% improvement with proper tuning.`;
  },
};

/**
 * Run the researcher agent.
 * @param {string} topic
 * @param {object} _opts  (reserved for real LLM config)
 * @returns {object} research notes
 */
export async function runResearcher(topic, _opts = {}) {
  console.log('\n--- Researcher Agent ---');
  console.log(`System prompt: "${SYSTEM_PROMPT.slice(0, 80)}..."`);
  console.log(`Topic: "${topic}"`);

  // Step 1 — decompose topic into sub-questions (mock LLM)
  // Extract the actual subject (strip "Write a ... on/about" prefix)
  const subject = topic.replace(/^write a.*?(?:on|about)\s+/i, '') || topic;

  const subQuestions = [
    `What is ${subject} and why does it matter?`,
    `How does ${subject} work under the hood?`,
    `What are common pitfalls and best practices for ${subject}?`,
    `How does ${subject} perform at scale?`,
  ];
  console.log(`  Sub-questions generated: ${subQuestions.length}`);

  // Step 2 — search for each sub-question
  const allResults = [];
  for (const q of subQuestions) {
    const results = mockTools.web_search(q);
    console.log(`  web_search("${q.slice(0, 50)}...") -> ${results.length} results`);
    allResults.push(...results);
  }

  // Step 3 — fetch top sources
  const uniqueUrls = [...new Set(allResults.map((r) => r.url))].slice(0, 4);
  for (const url of uniqueUrls) {
    const _content = mockTools.fetch_url(url);
    console.log(`  fetch_url("${url.slice(0, 60)}...") -> fetched`);
  }

  // Step 4 — synthesize notes (mock LLM output)
  const notes = [
    {
      key_claim: `${topic} reduces overhead by reusing existing connections instead of creating new ones for each request.`,
      source_url: uniqueUrls[0],
      confidence: 'high',
    },
    {
      key_claim: `Without ${topic}, applications can exhaust OS-level file descriptors under high concurrency, leading to EMFILE errors.`,
      source_url: uniqueUrls[1],
      confidence: 'high',
    },
    {
      key_claim: `Proper tuning of pool size depends on the database's max_connections setting and the number of application instances.`,
      source_url: uniqueUrls[2],
      confidence: 'high',
    },
    {
      key_claim: `Benchmarks show 30-50% latency reduction when using ${topic} compared to connect-per-request under sustained load.`,
      source_url: uniqueUrls[1],
      confidence: 'medium',
    },
    {
      key_claim: `Idle connection timeouts should be configured to avoid stale-connection errors, typically 10-30 seconds.`,
      source_url: uniqueUrls[3] || uniqueUrls[0],
      confidence: 'high',
    },
  ];

  const tokenUsage = { prompt: 1850, completion: 620, total: 2470 };
  console.log(`  Tokens used: ${tokenUsage.total}`);

  return {
    sub_questions: subQuestions,
    notes,
    sources: uniqueUrls,
    tokenUsage,
  };
}
