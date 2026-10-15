// Anthropic list prices in USD per million tokens.
// cacheWrite is the 5-minute cache write price.
// Last updated: 2026-07-01, at the Claude 5 launch.
export const PRICES = {
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
}

export class UnknownModelError extends Error {
  constructor(model) {
    super(`unknown model: ${model}`)
    this.name = 'UnknownModelError'
    this.model = model
  }
}

export function getPrice(model) {
  const price = PRICES[model]
  if (!price) throw new UnknownModelError(model)
  return price
}
