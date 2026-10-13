export const meta = {
  name: 'review',
  description: 'Review every changed file in parallel, verify each finding adversarially, return one ranked report',
  whenToUse: 'Before opening a PR or merging a branch. Usage: /harness:review [base-branch]  (default: main), or /harness:review {"base": "main", "focus": "..."} to set options',
  phases: [
    { title: 'Scope', detail: 'List the files changed against the base branch' },
    { title: 'Find', detail: 'One Sonnet reviewer per changed file' },
    { title: 'Verify', detail: 'An Opus refuter confirms or dismisses each finding' },
    { title: 'Rank', detail: 'Opus merges, deduplicates and ranks what survived' },
  ],
}

// Accepts "main", or { base, maxFiles, focus, ... }. A string that is a JSON object is read as the
// structured form, so the options survive being passed through a slash command as text.
function parseArgs(a) {
  if (a && typeof a === 'object') return a
  const s = String(a || '').trim()
  if (s.startsWith('{')) {
    try { const o = JSON.parse(s); if (o && typeof o === 'object' && !Array.isArray(o)) return o } catch {}
  }
  return { base: s }
}
const input = parseArgs(args)
const BASE = String(input.base || 'main').trim()
const MAX_FILES = Math.max(1, Math.min(Number(input.maxFiles) || 40, 200))
const FOCUS = String(input.focus || '').trim()
const MODELS = {
  scope: input.scopeModel || 'claude-haiku-5-5',
  find: input.findModel || 'claude-sonnet-5-5',
  verify: input.verifyModel || 'claude-opus-5-5',
  rank: input.rankModel || 'claude-opus-5-5',
}

const FILES = {
  type: 'object',
  required: ['base_ref', 'files'],
  properties: {
    base_ref: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    skipped: { type: 'array', items: { type: 'string' } },
  },
}

const FINDINGS = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'severity', 'line', 'evidence', 'fix'],
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['blocking', 'major', 'minor'] },
          line: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
  },
}

const VERIFY = {
  type: 'object',
  required: ['confirmed', 'reason'],
  properties: {
    confirmed: { type: 'boolean' },
    reason: { type: 'string' },
    severity: { type: 'string', enum: ['blocking', 'major', 'minor'] },
    ran: { type: 'array', items: { type: 'string' } },
  },
}

const REPORT = {
  type: 'object',
  required: ['verdict', 'markdown', 'issues'],
  properties: {
    verdict: { type: 'string', enum: ['ready', 'needs-changes'] },
    markdown: { type: 'string' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'file', 'title'],
        properties: {
          severity: { type: 'string' },
          file: { type: 'string' },
          title: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
  },
}

phase('Scope')
const scope = await agent(`List the files to review for a code review of the current branch against "${BASE}".

Run: git diff --name-only --diff-filter=ACMR ${BASE}...HEAD, then git status --porcelain for uncommitted work (include modified and untracked source files). If "${BASE}" is not a valid ref, try origin/${BASE}, then master, and record what you used in base_ref.

Return only reviewable source and config files. Put lockfiles, generated bundles, minified assets, binary files, vendored dependencies and files over roughly 3000 lines in "skipped" with the reason. Do not read file contents.`, { model: MODELS.scope, effort: 'low', schema: FILES })

if (!scope || !scope.files || !scope.files.length) {
  return { verdict: 'ready', base: BASE, markdown: `No reviewable changes found against ${BASE}.`, issues: [] }
}
const files = scope.files.slice(0, MAX_FILES)
if (scope.files.length > MAX_FILES) log(`Capped at ${MAX_FILES} files; ${scope.files.length - MAX_FILES} not reviewed: ${scope.files.slice(MAX_FILES).join(', ')}`)
if (scope.skipped && scope.skipped.length) log(`Skipped: ${scope.skipped.join(', ')}`)
log(`Reviewing ${files.length} file(s) against ${scope.base_ref}`)

const reviewed = await pipeline(files,
  f => agent(`Review ONE changed file for a pull request against ${scope.base_ref}. File: ${f}

Get the change with: git diff ${scope.base_ref}...HEAD -- "${f}" (plus git diff -- "${f}" for uncommitted edits; if the file is untracked, read it whole). Read enough surrounding code and callers (Grep) to judge the change in context.${FOCUS ? `\n\nReviewer focus requested by the user: ${FOCUS}` : ''}

Report only defects: wrong behaviour, bugs, missing error handling on real paths, broken callers, security issues, missing tests for new behaviour, misleading names that will cause bugs. Do not report style, formatting or preferences. For each finding give the line (as "path:line"), concrete evidence, and the fix. If the file is fine, return an empty findings list.`, { phase: 'Find', model: MODELS.find, effort: 'medium', schema: FINDINGS, label: f }),

  async (found, f) => {
    if (!found || !found.findings.length) return []
    const verdicts = await parallel(found.findings.map(fi => () =>
      agent(`A reviewer reported a defect in ${f}. Verify it or dismiss it. Default to NOT confirmed unless the evidence holds up when you check it yourself.

FINDING: ${fi.title} (${fi.severity}) at ${fi.line}
EVIDENCE: ${fi.evidence}
PROPOSED FIX: ${fi.fix}

Read the code at that location (git diff ${scope.base_ref}...HEAD -- "${f}", then the file), trace callers with Grep, and run a targeted test or a quick script when that settles it. Confirm only a real defect relative to how the code is used; a preference, a hypothetical that the code already guards against, or an issue that exists identically on ${scope.base_ref} and is unrelated to this change is NOT confirmed. Set the severity you would assign.`, { phase: 'Verify', model: MODELS.verify, effort: 'high', agentType: 'harness:refuter', schema: VERIFY, label: `${f}: ${fi.title.slice(0, 50)}` })))
    return found.findings
      .map((fi, i) => ({ ...fi, file: f, verdict: verdicts[i] }))
      .filter(x => x.verdict && x.verdict.confirmed)
      .map(x => ({ file: x.file, title: x.title, line: x.line, severity: x.verdict.severity || x.severity, evidence: x.evidence, fix: x.fix, verified_by: x.verdict.reason }))
  },
)

const confirmed = reviewed.filter(Boolean).flat()
log(`${confirmed.length} confirmed finding(s) across ${files.length} file(s)`)

if (!confirmed.length) {
  return { verdict: 'ready', base: scope.base_ref, files_reviewed: files.length, markdown: `## Review against ${scope.base_ref}\n\n${files.length} file(s) reviewed, every finding was checked by a second model, nothing confirmed. Ready for a human pass.`, issues: [] }
}

phase('Rank')
const report = await agent(`Write the final code review report. Every finding below was confirmed by an independent verifier; do not re-litigate them, but DO merge duplicates (same root cause reported in several files) and order by severity, then by blast radius.

BASE: ${scope.base_ref}   FILES REVIEWED: ${files.length}

CONFIRMED FINDINGS (JSON)
${JSON.stringify(confirmed, null, 2)}

Return verdict "needs-changes" if any blocking or major issue remains, otherwise "ready". In markdown, write a report a human will read in the PR: a two-line summary, then one section per severity with file:line, what is wrong, why it matters, and the fix. Keep it tight. Also return the issues array (severity, file, title, fix).`, { model: MODELS.rank, effort: 'medium', schema: REPORT })

return {
  verdict: report ? report.verdict : 'needs-changes',
  base: scope.base_ref,
  files_reviewed: files.length,
  markdown: report ? report.markdown : 'Ranking stage failed; raw confirmed findings are in issues.',
  issues: report ? report.issues : confirmed,
}
