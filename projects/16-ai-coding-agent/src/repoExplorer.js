/**
 * Repo Explorer — Tools for navigating and understanding a codebase.
 *
 * Provides: listFiles, readFile, searchCode, readGitLog
 * All paths are resolved relative to a configurable project root.
 */

import { readdir, readFile as fsReadFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { execSync } from 'node:child_process';

// Directories to skip during exploration
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage',
  '.next', '.cache', '__pycache__', '.venv',
]);

/**
 * Create a repo explorer bound to a specific project root.
 *
 * @param {string} projectRoot — absolute path to the project directory
 * @returns {object} Explorer tools: { listFiles, readFile, searchCode, readGitLog, getStructure }
 */
export function createExplorer(projectRoot) {
  const root = resolve(projectRoot);

  /**
   * List files in a directory (non-recursive by default).
   * @param {string} dir — relative path from project root (default: '.')
   * @param {object} opts — { recursive: boolean, maxDepth: number }
   */
  async function listFiles(dir = '.', opts = {}) {
    const { recursive = false, maxDepth = 3 } = opts;
    const absDir = resolve(root, dir);
    const results = [];

    async function walk(currentDir, depth) {
      if (depth > maxDepth) return;
      let entries;
      try {
        entries = await readdir(currentDir, { withFileTypes: true });
      } catch (err) {
        return; // Skip unreadable directories
      }

      for (const entry of entries) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        const rel = relative(root, join(currentDir, entry.name));
        if (entry.isDirectory()) {
          results.push({ name: rel + '/', type: 'directory' });
          if (recursive) await walk(join(currentDir, entry.name), depth + 1);
        } else {
          results.push({ name: rel, type: 'file' });
        }
      }
    }

    await walk(absDir, 0);
    return results;
  }

  /**
   * Read a file's contents.
   * @param {string} filePath — relative path from project root
   * @returns {object} { path, content, lines }
   */
  async function readFile(filePath) {
    const absPath = resolve(root, filePath);
    // Security: prevent path traversal outside project root
    if (!absPath.startsWith(root)) {
      throw new Error(`Path traversal blocked: ${filePath}`);
    }
    const content = await fsReadFile(absPath, 'utf-8');
    return {
      path: filePath,
      content,
      lines: content.split('\n').length,
    };
  }

  /**
   * Search for a pattern across all files in the project (grep-like).
   * @param {string} query — string or regex pattern to search for
   * @param {object} opts — { extensions: string[], maxResults: number }
   * @returns {Array<{ file, line, lineNumber, content }>}
   */
  async function searchCode(query, opts = {}) {
    const { extensions = ['.js', '.ts', '.jsx', '.tsx', '.json', '.mjs'], maxResults = 50 } = opts;
    const results = [];
    const regex = new RegExp(query, 'gi');

    async function searchDir(dir) {
      if (results.length >= maxResults) return;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (results.length >= maxResults) break;
        if (IGNORE_DIRS.has(entry.name)) continue;
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          await searchDir(fullPath);
        } else {
          const ext = '.' + entry.name.split('.').pop();
          if (!extensions.includes(ext)) continue;

          try {
            const content = await fsReadFile(fullPath, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                results.push({
                  file: relative(root, fullPath),
                  lineNumber: i + 1,
                  content: lines[i].trim(),
                });
                regex.lastIndex = 0; // Reset regex state
              }
              if (results.length >= maxResults) break;
            }
          } catch {
            // Skip binary or unreadable files
          }
        }
      }
    }

    await searchDir(root);
    return results;
  }

  /**
   * Get recent git log for a file (or entire repo if no file specified).
   * @param {string} [filePath] — relative path from project root
   * @param {number} [count=10] — number of commits to return
   */
  function readGitLog(filePath, count = 10) {
    try {
      const fileArg = filePath ? ` -- ${filePath}` : '';
      const cmd = `git log --oneline -${count}${fileArg}`;
      const output = execSync(cmd, { cwd: root, encoding: 'utf-8', timeout: 5000 });
      return output.trim().split('\n').filter(Boolean).map(line => {
        const [hash, ...msgParts] = line.split(' ');
        return { hash, message: msgParts.join(' ') };
      });
    } catch {
      return []; // Not a git repo or file has no history
    }
  }

  /**
   * Get a tree view of the project structure.
   * Returns a formatted string showing the directory tree.
   */
  async function getStructure(maxDepth = 3) {
    const lines = [];

    async function buildTree(dir, prefix, depth) {
      if (depth > maxDepth) return;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      // Sort: directories first, then files
      entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      const filtered = entries.filter(e => !IGNORE_DIRS.has(e.name));
      for (let i = 0; i < filtered.length; i++) {
        const entry = filtered[i];
        const isLast = i === filtered.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';

        lines.push(prefix + connector + entry.name + (entry.isDirectory() ? '/' : ''));

        if (entry.isDirectory()) {
          await buildTree(join(dir, entry.name), prefix + childPrefix, depth + 1);
        }
      }
    }

    lines.push(root.split('/').pop() + '/');
    await buildTree(root, '', 0);
    return lines.join('\n');
  }

  return { listFiles, readFile, searchCode, readGitLog, getStructure };
}
