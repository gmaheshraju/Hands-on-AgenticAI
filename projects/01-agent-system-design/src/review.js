#!/usr/bin/env node
// ─── Live PR Review Runner ───────────────────────────────────────────────────
// Usage: node src/review.js <PR_URL>
//
// Required env vars:
//   GITHUB_TOKEN  — GitHub personal access token (for API access)
//   LLM_API_KEY   — API key for Claude/OpenAI (for the reasoning engine)
//   LLM_PROVIDER  — "anthropic" (default) or "openai"
//
// Example:
//   GITHUB_TOKEN=ghp_xxx LLM_API_KEY=sk-xxx node src/review.js https://github.com/org/repo/pull/42

import { runReActLoop } from './agent.js';
import { createTools, parsePRUrl } from './tools.js';

// ─── LLM Adapters ────────────────────────────────────────────────────────────

/**
 * Create an LLM call function for Anthropic Claude.
 */
function createAnthropicCaller(apiKey) {
  return async function callAnthropic(messages) {
    const systemMsg = messages.find((m) => m.role === 'system');
    const conversationMsgs = messages.filter((m) => m.role !== 'system');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemMsg?.content || '',
        messages: conversationMsgs.map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        })),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    return data.content[0].text;
  };
}

/**
 * Create an LLM call function for OpenAI.
 */
function createOpenAICaller(apiKey) {
  return async function callOpenAI(messages) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 4096,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI API ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const prUrl = process.argv[2];
  if (!prUrl) {
    console.error('Usage: node src/review.js <PR_URL>');
    console.error('Example: node src/review.js https://github.com/org/repo/pull/42');
    console.error('');
    console.error('Required env vars: GITHUB_TOKEN, LLM_API_KEY');
    console.error('Optional: LLM_PROVIDER=anthropic|openai (default: anthropic)');
    process.exit(1);
  }

  const githubToken = process.env.GITHUB_TOKEN;
  const llmApiKey = process.env.LLM_API_KEY;
  const llmProvider = process.env.LLM_PROVIDER || 'anthropic';

  if (!githubToken) {
    console.error('Error: GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }
  if (!llmApiKey) {
    console.error('Error: LLM_API_KEY environment variable is required');
    process.exit(1);
  }

  const { owner, repo, number } = parsePRUrl(prUrl);
  console.log(`Reviewing: ${owner}/${repo}#${number}`);

  const llmCall =
    llmProvider === 'openai' ? createOpenAICaller(llmApiKey) : createAnthropicCaller(llmApiKey);

  const tools = createTools();

  const result = await runReActLoop({
    llmCall,
    tools,
    toolContext: { owner, repo, number, token: githubToken },
    config: { maxIterations: 15, verbose: true },
  });

  // Output
  console.log('\n' + '='.repeat(70));
  console.log(`Review complete: ${result.iterations} iterations, ~${result.tokenEstimate} tokens`);
  console.log(`Findings: ${result.output.findings.length}`);
  console.log('='.repeat(70));
  console.log(JSON.stringify(result.output, null, 2));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
