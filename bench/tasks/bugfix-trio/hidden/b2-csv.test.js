// Hidden acceptance tests, bug 2: RFC 4180 quoting in CSV exports.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toCSV } from '../src/csv.js'
import { createServer } from '../src/server.js'
import { Ledger } from '../src/ledger.js'

test('fields with commas, quotes or line breaks are quoted, quotes doubled', () => {
  const rows = [
    { a: 'team, alpha', b: 'plain' },
    { a: 'say "hi"', b: 7 },
    { a: 'line1\nline2', b: 'x\ry' },
    { a: '', b: null },
  ]
  assert.equal(
    toCSV(rows, ['a', 'b']),
    'a,b\n' + '"team, alpha",plain\n' + '"say ""hi""",7\n' + '"line1\nline2","x\ry"\n' + ',\n',
  )
})

test('plain fields stay unquoted', () => {
  assert.equal(toCSV([{ m: 'claude-sonnet-5', n: 12 }], ['m', 'n']), 'm,n\nclaude-sonnet-5,12\n')
})

test('invoice CSV export quotes a key that contains a comma', async () => {
  const ledger = new Ledger()
  ledger.record({ key: 'team, alpha', model: 'claude-sonnet-5', usage: { inputTokens: 1_000_000 }, at: 1 })
  const server = createServer({ ledger, now: () => 1 })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const res = await fetch(`${base}/invoices/${encodeURIComponent('team, alpha')}?format=csv`)
  assert.equal(res.status, 200)
  const lines = (await res.text()).split('\n')
  assert.equal(lines[1], '"team, alpha",claude-sonnet-5,1,1000000,0,0,0,2000000')
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})
