// Demo mode — sample diffs and outputs for trying the tool without an API key

export const SAMPLE_DIFF = `diff --git a/src/auth.js b/src/auth.js
index 1234567..abcdefg 100644
--- a/src/auth.js
+++ b/src/auth.js
@@ -12,6 +12,15 @@ import { hash, verify } from './crypto.js';

 const TOKEN_EXPIRY = 3600;

+export async function validateToken(token) {
+  if (!token) return null;
+  try {
+    const payload = jwt.verify(token, process.env.JWT_SECRET);
+    return payload;
+  } catch {
+    return null;
+  }
+}
+
 export async function login(email, password) {
   const user = await db.users.findOne({ email });
   if (!user) throw new Error('Invalid credentials');
@@ -25,8 +34,10 @@ export async function login(email, password) {

 export async function register(email, password) {
   const existing = await db.users.findOne({ email });
-  if (existing) throw new Error('User exists');
+  if (existing) throw new Error('Email already registered');

+  // TODO: Add email validation
+  console.log('New registration:', email);
   const hashed = await hash(password);
   const user = await db.users.create({ email, password: hashed });
   return generateToken(user);
diff --git a/src/routes/api.js b/src/routes/api.js
index 2345678..bcdefgh 100644
--- a/src/routes/api.js
+++ b/src/routes/api.js
@@ -1,5 +1,6 @@
 import express from 'express';
 import { login, register } from '../auth.js';
+import { validateToken } from '../auth.js';

 const router = express.Router();

@@ -15,6 +16,14 @@ router.post('/register', async (req, res) => {
   }
 });

+router.get('/profile', async (req, res) => {
+  const token = req.headers.authorization?.split(' ')[1];
+  const user = await validateToken(token);
+  if (!user) return res.status(401).json({ error: 'Unauthorized' });
+  const apiKey = "sk-demo-12345-not-real";
+  res.json({ user, settings: { theme: 'dark' } });
+});
+
 export default router;`;

export const SAMPLE_FILE = `import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

/**
 * FileWatcher - Watches directories for file changes and emits events.
 * Used by the hot-reload system to trigger rebuilds.
 */
export class FileWatcher extends EventEmitter {
  constructor(rootDir, options = {}) {
    super();
    this.rootDir = path.resolve(rootDir);
    this.extensions = options.extensions || ['.js', '.ts', '.json'];
    this.ignore = options.ignore || ['node_modules', '.git', 'dist'];
    this.debounceMs = options.debounce || 100;
    this.watchers = new Map();
    this._pending = null;
  }

  /** Start watching the root directory recursively */
  start() {
    this._walkAndWatch(this.rootDir);
    this.emit('ready', { dir: this.rootDir, files: this.watchers.size });
    return this;
  }

  /** Stop all watchers and clean up */
  stop() {
    for (const [, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
    this.emit('stopped');
  }

  /** Get count of watched files */
  get fileCount() {
    return this.watchers.size;
  }

  _walkAndWatch(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (this.ignore.includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this._walkAndWatch(fullPath);
      } else if (this.extensions.some(ext => entry.name.endsWith(ext))) {
        this._addWatcher(fullPath);
      }
    }
  }

  _addWatcher(filePath) {
    const watcher = fs.watch(filePath, () => {
      // Debounce rapid changes
      clearTimeout(this._pending);
      this._pending = setTimeout(() => {
        this.emit('change', { file: filePath, timestamp: Date.now() });
      }, this.debounceMs);
    });
    this.watchers.set(filePath, watcher);
  }
}

export function createWatcher(dir, opts) {
  return new FileWatcher(dir, opts).start();
}`;

export function runDemo() {
  console.log(`
┌─────────────────────────────────────────────────────┐
│                                                     │
│   aidev - AI-Powered Developer CLI                  │
│   Demo Mode (no API key required)                   │
│                                                     │
│   Try these commands:                               │
│                                                     │
│   aidev commit    Generate commit messages           │
│   aidev review    Review code for issues             │
│   aidev explain <file>  Explain any source file      │
│                                                     │
│   All commands work in demo mode with heuristic      │
│   analysis. Set an API key for LLM-powered results: │
│                                                     │
│   aidev config --set api_key=sk-...                  │
│   aidev config --set provider=openai                 │
│                                                     │
└─────────────────────────────────────────────────────┘
`);
}
