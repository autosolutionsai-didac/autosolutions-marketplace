#!/usr/bin/env node
// openai-judge: a dependency-free MCP server (stdio, newline-delimited JSON-RPC 2.0) that gives Claude Code
// a second opinion from a different model family through the OpenAI Responses API.
//
// Tools
//   gpt_review  { diff?, base?, focus?, model?, effort? }  -> structured review of a git diff (JSON + markdown)
//   gpt_opinion { question, context?, model?, effort? }    -> free-form second opinion on a plan, design or claim
//
// Config (env, or plugin options forwarded by .mcp.json)
//   OPENAI_API_KEY | OPENAI_API_KEY_FROM_PLUGIN        required to call OpenAI
//   OPENAI_JUDGE_MODEL | OPENAI_JUDGE_MODEL_FROM_PLUGIN default gpt-6-sol
//   OPENAI_BASE_URL                                     default https://api.openai.com
//
// Nothing is sent anywhere until a tool is called. The server starts fine without a key and reports
// the missing key as a tool error, so the plugin can stay enabled on machines that don't use OpenAI.

import { execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline'

const VERSION = '1.0.0'
const MAX_DIFF_CHARS = 120000

// Ignores empty values and unresolved "${user_config.*}" placeholders.
const env = (...names) => {
  for (const n of names) { const v = process.env[n]; if (typeof v === 'string' && v.trim() && !v.trim().startsWith('${')) return v.trim() }
  return ''
}
const apiKey = () => env('OPENAI_API_KEY', 'OPENAI_API_KEY_FROM_PLUGIN')
const defaultModel = () => env('OPENAI_JUDGE_MODEL', 'OPENAI_JUDGE_MODEL_FROM_PLUGIN') || 'gpt-6-sol'
const baseUrl = () => (env('OPENAI_BASE_URL') || 'https://api.openai.com').replace(/\/+$/, '')

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'confidence', 'summary', 'blocking', 'major', 'minor', 'questions'],
  properties: {
    verdict: { type: 'string', enum: ['approve', 'request-changes'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    summary: { type: 'string' },
    blocking: { type: 'array', items: FINDING() },
    major: { type: 'array', items: FINDING() },
    minor: { type: 'array', items: FINDING() },
    questions: { type: 'array', items: { type: 'string' } },
  },
}
function FINDING() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'location', 'why', 'fix'],
    properties: {
      title: { type: 'string' },
      location: { type: 'string' },
      why: { type: 'string' },
      fix: { type: 'string' },
    },
  }
}

const TOOLS = [
  {
    name: 'gpt_review',
    description: 'Adversarial code review from a GPT model (different model family from Claude). Reviews a git diff and returns a structured verdict: blocking/major/minor findings with locations and fixes. If no diff is passed, it diffs the current branch against `base` (default main) plus uncommitted changes.',
    inputSchema: {
      type: 'object',
      properties: {
        diff: { type: 'string', description: 'Unified diff to review. Optional; computed from git when omitted.' },
        base: { type: 'string', description: 'Base ref to diff against when diff is omitted. Default: main' },
        focus: { type: 'string', description: 'What to pressure-test (e.g. "race conditions in the retry path"). Optional.' },
        context: { type: 'string', description: 'What the change is supposed to do, acceptance criteria, anything the reviewer should know. Optional but recommended.' },
        model: { type: 'string', description: 'OpenAI model id. Default from OPENAI_JUDGE_MODEL (gpt-6-sol). Use gpt-6-astra for the flagship.' },
        effort: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Reasoning effort. Default: high' },
      },
    },
  },
  {
    name: 'gpt_opinion',
    description: 'Free-form second opinion from a GPT model on a plan, design decision, root-cause theory or claim. Returns markdown. Use when two Claude models agreeing is not enough and you want an independent family to disagree.',
    inputSchema: {
      type: 'object',
      required: ['question'],
      properties: {
        question: { type: 'string', description: 'The question or claim to challenge.' },
        context: { type: 'string', description: 'Relevant code, plan or facts. Optional.' },
        model: { type: 'string' },
        effort: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
    },
  },
]

function gitDiff(base) {
  const cwd = process.cwd()
  const run = (args) => { try { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }) } catch { return '' } }
  const ref = base || 'main'
  const committed = run(['diff', `${ref}...HEAD`]) || run(['diff', `origin/${ref}...HEAD`])
  const working = run(['diff', 'HEAD'])
  const untracked = run(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean).slice(0, 40)
  let untrackedBlobs = ''
  for (const f of untracked) {
    const body = run(['show', `:${f}`]) || (() => { try { return execFileSync('cat', [f], { cwd, encoding: 'utf8', timeout: 5000 }) } catch { return '' } })()
    if (body) untrackedBlobs += `\n--- NEW FILE ${f} ---\n${body.slice(0, 20000)}\n`
  }
  return { ref, diff: [committed, working, untrackedBlobs].filter(Boolean).join('\n') }
}

function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n)}\n\n[... truncated ${s.length - n} characters; review was done on the first ${n} ...]` : s
}

async function responses(body) {
  const key = apiKey()
  if (!key) throw new Error('OPENAI_API_KEY is not set. Export it in the shell that starts Claude Code, or set the plugin option "OpenAI API key" in /config.')
  const res = await fetch(`${baseUrl()}/v1/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${text.slice(0, 500)}`)
  return JSON.parse(text)
}

function outputText(json) {
  if (typeof json.output_text === 'string' && json.output_text) return json.output_text
  const parts = []
  for (const item of json.output || []) {
    if (item && item.type === 'message' && Array.isArray(item.content)) {
      for (const c of item.content) if (c && (c.type === 'output_text' || c.type === 'text') && typeof c.text === 'string') parts.push(c.text)
    }
  }
  return parts.join('\n')
}

function parseJsonLoose(text) {
  try { return JSON.parse(text) } catch {}
  const m = text.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch {} }
  throw new Error(`Model did not return JSON: ${text.slice(0, 300)}`)
}

async function callStructured({ model, effort, system, user, schema, name }) {
  const base = { model, reasoning: { effort }, input: [{ role: 'developer', content: system }, { role: 'user', content: user }] }
  try {
    const json = await responses({ ...base, text: { format: { type: 'json_schema', name, strict: true, schema } } })
    return { data: parseJsonLoose(outputText(json)), model: json.model || model, usage: json.usage || null }
  } catch (e) {
    // Older or differently shaped endpoints: fall back to plain JSON instructions.
    if (!/text\.format|json_schema|unknown parameter|unsupported/i.test(String(e.message))) throw e
    const json = await responses({ ...base, input: [{ role: 'developer', content: `${system}\n\nReturn ONLY a JSON object matching this schema:\n${JSON.stringify(schema)}` }, { role: 'user', content: user }] })
    return { data: parseJsonLoose(outputText(json)), model: json.model || model, usage: json.usage || null }
  }
}

async function gptReview(a) {
  const effort = a.effort || 'high'
  const model = a.model || defaultModel()
  let diff = a.diff, ref = a.base || 'main'
  if (!diff) { const d = gitDiff(a.base); diff = d.diff; ref = d.ref }
  if (!diff || !diff.trim()) return { content: [{ type: 'text', text: `No changes to review against ${ref}.` }] }
  diff = truncate(diff, MAX_DIFF_CHARS)
  const system = 'You are an adversarial senior code reviewer from a different vendor than the model that wrote this change. Your job is to find the real defects before merge: wrong behaviour, missed edge cases, broken callers, security and data-loss paths, missing tests for new behaviour, misleading claims of verification. Do not report style or preferences. Every finding needs a location (path:line or hunk), why it matters, and a concrete fix. Return request-changes when any blocking or major finding exists. Be precise and brief.'
  const user = `${a.context ? `WHAT THE CHANGE IS SUPPOSED TO DO\n${a.context}\n\n` : ''}${a.focus ? `PRESSURE-TEST SPECIFICALLY\n${a.focus}\n\n` : ''}DIFF AGAINST ${ref}\n\`\`\`diff\n${diff}\n\`\`\``
  const { data, model: served, usage } = await callStructured({ model, effort, system, user, schema: REVIEW_SCHEMA, name: 'code_review' })
  const section = (title, items) => items && items.length ? `\n### ${title}\n${items.map((f) => `- **${f.title}** (${f.location})\n  why: ${f.why}\n  fix: ${f.fix}`).join('\n')}\n` : ''
  const md = `## GPT review (${served}, effort ${effort})\n\n**Verdict:** ${data.verdict}  **Confidence:** ${data.confidence}\n\n${data.summary}\n${section('Blocking', data.blocking)}${section('Major', data.major)}${section('Minor', data.minor)}${data.questions && data.questions.length ? `\n### Open questions\n${data.questions.map((q) => `- ${q}`).join('\n')}\n` : ''}${usage ? `\n_tokens: in ${usage.input_tokens ?? '?'}, out ${usage.output_tokens ?? '?'}_` : ''}`
  return { content: [{ type: 'text', text: md }, { type: 'text', text: JSON.stringify(data) }] }
}

async function gptOpinion(a) {
  const effort = a.effort || 'medium'
  const model = a.model || defaultModel()
  const json = await responses({
    model,
    reasoning: { effort },
    input: [
      { role: 'developer', content: 'You are an independent senior engineer giving a second opinion to another AI system. Disagree where the evidence warrants it. Be concrete: name the failure mode, the condition that triggers it, and what you would do instead. Keep it under 400 words unless the question needs more. Markdown.' },
      { role: 'user', content: `${a.context ? `CONTEXT\n${truncate(String(a.context), 80000)}\n\n` : ''}QUESTION\n${a.question}` },
    ],
  })
  const text = outputText(json) || '(empty response)'
  return { content: [{ type: 'text', text: `## GPT opinion (${json.model || model}, effort ${effort})\n\n${text}` }] }
}

// ---------------------------------------------------------------------------
// JSON-RPC plumbing
// ---------------------------------------------------------------------------
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n')
const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })

async function handle(msg) {
  const { id, method, params } = msg
  const isNotification = id === undefined || id === null
  try {
    switch (method) {
      case 'initialize':
        return reply(id, {
          protocolVersion: (params && params.protocolVersion) || '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'openai-judge', version: VERSION },
          instructions: 'Second opinion from OpenAI models. gpt_review for diffs, gpt_opinion for plans and claims. Needs OPENAI_API_KEY.',
        })
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return
      case 'ping':
        return reply(id, {})
      case 'tools/list':
        return reply(id, { tools: TOOLS })
      case 'tools/call': {
        const name = params && params.name
        const args = (params && params.arguments) || {}
        try {
          const result = name === 'gpt_review' ? await gptReview(args) : name === 'gpt_opinion' ? await gptOpinion(args) : null
          if (!result) return fail(id, -32602, `Unknown tool: ${name}`)
          return reply(id, result)
        } catch (e) {
          return reply(id, { content: [{ type: 'text', text: `openai-judge error: ${e && e.message ? e.message : String(e)}` }], isError: true })
        }
      }
      default:
        if (!isNotification) return fail(id, -32601, `Method not found: ${method}`)
    }
  } catch (e) {
    if (!isNotification) return fail(id, -32603, e && e.message ? e.message : 'internal error')
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', (line) => {
  const t = line.trim()
  if (!t) return
  let msg
  try { msg = JSON.parse(t) } catch { return fail(null, -32700, 'Parse error') }
  if (Array.isArray(msg)) { for (const m of msg) handle(m) } else handle(msg)
})
rl.on('close', () => process.exit(0))
