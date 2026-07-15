import https from 'https';
import { isDemoMode } from './config.js';
import { recordUsage, calculateCost, formatCost, formatTokens } from './budget.js';
import { color } from './ui.js';

// ── Mock LLM for demo mode ──

function mockCommitMessage(diff) {
  const lines = diff.split('\n');
  const files = new Set();
  let additions = 0, deletions = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/b\/(.+)$/);
      if (match) files.add(match[1]);
    }
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }

  const fileList = [...files];
  const ext = fileList[0]?.split('.').pop() || 'txt';
  const typeMap = { js: 'feat', ts: 'feat', py: 'feat', md: 'docs', test: 'test', spec: 'test', json: 'chore', yml: 'chore', yaml: 'chore' };
  const type = typeMap[ext] || 'chore';

  // Detect scope from directory
  const scope = fileList[0]?.split('/')[0];
  const scopeStr = scope && scope !== fileList[0] ? `(${scope})` : '';

  let summary;
  if (additions > deletions * 3) summary = `add new functionality in ${fileList[0] || 'project'}`;
  else if (deletions > additions * 3) summary = `remove unused code from ${fileList[0] || 'project'}`;
  else summary = `update ${fileList.length} file${fileList.length > 1 ? 's' : ''} with ${additions} additions and ${deletions} deletions`;

  return `${type}${scopeStr}: ${summary}`;
}

function mockReview(diff) {
  const issues = [];
  const lines = diff.split('\n');
  let currentFile = '';
  let lineNum = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/b\/(.+)$/);
      if (match) currentFile = match[1];
      lineNum = 0;
    }
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      if (match) lineNum = parseInt(match[1]);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      lineNum++;
      // Check for common issues
      if (line.includes('console.log')) {
        issues.push({ file: currentFile, line: lineNum, severity: 'warning', category: 'style', message: 'Debug console.log left in code', suggestion: 'Remove console.log or replace with proper logging' });
      }
      if (line.includes('TODO') || line.includes('FIXME') || line.includes('HACK')) {
        issues.push({ file: currentFile, line: lineNum, severity: 'info', category: 'style', message: 'TODO/FIXME comment found', suggestion: 'Track this in your issue tracker' });
      }
      if (/password|secret|api.?key/i.test(line) && /[=:].*['"][^'"]{8,}/i.test(line)) {
        issues.push({ file: currentFile, line: lineNum, severity: 'critical', category: 'security', message: 'Possible hardcoded secret/credential', suggestion: 'Move to environment variable or secrets manager' });
      }
      if (/eval\s*\(/.test(line)) {
        issues.push({ file: currentFile, line: lineNum, severity: 'critical', category: 'security', message: 'Use of eval() detected', suggestion: 'Avoid eval() — use safer alternatives' });
      }
      if (/\.innerHTML\s*=/.test(line)) {
        issues.push({ file: currentFile, line: lineNum, severity: 'warning', category: 'security', message: 'Direct innerHTML assignment (XSS risk)', suggestion: 'Use textContent or sanitize input' });
      }
      if (line.length > 200) {
        issues.push({ file: currentFile, line: lineNum, severity: 'info', category: 'style', message: 'Line exceeds 200 characters', suggestion: 'Break into multiple lines for readability' });
      }
    } else if (!line.startsWith('-')) {
      lineNum++;
    }
  }

  return issues;
}

function mockExplain(content, filePath) {
  const ext = filePath.split('.').pop();
  const lines = content.split('\n');
  const totalLines = lines.length;

  // Extract function/class names
  const functions = [];
  const imports = [];
  for (const line of lines) {
    const fnMatch = line.match(/(?:function|const|let|var|def|class)\s+(\w+)/);
    if (fnMatch) functions.push(fnMatch[1]);
    if (/^(?:import|require|from|use)/.test(line.trim())) imports.push(line.trim());
  }

  return {
    summary: `A ${ext} file with ${totalLines} lines containing ${functions.length} defined symbols.`,
    purpose: `This file appears to ${functions.length > 5 ? 'be a module with multiple functions' : 'implement specific functionality'}.`,
    key_functions: functions.slice(0, 10),
    dependencies: imports.slice(0, 10),
    complexity: totalLines > 300 ? 'high' : totalLines > 100 ? 'medium' : 'low',
  };
}

// ── Real LLM Client ──

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`API error ${res.statusCode}: ${data}`));
        } else {
          resolve(JSON.parse(data));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function callOpenAI(config, messages) {
  const body = JSON.stringify({
    model: config.model,
    messages,
    max_tokens: config.max_tokens_per_request,
    temperature: 0.3,
  });

  const result = await httpRequest('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.api_key}`,
    },
  }, body);

  return {
    content: result.choices[0].message.content,
    inputTokens: result.usage?.prompt_tokens || 0,
    outputTokens: result.usage?.completion_tokens || 0,
  };
}

async function callAnthropic(config, messages) {
  // Convert from OpenAI format to Anthropic format
  const systemMsg = messages.find(m => m.role === 'system');
  const userMsgs = messages.filter(m => m.role !== 'system');

  const body = JSON.stringify({
    model: config.model,
    max_tokens: config.max_tokens_per_request,
    system: systemMsg?.content || '',
    messages: userMsgs,
    temperature: 0.3,
  });

  const result = await httpRequest('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.api_key,
      'anthropic-version': '2023-06-01',
    },
  }, body);

  return {
    content: result.content[0].text,
    inputTokens: result.usage?.input_tokens || 0,
    outputTokens: result.usage?.output_tokens || 0,
  };
}

// ── Public API ──

export async function generateCommitMessage(config, diff) {
  if (isDemoMode(config)) {
    const msg = mockCommitMessage(diff);
    const tokens = estimateTokens(diff);
    return { message: msg, inputTokens: tokens, outputTokens: 30, cost: 0, model: 'mock' };
  }

  const messages = [
    {
      role: 'system',
      content: `You are a git commit message generator. Analyze the diff and produce a single conventional commit message.
Format: type(scope): description
Types: feat, fix, refactor, docs, test, chore, perf, style, ci, build
Rules:
- One line, max 72 characters
- Lowercase, no period at end
- Imperative mood ("add" not "added")
- Be specific about what changed
Output ONLY the commit message, nothing else.`
    },
    { role: 'user', content: `Generate a commit message for this diff:\n\n${truncate(diff, 8000)}` }
  ];

  const result = await callLLM(config, messages);
  const { totalCost } = recordUsage(config.model, result.inputTokens, result.outputTokens, 'commit');

  return {
    message: result.content.trim().replace(/^["']|["']$/g, ''),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    cost: totalCost,
    model: config.model,
  };
}

export async function reviewCode(config, diff) {
  if (isDemoMode(config)) {
    const issues = mockReview(diff);
    return { issues, inputTokens: estimateTokens(diff), outputTokens: 200, cost: 0, model: 'mock' };
  }

  const messages = [
    {
      role: 'system',
      content: `You are a code reviewer. Analyze the diff and find issues.
For each issue output a JSON object on its own line (no markdown, no wrapping):
{"file":"path","line":123,"severity":"critical|warning|info","category":"bug|security|performance|style","message":"description","suggestion":"how to fix"}

Severity guide:
- critical: bugs, security vulnerabilities, data loss risks
- warning: performance issues, potential bugs, bad practices
- info: style improvements, suggestions

Be precise with file paths and line numbers from the diff.
If no issues found, output: {"no_issues": true}
Output ONLY the JSON lines, no other text.`
    },
    { role: 'user', content: `Review this diff:\n\n${truncate(diff, 12000)}` }
  ];

  const result = await callLLM(config, messages);
  const { totalCost } = recordUsage(config.model, result.inputTokens, result.outputTokens, 'review');

  const issues = parseReviewResponse(result.content);
  return {
    issues,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    cost: totalCost,
    model: config.model,
  };
}

export async function explainFile(config, content, filePath) {
  if (isDemoMode(config)) {
    const explanation = mockExplain(content, filePath);
    return { explanation, inputTokens: estimateTokens(content), outputTokens: 150, cost: 0, model: 'mock' };
  }

  const messages = [
    {
      role: 'system',
      content: `You are a code explainer. Given a source file, provide a concise explanation in this JSON format:
{
  "summary": "One sentence overview",
  "purpose": "What problem this file solves, in 1-2 sentences",
  "key_functions": ["functionName — what it does", ...],
  "dependencies": ["module — what it's used for", ...],
  "complexity": "low|medium|high"
}
Output ONLY the JSON, no markdown wrapping.`
    },
    { role: 'user', content: `Explain this file (${filePath}):\n\n${truncate(content, 10000)}` }
  ];

  const result = await callLLM(config, messages);
  const { totalCost } = recordUsage(config.model, result.inputTokens, result.outputTokens, 'explain');

  let explanation;
  try {
    const cleaned = result.content.replace(/```json\n?|\n?```/g, '').trim();
    explanation = JSON.parse(cleaned);
  } catch {
    explanation = { summary: result.content, purpose: '', key_functions: [], dependencies: [], complexity: 'unknown' };
  }

  return {
    explanation,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    cost: totalCost,
    model: config.model,
  };
}

// ── Helpers ──

async function callLLM(config, messages) {
  if (config.provider === 'anthropic') {
    return callAnthropic(config, messages);
  }
  return callOpenAI(config, messages);
}

function parseReviewResponse(content) {
  const issues = [];
  const lines = content.split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const cleaned = line.replace(/```json\n?|\n?```/g, '').trim();
      if (!cleaned.startsWith('{')) continue;
      const obj = JSON.parse(cleaned);
      if (obj.no_issues) continue;
      if (obj.file && obj.severity) {
        issues.push(obj);
      }
    } catch { /* skip unparseable lines */ }
  }
  return issues;
}

function truncate(text, maxChars) {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n\n... (truncated)';
}

function estimateTokens(text) {
  // Rough estimate: ~4 chars per token
  return Math.ceil(text.length / 4);
}

export { estimateTokens };
