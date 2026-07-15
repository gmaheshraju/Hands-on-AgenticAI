// ─── Mock PR Data ────────────────────────────────────────────────────────────
// Realistic sample PR data for demo mode. Simulates a PR that adds a user
// authentication endpoint with several intentional issues for the agent to find.

export const MOCK_PR_DATA = {
  pr: {
    title: 'feat: add user authentication endpoint',
    body: `## Summary
Adds a new /api/auth/login endpoint that authenticates users with email/password
and returns a JWT token.

## Changes
- New auth controller with login/register handlers
- JWT token generation and validation middleware
- User model with password hashing
- Rate limiting on auth endpoints

## Testing
- Manual testing with curl
- Unit tests for token generation`,
    author: 'junior-dev',
    labels: ['feature', 'needs-review'],
    changedFiles: 5,
    additions: 187,
    deletions: 12,
    base: 'main',
    head: 'feat/auth-endpoint',
  },

  diff: `diff --git a/src/controllers/auth.js b/src/controllers/auth.js
new file mode 100644
index 0000000..a1b2c3d
--- /dev/null
+++ b/src/controllers/auth.js
@@ -0,0 +1,68 @@
+import jwt from 'jsonwebtoken';
+import { User } from '../models/user.js';
+
+const JWT_SECRET = 'super-secret-key-12345';
+const TOKEN_EXPIRY = '7d';
+
+export async function login(req, res) {
+  const { email, password } = req.body;
+
+  const user = await User.findOne({ email });
+  if (!user) {
+    return res.status(401).json({ error: 'Invalid credentials' });
+  }
+
+  if (password === user.password) {
+    const token = jwt.sign(
+      { userId: user._id, email: user.email, role: user.role },
+      JWT_SECRET,
+      { expiresIn: TOKEN_EXPIRY }
+    );
+
+    res.json({ token, user: { id: user._id, email: user.email } });
+  } else {
+    res.status(401).json({ error: 'Invalid credentials' });
+  }
+}
+
+export async function register(req, res) {
+  const { email, password, name } = req.body;
+
+  const existing = await User.findOne({ email });
+  if (existing) {
+    return res.status(400).json({ error: 'Email already registered' });
+  }
+
+  const user = new User({ email, password, name });
+  await user.save();
+
+  const token = jwt.sign(
+    { userId: user._id, email: user.email },
+    JWT_SECRET,
+    { expiresIn: TOKEN_EXPIRY }
+  );
+
+  res.json({ token, user: { id: user._id, email: user.email, name } });
+}
+
+export async function getProfile(req, res) {
+  const user = await User.findById(req.userId);
+  res.json({ user });
+}
+
+export function validateToken(req, res, next) {
+  const header = req.headers.authorization;
+  const token = header.split(' ')[1];
+
+  try {
+    const decoded = jwt.verify(token, JWT_SECRET);
+    req.userId = decoded.userId;
+    next();
+  } catch (err) {
+    res.status(401).json({ error: 'Invalid token' });
+  }
+}

diff --git a/src/models/user.js b/src/models/user.js
new file mode 100644
index 0000000..d4e5f6a
--- /dev/null
+++ b/src/models/user.js
@@ -0,0 +1,22 @@
+import mongoose from 'mongoose';
+
+const userSchema = new mongoose.Schema({
+  email: {
+    type: String,
+    required: true,
+    unique: true,
+  },
+  password: {
+    type: String,
+    required: true,
+  },
+  name: {
+    type: String,
+    required: true,
+  },
+  role: {
+    type: String,
+    default: 'user',
+  },
+});
+
+export const User = mongoose.model('User', userSchema);

diff --git a/src/routes/auth.js b/src/routes/auth.js
new file mode 100644
index 0000000..b7c8d9e
--- /dev/null
+++ b/src/routes/auth.js
@@ -0,0 +1,14 @@
+import { Router } from 'express';
+import { login, register, getProfile, validateToken } from '../controllers/auth.js';
+
+const router = Router();
+
+router.post('/login', login);
+router.post('/register', register);
+router.get('/profile', validateToken, getProfile);
+
+export default router;

diff --git a/src/app.js b/src/app.js
index 1234567..abcdef0 100644
--- a/src/app.js
+++ b/src/app.js
@@ -1,5 +1,7 @@
 import express from 'express';
+import authRoutes from './routes/auth.js';

 const app = express();
 app.use(express.json());
+app.use('/api/auth', authRoutes);

diff --git a/tests/auth.test.js b/tests/auth.test.js
new file mode 100644
index 0000000..e1f2a3b
--- /dev/null
+++ b/tests/auth.test.js
@@ -0,0 +1,25 @@
+import jwt from 'jsonwebtoken';
+
+const SECRET = 'super-secret-key-12345';
+
+describe('Auth', () => {
+  test('generates valid JWT', () => {
+    const token = jwt.sign({ userId: '123' }, SECRET, { expiresIn: '7d' });
+    const decoded = jwt.verify(token, SECRET);
+    expect(decoded.userId).toBe('123');
+  });
+
+  test('rejects expired token', () => {
+    const token = jwt.sign({ userId: '123' }, SECRET, { expiresIn: '0s' });
+    expect(() => jwt.verify(token, SECRET)).toThrow();
+  });
+});
`,

  files: {
    'src/controllers/auth.js': `import jwt from 'jsonwebtoken';
import { User } from '../models/user.js';

const JWT_SECRET = 'super-secret-key-12345';
const TOKEN_EXPIRY = '7d';

export async function login(req, res) {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (password === user.password) {
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.json({ token, user: { id: user._id, email: user.email } });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
}

export async function register(req, res) {
  const { email, password, name } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  const user = new User({ email, password, name });
  await user.save();

  const token = jwt.sign(
    { userId: user._id, email: user.email },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  res.json({ token, user: { id: user._id, email: user.email, name } });
}

export async function getProfile(req, res) {
  const user = await User.findById(req.userId);
  res.json({ user });
}

export function validateToken(req, res, next) {
  const header = req.headers.authorization;
  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}`,

    'src/models/user.js': `import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    default: 'user',
  },
});

export const User = mongoose.model('User', userSchema);`,

    'src/routes/auth.js': `import { Router } from 'express';
import { login, register, getProfile, validateToken } from '../controllers/auth.js';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.get('/profile', validateToken, getProfile);

export default router;`,

    'src/app.js': `import express from 'express';
import authRoutes from './routes/auth.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);`,

    'tests/auth.test.js': `import jwt from 'jsonwebtoken';

const SECRET = 'super-secret-key-12345';

describe('Auth', () => {
  test('generates valid JWT', () => {
    const token = jwt.sign({ userId: '123' }, SECRET, { expiresIn: '7d' });
    const decoded = jwt.verify(token, SECRET);
    expect(decoded.userId).toBe('123');
  });

  test('rejects expired token', () => {
    const token = jwt.sign({ userId: '123' }, SECRET, { expiresIn: '0s' });
    expect(() => jwt.verify(token, SECRET)).toThrow();
  });
});`,
  },

  search: {
    'JWT_SECRET': [
      { file: 'src/controllers/auth.js', snippet: "const JWT_SECRET = 'super-secret-key-12345';" },
      { file: 'tests/auth.test.js', snippet: "const SECRET = 'super-secret-key-12345';" },
    ],
    'User.findOne': [
      { file: 'src/controllers/auth.js', snippet: 'const user = await User.findOne({ email });' },
    ],
    'validateToken': [
      { file: 'src/controllers/auth.js', snippet: 'export function validateToken(req, res, next) {' },
      { file: 'src/routes/auth.js', snippet: "import { login, register, getProfile, validateToken } from '../controllers/auth.js';" },
    ],
    'password': [
      { file: 'src/controllers/auth.js', snippet: 'if (password === user.password) {' },
      { file: 'src/models/user.js', snippet: 'password: { type: String, required: true }' },
    ],
    'bcrypt': [],
    'hash': [],
    'rate': [],
    'rateLimit': [],
  },
};
