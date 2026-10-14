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
import { spawn } from 'node:child_process'
import { resolveTeams } from './lib/teams.mjs'
import { gateEffect, readJsonl } from './lib/collect.mjs'
import { scoreCodeTask } from './lib/score.mjs'
import { startMockDecisionServer } from './lib/mock-decision.mjs'

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
  writeFileSync(path.join(t, 'home', 'projects', 'p', 'ps.jsonl'), lines(`root 14949 /bin/bash -c source ${W}/native-opus-xhigh/bugfix-trio/t1/home/shell-snapshots/snapshot-bash-1-x.sh 2>/dev/null`))
  check('contamination: another run\'s shell snapshot seen in a process listing is not flagged', contamination(path.join(t, 'home'), own, W).length === 0)
  rmSync(path.join(t, 'home', 'projects', 'p', 'ps.jsonl'))
  writeFileSync(path.join(t, 'home', 'projects', 'p', 'b.jsonl'), lines(`cat ${W}/native-opus-xhigh/rate-limit/t1/repo/src/rate-limit.js`, `read ${path.dirname(BENCH)}/bench/tasks/review-import/defects.json`))
  const hits = contamination(path.join(t, 'home'), own, W)
  check('contamination: a sibling run and the answer key are flagged', hits.length === 2, JSON.stringify(hits))
  rmSync(t, { recursive: true, force: true })
}

// 7. Decision-gate teams: inheritance, and the probe's record of what a run would have delivered without
// the gate. The gate (unchanged harness code) answers from the mock in "block" mode; the probe must pass its
// block through and commit the work tree as it was at that moment, and the scorer must grade that commit,
// not the final tree.
{
  const teams = resolveTeams(JSON.parse(readFileSync(path.join(BENCH, 'teams.json'), 'utf8')).teams)
  const byId = Object.fromEntries(teams.map((t) => [t.id, t]))
  const jevIds = teams.filter((t) => t.decisionGate).map((t) => t.id)
  check('teams: every team has a decision-gate twin that differs only by the gate', teams.filter((t) => !t.decisionGate).every((t) => {
    const twin = byId[`${t.id}-jev`]
    if (!twin) return false
    const strip = (x) => JSON.stringify({ ...x, id: null, label: null, extends: null, decisionGate: null })
    return strip(twin) === strip(t)
  }), jevIds.join(','))

  const g = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' })
  const repo = copyFixture()
  g(repo, 'init', '-q', '-b', 'main'); g(repo, 'config', 'user.email', 'b@e'); g(repo, 'config', 'user.name', 'b'); g(repo, 'add', '-A'); g(repo, 'commit', '-q', '-m', 'base')
  cpSync(path.join(BENCH, 'tasks', 'bugfix-trio', 'reference'), repo, { recursive: true })
  const scripts = mkdtempSync(path.join(os.tmpdir(), 'bench-probe-'))
  for (const f of ['decision-gate.mjs', 'gate-rules.mjs']) cpSync(path.join(path.dirname(BENCH), 'plugins', 'harness', 'scripts', f), path.join(scripts, f))
  cpSync(path.join(BENCH, 'lib', 'gate-probe.mjs'), path.join(scripts, 'bench-gate-probe.mjs'))
  const home = mkdtempSync(path.join(os.tmpdir(), 'bench-probe-home-'))
  mkdirSync(path.join(home, 'projects', 'p'), { recursive: true })
  const t0 = new Date(Date.now() - 60_000).toISOString()
  const transcript = path.join(home, 'projects', 'p', 'sess.jsonl')
  const rows = [
    { type: 'user', timestamp: t0, message: { role: 'user', content: 'Fix these three bug reports.' } },
    { type: 'assistant', timestamp: t0, message: { id: 'm1', model: 'claude-opus-5-5', usage: { input_tokens: 1000, output_tokens: 100 }, content: [{ type: 'tool_use', name: 'Edit', input: { file_path: `${repo}/src/discount.js` } }] } },
    { type: 'assistant', timestamp: t0, message: { id: 'm2', model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: 'All three bugs are fixed.' }] } },
  ]
  writeFileSync(transcript, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  const mock = await startMockDecisionServer({ mode: 'block' })
  const gateLog = path.join(home, 'gate.jsonl')
  const snaps = path.join(home, 'gate-snapshots.jsonl')
  const env = { ...process.env, TYPESAFE_API_KEY: 'bench-mock', TYPESAFE_BASE_URL: mock.url, HARNESS_DECISION_PROVIDER: 'typesafe', HARNESS_GATE_LOG: gateLog, HARNESS_GATE_LOG_TEXT: '1', BENCH_GATE_SNAPSHOTS: snaps }
  const probe = (input) => new Promise((resolve) => {
    const c = spawn(process.execPath, [path.join(scripts, 'bench-gate-probe.mjs')], { env })
    let out = ''
    c.stdout.on('data', (d) => (out += d))
    c.on('close', (status) => resolve({ status, out }))
    c.stdin.end(JSON.stringify(input))
  })
  const stopIn = { hook_event_name: 'Stop', stop_hook_active: false, cwd: repo, transcript_path: transcript, last_assistant_message: 'All three bugs are fixed.' }
  const r1 = await probe(stopIn)
  const s1 = readJsonl(snaps)
  check('probe: passes the gate\'s block through and commits the work tree at the block', r1.status === 0 && /"decision":"block"/.test(r1.out) && s1.length === 1 && s1[0].blocked && /^[0-9a-f]{40}$/.test(s1[0].commit || ''), JSON.stringify(s1[0] || r1.out.slice(0, 80)))
  check('probe: the snapshot leaves HEAD, the index and the work tree alone', g(repo, 'rev-list', '--count', 'HEAD').stdout.trim() === '1' && g(repo, 'diff', '--cached', '--name-only').stdout.trim() === '' && g(repo, 'status', '--porcelain').stdout.includes('src/'))
  const r2 = await probe({ ...stopIn, stop_hook_active: true })
  check('probe: a stop that continues from the block is allowed and logged without a snapshot', r2.out === '' && readJsonl(snaps).length === 2 && !readJsonl(snaps)[1].commit)
  await mock.close()

  // After the block the run breaks the fix, so the final tree fails while the tree at the block passes.
  cpSync(FIXTURE + '/src', path.join(repo, 'src'), { recursive: true })
  const task = tasks.find((t) => t.id === 'bugfix-trio')
  const taskDir = path.join(BENCH, 'tasks', 'bugfix-trio')
  const finalScore = scoreCodeTask(repo, task, taskDir)
  const later = new Date(Date.now() + 1000).toISOString()
  const turns = [{ turn: 1, startedAt: t0, endedAt: later }]
  const eff = gateEffect({ gateLog, gateSnapshots: snaps, configDir: home, repo, task, taskDir, turns, finalScore, backend: 'mock' })
  check('gate effect: one stop blocked, scored from the tree at the block, not the final tree', eff.blocks === 1 && eff.calls === 1 && eff.counterfactual.applicable && eff.counterfactual.withoutGate.success === true && eff.counterfactual.withGate.success === false, JSON.stringify(eff.counterfactual))
  check('gate effect: the block records the gate\'s reasons and the message it judged', eff.events[0].reasons && eff.events[0].reasons.length >= 1 && /bugs are fixed/.test(eff.events[0].message), JSON.stringify(eff.events[0]).slice(0, 400))
  check('gate effect: the window after a block ends at the next stop, not at the end of the turn', Math.abs(eff.events[0].afterSec - (Date.parse(readJsonl(snaps)[1].ts) - Date.parse(s1[0].ts)) / 1000) < 0.01, `${eff.events[0].afterSec}s`)
  // A workflow launched before the block and still running at it: without the gate the run would have
  // continued when it reported back, so the block is not the last stop.
  const tb = Date.parse(s1[0].ts)
  const wf = { type: 'assistant', timestamp: t0, message: { id: 'm0', model: 'claude-opus-5-5', usage: { input_tokens: 5, output_tokens: 5 }, content: [{ type: 'tool_use', id: 'toolu_wf', name: 'Workflow', input: { name: 'harness:ship' } }] } }
  const done = (at) => ({ type: 'user', timestamp: new Date(at).toISOString(), origin: { kind: 'task-notification' }, message: { role: 'user', content: '<task-notification><task-id>w</task-id><tool-use-id>toolu_wf</tool-use-id></task-notification>' } })
  writeFileSync(transcript, [rows[0], wf, done(tb + 10), ...rows.slice(1)].map((r) => JSON.stringify(r)).join('\n') + '\n')
  const eff2 = gateEffect({ gateLog, gateSnapshots: snaps, configDir: home, repo, task, taskDir, turns, finalScore, backend: 'mock' })
  check('gate effect: a block while a workflow it launched is still running is not the run\'s last stop', eff2.counterfactual.applicable === false && eff2.events[0].terminal === false && eff2.events[0].pendingBackground[0] === 'Workflow', JSON.stringify(eff2.events[0].pendingBackground))
  writeFileSync(transcript, [rows[0], wf, done(tb - 10), ...rows.slice(1)].map((r) => JSON.stringify(r)).join('\n') + '\n')
  const eff3 = gateEffect({ gateLog, gateSnapshots: snaps, configDir: home, repo, task, taskDir, turns, finalScore, backend: 'mock' })
  check('gate effect: a block after the workflow reported back is the last stop', eff3.counterfactual.applicable === true && eff3.events[0].terminal === true)
  // An agent that was already running when the gate blocked is not charged to the block.
  mkdirSync(path.join(home, 'projects', 'p', 'sess', 'subagents'), { recursive: true })
  const agentRow = (at, id) => ({ type: 'assistant', timestamp: new Date(at).toISOString(), message: { id, model: 'claude-opus-5-5', usage: { input_tokens: 1_000_000, output_tokens: 0 }, content: [] } })
  writeFileSync(path.join(home, 'projects', 'p', 'sess', 'subagents', 'agent-old.jsonl'), [agentRow(tb - 5000, 'a1'), agentRow(tb + 2, 'a2')].map((r) => JSON.stringify(r)).join('\n') + '\n')
  const eff4 = gateEffect({ gateLog, gateSnapshots: snaps, configDir: home, repo, task, taskDir, turns, finalScore, backend: 'mock' })
  check('gate effect: work by an agent already running at the block is not charged to it', eff4.events[0].afterCostUSD < 1, `$${eff4.events[0].afterCostUSD}`)
  for (const d of [repo, scripts, home]) rmSync(d, { recursive: true, force: true })
}

console.log(failures ? `\n${failures} check(s) failed` : '\nselftest: all checks passed')
process.exit(failures ? 1 : 0)
