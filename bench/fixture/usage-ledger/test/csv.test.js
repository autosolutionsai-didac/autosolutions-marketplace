import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toCSV } from '../src/csv.js'

test('toCSV renders a header and one line per row', () => {
  const rows = [
    { model: 'claude-sonnet-5', requests: 2 },
    { model: 'claude-opus-5', requests: 1 },
  ]
  assert.equal(toCSV(rows, ['model', 'requests']), 'model,requests\nclaude-sonnet-5,2\nclaude-opus-5,1\n')
})

test('toCSV leaves missing values empty', () => {
  assert.equal(toCSV([{ a: null }], ['a', 'b']), 'a,b\n,\n')
})
