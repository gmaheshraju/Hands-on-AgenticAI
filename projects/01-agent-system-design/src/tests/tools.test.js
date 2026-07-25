import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parsePRUrl, createTools, toolDescriptionsForPrompt } from '../tools.js';

describe('parsePRUrl', () => {
  it('extracts owner, repo, and PR number from a standard URL', () => {
    const result = parsePRUrl('https://github.com/anthropics/claude-code/pull/42');
    assert.deepStrictEqual(result, {
      owner: 'anthropics',
      repo: 'claude-code',
      number: 42,
    });
  });

  it('ignores trailing path segments after the PR number', () => {
    const result = parsePRUrl('https://github.com/org/repo/pull/7/files');
    assert.strictEqual(result.number, 7);
  });

  it('throws a descriptive error on a non-PR GitHub URL', () => {
    assert.throws(
      () => parsePRUrl('https://github.com/org/repo/issues/7'),
      /Invalid PR URL/,
    );
  });

  it('throws on a completely unrelated URL', () => {
    assert.throws(() => parsePRUrl('https://example.com/'), /Invalid PR URL/);
  });
});

describe('createTools', () => {
  const tools = createTools();

  it('registers the five expected tools', () => {
    const names = tools.map((t) => t.name).sort();
    assert.deepStrictEqual(names, [
      'fetchDiff',
      'fetchFile',
      'fetchPR',
      'postComment',
      'searchCode',
    ]);
  });

  it('fetchPR returns mock data unchanged in demo mode', async () => {
    const fetchPR = tools.find((t) => t.name === 'fetchPR');
    const mockPR = { title: 'Fix bug', author: 'octocat' };
    const result = await fetchPR.execute({}, { mockData: { pr: mockPR } });
    assert.deepStrictEqual(result, mockPR);
  });

  it('fetchFile returns a placeholder message when the mock file is missing', async () => {
    const fetchFile = tools.find((t) => t.name === 'fetchFile');
    const result = await fetchFile.execute(
      { path: 'missing.js' },
      { mockData: { files: {} } },
    );
    assert.match(result, /File not found: missing\.js/);
  });

  it('searchCode falls back to a "no results" message in demo mode', async () => {
    const searchCode = tools.find((t) => t.name === 'searchCode');
    const result = await searchCode.execute(
      { query: 'nonexistentSymbol' },
      { mockData: { search: {} } },
    );
    assert.match(result, /No results for: nonexistentSymbol/);
  });

  it('postComment logs instead of posting and reports demo mode', async () => {
    const postComment = tools.find((t) => t.name === 'postComment');
    const result = await postComment.execute(
      { body: 'Looks good overall.' },
      { mockData: {} },
    );
    assert.deepStrictEqual(result, { posted: false, reason: 'demo mode' });
  });
});

describe('toolDescriptionsForPrompt', () => {
  it('renders "No parameters." for tools with no required params', () => {
    const tools = createTools();
    const desc = toolDescriptionsForPrompt(tools);
    assert.match(desc, /### fetchPR[\s\S]*?No parameters\./);
  });

  it('renders a Parameters block for tools with required params', () => {
    const tools = createTools();
    const desc = toolDescriptionsForPrompt(tools);
    assert.match(desc, /### fetchFile[\s\S]*?Parameters:/);
  });

  it('joins each tool block with a blank line', () => {
    const tools = createTools();
    const desc = toolDescriptionsForPrompt(tools);
    assert.strictEqual(desc.split('\n\n').filter((s) => s.startsWith('### ')).length, tools.length);
  });
});
