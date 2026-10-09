# Install

Five minutes. You type three commands inside Claude Code, then one to check.

## Before you start

You need:

1. **Claude Code 2.1.293 or newer.** Check with `claude --version`. Update with `claude update`. (2.1.293 is when the `haiku` alias started pointing at Haiku 5.5 and the current subagent model rules apply.)
2. **Node.js 20 or newer** on your PATH. Check with `node --version`. The hooks and the GPT reviewer are small Node scripts. Get it at https://nodejs.org if missing.
3. **git.** The `/harness:ship` workflow builds each unit in its own git worktree.
4. **A Claude plan that can run the models.** Any paid Claude Code plan or API access works for Haiku, Sonnet and Opus. The judge uses Fable 5.1; on some subscription tiers Fable bills to usage credits and Claude Code will ask you before spending them. If you cannot use Fable, step 5 below shows the one-line change to put the judge on Opus.

The harness itself is free and open source (MIT). Model usage is billed by Anthropic as usual, and the optional modules bill through OpenAI or TypeSafe if you enable them.

## Step 1: add the marketplace

Inside a Claude Code session (any project), run:

```
/plugin marketplace add autosolutionsai-didac/autosolutions-marketplace
```

Claude Code fetches the marketplace catalog from GitHub. You only do this once per machine.

## Step 2: install the plugin

```
/plugin install harness@autosolutions
```

Claude Code asks for a few optional settings. You can press Enter to skip every one of them and come back later in `/config`:

| Setting | What it does | Skip it if |
|---|---|---|
| Decision gate | `auto` runs the cheap "is this really done?" check when a Jev or OpenAI key is present; `off` never runs it | You are unsure. `auto` is silent until a key exists |
| OpenAI API key | Enables the GPT second-opinion reviewer and, if no Jev key exists, the OpenAI Decisions gate | You do not use OpenAI, or you prefer the Codex plugin with your ChatGPT login (see optional modules) |
| OpenAI reviewer model | Which GPT model reviews; default `gpt-6-sol` | Keep the default |
| TypeSafe (Jev) API key | Enables the Jev decision gate | You do not have one. It is optional |

Environment variables work too: `OPENAI_API_KEY`, `TYPESAFE_API_KEY`, `OPENROUTER_API_KEY` exported in the shell that starts Claude Code are picked up automatically.

Then reload:

```
/reload-plugins
```

## Step 3: check the install

```
/harness:setup
```

This runs the checks for you (versions, roles loaded, which gates are active) and prints a short status. The one thing worth saying yes to is the **Explore override**: Claude Code's built-in "Explore" search agent runs on your main model (usually Opus); the override puts it on Haiku, which is the single biggest cost saving in day-to-day use. `/harness:setup --explore` installs it. Restart the session afterwards.

You should now see the roles in the `@` typeahead:

```
@harness:scout   @harness:web-scout   @harness:builder   @harness:refuter   @harness:judge
```

and these commands in `/` autocomplete:

```
/harness:ship   /harness:review   /harness:audit   /harness:judge   /harness:second-opinion   /harness:gate   /harness:setup
```

## Step 4: try it on something small

In a project with a branch that has some changes:

```
/harness:review main
```

Then watch it with `/workflows`. A review of a few files costs cents and takes a couple of minutes. The report arrives in the session when it is done.

## Step 5 (optional): if you cannot run Fable

Remap the `fable` alias with Claude Code's own setting. In `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_DEFAULT_FABLE_MODEL": "claude-opus-5-5"
  }
}
```

`/harness:setup --judge-opus` makes this edit for you. The judge agent, the `/harness:ship` gate and the Fable stop-gate hook all use the `fable` alias, so all three switch to Opus 5.5 on the next session. Every other role keeps its own model.

## Optional modules

**GPT second opinion.** Two routes, pick one:

- *Codex plugin (ChatGPT subscription or OpenAI key, through the local Codex CLI).* `/plugin marketplace add openai/codex-plugin-cc`, then `/plugin install codex@openai-codex`, then `/codex:setup`. `/harness:second-opinion` will prefer it automatically.
- *Bundled MCP server (OpenAI API key only).* Nothing to install; set the key (plugin option or `OPENAI_API_KEY`), run `/mcp` and confirm `openai-judge` is connected.

Details, costs and privacy notes: [OPTIONAL-OPENAI.md](OPTIONAL-OPENAI.md).

**Decision gate.** Set either `TYPESAFE_API_KEY` (or the plugin option), `OPENROUTER_API_KEY` (Jev through OpenRouter, no waitlist), or `OPENAI_API_KEY` (OpenAI Decisions API). The gate activates on the next session. Details and tuning: [OPTIONAL-DECISION-GATE.md](OPTIONAL-DECISION-GATE.md).

**Fable stop gate.** Per project, when you want it: `/harness:gate on`. Off: `/harness:gate off`.

## Recommended settings (optional)

`templates/settings.recommended.json` in the plugin folder holds three settings worth merging into `~/.claude/settings.json`:

- `workflowSizeGuideline: "medium"` keeps Claude-written workflows under ten agents unless you ask for more.
- `worktree.baseRef: "head"` makes worktrees branch from your current commit instead of `origin/main`, which is what you want when you run `/harness:ship` from a feature branch.
- `env.CLAUDE_CODE_SUBAGENT_MODEL: "claude-sonnet-5-5"` puts any subagent that has no model of its own on Sonnet instead of inheriting Opus. The harness roles pin their own models, so this only affects ad-hoc helpers.

Do not set `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`: it overrides every role's model, including the judge.

## Update, disable, remove

```
/plugin marketplace update autosolutions
/plugin update harness@autosolutions
/plugin disable harness@autosolutions
/plugin uninstall harness@autosolutions
```

## Working on the plugin itself

Clone the repository and load the plugin from disk; it reloads when you save:

```
claude --plugin-dir ./plugins/harness
```

Validate and test before committing:

```
claude plugin validate ./plugins/harness
node plugins/harness/tests/test-scripts.mjs
```
