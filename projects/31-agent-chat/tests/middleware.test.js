import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter, securityHeaders, clientIp } from '../src/middleware.js';

describe('RateLimiter', () => {
  it('allows requests up to the limit', () => {
    let t = 1000;
    const rl = new RateLimiter({ windowMs: 60_000, max: 3, now: () => t });
    assert.equal(rl.check('1.1.1.1').allowed, true);
    assert.equal(rl.check('1.1.1.1').allowed, true);
    assert.equal(rl.check('1.1.1.1').allowed, true);
    rl.stop();
  });

  it('blocks the request that exceeds the limit', () => {
    let t = 1000;
    const rl = new RateLimiter({ windowMs: 60_000, max: 2, now: () => t });
    rl.check('1.1.1.1');
    rl.check('1.1.1.1');
    const blocked = rl.check('1.1.1.1');
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterMs > 0);
    rl.stop();
  });

  it('tracks IPs independently', () => {
    let t = 1000;
    const rl = new RateLimiter({ windowMs: 60_000, max: 1, now: () => t });
    assert.equal(rl.check('1.1.1.1').allowed, true);
    assert.equal(rl.check('2.2.2.2').allowed, true); // different IP, own bucket
    assert.equal(rl.check('1.1.1.1').allowed, false);
    rl.stop();
  });

  it('resets after the window elapses', () => {
    let t = 1000;
    const rl = new RateLimiter({ windowMs: 60_000, max: 1, now: () => t });
    assert.equal(rl.check('1.1.1.1').allowed, true);
    assert.equal(rl.check('1.1.1.1').allowed, false);
    t += 60_001; // advance past the window
    assert.equal(rl.check('1.1.1.1').allowed, true);
    rl.stop();
  });

  it('evicts expired entries so the map cannot grow unbounded', () => {
    let t = 1000;
    const rl = new RateLimiter({ windowMs: 60_000, max: 5, now: () => t });
    rl.check('1.1.1.1');
    rl.check('2.2.2.2');
    assert.equal(rl.hits.size, 2);
    t += 60_001;
    rl.evictExpired();
    assert.equal(rl.hits.size, 0);
    rl.stop();
  });
});

describe('securityHeaders', () => {
  it('sets CSP and hardening headers', () => {
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; } };
    let nextCalled = false;
    securityHeaders()({}, res, () => { nextCalled = true; });

    assert.ok(headers['Content-Security-Policy'].includes("default-src 'self'"));
    assert.ok(headers['Content-Security-Policy'].includes("object-src 'none'"));
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.equal(headers['Referrer-Policy'], 'no-referrer');
    assert.ok(nextCalled);
  });
});

describe('clientIp', () => {
  it('falls back to socket address without trustProxy', () => {
    const req = { headers: { 'x-forwarded-for': '9.9.9.9' }, socket: { remoteAddress: '10.0.0.1' } };
    // trustProxy is off by default in config, so the forwarded header is ignored.
    assert.equal(clientIp(req), '10.0.0.1');
  });
});
