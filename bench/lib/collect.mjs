// Turns the raw output of one benchmark run (stream-json from each turn, the transcripts Claude Code
// wrote under CLAUDE_CONFIG_DIR, and the persisted workflow records) into metrics.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { canonicalModel, requestCost } from './prices.mjs'

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
    for (const row of readJsonl(file)) {
      if (row.type !== 'assistant' || !row.message || !row.message.usage) continue
      const id = `${row.message.id || row.uuid}:${row.requestId || ''}`
      const prev = msgs.get(id)
      if (!prev || (row.message.usage.output_tokens || 0) >= (prev.usage.output_tokens || 0)) msgs.set(id, { model: row.message.model, usage: row.message.usage })
    }
    const agent = { file: path.relative(configDir, file), role, model: meta.model || null, description: (meta.description || '').slice(0, 120), requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUSD: 0, models: {} }
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
    if (agent.requests) {
      agents.push(agent)
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
    const out = { runId: d.runId, name: d.workflowName, status: d.status, durationMs: d.durationMs, agentCount: d.agentCount, totalTokens: d.totalTokens, totalToolCalls: d.totalToolCalls, args: typeof d.args === 'string' ? d.args.slice(0, 400) : d.args, logs: (d.logs || []).slice(0, 20) }
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
  const fixAgents = transcripts.agents.filter((a) => /\(Fix\)/.test(a.role)).length
  const firstPassRefuted = units.filter((u) => u.refuted_by && fixAgents && u.status !== 'build-failed').length
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
