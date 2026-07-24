import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getToolDescriptions } from './tools.js';

export function getBasePrompt() {
  return `## Role
You are a research agent. Answer questions by searching Wikipedia, reading articles, and synthesizing findings.

## Tools
${getToolDescriptions()}

## Response Format
ALWAYS respond with ONLY a JSON object. No other text. Example:
{"thought": "I should search for CRISPR", "action": "wikipedia_search", "input": {"query": "CRISPR"}}

## Workflow (follow this EXACTLY)
Step 1: Use wikipedia_search to find relevant articles.
Step 2: Use wikipedia_article to read the FIRST article from the search results. Use the exact title.
Step 3: Use wikipedia_search with DIFFERENT search terms to find more articles.
Step 4: Use wikipedia_article to read another article.
Step 5: After reading 2+ articles, use synthesize with a complete answer.

IMPORTANT: After a search returns results, your NEXT action MUST be wikipedia_article to read one of those results. Do NOT search again immediately.
`;
}

export function loadHistory(historyDir = './data/prompt-history') {
  if (!existsSync(historyDir)) return [];

  const files = readdirSync(historyDir)
    .filter(f => f.startsWith('v') && f.endsWith('.json'))
    .sort((a, b) => {
      const numA = parseInt(a.slice(1));
      const numB = parseInt(b.slice(1));
      return numA - numB;
    });

  return files.map(f => {
    const data = JSON.parse(readFileSync(join(historyDir, f), 'utf-8'));
    return data;
  });
}

export function saveVersion(entry, historyDir = './data/prompt-history') {
  mkdirSync(historyDir, { recursive: true });
  const filename = `v${entry.version}.json`;
  writeFileSync(join(historyDir, filename), JSON.stringify(entry, null, 2));
}

export function getLatestPrompt(historyDir = './data/prompt-history') {
  const history = loadHistory(historyDir);
  if (history.length === 0) return { version: 1, prompt: getBasePrompt() };
  const latest = history[history.length - 1];
  return { version: latest.version, prompt: latest.prompt };
}
