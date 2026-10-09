#!/usr/bin/env node
// Stop hook: a cheap, fast "is this really done?" check using a decision model.
//
// Backends (first key found wins, or set HARNESS_DECISION_PROVIDER=typesafe|openrouter|openai):
//   - TypeSafe Jev      TYPESAFE_API_KEY   (or plugin option typesafe_api_key)   POST https://api.typesafe.ai/v1/systemone
//   - Jev via OpenRouter OPENROUTER_API_KEY                                     POST https://openrouter.ai/api/v1/systemone
//   - OpenAI Decisions  OPENAI_API_KEY     (or plugin option openai_api_key)     POST https://api.openai.com/v1/decisions
//
// Behaviour:
//   - Runs only on Stop, only once per turn (stop_hook_active guard), only when the turn changed files.
//   - Asks four yes/no questions about the final message plus hard evidence from the transcript
//     (which tools ran, which test commands ran). Code owns the thresholds; the model never writes text.
//   - Blocks the stop with a concrete reason when the assistant claims completion without verification,
//     leaves an unresolved problem, or hands the user a step it could have done itself.
//   - FAILS OPEN: any error, timeout, missing key or unparseable input lets the turn end normally.
//
// Env knobs: HARNESS_DECISION_GATE=off, HARNESS_GATE_THRESHOLD (default 0.7), HARNESS_DEBUG=1,
//            TYPESAFE_BASE_URL / OPENAI_BASE_URL overrides, HARNESS_JEV_MODEL (default jev-latest).

import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const DEBUG = process.env.HARNESS_DEBUG === '1'
const log = (...a) => { if (DEBUG) process.stderr.write(`[decision-gate] ${a.join(' ')}\n`) }
const allow = () => { process.exit(0) }

const TEST_CMD = /\b(pytest|jest|vitest|mocha|cargo\s+test|go\s+test|npm\s+(run\s+)?(test|lint|typecheck|check|build)|pnpm\s+(run\s+)?(test|lint|typecheck|check|build)|yarn\s+(run\s+)?(test|lint|typecheck|check|build)|bun\s+(run\s+)?(test|lint)|tsc\b|eslint|ruff|mypy|rspec|phpunit|gradle\s+test|mvn\s+test|dotnet\s+test|make\s+(test|check)|swift\s+test|flutter\s+test|playwright\s+test|cypress\s+run)/i
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

function readStdin() {
  try { return readFileSync(0, 'utf8') } catch { return '' }
}

// Ignores empty values and unresolved "${user_config.*}" placeholders.
function env(...names) {
  for (const n of names) {
    const v = process.env[n]
    if (typeof v === 'string' && v.trim() && !v.trim().startsWith('${')) return v.trim()
  }
  return ''
}

function pickProvider() {
  const forced = env('HARNESS_DECISION_PROVIDER').toLowerCase()
  const typesafeKey = env('TYPESAFE_API_KEY', 'CLAUDE_PLUGIN_OPTION_TYPESAFE_API_KEY')
  const openrouterKey = env('OPENROUTER_API_KEY')
  const openaiKey = env('OPENAI_API_KEY', 'CLAUDE_PLUGIN_OPTION_OPENAI_API_KEY')
  const table = {
    typesafe: typesafeKey && { name: 'typesafe', key: typesafeKey, url: (env('TYPESAFE_BASE_URL') || 'https://api.typesafe.ai') + '/v1/systemone', model: env('HARNESS_JEV_MODEL') || 'jev-latest' },
    openrouter: openrouterKey && { name: 'openrouter', key: openrouterKey, url: 'https://openrouter.ai/api/v1/systemone', model: env('HARNESS_JEV_MODEL') || 'typesafe/jev-latest' },
    openai: openaiKey && { name: 'openai', key: openaiKey, url: (env('OPENAI_BASE_URL') || 'https://api.openai.com') + '/v1/decisions', model: env('HARNESS_OPENAI_DECISION_MODEL') || 'gpt-6-luna' },
  }
  if (forced && table[forced]) return table[forced]
  return table.typesafe || table.openrouter || table.openai || null
}

// Walk the transcript backwards to the last real user prompt and collect what happened since.
function turnEvidence(transcriptPath) {
  const ev = { edits: 0, editedFiles: new Set(), bash: [], testCommands: [], subagents: [], parsed: false }
  try {
    if (!transcriptPath || !existsSync(transcriptPath)) return ev
    const lines = readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean)
    const turn = []
    for (let i = lines.length - 1; i >= 0; i--) {
      let row
      try { row = JSON.parse(lines[i]) } catch { continue }
      if (row.type === 'user') {
        const c = row.message && row.message.content
        const isPrompt = typeof c === 'string' || (Array.isArray(c) && c.some((b) => b && b.type === 'text') && !c.some((b) => b && b.type === 'tool_result'))
        if (isPrompt) break
      }
      turn.push(row)
    }
    for (const row of turn) {
      if (row.type !== 'assistant') continue
      const c = row.message && row.message.content
      if (!Array.isArray(c)) continue
      for (const b of c) {
        if (!b || b.type !== 'tool_use') continue
        const name = b.name || ''
        const inp = b.input || {}
        if (EDIT_TOOLS.has(name)) { ev.edits++; if (inp.file_path) ev.editedFiles.add(String(inp.file_path)) }
        if (name === 'Bash' && typeof inp.command === 'string') {
          ev.bash.push(inp.command)
          if (TEST_CMD.test(inp.command)) ev.testCommands.push(inp.command.slice(0, 160))
        }
        if (name === 'Agent' || name === 'Task') ev.subagents.push(String(inp.subagent_type || inp.description || 'agent').slice(0, 60))
      }
    }
    ev.parsed = true
  } catch (e) { log('transcript parse failed:', e.message) }
  return ev
}

function gitChanges(cwd) {
  try {
    const out = execFileSync('git', ['-C', cwd, 'status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] })
    const rows = out.split('\n').filter(Boolean)
    return { isRepo: true, count: rows.length, sample: rows.slice(0, 12).join('\n') }
  } catch { return { isRepo: false, count: 0, sample: '' } }
}

const QUESTIONS = {
  claims_done: 'The assistant\'s final message states or implies that the requested work is complete, finished, fixed, implemented or ready.',
  cites_verification: 'The final message reports concrete verification the assistant performed itself this turn: a test, build, lint or type-check command that was run with its result, or a behaviour it observed by running the code.',
  unresolved_problem: 'The final message mentions a failing test, an error, a crash, a TODO, a known bug or a part of the request that is still not done.',
  deferred_to_user: 'The final message asks or expects the user to run a test, check a result, verify behaviour, or complete a step that the assistant could have done itself.',
}

async function askJev(p, state) {
  const body = {
    model: p.model,
    state,
    questions: Object.fromEntries(Object.entries(QUESTIONS).map(([k, q]) => [k, { type: 'noul', instructions: q }])),
  }
  const res = await fetch(p.url, { method: 'POST', headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(9000) })
  if (!res.ok) throw new Error(`${p.name} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  const answers = json.answers || {}
  const out = {}
  for (const k of Object.keys(QUESTIONS)) {
    const a = answers[k]
    if (!a || typeof a.noul !== 'number') throw new Error(`${p.name}: missing answer ${k}`)
    out[k] = a.noul
  }
  return out
}

async function askOpenAI(p, state) {
  const body = {
    model: p.model,
    input: typeof state === 'string' ? state : JSON.stringify(state, null, 2),
    questions: Object.entries(QUESTIONS).map(([name, instructions]) => ({ type: 'predicate', name, instructions })),
  }
  const res = await fetch(p.url, { method: 'POST', headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(9000) })
  if (!res.ok) throw new Error(`openai HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  const out = {}
  for (const a of json.answers || []) {
    if (a && a.type === 'predicate' && typeof a.probability === 'number') out[a.name] = a.probability
  }
  for (const k of Object.keys(QUESTIONS)) if (typeof out[k] !== 'number') throw new Error(`openai: missing answer ${k}`)
  return out
}

async function main() {
  const raw = readStdin()
  if (!raw.trim()) return allow()
  let input
  try { input = JSON.parse(raw) } catch { return allow() }
  if (input.hook_event_name !== 'Stop') return allow()
  if (input.stop_hook_active) { log('already continuing from a stop hook, allowing'); return allow() }

  const mode = (env('CLAUDE_PLUGIN_OPTION_DECISION_GATE', 'HARNESS_DECISION_GATE') || 'auto').toLowerCase()
  if (mode === 'off') return allow()

  const provider = pickProvider()
  if (!provider) { log('no decision key configured, allowing'); return allow() }

  const cwd = input.cwd || process.cwd()
  const ev = turnEvidence(input.transcript_path)
  const git = gitChanges(cwd)
  const changedSomething = ev.edits > 0 || (!ev.parsed && git.count > 0)
  if (!changedSomething) { log('no edits this turn, allowing'); return allow() }

  const finalMessage = String(input.last_assistant_message || '').slice(0, 6000)
  if (!finalMessage.trim()) return allow()

  const state = {
    final_message: finalMessage,
    files_edited_this_turn: [...ev.editedFiles].slice(0, 30),
    edit_count_this_turn: ev.edits,
    test_or_check_commands_run_this_turn: ev.testCommands.slice(0, 15),
    subagents_used_this_turn: ev.subagents.slice(0, 10),
    git_status_sample: git.sample,
  }

  let p
  try {
    p = provider.name === 'openai' ? await askOpenAI(provider, state) : await askJev(provider, state)
  } catch (e) { log('decision call failed, allowing:', e.message); return allow() }
  log(`provider=${provider.name} probs=${JSON.stringify(p)} tests_run=${ev.testCommands.length}`)

  const T = Math.min(0.95, Math.max(0.5, Number(env('HARNESS_GATE_THRESHOLD')) || 0.7))
  const verified = ev.testCommands.length > 0 || p.cites_verification >= 0.5
  const reasons = []
  if (p.claims_done >= T && !verified) reasons.push(`you report the work as done but no test, build or check command ran this turn and the message cites no verification (p_done=${p.claims_done.toFixed(2)}, p_verified=${p.cites_verification.toFixed(2)})`)
  if (p.unresolved_problem >= T + 0.05) reasons.push(`the message still mentions an unresolved error, failing check or TODO (p=${p.unresolved_problem.toFixed(2)})`)
  if (p.deferred_to_user >= T + 0.05) reasons.push(`the message leaves verification or a step to the user that you can do yourself (p=${p.deferred_to_user.toFixed(2)})`)
  if (!reasons.length) return allow()

  const reason = `Decision gate (${provider.name}): ${reasons.join('; ')}. Before finishing: run the relevant tests or checks for the files you changed (${[...ev.editedFiles].slice(0, 6).join(', ') || 'see git status'}), fix anything that fails, resolve or explicitly scope out any open item, and end with a two-line verification summary (what you ran, what it showed). If no automated check exists, say so in one line and describe the manual check you performed.`
  process.stdout.write(JSON.stringify({ decision: 'block', reason }))
  process.exit(0)
}

main().catch((e) => { log('unexpected:', e && e.message); allow() })
