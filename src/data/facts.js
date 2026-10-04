// Prices, model names and limits that the posts quote. One place to update when the
// market moves, instead of 100 hardcoded numbers drifting across 13 posts.
//
// Every value carries its source and the date it was checked. When you change one,
// re-check the source, update CHECKED, and rebuild: posts render from these values.
// Durable teaching numbers (example budgets, ratios) stay in the posts; only facts
// about specific products live here.

export const CHECKED = 'Oct 2026';

// Anthropic first-party API, $ per 1M tokens. Source: Claude API model table
// (platform.claude.com pricing), checked 2026-10-04. Cache write = 1.25x input
// (5-minute TTL). Cache read: $0.20 for Sonnet 5.5 and Opus 5.5 per the model
// table; Haiku 4.5 at the standard 0.1x of input.
export const CLAUDE = {
  haiku: { name: 'Claude Haiku 4.5', short: 'Haiku 4.5', id: 'claude-haiku-4-5', input: 1, output: 5, cacheRead: 0.1, context: '200K', contextTokens: 200000 },
  sonnet: { name: 'Claude Sonnet 5.5', short: 'Sonnet 5.5', id: 'claude-sonnet-5-5', input: 2, output: 10, cacheRead: 0.2, context: '1M', contextTokens: 1000000 },
  opus: { name: 'Claude Opus 5.5', short: 'Opus 5.5', id: 'claude-opus-5-5', input: 4, output: 20, cacheRead: 0.2, context: '1M', contextTokens: 1000000 },
  fable: { name: 'Claude Fable 5.1', short: 'Fable 5.1', id: 'claude-fable-5-1', input: 10, output: 50, context: '1M' },
};
export const cacheWrite = (m) => +(m.input * 1.25).toFixed(2);

// OpenAI API, $ per 1M tokens. Source: developers.openai.com/api/docs/pricing, checked 2026-10-04.
export const OPENAI = {
  flagship: { name: 'GPT-6 Astra', input: 10, output: 50 },
  mid: { name: 'GPT-6.1 Sol', input: 2, output: 10 },
  small: { name: 'GPT-6 Luna', input: 0.1, output: 0.5 },
  embedSmall: { name: 'text-embedding-3-small', input: 0.02 },
  embedLarge: { name: 'text-embedding-3-large', input: 0.13 },
};

// Hosted reranking. Cohere Rerank 3.5 / 4 Fast list at ~$2 per 1,000 searches
// (a search = one query over up to ~100 short documents). Checked 2026-10-04.
export const RERANK_PER_1K_SEARCHES = 2;

// The cheap / frontier tiers as prose, for "use a small model (...)" sentences.
export const SMALL_MODELS = `${CLAUDE.haiku.name} or ${OPENAI.small.name}`;
export const FRONTIER_MODELS = `${CLAUDE.opus.name} or ${OPENAI.flagship.name}`;

// $ formatting for prices that render in prose and tables. Thousands separators are
// added by hand (not toLocaleString) so the prerender and the browser produce identical
// text, or hydration fails.
const commas = (str) => str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const usd = (n) => {
  const s = n < 1 || !Number.isInteger(n) ? n.toFixed(2) : String(n);
  const [whole, frac] = s.split('.');
  return `$${commas(whole)}${frac ? `.${frac}` : ''}`;
};
