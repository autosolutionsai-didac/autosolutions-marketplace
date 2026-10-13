import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyDiscount } from '../src/money.js'
import { toCSV } from '../src/csv.js'
import { createServer } from '../src/server.js'
import { Ledger } from '../src/ledger.js'

test('discounted totals round half up', () => {
  assert.equal(applyDiscount(1_001, 15), 851)
})

test('CSV quotes fields with commas and quotes', () => {
  assert.equal(toCSV([{ a: 'team, "alpha"' }], ['a']), 'a\n"team, ""alpha"""\n')
})

test('unknown invoice key is a 404', async () => {
  const server = createServer({ ledger: new Ledger() })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const res = await fetch(`http://127.0.0.1:${server.address().port}/invoices/nobody`)
  server.closeAllConnections()
  server.close()
  assert.equal(res.status, 404)
})
