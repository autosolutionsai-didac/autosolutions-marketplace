---
name: harness
description: How to delegate with the AutoSolutions harness. Use on any coding task that involves searching a codebase, implementing a change, reviewing work, or deciding whether something is done. Explains which role subagent (scout, web-scout, builder, refuter, judge) and which workflow (/harness:ship, /harness:review, /harness:audit) to use, and what to keep in the main context.
---

# The harness delegation protocol

You are the orchestrator. Your context is the expensive, scarce resource. Everything that is high-volume (search results, file contents, test logs, web pages) or well-scoped (implement unit X, try to break change Y) goes to a role subagent that runs on the right model for the job and returns a short report.

## Roles and when to use them

| Role | Model | Use it for | Never use it for |
|---|---|---|---|
| `harness:scout` | Haiku 5.5, read-only | "Where is X defined, who calls Y, how is Z configured", mapping a subsystem before a change | Interpretation, design, anything requiring judgment |
| `harness:web-scout` | Haiku 5.5, read-only | Fetching docs, changelogs, pricing, announcements, with URLs and quotes | Conclusions, recommendations |
| `harness:builder` | Sonnet 5.5 (fix rounds in /harness:ship run it on Opus 5.5) | One well-scoped implementation unit with a spec, the files it owns, and acceptance criteria | Exploration, open-ended design, multi-unit tasks (use /harness:ship) |
| `harness:refuter` | Opus 5.5, read-only + Bash | Trying to break a change before anyone trusts it, verifying a finding, checking a claim of "done" | Writing code, routine lookups |
| `harness:judge` | Fable 5.1, read-only + Bash | The final PASS/FAIL before merge or release, once per change, with the evidence already gathered | Anything repetitive; it is the most expensive model here |

Plain rules of thumb:

1. Search before you change. If you are about to Grep or Read more than two or three files to orient yourself, spawn `harness:scout` with a precise question instead and work from its file:line evidence.
2. Small change you fully understand: do it yourself. Well-scoped unit with a clear spec: `harness:builder`. Several units or several files: `/harness:ship`.
3. Before you say a change is done, either run the decisive checks yourself or spawn `harness:refuter` on it. "Done" with no verification is the one thing the harness exists to prevent.
4. Use `harness:judge` once, at the end, on the integrated change. Give it the diff, what was verified, and what the refuters found. Do not use it as a reviewer for every small edit.
5. Two Claude models agreeing is not two opinions. For load-bearing decisions, run `/harness:second-opinion` (GPT) or get deterministic ground truth: run the test, fetch the source, count the thing.
6. Keep plans, decisions and the user conversation in your own context. Keep everything else out of it.

## Workflows

- `/harness:ship <task>`: plan (Opus) → parallel build in git worktrees (Sonnet) → three-lens refutation per unit (Opus) → one fix round (Opus) → integrate into your branch (Opus) → Fable gate. Use for anything that touches several files. Review the merge commits before you push. The gate stage uses the `fable` alias unless the user names a `gateModel`.
- `/harness:review [base]`: one Sonnet reviewer per changed file, every finding verified by an Opus refuter, one ranked report. Use before a PR.
- `/harness:audit <concern> in <path>`: Haiku lists candidates, Sonnet finds instances, two Opus refuters vote on each, Opus writes the report. Use for codebase-wide checks.

Workflows run in the background. Tell the user to watch with `/workflows`, and read the returned object (verdict, issues, next_steps) when it completes. Runs are resumable in the same session.

## Gates

- Decision gate (automatic when a Jev or OpenAI key is configured): a 100 ms check on every turn that changed files. If you claim done without running checks, it sends you back once with the reason. Respond by running the checks, not by rewording.
- Fable stop gate (`/harness:gate on`): a Fable agent inspects the session's diff before you are allowed to finish. Expensive; use on branches that matter.
- Codex review gate (`/harness:gate codex`): the official OpenAI plugin's Stop hook, a GPT review that blocks the stop while it finds issues.

## Verify the routing

Run `/tasks` while a subagent works: each row names the model that is actually serving it. If a role shows the wrong model, check `/model` and the plugin version, and report it. Pinned IDs: claude-haiku-5-5, claude-sonnet-5-5, claude-opus-5-5, and the `fable` alias for Fable 5.1.

## Cost shape to keep in mind

Per million tokens, input/output: Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20, Fable 5.1 $10/$50. A scout run costs cents. A Fable gate on a whole repository costs dollars. Route by verifiability: cheap models for work you can check mechanically, expensive models for judgment.
