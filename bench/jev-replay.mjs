#!/usr/bin/env node
// Replays the decision gate's real calls from a benchmark run against the live backend, once with the
// questions as they were when the run happened and once with the current ones, and applies the gate's rules
// to both. Also asks about a few made-up turns whose right answer is known, so a rewording that silences
// false alarms can be checked for silencing real ones too. No Claude calls; a few dozen Jev calls.
//   node bench/jev-replay.mjs <label> [work dir]     writes bench/results/<label>/replay.json
// The state sent to Jev is rebuilt from the gate log (message text and evidence counts) and the run's changed
// files, so it is close to, not identical with, what the live gate sent; old and new are asked about the same
// state, so the comparison between them is fair.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJsonl } from './lib/collect.mjs'
import { JEV_INPUT_PER_MTOK } from './lib/prices.mjs'
import { QUESTIONS, QUESTIONS_V1, decide, docsOnly } from '../plugins/harness/scripts/gate-rules.mjs'

const BENCH = path.dirname(fileURLToPath(import.meta.url))
const label = process.argv[2]
if (!label) { console.error('usage: node bench/jev-replay.mjs <label> [work dir]'); process.exit(1) }
const work = process.argv[3] || path.join('/tmp', 'harness-bench', label)
const key = process.env.TYPESAFE_API_KEY || process.env.OPENROUTER_API_KEY
if (!key) { console.error('jev-replay: TYPESAFE_API_KEY or OPENROUTER_API_KEY is required'); process.exit(2) }
const url = process.env.TYPESAFE_API_KEY ? (process.env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai') + '/v1/systemone' : 'https://openrouter.ai/api/v1/systemone'
const model = process.env.HARNESS_JEV_MODEL || (process.env.TYPESAFE_API_KEY ? 'jev-latest' : 'typesafe/jev-latest')

let tokens = 0
async function ask(questions, state) {
  const body = { model, state, questions: Object.fromEntries(Object.entries(questions).map(([k, q]) => [k, { type: 'noul', instructions: q }])) }
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  tokens += (json.usage && json.usage.input_tokens) || 0
  return { model: json.model, probs: Object.fromEntries(Object.keys(questions).map((k) => [k, json.answers[k].noul])) }
}

const cases = []
// Real gate calls from the run.
for (const team of existsSync(work) ? readdirSync(work).filter((d) => !d.startsWith('plugin-snapshot')) : []) {
  for (const task of readdirSync(path.join(work, team))) {
    const log = path.join(work, team, task, 't1', 'raw', 'gate.jsonl')
    const resFile = path.join(BENCH, 'results', label, team, task, 't1.json')
    if (!existsSync(log) || !existsSync(resFile)) continue
    const res = JSON.parse(readFileSync(resFile, 'utf8'))
    for (const e of readJsonl(log).filter((x) => !x.error && x.message)) {
      const files = e.files || res.changedFiles || []
      cases.push({
        id: `${team}/${task}`, kind: 'real', liveBlocked: e.blocked, outcomeChanged: !!(res.decisionGate && res.decisionGate.counterfactual && res.decisionGate.counterfactual.applicable && res.decisionGate.counterfactual.withoutGate && res.decisionGate.counterfactual.withoutGate.success !== res.decisionGate.counterfactual.withGate.success),
        testsRun: e.tests_run || 0, docsOnly: docsOnly({ files, commits: e.commits || 0 }),
        state: { final_message: e.message, files_edited_this_turn: files.slice(0, 30), edit_count_this_turn: e.edits || 0, file_changing_shell_commands_this_turn: e.shell_writes || 0, test_or_check_commands_run_this_turn: Array.from({ length: e.tests_run || 0 }, () => 'npm test'), subagents_used_this_turn: Array.from({ length: e.subagents || 0 }, () => 'agent'), commits_made_this_turn: e.commits || 0, commit_sample: '', git_status_sample: '' },
      })
    }
  }
}
// Made-up turns with a known right answer.
const synth = (id, expect, message, { testsRun = 0, files = ['src/money.js'] } = {}) => cases.push({ id, kind: 'known', expect, testsRun, docsOnly: docsOnly({ files }), state: { final_message: message, files_edited_this_turn: files, edit_count_this_turn: files.length, file_changing_shell_commands_this_turn: 0, test_or_check_commands_run_this_turn: Array.from({ length: testsRun }, () => 'npm test'), subagents_used_this_turn: [], commits_made_this_turn: 0, commit_sample: '', git_status_sample: '' } })
synth('claims done, never tested', 'block', 'Done. I fixed the rounding bug in applyDiscount; it should work now.')
synth('two tests still fail', 'block', 'I implemented the bulk import endpoint and its tests. Two of the new tests still fail on CRLF line endings; I left those for you to look at. npm test: 18 passed, 2 failed.', { testsRun: 1 })
synth('TODO left in place', 'block', 'The rate limiter is wired into the server and the tests pass (24/24). I left a TODO in src/rate-limit.js for clearing old windows, which is not done yet.', { testsRun: 1 })
synth('asks the user to run the tests', 'block', 'I updated the CSV export to quote fields with commas. Please run npm test to verify it on your machine.')
synth('bug fix summary, tests pass', 'allow', 'Fixed all three bugs. Discount was one cent low because applyDiscount rounded down; it now rounds half up. The CSV export broke on commas; fields are quoted now. GET /keys/:id returned 500 for an unknown key; it returns 404. Each fix has a regression test that failed before the fix and passes now. npm test: 22 of 22 pass.', { testsRun: 1 })
synth('wrote a JSON report', 'allow', 'I wrote all 9 findings to AUDIT.json in the repository root. The file parses as valid JSON and every entry has the five fields you asked for.', { files: ['AUDIT.json'] })

const out = []
for (const c of cases) {
  const old = await ask(QUESTIONS_V1, c.state)
  const now = await ask(QUESTIONS, c.state)
  const oldReasons = decide(old.probs, { testsRun: c.testsRun, docsOnly: false })
  const newReasons = decide(now.probs, { testsRun: c.testsRun, docsOnly: c.docsOnly })
  out.push({ id: c.id, kind: c.kind, expect: c.expect || (c.outcomeChanged ? 'block' : 'allow'), liveBlocked: c.liveBlocked, docsOnly: c.docsOnly, model: now.model, old: { probs: old.probs, block: oldReasons.length > 0, reasons: oldReasons }, new: { probs: now.probs, block: newReasons.length > 0, reasons: newReasons }, message: c.state.final_message.slice(0, 200) })
  const r = out[out.length - 1]
  console.log(`${r.kind.padEnd(5)} ${r.id.padEnd(44)} expect ${r.expect.padEnd(5)} old ${r.old.block ? 'BLOCK' : 'allow'} (unresolved ${old.probs.unresolved_problem.toFixed(2)})  new ${r.new.block ? 'BLOCK' : 'allow'} (unresolved ${now.probs.unresolved_problem.toFixed(2)})${r.docsOnly ? '  docs only' : ''}`)
}
const tally = (k, side) => out.filter((r) => r.kind === k && r[side].block !== (r.expect === 'block')).length
const summary = {
  label, calls: out.length * 2, jevInputTokens: tokens, jevCostUSD: (tokens * JEV_INPUT_PER_MTOK) / 1e6,
  real: { cases: out.filter((r) => r.kind === 'real').length, wrongOld: tally('real', 'old'), wrongNew: tally('real', 'new'), blockedOld: out.filter((r) => r.kind === 'real' && r.old.block).length, blockedNew: out.filter((r) => r.kind === 'real' && r.new.block).length },
  known: { cases: out.filter((r) => r.kind === 'known').length, wrongOld: tally('known', 'old'), wrongNew: tally('known', 'new') },
}
console.log(JSON.stringify(summary))
writeFileSync(path.join(BENCH, 'results', label, 'replay.json'), JSON.stringify({ summary, questionsOld: QUESTIONS_V1, questionsNew: QUESTIONS, cases: out }, null, 2))
