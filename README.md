# AutoSolutions marketplace for Claude Code

Plugins from [AutoSolutions.ai](https://autosolutions.ai): the tools we run our own work with, packaged so one command installs them in any project.

## Add the marketplace

Inside Claude Code:

```
/plugin marketplace add autosolutionsai-didac/autosolutions-marketplace
```

Then install any plugin below with `/plugin install <name>@autosolutions`.

## Plugins

| Plugin | One line | Docs |
|---|---|---|
| **harness** | Opus plans, Haiku scouts, Sonnet builds, Opus tries to break it, Fable signs off. Role subagents, `/harness:ship` `/harness:review` `/harness:audit` workflows, a cheap decision gate (Jev or OpenAI Decisions), a GPT second-opinion reviewer | [README](plugins/harness/README.md) · [Why, in plain language](plugins/harness/docs/WHY.md) · [Install](plugins/harness/docs/INSTALL.md) · [Usage](plugins/harness/docs/USAGE.md) |

More plugins (NPD Validator and others) will move here over time; until then they live in their own repositories.

## Layout

```
.claude-plugin/marketplace.json   the catalog Claude Code reads
plugins/<name>/                   one folder per plugin, each a complete Claude Code plugin
```

To add a plugin, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Update

```
/plugin marketplace update autosolutions
/plugin update harness@autosolutions
```

MIT licensed.
