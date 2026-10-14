// Amounts are integer cents unless a name says otherwise.

export function microToCents(micro) {
  return Math.round(micro / 10_000)
}

export function formatUSD(cents) {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100).toLocaleString('en-US')
  const rest = String(abs % 100).padStart(2, '0')
  return `${sign}$${dollars}.${rest}`
}

// Applies a percentage discount (0 to 100) to an amount in cents.
export function applyDiscount(cents, percent) {
  if (!(percent >= 0 && percent <= 100)) throw new RangeError('percent must be between 0 and 100')
  // Exact: read the percent as the decimal it prints as (64.4, not 64.3999...) and round half up in integers.
  const scale = 100000n
  const num = BigInt(cents) * (100n * scale - BigInt(Math.round(percent * 100000)))
  const den = 100n * scale
  return Number((2n * num + den) / (2n * den))
}
