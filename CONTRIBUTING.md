# Adding or changing a plugin

## Layout

Each plugin is a folder under `plugins/` with the standard Claude Code layout:

```
plugins/<name>/
├── .claude-plugin/plugin.json   manifest (name, version, description, userConfig)
├── agents/                      subagent markdown files
├── skills/<skill>/SKILL.md      skills and slash commands
├── workflows/*.js               dynamic workflows (become /<name>:<workflow>)
├── hooks/hooks.json             hooks
├── .mcp.json                    MCP servers bundled with the plugin
├── scripts/, templates/, docs/
└── README.md
```

Register it in `.claude-plugin/marketplace.json` with `"source": "./plugins/<name>"`.

## Before you open a PR

```
claude plugin validate ./plugins/<name>
claude plugin validate .
claude --plugin-dir ./plugins/<name>        # load it and try the commands
```

If the plugin has scripts, add tests under `plugins/<name>/tests/` that run without network access (mock the backends) and run them.

## Conventions

- Pin full model IDs in agent frontmatter (`claude-haiku-5-5`, not `haiku`) unless you need an alias on purpose; say which in the agent's description.
- Hooks must fail open: an error in a hook should never break a user's session.
- Nothing that costs real money runs without the user turning it on: expensive gates are opt-in, external services activate only when a key is present.
- Every user-facing setting gets a `userConfig` entry with a plain-language description.
- Bump `version` in `plugin.json` and the marketplace entry, and add a line to the plugin's `CHANGELOG.md`.
- Write docs for a reader who is not an engineer first, then the details.
