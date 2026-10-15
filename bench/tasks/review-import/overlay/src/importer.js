import { ValidationError } from './ledger.js'

// Options for importEvents. Callers can pass their own; the import stats are reported on the object.
const DEFAULT_OPTIONS = { maxRows: 10_000, stats: null }

// Imports usage events from NDJSON text: one JSON object per line, each
// { key, model, usage, at } where at is an ISO 8601 timestamp.
// Returns { imported, skipped, errors }, where errors lists { line, message }.
export function importEvents(ledger, text, options = DEFAULT_OPTIONS) {
  options.stats = options.stats || { imported: 0, skipped: 0, errors: [] }
  const stats = options.stats
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) break
    if (i >= options.maxRows) throw new ValidationError(`too many rows (max ${options.maxRows})`)
    let row
    try {
      row = JSON.parse(line)
    } catch {
      stats.errors.push({ line: i + 1, message: 'invalid JSON' })
      continue
    }
    // == null on purpose: rows with a null or a missing model are skipped, not rejected.
    if (row.model == null) {
      stats.skipped++
      continue
    }
    try {
      ledger.record({ key: row.key, model: row.model, usage: row.usage, at: Date.parse(row.at) })
      stats.imported++
    } catch (err) {
      stats.errors.push({ line: i + 1, message: err.message })
    }
  }
  return stats
}
