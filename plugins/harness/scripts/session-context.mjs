#!/usr/bin/env node
// SessionStart hook: tells the orchestrator which roles exist and how to delegate.
// Prints one JSON object with additionalContext. Never fails the session: any error exits 0 silently.

function hasKey(...names) {
  return names.some((n) => typeof process.env[n] === 'string' && process.env[n].trim().length > 0 && !process.env[n].trim().startsWith('${'))
}

try {
  const gateMode = (process.env.CLAUDE_PLUGIN_OPTION_DECISION_GATE || process.env.HARNESS_DECISION_GATE || 'auto').toLowerCase()
  const jev = hasKey('TYPESAFE_API_KEY', 'CLAUDE_PLUGIN_OPTION_TYPESAFE_API_KEY', 'OPENROUTER_API_KEY')
  const openai = hasKey('OPENAI_API_KEY', 'CLAUDE_PLUGIN_OPTION_OPENAI_API_KEY')
  const gate = gateMode === 'off' ? 'off' : jev ? 'on (Jev)' : openai ? 'on (OpenAI Decisions)' : 'off (no key)'

  const lines = [
    'AutoSolutions harness is active (plugin "harness"). Work as the orchestrator: keep planning and decisions in your own context, push search and bulk work to role subagents, and verify before you claim done.',
    'Roles: harness:scout (Haiku 5.5) read-only codebase search; harness:web-scout (Haiku 5.5) web facts with sources; harness:builder (Sonnet 5.5) one well-scoped implementation unit; harness:refuter (Opus 5.5) tries to break a change before anyone trusts it; harness:judge (Fable 5.1) final PASS/FAIL gate, use once per change.',
    'Workflows: /harness:ship <task> for changes that touch several files (plan, parallel build in worktrees, refute, integrate, Fable gate); /harness:review [base] before a PR; /harness:audit <concern> in <path> for codebase-wide checks.',
    'Commands: /harness:judge for a one-off Fable verdict on the current diff; /harness:second-opinion for a GPT review from another model family; /harness:gate to switch the Fable or Codex stop gates; /harness:setup to check the install.',
    `Decision gate (cheap done-check on Stop): ${gate}. GPT reviewer: ${openai ? 'key present' : 'no OpenAI key; Codex plugin may still be installed'}.`,
    'Run /tasks while a subagent works to confirm which model actually served it.',
  ]

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') },
  }))
} catch {
  // Silent by design: the harness still works without this context.
}
process.exit(0)
