import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DOCS_DIR = fileURLToPath(new URL('../docs/', import.meta.url))
const TYPES = {
  '.md': 'text/markdown; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

// Serves files under docs/ for GET /docs/<name>.
export async function serveDoc(res, pathname) {
  const name = decodeURIComponent(pathname.slice('/docs/'.length))
  const file = path.join(DOCS_DIR, name)
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not_found' }))
  }
}
