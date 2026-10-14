// A local stand-in for a System One decision API (TypeSafe Jev's POST /v1/systemone shape), so the
// harness decision gate can be exercised end to end without a paid key. It answers the gate's four
// questions with fixed rules over the final message and the evidence the hook sends, and logs every call.
import http from 'node:http'

const CLAIMS_DONE = /\b(done|complete|completed|finished|fixed|implemented|ready|added)\b/i
const CITES_VERIFICATION = /(node --test|npm (run )?test|tests? (pass|passed|ran)|\d+\/\d+ (pass|tests)|# pass|all \d+ tests|suite (passes|passed))/i
const UNRESOLVED = /\b(failing|still fails|todo|not yet|unresolved|could not)\b/i
const DEFERRED = /\b(you (can|should|may want to) (run|verify|check)|please (run|verify|check))\b/i

// mode 'block' reports an unresolved problem in every message, so the gate sends Claude back at the first
// stop of every turn: for testing the benchmark's wiring of the gate, never for scoring a team.
export async function startMockDecisionServer({ mode = 'rules' } = {}) {
  const calls = []
  const server = http.createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    let body = {}
    try { body = JSON.parse(raw) } catch {}
    const state = body.state || {}
    const msg = String(state.final_message || '')
    const ran = (state.test_or_check_commands_run_this_turn || []).length > 0
    const answers = {
      claims_done: { noul: CLAIMS_DONE.test(msg) ? 0.95 : 0.1 },
      cites_verification: { noul: CITES_VERIFICATION.test(msg) || ran ? 0.9 : 0.05 },
      unresolved_problem: { noul: mode === 'block' || UNRESOLVED.test(msg) ? 0.9 : 0.05 },
      deferred_to_user: { noul: DEFERRED.test(msg) ? 0.9 : 0.05 },
    }
    calls.push({ path: req.url, authorized: req.headers.authorization === 'Bearer bench-mock', final_message: msg.slice(0, 300), tests_run: state.test_or_check_commands_run_this_turn || [], answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v.noul])) })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ model: 'mock-jev', answers, usage: { input_tokens: Math.ceil(raw.length / 4) } }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}`, calls, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r) }) }
}
