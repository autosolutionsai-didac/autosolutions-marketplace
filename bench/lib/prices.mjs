// Anthropic list prices, USD per million tokens, from https://platform.claude.com/docs/en/about-claude/pricing
// (read 2026-10-13). Used to split a run's cost by role; the run total comes from Claude Code itself.
export const PRICES = {
  'claude-fable-5-1': { input: 10, output: 50, write5m: 12.5, write1h: 20, read: 0.25 },
  'claude-opus-5-5': { input: 4, output: 20, write5m: 5, write1h: 8, read: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, write5m: 2.5, write1h: 4, read: 0.1 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, write5m: 0.125, write1h: 0.2, read: 0.01 },
  // Models that answer when a 5.5 model's safeguards intervene (cybersecurity goes to Opus 4.8,
  // biology and frontier-LLM work to Opus 5; Sonnet 5.5 falls back to Sonnet 5).
  'claude-opus-4-8': { input: 5, output: 25, write5m: 6.25, write1h: 10, read: 0.5 },
  'claude-opus-5': { input: 5, output: 25, write5m: 6.25, write1h: 10, read: 0.5 },
  'claude-sonnet-5': { input: 2, output: 10, write5m: 2.5, write1h: 4, read: 0.2 },
  'claude-haiku-4-5': { input: 1, output: 5, write5m: 1.25, write1h: 2, read: 0.1 },
}
// Haiku 5.5 prompts over 100k tokens (input + cache reads + cache writes) are billed at these rates.
const HAIKU_LONG = { input: 0.5, output: 2.5, write5m: 0.625, write1h: 1, read: 0.05 }

export function canonicalModel(model) {
  if (!model) return 'unknown'
  const m = String(model).replace(/\[.*\]$/, '')
  for (const id of Object.keys(PRICES).sort((a, b) => b.length - a.length)) if (m.startsWith(id)) return id
  return m
}

// usage: one API response's usage block, as found in Claude Code transcripts.
export function requestCost(model, usage) {
  const id = canonicalModel(model)
  let p = PRICES[id]
  if (!p || !usage) return 0
  const input = usage.input_tokens || 0
  const read = usage.cache_read_input_tokens || 0
  const write = usage.cache_creation_input_tokens || 0
  const write1h = (usage.cache_creation && usage.cache_creation.ephemeral_1h_input_tokens) || 0
  const write5m = Math.max(0, write - write1h)
  if (id === 'claude-haiku-5-5' && input + read + write > 100_000) p = HAIKU_LONG
  return (input * p.input + (usage.output_tokens || 0) * p.output + read * p.read + write5m * p.write5m + write1h * p.write1h) / 1e6
}
