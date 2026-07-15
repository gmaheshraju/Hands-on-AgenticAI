/**
 * Issue Parser — Extracts structured data from GitHub issues (mock or real API).
 *
 * Parses: title, description, labels, mentioned files/paths, error messages,
 * expected behavior, and steps to reproduce.
 */

// ---------- Mock issues for demo mode ----------

const MOCK_ISSUES = {
  1: {
    number: 1,
    title: 'GET /users/:id returns 500 when user not found',
    body: `## Bug Report

When requesting a user that doesn't exist via \`GET /users/:id\`, the API returns a 500 Internal Server Error instead of a proper 404 response.

### Steps to Reproduce
1. Start the server: \`npm start\`
2. Send a request: \`GET /users/999\`
3. Observe: 500 Internal Server Error with stack trace

### Expected Behavior
Should return \`{ "error": "User not found" }\` with status 404.

### Actual Behavior
\`\`\`
TypeError: Cannot read properties of undefined (reading 'name')
    at /src/app.js:28:38
\`\`\`

### Files Likely Involved
- \`src/app.js\` — the route handler for \`/users/:id\`
- \`tests/app.test.js\` — needs a test for 404 case

### Labels
bug, api, good-first-issue`,
    labels: ['bug', 'api', 'good-first-issue'],
    state: 'open',
    html_url: 'https://github.com/example/sample-api/issues/1',
  },
};

// ---------- Extraction helpers ----------

/**
 * Extract file paths mentioned in issue body.
 * Matches patterns like `src/app.js`, `tests/foo.test.js`, `/path/to/file.ts`
 */
function extractMentionedFiles(body) {
  const filePattern = /(?:^|\s|`|\/)((?:[\w.-]+\/)*[\w.-]+\.[a-z]{1,4})(?:\s|`|$|,|\))/gm;
  const files = new Set();
  let match;
  while ((match = filePattern.exec(body)) !== null) {
    const file = match[1];
    // Filter out common false positives
    if (!file.match(/^(https?|www\.|npm\.|node_modules)/)) {
      files.add(file);
    }
  }
  return [...files];
}

/**
 * Extract error messages from code blocks in the issue body.
 */
function extractErrors(body) {
  const codeBlocks = [];
  const codeBlockPattern = /```(?:\w*\n)?([\s\S]*?)```/g;
  let match;
  while ((match = codeBlockPattern.exec(body)) !== null) {
    const content = match[1].trim();
    // Heuristic: if it contains Error, TypeError, at /, stack trace markers
    if (content.match(/Error|TypeError|ReferenceError|at\s+\//i)) {
      codeBlocks.push(content);
    }
  }
  return codeBlocks;
}

/**
 * Extract labeled sections from the issue body (## Headers).
 */
function extractSections(body) {
  const sections = {};
  const sectionPattern = /^##\s+(.+)$/gm;
  const matches = [...body.matchAll(sectionPattern)];

  for (let i = 0; i < matches.length; i++) {
    const title = matches[i][1].trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    sections[title] = body.slice(start, end).trim();
  }
  return sections;
}

// ---------- Main parser ----------

/**
 * Parse a GitHub issue into structured data.
 *
 * @param {string|number} input — Issue number (for mock) or GitHub URL
 * @returns {object} Parsed issue with title, body, labels, mentionedFiles, errors, sections
 */
export async function parseIssue(input) {
  let issue;

  if (typeof input === 'number' || /^\d+$/.test(input)) {
    // Mock issue lookup
    const num = typeof input === 'number' ? input : parseInt(input, 10);
    issue = MOCK_ISSUES[num];
    if (!issue) {
      throw new Error(`Mock issue #${num} not found. Available: ${Object.keys(MOCK_ISSUES).join(', ')}`);
    }
  } else if (typeof input === 'string' && input.startsWith('http')) {
    // Real GitHub API call
    issue = await fetchGitHubIssue(input);
  } else if (typeof input === 'object' && input.title && input.body) {
    // Direct issue object
    issue = input;
  } else {
    throw new Error('Input must be an issue number (mock), GitHub URL, or issue object');
  }

  const mentionedFiles = extractMentionedFiles(issue.body);
  const errors = extractErrors(issue.body);
  const sections = extractSections(issue.body);

  return {
    number: issue.number,
    title: issue.title,
    body: issue.body,
    labels: issue.labels || [],
    state: issue.state || 'open',
    url: issue.html_url || null,
    mentionedFiles,
    errors,
    sections,
  };
}

/**
 * Fetch an issue from the GitHub API (unauthenticated, rate-limited).
 */
async function fetchGitHubIssue(url) {
  // Parse: https://github.com/owner/repo/issues/123
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (!match) {
    throw new Error(`Invalid GitHub issue URL: ${url}`);
  }
  const [, owner, repo, number] = match;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${number}`;

  const res = await fetch(apiUrl, {
    headers: { 'Accept': 'application/vnd.github.v3+json' },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return {
    number: data.number,
    title: data.title,
    body: data.body || '',
    labels: data.labels.map(l => (typeof l === 'string' ? l : l.name)),
    state: data.state,
    html_url: data.html_url,
  };
}

export { MOCK_ISSUES, extractMentionedFiles, extractErrors, extractSections };
