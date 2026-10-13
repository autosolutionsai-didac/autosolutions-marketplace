// Hidden acceptance tests for the rate-limit task. Not shown to the agents.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from '../src/server.js'
import { Ledger } from '../src/ledger.js'

const T0 = 1_003_000 // deliberately not a multiple of the window, to catch epoch-aligned windows

async function start(options = {}) {
  const clock = { t: T0 }
  const server = createServer({ ledger: new Ledger(), now: () => clock.t, ...options })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const close = () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve) })
  return { base, clock, close }
}

const event = { model: 'claude-sonnet-5', usage: { inputTokens: 10, outputTokens: 5 } }

function post(base, key) {
  const headers = { 'content-type': 'application/json' }
  if (key) headers['x-api-key'] = key
  return fetch(`${base}/events`, { method: 'POST', headers, body: JSON.stringify(event) })
}

test('allows `limit` requests per window, then rejects with 429 and Retry-After', async () => {
  const { base, close } = await start({ rateLimit: { limit: 3, windowMs: 10_000 } })
  for (const remaining of ['2', '1', '0']) {
    const res = await post(base, 'acme')
    assert.equal(res.status, 201)
    assert.equal(res.headers.get('x-ratelimit-limit'), '3')
    assert.equal(res.headers.get('x-ratelimit-remaining'), remaining)
  }
  const res = await post(base, 'acme')
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('retry-after'), '10')
  assert.equal(res.headers.get('x-ratelimit-limit'), '3')
  assert.equal(res.headers.get('x-ratelimit-remaining'), '0')
  assert.deepEqual(await res.json(), { error: 'rate_limited', retryAfter: 10 })
  await close()
})

test('Retry-After counts whole seconds to the end of the window, rounded up, at least 1', async () => {
  const { base, clock, close } = await start({ rateLimit: { limit: 1, windowMs: 10_000 } })
  assert.equal((await post(base, 'acme')).status, 201)
  clock.t = T0 + 2_500
  let res = await post(base, 'acme')
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('retry-after'), '8')
  assert.equal((await res.json()).retryAfter, 8)
  clock.t = T0 + 9_999
  res = await post(base, 'acme')
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('retry-after'), '1')
  await close()
})

test('the window starts at the first request, not at a clock boundary', async () => {
  const { base, clock, close } = await start({ rateLimit: { limit: 1, windowMs: 10_000 } })
  assert.equal((await post(base, 'acme')).status, 201)
  clock.t = T0 + 7_000 // an epoch-aligned window would have reset at 1_010_000
  const res = await post(base, 'acme')
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('retry-after'), '3')
  await close()
})

test('a new window starts at the first request after the old one ends', async () => {
  const { base, clock, close } = await start({ rateLimit: { limit: 3, windowMs: 10_000 } })
  for (let i = 0; i < 3; i++) await post(base, 'acme')
  assert.equal((await post(base, 'acme')).status, 429)
  clock.t = T0 + 10_000
  let res = await post(base, 'acme')
  assert.equal(res.status, 201)
  assert.equal(res.headers.get('x-ratelimit-remaining'), '2')
  clock.t = T0 + 15_000 // inside the new window that began at T0 + 10_000
  res = await post(base, 'acme')
  assert.equal(res.status, 201)
  assert.equal(res.headers.get('x-ratelimit-remaining'), '1')
  await close()
})

test('keys are limited independently', async () => {
  const { base, close } = await start({ rateLimit: { limit: 1, windowMs: 10_000 } })
  assert.equal((await post(base, 'acme')).status, 201)
  assert.equal((await post(base, 'acme')).status, 429)
  const other = await post(base, 'globex')
  assert.equal(other.status, 201)
  assert.equal(other.headers.get('x-ratelimit-remaining'), '0')
  await close()
})

test('requests without a key share the "anonymous" limit and are limited before auth', async () => {
  const { base, close } = await start({ rateLimit: { limit: 2, windowMs: 10_000 } })
  const first = await post(base, null)
  assert.equal(first.status, 401)
  assert.equal(first.headers.get('x-ratelimit-remaining'), '1')
  assert.equal((await post(base, null)).status, 401)
  const third = await post(base, null)
  assert.equal(third.status, 429)
  assert.equal(third.headers.get('retry-after'), '10')
  assert.equal((await post(base, 'acme')).status, 201)
  await close()
})

test('unknown routes are limited too', async () => {
  const { base, close } = await start({ rateLimit: { limit: 1, windowMs: 10_000 } })
  const headers = { 'x-api-key': 'acme' }
  const first = await fetch(`${base}/no-such-route`, { headers })
  assert.equal(first.status, 404)
  assert.equal(first.headers.get('x-ratelimit-remaining'), '0')
  assert.equal((await fetch(`${base}/no-such-route`, { headers })).status, 429)
  await close()
})

test('GET /health is exempt and does not count', async () => {
  const { base, close } = await start({ rateLimit: { limit: 1, windowMs: 10_000 } })
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${base}/health`, { headers: { 'x-api-key': 'acme' } })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('x-ratelimit-limit'), null)
    assert.equal(res.headers.get('x-ratelimit-remaining'), null)
  }
  const res = await post(base, 'acme')
  assert.equal(res.status, 201)
  assert.equal(res.headers.get('x-ratelimit-remaining'), '0')
  await close()
})

test('defaults to 60 requests per 60 seconds', async () => {
  const { base, close } = await start()
  for (let i = 0; i < 60; i++) {
    const res = await post(base, 'acme')
    assert.equal(res.status, 201, `request ${i + 1}`)
  }
  const res = await post(base, 'acme')
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('retry-after'), '60')
  assert.equal(res.headers.get('x-ratelimit-limit'), '60')
  await close()
})
