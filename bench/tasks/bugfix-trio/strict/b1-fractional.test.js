// Strict check, bug 1 (scored apart from the hidden tests): the rounding rule holds for fractional percents
// too. The ledger accepts any discount from 0 to 100, and the spec's rule, subtotal x (100 - percent) / 100
// rounded half up, does not stop at whole numbers. Floating-point arithmetic gets some of these a cent low.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyDiscount } from '../../src/money.js'

// Exact reference: the percent as the decimal it prints as, half up, in integers.
const exact = (cents, percent) => {
  const scale = 100000n
  const num = BigInt(cents) * (100n * scale - BigInt(Math.round(percent * 100000)))
  const den = 100n * scale
  return Number((2n * num + den) / (2n * den))
}

test('fractional discounts round half up: known half-cent cases', () => {
  assert.equal(applyDiscount(875, 28.4), 627) // 626.5
  assert.equal(applyDiscount(125, 64.4), 45) // 44.5
  assert.equal(applyDiscount(1_001, 12.5), 876) // 875.875
})

test('fractional discounts round half up: every one-decimal percent on 0 to $40', () => {
  let wrong = 0
  let first = null
  for (let cents = 0; cents <= 4_000; cents++) {
    for (let p10 = 0; p10 <= 1_000; p10++) {
      const percent = p10 / 10
      const got = applyDiscount(cents, percent)
      if (got !== exact(cents, percent)) { wrong++; first ||= `${cents} cents at ${percent}%: got ${got}, expected ${exact(cents, percent)}` }
    }
  }
  assert.equal(wrong, 0, `${wrong} wrong totals, first: ${first}`)
})
