#!/usr/bin/env node
// Harness benchmark runner.
//
//   node bench/run.mjs [--label NAME] [--teams a,b] [--tasks x,y] [--trials N] [--parallel N]
//                      [--budget-usd N] [--work DIR] [--dry-run] [--force]
//
// Every run gets a fresh copy of the fixture as its own git repository, a fresh CLAUDE_CONFIG_DIR
// (so no user settings, plugins, memory or transcripts leak in), and one headless `claude -p` per turn.
// Results go to bench/results/<label>/<team>/<task>/t<trial>.json; raw streams and transcripts stay in
// the work directory. Completed runs are skipped on a rerun unless --force, so an interrupted
// benchmark resumes where it stopped. `node bench/report.mjs <label>` builds the comparison.
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { childEnv } from './lib/env.mjs'
import { shipInternals, summarizeStreams, summarizeTranscripts, summarizeWorkflows } from './lib/collect.mjs'
import { scoreCodeTask, scoreFindingsTask } from './lib/score.mjs'
import { startMockDecisionServer } from './lib/mock-decision.mjs'
import { CHECKS } from './lib/checks.mjs'

const BENCH = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.dirname(BENCH)
const PLUGIN_DIR = path.join(REPO_ROOT, 'plugins', 'harness')
const FIXTURE = path.join(BENCH, 'fixture', 'usage-ledger')
export const BENCH_VERSION = 1

function parseArgs(argv) {
  const o = { label: null, teams: null, tasks: null, trials: 1, parallel: 3, budgetUsd: 60, work: null, dryRun: false, force: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--label') o.label = next()
    else if (a === '--teams') o.teams = next().split(',')
    else if (a === '--tasks') o.tasks = next().split(',')
    else if (a === '--trials') o.trials = Number(next())
    else if (a === '--parallel') o.parallel = Number(next())
    else if (a === '--budget-usd') o.budgetUsd = Number(next())
    else if (a === '--work') o.work = next()
    else if (a === '--dry-run') o.dryRun = true
    else if (a === '--force') o.force = true
    else throw new Error(`unknown argument ${a}`)
  }
  o.label ||= new Date().toISOString().slice(0, 10)
  o.work ||= path.join('/tmp', 'harness-bench', o.label)
  return o
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
  return r.stdout.trim()
}

function prepareRepo(task, repo) {
  rmSync(repo, { recursive: true, force: true })
  cpSync(FIXTURE, repo, { recursive: true })
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 'bench@example.com')
  git(repo, 'config', 'user.name', 'Bench')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'usage-ledger 0.3.0')
  if (task.setup && task.setup.branch) {
    git(repo, 'checkout', '-q', '-b', task.setup.branch)
    const from = path.join(BENCH, 'tasks', task.setup.from || task.id, task.setup.overlay)
    cpSync(from, repo, { recursive: true })
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', task.setup.commitMessage || 'Feature branch')
  }
  return git(repo, 'rev-parse', 'HEAD')
}

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`unknown template variable ${k}`)
    return vars[k]
  })
}

function turnsFor(team, task) {
  const taskDir = path.join(BENCH, 'tasks', task.id)
  const spec = existsSync(path.join(taskDir, 'spec.md')) ? readFileSync(path.join(taskDir, 'spec.md'), 'utf8').trim() : ''
  const findingsTurn = task.findingsFile ? fill(readFileSync(path.join(BENCH, 'tasks', 'findings-turn.md'), 'utf8').trim(), { what: task.findingsWhat, file: task.findingsFile }) : ''
  const shipArgs = JSON.stringify({ task: spec, ...(team.shipArgs || {}) })
  const templates = task.turns[team.kind] || task.turns.harness
  return templates.map((t) => fill(t, { spec, shipArgs, findingsTurn }))
}

function runClaude({ prompt, cwd, env, args, timeoutMs, streamFile, stderrFile }) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn('claude', ['-p', prompt, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    const out = []
    child.stdout.on('data', (d) => appendFileSync(streamFile, d))
    child.stderr.on('data', (d) => appendFileSync(stderrFile, d))
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try { process.kill(-child.pid, 'SIGTERM') } catch {}
      setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch {} }, 15_000)
    }, timeoutMs)
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ exitCode: code, signal, timedOut, wallSec: (Date.now() - started) / 1000, out })
    })
  })
}

function contamination(configDir) {
  const r = spawnSync('grep', ['-rlE', 'bench/tasks|\\.bench-hidden|hidden/[a-z0-9-]+\\.test\\.js', path.join(configDir, 'projects')], { encoding: 'utf8' })
  return (r.stdout || '').split('\n').filter(Boolean).map((f) => path.relative(configDir, f))
}

async function runJob(job, opts, log) {
  const { team, task, trial } = job
  const dir = path.join(opts.work, team.id, task.id, `t${trial}`)
  const repo = path.join(dir, 'repo')
  const configDir = path.join(dir, 'home')
  const raw = path.join(dir, 'raw')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(raw, { recursive: true })
  mkdirSync(configDir, { recursive: true })
  const baseSha = prepareRepo(task, repo)
  const turns = turnsFor(team, task)
  const sessionId = randomUUID()
  const mock = task.mockDecision ? await startMockDecisionServer() : null
  const extraEnv = { ...(team.env || {}), ...(task.env || {}) }
  if (mock) Object.assign(extraEnv, { TYPESAFE_API_KEY: 'bench-mock', TYPESAFE_BASE_URL: mock.url, HARNESS_DEBUG: '1' })
  const env = childEnv({ configDir, extra: extraEnv })
  const common = ['--model', team.model, '--effort', team.effort, '--output-format', 'stream-json', '--verbose', '--include-hook-events', '--permission-mode', 'bypassPermissions', '--max-budget-usd', String(opts.budgetUsd)]
  if (team.plugin) common.push('--plugin-dir', opts.pluginDir)
  if (team.settings) common.push('--settings', path.resolve(BENCH, team.settings))

  const startedAt = new Date().toISOString()
  const deadline = Date.now() + task.timeoutMin * 60_000
  const turnResults = []
  const streamFiles = []
  for (let i = 0; i < turns.length; i++) {
    const streamFile = path.join(raw, `turn-${i + 1}.stream.jsonl`)
    const stderrFile = path.join(raw, `turn-${i + 1}.stderr.txt`)
    writeFileSync(path.join(raw, `turn-${i + 1}.prompt.txt`), turns[i])
    streamFiles.push(streamFile)
    const remaining = deadline - Date.now()
    if (remaining <= 0) { turnResults.push({ turn: i + 1, skipped: 'task deadline passed' }); break }
    const args = [...common, ...(i === 0 ? ['--session-id', sessionId] : ['--resume', sessionId])]
    log(`  ${team.id} ${task.id} t${trial}: turn ${i + 1}/${turns.length} started`)
    const r = await runClaude({ prompt: turns[i], cwd: repo, env, args, timeoutMs: remaining, streamFile, stderrFile })
    turnResults.push({ turn: i + 1, exitCode: r.exitCode, signal: r.signal, timedOut: r.timedOut, wallSec: r.wallSec })
    if (r.timedOut) break
  }
  const finishedAt = new Date().toISOString()
  if (mock) await mock.close()

  const streams = summarizeStreams(streamFiles.filter((f) => existsSync(f)))
  const transcripts = summarizeTranscripts(configDir, sessionId)
  const workflows = summarizeWorkflows(configDir)
  const taskDir = path.join(BENCH, 'tasks', task.id)
  let score = null
  let check = null
  try {
    if (task.kind === 'code') score = scoreCodeTask(repo, task, taskDir)
    else if (task.kind === 'findings') score = scoreFindingsTask(repo, task, taskDir)
    else if (task.kind === 'check') check = CHECKS[task.check]({ repo, streams, transcripts, workflows, mock }, task)
  } catch (e) {
    score = { success: false, error: `scoring failed: ${e.message}` }
  }
  const diff = spawnSync('git', ['diff', baseSha, '--', '.', ':(exclude).bench-hidden'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout || ''
  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude).bench-hidden'], { cwd: repo, encoding: 'utf8' }).stdout.trim()
  const transcriptCost = Object.values(transcripts.byModel).reduce((a, m) => a + m.costUSD, 0)
  const wallSec = turnResults.reduce((a, t) => a + (t.wallSec || 0), 0)
  const result = {
    benchVersion: BENCH_VERSION,
    label: opts.label,
    team: team.id,
    teamKind: team.kind,
    task: task.id,
    taskKind: task.kind,
    trial,
    sessionId,
    startedAt,
    finishedAt,
    wallSec,
    timedOut: turnResults.some((t) => t.timedOut),
    turns: turnResults,
    success: task.kind === 'check' ? !!(check && check.pass) : !!(score && score.success),
    score,
    check,
    costUSD: streams.costUSD,
    costUSDFromTranscripts: transcriptCost,
    modelUsage: streams.modelUsage,
    tokensByModel: transcripts.byModel,
    byRole: transcripts.byRole,
    agentCount: transcripts.agents.filter((a) => a.role !== 'main').length,
    workflows,
    ship: shipInternals(workflows, transcripts),
    hooks: streams.hooks,
    stopBlocks: streams.stopBlocks,
    toolUses: streams.toolUses,
    agentSpawns: streams.agentSpawns,
    workflowCalls: streams.workflowCalls,
    testCommands: streams.testCommands.length,
    permissionDenials: streams.permissionDenials,
    errors: streams.errors,
    contamination: contamination(configDir),
    changedFiles: (spawnSync('git', ['diff', '--name-only', baseSha], { cwd: repo, encoding: 'utf8' }).stdout.trim() + '\n' + untracked).split('\n').filter(Boolean),
    finalMessage: streams.finalMessage.slice(0, 4000),
    workDir: dir,
  }
  const outDir = path.join(BENCH, 'results', opts.label, team.id, task.id)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path.join(outDir, `t${trial}.json`), JSON.stringify(result, null, 2))
  writeFileSync(path.join(outDir, `t${trial}.diff`), diff + (untracked ? `\n# untracked files\n${untracked}\n` : ''))
  return result
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const teams = readJson(path.join(BENCH, 'teams.json')).teams.filter((t) => !opts.teams || opts.teams.includes(t.id))
  const tasks = readJson(path.join(BENCH, 'tasks.json')).tasks.filter((t) => !opts.tasks || opts.tasks.includes(t.id))
  // Task-major order, so the teams run the same task at about the same time and see the same API conditions.
  const jobs = []
  for (let trial = 1; trial <= opts.trials; trial++) {
    for (const task of tasks) {
      for (const team of teams) {
        if (task.teams && !task.teams.includes(team.id)) continue
        if (!task.turns[team.kind] && !(team.kind === 'harness' && task.turns.harness)) continue
        jobs.push({ team, task, trial })
      }
    }
  }
  const resultsDir = path.join(BENCH, 'results', opts.label)
  mkdirSync(resultsDir, { recursive: true })
  mkdirSync(opts.work, { recursive: true })
  // Freeze the plugin as it is now, so edits made while a long benchmark runs cannot leak into later runs.
  opts.pluginDir = path.join(opts.work, 'plugin-snapshot', 'harness')
  if (!opts.dryRun) {
    rmSync(opts.pluginDir, { recursive: true, force: true })
    cpSync(PLUGIN_DIR, opts.pluginDir, { recursive: true })
  }
  const progress = path.join(resultsDir, 'progress.log')
  const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); appendFileSync(progress, line + '\n') }
  const pending = jobs.filter((j) => opts.force || !existsSync(path.join(resultsDir, j.team.id, j.task.id, `t${j.trial}.json`)))
  log(`bench ${opts.label}: ${jobs.length} runs planned, ${jobs.length - pending.length} already done, ${pending.length} to run, ${opts.parallel} at a time. Work dir ${opts.work}`)
  if (opts.dryRun) {
    for (const j of pending) console.log(`${j.team.id.padEnd(26)} ${j.task.id.padEnd(22)} t${j.trial}  turns: ${turnsFor(j.team, j.task).map((t) => JSON.stringify(t.slice(0, 90))).join(' | ')}`)
    return
  }
  writeFileSync(path.join(resultsDir, 'run-config.json'), JSON.stringify({ label: opts.label, benchVersion: BENCH_VERSION, startedAt: new Date().toISOString(), claudeVersion: spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout.trim(), gitSha: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim(), gitDirty: spawnSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim().length > 0, node: process.version, cpus: (await import('node:os')).cpus().length, teams, tasks: tasks.map((t) => t.id), trials: opts.trials, parallel: opts.parallel, budgetUsdPerTurn: opts.budgetUsd }, null, 2))
  let next = 0
  async function worker(w) {
    while (next < pending.length) {
      const job = pending[next++]
      log(`[w${w}] start ${job.team.id} ${job.task.id} t${job.trial}`)
      try {
        const r = await runJob(job, opts, log)
        log(`[w${w}] done  ${job.team.id} ${job.task.id} t${job.trial}: ${r.success ? 'SUCCESS' : 'FAIL'} in ${Math.round(r.wallSec)}s, $${r.costUSD.toFixed(2)}${r.errors.length ? `, errors: ${r.errors.join('; ').slice(0, 200)}` : ''}`)
      } catch (e) {
        log(`[w${w}] crash ${job.team.id} ${job.task.id} t${job.trial}: ${e.stack || e.message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opts.parallel) }, (_, i) => worker(i + 1)))
  log('all runs finished')
}

main().catch((e) => { console.error(e); process.exit(1) })
