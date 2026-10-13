import { costOf } from './cost.js'
import { getPrice } from './prices.js'
import { applyDiscount, microToCents } from './money.js'

export class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ValidationError'
  }
}

const USAGE_FIELDS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']

export class Ledger {
  constructor({ discounts = {} } = {}) {
    this.events = []
    this.discounts = {}
    for (const [key, percent] of Object.entries(discounts)) this.setDiscount(key, percent)
  }

  record(event) {
    const { key, model, usage, at } = event || {}
    if (typeof key !== 'string' || key.trim() === '') throw new ValidationError('key must be a non-empty string')
    if (typeof model !== 'string') throw new ValidationError('model must be a string')
    try {
      getPrice(model)
    } catch {
      throw new ValidationError(`unknown model: ${model}`)
    }
    if (!usage || typeof usage !== 'object') throw new ValidationError('usage must be an object')
    const clean = {}
    for (const field of USAGE_FIELDS) {
      const value = usage[field] ?? 0
      if (!Number.isInteger(value) || value < 0) throw new ValidationError(`${field} must be a non-negative integer`)
      clean[field] = value
    }
    if (!Number.isFinite(at)) throw new ValidationError('at must be a timestamp in milliseconds')
    const stored = { key, model, usage: clean, at }
    this.events.push(stored)
    return stored
  }

  keys() {
    return [...new Set(this.events.map((e) => e.key))].sort()
  }

  eventsFor(key, { from = -Infinity, to = Infinity } = {}) {
    return this.events.filter((e) => e.key === key && e.at >= from && e.at < to)
  }

  setDiscount(key, percent) {
    if (!(percent >= 0 && percent <= 100)) throw new ValidationError('discount must be between 0 and 100')
    this.discounts[key] = percent
  }

  // Returns null when the key has no events in the period.
  invoice(key, period = {}) {
    const events = this.eventsFor(key, period)
    if (events.length === 0) return null
    const byModel = new Map()
    for (const e of events) {
      const line = byModel.get(e.model) || {
        key,
        model: e.model,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costMicro: 0,
      }
      line.requests++
      for (const field of USAGE_FIELDS) line[field] += e.usage[field]
      line.costMicro += costOf(e.usage, e.model)
      byModel.set(e.model, line)
    }
    const lines = [...byModel.values()].sort((a, b) => a.model.localeCompare(b.model))
    const subtotalCents = microToCents(lines.reduce((sum, l) => sum + l.costMicro, 0))
    const discountPercent = this.discounts[key] || 0
    const totalCents = applyDiscount(subtotalCents, discountPercent)
    return { key, lines, subtotalCents, discountPercent, totalCents }
  }
}
