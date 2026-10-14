// The decision gate's questions and rules, shared by the Stop hook (decision-gate.mjs) and by tools that
// replay its decisions. The model only answers the questions; this code owns the thresholds.

// Decision models read instructions literally, so each question says exactly what counts. Past problems a
// message reports as fixed are not unresolved: a summary of a bug fix names the bug.
export const QUESTIONS = {
  claims_done: 'The assistant\'s final message states or implies that the requested work is complete, finished, fixed, implemented or ready.',
  cites_verification: 'The final message reports concrete verification the assistant performed itself this turn: a test, build, lint or type-check command that was run with its result, or a behaviour it observed by running the code.',
  unresolved_problem: 'By the final message\'s own account, something is still wrong or unfinished now that the turn is over: a test that still fails, an error that still happens, a TODO left in place, or a part of the request not done. Problems the message reports as fixed, and failures it saw before making a fix, do not count.',
  deferred_to_user: 'The final message asks or expects the user to run a test, check a result, verify behaviour, or complete a step that the assistant could have done itself.',
}

// The questions as worded through 1.1.0's first benchmark runs, kept so their decisions can be replayed.
export const QUESTIONS_V1 = {
  ...QUESTIONS,
  unresolved_problem: 'The final message mentions a failing test, an error, a crash, a TODO, a known bug or a part of the request that is still not done.',
}

// Documents and data a turn can write without code changing: a report, notes, a JSON answer file. Package
// manifests, TypeScript configs and CI files are code for this purpose.
const DOC_FILE = /\.(md|mdx|markdown|txt|rst|adoc|json|ya?ml|csv|tsv)$/i
const CODE_CONFIG = /(^|\/)((package|package-lock|composer|deno|tsconfig[^/]*|jsconfig)\.jsonc?|\.github\/.*)$/i

// True when everything the turn left changed (edited files and the working tree's uncommitted changes) is a
// document or data file, so there is nothing to test. Commits made this turn may hold code, so they count
// against it. Commands that only read or check (node -e, python -c) do not matter: what changed does.
export function docsOnly({ files = [], commits = 0 }) {
  const changed = files.filter((f) => f && !/(^|\/)\.claude(\/|$)/.test(f))
  return changed.length > 0 && commits === 0 && changed.every((f) => DOC_FILE.test(f) && !CODE_CONFIG.test(f))
}

// p: the backend's probability per question. Returns the reasons to send Claude back (empty: let it stop).
export function decide(p, { testsRun = 0, docsOnly: onlyDocs = false } = {}, T = 0.7) {
  const reasons = []
  const verified = testsRun > 0 || p.cites_verification >= 0.5
  if (p.claims_done >= T && !verified && !onlyDocs) reasons.push(`you report the work as done but no test, build or check command ran this turn and the message cites no verification (p_done=${p.claims_done.toFixed(2)}, p_verified=${p.cites_verification.toFixed(2)})`)
  if (p.unresolved_problem >= T + 0.05) reasons.push(`the message says something is still failing, broken or unfinished (p=${p.unresolved_problem.toFixed(2)})`)
  if (p.deferred_to_user >= T + 0.05) reasons.push(`the message leaves verification or a step to the user that you can do yourself (p=${p.deferred_to_user.toFixed(2)})`)
  return reasons
}
