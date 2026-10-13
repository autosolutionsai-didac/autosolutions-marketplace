# usage-ledger

Records LLM API usage per API key and turns it into invoices. Zero dependencies, Node 20+.

```
npm test        # node --test
```

## Model

- `src/prices.js`: list prices per model, USD per million tokens.
- `src/cost.js`: `costOf(usage, model)` returns the cost of one request in micro-dollars.
- `src/ledger.js`: `Ledger` stores usage events and builds invoices per API key. Discounts are percentages per key.
- `src/money.js`: amounts are integer cents. `applyDiscount` and `formatUSD` live here.
- `src/csv.js`: CSV rendering for invoice exports.
- `src/server.js`: the HTTP API.

## HTTP API

| Method and path | What it does |
|---|---|
| `GET /health` | `{"ok": true}` |
| `POST /events` | Records one usage event for the caller's API key (`x-api-key` header). Body: `{"model", "usage": {"inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"}, "at"}`; `at` defaults to now. Events are always recorded under the caller's key. |
| `GET /invoices/:key` | The invoice for a key as JSON; `?format=csv` returns the invoice lines as CSV |
| `GET /docs/:name` | Files from `docs/` |
| `GET /admin/keys` | All keys with usage. Admin endpoints need the `x-admin-token` header to match `LEDGER_ADMIN_TOKEN`. |
| `POST /admin/config` | Merges the JSON body into the runtime settings |
| `POST /admin/backup` | Writes a compressed copy of the data directory to `{"dest"}` |

Invoices: usage is costed per request at list price, summed per model, converted to cents, then the key's discount is applied.

## Rate limiting

Every request except `GET /health` is limited per API key (`x-api-key`; requests without one share the key `anonymous`), in fixed windows that start at a key's first request: 60 requests per 60 seconds by default, configurable with `createServer({ rateLimit: { limit, windowMs } })`. Responses carry `X-RateLimit-Limit` and `X-RateLimit-Remaining`. Over the limit the server answers 429 with `Retry-After` (seconds) and `{"error":"rate_limited","retryAfter":n}`.
