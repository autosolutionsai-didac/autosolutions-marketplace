#!/usr/bin/env node
// Checks the decision gate against the live Jev API before a benchmark spends money on it:
//   node bench/jev-smoke.mjs
// Runs the harness's own decision-gate.mjs on two made-up turns that changed a file: one claims "done"
// with no test run (Jev should be asked and should send Claude back), one reports a passing test run (Jev
// should be asked and should let it stop). Exits non-zero unless both calls were answered without error.
// Needs TYPESAFE_API_KEY or OPENROUTER_API_KEY. Prints probabilities, latency and whether the API reported
// token usage; never prints the key.
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BENCH = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.join(path.dirname(BENCH), 'plugins', 'harness', 'scripts', 'decision-gate.mjs')
const provider = process.env.TYPESAFE_API_KEY ? 'typesafe' : process.env.OPENROUTER_API_KEY ? 'openrouter' : null
if (!provider) {
  console.error('jev-smoke: neither TYPESAFE_API_KEY nor OPENROUTER_API_KEY is set')
  process.exit(2)
}

const dir = mkdtempSync(path.join(os.tmpdir(), 'jev-smoke-'))
spawnSync('git', ['init', '-q'], { cwd: dir })
writeFileSync(path.join(dir, 'discount.js'), 'export const applyDiscount = (cents, pct) => Math.round(cents * (1 - pct / 100))\n')
const log = path.join(dir, 'gate.jsonl')

function transcript(name, rows) {
  const p = path.join(dir, `${name}.jsonl`)
  writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  return p
}
const prompt = { type: 'user', timestamp: new Date().toISOString(), message: { role: 'user', content: 'Fix the rounding bug in applyDiscount.' } }
const edit = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: path.join(dir, 'discount.js') } }] } }
const cases = [
  { name: 'unverified', expect: 'block', message: 'Done. I fixed the rounding bug in applyDiscount; it should work now.', rows: [prompt, edit] },
  { name: 'verified', expect: 'allow', message: 'Fixed the rounding bug in applyDiscount. Ran `node --test`: 17 tests, 17 pass, 0 fail, including the new regression test for 15% off 999 cents.', rows: [prompt, edit, { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'node --test' } }] } }] },
]

const run = (input) => new Promise((resolve) => {
  const c = spawn(process.execPath, [GATE], { env: { ...process.env, HARNESS_DECISION_PROVIDER: provider, HARNESS_GATE_LOG: log, HARNESS_DEBUG: '1' } })
  let out = '', err = ''
  c.stdout.on('data', (d) => (out += d))
  c.stderr.on('data', (d) => (err += d))
  c.on('close', (status) => resolve({ status, out, err }))
  c.stdin.end(JSON.stringify(input))
})

let ok = true
for (const k of cases) {
  const before = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).length : 0
  const r = await run({ hook_event_name: 'Stop', stop_hook_active: false, cwd: dir, transcript_path: transcript(k.name, k.rows), last_assistant_message: k.message })
  const entries = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
  const e = entries.length > before ? entries[entries.length - 1] : null
  const got = /"decision":"block"/.test(r.out) ? 'block' : 'allow'
  if (!e || e.error) {
    ok = false
    console.log(`FAIL  ${k.name}: ${e ? `backend error: ${e.error}` : `no backend call was made (${r.err.trim().split('\n').pop()})`}`)
    continue
  }
  console.log(`${got === k.expect ? 'PASS' : 'NOTE'}  ${k.name}: ${provider} answered in ${e.ms} ms, gate would ${got} (expected ${k.expect}); model ${e.model || '?'}; probs ${JSON.stringify(e.probs)}; usage ${e.usage ? JSON.stringify(e.usage) : 'not reported'}; request id ${e.request_id ? 'present' : 'absent'}`)
}
rmSync(dir, { recursive: true, force: true })
console.log(ok ? 'jev-smoke: Jev answered every call' : 'jev-smoke: FAILED')
process.exit(ok ? 0 : 1)
