import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Ledger, ValidationError } from '../src/ledger.js'

const usage = { inputTokens: 1_000_000, outputTokens: 100_000 }

test('record validates events', () => {
  const ledger = new Ledger()
  assert.throws(() => ledger.record({ key: '', model: 'claude-sonnet-5', usage, at: 1 }), ValidationError)
  assert.throws(() => ledger.record({ key: 'k', model: 'nope', usage, at: 1 }), ValidationError)
  assert.throws(() => ledger.record({ key: 'k', model: 'claude-sonnet-5', usage: { inputTokens: -1 }, at: 1 }), ValidationError)
  assert.throws(() => ledger.record({ key: 'k', model: 'claude-sonnet-5', usage, at: NaN }), ValidationError)
})

test('invoice groups usage per model and applies the discount', () => {
  const ledger = new Ledger({ discounts: { acme: 10 } })
  ledger.record({ key: 'acme', model: 'claude-sonnet-5', usage, at: 1 })
  ledger.record({ key: 'acme', model: 'claude-sonnet-5', usage, at: 2 })
  ledger.record({ key: 'acme', model: 'claude-opus-5', usage, at: 3 })
  ledger.record({ key: 'other', model: 'claude-opus-5', usage, at: 4 })
  const invoice = ledger.invoice('acme')
  assert.deepEqual(invoice.lines.map((l) => [l.model, l.requests]), [['claude-opus-5', 1], ['claude-sonnet-5', 2]])
  // sonnet: 2 x ($2 + $1) = $6.00, opus: $5 + $2.50 = $7.50
  assert.equal(invoice.subtotalCents, 1_350)
  assert.equal(invoice.discountPercent, 10)
  assert.equal(invoice.totalCents, 1_215)
})

test('invoice filters by period and returns null without usage', () => {
  const ledger = new Ledger()
  ledger.record({ key: 'acme', model: 'claude-sonnet-5', usage, at: 100 })
  assert.equal(ledger.invoice('acme', { from: 200 }), null)
  assert.equal(ledger.invoice('nobody'), null)
  assert.equal(ledger.invoice('acme', { from: 0, to: 101 }).lines.length, 1)
})
