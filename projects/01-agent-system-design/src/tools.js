// ─── Tool Definitions & Implementations ─────────────────────────────────────
// Each tool has: name, description, parameters schema, and an execute function.
// In demo mode, tools return mock data. In live mode, they hit the GitHub API.

const GITHUB_API = 'https://api.github.com';

/**
 * Parse a GitHub PR URL into { owner, repo, number }.
 */
export function parsePRUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) throw new Error(`Invalid PR URL: ${url}`);
  return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
}

/**
 * Make an authenticated GitHub API request.
 */
async function githubFetch(path, token) {
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'pr-review-agent/1.0',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${GITHUB_API}${path}`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${path} — ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Make a GitHub API request that returns raw text (for diffs).
 */
async function githubFetchRaw(path, token, accept = 'application/vnd.github.v3.diff') {
  const headers = {
    Accept: accept,
    'User-Agent': 'pr-review-agent/1.0',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${GITHUB_API}${path}`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${path} — ${body.slice(0, 200)}`);
  }
  return res.text();
}

// ─── Tool Registry ───────────────────────────────────────────────────────────

/**
 * Returns the full tool registry. Each tool has:
 *   name, description, parameters (JSON Schema), execute(args, ctx)
 *
 * ctx = { owner, repo, number, token, mockData }
 */
export function createTools() {
  return [
    {
      name: 'fetchPR',
      description:
        'Fetch PR metadata: title, body, author, labels, changed file count, base/head branches.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      async execute(_args, ctx) {
        if (ctx.mockData) return ctx.mockData.pr;
        const pr = await githubFetch(`/repos/${ctx.owner}/${ctx.repo}/pulls/${ctx.number}`, ctx.token);
        return {
          title: pr.title,
          body: pr.body,
          author: pr.user.login,
          labels: pr.labels.map((l) => l.name),
          changedFiles: pr.changed_files,
          additions: pr.additions,
          deletions: pr.deletions,
          base: pr.base.ref,
          head: pr.head.ref,
        };
      },
    },

    {
      name: 'fetchDiff',
      description:
        'Fetch the unified diff for the entire PR. Returns the raw diff text. For large PRs this can be big — the agent should use this to identify which files to focus on.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      async execute(_args, ctx) {
        if (ctx.mockData) return ctx.mockData.diff;
        return githubFetchRaw(`/repos/${ctx.owner}/${ctx.repo}/pulls/${ctx.number}`, ctx.token);
      },
    },

    {
      name: 'fetchFile',
      description:
        'Fetch the full contents of a file from the PR head branch. Use this to get surrounding context for a changed file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to repo root' },
        },
        required: ['path'],
      },
      async execute(args, ctx) {
        if (ctx.mockData) {
          const content = ctx.mockData.files?.[args.path];
          if (!content) return `[File not found: ${args.path}]`;
          return content;
        }
        const data = await githubFetch(
          `/repos/${ctx.owner}/${ctx.repo}/contents/${encodeURIComponent(args.path)}?ref=${ctx.head || 'main'}`,
          ctx.token,
        );
        return Buffer.from(data.content, 'base64').toString('utf-8');
      },
    },

    {
      name: 'searchCode',
      description:
        'Search the repository for a code pattern (e.g., function name, import, symbol). Returns matching file paths and line snippets. Use this to find callers, usages, or related code.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (code pattern, function name, etc.)' },
        },
        required: ['query'],
      },
      async execute(args, ctx) {
        if (ctx.mockData) {
          const results = ctx.mockData.search?.[args.query];
          return results || `[No results for: ${args.query}]`;
        }
        // GitHub code search API (requires auth, has rate limits)
        const data = await githubFetch(
          `/search/code?q=${encodeURIComponent(args.query)}+repo:${ctx.owner}/${ctx.repo}`,
          ctx.token,
        );
        return data.items.slice(0, 10).map((item) => ({
          file: item.path,
          url: item.html_url,
        }));
      },
    },

    {
      name: 'postComment',
      description:
        'Post a review comment on the PR. In demo mode this logs to console instead. Use this after producing findings to share them on the PR.',
      parameters: {
        type: 'object',
        properties: {
          body: { type: 'string', description: 'Markdown comment body' },
        },
        required: ['body'],
      },
      async execute(args, ctx) {
        if (ctx.mockData) {
          console.log('\n--- [MOCK] Would post PR comment ---');
          console.log(args.body.slice(0, 500) + (args.body.length > 500 ? '...' : ''));
          return { posted: false, reason: 'demo mode' };
        }
        const res = await githubFetch(
          `/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.number}/comments`,
          ctx.token,
        );
        return { posted: true, id: res.id };
      },
    },
  ];
}

/**
 * Build the tool descriptions block that gets injected into the agent's system prompt.
 */
export function toolDescriptionsForPrompt(tools) {
  return tools
    .map((t) => {
      const params =
        t.parameters.required.length > 0
          ? `Parameters: ${JSON.stringify(t.parameters.properties, null, 2)}`
          : 'No parameters.';
      return `### ${t.name}\n${t.description}\n${params}`;
    })
    .join('\n\n');
}
