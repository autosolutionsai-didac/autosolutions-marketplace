// Hidden acceptance tests, bug 1: discounts round half up to the nearest cent.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyDiscount } from '../src/money.js'
import { Ledger } from '../src/ledger.js'

test('applyDiscount rounds half up to the nearest cent', () => {
  assert.equal(applyDiscount(1_001, 15), 851) // 850.85
  assert.equal(applyDiscount(10, 15), 9) // 8.5
  assert.equal(applyDiscount(1, 50), 1) // 0.5
  assert.equal(applyDiscount(333, 33), 223) // 223.11
  assert.equal(applyDiscount(999, 10), 899) // 899.1
  assert.equal(applyDiscount(1_234, 0), 1_234)
  assert.equal(applyDiscount(1_234, 100), 0)
  assert.equal(applyDiscount(0, 37), 0)
})

test('invoice total: $10.01 with 15% off is $8.51', () => {
  const ledger = new Ledger({ discounts: { acme: 15 } })
  // claude-sonnet-5 output is $10 per million tokens: 1_001_000 tokens = $10.01
  ledger.record({ key: 'acme', model: 'claude-sonnet-5', usage: { outputTokens: 1_001_000 }, at: 1 })
  const invoice = ledger.invoice('acme')
  assert.equal(invoice.subtotalCents, 1_001)
  assert.equal(invoice.totalCents, 851)
})

test('applyDiscount still validates the percentage', () => {
  assert.throws(() => applyDiscount(100, 101), RangeError)
  assert.throws(() => applyDiscount(100, -5), RangeError)
})
