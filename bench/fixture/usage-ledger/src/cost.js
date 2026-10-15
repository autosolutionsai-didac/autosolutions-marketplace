import { getPrice } from './prices.js'

// Usage counts are in tokens, as the API reports them. Returns the cost of the request in
// micro-dollars (millionths of a dollar), rounded per component, so costs can be summed
// without floating point drift.
export function costOf(usage, model) {
  const price = getPrice(model)
  return (
    micro(usage.inputTokens, price.input) +
    micro(usage.outputTokens, price.output) +
    micro(usage.cacheReadTokens, price.cacheRead) +
    micro(usage.cacheWriteTokens, price.cacheWrite)
  )
}

// tokens * (USD per million tokens) is already in micro-dollars.
function micro(tokens, usdPerMillion) {
  return Math.round((tokens || 0) * usdPerMillion)
}
