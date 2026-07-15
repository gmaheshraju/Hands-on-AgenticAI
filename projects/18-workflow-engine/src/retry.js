/**
 * Retry with exponential backoff.
 *
 * @param {Function} fn        — async function to retry
 * @param {object}   opts
 * @param {number}   opts.maxRetries   — max attempts (default 3)
 * @param {number}   opts.baseDelayMs  — initial delay in ms (default 500)
 * @param {number}   opts.maxDelayMs   — cap on delay (default 10000)
 * @param {number}   opts.timeoutMs    — per-attempt timeout (default 30000)
 * @returns {Promise<any>}
 */
export async function retryWithBackoff(fn, opts = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 500,
    maxDelayMs = 10_000,
    timeoutMs = 30_000,
  } = opts;

  const attempts = [];
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    try {
      const result = await Promise.race([
        fn(attempt),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
      attempts.push({ attempt, durationMs: Date.now() - start, status: 'success' });
      return { result, attempts };
    } catch (err) {
      lastError = err;
      attempts.push({
        attempt,
        durationMs: Date.now() - start,
        status: 'failed',
        error: err.message,
      });

      if (attempt < maxRetries) {
        const jitter = Math.random() * 0.3 + 0.85; // 0.85–1.15
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1) * jitter, maxDelayMs);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  const err = new Error(`All ${maxRetries} attempts failed: ${lastError.message}`);
  err.attempts = attempts;
  throw err;
}
