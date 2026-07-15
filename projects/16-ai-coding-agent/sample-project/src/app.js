/**
 * Sample Express-like API — a minimal HTTP server with 3 endpoints.
 *
 * BUG: GET /users/:id does NOT check if the user exists before accessing
 * properties, causing a 500 crash when the user is not found.
 *
 * This is the target for the AI Coding Agent demo.
 */

import { createServer } from 'node:http';

// In-memory data store
const users = [
  { id: 1, name: 'Alice', email: 'alice@example.com', role: 'admin' },
  { id: 2, name: 'Bob', email: 'bob@example.com', role: 'user' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com', role: 'user' },
];

const todos = [
  { id: 1, userId: 1, title: 'Review PRs', done: false },
  { id: 2, userId: 2, title: 'Write tests', done: true },
  { id: 3, userId: 1, title: 'Deploy v2', done: false },
];

/**
 * Simple router — matches method + path pattern.
 */
function matchRoute(method, url, pattern) {
  if (method !== pattern.method) return null;
  const patternParts = pattern.path.split('/');
  const urlParts = url.split('?')[0].split('/');
  if (patternParts.length !== urlParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = urlParts[i];
    } else if (patternParts[i] !== urlParts[i]) {
      return null;
    }
  }
  return params;
}

/**
 * Request handler — routes to the appropriate endpoint.
 */
function handleRequest(req, res) {
  res.setHeader('Content-Type', 'application/json');
  let params;

  // GET /users — list all users
  if ((params = matchRoute(req.method, req.url, { method: 'GET', path: '/users' }))) {
    res.writeHead(200);
    res.end(JSON.stringify(users.map(u => ({ id: u.id, name: u.name }))));
    return;
  }

  // GET /users/:id — get a single user
  // BUG: No null check on the find result!
  if ((params = matchRoute(req.method, req.url, { method: 'GET', path: '/users/:id' }))) {
    const user = users.find(u => u.id === parseInt(params.id, 10));
    if (!user) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'User not found' }));
      return;
    }
    // BUG: This line crashes when user is undefined (user not found)
    res.writeHead(200);
    res.end(JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role }));
    return;
  }

  // GET /todos — list todos (optionally filtered by userId)
  if ((params = matchRoute(req.method, req.url, { method: 'GET', path: '/todos' }))) {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const userId = urlObj.searchParams.get('userId');
    let result = todos;
    if (userId) {
      result = todos.filter(t => t.userId === parseInt(userId, 10));
    }
    res.writeHead(200);
    res.end(JSON.stringify(result));
    return;
  }

  // 404 for unknown routes
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

/**
 * Create and return the HTTP server (for testing).
 */
export function createApp() {
  return createServer((req, res) => {
    try {
      handleRequest(req, res);
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal Server Error', message: err.message }));
    }
  });
}

// Start the server if run directly
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => {
    console.log(`Sample API running on http://localhost:${port}`);
  });
}
