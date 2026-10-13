# Using the harness

Once installed, you mostly keep working as before. Claude Code now knows about the roles (a note is added to every session) and reaches for them when a task calls for search, implementation, or verification. The commands below are for when you want to drive it yourself.

## The commands

| Command | What happens | When to use it |
|---|---|---|
| `/harness:ship <task>` | Opus plans and splits the task into independent units; Sonnet builds each one in its own git worktree, in parallel; three Opus refuters attack each unit; units that fail get one fix round, on Opus; Opus merges the passing units into your branch and runs the full suite; Fable issues PASS or FAIL | Anything that touches several files or deserves more than one pass |
| `/harness:review [base]` | One Sonnet reviewer per changed file; every finding verified by an Opus refuter; one ranked report | Before a PR. Default base `main` |
| `/harness:audit <concern> in <path>` | Haiku lists candidate files; Sonnet checks each; two Opus refuters vote on every finding; Opus writes the report | Codebase-wide questions: "missing auth checks in src/routes", "unhandled promise rejections in services/" |
| `/harness:judge [base]` | One Fable verdict on the current diff, with the evidence gathered first | A one-off "would a senior engineer merge this?" |
| `/harness:second-opinion [diff\|plan] [focus]` | A GPT review of the diff, or a GPT opinion on a plan, through the Codex plugin or the bundled OpenAI server | Load-bearing changes and decisions where two Claude models agreeing is not enough |
| `/harness:gate on\|off\|codex\|status` | Switch the expensive stop gates for this project | Branches that matter |
| `/harness:setup` | Check the install, offer the Explore override and the optional modules | Once after install, and after updates |

You can also address a role directly in any prompt:

```
@harness:scout where is the retry policy configured, and who calls it?
@harness:refuter try to break the change I just made to the payment webhook
@harness:judge is this branch ready to merge?
```

## A typical session

1. Describe the task. For anything non-trivial, say what "done" means: the behaviour, the test that should pass, the constraint that must hold.
2. Claude orients with `harness:scout` (cheap), proposes a plan, and either implements it directly (small change) or runs `/harness:ship` (several files).
3. Watch a workflow with `/workflows`: phases, agent counts, token usage per agent, and a stop button. Your session stays free in the meantime.
4. When the run finishes, the result arrives in the session: a verdict, the units, each unit's findings, and `next_steps`. For `/harness:ship`, the passing units are already merged into your branch as merge commits. Nothing is pushed.
5. Read the summary, skim the diff, push or fix.

## Reading a ship result

```
verdict: PASS | FAIL           Fable's decision for the integrated change
gate.blocking[]                what must change before merge (empty on PASS)
gate.advisory[]                worth fixing, not blocking
gate.verified[]                what the judge re-ran itself
integration.merged[]           branches merged into your branch
integration.skipped[]          units that failed review or broke the integration (left on their branches)
units[].status                 passed | failed | build-failed
units[].refuted_by             e.g. "1/3": one of three refuters still objected after the fix round
units[].findings[]             the refuters' evidence, even for passing units
units[].worktree               where the unit's branch lives if you want to inspect or cherry-pick it
```

A unit that failed is not merged. Its branch and worktree are kept so you can look at what went wrong. `git worktree list` shows them; `git worktree remove <path>` cleans up.

## Arguments the workflows accept

Options are structured arguments. The reliable way to set them is a JSON object after the command:

```
/harness:ship {"task": "add the rate limiter", "maxUnits": 4, "gateModel": "claude-opus-5-5"}
/harness:review {"base": "develop", "focus": "error handling"}
/harness:audit {"concern": "missing auth checks", "path": "src/routes"}
```

Prose ("ship the rate limiter, max 4 units") works only when Claude converts it into an object before starting the workflow. When the text is passed through as-is, the whole string becomes the task (ship), the base branch (review) or the concern (audit), and the options are ignored. The accepted fields:

```
ship:    { task, maxUnits (default 6, max 12), integrate (default true), planModel, buildModel, fixModel (default claude-opus-5-5), refuteModel, gateModel }
review:  { base (default main), maxFiles (default 40), focus, scopeModel, findModel, verifyModel, rankModel }
audit:   { concern, path (default .), maxFiles (default 40), scopeModel, findModel, verifyModel, rankModel }
```

Set `integrate: false` on ship if you would rather merge the unit branches yourself.

## The gates, and what they cost

**Decision gate** (automatic when a Jev or OpenAI key is configured). About 100 ms and a fraction of a cent per turn that changed files. It only ever sends Claude back once per turn, with a reason such as "you report the work as done but no test, build or check command ran this turn". The right response is to run the checks. Turn it off with the plugin option "Decision gate" in `/config`.

**Fable stop gate** (`/harness:gate on`, per project). A Fable agent inspects the diff at the end of every turn that changed code and blocks the stop with concrete findings. Expect tens of seconds and a Fable-priced bill on every such turn. Claude Code caps consecutive continuations at eight. Use it on the branch that matters, then turn it off.

**Codex review gate** (`/harness:gate codex`). OpenAI's own Stop hook from their plugin: a targeted GPT review that blocks while it finds issues. OpenAI warns it can loop and drain limits; keep an eye on it.

## Checking the routing

Run `/tasks` while a subagent or workflow is running. Each row names the model that is actually serving it (and its effort level). Expected: scouts on `claude-haiku-5-5`, builders on `claude-sonnet-5-5`, refuters on `claude-opus-5-5`, the judge on Fable 5.1. If a row shows the wrong model, your organisation's model allowlist may be substituting (Claude Code prints a warning naming both models), or you are on a provider where the pinned IDs do not resolve. See the troubleshooting section.

## Tips

- Give the planner something to plan. "Add rate limiting: 100 req/min per API key, 429 with Retry-After, tests for the limit and the reset" splits well. "Improve the API" does not.
- Run `/harness:ship` from the branch you want the result on. Worktrees branch from `origin/<default>` by default; set `worktree.baseRef: "head"` in your settings (see `templates/settings.recommended.json`) so they branch from your current commit instead.
- Ask for a smaller run first on a new codebase: "ship ..., maxUnits 2". The `/workflows` view shows token usage per agent, so you learn the shape of the cost before the big one.
- Scouts are for finding, not judging. If you want an opinion on what the scout found, ask Claude, not the scout.
- Keep the judge rare. One Fable verdict per change. The refuters are the ones you can afford to run often.
- The harness note at the start of each session is short on purpose. The full protocol is in the `harness` skill; Claude loads it when a task calls for it.

## Troubleshooting

**Roles missing from the @ typeahead.** `/plugin` to confirm the plugin is enabled, then `/reload-plugins`. Run `claude plugin validate <plugin folder>` if you edited anything.

**A role runs on the wrong model.** `/tasks` shows what served it. Causes in order of likelihood: an organisation `availableModels` allowlist (Claude Code warns and substitutes); a provider other than the Anthropic API (Bedrock, Vertex, Foundry) where the pinned IDs differ, in which case copy the agents to `~/.claude/agents/` and use the `haiku`/`sonnet`/`opus` aliases; `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` set somewhere, which overrides everything (remove it).

**"Requires usage credits" on Fable.** Your plan bills Fable to usage credits. Either accept the prompt, or remap the alias: `"env": {"ANTHROPIC_DEFAULT_FABLE_MODEL": "claude-opus-5-5"}` in `~/.claude/settings.json` (`/harness:setup --judge-opus` does it). The judge and the ship gate follow the alias; for the Fable stop gate, run `/harness:gate off` and `/harness:gate on` after remapping, so the hook gets the new model.

**Hooks show an error at the end of a turn.** Node is probably missing from the PATH that Claude Code sees. `node --version` in the same terminal; install Node 20+. The hooks fail open, so nothing else breaks.

**The decision gate keeps sending Claude back.** It only does so once per turn, and only when the message claims completion without evidence of checks. If it fires on a turn where tests cannot exist (a docs-only change), tell Claude to say so explicitly in its final message ("no automated check applies; I verified by reading the rendered output"). To tune or disable: [OPTIONAL-DECISION-GATE.md](OPTIONAL-DECISION-GATE.md).

**The GPT reviewer says OPENAI_API_KEY is not set.** Export it in the shell that starts Claude Code, or fill the plugin option in `/config`, then `/mcp` to reconnect `openai-judge`. Or use the Codex plugin route with your ChatGPT login.

**Ship merged something you did not want.** The merges are ordinary merge commits on your branch, nothing is pushed. `git reset --hard <sha before the run>` undoes them; the unit branches survive in their worktrees.
