// Fixed-window rate limiter, one window per key. A window starts at the first request in it.
export function createRateLimiter({ limit = 60, windowMs = 60_000 } = {}, now = Date.now) {
  const windows = new Map()
  return function check(key) {
    const t = now()
    let w = windows.get(key)
    if (!w || t >= w.start + windowMs) {
      w = { start: t, count: 0 }
      windows.set(key, w)
    }
    if (w.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((w.start + windowMs - t) / 1000))
      return { allowed: false, limit, remaining: 0, retryAfter }
    }
    w.count++
    return { allowed: true, limit, remaining: Math.max(0, limit - w.count) }
  }
}
