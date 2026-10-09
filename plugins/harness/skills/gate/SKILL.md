---
name: gate
description: Turn the expensive stop gates on or off for this project. "on" adds a Fable agent hook that reviews the session's changes before Claude may finish, "off" removes it, "codex" enables the OpenAI Codex review gate, "status" shows what is active. Usage: /harness:gate on|off|codex|status
argument-hint: "on | off | codex | status"
disable-model-invocation: true
---

# /harness:gate

Argument: `$ARGUMENTS` (one of `on`, `off`, `codex`, `status`; default `status`).

The gates are deliberately opt-in: a Fable agent on every turn is slow and expensive, so it is enabled per project, in `.claude/settings.local.json` (not committed), and only while the user wants it.

## status

1. Read `.claude/settings.local.json`, `.claude/settings.json` and `~/.claude/settings.json` if they exist.
2. Report: Fable stop gate on/off (a `Stop` hook of `type: "agent"` whose prompt contains `harness fable gate`), Codex review gate (a `Stop` hook mentioning codex, or ask the user to run `/codex:setup` to check), and the decision gate (environment keys `TYPESAFE_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY` or the plugin options; the plugin option "Decision gate" set to `off` disables it). Never print secret values.

## on

1. Load `${CLAUDE_PLUGIN_ROOT}/templates/fable-gate.hooks.json`.
2. Merge its `hooks.Stop` entry into `.claude/settings.local.json` in the current project, creating the file if needed and preserving every other key and existing hook. Skip if an identical gate is already present.
3. Tell the user: the gate runs a Fable 5.1 agent (up to 50 turns, 5 minute timeout) at the end of every turn that changed files; it blocks the stop with concrete findings and allows it when there is nothing to fix; Claude Code caps consecutive continuations at 8; the hook is picked up automatically, no restart needed. Mention the cost (Fable is $10/$50 per MTok) and that `/harness:gate off` removes it.

## off

Remove the Fable gate entry from `.claude/settings.local.json` (match on `type: "agent"` and a prompt containing `harness fable gate`). Leave all other hooks untouched. Confirm what was removed.

## codex

1. Check the Codex plugin is installed (the `/codex:review` command exists). If not, tell the user to run `/plugin marketplace add openai/codex-plugin-cc`, `/plugin install codex@openai-codex`, then `/codex:setup`, and stop.
2. Tell the user to run `/codex:setup --enable-review-gate`. That plugin installs its own Stop hook that runs a targeted Codex (GPT) review of Claude's response and blocks the stop while it finds issues. Warn, as OpenAI does, that it can create a long Claude/Codex loop and drain limits, so it is for sessions they actively watch. `/codex:setup --disable-review-gate` turns it off.
