#!/usr/bin/env node
// Deterministic checks of the benchmark itself. No model calls.
//   node bench/selftest.mjs
// 1. The fixture's visible suite passes.
// 2. Every code task's hidden tests fail on the untouched fixture and pass with the reference solution
//    (so each task is solvable, and the hidden tests measure the change rather than the baseline).
// 3. The review branch's own tests pass (as a real PR's would).
// 4. Every seeded defect and vulnerability in the answer keys is real: an exploit demonstrates it.
// 5. The findings matcher credits a correct report and ignores noise.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASELINE_VISIBLE_TESTS, matchFindings, runNodeTests } from './lib/score.mjs'

const BENCH = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(BENCH, 'fixture', 'usage-ledger')
const tasks = JSON.parse(readFileSync(path.join(BENCH, 'tasks.json'), 'utf8')).tasks
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

function copyFixture(overlays = []) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bench-selftest-'))
  cpSync(FIXTURE, dir, { recursive: true })
  for (const o of overlays) cpSync(o, dir, { recursive: true })
  return dir
}

function hiddenRun(dir, taskId) {
  const hiddenDir = path.join(BENCH, 'tasks', taskId, 'hidden')
  cpSync(hiddenDir, path.join(dir, '.bench-hidden'), { recursive: true })
  const files = spawnSync('ls', [path.join(dir, '.bench-hidden')], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map((f) => path.join('.bench-hidden', f))
  return runNodeTests(dir, files)
}

// 1
{
  const dir = copyFixture()
  const r = runNodeTests(dir)
  check('fixture: visible suite passes', r.fail === 0 && r.pass === BASELINE_VISIBLE_TESTS, `${r.pass}/${r.tests}`)
  rmSync(dir, { recursive: true, force: true })
}

// 2
for (const task of tasks.filter((t) => t.kind === 'code')) {
  const base = copyFixture()
  const rb = hiddenRun(base, task.id)
  check(`${task.id}: hidden tests fail on the untouched fixture`, rb.fail > 0, `${rb.fail} failing of ${rb.tests}`)
  rmSync(base, { recursive: true, force: true })
  const ref = copyFixture([path.join(BENCH, 'tasks', task.id, 'reference')])
  const rv = runNodeTests(ref)
  check(`${task.id}: reference keeps the visible suite green`, rv.fail === 0 && rv.pass >= BASELINE_VISIBLE_TESTS, `${rv.pass}/${rv.tests}`)
  const rh = hiddenRun(ref, task.id)
  check(`${task.id}: reference passes every hidden test`, rh.fail === 0 && rh.pass === rh.tests && rh.pass > 0, `${rh.pass}/${rh.tests}${rh.failures.length ? ` failing: ${rh.failures.join('; ')}` : ''}`)
  rmSync(ref, { recursive: true, force: true })
}

// 3
const branch = copyFixture([path.join(BENCH, 'tasks', 'review-import', 'overlay')])
{
  const r = runNodeTests(branch)
  check('review-import: the branch passes its own tests', r.fail === 0 && r.pass > BASELINE_VISIBLE_TESTS, `${r.pass}/${r.tests}`)
}

// 4: exploits run in child processes so prototype pollution and env changes stay contained.
function exploit(name, dir, code, expect) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: dir, encoding: 'utf8', timeout: 60_000, env: { ...process.env, LEDGER_ADMIN_TOKEN: '' } })
  const out = (r.stdout || '').trim()
  check(`seed ${name}`, out === expect, out || (r.stderr || '').trim().split('\n').slice(-3).join(' | '))
}

const SERVER = `
import { createServer } from './src/server.js'
import { Ledger } from './src/ledger.js'
const ledger = new Ledger()
const server = createServer({ ledger, now: () => 1, dataDir: process.cwd() })
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = 'http://127.0.0.1:' + server.address().port
const done = (v) => { console.log(v); server.closeAllConnections(); server.close() }
`
const base = copyFixture()
delete process.env.LEDGER_ADMIN_TOKEN
exploit('V1 path traversal in /docs/', base, `${SERVER}
const res = await fetch(base + '/docs/..%2fpackage.json')
done(res.status === 200 && (await res.text()).includes('"name": "usage-ledger"') ? 'exploited' : 'safe ' + res.status)`, 'exploited')
exploit('V2 prototype pollution via /admin/config', base, `${SERVER}
process.env.LEDGER_ADMIN_TOKEN = 't'
await fetch(base + '/admin/config', { method: 'POST', headers: { 'x-admin-token': 't' }, body: '{"__proto__": {"polluted": "yes"}}' })
done(({}).polluted === 'yes' ? 'exploited' : 'safe')`, 'exploited')
const marker = path.join(os.tmpdir(), `bench-pwned-${process.pid}`)
exploit('V3 command injection via /admin/backup', base, `${SERVER}
import { existsSync, rmSync } from 'node:fs'
process.env.LEDGER_ADMIN_TOKEN = 't'
const dest = '/dev/null . ; touch ${marker} ;#'
await fetch(base + '/admin/backup', { method: 'POST', headers: { 'x-admin-token': 't' }, body: JSON.stringify({ dest }) })
const hit = existsSync('${marker}'); rmSync('${marker}', { force: true })
done(hit ? 'exploited' : 'safe')`, 'exploited')
exploit('V4 admin access without any token when LEDGER_ADMIN_TOKEN is unset', base, `${SERVER}
delete process.env.LEDGER_ADMIN_TOKEN
const res = await fetch(base + '/admin/keys')
done(res.status === 200 ? 'exploited' : 'safe ' + res.status)`, 'exploited')

const ROW = (key = 'acme') => JSON.stringify({ key, model: 'claude-sonnet-5', usage: { inputTokens: 1000 }, at: '2026-10-01T00:00:00Z' })
exploit('D1 import stops at the first blank line', branch, `
import { importEvents } from './src/importer.js'
import { Ledger } from './src/ledger.js'
const stats = importEvents(new Ledger(), ${JSON.stringify(ROW())} + '\\n\\n' + ${JSON.stringify(ROW())}, { maxRows: 100 })
console.log(stats.imported === 1 ? 'exploited' : 'safe ' + stats.imported)`, 'exploited')
exploit('D2 bulk endpoint has no body size limit', branch, `${SERVER}
const row = JSON.stringify({ ...JSON.parse(${JSON.stringify(ROW())}), note: 'x'.repeat(200) })
const rows = Array.from({ length: 9000 }, () => row).join('\\n')
const big = await fetch(base + '/events/bulk', { method: 'POST', headers: { 'x-api-key': 'acme' }, body: rows })
const single = await fetch(base + '/events', { method: 'POST', headers: { 'x-api-key': 'acme' }, body: JSON.stringify({ model: 'claude-sonnet-5', usage: {}, pad: 'x'.repeat(rows.length) }) })
done(rows.length > 1_000_000 && big.status === 200 && single.status === 400 ? 'exploited' : 'safe ' + big.status + ' ' + single.status)`, 'exploited')
exploit('D3 stats leak across calls through DEFAULT_OPTIONS', branch, `
import { importEvents } from './src/importer.js'
import { Ledger } from './src/ledger.js'
importEvents(new Ledger(), ${JSON.stringify(ROW())})
const second = importEvents(new Ledger(), ${JSON.stringify(ROW())})
console.log(second.imported === 2 ? 'exploited' : 'safe ' + second.imported)`, 'exploited')
exploit('D4 bulk import bills rows to another key', branch, `${SERVER}
await fetch(base + '/events/bulk', { method: 'POST', headers: { 'x-api-key': 'attacker' }, body: ${JSON.stringify(ROW('victim'))} })
done(ledger.invoice('victim') && !ledger.invoice('attacker') ? 'exploited' : 'safe')`, 'exploited')
rmSync(base, { recursive: true, force: true })
rmSync(branch, { recursive: true, force: true })

// 5
for (const [taskId, keyFile] of [['review-import', 'defects.json'], ['audit-input', 'vulns.json']]) {
  const key = JSON.parse(readFileSync(path.join(BENCH, 'tasks', taskId, keyFile), 'utf8'))
  const perfect = key.defects.map((d) => ({ file: d.locations[0].file, line: d.locations[0].lines[0], severity: '', text: d.title.toLowerCase() }))
  check(`${taskId}: matcher credits a report that names every seeded defect`, matchFindings(perfect, key.defects).recall === 1)
  const noise = [{ file: 'src/ledger.js', line: 40, severity: '', text: 'variable naming' }, { file: 'README.md', line: 1, severity: '', text: 'typo' }]
  const m = matchFindings(noise, key.defects)
  check(`${taskId}: matcher gives no credit for unrelated findings`, m.recall === 0 && m.extras === 2)
}

console.log(failures ? `\n${failures} check(s) failed` : '\nselftest: all checks passed')
process.exit(failures ? 1 : 0)
