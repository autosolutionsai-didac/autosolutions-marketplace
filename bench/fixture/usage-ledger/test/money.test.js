import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyDiscount, formatUSD, microToCents } from '../src/money.js'

test('formatUSD', () => {
  assert.equal(formatUSD(0), '$0.00')
  assert.equal(formatUSD(5), '$0.05')
  assert.equal(formatUSD(123456), '$1,234.56')
  assert.equal(formatUSD(-5), '-$0.05')
})

test('microToCents rounds to the nearest cent', () => {
  assert.equal(microToCents(10_000), 1)
  assert.equal(microToCents(14_999), 1)
  assert.equal(microToCents(15_000), 2)
})

test('applyDiscount', () => {
  assert.equal(applyDiscount(1_000, 0), 1_000)
  assert.equal(applyDiscount(1_000, 10), 900)
  assert.equal(applyDiscount(1_000, 100), 0)
  assert.throws(() => applyDiscount(1_000, 101), RangeError)
  assert.throws(() => applyDiscount(1_000, -1), RangeError)
})
