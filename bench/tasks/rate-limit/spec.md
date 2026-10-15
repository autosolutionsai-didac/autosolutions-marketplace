Add per-API-key rate limiting to the HTTP server in src/server.js. Put the limiter in a new module, src/rate-limit.js.

Required behaviour:

1. createServer(options) accepts options.rateLimit = { limit, windowMs }. The default is { limit: 60, windowMs: 60000 }. All timing uses the existing options.now() clock, never Date.now() directly.
2. The limiter runs before routing and authentication, so every request is limited, including ones that would get a 401 or 404. A request's key is its x-api-key header. Requests without that header share the key "anonymous".
3. Fixed windows per key: a key's window starts at the first request in that window and lasts windowMs. Within a window the first `limit` requests are allowed and the rest are rejected. Once now >= windowStart + windowMs, the next request from that key starts a new window at that moment.
4. A rejected request gets status 429, a Retry-After header holding the whole number of seconds until the current window ends (rounded up, at least 1), and the JSON body {"error":"rate_limited","retryAfter":<the same number>}.
5. Every response to a limited request, allowed or rejected, has an X-RateLimit-Limit header (the limit) and an X-RateLimit-Remaining header (requests still allowed in the current window after this one, never below 0).
6. GET /health is exempt: it is never rejected, never counts toward any key's limit, and has no rate-limit headers.
7. Add tests in test/rate-limit.test.js and document the behaviour in README.md.

The existing test suite (npm test) must keep passing.
