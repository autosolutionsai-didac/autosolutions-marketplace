import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costOf } from '../src/cost.js'

test('costs one request on each Claude 5.5 model', () => {
  const usage = { inputTokens: 1_000, outputTokens: 1_000 }
  assert.equal(costOf(usage, 'claude-haiku-5-5'), 600)
  assert.equal(costOf(usage, 'claude-sonnet-5-5'), 12_000)
  assert.equal(costOf(usage, 'claude-opus-5-5'), 24_000)
})
