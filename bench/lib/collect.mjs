// Turns the raw output of one benchmark run (stream-json from each turn, the transcripts Claude Code
// wrote under CLAUDE_CONFIG_DIR, and the persisted workflow records) into metrics.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JEV_INPUT_PER_MTOK, canonicalModel, requestCost } from './prices.mjs'
import { scoreCodeTask, scoreFindingsTask } from './score.mjs'

export function readJsonl(file) {
  if (!existsSync(file)) return []
  const out = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line)) } catch { /* partial line from a killed process */ }
  }
  return out
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const TEST_CMD = /\b(node\s+--test|npm\s+(run\s+)?test|npx\s+(vitest|jest|mocha)|pnpm\s+(run\s+)?test|yarn\s+(run\s+)?test)\b/

// ---- stream-json (one file per turn) -------------------------------------------------------------
export function summarizeStreams(streamFiles) {
  const s = {
    turns: [],
    costUSD: 0,
    modelUsage: {},
    hooks: {},
    stopBlocks: [],
    toolUses: {},
    agentSpawns: [],
    workflowCalls: [],
    workflowTasks: [],
    testCommands: [],
    permissionDenials: 0,
    finalMessage: '',
    errors: [],
    rateLimited: false,
    usageWindows: null,
  }
  for (const file of streamFiles) {
    const rows = readJsonl(file)
    const results = rows.filter((r) => r.type === 'result')
    const last = results[results.length - 1]
    // total_cost_usd and modelUsage are cumulative for the session: a turn started with --resume reports
    // the earlier turns' spend too. The session total is therefore the largest value seen, not a sum.
    const turn = { file: path.basename(file), results: results.length, isError: last ? !!last.is_error : true, subtype: last && last.subtype, terminalReason: last && last.terminal_reason, numTurns: last && last.num_turns, cumulativeCostUSD: last ? last.total_cost_usd || 0 : 0 }
    turn.costUSD = Math.max(0, turn.cumulativeCostUSD - s.costUSD)
    s.turns.push(turn)
    if (!last) s.errors.push(`${path.basename(file)}: no result event (killed or crashed)`)
    else if (last.is_error) s.errors.push(`${path.basename(file)}: ${last.subtype} ${last.terminal_reason || ''} ${(last.result || '').slice(0, 200)}`)
    if (last && (last.total_cost_usd || 0) >= s.costUSD) {
      s.costUSD = last.total_cost_usd || 0
      s.modelUsage = {}
      for (const [model, u] of Object.entries(last.modelUsage || {})) {
        const id = canonicalModel(model)
        const acc = (s.modelUsage[id] ||= { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, thinkingTokens: 0, webSearchRequests: 0, costUSD: 0 })
        for (const k of Object.keys(acc)) acc[k] += u[k] || 0
      }
    }
    if (last) {
      if (typeof last.result === 'string') s.finalMessage = last.result
      s.permissionDenials += (last.permission_denials || []).length
    }
    for (const r of rows) {
      if (r.type === 'rate_limit_event' && r.rate_limit_info) {
        if (r.rate_limit_info.status && r.rate_limit_info.status !== 'allowed') s.rateLimited = true
        if (r.rate_limit_info.unifiedWindows) s.usageWindows = r.rate_limit_info.unifiedWindows
      }
      if (r.type === 'result' && (r.api_error_status === 429 || /usage limit|hit your limit|rate_limit_error/i.test(String(r.result || '')))) s.rateLimited = true
      if (r.type === 'system' && (r.subtype === 'hook_started' || r.subtype === 'hook_response')) {
        const key = `${r.hook_event || '?'}:${r.subtype === 'hook_started' ? 'started' : r.outcome || 'response'}`
        s.hooks[key] = (s.hooks[key] || 0) + 1
        if (r.subtype === 'hook_response' && r.hook_event === 'Stop') {
          const out = String(r.output || r.stdout || '')
          if (/"decision"\s*:\s*"block"/.test(out) || /"ok"\s*:\s*false/.test(out)) s.stopBlocks.push({ turn: path.basename(file), hook: r.hook_name, output: out.slice(0, 600) })
        }
      }
      if (r.type === 'system' && r.subtype === 'task_started' && r.task_type === 'local_workflow') s.workflowTasks.push({ name: r.workflow_name, taskId: r.task_id })
      if (r.type === 'assistant' && !r.parent_tool_use_id) {
        for (const b of (r.message && r.message.content) || []) {
          if (b.type !== 'tool_use') continue
          s.toolUses[b.name] = (s.toolUses[b.name] || 0) + 1
          const inp = b.input || {}
          if (b.name === 'Agent' || b.name === 'Task') s.agentSpawns.push(String(inp.subagent_type || 'general-purpose'))
          if (b.name === 'Workflow') s.workflowCalls.push({ name: inp.name || null, scriptPath: inp.scriptPath ? path.basename(inp.scriptPath) : null, args: typeof inp.args === 'string' ? inp.args.slice(0, 300) : inp.args ? JSON.stringify(inp.args).slice(0, 300) : null })
          if (b.name === 'Bash' && TEST_CMD.test(String(inp.command || ''))) s.testCommands.push({ turn: path.basename(file), command: String(inp.command).slice(0, 200) })
        }
      }
    }
  }
  return s
}

// ---- transcripts: every agent's own API calls, with its role and model ---------------------------
export function summarizeTranscripts(configDir, sessionId) {
  const files = walk(path.join(configDir, 'projects')).filter((f) => f.endsWith('.jsonl'))
  const agents = []
  const byRole = {}
  const byModel = {}
  const seen = new Set()
  for (const file of files) {
    const base = path.basename(file, '.jsonl')
    let role = 'main'
    let meta = {}
    if (base.startsWith('agent-')) {
      const metaFile = file.replace(/\.jsonl$/, '.meta.json')
      if (existsSync(metaFile)) { try { meta = JSON.parse(readFileSync(metaFile, 'utf8')) } catch {} }
      const t = meta.agentType || 'subagent'
      role = t === 'workflow-subagent' ? `workflow:${meta.workflowPhase || '?'}` : meta.workflowPhase ? `${t} (${meta.workflowPhase})` : t
    } else if (base === 'journal') continue
    else if (sessionId && base !== sessionId) role = `other:${base.slice(0, 8)}`
    // Several transcript lines share one API message id while it streams; keep the most complete one.
    const msgs = new Map()
    let apiErrors = 0
    const errorTexts = []
    for (const row of readJsonl(file)) {
      if (row.isApiErrorMessage || (row.type === 'assistant' && row.error)) {
        apiErrors++
        const text = row.message && Array.isArray(row.message.content) ? row.message.content.map((b) => b.text || '').join(' ') : ''
        if (text) errorTexts.push(text.slice(0, 160))
      }
      if (row.type !== 'assistant' || !row.message || !row.message.usage) continue
      const id = `${row.message.id || row.uuid}:${row.requestId || ''}`
      const prev = msgs.get(id)
      if (!prev || (row.message.usage.output_tokens || 0) >= (prev.usage.output_tokens || 0)) msgs.set(id, { model: row.message.model, usage: row.message.usage })
    }
    const wf = file.match(/[\\/]workflows[\\/](wf_[^\\/]+)[\\/]/)
    const agent = { file: path.relative(configDir, file), role, workflowRun: wf ? wf[1] : null, model: meta.model || null, description: (meta.description || '').slice(0, 120), requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUSD: 0, models: {}, apiErrors, errorTexts: errorTexts.slice(0, 3) }
    for (const [id, m] of msgs) {
      if (seen.has(id)) continue
      seen.add(id)
      const u = m.usage
      const model = canonicalModel(m.model)
      if (model === '<synthetic>') continue
      const cost = requestCost(model, u)
      agent.requests++
      agent.input += u.input_tokens || 0
      agent.output += u.output_tokens || 0
      agent.cacheRead += u.cache_read_input_tokens || 0
      agent.cacheWrite += u.cache_creation_input_tokens || 0
      agent.costUSD += cost
      agent.models[model] = (agent.models[model] || 0) + 1
      const r = (byRole[role] ||= { agents: 0, requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUSD: 0, models: {} })
      r.requests++
      r.input += u.input_tokens || 0
      r.output += u.output_tokens || 0
      r.cacheRead += u.cache_read_input_tokens || 0
      r.cacheWrite += u.cache_creation_input_tokens || 0
      r.costUSD += cost
      r.models[model] = (r.models[model] || 0) + 1
      const bm = (byModel[model] ||= { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUSD: 0 })
      bm.requests++
      bm.input += u.input_tokens || 0
      bm.output += u.output_tokens || 0
      bm.cacheRead += u.cache_read_input_tokens || 0
      bm.cacheWrite += u.cache_creation_input_tokens || 0
      bm.costUSD += cost
    }
    if (agent.requests || agent.apiErrors) {
      agents.push(agent)
      byRole[role] ||= { agents: 0, requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUSD: 0, models: {} }
      byRole[role].agents++
    }
  }
  return { agents, byRole, byModel }
}

// ---- persisted workflow records ------------------------------------------------------------------
export function summarizeWorkflows(configDir) {
  const files = walk(path.join(configDir, 'projects')).filter((f) => /[\\/]workflows[\\/]wf_[^\\/]+\.json$/.test(f))
  return files.map((f) => {
    let d = {}
    try { d = JSON.parse(readFileSync(f, 'utf8')) } catch { return { file: f, unreadable: true } }
    const r = d.result || {}
    const out = { runId: d.runId, name: d.workflowName, status: d.status, durationMs: d.durationMs, agentCount: d.agentCount, totalTokens: d.totalTokens, totalToolCalls: d.totalToolCalls, args: d.args, logs: (d.logs || []).slice(0, 20) }
    if (d.workflowName === 'ship') {
      out.ship = {
        verdict: r.verdict || null,
        gate: r.gate ? { verdict: r.gate.verdict, confidence: r.gate.confidence, blocking: r.gate.blocking, summary: r.gate.summary } : null,
        integration: r.integration ? { merged: r.integration.merged, skipped: r.integration.skipped, conflicts: r.integration.conflicts, checks: r.integration.checks } : null,
        units: (r.units || []).map((u) => ({ id: u.id, title: u.title, status: u.status, refuted_by: u.refuted_by, findings: (u.findings || []).length })),
      }
    } else if (d.workflowName === 'review' || d.workflowName === 'audit') {
      out.findings = { verdict: r.verdict || null, issues: Array.isArray(r.issues) ? r.issues.length : null, files: r.files_reviewed ?? r.files_scanned ?? null }
    }
    return out
  })
}

export function shipInternals(workflows, transcripts) {
  const ship = workflows.filter((w) => w.name === 'ship' && w.ship)
  if (!ship.length) return null
  const last = ship[ship.length - 1]
  const units = last.ship.units
  // Fix agents of the last ship run only; ship.js labels them "<unit id> fix".
  const fixUnits = new Set(transcripts.agents.filter((a) => /\(Fix\)/.test(a.role) && (!last.runId || a.workflowRun === last.runId)).map((a) => (a.description.match(/^(\S+) fix/) || [])[1] || a.file))
  const fixAgents = fixUnits.size
  const firstPassRefuted = fixAgents
  return {
    runs: ship.length,
    verdict: last.ship.verdict,
    gateVerdict: last.ship.gate && last.ship.gate.verdict,
    units: units.length,
    unitsPassed: units.filter((u) => u.status === 'passed').length,
    unitsFailed: units.filter((u) => u.status !== 'passed').length,
    fixRounds: fixAgents,
    unitStatuses: units.map((u) => `${u.id}:${u.status}:${u.refuted_by}`),
    merged: last.ship.integration ? last.ship.integration.merged : null,
    integrationChecks: last.ship.integration ? last.ship.integration.checks : null,
    firstPassRefutedApprox: firstPassRefuted,
  }
}

// ---- the decision gate (Jev) -------------------------------------------------------------------------
// What the gate did in one run and what it changed. gate.jsonl is the gate's own log (one line per backend
// call); gate-snapshots.jsonl is gate-probe.mjs's (one line per Stop hook, with a commit of the work tree
// whenever the gate sent Claude back). For each block: the time and API cost Claude spent from the block
// until it stopped again, and, when the run's first block came at what would otherwise have been its last
// stop, the score of the work as it stood then: what the run would have delivered without the gate.
function transcriptRows(configDir) {
  return walk(path.join(configDir, 'projects')).filter((f) => f.endsWith('.jsonl') && path.basename(f) !== 'journal.jsonl').map((f) => {
    const rows = readJsonl(f)
    const first = rows.map((r) => Date.parse(r.timestamp)).find((t) => !Number.isNaN(t))
    return { file: f, main: !path.basename(f).startsWith('agent-'), rows, firstTs: first ?? null }
  })
}

// Background work the main session started (workflows always run in the background; agents and shell
// commands when asked), with when it started and when its <task-notification> reached the main session.
function backgroundTasks(mainFiles) {
  const tasks = []
  const rows = mainFiles.flatMap((f) => f.rows)
  for (const row of rows) {
    const c = row.type === 'assistant' && row.message && row.message.content
    if (!Array.isArray(c)) continue
    for (const b of c) {
      if (!b || b.type !== 'tool_use' || !b.id) continue
      const bg = b.name === 'Workflow' || (['Agent', 'Task', 'Bash'].includes(b.name) && b.input && b.input.run_in_background)
      if (bg) tasks.push({ id: b.id, name: b.name, started: Date.parse(row.timestamp), done: null })
    }
  }
  for (const t of tasks) {
    const tag = `<tool-use-id>${t.id}</tool-use-id>`
    const hit = rows.find((r) => r.type !== 'assistant' && Date.parse(r.timestamp) >= t.started && JSON.stringify(r).includes(tag))
    if (hit) t.done = Date.parse(hit.timestamp)
  }
  return tasks
}

function costBetween(files, from, to) {
  const msgs = new Map()
  // The main session, and agents that started inside the window: work already running when the gate blocked
  // (a workflow still building) would have happened without it.
  for (const { rows, main, firstTs } of files) {
    if (!main && !(firstTs != null && firstTs >= from)) continue
    for (const row of rows) {
      if (row.type !== 'assistant' || !row.message || !row.message.usage || !row.timestamp) continue
      const t = Date.parse(row.timestamp)
      if (t < from || t > to) continue
      const id = `${row.message.id || row.uuid}:${row.requestId || ''}`
      const prev = msgs.get(id)
      if (!prev || (row.message.usage.output_tokens || 0) >= (prev.usage.output_tokens || 0)) msgs.set(id, { model: row.message.model, usage: row.message.usage })
    }
  }
  let cost = 0
  for (const m of msgs.values()) if (canonicalModel(m.model) !== '<synthetic>') cost += requestCost(m.model, m.usage)
  return { costUSD: cost, requests: msgs.size }
}

function scoreCommit(repo, commit, task, taskDir) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bench-gate-snap-'))
  try {
    const archive = spawnSync('git', ['-C', repo, 'archive', '--format=tar', commit], { maxBuffer: 256 * 1024 * 1024 })
    if (archive.status !== 0) return { error: `git archive failed: ${String(archive.stderr).slice(0, 200)}` }
    const untar = spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout })
    if (untar.status !== 0) return { error: 'tar failed' }
    if (task.kind === 'code') return scoreCodeTask(dir, task, taskDir)
    if (task.kind === 'findings') return scoreFindingsTask(dir, task, taskDir)
    return null
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const brief = (s) => (s ? { success: !!s.success, hidden: s.hidden ? `${s.hidden.pass}/${s.hidden.tests}` : undefined, specComplete: s.specComplete, recall: s.recall, error: s.error } : null)

export function gateEffect({ gateLog, gateSnapshots, configDir, repo, task, taskDir, turns, finalScore, backend }) {
  const calls = readJsonl(gateLog)
  const stops = readJsonl(gateSnapshots)
  const files = transcriptRows(configDir)
  const bg = backgroundTasks(files.filter((f) => f.main))
  const turnOf = (t) => turns.find((x) => x.startedAt && Date.parse(x.startedAt) <= t && t <= Date.parse(x.endedAt) + 1000)
  const lastTurn = turns.filter((x) => x.startedAt).slice(-1)[0]
  const jevTokens = (c) => (c.usage && (c.usage.input_tokens ?? c.usage.prompt_tokens)) ?? (c.request_bytes ? Math.ceil(c.request_bytes / 4) : 0)
  const answered = calls.filter((c) => !c.error)
  const blockedCalls = answered.filter((c) => c.blocked)
  const events = []
  let bi = 0
  stops.forEach((s, i) => {
    const t = Date.parse(s.ts)
    const turn = turnOf(t)
    const ev = { ts: s.ts, turn: turn ? turn.turn : null, blocked: s.blocked, gateMs: s.gateMs }
    if (s.blocked) {
      const c = blockedCalls[bi++] || {}
      const turnEnd = turn ? Date.parse(turn.endedAt) : t
      // The block's effect runs until Claude stops again (the next Stop hook in this turn).
      const next = stops.slice(i + 1).map((x) => Date.parse(x.ts)).find((x) => x > t && x <= turnEnd)
      const end = next ?? turnEnd
      // Without the gate the run ends here only if no background work it had started was still running.
      const pending = bg.filter((b) => b.started < t && !(b.done != null && b.done <= t))
      const terminal = !!turn && pending.length === 0
      const after = costBetween(files, t, end)
      Object.assign(ev, { probs: c.probs, reasons: c.reasons, message: String(c.message || '').slice(0, 600), terminal, pendingBackground: pending.map((b) => b.name), finalTurn: !!turn && turn === lastTurn, afterSec: Math.max(0, (end - t) / 1000), afterCostUSD: after.costUSD, afterRequests: after.requests, commit: s.commit || null })
      if (ev.terminal && ev.finalTurn && s.commit) ev.scoreAtBlock = brief(scoreCommit(repo, s.commit, task, taskDir))
    }
    events.push(ev)
  })
  const blocks = events.filter((e) => e.blocked)
  let counterfactual
  if (!blocks.length) counterfactual = { applicable: true, note: 'the gate never sent Claude back, so the result is what the run delivers without it', withoutGate: brief(finalScore), withGate: brief(finalScore) }
  else if (blocks[0].scoreAtBlock) counterfactual = { applicable: true, note: 'scored from the work tree at the run\'s first block, which came at what would have been its last stop', withoutGate: blocks[0].scoreAtBlock, withGate: brief(finalScore) }
  else counterfactual = { applicable: false, note: 'the first block came before the run\'s last stop (an earlier turn, or while background work was still running), so what the run would have delivered without the gate cannot be reconstructed', withGate: brief(finalScore) }
  const tokens = calls.reduce((a, c) => a + jevTokens(c) + (c.primary ? jevTokens(c.primary) : 0), 0)
  const ms = answered.map((c) => c.ms).filter((x) => typeof x === 'number').sort((a, b) => a - b)
  return {
    backend,
    stops: stops.length,
    calls: answered.length,
    blocks: blocks.length,
    errors: calls.filter((c) => c.error || c.primary).length,
    errorTexts: [...new Set(calls.filter((c) => c.error || c.primary).map((c) => String(c.error || c.primary.error).slice(0, 160)))].slice(0, 3),
    msMedian: ms.length ? ms[Math.floor(ms.length / 2)] : null,
    msMax: ms.length ? ms[ms.length - 1] : null,
    jev: { inputTokens: tokens, costUSD: backend === 'mock' ? 0 : (tokens * JEV_INPUT_PER_MTOK) / 1e6, estimated: calls.some((c) => !(c.usage && (c.usage.input_tokens ?? c.usage.prompt_tokens) != null)) },
    extraSec: blocks.reduce((a, e) => a + (e.afterSec || 0), 0),
    extraCostUSD: blocks.reduce((a, e) => a + (e.afterCostUSD || 0), 0),
    counterfactual,
    events,
  }
}
