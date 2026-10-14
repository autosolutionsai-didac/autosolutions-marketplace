#!/usr/bin/env node
// Stop hook: a cheap, fast "is this really done?" check using a decision model.
//
// Backends (HARNESS_DECISION_PROVIDER or the plugin option "Decision provider" picks one; "auto" takes the
// first paid key found, then a local server if HARNESS_LOCAL_URL is set):
//   - TypeSafe Jev      TYPESAFE_API_KEY   (or plugin option typesafe_api_key)   POST https://api.typesafe.ai/v1/systemone
//   - Jev via OpenRouter OPENROUTER_API_KEY                                     POST https://openrouter.ai/api/v1/systemone
//   - OpenAI Decisions  OPENAI_API_KEY     (or plugin option openai_api_key)     POST https://api.openai.com/v1/decisions
// Free backends, no paid key:
//   - local       any server that speaks the same System One API (llama.cpp llama-server, Ollama, Cloudflare Clef)
//                 with an open decision model such as Kev-0.8B. HARNESS_LOCAL_URL, optional HARNESS_LOCAL_MODEL/_API_KEY.
//   - claude-cli  `claude -p` on Haiku 5.5 through the login Claude Code already has (draws on plan usage). Opt-in.
//   - heuristic   no model: rules over the final message and the transcript evidence. Opt-in, or as a fallback.
// HARNESS_DECISION_FALLBACK=heuristic|claude-cli is tried once when the main backend fails.
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
//            TYPESAFE_BASE_URL / OPENAI_BASE_URL overrides, HARNESS_JEV_MODEL (default jev-latest),
//            HARNESS_GATE_LOG=<file.jsonl> to record every decision (for calibrating a free backend).

import { appendFileSync, readFileSync, existsSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'

const DEBUG = process.env.HARNESS_DEBUG === '1'
const log = (...a) => { if (DEBUG) process.stderr.write(`[decision-gate] ${a.join(' ')}\n`) }
const allow = () => { process.exit(0) }

const TEST_CMD = /\b(pytest|jest|vitest|mocha|node\s+(--[\w=-]+\s+)*--test\b|deno\s+test|python3?\s+-m\s+(unittest|pytest)|cargo\s+test|go\s+test|npm\s+(run\s+)?(test|lint|typecheck|check|build)|pnpm\s+(run\s+)?(test|lint|typecheck|check|build)|yarn\s+(run\s+)?(test|lint|typecheck|check|build)|bun\s+(run\s+)?(test|lint)|tsc\b|eslint|ruff|mypy|rspec|phpunit|gradle\s+test|mvn\s+test|dotnet\s+test|make\s+(test|check)|swift\s+test|flutter\s+test|playwright\s+test|cypress\s+run)/i
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
// Shell commands that can change files. Edits made this way, or by subagents and workflows, never show
// up as Edit/Write calls in the main transcript, so they count as changes when git sees a dirty tree.
const SHELL_WRITE = /(\bsed\s+(-\w*\s+)*-i|\bperl\s+-\w*i|\btee\b|[^<>&|2]>>?\s*[^\s&|>]|\bcat\s*<<|\b(mv|cp|rm|touch|mkdir|truncate|patch|install)\s|\bgit\s+(apply|am|checkout|restore|reset|stash|merge|rebase|cherry-pick|commit|mv|rm)\b|\b(python3?|node|ruby|perl|deno|bun)\s+(-c|-e|\S+\.(py|js|mjs|cjs|ts|rb|pl))\b|\b(npm|pnpm|yarn)\s+(install|add|remove|uninstall|update|run\s+(format|fix|lint:fix))|\bprettier\s+(--write|-w)|\beslint\b.*--fix|\bruff\s+(format|check\s+--fix))/

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

// A local or self-hosted System One endpoint: a base URL gets /v1/systemone appended; a URL that already
// names an endpoint (".../v1/systemone", or Cloudflare's ".../ai/run/@cf/...") is used as given.
function systemOneUrl(u) {
  const t = u.replace(/\/+$/, '')
  return /\/v1\/systemone$|\/ai\/run\//.test(t) ? t : `${t}/v1/systemone`
}

function providers() {
  const typesafeKey = env('TYPESAFE_API_KEY', 'CLAUDE_PLUGIN_OPTION_TYPESAFE_API_KEY')
  const openrouterKey = env('OPENROUTER_API_KEY')
  const openaiKey = env('OPENAI_API_KEY', 'CLAUDE_PLUGIN_OPTION_OPENAI_API_KEY')
  const localUrl = env('HARNESS_LOCAL_URL', 'CLAUDE_PLUGIN_OPTION_LOCAL_DECISION_URL')
  return {
    typesafe: typesafeKey && { name: 'typesafe', key: typesafeKey, url: (env('TYPESAFE_BASE_URL') || 'https://api.typesafe.ai') + '/v1/systemone', model: env('HARNESS_JEV_MODEL') || 'jev-latest' },
    openrouter: openrouterKey && { name: 'openrouter', key: openrouterKey, url: 'https://openrouter.ai/api/v1/systemone', model: env('HARNESS_JEV_MODEL') || 'typesafe/jev-latest' },
    openai: openaiKey && { name: 'openai', key: openaiKey, url: (env('OPENAI_BASE_URL') || 'https://api.openai.com') + '/v1/decisions', model: env('HARNESS_OPENAI_DECISION_MODEL') || 'gpt-6-luna' },
    local: localUrl && { name: 'local', base: localUrl.replace(/\/+$/, ''), url: systemOneUrl(localUrl), key: env('HARNESS_LOCAL_API_KEY'), model: env('HARNESS_LOCAL_MODEL') },
    'claude-cli': { name: 'claude-cli', model: env('HARNESS_CLAUDE_MODEL') || 'claude-haiku-5-5' },
    heuristic: { name: 'heuristic' },
  }
}

function pickProvider() {
  const forced = env('HARNESS_DECISION_PROVIDER', 'CLAUDE_PLUGIN_OPTION_DECISION_PROVIDER').toLowerCase()
  const table = providers()
  if (forced && forced !== 'auto') return table[forced] || null
  // claude-cli (plan usage) and heuristic (changes behaviour for people who set nothing up) are opt-in only.
  return table.typesafe || table.openrouter || table.openai || table.local || null
}

function pickFallback(primary) {
  const name = env('HARNESS_DECISION_FALLBACK').toLowerCase()
  if (!name || name === 'none' || !primary || name === primary.name) return null
  return providers()[name] || null
}

// A background workflow or agent reports back as a user row carrying a <task-notification>. That row is
// not a new request: the work it reports belongs to the turn that started it.
function isTaskNotification(row) {
  const c = row.message && row.message.content
  const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (b && b.type === 'text' ? b.text : '')).join('') : ''
  return (row.origin && row.origin.kind === 'task-notification') || /^\s*<task-notification>/.test(text)
}

// Walk the transcript backwards to the last real user prompt and collect what happened since.
function turnEvidence(transcriptPath) {
  const ev = { edits: 0, editedFiles: new Set(), bash: [], shellWrites: 0, testCommands: [], subagents: [], parsed: false, startedAt: null }
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
        if (isPrompt && !row.isMeta && !isTaskNotification(row)) { ev.startedAt = row.timestamp || null; break }
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
          if (SHELL_WRITE.test(inp.command)) ev.shellWrites++
        }
        if (name === 'Agent' || name === 'Task') ev.subagents.push(String(inp.subagent_type || inp.description || 'agent').slice(0, 60))
        if (name === 'Workflow') ev.subagents.push(`workflow:${String(inp.name || 'script').slice(0, 50)}`)
      }
    }
    ev.parsed = true
  } catch (e) { log('transcript parse failed:', e.message) }
  return ev
}

// Uncommitted changes, plus commits made since the turn started: a workflow that merges its work leaves a
// clean tree, so the commits are the only trace of what it changed.
function gitChanges(cwd, since) {
  let res = { isRepo: false, count: 0, sample: '', commits: 0, commitSample: '' }
  try {
    const out = execFileSync('git', ['-C', cwd, 'status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] })
    const rows = out.split('\n').filter(Boolean)
    res = { ...res, isRepo: true, count: rows.length, sample: rows.slice(0, 12).join('\n') }
  } catch { return res }
  if (since && !Number.isNaN(Date.parse(since))) {
    try {
      const out = execFileSync('git', ['-C', cwd, 'log', `--since=${since}`, '--format=%h %s', 'HEAD'], { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] })
      const rows = out.split('\n').filter(Boolean)
      res.commits = rows.length
      res.commitSample = rows.slice(0, 8).join('\n')
    } catch {}
  }
  return res
}

const QUESTIONS = {
  claims_done: 'The assistant\'s final message states or implies that the requested work is complete, finished, fixed, implemented or ready.',
  cites_verification: 'The final message reports concrete verification the assistant performed itself this turn: a test, build, lint or type-check command that was run with its result, or a behaviour it observed by running the code.',
  unresolved_problem: 'The final message mentions a failing test, an error, a crash, a TODO, a known bug or a part of the request that is still not done.',
  deferred_to_user: 'The final message asks or expects the user to run a test, check a result, verify behaviour, or complete a step that the assistant could have done itself.',
}

// What the last backend call reported about itself (token usage, request id), for the gate log.
let callMeta = {}

async function askJev(p, state) {
  const body = {
    model: p.model,
    state,
    questions: Object.fromEntries(Object.entries(QUESTIONS).map(([k, q]) => [k, { type: 'noul', instructions: q }])),
  }
  const res = await fetch(p.url, { method: 'POST', headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(9000) })
  if (!res.ok) throw new Error(`${p.name} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  callMeta = { model: json.model || p.model, usage: json.usage || null, request_id: res.headers.get('x-typesafe-request-id') || res.headers.get('x-request-id') || null, request_bytes: JSON.stringify(body).length }
  const answers = json.answers || {}
  const out = {}
  for (const k of Object.keys(QUESTIONS)) {
    const a = answers[k]
    if (!a || typeof a.noul !== 'number') throw new Error(`${p.name}: missing answer ${k}`)
    out[k] = a.noul
  }
  return out
}

// Local servers read the state as text; the hosted APIs accept the JSON object.
function renderState(s) {
  const text = [
    'FINAL ASSISTANT MESSAGE:',
    s.final_message,
    '',
    'EVIDENCE FROM THE SESSION TRANSCRIPT:',
    `files edited with edit tools this turn (${s.edit_count_this_turn}): ${s.files_edited_this_turn.join(', ') || 'none'}`,
    `file-changing shell commands this turn: ${s.file_changing_shell_commands_this_turn}`,
    `test or check commands run this turn: ${s.test_or_check_commands_run_this_turn.join(' | ') || 'NONE'}`,
    `subagents or workflows used this turn: ${s.subagents_used_this_turn.join(', ') || 'none'}`,
    `commits made this turn (${s.commits_made_this_turn || 0}): ${s.commit_sample || 'none'}`,
    'git status:',
    s.git_status_sample || '(clean or not a git repository)',
  ].join('\n')
  return text.slice(0, 24_000)
}

async function discoverLocalModel(base, key) {
  try {
    const res = await fetch(`${base}/v1/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(1500) })
    if (!res.ok) return ''
    const json = await res.json()
    const models = json.data || json.models || []
    const decision = models.find((m) => JSON.stringify(m.output_modalities || m.capabilities || m.modalities || '').includes('decision'))
    return String((decision || models[0] || {}).id || (decision || models[0] || {}).name || '')
  } catch { return '' }
}

async function askLocal(p, state) {
  const model = p.model || (await discoverLocalModel(p.base, p.key)) || 'local'
  const body = {
    model,
    state: renderState(state),
    questions: Object.fromEntries(Object.entries(QUESTIONS).map(([k, q]) => [k, { type: 'noul', instructions: q }])),
  }
  const headers = { 'Content-Type': 'application/json' }
  if (p.key) headers.Authorization = `Bearer ${p.key}`
  const timeout = Number(env('HARNESS_LOCAL_TIMEOUT_MS')) || 9000
  const res = await fetch(p.url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) })
  if (!res.ok) throw new Error(`local HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  const answers = json.answers || (json.result && json.result.answers) || {}
  const out = {}
  for (const k of Object.keys(QUESTIONS)) {
    const a = answers[k]
    const v = a && (typeof a.noul === 'number' ? a.noul : typeof a.probability === 'number' ? a.probability : null)
    if (typeof v !== 'number') throw new Error(`local: missing answer ${k}`)
    out[k] = v
  }
  return out
}

// Asks Claude through the CLI and login the user already has. API keys are removed from the child's
// environment so the call uses the subscription rather than billing an API key (an apiKeyHelper in the
// user's settings would still win). Hooks are disabled in the child, and HARNESS_DECISION_GATE=off is a
// second guard against the child's own Stop hook calling this gate again.
function askClaudeCli(p, state) {
  const schema = { type: 'object', additionalProperties: false, required: Object.keys(QUESTIONS), properties: Object.fromEntries(Object.keys(QUESTIONS).map((k) => [k, { type: 'number', minimum: 0, maximum: 1 }])) }
  const prompt = `${renderState(state)}\n\nFor each statement, give the probability (0 to 1) that it is true of the final message, using the evidence.\n${Object.entries(QUESTIONS).map(([k, q]) => `${k}: ${q}`).join('\n')}`
  const args = ['-p', '--model', p.model, '--effort', env('HARNESS_CLAUDE_EFFORT') || 'low', '--tools', '', '--settings', '{"disableAllHooks": true}', '--strict-mcp-config', '--no-session-persistence', '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--system-prompt', 'You judge whether a coding assistant\'s final message is backed by evidence. Answer only with the requested JSON.']
  const childEnv = { ...process.env, HARNESS_DECISION_GATE: 'off' }
  delete childEnv.ANTHROPIC_API_KEY
  delete childEnv.ANTHROPIC_AUTH_TOKEN
  const timeout = Number(env('HARNESS_CLAUDE_TIMEOUT_MS')) || 15000
  return new Promise((resolve, reject) => {
    let out = ''
    let child
    try { child = spawn(env('HARNESS_CLAUDE_BIN') || 'claude', args, { cwd: tmpdir(), env: childEnv, stdio: ['pipe', 'pipe', 'ignore'] }) } catch (e) { return reject(e) }
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} ; reject(new Error('claude-cli timed out')) }, timeout)
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.stdout.on('data', (d) => { out += d })
    child.on('close', () => {
      clearTimeout(timer)
      try {
        const json = JSON.parse(out)
        const so = json.structured_output
        if (json.is_error || !so) throw new Error(`claude-cli: ${(json.result || 'no structured output').toString().slice(0, 160)}`)
        const res = {}
        for (const k of Object.keys(QUESTIONS)) {
          if (typeof so[k] !== 'number') throw new Error(`claude-cli: missing answer ${k}`)
          res[k] = Math.min(0.99, Math.max(0.01, so[k]))
        }
        resolve(res)
      } catch (e) { reject(e) }
    })
    child.stdin.end(prompt)
  })
}

// No model. High-precision rules only: it should rather miss a case than block good work. Negated
// completion ("not done yet") does not count as a claim, and verification needs a test command in the
// transcript or a concrete pass/fail report in the message.
function askHeuristic(state) {
  const msg = String(state.final_message || '')
  const tail = msg.slice(-1200)
  const NEG = /\b(not|n't|never|nothing|no longer|yet to)\b[^.\n]{0,25}$/i
  const claim = /\b(done|complete(d)?|finished|fixed|implemented|resolved|all set|ready to (merge|ship|go)|should (now )?work)\b/gi
  let claims = false
  for (const m of tail.matchAll(claim)) if (!NEG.test(tail.slice(Math.max(0, m.index - 30), m.index))) { claims = true; break }
  const ran = state.test_or_check_commands_run_this_turn.length > 0
  const reports = /\b((all )?\d+ (tests? )?(pass(ed|ing)?|succeeded)|tests? (pass(ed)?|are passing|ran clean)|0 fail(ed|ures)?|no failures|(build|lint|typecheck)( \w+)? (passed|succeeded|is clean)|exit(ed)? (with )?(code )?0)\b/i.test(msg)
  const unresolved = /\b(still (fails?|failing|broken)|is failing|are failing|TODO|FIXME|known (issue|bug)|could not|couldn't|unable to)\b/i.test(msg)
  const deferred = /\b(please (run|test|verify|check|try)|you (can|should|may want to|might want to) (run|test|verify|check)|run [^.\n]{1,60} to (verify|confirm|check))\b/i.test(msg)
  return {
    claims_done: claims ? 0.9 : 0.1,
    cites_verification: ran || reports ? 0.9 : 0.1,
    unresolved_problem: unresolved ? 0.9 : 0.1,
    deferred_to_user: deferred ? 0.9 : 0.1,
  }
}

async function ask(p, state) {
  if (p.name === 'openai') return askOpenAI(p, state)
  if (p.name === 'local') return askLocal(p, state)
  if (p.name === 'claude-cli') return askClaudeCli(p, state)
  if (p.name === 'heuristic') return askHeuristic(state)
  return askJev(p, state)
}

function record(entry) {
  const file = env('HARNESS_GATE_LOG')
  if (!file) return
  try { appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n') } catch {}
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
  callMeta = { model: json.model || p.model, usage: json.usage || null, request_id: res.headers.get('x-request-id') || null, request_bytes: JSON.stringify(body).length }
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
  if (!provider) { log('no decision backend configured, allowing'); return allow() }

  const cwd = input.cwd || process.cwd()
  const ev = turnEvidence(input.transcript_path)
  const git = gitChanges(cwd, ev.startedAt)
  const indirect = ev.shellWrites > 0 || ev.subagents.length > 0
  const changedSomething = ev.edits > 0 || ((git.count > 0 || git.commits > 0) && (indirect || !ev.parsed))
  if (!changedSomething) { log('no edits this turn, allowing'); return allow() }

  const finalMessage = String(input.last_assistant_message || '').slice(0, 6000)
  if (!finalMessage.trim()) return allow()

  const state = {
    final_message: finalMessage,
    files_edited_this_turn: [...ev.editedFiles].slice(0, 30),
    edit_count_this_turn: ev.edits,
    file_changing_shell_commands_this_turn: ev.shellWrites,
    test_or_check_commands_run_this_turn: ev.testCommands.slice(0, 15),
    subagents_used_this_turn: ev.subagents.slice(0, 10),
    commits_made_this_turn: git.commits,
    commit_sample: git.commitSample,
    git_status_sample: git.sample,
  }

  let p
  let used = provider
  const started = Date.now()
  try {
    p = await ask(provider, state)
  } catch (e) {
    const fallback = pickFallback(provider)
    if (!fallback) { log('decision call failed, allowing:', e.message); record({ provider: provider.name, error: e.message, ms: Date.now() - started }); return allow() }
    log(`decision call failed (${e.message}), trying fallback ${fallback.name}`)
    try { used = fallback; p = await ask(fallback, state) } catch (e2) { log('fallback failed, allowing:', e2.message); record({ provider: provider.name, fallback: fallback.name, error: e2.message, ms: Date.now() - started }); return allow() }
  }
  log(`provider=${used.name} probs=${JSON.stringify(p)} tests_run=${ev.testCommands.length}`)

  const T = Math.min(0.95, Math.max(0.5, Number(env('HARNESS_GATE_THRESHOLD')) || 0.7))
  const verified = ev.testCommands.length > 0 || p.cites_verification >= 0.5
  const reasons = []
  if (p.claims_done >= T && !verified) reasons.push(`you report the work as done but no test, build or check command ran this turn and the message cites no verification (p_done=${p.claims_done.toFixed(2)}, p_verified=${p.cites_verification.toFixed(2)})`)
  if (p.unresolved_problem >= T + 0.05) reasons.push(`the message still mentions an unresolved error, failing check or TODO (p=${p.unresolved_problem.toFixed(2)})`)
  if (p.deferred_to_user >= T + 0.05) reasons.push(`the message leaves verification or a step to the user that you can do yourself (p=${p.deferred_to_user.toFixed(2)})`)
  record({ provider: used.name, ms: Date.now() - started, probs: p, tests_run: ev.testCommands.length, edits: ev.edits, shell_writes: ev.shellWrites, subagents: ev.subagents.length, commits: git.commits, ...callMeta, blocked: reasons.length > 0, reasons, message_sha256: createHash('sha256').update(finalMessage).digest('hex').slice(0, 16), ...(env('HARNESS_GATE_LOG_TEXT') === '1' ? { message: finalMessage.slice(0, 2000) } : {}) })
  if (!reasons.length) return allow()

  const reason = `Decision gate (${used.name}): ${reasons.join('; ')}. Before finishing: run the relevant tests or checks for the files you changed (${[...ev.editedFiles].slice(0, 6).join(', ') || 'see git status'}), fix anything that fails, resolve or explicitly scope out any open item, and end with a two-line verification summary (what you ran, what it showed). If no automated check exists, say so in one line and describe the manual check you performed.`
  process.stdout.write(JSON.stringify({ decision: 'block', reason }))
  process.exit(0)
}

main().catch((e) => { log('unexpected:', e && e.message); allow() })
