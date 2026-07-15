/**
 * Tests for the Sample API.
 *
 * Note: This test file intentionally ONLY tests the happy path.
 * The missing 404 test is what the AI agent should add.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.js';

describe('Sample API', () => {
  let server;
  let baseUrl;

  it('should start the server', (_, done) => {
    server = createApp();
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      done();
    });
  });

  it('GET /users should return all users', async () => {
    const res = await fetch(`${baseUrl}/users`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(body));
    assert.strictEqual(body.length, 3);
    assert.ok(body[0].name);
  });

  it('GET /users/1 should return Alice', async () => {
    const res = await fetch(`${baseUrl}/users/1`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.name, 'Alice');
    assert.strictEqual(body.email, 'alice@example.com');
  });

  it('GET /todos should return all todos', async () => {
    const res = await fetch(`${baseUrl}/todos`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(body));
    assert.strictEqual(body.length, 3);
  });

  it('GET /unknown should return 404', async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    assert.strictEqual(res.status, 404);
  });

  after(() => {
    if (server) server.close();
  });
});
