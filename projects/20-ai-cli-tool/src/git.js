import { execSync } from 'child_process';

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024, // 10MB for large diffs
      ...opts,
    }).trim();
  } catch (err) {
    if (opts.throwOnError) throw err;
    return '';
  }
}

export function isGitRepo() {
  return run('git rev-parse --is-inside-work-tree') === 'true';
}

export function getStagedDiff() {
  return run('git diff --staged');
}

export function getStagedDiffStat() {
  return run('git diff --staged --stat');
}

export function getUnstagedDiff() {
  return run('git diff');
}

export function getBranchDiff(base = 'main') {
  // Try the provided base, fall back to master, then to HEAD~5
  let diff = run(`git diff ${base}...HEAD`);
  if (!diff) {
    diff = run('git diff master...HEAD');
  }
  if (!diff) {
    diff = run('git diff HEAD~5..HEAD');
  }
  return diff;
}

export function getDiffForReview(target) {
  if (target) {
    return run(`git diff ${target}`);
  }
  // Default: unstaged changes, or staged if nothing unstaged
  let diff = getUnstagedDiff();
  if (!diff) diff = getStagedDiff();
  return diff;
}

export function getStatus() {
  return run('git status --short');
}

export function getRecentCommits(count = 5) {
  return run(`git log --oneline -${count}`);
}

export function getCurrentBranch() {
  return run('git branch --show-current');
}

export function commit(message) {
  return run(`git commit -m ${JSON.stringify(message)}`, { throwOnError: true });
}

export function readFileContent(filePath) {
  try {
    return execSync(`cat ${JSON.stringify(filePath)}`, { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
  } catch {
    return null;
  }
}

export function getStagedFiles() {
  const output = run('git diff --staged --name-only');
  return output ? output.split('\n').filter(Boolean) : [];
}

export function getDiffFiles(target) {
  let output;
  if (target) {
    output = run(`git diff --name-only ${target}`);
  } else {
    output = run('git diff --name-only');
    if (!output) output = run('git diff --staged --name-only');
  }
  return output ? output.split('\n').filter(Boolean) : [];
}
