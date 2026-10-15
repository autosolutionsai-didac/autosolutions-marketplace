export const meta = {
  name: 'ship',
  description: 'Plan with Opus, build each unit with Sonnet in its own worktree, refute with Opus, fix refuted units with Opus, integrate, gate with Fable',
  whenToUse: 'A feature, fix or refactor that touches several files or deserves more than one pass. Usage: /harness:ship <what to build>, or /harness:ship {"task": "...", "maxUnits": 4} to set options',
  phases: [
    { title: 'Plan', detail: 'Opus splits the task into independent units' },
    { title: 'Build', detail: 'Sonnet implements each unit in an isolated git worktree' },
    { title: 'Refute', detail: 'Three Opus skeptics try to break each unit' },
    { title: 'Fix', detail: 'Opus fixes refuted units, then they are refuted again' },
    { title: 'Integrate', detail: 'Opus merges passing units into your branch and runs the full suite' },
    { title: 'Gate', detail: 'Fable issues the ship verdict' },
  ],
}

// ---------------------------------------------------------------------------
// Inputs
//   /harness:ship add rate limiting to the public API
//   or structured: { task, maxUnits, integrate, planModel, buildModel, fixModel, refuteModel, gateModel }
//   A string that is a JSON object is read as the structured form, so the options survive
//   being passed through a slash command as text.
// ---------------------------------------------------------------------------
function parseArgs(a) {
  // Claude passes the options as an object, as the JSON text, or now and then as that text JSON-encoded a
  // second time ("\"{\\\"task\\\": ...}\""). Unwrap up to three layers so options are never silently lost.
  for (let i = 0; i < 3 && typeof a === 'string'; i++) {
    const t = a.trim()
    if (!t.startsWith('{') && !t.startsWith('"')) break
    try { a = JSON.parse(t) } catch { break }
  }
  if (a && typeof a === 'object' && !Array.isArray(a)) return a
  return { task: String(a || '').trim() }
}
const input = parseArgs(args)
const task = String(input.task || '').trim()
if (!task) throw new Error('Describe the task: /harness:ship <what to build>')

const MAX_UNITS = Math.max(1, Math.min(Number(input.maxUnits) || 6, 12))
const INTEGRATE = input.integrate !== false
const MODELS = {
  plan: input.planModel || 'claude-opus-5-5',
  build: input.buildModel || 'claude-sonnet-5-5',
  // A refuted unit gets one more attempt before it is dropped, and it has already shown it is
  // harder than its spec suggested, so the retry runs on the stronger model. Fixes only run for
  // refuted units, so this costs little next to the three refuters every unit gets.
  fix: input.fixModel || 'claude-opus-5-5',
  refute: input.refuteModel || 'claude-opus-5-5',
  gate: input.gateModel || 'fable',
}
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
// Refuters are most of a ship run's cost; refuteEffort and refuteLenses trade some scrutiny for money.
const REFUTE_EFFORT = EFFORTS.includes(input.refuteEffort) ? input.refuteEffort : 'high'

// ---------------------------------------------------------------------------
// Schemas: every stage returns typed data, never prose, so the script can branch
// ---------------------------------------------------------------------------
const CHECKS = {
  type: 'object',
  required: ['ran', 'passed', 'commands'],
  properties: {
    ran: { type: 'boolean' },
    passed: { type: 'boolean' },
    commands: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

const PLAN = {
  type: 'object',
  required: ['base_branch', 'shared_context', 'units'],
  properties: {
    base_branch: { type: 'string' },
    shared_context: { type: 'string' },
    units: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'spec', 'files', 'acceptance'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          spec: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          acceptance: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

const BUILD = {
  type: 'object',
  required: ['unit_id', 'branch', 'worktree_path', 'summary', 'files_changed', 'checks'],
  properties: {
    unit_id: { type: 'string' },
    branch: { type: 'string' },
    worktree_path: { type: 'string' },
    summary: { type: 'string' },
    files_changed: { type: 'array', items: { type: 'string' } },
    checks: CHECKS,
    assumptions: { type: 'array', items: { type: 'string' } },
  },
}

const VERDICT = {
  type: 'object',
  required: ['refuted', 'severity', 'findings'],
  properties: {
    refuted: { type: 'boolean' },
    severity: { type: 'string', enum: ['blocking', 'major', 'minor', 'none'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'evidence', 'fix'],
        properties: {
          title: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
    ran: { type: 'array', items: { type: 'string' } },
  },
}

const INTEGRATION = {
  type: 'object',
  required: ['merged', 'skipped', 'checks', 'summary'],
  properties: {
    merged: { type: 'array', items: { type: 'string' } },
    skipped: { type: 'array', items: { type: 'string' } },
    conflicts: { type: 'array', items: { type: 'string' } },
    checks: CHECKS,
    summary: { type: 'string' },
  },
}

const GATE = {
  type: 'object',
  required: ['verdict', 'confidence', 'blocking', 'advisory', 'summary'],
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    blocking: { type: 'array', items: { type: 'string' } },
    advisory: { type: 'array', items: { type: 'string' } },
    verified: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------
const planPrompt = () => `You are planning an implementation that other agents will build IN PARALLEL, each in its own git worktree.

TASK
${task}

Do this:
1. Explore the repository enough to understand where the change lands. Use Glob, Grep and targeted Read. Stay focused.
2. Record the current branch name as base_branch (run: git branch --show-current).
3. Split the task into at most ${MAX_UNITS} INDEPENDENT units. Independent means a unit can be implemented, tested and merged without another unit's changes existing, and no two units edit the same file. If the task cannot be split safely, return exactly one unit.
4. For each unit: a stable id (u1, u2, ...), a short title, a precise spec (what to change, where, how, following the repository's conventions), the files it will touch, and acceptance criteria a reviewer can check (tests that must pass, behaviours that must hold). When the task states a rule, the criteria say it must hold for every input the changed code accepts (find the range from its types, its validation and its callers), not only for the task's examples, and name the cases the examples leave out that apply here: boundaries, zero, non-integers, negatives, very large or empty values.
5. In shared_context, write the facts every builder needs: conventions, how to run the tests, how to run the type checker or linter, gotchas you found.

Do not implement anything.`

const buildPrompt = (u, shared, base) => `Implement ONE unit of a larger change. You are in a fresh git worktree on a new branch. Other units are being built in parallel elsewhere, so touch only your files.

UNIT ${u.id}: ${u.title}

SPEC
${u.spec}

FILES YOU OWN
${u.files.map(f => `- ${f}`).join('\n')}

ACCEPTANCE CRITERIA
${u.acceptance.map(a => `- ${a}`).join('\n')}

SHARED CONTEXT FROM THE PLANNER
${shared}

Make the change hold for every input the code accepts, not only the examples in the spec, and test at least one case beyond them.

When done: run the relevant checks, commit your work on the current branch with a clear message, then report. Fill unit_id with "${u.id}", branch with the output of "git branch --show-current", worktree_path with the output of "git rev-parse --show-toplevel", and checks with exactly what you ran and whether it passed. Never claim a check passed that you did not run.`

const fixPrompt = (u, build, refutation) => `A unit you (or a colleague) built was REFUTED by reviewers. Fix it in place.

UNIT ${u.id}: ${u.title}
Work ONLY inside this existing worktree, using absolute paths: ${build.worktree_path} (branch ${build.branch}).

ORIGINAL SPEC
${u.spec}

ACCEPTANCE CRITERIA
${u.acceptance.map(a => `- ${a}`).join('\n')}

WHAT THE REVIEWERS FOUND
${refutation.votes.flatMap(v => v.findings).map(f => `- ${f.title}\n  evidence: ${f.evidence}\n  suggested fix: ${f.fix}`).join('\n') || '- (no itemised findings; the reviewers judged the change unproven. Add the missing verification.)'}

Address every finding, re-run the checks, commit on the same branch, and report with the same structure as before (unit_id "${u.id}", branch, worktree_path, files_changed, checks).`

const refutePrompt = (u, build, lens, focus) => `Try to REFUTE the claim that this unit is correct and complete. Lens: ${lens}. ${focus}

UNIT ${u.id}: ${u.title}
Branch ${build.branch} in worktree ${build.worktree_path}. The unit's commits are the newest ones on that branch: inspect them with git -C "${build.worktree_path}" log -p --stat -n 5, and run tests from inside that directory (cd "${build.worktree_path}" first). Read any file you need there with its absolute path.

SPEC
${u.spec}

ACCEPTANCE CRITERIA
${u.acceptance.map(a => `- ${a}`).join('\n')}

BUILDER'S REPORT
${build.summary}
Checks claimed: ${build.checks.commands.join('; ') || 'none'} -> ran=${build.checks.ran}, passed=${build.checks.passed}

Set refuted=true only for real defects relative to the spec and acceptance criteria, with evidence from the diff or from a command you ran. Preferences are not defects. If you could not prove it either way, set refuted=true with severity "minor" and say what is unproven. List the commands you ran in "ran".`

const integratePrompt = (base, passed, failed) => `Integrate the units that passed review into the current branch (${base}) of the MAIN checkout (your current directory). Do not push.

UNITS TO MERGE
${passed.map(r => `- ${r.unit.id} "${r.unit.title}": branch ${r.build.branch} (worktree ${r.build.worktree_path})\n  files: ${r.build.files_changed.join(', ')}`).join('\n')}

UNITS THAT FAILED REVIEW (do NOT merge; just mention them in the summary)
${failed.map(r => `- ${r.unit.id} "${r.unit.title}": ${r.status}`).join('\n') || '- none'}

Steps:
1. Confirm you are on ${base} and the tree is clean enough to merge (git status). If there are unrelated uncommitted changes, stash nothing and do not discard anything; merge on top and say so.
2. git merge --no-ff each branch in the order listed. Resolve conflicts carefully, preserving both units' intent. Record each conflict you resolved.
3. Run the FULL test suite and any type check or lint the repo uses. Fix integration breakage if it is small and clearly caused by the merge; otherwise record it and mark the unit as skipped by reverting its merge.
4. Report merged branches, skipped branches, conflicts, checks (commands, ran, passed) and a short summary for the pull request.`

const gatePrompt = (base, results, integration) => `You are the final release gate for this change. Decide PASS or FAIL.

ORIGINAL REQUEST
${task}

UNITS
${results.map(r => `- ${r.unit.id} "${r.unit.title}": ${r.status}` + (r.refutation ? ` (refuted by ${r.refutation.refutedCount}/${r.refutation.votes.length} reviewers${r.firstRefutation ? ', after one fix round' : ''})` : '')).join('\n')}

REVIEWER FINDINGS THAT SURVIVED (advisories from dissenting reviewers on passing units)
${results.filter(r => r.status === 'passed').flatMap(r => r.refutation.votes.filter(v => v.refuted).flatMap(v => v.findings.map(f => `- [${r.unit.id}] ${f.title}: ${f.evidence}`))).join('\n') || '- none'}

INTEGRATION
${integration ? `merged: ${integration.merged.join(', ') || 'none'}; skipped: ${integration.skipped.join(', ') || 'none'}; conflicts: ${(integration.conflicts || []).join('; ') || 'none'}\nchecks: ${integration.checks.commands.join('; ') || 'none'} -> ran=${integration.checks.ran}, passed=${integration.checks.passed}\n${integration.summary}` : 'Integration was skipped; passing units remain on their worktree branches.'}

The integrated change is on branch ${base} in your current directory (git log, git diff ${base}@{1}..${base} or git show for the merge commits). Start from the diff and the evidence above. Re-run only the decisive check, and when the request states a rule, try it on a few inputs the code accepts beyond the request's examples (boundaries, non-integers, extremes). FAIL if the request is not fully met, if something that worked is now broken, or if a claim that matters cannot be verified. List blocking issues with evidence and what must change; list advisories separately; list what you verified yourself.`

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------
const ALL_LENSES = [
  ['correctness', 'Does the code do what the spec says for every input it accepts, not only the examples in the spec? Find the accepted range from the types, the validation and the callers, and test the rule across it: boundaries, zero, non-integers, negatives, very large or empty values. Where the spec states a rule, compare the code with a simple independent reference over many inputs (a quick loop) when that is cheap. Trace the logic and execute it.'],
  ['edges-and-regressions', 'Hunt edge cases, error paths, concurrency, and existing callers or tests this change breaks.'],
  ['verification', 'Did the builder actually verify this? Re-run the claimed checks and look for acceptance criteria with no test behind them.'],
]
// refuteLenses names the lenses to run (default: all three). With two, a unit passes only if neither refutes it.
const LENSES = Array.isArray(input.refuteLenses) && input.refuteLenses.length ? ALL_LENSES.filter(([name]) => input.refuteLenses.includes(name)) : ALL_LENSES
if (!LENSES.length) throw new Error(`refuteLenses must name at least one of: ${ALL_LENSES.map(([n]) => n).join(', ')}`)

const refute = async (u, build) => {
  const votes = (await parallel(LENSES.map(([lens, focus]) => () =>
    agent(refutePrompt(u, build, lens, focus), {
      phase: 'Refute', model: MODELS.refute, effort: REFUTE_EFFORT, agentType: 'harness:refuter', schema: VERDICT, label: `${u.id} ${lens}`,
    })))).filter(Boolean)
  const refutedCount = votes.filter(v => v.refuted).length
  // Majority rule: a unit passes when fewer than half of the reviewers who answered refuted it.
  const passed = votes.length > 0 && refutedCount * 2 < votes.length
  return { votes, refutedCount, passed, missing: LENSES.length - votes.length }
}

phase('Plan')
log(`Planning: ${task.slice(0, 140)}`)
const plan = await agent(planPrompt(), { model: MODELS.plan, effort: 'high', schema: PLAN })
if (!plan || !plan.units || !plan.units.length) throw new Error('Planning produced no units')
log(`${plan.units.length} unit(s) on base ${plan.base_branch}: ${plan.units.map(u => u.id).join(', ')}`)

const results = (await pipeline(plan.units,
  u => agent(buildPrompt(u, plan.shared_context, plan.base_branch), {
    phase: 'Build', model: MODELS.build, effort: 'medium', agentType: 'harness:builder', isolation: 'worktree', schema: BUILD, label: `${u.id} build`,
  }),
  async (build, u) => {
    if (!build) return { unit: u, status: 'build-failed' }
    const first = await refute(u, build)
    if (first.passed) return { unit: u, build, refutation: first, status: 'passed' }
    log(`${u.id} refuted by ${first.refutedCount}/${first.votes.length}, fixing once`)
    const fixed = await agent(fixPrompt(u, build, first), {
      phase: 'Fix', model: MODELS.fix, effort: 'medium', agentType: 'harness:builder', schema: BUILD, label: `${u.id} fix`,
    })
    if (!fixed) return { unit: u, build, refutation: first, status: 'failed' }
    const second = await refute(u, fixed)
    return { unit: u, build: fixed, refutation: second, firstRefutation: first, status: second.passed ? 'passed' : 'failed' }
  },
)).map((r, i) => r || { unit: plan.units[i], status: 'build-failed' })

const passed = results.filter(r => r.status === 'passed')
const failed = results.filter(r => r.status !== 'passed')
log(`${passed.length} passed, ${failed.length} failed or unbuilt`)

let integration = null
if (INTEGRATE && passed.length) {
  phase('Integrate')
  integration = await agent(integratePrompt(plan.base_branch, passed, failed), { model: MODELS.plan, effort: 'high', schema: INTEGRATION })
}

let gate = null
if (passed.length) {
  phase('Gate')
  gate = await agent(gatePrompt(plan.base_branch, results, integration), {
    model: MODELS.gate, effort: 'high', agentType: 'harness:judge', schema: GATE, label: 'fable gate',
  })
}

return {
  task,
  base_branch: plan.base_branch,
  verdict: gate ? gate.verdict : 'FAIL',
  gate,
  integration,
  units: results.map(r => ({
    id: r.unit.id,
    title: r.unit.title,
    status: r.status,
    branch: r.build ? r.build.branch : null,
    worktree: r.build ? r.build.worktree_path : null,
    checks: r.build ? r.build.checks : null,
    refuted_by: r.refutation ? `${r.refutation.refutedCount}/${r.refutation.votes.length}` : null,
    findings: r.refutation ? r.refutation.votes.flatMap(v => v.findings) : [],
  })),
  next_steps: gate && gate.verdict === 'PASS'
    ? ['Review the merge commits on your branch, then push or open the PR.']
    : ['Read gate.blocking and units[].findings, fix, then rerun /harness:ship or /harness:review.'],
}
