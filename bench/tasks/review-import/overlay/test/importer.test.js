import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importEvents } from '../src/importer.js'
import { Ledger } from '../src/ledger.js'
import { createServer } from '../src/server.js'

const row = (over = {}) =>
  JSON.stringify({ key: 'acme', model: 'claude-sonnet-5', usage: { inputTokens: 1_000_000 }, at: '2026-10-01T00:00:00Z', ...over })

test('imports NDJSON rows', () => {
  const ledger = new Ledger()
  const stats = importEvents(ledger, [row(), row({ at: '2026-10-02T00:00:00Z' })].join('\n'), { maxRows: 100 })
  assert.equal(stats.imported, 2)
  assert.equal(ledger.invoice('acme').totalCents, 400)
})

test('reports invalid lines and skips rows without a model', () => {
  const stats = importEvents(new Ledger(), ['{oops', row({ model: null }), row({ model: 'nope' }), row()].join('\n'), { maxRows: 100 })
  assert.equal(stats.imported, 1)
  assert.equal(stats.skipped, 1)
  assert.deepEqual(stats.errors.map((e) => e.line), [1, 3])
})

test('enforces maxRows', () => {
  assert.throws(() => importEvents(new Ledger(), [row(), row(), row()].join('\n'), { maxRows: 2 }), /too many rows/)
})

test('POST /events/bulk imports for the caller', async () => {
  const server = createServer({ ledger: new Ledger(), now: () => 1 })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const res = await fetch(`${base}/events/bulk`, { method: 'POST', headers: { 'x-api-key': 'acme' }, body: row() + '\n' })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).imported, 1)
  assert.equal((await fetch(`${base}/events/bulk`, { method: 'POST', body: row() })).status, 401)
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})
