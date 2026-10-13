// Scoring: hidden acceptance tests for code tasks, answer-key matching for review/audit tasks.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixture', 'usage-ledger')

export const BASELINE_VISIBLE_TESTS = 16

// Runs node --test and parses the TAP summary. files: null runs the project's own suite.
export function runNodeTests(cwd, files = null, timeoutMs = 180_000) {
  // --test-force-exit: a failing assertion before server.close() must not leave the run hanging.
  const args = ['--test', '--test-reporter=tap', '--test-force-exit', '--test-timeout=60000', ...(files || [])]
  const r = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: timeoutMs, env: { ...process.env, NODE_OPTIONS: '' }, maxBuffer: 64 * 1024 * 1024 })
  const out = `${r.stdout || ''}`
  const num = (name) => {
    const m = out.match(new RegExp(`^# ${name} (\\d+)`, 'm'))
    return m ? Number(m[1]) : 0
  }
  const failures = [...out.matchAll(/^\s*not ok \d+ - (.*)$/gm)].map((m) => m[1].trim())
  return { tests: num('tests'), pass: num('pass'), fail: num('fail'), cancelled: num('cancelled'), timedOut: r.error ? String(r.error.code || r.error.message) : null, exitCode: r.status, failures: [...new Set(failures)].slice(0, 40) }
}

export function scoreCodeTask(repo, task, taskDir) {
  const visible = runNodeTests(repo)
  const hiddenDir = path.join(repo, '.bench-hidden')
  mkdirSync(hiddenDir, { recursive: true })
  const hiddenFiles = []
  for (const f of readdirSync(path.join(taskDir, 'hidden'))) {
    cpSync(path.join(taskDir, 'hidden', f), path.join(hiddenDir, f))
    hiddenFiles.push(path.join('.bench-hidden', f))
  }
  const perFile = {}
  for (const f of hiddenFiles) perFile[path.basename(f)] = runNodeTests(repo, [f])
  const hidden = Object.values(perFile).reduce((a, r) => ({ tests: a.tests + r.tests, pass: a.pass + r.pass, fail: a.fail + r.fail + r.cancelled }), { tests: 0, pass: 0, fail: 0 })
  const visibleOk = visible.fail === 0 && visible.cancelled === 0 && visible.pass >= BASELINE_VISIBLE_TESTS && !visible.timedOut
  const hiddenOk = hidden.fail === 0 && hidden.pass > 0 && hidden.pass === hidden.tests
  const compliance = specCompliance(task.id, repo)
  return {
    success: visibleOk && hiddenOk,
    specComplete: compliance ? compliance.complete : null,
    compliance,
    visible,
    hidden,
    hiddenPerFile: Object.fromEntries(Object.entries(perFile).map(([k, r]) => [k, { pass: r.pass, fail: r.fail + r.cancelled, failures: r.failures }])),
    partial: Object.values(perFile).filter((r) => r.fail === 0 && r.cancelled === 0 && r.pass > 0).length / Math.max(1, hiddenFiles.length),
    notes: [
      ...(visible.pass < BASELINE_VISIBLE_TESTS ? [`visible suite has ${visible.pass} passing tests, fewer than the ${BASELINE_VISIBLE_TESTS} it started with`] : []),
    ],
  }
}

// ---- findings ----------------------------------------------------------------------------------
export function loadFindings(file) {
  if (!existsSync(file)) return { ok: false, error: `${path.basename(file)} not written`, findings: [] }
  let data
  try { data = JSON.parse(readFileSync(file, 'utf8')) } catch (e) { return { ok: false, error: `${path.basename(file)} is not valid JSON: ${e.message}`, findings: [] } }
  const list = Array.isArray(data) ? data : data.findings || data.issues || []
  if (!Array.isArray(list)) return { ok: false, error: 'no findings array', findings: [] }
  return { ok: true, findings: list.map(normalizeFinding) }
}

function normalizeFinding(f) {
  const loc = String(f.location || f.file || f.path || '')
  let file = loc
  let line = Number(f.line ?? f.start_line ?? f.lineNumber)
  const m = loc.match(/^(.*?):(\d+)/)
  if (m) { file = m[1]; if (!Number.isFinite(line)) line = Number(m[2]) }
  if (!Number.isFinite(line) && typeof f.line === 'string') {
    const lm = f.line.match(/(\d+)/)
    if (lm) line = Number(lm[1])
  }
  return {
    file: file.replace(/\\/g, '/').replace(/^.*?\b(src\/)/, '$1').replace(/^\.\//, ''),
    line: Number.isFinite(line) ? line : null,
    severity: String(f.severity || ''),
    text: `${f.title || ''} ${f.detail || f.description || f.summary || f.evidence || ''}`.toLowerCase(),
  }
}

// Each finding is assigned to at most one seeded defect: one in the same file whose lines are within
// `tolerance`, or whose keywords appear in the finding. Keyword hits beat line proximity.
export function matchFindings(findings, defects, tolerance = 3) {
  const found = new Map()
  const extras = []
  for (const f of findings) {
    let best = null
    for (const d of defects) {
      for (const loc of d.locations) {
        if (!f.file || path.basename(f.file) !== path.basename(loc.file)) continue
        if (f.file.includes('/') && loc.file.includes('/') && !f.file.endsWith(loc.file) && !loc.file.endsWith(f.file)) continue
        const dist = f.line == null ? Infinity : f.line < loc.lines[0] ? loc.lines[0] - f.line : f.line > loc.lines[1] ? f.line - loc.lines[1] : 0
        const kw = d.keywords.some((k) => f.text.includes(k.toLowerCase()))
        if (dist > tolerance && !kw) continue
        const score = (kw ? 10 : 0) + (dist <= tolerance ? 5 - Math.min(dist, 4) : 0)
        if (!best || score > best.score) best = { id: d.id, score }
      }
    }
    if (best) found.set(best.id, (found.get(best.id) || 0) + 1)
    else extras.push(f)
  }
  const ids = defects.map((d) => d.id)
  return {
    recall: ids.filter((id) => found.has(id)).length / ids.length,
    found: ids.filter((id) => found.has(id)),
    missed: ids.filter((id) => !found.has(id)),
    duplicates: [...found.values()].reduce((a, n) => a + n - 1, 0),
    extras: extras.length,
    extraTitles: extras.slice(0, 15).map((e) => `${e.file}:${e.line} ${e.text.slice(0, 100)}`),
    findings: findings.length,
  }
}

export function scoreFindingsTask(repo, task, taskDir) {
  const key = JSON.parse(readFileSync(path.join(taskDir, task.answerKey), 'utf8'))
  const loaded = loadFindings(path.join(repo, task.findingsFile))
  if (!loaded.ok) return { success: false, error: loaded.error, recall: 0, found: [], missed: key.defects.map((d) => d.id), extras: 0, findings: 0 }
  const m = matchFindings(loaded.findings, key.defects, task.tolerance || 3)
  return { success: m.recall === 1, ...m }
}

// ---- spec completeness --------------------------------------------------------------------------
// The hidden tests score whether the change works. These checks score the other things each spec asks
// for (tests, docs, a source comment), which otherwise make an incomplete solution look cheaper.
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const testFiles = (repo) => (existsSync(path.join(repo, 'test')) ? readdirSync(path.join(repo, 'test')).filter((f) => /\.(c|m)?js$/.test(f)) : [])

// Runs the agent's test/ directory against the untouched fixture: regression tests must fail there.
function testsAgainstBase(repo) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bench-regress-'))
  cpSync(FIXTURE, dir, { recursive: true })
  rmSync(path.join(dir, 'test'), { recursive: true, force: true })
  cpSync(path.join(repo, 'test'), path.join(dir, 'test'), { recursive: true })
  const r = runNodeTests(dir)
  rmSync(dir, { recursive: true, force: true })
  return r
}

export function specCompliance(taskId, repo) {
  const items = {}
  if (taskId === 'rate-limit') {
    items.testFile = existsSync(path.join(repo, 'test', 'rate-limit.test.js'))
    const readme = read(path.join(repo, 'README.md'))
    items.readmeDocumented = readme !== read(path.join(FIXTURE, 'README.md')) && /429|rate[ -]?limit/i.test(readme)
  } else if (taskId === 'bugfix-trio') {
    const base = testsAgainstBase(repo)
    items.regressionTestsFailOnBase = base.fail
    items.regressionTests = base.fail >= 3
  } else if (taskId === 'price-refresh') {
    const prices = read(path.join(repo, 'src', 'prices.js'))
    items.sourceUrl = /https?:\/\/[^\s'"]*(anthropic\.com|claude\.com)/i.test(prices)
    items.lastUpdatedChanged = /last updated/i.test(prices) && !/last updated:?\s*2026-07-01/i.test(prices)
    items.testForNewModels = testFiles(repo).some((f) => {
      const t = read(path.join(repo, 'test', f))
      return t.includes('claude-haiku-5-5') && t.includes('claude-sonnet-5-5') && t.includes('claude-opus-5-5')
    })
  } else return null
  const complete = Object.entries(items).filter(([, v]) => typeof v === 'boolean').every(([, v]) => v)
  return { complete, items }
}
