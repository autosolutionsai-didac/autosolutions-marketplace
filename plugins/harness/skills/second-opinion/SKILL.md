---
name: second-opinion
description: Get an independent review from a GPT model (a different model family) on the current diff or on a plan. Uses the OpenAI Codex plugin when installed, otherwise the bundled openai-judge MCP server. Usage: /harness:second-opinion [diff|plan] [focus]
argument-hint: "[diff | plan] [what to pressure-test]"
---

# /harness:second-opinion

Arguments: `$ARGUMENTS`. First word selects the mode (`diff` by default, or `plan`), the rest is the focus.

Why this exists: two Claude models agreeing is not two opinions. A reviewer trained by another lab fails differently, which is what makes it useful on load-bearing changes.

## Pick the backend

1. If the `/codex:adversarial-review` command exists (OpenAI's Codex plugin is installed), prefer it for `diff` mode: run `/codex:adversarial-review --base <base> <focus>` (add `--background` for large diffs and tell the user to check `/codex:status` and `/codex:result`). It uses the user's ChatGPT login or OpenAI key through the local Codex CLI.
2. Otherwise use the bundled MCP server `openai-judge` (load its tools with ToolSearch if they are deferred):
   - `diff` mode: call `gpt_review` with `base` (default `main`), `context` (what the change is supposed to do, in one paragraph), and `focus`. Let it compute the diff from git unless the user pasted one.
   - `plan` mode: call `gpt_opinion` with `question` (the plan or claim, stated as something to challenge) and `context` (the relevant facts or code).
   - If the tool returns an error naming `OPENAI_API_KEY`, tell the user to export it in the shell that starts Claude Code or fill the plugin option "OpenAI API key" in `/config`, then `/mcp` to reconnect. Offer the Codex plugin route as the alternative (`/harness:setup --codex`).

## Report

Relay the review verbatim under a heading that names the model, then add your own position in three lines: what you agree with, what you dispute and why (with evidence), and what you will do next. Where the GPT review and your own assessment disagree on something that matters, resolve it with ground truth (run the test, read the code), not by majority.
