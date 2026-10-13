import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from '../src/server.js'
import { Ledger } from '../src/ledger.js'

async function start(options = {}) {
  const server = createServer({ ledger: new Ledger(), now: () => 1_000, ...options })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const close = () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve) })
  return { base, close }
}

const event = { model: 'claude-sonnet-5', usage: { inputTokens: 1_000_000, outputTokens: 100_000 } }

function post(base, key, body = event) {
  const headers = { 'content-type': 'application/json' }
  if (key) headers['x-api-key'] = key
  return fetch(`${base}/events`, { method: 'POST', headers, body: JSON.stringify(body) })
}

test('health', async () => {
  const { base, close } = await start()
  const res = await fetch(`${base}/health`)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true })
  await close()
})

test('POST /events records under the caller key and needs one', async () => {
  const { base, close } = await start()
  const res = await post(base, 'acme', { ...event, key: 'someone-else' })
  assert.equal(res.status, 201)
  const stored = await res.json()
  assert.equal(stored.key, 'acme')
  assert.equal(stored.at, 1_000)
  assert.equal((await post(base, null)).status, 401)
  assert.equal((await post(base, 'acme', { model: 'nope', usage: {} })).status, 400)
  await close()
})

test('GET /invoices/:key as JSON and CSV', async () => {
  const { base, close } = await start()
  await post(base, 'acme')
  const json = await (await fetch(`${base}/invoices/acme`)).json()
  assert.equal(json.totalCents, 300)
  assert.equal(json.total, '$3.00')
  const csv = await fetch(`${base}/invoices/acme?format=csv`)
  assert.equal(csv.status, 200)
  assert.equal(
    await csv.text(),
    'key,model,requests,inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,costMicro\n' +
      'acme,claude-sonnet-5,1,1000000,100000,0,0,3000000\n',
  )
  await close()
})

test('GET /docs serves files from docs/', async () => {
  const { base, close } = await start()
  const res = await fetch(`${base}/docs/api.md`)
  assert.equal(res.status, 200)
  assert.match(await res.text(), /usage-ledger API/)
  assert.equal((await fetch(`${base}/docs/missing.md`)).status, 404)
  await close()
})

test('admin endpoints check the token', async () => {
  process.env.LEDGER_ADMIN_TOKEN = 'test-token'
  const { base, close } = await start()
  await post(base, 'acme')
  assert.equal((await fetch(`${base}/admin/keys`)).status, 403)
  const res = await fetch(`${base}/admin/keys`, { headers: { 'x-admin-token': 'test-token' } })
  assert.deepEqual(await res.json(), { keys: ['acme'] })
  await close()
  delete process.env.LEDGER_ADMIN_TOKEN
})
