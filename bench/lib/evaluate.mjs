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

// The ship workflow gets its task from the main model, which retypes the slash command's argument. Check
// that the spec arrived whole, so the harness worked from the same text as the native team.
export function specDelivered(workflows, spec) {
  const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim()
  const ships = workflows.filter((w) => w.name === 'ship')
  if (!ships.length || !spec) return null
  return ships.every((w) => {
    let a = w.args
    if (typeof a === 'string') { try { a = JSON.parse(a) } catch { a = { task: a } } }
    return norm(a && a.task) === norm(spec)
  })
}
