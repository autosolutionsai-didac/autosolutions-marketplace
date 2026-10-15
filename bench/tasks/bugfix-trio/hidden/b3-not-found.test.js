// Hidden acceptance tests, bug 3: unknown invoice keys return 404, not 500.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from '../src/server.js'
import { Ledger } from '../src/ledger.js'

async function start(ledger) {
  const server = createServer({ ledger, now: () => 1 })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const close = () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve) })
  return { base, close }
}

test('unknown key: 404 with {"error":"not_found"} as JSON', async () => {
  const { base, close } = await start(new Ledger())
  const res = await fetch(`${base}/invoices/nobody`)
  assert.equal(res.status, 404)
  assert.match(res.headers.get('content-type'), /application\/json/)
  assert.deepEqual(await res.json(), { error: 'not_found' })
  await close()
})

test('unknown key with format=csv: also 404 with the JSON body', async () => {
  const { base, close } = await start(new Ledger())
  const res = await fetch(`${base}/invoices/nobody?format=csv`)
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { error: 'not_found' })
  await close()
})

test('known keys still return their invoice', async () => {
  const ledger = new Ledger()
  ledger.record({ key: 'acme', model: 'claude-sonnet-5', usage: { inputTokens: 1_000_000 }, at: 1 })
  const { base, close } = await start(ledger)
  const res = await fetch(`${base}/invoices/acme`)
  assert.equal(res.status, 200)
  assert.equal((await res.json()).totalCents, 200)
  await close()
})
