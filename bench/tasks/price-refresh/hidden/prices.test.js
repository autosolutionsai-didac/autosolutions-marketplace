// Hidden acceptance tests for the price-refresh task.
// Ground truth: https://platform.claude.com/docs/en/about-claude/pricing, read 2026-10-13
// (Sonnet 5.5 cache reads were cut from $0.20 to $0.10 on 2026-10-07).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PRICES, getPrice } from '../src/prices.js'
import { costOf } from '../src/cost.js'
import { Ledger } from '../src/ledger.js'

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: expected ${expected}, got ${actual}`)

const EXPECTED = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
}

for (const [model, expected] of Object.entries(EXPECTED)) {
  test(`${model} list prices`, () => {
    const price = getPrice(model)
    for (const field of ['input', 'output', 'cacheRead', 'cacheWrite']) near(price[field], expected[field], `${model}.${field}`)
  })
}

test('existing entries are unchanged', () => {
  assert.deepEqual({ ...PRICES['claude-haiku-4-5'] }, { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 })
  assert.deepEqual({ ...PRICES['claude-sonnet-5'] }, { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 })
  assert.deepEqual({ ...PRICES['claude-opus-5'] }, { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 })
})

test('costOf and the ledger accept the new models', () => {
  const usage = { inputTokens: 10_000, outputTokens: 2_000, cacheReadTokens: 100_000, cacheWriteTokens: 4_000 }
  assert.equal(costOf(usage, 'claude-sonnet-5-5'), 20_000 + 20_000 + 10_000 + 10_000)
  assert.equal(costOf(usage, 'claude-opus-5-5'), 40_000 + 40_000 + 20_000 + 20_000)
  assert.equal(costOf(usage, 'claude-haiku-5-5'), 1_000 + 1_000 + 1_000 + 500)
  const ledger = new Ledger()
  for (const model of Object.keys(EXPECTED)) ledger.record({ key: 'acme', model, usage, at: 1 })
  assert.equal(ledger.invoice('acme').lines.length, 3)
})
