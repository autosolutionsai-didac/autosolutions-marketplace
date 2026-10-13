# AutoSolutions Harness for Claude Code

**Opus plans. Haiku scouts. Sonnet builds. Opus tries to break it. Fable signs off.**

A Claude Code plugin that turns "one model does everything" into a crew with roles, each on the model that fits the job, with adversarial review built in and a cheap gate that refuses "done, trust me".

New to this? Read [Why we built it, in plain language](docs/WHY.md) first (ten minutes, no jargon).

## Install

Inside Claude Code:

```
/plugin marketplace add autosolutionsai-didac/autosolutions-marketplace
/plugin install harness@autosolutions
/reload-plugins
/harness:setup
```

Needs Claude Code 2.1.293+, Node 20+, git. Full guide with the optional modules: [docs/INSTALL.md](docs/INSTALL.md).

## What you get

| Role | Model | Job |
|---|---|---|
| `harness:scout` | Haiku 5.5 | Read-only codebase search with file:line evidence |
| `harness:web-scout` | Haiku 5.5 | Web facts with URLs and quotes |
| `harness:builder` | Sonnet 5.5 | One well-scoped implementation unit, checks run, honest report |
| `harness:refuter` | Opus 5.5, high effort | Tries to break a change before anyone trusts it |
| `harness:judge` | Fable 5.1 | The final PASS/FAIL, once per change |

| Command | What it does |
|---|---|
| `/harness:ship <task>` | Plan, build units in parallel worktrees, refute each with three lenses, fix once on Opus, integrate, Fable gate |
| `/harness:review [base]` | One reviewer per changed file, every finding verified, one ranked report |
| `/harness:audit <concern> in <path>` | Codebase-wide sweep with two-vote verification of every finding |
| `/harness:judge [base]` | One-off Fable verdict on the current diff |
| `/harness:second-opinion [diff\|plan]` | GPT review from a different model family (Codex plugin or bundled OpenAI server) |
| `/harness:gate on\|off\|codex\|status` | Expensive stop gates, per project, on demand |
| `/harness:setup` | Checks, the Haiku override for the built-in Explore agent, optional modules |

Plus two things that run on their own: a session note that teaches the orchestrator the protocol, and the **decision gate**, a quick check that sends Claude back once when it claims completion without running anything. It is off until you pick a backend: TypeSafe Jev or OpenAI Decisions with a paid key, or a free one (an open decision model on your machine, Haiku through the Claude Code login you already have, or plain rules). See [OPTIONAL-DECISION-GATE.md](docs/OPTIONAL-DECISION-GATE.md).

## Day to day

[docs/USAGE.md](docs/USAGE.md): the commands, a typical session, how to read a ship result, what the gates cost, how to confirm each role runs on the right model (`/tasks`), troubleshooting.

## Under the hood

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the layers, the ship pipeline stage by stage, how routing is enforced, known limits. Optional modules: [OpenAI second opinion](docs/OPTIONAL-OPENAI.md), [decision gate](docs/OPTIONAL-DECISION-GATE.md).

## Prices the design is based on

Per million tokens, input / output, Anthropic list prices as of October 2026: Haiku 5.5 $0.10 / $0.50, Sonnet 5.5 $2 / $10, Opus 5.5 $4 / $20, Fable 5.1 $10 / $50. Cache reads, most of an agentic coding bill: Haiku $0.01, Sonnet $0.10 (halved on October 7), Opus $0.20. Haiku is forty times cheaper than Opus; most tokens in a coding task are reading, not thinking. Route by verifiability: cheap models for work you can check mechanically, expensive models for judgment.

## Develop

```
claude --plugin-dir ./plugins/harness      # load from disk, reloads on save
claude plugin validate ./plugins/harness   # manifest, agents, hooks, MCP
node plugins/harness/tests/test-scripts.mjs # scripts against mock backends
```

MIT. Built by [AutoSolutions.ai](https://autosolutions.ai).
