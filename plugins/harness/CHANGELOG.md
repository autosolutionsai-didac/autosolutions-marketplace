# Changelog

## 1.1.0 (2026-10-13)

- Ship: the fix round for a refuted unit runs on Opus 5.5 (`fixModel`); first builds stay on Sonnet 5.5 at medium.
- Workflows: options Claude passes JSON-encoded twice (a string holding the JSON text as a string) are now unwrapped. Before, the whole text became the task, base branch or concern and the run silently used the default models; the benchmark caught it in 5 of 15 runs of its lean team.
- Workflows: options passed as a JSON object after the slash command are applied (`/harness:ship {"task": "...", "maxUnits": 2}`). Before, the whole text became the task, base branch or concern and the options were dropped.
- Decision gate: free backends. `claude-cli` (Haiku 5.5 through the Claude Code login, no setup), `local` (an open decision model such as Kev-0.8B behind llama.cpp, Ollama or Cloudflare Clef), `heuristic` (rules, no model). New options "Decision provider" and "Local decision server URL"; `HARNESS_DECISION_FALLBACK`; `HARNESS_GATE_LOG` for calibration.
- Decision gate: turns that change files through the shell, a subagent or a workflow are now checked (they were skipped as "no edits"), and `node --test`, `deno test` and `python -m unittest|pytest` count as test runs.
- Decision gate: the turn that ends after a background workflow reports back is now checked. The gate took the workflow's completion notice for a new user prompt and, since the workflow had merged its work as commits and left a clean tree, skipped the final "done" message of every `/harness:ship` run. A completion notice that names one of the turn's own workflows or agents no longer ends the turn (other notices, such as monitor events, still do); tests run before it no longer count as verifying what it delivered; and commits made since the turn started count as changes when the turn's agents, workflows or file-changing commands made them (a turn that only commits finished work is not checked). The gate log also records the backend's token usage, request id and the block reasons. Found by replaying the benchmark's ship transcripts.
- Decision gate: fewer false alarms, found by running it on Jev in the benchmark, where it sent Claude back in 14 of 20 runs without changing a single result. The question about unresolved problems now excludes problems the message reports as fixed (a bug-fix summary names the bug, and decision models read questions literally), and a turn whose changes are all documents or data files (a report, a JSON answer file) is no longer asked for a test run. The questions and rules live in `scripts/gate-rules.mjs`.
- Ship: every stage now looks past the request's examples. The planner's acceptance criteria cover the whole input range the changed code accepts, builders test at least one case beyond the examples, the correctness refuter checks a stated rule across that range (against a quick independent reference when cheap), and the gate tries a few such inputs; the refuter and judge roles say the same. Found by the benchmark: on a rounding fix whose examples used whole percents, 10 of 11 harness runs shipped code that was a cent low on fractional percents, while plain Opus got it right in both of its runs.
- Workflows: new options to trade scrutiny for cost, since refuters and verifiers are most of a run's bill: `refuteEffort` and `refuteLenses` for `/harness:ship`, `verifyEffort` for `/harness:review` and `/harness:audit`. Defaults are unchanged.
- Docs: Sonnet costs half of Opus per token (not a fifth); price tables include cache reads, with Sonnet 5.5's cut to $0.10 on 2026-10-07.
- Fable stop gate: the hook template asked for the model `fable`, which agent hooks do not resolve, so the gate failed silently on every turn and never reviewed anything. It now pins `claude-fable-5-1`, and `/harness:gate on` writes a remapped model (`ANTHROPIC_DEFAULT_FABLE_MODEL`) into the hook when one is set. Found by the benchmark's gate check.
- New `bench/` at the repository root: a benchmark of the harness against plain Claude Code.

## 1.0.0 (2026-10-09)

First release.

- Roles: scout (Haiku 5.5), web-scout (Haiku 5.5), builder (Sonnet 5.5), refuter (Opus 5.5, high), judge (Fable 5.1, high).
- Workflows: `/harness:ship` (plan, parallel build in worktrees, three-lens refutation, one fix round, integrate, Fable gate), `/harness:review` (per-file review with verified findings), `/harness:audit` (codebase sweep with two-vote verification).
- Skills: `harness` (delegation protocol), `/harness:setup`, `/harness:gate`, `/harness:judge`, `/harness:second-opinion`.
- Hooks: SessionStart context; Stop decision gate with TypeSafe Jev, Jev via OpenRouter, or OpenAI Decisions backends, failing open.
- MCP: bundled `openai-judge` server (Responses API) with `gpt_review` and `gpt_opinion`.
- Templates: Explore override on Haiku, recommended settings, Fable stop-gate hook, CLAUDE.md snippet.
- Tests: mock-backed script tests (`tests/test-scripts.mjs`).
