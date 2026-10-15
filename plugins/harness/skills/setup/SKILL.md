---
name: setup
description: Check and finish the harness installation. Verifies Claude Code and Node versions, that the roles load, which optional gates have keys, and offers the Haiku override for the built-in Explore subagent and the Codex plugin install. Usage: /harness:setup
argument-hint: "[--explore] [--judge-opus] [--codex] [--yes]"
disable-model-invocation: true
---

# /harness:setup

Walk through the checks below in order, run the commands yourself with Bash, and report each line as `OK`, `WARN` or `FIX` with the one-line reason. Finish with a short summary the user can act on. Do not change files unless a step says so and the user agreed (or passed `--yes`).

Arguments: `$ARGUMENTS`

## 1. Versions

- `claude --version` must be 2.1.293 or later (Haiku 5.5 alias and the current subagent model resolution). If older: FIX, tell the user to run `claude update`.
- `node --version` must be 20 or later. The hooks and the GPT reviewer are Node scripts. If missing: FIX, link https://nodejs.org.
- `git --version` must exist; `/harness:ship` relies on git worktrees.

## 2. Roles loaded

Run `claude plugin validate "${CLAUDE_PLUGIN_ROOT}"` and report the result. Then confirm the five roles are registered: they appear in the @-mention typeahead as `harness:scout`, `harness:web-scout`, `harness:builder`, `harness:refuter`, `harness:judge`. If the user is on Bedrock, Vertex or Foundry, WARN that the pinned Anthropic model IDs in the agent files may not resolve there; they can copy the agent files into `~/.claude/agents/` and switch `model:` to the `haiku`/`sonnet`/`opus` aliases.

## 3. Models available

Ask the user to check `/model` for Fable (the judge). On some subscription tiers Fable bills to usage credits and shows "Requires usage credits"; say so if they mention it. If Fable is unavailable to them, or `--judge-opus` was passed: add `"ANTHROPIC_DEFAULT_FABLE_MODEL": "claude-opus-5-5"` to the `env` block of `~/.claude/settings.json` (create the block if needed, keep every other key). That is Claude Code's own remap for the `fable` alias, so the judge agent and the `/harness:ship` gate switch to Opus 5.5 without editing the plugin. Agent hooks do not resolve aliases, so a Fable stop gate that is already on keeps its pinned model: tell the user to run `/harness:gate off` then `/harness:gate on` to pick up the remap. Takes effect on the next session. Report whether the variable is already set (print only the variable name and value, never other env values).

## 4. Built-in Explore on Haiku (optional, recommended)

Claude Code's built-in Explore subagent runs on the main model (Opus for most people). A user-level subagent named `Explore` overrides it. If `--explore` was passed or the user agrees: copy `${CLAUDE_PLUGIN_ROOT}/templates/Explore.md` to `~/.claude/agents/Explore.md` (do not overwrite an existing file without asking) and tell the user to restart the session.

## 5. Optional gates and the second opinion

Report, without printing any secret values:

- Decision gate: report which backend would answer. An explicit choice wins: `HARNESS_DECISION_PROVIDER` or the plugin option "Decision provider" (`local`, `claude-cli`, `heuristic`, `typesafe`, `openrouter`, `openai`). On `auto`: `TYPESAFE_API_KEY`, then `OPENROUTER_API_KEY`, then `OPENAI_API_KEY` (env or plugin options), then a local server if `HARNESS_LOCAL_URL` or the plugin option "Local decision server URL" is set. If none is configured, say the gate is off and offer the free choices from `docs/OPTIONAL-DECISION-GATE.md`: `claude-cli` needs no setup (Haiku through this Claude Code login, about 3 s per check, draws on plan usage), `local` needs a running decision model. For `local`, check the server answers `GET <url>/v1/models`. It can be turned off with the plugin option "Decision gate" = off.
- GPT reviewer: `OPENAI_API_KEY` or the plugin option. The `openai-judge` MCP server ships with the plugin; check `/mcp` shows it connected. Without a key it connects but its tools return an error that names the key.
- Codex plugin: if `--codex` was passed or the user wants GPT reviews through their ChatGPT subscription instead of an API key, tell them to run `/plugin marketplace add openai/codex-plugin-cc`, then `/plugin install codex@openai-codex`, then `/codex:setup`. Node 18.18+ is required by that plugin.
- Fable stop gate: off by default. Mention `/harness:gate on` and its cost.

## 6. Recommended settings (optional)

Show the user `${CLAUDE_PLUGIN_ROOT}/templates/settings.recommended.json` and explain each key in one line. Offer to merge it into `~/.claude/settings.json` (never overwrite other keys). Do not set `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`; it would override the per-role models.

## 7. Summary

Print a five-line summary: versions, roles, judge model, which gates are on, and the first command to try (`/harness:review` on a branch with changes, or `/harness:ship` on a small task).
