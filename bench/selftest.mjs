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
import { BASELINE_VISIBLE_TESTS, matchFindings, runNodeTests, specCompliance } from './lib/score.mjs'
import { contamination } from './lib/evaluate.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'

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

// 2b. The completeness checks reject the untouched fixture.
for (const task of tasks.filter((t) => t.kind === 'code')) {
  const base = copyFixture()
  const c = specCompliance(task.id, base)
  check(`${task.id}: completeness check rejects the untouched fixture`, c && !c.complete, JSON.stringify(c && c.items))
  rmSync(base, { recursive: true, force: true })
  const ref = copyFixture([path.join(BENCH, 'tasks', task.id, 'reference')])
  const cr = specCompliance(task.id, ref)
  check(`${task.id}: completeness check accepts the full reference solution`, cr && cr.complete, JSON.stringify(cr && cr.items))
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

// 5. The matcher credits correct reports in their usual phrasings and gives no seeded credit to anything else.
{
  const F = (file, line, text) => ({ file, line, severity: '', text: text.toLowerCase() })
  const review = JSON.parse(readFileSync(path.join(BENCH, 'tasks', 'review-import', 'defects.json'), 'utf8'))
  const audit = JSON.parse(readFileSync(path.join(BENCH, 'tasks', 'audit-input', 'vulns.json'), 'utf8'))
  const tol = (id) => tasks.find((t) => t.id === id).tolerance
  const R = (fs) => matchFindings(fs, review.defects, tol('review-import'), review.knownOther)
  const A = (fs) => matchFindings(fs, audit.defects, tol('audit-input'), audit.knownOther)
  check('matcher: a correct review in typical words finds D1-D4', R([F('src/importer.js', 15, 'Import stops at the first blank line, dropping later rows'), F('src/server.js', 40, 'No body size limit on /events/bulk: memory exhaustion'), F('src/importer.js', 10, 'Mutates DEFAULT_OPTIONS so stats accumulate across requests'), F('src/server.js', 41, 'Rows recorded under row.key, not the caller x-api-key')]).recall === 1)
  check('matcher: D4 reported at the header check as "authenticated user ... arbitrary tenants" still counts', R([F('src/importer.js', 15, 'break on empty line drops the rest of the file'), F('src/server.js', 40, 'Unbounded request body (DoS)'), F('src/importer.js', 4, 'shared DEFAULT_OPTIONS object is mutated'), F('src/server.js', 38, 'API key header is checked but discarded; lets an authenticated user write usage for arbitrary tenants')]).recall === 1)
  const c = R([F('src/importer.js', 16, 'maxRows enforced after rows already recorded'), F('src/importer.js', 12, 'whole payload split in memory'), F('src/importer.js', 25, 'a null line crashes, the caller gets a 500'), F('src/server.js', 40, 'multi-byte UTF-8 corrupted at chunk boundaries')])
  check('matcher: four real but unseeded review findings get no seeded credit and count as valid extras', c.recall === 0 && c.validExtras === 3, JSON.stringify(c))
  check('matcher: a shotgun list far from the seeded lines gets no credit', R([F('src/importer.js', 60, 'error message could break log parsing'), F('src/server.js', 5, 'consider a rate limit on the health route'), F('src/importer.js', 70, 'helper uses a global regex'), F('src/server.js', 90, 'caller gets a generic 500 on json errors')]).recall === 0)
  for (const [file, line, text] of [['src/importer.js', 30, 'invalid timestamp becomes NaN'], ['src/server.js', 41, 'returns 200 when all rows fail'], ['src/importer.js', 21, 'invalid json error loses the parser message, so the caller cannot tell what failed']]) {
    check(`matcher: off-target review finding "${text}" earns no seeded credit`, R([F(file, line, text)]).recall === 0)
  }
  check('matcher: off-target audit finding "missing api key results in undefined key" earns no seeded credit', A([F('src/server.js', 30, 'missing api key results in undefined key')]).recall === 0)
  check('matcher: short keywords match whole words only ("dos" is not "does")', R([F('src/server.js', 40, 'this does not check anything')]).recall === 0)
  check('matcher: a correct audit finds V1-V4, with V1 reported at the route', A([F('src/server.js', 46, 'Directory traversal through GET /docs/:name'), F('src/config.js', 15, 'Prototype pollution via __proto__ in deepMerge'), F('src/backup.js', 8, 'Command injection: dest interpolated into exec'), F('src/auth.js', 3, 'Admin check passes when LEDGER_ADMIN_TOKEN is unset')]).recall === 1)
  const g = A([F('src/server.js', 38, 'Unauthenticated invoice access (IDOR) bypasses tenant isolation'), F('src/server.js', 41, 'CSV formula injection in export')])
  check('matcher: real but unseeded audit findings get no seeded credit and count as valid extras', g.recall === 0 && g.validExtras === 2, JSON.stringify(g))
}

// 6. Contamination: another run's directory or the bench's own files count; the run itself does not.
{
  const t = mkdtempSync(path.join(os.tmpdir(), 'bench-contam-'))
  mkdirSync(path.join(t, 'home', 'projects', 'p'), { recursive: true })
  const W = '/tmp/harness-bench/LBL'
  const own = `${W}/harness-sonnet-builders/rate-limit/t1`
  const lines = (...xs) => xs.map((x) => JSON.stringify({ x })).join('\n') + '\n'
  writeFileSync(path.join(t, 'home', 'projects', 'p', 'a.jsonl'), lines(`${own}/repo/src/x.js`, `${W}/harne`, `${W}/plugin-snapshot/harness/agents/builder.md`))
  check('contamination: the run\'s own paths (even cut short) and the plugin snapshot are not flagged', contamination(path.join(t, 'home'), own, W).length === 0)
  writeFileSync(path.join(t, 'home', 'projects', 'p', 'b.jsonl'), lines(`cat ${W}/native-opus-xhigh/rate-limit/t1/repo/src/rate-limit.js`, `read ${path.dirname(BENCH)}/bench/tasks/review-import/defects.json`))
  const hits = contamination(path.join(t, 'home'), own, W)
  check('contamination: a sibling run and the answer key are flagged', hits.length === 2, JSON.stringify(hits))
  rmSync(t, { recursive: true, force: true })
}

console.log(failures ? `\n${failures} check(s) failed` : '\nselftest: all checks passed')
process.exit(failures ? 1 : 0)
