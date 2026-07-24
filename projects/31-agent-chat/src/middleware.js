import config from './config.js';

const { security } = config;

// ── Security headers ─────────────────────────────────────────────────
// Dependency-free equivalent of helmet's core protections. CSP is tuned
// for this app: same-origin scripts, external stylesheet, inline style
// attributes (style="..."), and same-origin fetch/EventSource.

export function securityHeaders() {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');

  return (_req, res, next) => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  };
}

// ── Rate limiter ─────────────────────────────────────────────────────
// Fixed-window counter keyed by client IP. In-memory (single-process) —
// swap the store for Redis if you scale horizontally. Windows are evicted
// lazily plus on a periodic sweep so the map can't grow unbounded.

export class RateLimiter {
  constructor({ windowMs, max, now = Date.now } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this._now = now;
    this.hits = new Map(); // ip -> { count, resetAt }
    this._sweep = setInterval(() => this.evictExpired(), windowMs).unref?.();
  }

  check(ip) {
    const now = this._now();
    let entry = this.hits.get(ip);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(ip, entry);
    }
    entry.count += 1;
    const allowed = entry.count <= this.max;
    return {
      allowed,
      remaining: Math.max(0, this.max - entry.count),
      retryAfterMs: allowed ? 0 : entry.resetAt - now,
      limit: this.max,
    };
  }

  evictExpired() {
    const now = this._now();
    for (const [ip, entry] of this.hits) {
      if (now >= entry.resetAt) this.hits.delete(ip);
    }
  }

  stop() {
    clearInterval(this._sweep);
  }
}

// Express middleware wrapping a RateLimiter. Emits standard RateLimit
// headers and a 429 with Retry-After when the window is exhausted.
export function rateLimit(opts) {
  const limiter = new RateLimiter(opts);

  const mw = (req, res, next) => {
    const ip = clientIp(req);
    const result = limiter.check(ip);

    res.setHeader('RateLimit-Limit', result.limit);
    res.setHeader('RateLimit-Remaining', result.remaining);

    if (!result.allowed) {
      const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        error: 'Too many requests. Slow down.',
        retryAfter: retryAfterSec,
      });
    }
    next();
  };
  mw.limiter = limiter;
  return mw;
}

export function clientIp(req) {
  // Trust the left-most X-Forwarded-For hop only when explicitly enabled
  // (i.e. behind a known proxy); otherwise fall back to the socket address.
  if (security.trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length > 0) {
      return fwd.split(',')[0].trim();
    }
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
}
