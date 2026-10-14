export const meta = {
  name: 'audit',
  description: 'Sweep a directory for one concern with cheap finders, verify every finding adversarially, report what survived',
  whenToUse: 'Codebase-wide checks for a single concern: missing auth checks, unhandled errors, injection risks, a deprecated API, dead code. Usage: /harness:audit <concern> in <path>, or /harness:audit {"concern": "...", "path": "src"} to set options',
  phases: [
    { title: 'Scope', detail: 'Haiku lists the files worth looking at' },
    { title: 'Find', detail: 'One Sonnet finder per file' },
    { title: 'Verify', detail: 'Two Opus refuters vote on each finding' },
    { title: 'Rank', detail: 'Opus deduplicates, ranks and writes the report' },
  ],
}

// Accepts "missing auth checks in src/routes" or { concern, path, maxFiles }. A string that is a JSON
// object is read as the structured form, so the options survive being passed through a slash command as text.
const input = typeof args === 'string' ? parseFreeform(args) : (args || {})
function parseFreeform(s) {
  // Claude passes the options as the JSON text or, now and then, as that text JSON-encoded a second time.
  // Unwrap up to three layers so options are never silently lost.
  for (let i = 0; i < 3 && typeof s === 'string'; i++) {
    const t = s.trim()
    if (!t.startsWith('{') && !t.startsWith('"')) break
    try { s = JSON.parse(t) } catch { break }
  }
  if (s && typeof s === 'object' && !Array.isArray(s)) return s
  const m = String(s).match(/^(.*?)\s+in\s+(\S+)\s*$/i)
  return m ? { concern: m[1], path: m[2] } : { concern: String(s), path: '.' }
}
const CONCERN = String(input.concern || '').trim()
const PATH = String(input.path || '.').trim()
if (!CONCERN) throw new Error('Describe the concern: /harness:audit <concern> in <path>')
const MAX_FILES = Math.max(1, Math.min(Number(input.maxFiles) || 40, 200))
const MODELS = {
  scope: input.scopeModel || 'claude-haiku-5-5',
  find: input.findModel || 'claude-sonnet-5-5',
  verify: input.verifyModel || 'claude-opus-5-5',
  rank: input.rankModel || 'claude-opus-5-5',
}
// Verifiers are most of a run's cost; verifyEffort trades some scrutiny for money.
const VERIFY_EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'].includes(input.verifyEffort) ? input.verifyEffort : 'high'

const FILES = {
  type: 'object',
  required: ['files'],
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string' },
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
        required: ['title', 'line', 'evidence', 'severity'],
        properties: {
          title: { type: 'string' },
          line: { type: 'string' },
          evidence: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          fix: { type: 'string' },
        },
      },
    },
  },
}

const VOTE = {
  type: 'object',
  required: ['real', 'reason'],
  properties: {
    real: { type: 'boolean' },
    reason: { type: 'string' },
    severity: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
}

const REPORT = {
  type: 'object',
  required: ['markdown', 'issues'],
  properties: {
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
const scope = await agent(`List the files under "${PATH}" that are worth checking for this concern: "${CONCERN}".

Use Glob and Grep to find candidates (entry points, handlers, the modules that touch the relevant subsystem). Exclude tests, generated code, vendored dependencies, lockfiles and build output. Return at most ${MAX_FILES} paths, most relevant first, and a one-paragraph rationale. Do not read whole files.`, { model: MODELS.scope, effort: 'low', agentType: 'harness:scout', schema: FILES })

if (!scope || !scope.files || !scope.files.length) {
  return { concern: CONCERN, path: PATH, markdown: `No candidate files found under ${PATH} for "${CONCERN}".`, issues: [] }
}
const files = scope.files.slice(0, MAX_FILES)
log(`Checking ${files.length} file(s) for: ${CONCERN}`)

const found = await pipeline(files,
  f => agent(`Check ONE file for this concern: "${CONCERN}".

FILE: ${f}

Read the file and the callers or callees you need (Grep). Report only concrete instances of the concern in this file, each with a "path:line" location, the evidence (quote the code), a severity, and the fix. Hypotheticals, style and unrelated issues do not count. Return an empty findings list when the file is clean.`, { phase: 'Find', model: MODELS.find, effort: 'medium', schema: FINDINGS, label: f }),

  async (res, f) => {
    if (!res || !res.findings.length) return []
    const judged = await parallel(res.findings.map(fi => () =>
      parallel([1, 2].map(n => () =>
        agent(`Independently verify a reported instance of "${CONCERN}" in ${f}. Try to refute it. Default to real=false unless the code at the location really exhibits the concern when you check it yourself.

FINDING: ${fi.title} at ${fi.line} (${fi.severity})
EVIDENCE: ${fi.evidence}

Read the code at that location and whatever guards or callers would make it a false positive. Run a targeted command when that settles it. Set real=true only with a specific reason.`, { phase: 'Verify', model: MODELS.verify, effort: VERIFY_EFFORT, agentType: 'harness:refuter', schema: VOTE, label: `${f}: ${fi.title.slice(0, 40)} #${n}` })))
        .then(votes => {
          const v = votes.filter(Boolean)
          const real = v.length > 0 && v.every(x => x.real)
          return real ? { file: f, title: fi.title, line: fi.line, evidence: fi.evidence, fix: fi.fix || '', severity: (v[0] && v[0].severity) || fi.severity, reasons: v.map(x => x.reason) } : null
        })))
    return judged.filter(Boolean)
  },
)

const confirmed = found.filter(Boolean).flat()
log(`${confirmed.length} confirmed instance(s) of "${CONCERN}"`)

if (!confirmed.length) {
  return { concern: CONCERN, path: PATH, files_checked: files.length, markdown: `## Audit: ${CONCERN}\n\n${files.length} file(s) under ${PATH} checked; every reported instance was reviewed by two independent verifiers; none confirmed.`, issues: [] }
}

phase('Rank')
const report = await agent(`Write the audit report for "${CONCERN}" under ${PATH}. Every instance below was confirmed by two independent verifiers. Merge instances with the same root cause, rank by severity then by how many places are affected, and propose the smallest set of changes that fixes them all.

CONFIRMED (JSON)
${JSON.stringify(confirmed, null, 2)}

Return markdown for a human (summary, then the ranked list with file:line, evidence, fix) and the issues array.`, { model: MODELS.rank, effort: 'medium', schema: REPORT })

return {
  concern: CONCERN,
  path: PATH,
  files_checked: files.length,
  markdown: report ? report.markdown : 'Ranking stage failed; raw confirmed findings are in issues.',
  issues: report ? report.issues : confirmed,
}
