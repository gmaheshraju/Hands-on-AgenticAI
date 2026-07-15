/**
 * Demo — Codebase Q&A with Hybrid RAG
 *
 * This demo indexes a sample codebase (defined below) and answers
 * questions about it, showing each pipeline step along the way.
 *
 * Run: node src/demo.js
 */

import { RAGPipeline } from './pipeline.js';

// ---------------------------------------------------------------------------
// Sample codebase — a miniature Express API with auth, rate limiting, etc.
// ---------------------------------------------------------------------------

const SAMPLE_CODEBASE = [
  {
    path: 'src/middleware/rateLimiter.js',
    content: `/**
 * Rate Limiter Middleware
 *
 * Uses a sliding window algorithm to limit requests per IP.
 * Backed by an in-memory store (swap to Redis for production).
 */

const store = new Map();

const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_REQUESTS = 100;

/**
 * Create a rate limiter middleware.
 * @param {Object} options
 * @param {number} options.windowMs - Window size in milliseconds
 * @param {number} options.maxRequests - Maximum requests per window
 */
export function createRateLimiter({ windowMs = DEFAULT_WINDOW_MS, maxRequests = DEFAULT_MAX_REQUESTS } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or create the request log for this IP
    if (!store.has(ip)) {
      store.set(ip, []);
    }

    const requests = store.get(ip);

    // Remove expired entries (sliding window)
    while (requests.length > 0 && requests[0] < windowStart) {
      requests.shift();
    }

    if (requests.length >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((requests[0] + windowMs - now) / 1000),
      });
      return;
    }

    requests.push(now);
    next();
  };
}

/**
 * Reset rate limit for a specific IP (admin use).
 */
export function resetRateLimit(ip) {
  store.delete(ip);
}

/**
 * Get current request count for an IP (monitoring).
 */
export function getRateLimitStatus(ip) {
  const requests = store.get(ip) || [];
  return {
    currentRequests: requests.length,
    maxRequests: DEFAULT_MAX_REQUESTS,
    windowMs: DEFAULT_WINDOW_MS,
  };
}`,
  },
  {
    path: 'src/auth/jwt.js',
    content: `/**
 * JWT Authentication Module
 *
 * Handles token creation, verification, and refresh.
 * Uses HS256 algorithm with a shared secret.
 */

import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const TOKEN_EXPIRY = 3600; // 1 hour in seconds
const REFRESH_EXPIRY = 7 * 24 * 3600; // 7 days

/**
 * Create a JWT token.
 * Header: { alg: "HS256", typ: "JWT" }
 * Payload: { sub, email, iat, exp }
 */
export function createToken(userId, email) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: userId,
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY,
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signature = sign(headerB64 + '.' + payloadB64);

  return headerB64 + '.' + payloadB64 + '.' + signature;
}

/**
 * Verify a JWT token. Returns the decoded payload or throws.
 */
export function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');

  const [headerB64, payloadB64, signature] = parts;

  // Verify signature
  const expected = sign(headerB64 + '.' + payloadB64);
  if (signature !== expected) throw new Error('Invalid signature');

  // Decode and check expiry
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return payload;
}

/**
 * Create a refresh token (longer-lived, stored in httpOnly cookie).
 */
export function createRefreshToken(userId) {
  return createToken(userId, null); // simplified; production uses separate signing
}

/**
 * Auth middleware — extracts and verifies JWT from Authorization header.
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authentication token' });
  }

  try {
    const token = authHeader.slice(7);
    req.user = verifyToken(token);
    next();
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
}

function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

function sign(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}`,
  },
  {
    path: 'src/routes/users.js',
    content: `/**
 * User Routes
 *
 * CRUD operations for user management.
 * All routes require authentication except registration and login.
 */

import { Router } from 'express';
import { createToken, authMiddleware } from '../auth/jwt.js';

const router = Router();

// In-memory store (swap to database in production)
const users = new Map();
let nextId = 1;

/**
 * POST /users/register
 * Create a new user account.
 */
router.post('/register', (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  // Check for existing user
  for (const user of users.values()) {
    if (user.email === email) {
      return res.status(409).json({ error: 'Email already registered' });
    }
  }

  const user = {
    id: nextId++,
    email,
    password, // In production: hash with bcrypt
    name: name || email.split('@')[0],
    createdAt: new Date().toISOString(),
  };

  users.set(user.id, user);
  const token = createToken(user.id, user.email);

  res.status(201).json({ user: { id: user.id, email, name: user.name }, token });
});

/**
 * POST /users/login
 * Authenticate and receive a JWT token.
 */
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  let found = null;
  for (const user of users.values()) {
    if (user.email === email && user.password === password) {
      found = user;
      break;
    }
  }

  if (!found) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = createToken(found.id, found.email);
  res.json({ user: { id: found.id, email: found.email, name: found.name }, token });
});

/**
 * GET /users/me
 * Get the authenticated user's profile.
 */
router.get('/me', authMiddleware, (req, res) => {
  const user = users.get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, email: user.email, name: user.name });
});

/**
 * PUT /users/me
 * Update the authenticated user's profile.
 */
router.put('/me', authMiddleware, (req, res) => {
  const user = users.get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { name, email } = req.body;
  if (name) user.name = name;
  if (email) user.email = email;

  res.json({ id: user.id, email: user.email, name: user.name });
});

export default router;`,
  },
  {
    path: 'src/services/webhookDelivery.js',
    content: `/**
 * Webhook Delivery Service
 *
 * Delivers webhook events to registered endpoints with retry logic.
 * Implements exponential backoff with jitter.
 */

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60000;

/**
 * Deliver a webhook event to a URL with retry logic.
 *
 * Retry strategy: exponential backoff with full jitter
 *   delay = random(0, min(MAX_DELAY, BASE_DELAY * 2^attempt))
 *
 * Why jitter? Without it, all failed webhooks retry at the exact same time,
 * creating a thundering herd that amplifies the original failure.
 *
 * @param {string} url - Endpoint to deliver to
 * @param {Object} payload - Event payload
 * @param {Object} options
 * @param {number} options.maxRetries - Maximum retry attempts
 * @param {string} options.secret - HMAC signing secret for the payload
 * @returns {Promise<{success: boolean, attempts: number, lastError?: string}>}
 */
export async function deliverWebhook(url, payload, { maxRetries = MAX_RETRIES, secret = '' } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // In production: actual HTTP POST with HMAC signature
      const result = await sendWebhookRequest(url, payload, secret);

      if (result.status >= 200 && result.status < 300) {
        return { success: true, attempts: attempt + 1 };
      }

      // 4xx errors (except 429) are permanent failures — don't retry
      if (result.status >= 400 && result.status < 500 && result.status !== 429) {
        return {
          success: false,
          attempts: attempt + 1,
          lastError: \`HTTP \${result.status}: permanent failure\`,
        };
      }

      lastError = \`HTTP \${result.status}\`;
    } catch (err) {
      lastError = err.message;
    }

    // Wait before retrying (except on last attempt)
    if (attempt < maxRetries) {
      const delay = calculateBackoff(attempt);
      await sleep(delay);
    }
  }

  return { success: false, attempts: maxRetries + 1, lastError };
}

/**
 * Exponential backoff with full jitter.
 * @param {number} attempt - Zero-based attempt number
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoff(attempt) {
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, MAX_DELAY_MS);
  // Full jitter: random value between 0 and the capped delay
  return Math.floor(Math.random() * cappedDelay);
}

/**
 * Sign a webhook payload with HMAC-SHA256.
 */
export function signPayload(payload, secret) {
  const crypto = await import('crypto');
  const body = JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function sendWebhookRequest(url, payload, secret) {
  // Mock implementation for demo
  return { status: 200 };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}`,
  },
  {
    path: 'src/config/limits.js',
    content: `/**
 * System Configuration — Rate Limits and Quotas
 *
 * Centralized configuration for all rate limits, quotas, and timeouts.
 * Values can be overridden via environment variables.
 */

export const RATE_LIMITS = {
  // API rate limits (per IP)
  api: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },

  // Authentication attempts
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,            // 5 login attempts per window
  },

  // Webhook delivery
  webhook: {
    maxRetries: 5,
    timeoutMs: 30000,          // 30 second timeout per attempt
    maxPayloadBytes: 256 * 1024, // 256 KB max payload
  },
};

export const QUOTAS = {
  // Per-user quotas
  user: {
    maxWebhooks: 10,           // Max webhook endpoints per user
    maxApiKeys: 5,             // Max API keys per user
  },
};

export const TIMEOUTS = {
  requestMs: 30000,            // 30 second request timeout
  dbQueryMs: 5000,             // 5 second database query timeout
  cacheMs: 300000,             // 5 minute cache TTL
};`,
  },
  {
    path: 'docs/api-rate-limits.md',
    content: `# API Rate Limits

## Overview

All API endpoints are rate-limited to prevent abuse. The default limit is
100 requests per minute per IP address.

## Configuration

Rate limits can be configured via environment variables:

- \\\`RATE_LIMIT_WINDOW\\\` — Window size in milliseconds (default: 60000)
- \\\`RATE_LIMIT_MAX\\\` — Maximum requests per window (default: 100)

## Authentication Endpoints

Login and registration endpoints have stricter limits:
- 5 attempts per 15-minute window
- After exceeding, returns HTTP 429 with \\\`retryAfter\\\` header

## Webhook Delivery

Webhook delivery retries use exponential backoff:
- Max 5 retries
- Base delay: 1 second, max delay: 60 seconds
- Full jitter to prevent thundering herd

## Headers

Rate limit status is returned in response headers:
- \\\`X-RateLimit-Limit\\\` — Maximum requests per window
- \\\`X-RateLimit-Remaining\\\` — Remaining requests in current window
- \\\`X-RateLimit-Reset\\\` — UTC epoch when the window resets`,
  },
];

// ---------------------------------------------------------------------------
// Demo runner
// ---------------------------------------------------------------------------

async function runDemo() {
  console.log('='.repeat(70));
  console.log('  Codebase Q&A with Hybrid RAG — Demo');
  console.log('='.repeat(70));
  console.log();

  // 1. Initialize pipeline
  const pipeline = new RAGPipeline({ verbose: true });

  // 2. Index the sample codebase
  console.log('--- Step 1: Indexing codebase ---\n');
  const stats = await pipeline.indexFiles(SAMPLE_CODEBASE);
  console.log(`Stats: ${JSON.stringify(stats)}\n`);

  // 3. Run a series of questions
  const questions = [
    'How does the rate limiter work?',
    'Where is authentication handled?',
    'What is the retry logic for webhook delivery?',
    'How are user profiles updated?',
    'What are the default rate limit values?',
  ];

  for (const question of questions) {
    console.log('\n' + '='.repeat(70));
    console.log(`Q: ${question}`);
    console.log('='.repeat(70));

    const { answer, sources, debug } = await pipeline.ask(question);

    console.log(`\nAnswer:\n${answer}`);
    console.log(`\nTimings: BM25=${debug.timings.bm25}ms, Vector=${debug.timings.vector}ms, ` +
      `Fusion=${debug.timings.fusion}ms, Rerank=${debug.timings.rerank}ms, ` +
      `Generate=${debug.timings.generate}ms`);
  }

  // 4. Show BM25 internals for educational purposes
  console.log('\n' + '='.repeat(70));
  console.log('  BM25 Internals — Educational Deep Dive');
  console.log('='.repeat(70));

  const bm25Explain = pipeline.explainBM25('rate limiter sliding window');
  console.log('\nBM25 token analysis for "rate limiter sliding window":');
  for (const entry of bm25Explain) {
    console.log(`  "${entry.token}": IDF=${entry.idf}, appears in ${entry.docFrequency}/${entry.totalDocs} docs`);
  }

  // 5. Show RRF fusion details
  console.log('\n--- RRF Fusion Details for "webhook retry" ---\n');
  const { results, debug } = await pipeline.search('webhook retry');
  console.log(debug.fusionExplanation);

  // 6. Show pipeline stats
  console.log('\n--- Pipeline Stats ---');
  console.log(JSON.stringify(pipeline.getStats(), null, 2));
}

runDemo().catch(console.error);
