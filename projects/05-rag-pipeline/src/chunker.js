/**
 * Code-Aware Chunker
 *
 * Unlike naive character-count splitting, this chunker understands code
 * structure. It splits on function/class boundaries so each chunk is a
 * semantically meaningful unit — a whole function, a class, or a documentation
 * section. Each chunk carries metadata: file path, line numbers, language,
 * and the name of the function/class it belongs to.
 *
 * For Markdown files it splits on heading boundaries instead.
 */

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

const EXT_TO_LANG = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.txt': 'text',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

export function detectLanguage(filePath) {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return EXT_TO_LANG[ext] || 'text';
}

// ---------------------------------------------------------------------------
// Boundary patterns — regex-based, no AST dependency
// ---------------------------------------------------------------------------

/**
 * Each pattern matches the START of a new logical block. When we see one of
 * these, we end the previous chunk and begin a new one.
 *
 * Why regex instead of tree-sitter?
 * - Zero native dependencies (easy to deploy anywhere)
 * - Covers the 90% case: top-level functions, classes, exported consts
 * - For production you would swap in tree-sitter for precise AST boundaries
 */
const JS_BOUNDARY = /^(?:export\s+)?(?:async\s+)?(?:function\s+\w+|class\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?(?:\(|function))/;
const PY_BOUNDARY = /^(?:def\s+\w+|class\s+\w+|async\s+def\s+\w+)/;
const MD_BOUNDARY = /^#{1,4}\s+/;

function getBoundaryPattern(lang) {
  switch (lang) {
    case 'javascript':
    case 'typescript':
      return JS_BOUNDARY;
    case 'python':
      return PY_BOUNDARY;
    case 'markdown':
      return MD_BOUNDARY;
    default:
      return null; // fall back to fixed-size chunking
  }
}

// ---------------------------------------------------------------------------
// Name extraction — pull the function/class name from the boundary line
// ---------------------------------------------------------------------------

function extractName(line, lang) {
  if (lang === 'markdown') {
    return line.replace(/^#+\s*/, '').trim();
  }

  // Try to find: function NAME, class NAME, const NAME
  const match = line.match(/(?:function|class|const|def|async\s+def)\s+(\w+)/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Core chunking logic
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Chunk
 * @property {string} id          - Unique chunk identifier
 * @property {string} content     - The chunk text
 * @property {string} filePath    - Source file path
 * @property {string} language    - Detected language
 * @property {number} startLine   - 1-based start line
 * @property {number} endLine     - 1-based end line
 * @property {string|null} name   - Function/class/section name
 */

/**
 * Split a source file into semantically meaningful chunks.
 *
 * @param {string} content    - File content
 * @param {string} filePath   - Path to the file (used for metadata + language detection)
 * @param {Object} [options]
 * @param {number} [options.maxChunkLines=80]  - Max lines per chunk (splits large functions)
 * @param {number} [options.minChunkLines=3]   - Skip tiny chunks (import lines, blank blocks)
 * @returns {Chunk[]}
 */
export function chunkFile(content, filePath, options = {}) {
  const { maxChunkLines = 80, minChunkLines = 3 } = options;
  const lang = detectLanguage(filePath);
  const boundary = getBoundaryPattern(lang);
  const lines = content.split('\n');

  // If no boundary pattern, fall back to fixed-size line chunks
  if (!boundary) {
    return fixedSizeChunk(lines, filePath, lang, maxChunkLines, minChunkLines);
  }

  const chunks = [];
  let currentLines = [];
  let currentStart = 1;
  let currentName = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1; // 1-based

    // Check if this line starts a new boundary
    if (boundary.test(line.trim()) && currentLines.length >= minChunkLines) {
      // Flush the previous chunk
      pushChunk(chunks, currentLines, filePath, lang, currentStart, currentName);
      currentLines = [];
      currentStart = lineNum;
      currentName = extractName(line.trim(), lang);
    }

    // Set the name on the first boundary we encounter
    if (currentLines.length === 0 && !currentName) {
      currentName = extractName(line.trim(), lang);
    }

    currentLines.push(line);

    // Split overly long chunks at the max boundary
    if (currentLines.length >= maxChunkLines) {
      pushChunk(chunks, currentLines, filePath, lang, currentStart, currentName);
      currentLines = [];
      currentStart = lineNum + 1;
      currentName = null;
    }
  }

  // Don't forget the last chunk
  if (currentLines.length >= minChunkLines) {
    pushChunk(chunks, currentLines, filePath, lang, currentStart, currentName);
  }

  return chunks;
}

function pushChunk(chunks, lines, filePath, lang, startLine, name) {
  const content = lines.join('\n').trim();
  if (!content) return;

  chunks.push({
    id: `${filePath}:${startLine}-${startLine + lines.length - 1}`,
    content,
    filePath,
    language: lang,
    startLine,
    endLine: startLine + lines.length - 1,
    name: name || null,
  });
}

function fixedSizeChunk(lines, filePath, lang, maxChunkLines, minChunkLines) {
  const chunks = [];
  for (let i = 0; i < lines.length; i += maxChunkLines) {
    const slice = lines.slice(i, i + maxChunkLines);
    if (slice.length >= minChunkLines) {
      pushChunk(chunks, slice, filePath, lang, i + 1, null);
    }
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// File filtering — skip binaries, node_modules, etc.
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.venv', 'venv', 'vendor', 'coverage', '.cache',
]);

const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2',
  '.ttf', '.eot', '.mp3', '.mp4', '.zip', '.tar', '.gz', '.lock',
  '.min.js', '.min.css', '.map',
]);

/**
 * Should this file be indexed?
 */
export function shouldIndex(filePath) {
  // Skip hidden directories and known non-source dirs
  const parts = filePath.split('/');
  for (const part of parts) {
    if (SKIP_DIRS.has(part)) return false;
    if (part.startsWith('.') && part !== '.') return false;
  }

  // Skip binary / non-text extensions
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (SKIP_EXTENSIONS.has(ext)) return false;

  // Skip very long extensions (likely not source)
  if (ext.length > 6) return false;

  return true;
}
