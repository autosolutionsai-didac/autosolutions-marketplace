// Mock-backed tests for the harness scripts (no real API calls). Run: node tests/test-scripts.mjs
import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync, mkdtempSync, readFileSync, chmodSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = process.argv[2] || new URL('..', import.meta.url).pathname
const requests = []
const server = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const json = body ? JSON.parse(body) : {}
    requests.push({ url: req.url, auth: req.headers.authorization, json })
    res.setHeader('content-type', 'application/json')
    if (req.url === '/v1/models') {
      return res.end(JSON.stringify({ data: [{ id: 'chat-model', output_modalities: ['text'] }, { id: 'kev-0.8b', output_modalities: ['decisions'] }] }))
    }
    if (req.url === '/client/v4/accounts/acct/ai/run/@cf/cloudflare/clef-flash') {
      const answers = Object.fromEntries(Object.keys(json.questions).map((k) => [k, { noul: k === 'claims_done' ? 0.9 : 0.05 }]))
      return res.end(JSON.stringify({ success: true, result: { answers } }))
    }
    if (req.url === '/v1/systemone') {
      const answers = Object.fromEntries(Object.keys(json.questions).map((k) => [k, { type: 'noul', noul: k === 'claims_done' ? 0.93 : k === 'cites_verification' ? 0.08 : 0.1 }]))
      return res.end(JSON.stringify({ model: 'jev-1.13.0', answers, usage: { input_tokens: 400, output_tokens: 4 } }))
    }
    if (req.url === '/v1/decisions') {
      const answers = json.questions.map((q) => ({ type: 'predicate', name: q.name, probability: q.name === 'claims_done' ? 0.9 : q.name === 'cites_verification' ? 0.7 : 0.05 }))
      return res.end(JSON.stringify({ answers }))
    }
    if (req.url === '/v1/responses') {
      if (json.text && json.text.format) {
        const review = { verdict: 'request-changes', confidence: 'high', summary: 'Mock review.', blocking: [{ title: 'Null deref', location: 'src/a.ts:12', why: 'x can be undefined', fix: 'guard it' }], major: [], minor: [], questions: ['Is retry idempotent?'] }
        return res.end(JSON.stringify({ model: json.model, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(review) }] }], usage: { input_tokens: 1200, output_tokens: 300 } }))
      }
      return res.end(JSON.stringify({ model: json.model, output: [{ type: 'message', content: [{ type: 'output_text', text: 'Mock opinion: your retry has no jitter.' }] }] }))
    }
    res.statusCode = 404; res.end('{}')
  })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

// fake transcript: user prompt, then an Edit, then (optionally) a test command
const dir = mkdtempSync(join(tmpdir(), 'harness-test-'))
const transcript = (withTests) => {
  const rows = [
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'fix the bug' }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/repo/src/a.ts' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } },
  ]
  if (withTests) rows.push({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: typeof withTests === 'string' ? withTests : 'npm test -- a.spec.ts' } }] } })
  rows.push({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done, fixed the bug.' }] } })
  const p = join(dir, `t-${withTests ? String(withTests).replace(/\W+/g, '_') : 'notests'}.jsonl`)
  writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  return p
}

function runAsync(args, { input, env }) {
  return new Promise((resolve) => {
    const c = spawn('node', args, { env })
    let stdout = '', stderr = ''
    c.stdout.on('data', (d) => (stdout += d)); c.stderr.on('data', (d) => (stderr += d))
    c.on('close', (status) => resolve({ status, stdout: stdout.trim(), stderr: stderr.trim() }))
    c.stdin.end(input)
  })
}
function runGate(envExtra, withTests, msg = 'Done, I fixed the bug and it should work now.') {
  const input = { hook_event_name: 'Stop', stop_hook_active: false, cwd: dir, transcript_path: transcript(withTests), last_assistant_message: msg }
  return runAsync([join(ROOT, 'scripts/decision-gate.mjs')], { input: JSON.stringify(input), env: { ...process.env, HARNESS_DEBUG: '1', TYPESAFE_API_KEY: '', OPENROUTER_API_KEY: '', OPENAI_API_KEY: '', CLAUDE_PLUGIN_OPTION_TYPESAFE_API_KEY: '', CLAUDE_PLUGIN_OPTION_OPENAI_API_KEY: '', ...envExtra } })
}

let failures = 0
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++ }

// 1. session-context
{
  const r = spawnSync('node', [join(ROOT, 'scripts/session-context.mjs')], { encoding: 'utf8', env: { ...process.env, TYPESAFE_API_KEY: 'x' } })
  const j = JSON.parse(r.stdout)
  check('session-context emits SessionStart additionalContext', j.hookSpecificOutput && j.hookSpecificOutput.hookEventName === 'SessionStart' && /harness:scout/.test(j.hookSpecificOutput.additionalContext))
  check('session-context reports Jev gate on', /on \(Jev\)/.test(j.hookSpecificOutput.additionalContext))
}

// 2. decision gate
{
  let r = await runGate({}, false)
  check('gate: no key -> allow silently', r.status === 0 && r.stdout === '', r.stderr.split('\n').pop())
  r = await runGate({ TYPESAFE_API_KEY: 'k', TYPESAFE_BASE_URL: base }, false)
  check('gate: typesafe, done without tests -> block', r.status === 0 && /"decision":"block"/.test(r.stdout), r.stdout.slice(0, 120))
  check('gate: typesafe request shape (model/state/questions noul)', requests.some((q) => q.url === '/v1/systemone' && q.json.model === 'jev-latest' && q.json.questions.claims_done.type === 'noul' && q.auth === 'Bearer k'))
  r = await runGate({ TYPESAFE_API_KEY: 'k', TYPESAFE_BASE_URL: base }, true)
  check('gate: typesafe, done WITH tests -> allow', r.status === 0 && r.stdout === '', r.stderr.split('\n').pop())
  for (const cmd of ['node --test test/', 'node --test-reporter=spec --test', 'deno test -A', 'python -m unittest discover', 'python3 -m pytest -q']) {
    r = await runGate({ TYPESAFE_API_KEY: 'k', TYPESAFE_BASE_URL: base }, cmd)
    check(`gate: "${cmd}" counts as a test run -> allow`, r.status === 0 && r.stdout === '', r.stdout.slice(0, 80))
  }
  // Edits made through the shell or by a subagent are not Edit/Write calls; with a dirty git tree they still count.
  {
    const repo = mkdtempSync(join(tmpdir(), 'harness-gate-repo-'))
    spawnSync('git', ['init', '-q'], { cwd: repo })
    writeFileSync(join(repo, 'a.js'), 'x\n')
    const shellTurn = (tool, input) => {
      const p = join(dir, `t-${tool}.jsonl`)
      writeFileSync(p, [
        { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'change a.js' }] } },
        { type: 'assistant', message: { content: [{ type: 'tool_use', name: tool, input }] } },
        { type: 'assistant', message: { content: [{ type: 'text', text: 'Done.' }] } },
      ].map((x) => JSON.stringify(x)).join('\n') + '\n')
      return p
    }
    const gateIn = (transcript_path, cwd) => JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: false, cwd, transcript_path, last_assistant_message: 'Done.' })
    const env = { ...process.env, HARNESS_DEBUG: '1', TYPESAFE_API_KEY: 'k', TYPESAFE_BASE_URL: base }
    for (const [tool, input, label] of [['Bash', { command: "sed -i 's/x/y/' a.js" }, 'sed -i'], ['Bash', { command: 'cat > a.js <<EOF\ny\nEOF' }, 'heredoc write'], ['Agent', { subagent_type: 'harness:builder', prompt: 'edit a.js' }, 'subagent'], ['Workflow', { name: 'harness:ship', args: 'x' }, 'workflow']]) {
      r = await runAsync([join(ROOT, 'scripts/decision-gate.mjs')], { input: gateIn(shellTurn(tool, input), repo), env })
      check(`gate: change via ${label} with a dirty tree -> block`, r.status === 0 && /"decision":"block"/.test(r.stdout), (r.stdout || r.stderr).slice(0, 100))
    }
    r = await runAsync([join(ROOT, 'scripts/decision-gate.mjs')], { input: gateIn(shellTurn('Bash', { command: 'grep -rn foo .' }), repo), env })
    check('gate: read-only shell turn on a dirty tree -> allow', r.status === 0 && r.stdout === '', r.stderr.split('\n').pop())
  }
  // Free backends
  {
    const before = requests.length
    r = await runGate({ HARNESS_LOCAL_URL: base }, false)
    const q = requests.slice(before).find((x) => x.url === '/v1/systemone')
    check('gate: local System One server, no key, auto-selected -> block', r.status === 0 && /"decision":"block"/.test(r.stdout) && /Decision gate \(local\)/.test(r.stdout), r.stdout.slice(0, 100))
    check('gate: local request discovers the decision model, sends text state, no auth header', q && q.json.model === 'kev-0.8b' && typeof q.json.state === 'string' && /FINAL ASSISTANT MESSAGE/.test(q.json.state) && !q.auth, q && JSON.stringify({ model: q.json.model, auth: q.auth }))
    r = await runGate({ HARNESS_DECISION_PROVIDER: 'local', HARNESS_LOCAL_URL: `${base}/client/v4/accounts/acct/ai/run/@cf/cloudflare/clef-flash`, HARNESS_LOCAL_MODEL: 'clef-flash', HARNESS_LOCAL_API_KEY: 'cf' }, false)
    const cf = requests.slice(before).find((x) => x.url.includes('clef-flash'))
    check('gate: local endpoint URL used as given, Cloudflare result envelope, bearer key', r.status === 0 && /"decision":"block"/.test(r.stdout) && cf && cf.auth === 'Bearer cf' && cf.json.model === 'clef-flash', r.stdout.slice(0, 80))
    r = await runGate({ TYPESAFE_API_KEY: 'k', TYPESAFE_BASE_URL: base, HARNESS_LOCAL_URL: 'http://127.0.0.1:1' }, false)
    check('gate: auto prefers a paid key over a local URL', /Decision gate \(typesafe\)/.test(r.stdout), r.stdout.slice(0, 60))

    // claude-cli: a stand-in claude binary that checks what the gate passes it.
    const bin = join(dir, 'fake-claude.mjs')
    const seen = join(dir, 'fake-claude-seen.json')
    writeFileSync(bin, `#!/usr/bin/env node
import { writeFileSync, readFileSync } from 'node:fs'
const stdin = readFileSync(0, 'utf8')
writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ args: process.argv.slice(2), apiKey: process.env.ANTHROPIC_API_KEY || null, authToken: process.env.ANTHROPIC_AUTH_TOKEN || null, gate: process.env.HARNESS_DECISION_GATE, cwd: process.cwd(), stdin }))
const done = /Done/.test(stdin)
console.log(JSON.stringify({ type: 'result', is_error: false, structured_output: { claims_done: done ? 0.92 : 0.1, cites_verification: 0.04, unresolved_problem: 0.03, deferred_to_user: 0.02 } }))
`)
    chmodSync(bin, 0o755)
    r = await runGate({ HARNESS_DECISION_PROVIDER: 'claude-cli', HARNESS_CLAUDE_BIN: bin, ANTHROPIC_API_KEY: 'sk-should-not-leak', ANTHROPIC_AUTH_TOKEN: 'tok' }, false)
    const got = existsSync(seen) ? JSON.parse(readFileSync(seen, 'utf8')) : {}
    check('gate: claude-cli, done without tests -> block', r.status === 0 && /Decision gate \(claude-cli\)/.test(r.stdout), r.stdout.slice(0, 80) || r.stderr.split('\n').pop())
    check('gate: claude-cli child gets no API key or auth token (bills the plan, not an API key)', got.apiKey === null && got.authToken === null)
    check('gate: claude-cli child has hooks disabled and the gate off (no recursion), no tools, no MCP', got.gate === 'off' && got.args.includes('{"disableAllHooks": true}') && got.args.includes('--strict-mcp-config') && got.args[got.args.indexOf('--tools') + 1] === '' && got.args.includes('claude-haiku-5-5'))
    r = await runGate({ HARNESS_DECISION_PROVIDER: 'claude-cli', HARNESS_CLAUDE_BIN: join(dir, 'missing-claude') }, false)
    check('gate: claude-cli missing binary -> fail open', r.status === 0 && r.stdout === '', r.stderr.split('\n').pop())

    // heuristic
    const H = { HARNESS_DECISION_PROVIDER: 'heuristic' }
    r = await runGate(H, false, 'Done.')
    check('gate: heuristic, "Done." with no test run -> block', /"decision":"block"/.test(r.stdout))
    r = await runGate(H, false, 'Not done yet: the parser change is in, but I have not wired it to the CLI.')
    check('gate: heuristic, negated completion -> allow', r.stdout === '', r.stdout.slice(0, 80))
    r = await runGate(H, false, 'Implemented the fix. All 16 tests pass.')
    check('gate: heuristic, done with a concrete pass report -> allow', r.stdout === '', r.stdout.slice(0, 80))
    r = await runGate(H, true, 'Fixed it.')
    check('gate: heuristic, done after a test command ran -> allow', r.stdout === '', r.stdout.slice(0, 80))
    r = await runGate(H, false, 'I updated the config. Please run npm test to verify.')
    check('gate: heuristic, step left to the user -> block', /leaves verification or a step to the user/.test(r.stdout), r.stdout.slice(0, 80))

    // fallback and the decision log
    const logFile = join(dir, 'gate-log.jsonl')
    r = await runGate({ HARNESS_LOCAL_URL: 'http://127.0.0.1:1', HARNESS_DECISION_FALLBACK: 'heuristic', HARNESS_GATE_LOG: logFile }, false, 'Done.')
    check('gate: local unreachable, heuristic fallback -> block', /Decision gate \(heuristic\)/.test(r.stdout), r.stdout.slice(0, 80))
    const logged = existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []
    check('gate: HARNESS_GATE_LOG records provider, probabilities and a message hash, not the text', logged.length === 1 && logged[0].provider === 'heuristic' && logged[0].blocked === true && logged[0].message_sha256 && !logged[0].message)
  }
  r = await runGate({ OPENAI_API_KEY: 'k2', OPENAI_BASE_URL: base }, false)
  check('gate: openai decisions, verified per model -> allow', r.status === 0 && r.stdout === '', r.stderr.split('\n').pop())
  check('gate: openai request shape (predicate questions array)', requests.some((q) => q.url === '/v1/decisions' && q.json.model === 'gpt-6-luna' && Array.isArray(q.json.questions) && q.json.questions[0].type === 'predicate'))
  r = await runGate({ TYPESAFE_API_KEY: 'k', TYPESAFE_BASE_URL: base, HARNESS_DECISION_GATE: 'off' }, false)
  check('gate: HARNESS_DECISION_GATE=off -> allow', r.status === 0 && r.stdout === '')
  const input = { hook_event_name: 'Stop', stop_hook_active: true, cwd: dir, transcript_path: transcript(false), last_assistant_message: 'Done.' }
  const rr = await runAsync([join(ROOT, 'scripts/decision-gate.mjs')], { input: JSON.stringify(input), env: { ...process.env, TYPESAFE_API_KEY: 'k', TYPESAFE_BASE_URL: base } })
  check('gate: stop_hook_active -> allow (no loops)', rr.status === 0 && rr.stdout === '')
  const bad = await runAsync([join(ROOT, 'scripts/decision-gate.mjs')], { input: 'not json', env: process.env })
  check('gate: garbage stdin -> allow', bad.status === 0 && bad.stdout === '')
  r = await runGate({ TYPESAFE_API_KEY: 'k', TYPESAFE_BASE_URL: 'http://127.0.0.1:1' }, false)
  check('gate: backend unreachable -> fail open', r.status === 0 && r.stdout === '', r.stderr.split('\n').pop())
}

// 3. MCP server
{
  const child = spawn('node', [join(ROOT, 'scripts/openai-judge-mcp.mjs')], { env: { ...process.env, OPENAI_API_KEY: 'k3', OPENAI_BASE_URL: base, OPENAI_JUDGE_MODEL: 'gpt-6-sol' }, cwd: ROOT })
  const out = []
  child.stdout.on('data', (d) => out.push(...d.toString().split('\n').filter(Boolean)))
  const sendMsg = (m) => child.stdin.write(JSON.stringify(m) + '\n')
  const waitFor = (id) => new Promise((resolve, reject) => {
    const t0 = Date.now()
    const iv = setInterval(() => {
      const hit = out.map((l) => { try { return JSON.parse(l) } catch { return null } }).find((m) => m && m.id === id)
      if (hit) { clearInterval(iv); resolve(hit) }
      if (Date.now() - t0 > 8000) { clearInterval(iv); reject(new Error(`timeout waiting for id ${id}`)) }
    }, 20)
  })
  sendMsg({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } })
  const init = await waitFor(1)
  check('mcp: initialize returns serverInfo + tools capability', init.result && init.result.serverInfo.name === 'openai-judge' && init.result.capabilities.tools)
  sendMsg({ jsonrpc: '2.0', method: 'notifications/initialized' })
  sendMsg({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
  const list = await waitFor(2)
  check('mcp: tools/list has gpt_review and gpt_opinion', list.result && list.result.tools.map((t) => t.name).join(',') === 'gpt_review,gpt_opinion')
  sendMsg({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'gpt_review', arguments: { diff: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-const x = y.z\n+const x = y?.z', context: 'guard null' } } })
  const rev = await waitFor(3)
  check('mcp: gpt_review returns markdown verdict from structured output', rev.result && !rev.result.isError && /Verdict:\*\* request-changes/.test(rev.result.content[0].text), (rev.result && rev.result.content[0].text.slice(0, 80)))
  check('mcp: gpt_review used responses API with json_schema format and developer role', requests.some((q) => q.url === '/v1/responses' && q.json.text && q.json.text.format.type === 'json_schema' && q.json.input[0].role === 'developer' && q.json.model === 'gpt-6-sol'))
  sendMsg({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'gpt_opinion', arguments: { question: 'Is this retry safe?', effort: 'low' } } })
  const op = await waitFor(4)
  check('mcp: gpt_opinion returns markdown', op.result && /Mock opinion/.test(op.result.content[0].text))
  sendMsg({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope', arguments: {} } })
  const unk = await waitFor(5)
  check('mcp: unknown tool -> JSON-RPC error', unk.error && unk.error.code === -32602)
  sendMsg({ jsonrpc: '2.0', id: 6, method: 'ping' })
  const ping = await waitFor(6)
  check('mcp: ping', ping.result && Object.keys(ping.result).length === 0)
  child.kill()
}

// 4. MCP server without key (and with an unresolved plugin placeholder): tool call reports the missing key instead of crashing
{
  const child = spawn('node', [join(ROOT, 'scripts/openai-judge-mcp.mjs')], { env: { ...process.env, OPENAI_API_KEY: '', OPENAI_API_KEY_FROM_PLUGIN: '${user_config.openai_api_key}' }, cwd: ROOT })
  const out = []
  child.stdout.on('data', (d) => out.push(...d.toString().split('\n').filter(Boolean)))
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'gpt_opinion', arguments: { question: 'x' } } }) + '\n')
  await new Promise((r) => setTimeout(r, 600))
  const m = out.map((l) => JSON.parse(l)).find((x) => x.id === 9)
  check('mcp: no key -> isError tool result naming OPENAI_API_KEY', m && m.result && m.result.isError && /OPENAI_API_KEY/.test(m.result.content[0].text))
  child.kill()
}

server.close()
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
