import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costOf } from '../src/cost.js'
import { getPrice, UnknownModelError } from '../src/prices.js'

test('costOf prices every usage component', () => {
  const usage = { inputTokens: 1_000, outputTokens: 2_000, cacheReadTokens: 10_000, cacheWriteTokens: 500 }
  // claude-sonnet-5: 2, 10, 0.2, 2.5 USD per million tokens
  assert.equal(costOf(usage, 'claude-sonnet-5'), 2_000 + 20_000 + 2_000 + 1_250)
})

test('costOf treats missing components as zero', () => {
  assert.equal(costOf({ outputTokens: 100 }, 'claude-opus-5'), 2_500)
})

test('getPrice rejects unknown models', () => {
  assert.throws(() => getPrice('gpt-unknown'), UnknownModelError)
})
