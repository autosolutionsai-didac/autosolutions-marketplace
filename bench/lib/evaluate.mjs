// Shared by run.mjs and rescore.mjs: judgements about a finished run that do not depend on the run's
// in-memory state, so they can be recomputed from its work directory later.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// Flags a run whose transcripts mention the benchmark's own files (answer keys, hidden tests, reference
// solutions) or another run's directory. Such a run is reported as invalid, not as a success. A match that
// is a prefix of the run's own directory (a path cut short in a transcript) is the run itself.
export function contamination(configDir, runDir, work) {
  const hits = new Set()
  const esc = (p) => p.replace(/[.]/g, '\\.')
  // POSIX ERE has no \\s inside brackets: [:space:] it is.
  const r = spawnSync('grep', ['-rhoE', `(${esc(REPO_ROOT)}/bench[^"'\\\\[:space:]]*|\\.bench-hidden|${esc(work)}/[^"'\\\\[:space:]]+)`, path.join(configDir, 'projects')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  for (const raw of (r.stdout || '').split('\n').filter(Boolean)) {
    const m = raw.replace(/[\\),.;:]+$/, '')
    if (m.startsWith(runDir) || runDir.startsWith(m)) continue
    if (m.startsWith(path.join(work, 'plugin-snapshot'))) continue
    // Only another run's directory counts: <work>/<team>/<task>/t<n>
    if (m.startsWith(work) && !/^[^/]+\/[^/]+\/t\d+/.test(m.slice(work.length + 1))) continue
    // Runs share the machine's process table, so a `ps` listing shows the other runs' shells, which source
    // their Claude Code shell snapshot. Those files hold shell setup only, nothing from a task.
    if (m.startsWith(work) && /^[^/]+\/[^/]+\/t\d+\/home\/shell-snapshots\//.test(m.slice(work.length + 1))) continue
    hits.add(m.slice(0, 200))
  }
  return [...hits].slice(0, 20)
}

// Workflow args as the workflow scripts read them: an object, the JSON text, or that text JSON-encoded again.
export function unwrapArgs(a) {
  for (let i = 0; i < 3 && typeof a === 'string'; i++) {
    const t = a.trim()
    if (!t.startsWith('{') && !t.startsWith('"')) break
    try { a = JSON.parse(t) } catch { break }
  }
  return a
}

// The ship workflow gets its task from the main model, which retypes the slash command's argument. Check
// that the spec arrived whole, so the harness worked from the same text as the native team.
export function specDelivered(workflows, spec) {
  const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim()
  const ships = workflows.filter((w) => w.name === 'ship')
  if (!ships.length || !spec) return null
  return ships.every((w) => {
    const a = unwrapArgs(w.args)
    return norm(a && typeof a === 'object' ? a.task : a) === norm(spec)
  })
}

// Did the workflows run the team's models? Checked against what actually ran: the model of every agent in
// each stage the team set a model for (ship: buildModel -> Build, ...). A run whose options were lost on the
// way into the workflow falls back to the defaults and measured a different team. null: nothing to check.
const STAGE_MODEL = {
  ship: { planModel: 'Plan', buildModel: 'Build', fixModel: 'Fix', refuteModel: 'Refute', gateModel: 'Gate' },
  review: { scopeModel: 'Scope', findModel: 'Find', verifyModel: 'Verify', rankModel: 'Rank' },
  audit: { scopeModel: 'Scope', findModel: 'Find', verifyModel: 'Verify', rankModel: 'Rank' },
}
const sameModel = (a, b) => {
  const n = (m) => String(m || '').replace(/\[.*\]$/, '').replace(/^fable$/, 'claude-fable-5-1')
  return n(a) === n(b)
}
export function optionsDelivered(workflows, agents, team) {
  const want = { ship: team.shipArgs, review: team.reviewArgs, audit: team.auditArgs }
  let checked = 0
  for (const kind of new Set(workflows.map((w) => w.name))) {
    for (const [key, stage] of Object.entries(STAGE_MODEL[kind] || {})) {
      const expected = want[kind] && want[kind][key]
      if (!expected) continue
      const inStage = agents.filter((a) => a.role === `workflow:${stage}` || a.role.endsWith(`(${stage})`))
      if (!inStage.length) continue
      checked++
      if (!inStage.every((a) => sameModel(a.model, expected))) return false
    }
  }
  return checked ? true : null
}
