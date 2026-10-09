# Optional: a second opinion from OpenAI

Two Claude models agreeing is not two opinions; they share training and blind spots. A reviewer from another lab fails differently. The harness gives you two ways to bring OpenAI's GPT models in, and one command that uses whichever is available: `/harness:second-opinion`.

## Route A: OpenAI's official Codex plugin (recommended if you have ChatGPT)

OpenAI publishes a Claude Code plugin that runs Codex (their coding agent, on GPT models) from inside Claude Code, through the Codex CLI on your machine. It works with a ChatGPT subscription, including Free, or an OpenAI API key, and it needs Node 18.18+.

```
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
```

What you get: `/codex:review` (a normal read-only review), `/codex:adversarial-review` (steerable: "challenge whether this caching design is right"), `/codex:rescue` (hand a task to Codex, with `--model` and `--effort`), and an optional **review gate** (`/codex:setup --enable-review-gate`) that is a Stop hook: a targeted GPT review of Claude's response that blocks the stop while it finds issues. OpenAI warns the gate can loop and drain limits; enable it when you are watching.

`/harness:second-opinion diff <focus>` runs `/codex:adversarial-review` when this plugin is installed. `/harness:gate codex` walks you through the review gate.

## Route B: the bundled `openai-judge` server (API key only)

The plugin ships a small MCP server (no dependencies, Node 20+) that calls the OpenAI Responses API directly. It starts with the plugin; it only needs a key.

Set the key one of two ways:

- Plugin option **OpenAI API key** in `/config` (stored in Claude Code's secure store), or
- `export OPENAI_API_KEY=...` in the shell that starts Claude Code.

Then `/mcp` should show `openai-judge` connected. Tools:

- `gpt_review { diff?, base?, context?, focus?, model?, effort? }`: reviews a diff (computed from git when omitted) and returns a verdict (`approve` / `request-changes`) with blocking, major and minor findings, each with a location and a fix. Effort defaults to `high`.
- `gpt_opinion { question, context?, model?, effort? }`: free-form second opinion on a plan, design or root-cause theory.

`/harness:second-opinion` calls these when the Codex plugin is absent. You can also ask directly: "get a GPT review of this diff focused on the retry path".

Model choice: default `gpt-6-sol` (OpenAI's cost-efficient high-end tier). `gpt-6-astra` is the flagship at roughly five times the price; use it for the review that matters. Change the default with the plugin option **OpenAI reviewer model** or `OPENAI_JUDGE_MODEL`. `OPENAI_BASE_URL` points the server at a gateway if your organisation runs one.

## Which route

| | Codex plugin | Bundled server |
|---|---|---|
| Pays with | ChatGPT subscription or API key | API key only |
| Runs | Codex CLI locally (full agent, can run tests, can also delegate tasks) | One API call per review |
| Review gate | Yes, OpenAI's own | No (use the Fable gate) |
| Setup | Three commands plus `codex login` | A key |

Both can coexist; `/harness:second-opinion` prefers Codex when present.

## Cost and privacy

Each review sends the diff (and the context you add) to OpenAI. If your repository cannot leave your organisation's approved providers, do not enable either route. GPT-6 Sol list price is $2 / $10 per million tokens (input / output); a review of a mid-sized PR is usually a few cents to a few tens of cents. Astra is $10 / $50.

## Why not route the whole harness through OpenAI models

You could point Claude Code at a gateway that maps the `haiku` alias to a non-Claude model. Anthropic states it does not support routing Claude Code to non-Claude models through any gateway, it replaces your subscription with per-token gateway billing, and features the gateway does not forward break. The harness keeps Claude models for the agents and brings other families in as tools and hooks instead.
