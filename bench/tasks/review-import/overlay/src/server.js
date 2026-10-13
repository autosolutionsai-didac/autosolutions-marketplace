import http from 'node:http'
import { Ledger, ValidationError } from './ledger.js'
import { toCSV } from './csv.js'
import { formatUSD } from './money.js'
import { isAdmin } from './auth.js'
import { settings, updateSettings } from './config.js'
import { backup } from './backup.js'
import { serveDoc } from './static.js'
import { importEvents } from './importer.js'

const CSV_COLUMNS = ['key', 'model', 'requests', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'costMicro']

export function createServer({ ledger = new Ledger(), now = Date.now, dataDir = 'data' } = {}) {
  return http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (err instanceof ValidationError || err instanceof SyntaxError) {
        return send(res, 400, { error: 'invalid', message: err.message })
      }
      send(res, 500, { error: 'internal' })
    })
  })

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost')
    const { pathname } = url

    if (req.method === 'GET' && pathname === '/health') return send(res, 200, { ok: true })

    if (req.method === 'POST' && pathname === '/events') {
      const key = req.headers['x-api-key']
      if (!key) return send(res, 401, { error: 'missing_api_key' })
      const body = await readJson(req)
      const event = ledger.record({ ...body, key, at: body.at ?? now() })
      return send(res, 201, event)
    }

    if (req.method === 'POST' && pathname === '/events/bulk') {
      if (!req.headers['x-api-key']) return send(res, 401, { error: 'missing_api_key' })
      let text = ''
      for await (const chunk of req) text += chunk
      return send(res, 200, importEvents(ledger, text))
    }

    const invoiceMatch = pathname.match(/^\/invoices\/([^/]+)$/)
    if (req.method === 'GET' && invoiceMatch) {
      const invoice = ledger.invoice(decodeURIComponent(invoiceMatch[1]))
      if (url.searchParams.get('format') === 'csv') {
        res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' })
        return res.end(toCSV(invoice.lines, CSV_COLUMNS))
      }
      return send(res, 200, { ...invoice, total: formatUSD(invoice.totalCents) })
    }

    if (req.method === 'GET' && pathname.startsWith('/docs/')) return serveDoc(res, pathname)

    if (pathname.startsWith('/admin/')) {
      if (!isAdmin(req)) return send(res, 403, { error: 'forbidden' })
      if (req.method === 'GET' && pathname === '/admin/keys') return send(res, 200, { keys: ledger.keys() })
      if (req.method === 'POST' && pathname === '/admin/config') return send(res, 200, updateSettings(await readJson(req)))
      if (req.method === 'POST' && pathname === '/admin/backup') {
        const { dest } = await readJson(req)
        return send(res, 200, { dest: await backup(dataDir, dest) })
      }
    }

    send(res, 404, { error: 'not_found' })
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > settings.limits.maxBodyBytes) throw new ValidationError('body too large')
  }
  return raw ? JSON.parse(raw) : {}
}
