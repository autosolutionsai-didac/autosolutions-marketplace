#!/usr/bin/env node
// Benchmark-only wrapper around the harness decision gate (not part of the harness). It runs the gate
// unchanged, passes its answer through, and when the gate sends Claude back it records the work tree at
// that moment as an unreferenced git commit. The benchmark later scores that commit: it is what the run
// would have delivered had the gate let it stop. Copied next to decision-gate.mjs in the team's plugin
// snapshot; BENCH_GATE_SNAPSHOTS names the JSONL file it appends to.
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raw = (() => { try { return readFileSync(0, 'utf8') } catch { return '' } })()
const gate = path.join(path.dirname(fileURLToPath(import.meta.url)), 'decision-gate.mjs')
const started = Date.now()
const r = spawnSync(process.execPath, [gate], { input: raw, encoding: 'utf8', env: process.env, maxBuffer: 16 * 1024 * 1024 })
const gateMs = Date.now() - started
const out = r.stdout || ''
let blocked = false
try { blocked = JSON.parse(out).decision === 'block' } catch {}

const log = process.env.BENCH_GATE_SNAPSHOTS
if (log) {
  let input = {}
  try { input = JSON.parse(raw) } catch {}
  const entry = { ts: new Date(started).toISOString(), blocked, gateMs, exit: r.status, stopHookActive: !!input.stop_hook_active }
  // The hook's cwd follows the session's `cd`; the benchmark names the repository itself.
  const repoDir = process.env.BENCH_REPO || input.cwd
  if (blocked && repoDir) {
    // Runs in separate PID namespaces can share a pid, so the name must not rely on it.
    const index = path.join(tmpdir(), `bench-gate-index-${randomUUID()}`)
    const env = { ...process.env, GIT_INDEX_FILE: index, GIT_AUTHOR_NAME: 'bench', GIT_AUTHOR_EMAIL: 'bench@example.com', GIT_COMMITTER_NAME: 'bench', GIT_COMMITTER_EMAIL: 'bench@example.com' }
    const git = (...a) => spawnSync('git', ['-C', repoDir, ...a], { encoding: 'utf8', env, timeout: 10_000 })
    try {
      const head = git('rev-parse', 'HEAD').stdout.trim()
      git('read-tree', 'HEAD')
      // .claude holds the workflow worktrees: whole checkouts that are not part of the result.
      git('add', '-A', '--', ':(top)', ':(top,exclude).claude')
      const tree = git('write-tree').stdout.trim()
      const commit = tree ? git('commit-tree', tree, '-p', head, '-m', 'bench: work tree when the decision gate blocked').stdout.trim() : ''
      Object.assign(entry, { head, commit: commit || null })
    } catch (e) {
      entry.snapshotError = String(e && e.message)
    } finally {
      rmSync(index, { force: true })
    }
  }
  try { appendFileSync(log, JSON.stringify(entry) + '\n') } catch {}
}

process.stdout.write(out)
if (r.stderr) process.stderr.write(r.stderr)
process.exit(r.status == null ? 0 : r.status)
