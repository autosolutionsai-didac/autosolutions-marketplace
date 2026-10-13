// Pass/fail checks for harness features that the comparative tasks do not isolate.
// Each takes the run context and returns { pass, details }.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const agentsOf = (ctx, role) => ctx.transcripts.agents.filter((a) => a.role === role || a.role.startsWith(`${role} (`))
const modelsOf = (agents) => [...new Set(agents.flatMap((a) => Object.keys(a.models)))]

export const CHECKS = {
  routing(ctx) {
    const want = { 'harness:scout': 'claude-haiku-5-5', 'harness:web-scout': 'claude-haiku-5-5', 'harness:refuter': 'claude-opus-5-5' }
    const details = {}
    let pass = true
    for (const [role, model] of Object.entries(want)) {
      const agents = agentsOf(ctx, role)
      const models = modelsOf(agents)
      const ok = agents.length > 0 && models.length > 0 && models.every((m) => m === model)
      details[role] = { spawned: agents.length, servedBy: models, expected: model, ok }
      pass &&= ok
    }
    return { pass, details }
  },

  judge(ctx) {
    const judges = agentsOf(ctx, 'harness:judge')
    const models = modelsOf(judges)
    const verdict = (ctx.streams.finalMessage.match(/VERDICT:\s*\**\s*(PASS|FAIL)/i) || [])[1] || null
    return {
      pass: judges.length > 0 && models.includes('claude-fable-5-1'),
      details: { spawned: judges.length, servedBy: models, verdict, expectedVerdict: 'FAIL (the branch has four seeded defects)', verdictCorrect: verdict ? verdict.toUpperCase() === 'FAIL' : null },
    }
  },

  decisionGate(ctx) {
    const calls = ctx.mock ? ctx.mock.calls : []
    const blocked = ctx.streams.stopBlocks.length > 0
    const testsAfter = ctx.streams.testCommands.length > 0
    return {
      pass: calls.length > 0 && calls.every((c) => c.authorized) && blocked && testsAfter,
      details: { gateCalls: calls.length, calls, stopBlocks: ctx.streams.stopBlocks, testCommandsRun: ctx.streams.testCommands, finalMessage: ctx.streams.finalMessage.slice(0, 400) },
    }
  },

  fableGate(ctx) {
    const settingsFile = path.join(ctx.repo, '.claude', 'settings.local.json')
    const installed = existsSync(settingsFile) && readFileSync(settingsFile, 'utf8').includes('harness fable gate')
    const fableUsed = !!(ctx.streams.modelUsage['claude-fable-5-1'] || ctx.transcripts.byModel['claude-fable-5-1'])
    const stopHooks = ctx.streams.hooks['Stop:started'] || 0
    return {
      pass: installed && fableUsed && stopHooks > 0,
      details: { installedInSettingsLocal: installed, fableUsage: ctx.transcripts.byModel['claude-fable-5-1'] || ctx.streams.modelUsage['claude-fable-5-1'] || null, stopHooksStarted: stopHooks, stopBlocks: ctx.streams.stopBlocks, hooks: ctx.streams.hooks },
    }
  },

  secondOpinionNoKey(ctx) {
    const msg = ctx.streams.finalMessage
    const mentionsKey = /OPENAI_API_KEY|Codex/i.test(msg)
    const toolCalled = Object.keys(ctx.streams.toolUses).some((t) => /openai-judge|gpt_review/.test(t))
    return { pass: mentionsKey && ctx.streams.errors.length === 0, details: { mentionsKeyOrCodex: mentionsKey, mcpToolCalled: toolCalled, toolUses: ctx.streams.toolUses, finalMessage: msg.slice(0, 500) } }
  },

  setup(ctx) {
    const msg = ctx.streams.finalMessage
    const ok = /2\.1\.\d+/.test(msg) && /(OK|WARN|FIX)/.test(msg)
    return { pass: ok && ctx.streams.errors.length === 0, details: { reportsVersionsAndStatus: ok, finalMessage: msg.slice(0, 800) } }
  },
}
