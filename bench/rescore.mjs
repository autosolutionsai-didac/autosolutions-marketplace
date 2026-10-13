#!/usr/bin/env node
// Recomputes every result of a label from its preserved work directory, with the current scoring and
// collection code, without rerunning anything:
//   node bench/rescore.mjs <label>
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

for (const file of walk(path.join(BENCH, 'results', label))) {
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
  const before = { success: r.success, costUSD: r.costUSD, contamination: r.contamination }
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
    rescoredAt: new Date().toISOString(),
  })
  writeFileSync(file, JSON.stringify(r, null, 2))
  const changed = before.success !== r.success || Math.abs(before.costUSD - r.costUSD) > 0.005 || JSON.stringify(before.contamination) !== JSON.stringify(r.contamination)
  console.log(`${changed ? 'CHANGED' : 'same   '} ${r.team} ${r.task} t${r.trial}: success ${before.success} -> ${r.success}, cost $${before.costUSD.toFixed(2)} -> $${r.costUSD.toFixed(2)}${contam.length ? `, contamination ${contam.join(' ')}` : ''}`)
}
