# Harness benchmark

A repeatable test of the harness plugin against plain Claude Code. Every team gets the same small codebase, the same task text and the same hidden acceptance tests. The benchmark records whether the work is actually correct, how long it took, what it cost, and where the tokens went, and it checks that each harness feature (roles, workflows, hooks, skills) does what the docs say.

## What it runs

**Fixture.** `fixture/usage-ledger`: a small Node 20+ service with no dependencies that records LLM API usage per API key and turns it into invoices. It has 16 visible tests. It also contains three seeded bugs (for the bug-fix task) and four seeded vulnerabilities reachable over HTTP (for the audit task). A feature branch overlay adds four seeded defects for the review task.

**Teams** (`teams.json`). The main session is Opus 5.5 at xhigh effort for every team, so the comparison isolates what the harness adds.

| Team | What it is |
|---|---|
| `native-opus-xhigh` | No harness. Plain Claude Code, Opus 5.5 at xhigh, subagents forced to Opus 5.5 too |
| `harness-sonnet-builders` | The harness as installed: Sonnet 5.5 builders at medium, Opus 5.5 fix rounds, Opus refuters, Fable 5.1 gate, recommended settings |
| `harness-opus-builders` | The same, with Opus 5.5 builders at medium (`buildModel`) |

**Comparative tasks** (`tasks.json`, run by every team):

| Task | What the team is asked | How it is scored |
|---|---|---|
| `rate-limit` | Add per-key fixed-window rate limiting: new module, server wiring, headers, tests, docs. Harness teams run `/harness:ship` | 9 hidden tests + the visible suite |
| `bugfix-trio` | Fix three bug reports in three files, each with a regression test. Harness teams run `/harness:ship` | 9 hidden tests (3 per bug) + the visible suite |
| `price-refresh` | Add the Claude 5.5 prices, which are newer than the models' training data and must be looked up. Same plain prompt for everyone, no slash command | 5 hidden tests against Anthropic's pricing page + the visible suite |
| `review-import` | Review a feature branch with four seeded defects, then write `REVIEW.json`. Harness teams run `/harness:review` | Recall against `tasks/review-import/defects.json` |
| `audit-input` | Audit `src/` for vulnerabilities reachable over HTTP, then write `AUDIT.json`. Harness teams run `/harness:audit` | Recall against `tasks/audit-input/vulns.json` |

**Harness feature checks** (harness defaults only, pass or fail): role routing (scout and web-scout on Haiku, refuter on Opus), `/harness:judge` on Fable failing a defective branch, the Stop-hook decision gate against a local mock of the Jev API, `/harness:gate on` installing and running the Fable stop gate, `/harness:second-opinion` without an OpenAI key, and `/harness:setup`.

## What it measures

Per run (`results/<label>/<team>/<task>/t<n>.json`):

- **success**: code tasks pass every hidden test and keep the visible suite green with at least the original 16 tests. Findings tasks find all seeded defects. Checks pass their assertion.
- **time**: wall clock across all turns.
- **cost**: the API list-price total Claude Code reports for every model the run used, workflow agents and subagents included. A second figure recomputes the total from every agent's transcript; the two should match.
- **tokens**: per model: input, output, cache reads, cache writes. "Fresh" tokens exclude cache reads.
- **where it went**: cost, API calls and output tokens per role (main session, `harness:builder (Build)`, `harness:refuter (Refute)`, `harness:judge (Gate)`, workflow scopes and finders, and so on).
- **inside ship**: units, how many passed, fix rounds, the gate's verdict, and whether it agreed with the hidden tests.
- **hooks**: every SessionStart and Stop hook that fired, and every stop it blocked.
- **hygiene**: timeouts, errors, permission denials, and whether any transcript touched the benchmark's own files (the hidden tests live outside the run's repository, but an agent with a shell could go looking).

`node bench/report.mjs <label>` turns a set of runs into `REPORT.md` and `summary.json`: success rate, total and median time and cost per team and task, cost per success, money by model and role, ship internals, and the check results.

## Hypotheses, written before the first run

1. The harness teams succeed at least as often as the native team on the code tasks, because every unit is attacked by three refuters before integration.
2. The native team costs less and finishes sooner on these small, well-specified tasks. Three Opus refuters per unit plus a Fable gate is a lot of overhead for a change this size.
3. Opus builders cost more than Sonnet builders, by less than 2x per run, because builders are a minority of a ship run's cost. They need fewer fix rounds.
4. On review and audit, the harness's per-file finders plus refuter verification find at least as many seeded defects, with fewer unverified extras.
5. Every harness feature check passes.

## Running it

```
node bench/selftest.mjs                     # no model calls: fixture, hidden tests, reference solutions, seeded exploits
node bench/run.mjs --label 2026-10-13       # the full matrix, 3 runs at a time
node bench/run.mjs --label 2026-10-13 --teams native-opus-xhigh --tasks rate-limit   # a subset
node bench/report.mjs 2026-10-13            # results/2026-10-13/REPORT.md
node bench/report.mjs 2026-10-13 2026-11-02 # pool several runs into one comparison
```

Requirements: Claude Code 2.1.293+ on the PATH, logged in, Node 20+, git. Each run uses a fresh `CLAUDE_CONFIG_DIR`, so your own settings, plugins and memory do not leak in; the harness teams load the plugin from `plugins/harness` with `--plugin-dir`. A rerun with the same label skips finished runs, so an interrupted benchmark resumes. `--trials 3` repeats every cell; one trial cannot separate a real difference from noise.

To add a team, add an entry to `teams.json` (any model, effort, env, settings file or `shipArgs`). To add a task, add a folder under `tasks/` with `spec.md`, hidden tests and a reference solution (or an answer key), add it to `tasks.json`, and make `node bench/selftest.mjs` pass.

## Costs

Real model calls, billed to whoever is logged in. A full matrix (21 runs) is in the low hundreds of dollars at API list prices; on a subscription it draws on usage limits. `--budget-usd` caps each turn (default $60).
