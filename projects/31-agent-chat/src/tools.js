const SAFE_MATH = /^[\d\s+\-*/().,%^]+$|Math\.(abs|ceil|floor|round|sqrt|pow|min|max|log|log10|PI|E)/;

export const TOOLS = {
  wikipedia_search: {
    description: 'Search Wikipedia for articles matching a query. Returns up to 5 titles with descriptions.',
    parameters: '{ "query": "search terms" }',
    execute: async ({ query }) => {
      const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&format=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { result: `Search failed (HTTP ${res.status})`, metadata: { error: true } };

      const [, titles, descriptions] = await res.json();
      if (!titles.length) return { result: 'No results found.', metadata: { count: 0 } };

      const formatted = titles.map((t, i) => `${i + 1}. ${t} — ${descriptions[i] || 'No description'}`).join('\n');
      return {
        result: `Found ${titles.length} results:\n${formatted}`,
        metadata: { count: titles.length, titles },
      };
    },
  },

  wikipedia_article: {
    description: 'Get the summary of a specific Wikipedia article by exact title.',
    parameters: '{ "title": "Article Title" }',
    execute: async ({ title }) => {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AgentChat/1.0 (production demo)' },
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) return { result: `Article "${title}" not found.`, metadata: { error: true } };
      if (!res.ok) return { result: `Failed to fetch article (HTTP ${res.status})`, metadata: { error: true } };

      const data = await res.json();
      const extract = data.extract || 'No content available.';
      return {
        result: extract,
        metadata: { title: data.title, length: extract.length },
      };
    },
  },

  calculator: {
    description: 'Evaluate a mathematical expression safely. Supports basic arithmetic and Math functions.',
    parameters: '{ "expression": "2 * Math.PI * 6371" }',
    execute: async ({ expression }) => {
      const sanitized = expression.replace(/[^0-9+\-*/().,%^ Math.absceilflooroundsqrtpwminaxlogPIE10]/g, '');
      if (!sanitized.trim()) return { result: 'Invalid expression.', metadata: { error: true } };

      try {
        const fn = new Function(`"use strict"; return (${sanitized})`);
        const value = fn();
        if (typeof value !== 'number' || !isFinite(value)) {
          return { result: `Result is not a finite number: ${value}`, metadata: { error: true } };
        }
        return { result: `${expression} = ${value}`, metadata: { value } };
      } catch (err) {
        return { result: `Calculation error: ${err.message}`, metadata: { error: true } };
      }
    },
  },
};

export function getToolDescriptions() {
  return Object.entries(TOOLS)
    .map(([name, tool]) => `- ${name}: ${tool.description}\n  Input: ${tool.parameters}`)
    .join('\n');
}

export async function executeTool(name, input) {
  const tool = TOOLS[name];
  if (!tool) return { result: `Unknown tool: ${name}`, metadata: { error: true } };

  try {
    return await tool.execute(input);
  } catch (err) {
    return { result: `Tool error: ${err.message}`, metadata: { error: true } };
  }
}
