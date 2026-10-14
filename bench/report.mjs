#!/usr/bin/env node
// Builds the comparison for one benchmark label, or for several labels pooled together:
//   node bench/report.mjs 2026-10-13            -> bench/results/2026-10-13/REPORT.md + summary.json
//   node bench/report.mjs 2026-10-13 2026-11-02 -> pooled, written to the first label's folder as REPORT-pooled.md
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BENCH = path.dirname(fileURLToPath(import.meta.url))
const labels = process.argv.slice(2)
if (!labels.length) {
  console.error('usage: node bench/report.mjs <label> [more labels to pool]')
  process.exit(1)
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/^t\d+\.json$/.test(n)) out.push(p)
  }
  return out
}

const allRuns = labels.flatMap((l) => walk(path.join(BENCH, 'results', l)).map((f) => JSON.parse(readFileSync(f, 'utf8'))))
const latest = Math.max(...allRuns.map((r) => r.benchVersion || 1))
const runs = allRuns.filter((r) => (r.benchVersion || 1) === latest && !r.invalidReason)
if (runs.length < allRuns.length) console.error(`ignoring ${allRuns.length - runs.length} run(s) from an older bench version or marked invalid`)
const teams = JSON.parse(readFileSync(path.join(BENCH, 'teams.json'), 'utf8')).teams
const jevCost = (r) => (r.decisionGate && r.decisionGate.jev ? r.decisionGate.jev.costUSD || 0 : 0)
const tasks = JSON.parse(readFileSync(path.join(BENCH, 'tasks.json'), 'utf8')).tasks
const teamIds = teams.map((t) => t.id).filter((id) => runs.some((r) => r.team === id))
const comparative = tasks.filter((t) => t.kind !== 'check' && runs.some((r) => r.task === t.id))
const checks = tasks.filter((t) => t.kind === 'check' && runs.some((r) => r.task === t.id))

const sum = (xs) => xs.reduce((a, b) => a + b, 0)
const mean = (xs) => (xs.length ? sum(xs) / xs.length : null)
const median = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const usd = (x) => (x == null ? 'n/a' : `$${x.toFixed(2)}`)
const mins = (s) => (s == null ? 'n/a' : `${(s / 60).toFixed(1)} min`)
const pct = (x) => (x == null ? 'n/a' : `${Math.round(x * 100)}%`)
const ktok = (n) => (n == null ? 'n/a' : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1e3)}k`)
// Token totals come from Claude Code's own per-model usage; transcripts are the fallback for runs whose
// stream has no final result (they miss some output tokens of workflow agents).
const usageOf = (r) => (r.costSource === 'claude-code' && r.modelUsage && Object.keys(r.modelUsage).length
  ? Object.values(r.modelUsage).map((u) => ({ input: u.inputTokens, output: u.outputTokens, cacheRead: u.cacheReadInputTokens, cacheWrite: u.cacheCreationInputTokens }))
  : Object.values(r.tokensByModel || {}))
const tokensOf = (r) => sum(usageOf(r).map((m) => m.input + m.output + m.cacheRead + m.cacheWrite))
const outputOf = (r) => sum(usageOf(r).map((m) => m.output))
const freshOf = (r) => sum(usageOf(r).map((m) => m.input + m.output + m.cacheWrite))
// "Complete": the change works (success) and also has what the spec asked for besides behaviour
// (tests, docs, a source comment). Findings tasks have no such extras, so complete equals success there.
const completeOf = (r) => (r.success && (r.taskKind !== 'code' || (r.score && r.score.specComplete !== false)) ? 1 : 0)

function cell(team, task) {
  const rs = runs.filter((r) => r.team === team && r.task === task)
  if (!rs.length) return null
  return {
    n: rs.length,
    successRate: mean(rs.map((r) => (r.success ? 1 : 0))),
    completeRate: mean(rs.map(completeOf)),
    wallSec: median(rs.map((r) => r.wallSec)),
    costUSD: median(rs.map((r) => r.costUSD)),
    tokens: median(rs.map(tokensOf)),
    output: median(rs.map(outputOf)),
    fresh: median(rs.map(freshOf)),
    recall: rs[0].taskKind === 'findings' ? mean(rs.map((r) => (r.score && r.score.recall) || 0)) : null,
    extras: rs[0].taskKind === 'findings' ? mean(rs.map((r) => (r.score && r.score.unmatched != null ? r.score.unmatched : r.score && r.score.extras) || 0)) : null,
    validExtras: rs[0].taskKind === 'findings' ? mean(rs.map((r) => (r.score && r.score.validExtras) || 0)) : null,
    duplicates: rs[0].taskKind === 'findings' ? mean(rs.map((r) => (r.score && r.score.duplicates) || 0)) : null,
    findings: rs[0].taskKind === 'findings' ? mean(rs.map((r) => (r.score && r.score.findings) || 0)) : null,
    hiddenPass: rs[0].taskKind === 'code' ? mean(rs.map((r) => (r.score && r.score.hidden ? r.score.hidden.pass / Math.max(1, r.score.hidden.tests) : 0))) : null,
    timeouts: rs.filter((r) => r.timedOut).length,
    errors: rs.filter((r) => r.errors && r.errors.length).length,
    contaminated: rs.filter((r) => r.contamination && r.contamination.length).length,
  }
}

const totals = Object.fromEntries(teamIds.map((team) => {
  const rs = runs.filter((r) => r.team === team && comparative.some((t) => t.id === r.task))
  return [team, {
    runs: rs.length,
    successes: rs.filter((r) => r.success).length,
    successRate: mean(rs.map((r) => (r.success ? 1 : 0))),
    complete: sum(rs.map(completeOf)),
    wallSec: sum(rs.map((r) => r.wallSec)),
    costUSD: sum(rs.map((r) => r.costUSD)),
    tokens: sum(rs.map(tokensOf)),
    output: sum(rs.map(outputOf)),
    fresh: sum(rs.map(freshOf)),
    costPerSuccess: rs.some((r) => r.success) ? sum(rs.map((r) => r.costUSD)) / rs.filter((r) => r.success).length : null,
    byModel: rs.reduce((acc, r) => {
      for (const [m, u] of Object.entries(r.tokensByModel || {})) {
        const a = (acc[m] ||= { tokens: 0, output: 0, costUSD: 0 })
        a.tokens += u.input + u.output + u.cacheRead + u.cacheWrite
        a.output += u.output
        a.costUSD += u.costUSD
      }
      return acc
    }, {}),
  }]
}))

const roleTotals = Object.fromEntries(teamIds.map((team) => {
  const acc = {}
  for (const r of runs.filter((x) => x.team === team && comparative.some((t) => t.id === x.task))) {
    for (const [role, v] of Object.entries(r.byRole || {})) {
      const key = role.replace(/^other:.*/, 'hook or side session')
      const a = (acc[key] ||= { agents: 0, requests: 0, output: 0, costUSD: 0, models: {} })
      a.agents += v.agents
      a.requests += v.requests
      a.output += v.output
      a.costUSD += v.costUSD
      for (const [m, n] of Object.entries(v.models)) a.models[m] = (a.models[m] || 0) + n
    }
  }
  return [team, acc]
}))

const shipRuns = runs.filter((r) => r.ship)
const judgeTruth = shipRuns.map((r) => ({ team: r.team, task: r.task, gate: r.ship.gateVerdict || r.ship.verdict, truth: r.success ? 'works' : 'broken' }))

// ---------------------------------------------------------------------------------------------------
const L = []
const label = labels.join(' + ')
const cfgFile = path.join(BENCH, 'results', labels[0], 'run-config.json')
const cfg = existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, 'utf8')) : {}
L.push(`# Harness benchmark: ${label}`, '')
L.push(`Runs: ${runs.length} (${runs.filter((r) => r.taskKind !== 'check').length} comparative, ${runs.filter((r) => r.taskKind === 'check').length} harness checks). Claude Code ${cfg.claudeVersion || '?'}, Node ${cfg.node || '?'}, ${cfg.cpus || '?'} CPUs, ${cfg.parallel || '?'} runs at a time, trials per comparative cell: ${Math.max(1, ...runs.filter((r) => r.taskKind !== 'check').map((r) => r.trial))}.${existsSync(path.join(BENCH, 'results', labels[0], 'run-config-2.json')) ? ' Later invocations (resumes or reruns of a subset) are recorded in run-config-<n>.json.' : ''}`, '')
const versions = labels.map((l) => {
  const dir = path.join(BENCH, 'results', l)
  const cfgs = existsSync(dir) ? readdirSync(dir).filter((f) => /^run-config(-\d+)?\.json$/.test(f)).map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'))) : []
  return `${l}: Claude Code ${[...new Set(cfgs.map((c) => String(c.claudeVersion || '').replace(/\s*\(Claude Code\)$/, '')).filter(Boolean))].join(', ') || '?'}`
})
const versionOf = (label) => (versions.find((v) => v.startsWith(`${label}:`)) || '').replace(/^[^:]+: Claude Code /, '')
if (labels.length > 1) L.push(`Versions by label: ${versions.join('; ')}.`, '')
L.push('Costs are API list-price equivalents as reported by Claude Code (subscription users pay in usage limits instead). Tokens count everything the models read and wrote, including cache reads; "fresh" leaves cache reads out. Times are wall clock for the whole run, all turns.', '')

L.push('## Teams', '')
for (const t of teams.filter((t) => teamIds.includes(t.id))) L.push(`- **${t.id}**: ${t.label}`)
L.push('')

L.push('## Overall (comparative tasks)', '')
L.push('| Team | Works | Works and complete | Total time | Total cost | Cost per working result | Tokens (all) | Fresh tokens | Output tokens |', '|---|---|---|---|---|---|---|---|---|')
for (const team of teamIds) {
  const t = totals[team]
  L.push(`| ${team} | ${t.successes}/${t.runs} (${pct(t.successRate)}) | ${t.complete}/${t.runs} | ${mins(t.wallSec)} | ${usd(t.costUSD)} | ${usd(t.costPerSuccess)} | ${ktok(t.tokens)} | ${ktok(t.fresh)} | ${ktok(t.output)} |`)
}
L.push('')

L.push('## Per task', '')
for (const task of comparative) {
  L.push(`### ${task.id}`, '', task.title, '')
  const findings = task.kind === 'findings'
  L.push(`| Team | Works | ${findings ? 'Seeded found | Findings | Valid extras | Unmatched | Duplicates' : 'Hidden tests passed | Spec complete'} | Time | Cost | Tokens (all) | Output tokens | Notes |`, `|---|---|---|---|${findings ? '---|---|---|' : ''}---|---|---|---|---|`)
  for (const team of teamIds) {
    const c = cell(team, task.id)
    if (!c) continue
    const estimated = runs.filter((r) => r.team === team && r.task === task.id && r.costSource !== 'claude-code').length
    const specMiss = runs.filter((r) => r.team === team && r.task === task.id && r.specDelivered === false).length
    const optMiss = runs.filter((r) => r.team === team && r.task === task.id && r.optionsDelivered === false).length
    const strictRuns = runs.filter((r) => r.team === team && r.task === task.id && r.score && r.score.strict)
    const strictOk = strictRuns.filter((r) => r.score.strict.fail === 0 && r.score.strict.pass > 0).length
    const notes = [c.timeouts ? `${c.timeouts} timed out` : '', c.errors ? `${c.errors} with errors` : '', c.contaminated ? `${c.contaminated} touched bench files` : '', estimated ? `${estimated} cost estimated from transcripts (lower bound)` : '', specMiss ? `${specMiss} ship run(s) got a changed spec` : '', optMiss ? `${optMiss} run(s) lost the team's workflow options and ran the defaults` : '', strictRuns.length ? `strict check passed in ${strictOk} of ${strictRuns.length}` : ''].filter(Boolean).join(', ')
    const f1 = (x) => (x == null ? 'n/a' : Number.isInteger(x) ? String(x) : x.toFixed(1))
    L.push(`| ${team} | ${pct(c.successRate)} (n=${c.n}) | ${findings ? `${pct(c.recall)} | ${f1(c.findings)} | ${f1(c.validExtras)} | ${f1(c.extras)} | ${f1(c.duplicates)}` : `${pct(c.hiddenPass)} | ${pct(c.completeRate)}`} | ${mins(c.wallSec)} | ${usd(c.costUSD)} | ${ktok(c.tokens)} | ${ktok(c.output)} | ${notes} |`)
  }
  L.push('')
}

L.push('## Where the money went', '')
for (const team of teamIds) {
  const t = totals[team]
  L.push(`**${team}**, by model: ${Object.entries(t.byModel).sort((a, b) => b[1].costUSD - a[1].costUSD).map(([m, v]) => `${m} ${usd(v.costUSD)} (${ktok(v.tokens)} tokens)`).join('; ')}`, '')
  const roles = Object.entries(roleTotals[team]).sort((a, b) => b[1].costUSD - a[1].costUSD)
  if (roles.length > 1) {
    L.push('| Role | Agents | API calls | Output tokens | Cost | Models |', '|---|---|---|---|---|---|')
    for (const [role, v] of roles) L.push(`| ${role} | ${v.agents} | ${v.requests} | ${ktok(v.output)} | ${usd(v.costUSD)} | ${Object.keys(v.models).join(', ')} |`)
    L.push('')
  }
}
L.push('Role costs are recomputed from each agent\'s transcript at list price; they add up to the run totals within rounding.', '')

if (shipRuns.length) {
  L.push('## Inside /harness:ship', '')
  L.push('| Team | Task | Units | Passed | Fix rounds | Gate verdict | Hidden tests say |', '|---|---|---|---|---|---|---|')
  for (const r of shipRuns) L.push(`| ${r.team} | ${r.task} | ${r.ship.units} | ${r.ship.unitsPassed} | ${r.ship.fixRounds} | ${r.ship.gateVerdict || r.ship.verdict || 'none'} | ${r.success ? 'works' : 'broken'} |`)
  const agree = judgeTruth.filter((j) => (j.gate === 'PASS') === (j.truth === 'works')).length
  L.push('', `The final gate agreed with the hidden tests in ${agree} of ${judgeTruth.length} ship runs.`, '')
}

const gateRuns = runs.filter((r) => r.decisionGate && r.taskKind !== 'check')
if (gateRuns.length) {
  const backends = [...new Set(gateRuns.map((r) => r.decisionGate.backend))]
  L.push('## The decision gate (Jev)', '')
  L.push(`Backend: ${backends.join(', ')}.${backends.includes('mock') ? ' **Mock runs test the wiring only; they say nothing about Jev.**' : ''} The gate runs when Claude stops after changing files and can send it back once per stop. A wrapper records the work tree whenever it does, so each block can be scored twice: as the run would have ended without the gate (the tree at the block) and as it did end. That comparison is only possible when the run's first block came at what would have been its last stop; a block in an earlier turn, or while a workflow was still running, changed what came after it in ways a snapshot cannot replay. The time and cost after a block run until Claude stopped again. Harness teams are also told at session start that the gate is on (the native team is not), so a block's direct effect is not the whole effect of adding Jev; the team-against-team comparison below includes the rest, along with run-to-run variance.`, '')
  L.push('| Team | Task | Stops checked | Jev calls | Blocks | Errors | Jev latency (median) | Jev cost | Claude time after blocks | Claude cost after blocks | Without the gate | With the gate |', '|---|---|---|---|---|---|---|---|---|---|---|---|')
  const sc = (x) => (!x ? 'n/a' : x.error ? `error: ${x.error.slice(0, 40)}` : `${x.success ? 'works' : 'broken'}${x.hidden ? ` (${x.hidden})` : ''}${x.recall != null ? ` (recall ${pct(x.recall)})` : ''}`)
  for (const r of gateRuns) {
    const d = r.decisionGate
    const cf = d.counterfactual || {}
    L.push(`| ${r.team} | ${r.task} | ${d.stops} | ${d.calls} | ${d.blocks} | ${d.errors}${d.errorTexts && d.errorTexts.length ? ` (${d.errorTexts[0].replace(/\|/g, '/').slice(0, 60)})` : ''} | ${d.msMedian == null ? 'n/a' : `${d.msMedian} ms`} | ${d.jev ? `$${d.jev.costUSD.toFixed(4)}${d.jev.estimated ? ' (est.)' : ''}` : 'n/a'} | ${d.blocks ? mins(d.extraSec) : '-'} | ${d.blocks ? usd(d.extraCostUSD) : '-'} | ${cf.applicable ? sc(cf.withoutGate) : 'not measurable'} | ${sc(cf.withGate)} |`)
  }
  L.push('')
  const measurable = gateRuns.filter((r) => r.decisionGate.counterfactual && r.decisionGate.counterfactual.applicable)
  const fixed = measurable.filter((r) => !r.decisionGate.counterfactual.withoutGate.success && r.decisionGate.counterfactual.withGate.success)
  const broke = measurable.filter((r) => r.decisionGate.counterfactual.withoutGate.success && !r.decisionGate.counterfactual.withGate.success)
  const blocked = gateRuns.filter((r) => r.decisionGate.blocks > 0)
  const ceiling = comparative.filter((t) => {
    const base = runs.filter((r) => r.task === t.id && !(teams.find((x) => x.id === r.team) || {}).decisionGate)
    return base.length && base.every((r) => r.success)
  })
  if (ceiling.length) L.push(`**Ceiling:** on ${ceiling.map((t) => t.id).join(', ')} every team without the gate already succeeded, so a gain in success cannot show there; those tasks measure only what the gate costs and whether it breaks anything.`, '')
  L.push(`Across ${gateRuns.length} runs with the gate: ${blocked.length} had at least one block (${sum(gateRuns.map((r) => r.decisionGate.blocks))} blocks in all). Of the ${measurable.length} runs where the result without the gate can be scored, the gate turned ${fixed.length} broken result(s) into working ones and ${broke.length} working result(s) into broken ones. Jev itself cost $${sum(gateRuns.map(jevCost)).toFixed(4)} in all; the Claude work it triggered cost ${usd(sum(gateRuns.map((r) => r.decisionGate.extraCostUSD || 0)))} and took ${mins(sum(gateRuns.map((r) => r.decisionGate.extraSec || 0)))}.`, '')
  const pairs = teams.filter((t) => t.extends && t.decisionGate && teamIds.includes(t.id) && teamIds.includes(t.extends))
  if (pairs.length) {
    L.push('**Each team with and without the gate**, over the tasks both sides ran (per task the median run, summed). The two sides ran at different times and possibly on different Claude Code versions, so differences include run-to-run variance; the gate table above shows what the blocks themselves did.', '')
    L.push('| Team | Tasks compared | Works without / with | Cost without / with (incl. Jev) | Time without / with | Claude Code without / with |', '|---|---|---|---|---|---|')
    for (const t of pairs) {
      const shared = comparative.filter((c) => runs.some((r) => r.team === t.extends && r.task === c.id) && runs.some((r) => r.team === t.id && r.task === c.id))
      const side = (team) => {
        const per = shared.map((c) => runs.filter((r) => r.team === team && r.task === c.id))
        return {
          works: sum(per.map((rs) => mean(rs.map((r) => (r.success ? 1 : 0))))),
          cost: sum(per.map((rs) => median(rs.map((r) => r.costUSD + jevCost(r))))),
          wall: sum(per.map((rs) => median(rs.map((r) => r.wallSec)))),
          versions: [...new Set(per.flat().map((r) => versionOf(r.label)))].join(', '),
        }
      }
      const a = side(t.extends), b = side(t.id)
      const f1 = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1))
      L.push(`| ${t.extends} | ${shared.length} | ${f1(a.works)}/${shared.length} / ${f1(b.works)}/${shared.length} | ${usd(a.cost)} / ${usd(b.cost)} | ${mins(a.wall)} / ${mins(b.wall)} | ${a.versions || '?'} / ${b.versions || '?'}${a.versions !== b.versions ? ' (differ)' : ''} |`)
    }
    L.push('')
  }
  const blockList = gateRuns.flatMap((r) => (r.decisionGate.events || []).filter((e) => e.blocked).map((e) => ({ r, e })))
  if (blockList.length) {
    L.push('**Every block**', '')
    for (const { r, e } of blockList) L.push(`- ${r.team} / ${r.task}, turn ${e.turn ?? '?'}${e.terminal && e.finalTurn ? ', last stop' : ''}: ${(e.reasons || []).join('; ').slice(0, 300)}. Claude then worked ${mins(e.afterSec)} more for ${usd(e.afterCostUSD)}.${e.scoreAtBlock ? ` At the block the work was ${sc(e.scoreAtBlock)}.` : ''} Message judged: "${String(e.message || '').replace(/\s+/g, ' ').slice(0, 200)}"`)
    L.push('')
  }
}

if (checks.length) {
  L.push('## Harness feature checks', '')
  L.push('| Check | Result | Time | Cost | Evidence |', '|---|---|---|---|---|')
  for (const task of checks) {
    for (const r of runs.filter((x) => x.task === task.id)) {
      L.push(`| ${task.id}: ${task.title} | ${r.success ? 'PASS' : 'FAIL'} | ${mins(r.wallSec)} | ${usd(r.costUSD)} | ${JSON.stringify(r.check ? r.check.details : r.errors).replace(/\|/g, '\\|').slice(0, 300)} |`)
    }
  }
  L.push('')
}

const errored = runs.filter((r) => r.errors && r.errors.length)
if (errored.length) {
  L.push('## Errors and timeouts', '')
  for (const r of errored) L.push(`- ${r.team} / ${r.task} t${r.trial}: ${r.errors.join('; ').slice(0, 300)}`)
  L.push('')
}

L.push('## Caveats', '')
L.push(`- One trial per cell unless stated: a single run cannot separate a real difference from run-to-run variance. Rerun with \`--trials 3\` (or new labels) and pool them with \`node bench/report.mjs <label> <label>\` before drawing firm conclusions.`)
L.push(`- Workflows run at most min(16, CPUs - 2) agents at once. On this ${cfg.cpus || '?'}-CPU machine that is ${cfg.cpus ? Math.max(1, Math.min(16, cfg.cpus - 2)) : '?'}, so harness wall times here are slower than on a typical laptop.`)
L.push('- The tasks are small and well specified. Larger, vaguer tasks favour whoever plans and verifies better; tiny ones favour whoever has the least overhead.')

const outName = labels.length > 1 ? 'REPORT-pooled.md' : 'REPORT.md'
const outDir = path.join(BENCH, 'results', labels[0])
writeFileSync(path.join(outDir, outName), L.join('\n') + '\n')
writeFileSync(path.join(outDir, labels.length > 1 ? 'summary-pooled.json' : 'summary.json'), JSON.stringify({ labels, generatedFrom: runs.length, totals, roleTotals, cells: Object.fromEntries(comparative.map((t) => [t.id, Object.fromEntries(teamIds.map((team) => [team, cell(team, t.id)]))])), ship: shipRuns.map((r) => ({ team: r.team, task: r.task, ...r.ship, success: r.success })), checks: runs.filter((r) => r.taskKind === 'check').map((r) => ({ task: r.task, pass: r.success, wallSec: r.wallSec, costUSD: r.costUSD, details: r.check && r.check.details })) }, null, 2))
console.log(`wrote ${path.join(outDir, outName)}`)
