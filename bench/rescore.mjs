#!/usr/bin/env node
// Recomputes every result of a label from its preserved work directory, with the current scoring and
// collection code, without rerunning anything:
//   node bench/rescore.mjs <label>             rescore existing results
//   node bench/rescore.mjs <label> --recover   also rebuild results for runs that finished but whose
//                                              result was never written (the runner crashed after the run);
//                                              turn times come from progress.log
// Timing and the per-turn records are kept from the original result; score, contamination, success, cost
// and token figures are recomputed. Check results (which depend on in-run state such as the mock decision
// server's call log) are kept as they were.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { shipInternals, summarizeStreams, summarizeTranscripts, summarizeWorkflows } from './lib/collect.mjs'
import { scoreCodeTask, scoreFindingsTask } from './lib/score.mjs'
import { contamination, specDelivered } from './lib/evaluate.mjs'

const BENCH = path.dirname(fileURLToPath(import.meta.url))
const label = process.argv[2]
const recover = process.argv.includes('--recover')
if (!label) { console.error('usage: node bench/rescore.mjs <label>'); process.exit(1) }
const tasks = Object.fromEntries(JSON.parse(readFileSync(path.join(BENCH, 'tasks.json'), 'utf8')).tasks.map((t) => [t.id, t]))

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/^t\d+(\.invalid)?\.json$/.test(n)) out.push(p)
  }
  return out
}

const files = walk(path.join(BENCH, 'results', label))

if (recover) {
  const cfg = JSON.parse(readFileSync(path.join(BENCH, 'results', label, 'run-config.json'), 'utf8'))
  const teams = Object.fromEntries(cfg.teams.map((t) => [t.id, t]))
  const progress = readFileSync(path.join(BENCH, 'results', label, 'progress.log'), 'utf8').split('\n')
  const work = path.join('/tmp', 'harness-bench', label)
  for (const teamId of existsSync(work) ? readdirSync(work) : []) {
    if (!teams[teamId]) continue
    for (const taskId of readdirSync(path.join(work, teamId))) {
      for (const trialDir of readdirSync(path.join(work, teamId, taskId))) {
        const trial = Number(trialDir.slice(1))
        const out = path.join(BENCH, 'results', label, teamId, taskId, `${trialDir}.json`)
        if (existsSync(out) || existsSync(out.replace(/\.json$/, '.invalid.json'))) continue
        const dir = path.join(work, teamId, taskId, trialDir)
        const raw = path.join(dir, 'raw')
        if (!existsSync(raw)) continue
        // Turn start times from "turn i/n started", the end of the last turn from the crash or done line.
        const tag = `${teamId} ${taskId} ${trialDir}`
        const starts = progress.filter((l) => l.includes(`${tag}: turn `) && l.includes('started')).map((l) => Date.parse(l.slice(0, 24)))
        const endLine = progress.find((l) => (l.includes(`crash ${tag}`) || l.includes(`done  ${tag}`)))
        if (!starts.length || !endLine) { console.log(`skip ${tag}: no start or end in progress.log (still running?)`); continue }
        const end = Date.parse(endLine.slice(0, 24))
        const turns = starts.map((t, i) => ({ turn: i + 1, exitCode: 0, signal: null, timedOut: false, wallSec: ((starts[i + 1] || end) - t) / 1000 }))
        const streamFiles = readdirSync(raw).filter((f) => f.endsWith('.stream.jsonl')).sort().map((f) => path.join(raw, f))
        let sessionId = null
        for (const f of streamFiles) for (const l of readFileSync(f, 'utf8').split('\n')) { if (!sessionId && l.includes('"session_id"')) { try { sessionId = JSON.parse(l).session_id } catch {} } }
        const skeleton = { benchVersion: cfg.benchVersion, label, team: teamId, teamKind: teams[teamId].kind, task: taskId, taskKind: (tasks[taskId] || {}).kind, trial, sessionId, startedAt: new Date(starts[0]).toISOString(), finishedAt: new Date(end).toISOString(), wallSec: turns.reduce((a, t) => a + t.wallSec, 0), timedOut: false, turns, workDir: dir, recovered: 'rebuilt from the work directory after the runner crashed while collecting this run; turn times from progress.log' }
        writeFileSync(out, JSON.stringify(skeleton, null, 2))
        files.push(out)
        console.log(`recovered ${tag}`)
      }
    }
  }
}

for (const file of files) {
  const r = JSON.parse(readFileSync(file, 'utf8'))
  const task = tasks[r.task]
  const dir = r.workDir
  if (!task || !dir || !existsSync(dir)) { console.log(`skip ${path.relative(BENCH, file)}: work dir gone`); continue }
  const work = path.dirname(path.dirname(path.dirname(dir)))
  const raw = path.join(dir, 'raw')
  const streamFiles = readdirSync(raw).filter((f) => f.endsWith('.stream.jsonl')).sort().map((f) => path.join(raw, f))
  const streams = summarizeStreams(streamFiles)
  const transcripts = summarizeTranscripts(path.join(dir, 'home'), r.sessionId)
  const workflows = summarizeWorkflows(path.join(dir, 'home'))
  const taskDir = path.join(BENCH, 'tasks', task.id)
  const repo = path.join(dir, 'repo')
  let score = r.score
  if (task.kind === 'code') score = scoreCodeTask(repo, task, taskDir)
  else if (task.kind === 'findings') score = scoreFindingsTask(repo, task, taskDir)
  const contam = contamination(path.join(dir, 'home'), dir, work)
  const transcriptCost = Object.values(transcripts.byModel).reduce((a, m) => a + m.costUSD, 0)
  const incomplete = streams.turns.some((t) => t.results === 0) || (r.turns || []).some((t) => t.timedOut || t.signal || t.skipped)
  const before = { success: r.success, costUSD: r.costUSD || 0, contamination: r.contamination }
  Object.assign(r, {
    score,
    contamination: contam,
    success: task.kind === 'check' ? r.success : !!(score && score.success) && contam.length === 0,
    costUSD: incomplete ? Math.max(streams.costUSD, transcriptCost) : streams.costUSD,
    costSource: incomplete ? 'transcripts-estimate (lower bound)' : 'claude-code',
    costUSDFromStream: streams.costUSD,
    costUSDFromTranscripts: transcriptCost,
    modelUsage: streams.modelUsage,
    tokensByModel: transcripts.byModel,
    byRole: transcripts.byRole,
    agentCount: transcripts.agents.filter((a) => a.role !== 'main').length,
    workflows,
    ship: shipInternals(workflows, transcripts),
    specDelivered: specDelivered(workflows, existsSync(path.join(taskDir, 'spec.md')) ? readFileSync(path.join(taskDir, 'spec.md'), 'utf8') : ''),
    hooks: streams.hooks,
    stopBlocks: streams.stopBlocks,
    toolUses: streams.toolUses,
    agentSpawns: streams.agentSpawns,
    workflowCalls: streams.workflowCalls,
    testCommands: streams.testCommands.length,
    permissionDenials: streams.permissionDenials,
    errors: streams.errors,
    apiErrors: transcripts.agents.reduce((a, x) => a + (x.apiErrors || 0), 0),
    apiErrorTexts: [...new Set(transcripts.agents.flatMap((a) => a.errorTexts || []))].slice(0, 5),
    usageWindows: streams.usageWindows,
    invalidReason: streams.rateLimited ? 'rate limited' : null,
    finalMessage: streams.finalMessage.slice(0, 4000),
    rescoredAt: new Date().toISOString(),
  })
  writeFileSync(file, JSON.stringify(r, null, 2))
  const changed = before.success !== r.success || Math.abs(before.costUSD - r.costUSD) > 0.005 || JSON.stringify(before.contamination) !== JSON.stringify(r.contamination)
  console.log(`${changed ? 'CHANGED' : 'same   '} ${r.team} ${r.task} t${r.trial}: success ${before.success} -> ${r.success}, cost $${before.costUSD.toFixed(2)} -> $${r.costUSD.toFixed(2)}${contam.length ? `, contamination ${contam.join(' ')}` : ''}`)
}
