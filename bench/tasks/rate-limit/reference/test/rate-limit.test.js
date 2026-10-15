import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRateLimiter } from '../src/rate-limit.js'

test('allows `limit` requests per window, then rejects until the window ends', () => {
  let t = 0
  const check = createRateLimiter({ limit: 2, windowMs: 1_000 }, () => t)
  assert.equal(check('a').remaining, 1)
  assert.equal(check('a').remaining, 0)
  assert.deepEqual(check('a'), { allowed: false, limit: 2, remaining: 0, retryAfter: 1 })
  t = 1_000
  assert.equal(check('a').allowed, true)
})
