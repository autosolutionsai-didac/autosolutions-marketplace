# Harness benchmark: 2026-10-14

Runs: 5 (5 comparative, 0 harness checks). Claude Code 2.1.299 (Claude Code), Node v22.22.0, 4 CPUs, 3 runs at a time, trials per comparative cell: 1.

Costs are API list-price equivalents as reported by Claude Code (subscription users pay in usage limits instead). Tokens count everything the models read and wrote, including cache reads; "fresh" leaves cache reads out. Times are wall clock for the whole run, all turns.

## Teams

- **harness-haiku-builders**: Harness with Haiku 5.5 builders and finders; Opus 5.5 as architect and project manager (main session, plan, integrate, fix rounds, refuters); Fable 5.1 as final reviewer (ship gate, review and audit reports)

## Overall (comparative tasks)

| Team | Works | Works and complete | Total time | Total cost | Cost per working result | Tokens (all) | Fresh tokens | Output tokens |
|---|---|---|---|---|---|---|---|---|
| harness-haiku-builders | 5/5 (100%) | 5/5 | 34.5 min | $10.47 | $2.09 | 6.01M | 1.36M | 254k |

## Per task

### rate-limit

Feature: per-key rate limiting (new module, server wiring, tests, docs)

| Team | Works | Hidden tests passed | Spec complete | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|
| harness-haiku-builders | 100% (n=1) | 100% | 100% | 7.1 min | $1.85 | 1.22M | 45k |  |

### bugfix-trio

Three independent bug reports in three files, each with a regression test

| Team | Works | Hidden tests passed | Spec complete | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|
| harness-haiku-builders | 100% (n=1) | 100% | 100% | 7.7 min | $2.32 | 1.25M | 41k |  |

### price-refresh

Add current Claude 5.5 prices, which postdate the models' training data

| Team | Works | Hidden tests passed | Spec complete | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|
| harness-haiku-builders | 100% (n=1) | 100% | 100% | 1.4 min | $0.55 | 364k | 10k |  |

### review-import

Review a feature branch with four seeded defects

| Team | Works | Seeded found | Findings | Valid extras | Unmatched | Duplicates | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| harness-haiku-builders | 100% (n=1) | 100% | 7 | 3 | 0 | 0 | 5.9 min | $1.81 | 888k | 48k |  |

### audit-input

Security audit with four seeded vulnerabilities reachable over HTTP

| Team | Works | Seeded found | Findings | Valid extras | Unmatched | Duplicates | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| harness-haiku-builders | 100% (n=1) | 100% | 8 | 1 | 3 | 0 | 12.5 min | $3.95 | 2.28M | 110k |  |

## Where the money went

**harness-haiku-builders**, by model: claude-opus-5-5 $7.97 (3.87M tokens); claude-fable-5-1 $2.22 (305k tokens); claude-opus-4-8 $0.16 (62k tokens); claude-haiku-5-5 $0.08 (1.72M tokens)

| Role | Agents | API calls | Output tokens | Cost | Models |
|---|---|---|---|---|---|
| harness:refuter (Verify) | 51 | 180 | 91k | $3.51 | claude-opus-5-5, claude-opus-4-8 |
| main | 5 | 45 | 28k | $2.07 | claude-opus-5-5 |
| harness:refuter (Refute) | 15 | 65 | 38k | $1.96 | claude-opus-5-5 |
| workflow:Rank | 2 | 3 | 11k | $1.39 | claude-fable-5-1 |
| harness:judge (Gate) | 2 | 15 | 8k | $0.83 | claude-fable-5-1 |
| workflow:Plan | 2 | 8 | 9k | $0.41 | claude-opus-5-5 |
| workflow:Integrate | 2 | 8 | 3k | $0.19 | claude-opus-5-5 |
| workflow:Find | 15 | 66 | 41k | $0.05 | claude-haiku-5-5 |
| harness:builder (Build) | 5 | 38 | 20k | $0.03 | claude-haiku-5-5 |
| workflow:Scope | 1 | 2 | 1k | $0.00 | claude-haiku-5-5 |
| harness:scout (Scope) | 1 | 3 | 2k | $0.00 | claude-haiku-5-5 |

Role costs are recomputed from each agent's transcript at list price; they add up to the run totals within rounding.

## Inside /harness:ship

| Team | Task | Units | Passed | Fix rounds | Gate verdict | Hidden tests say |
|---|---|---|---|---|---|---|
| harness-haiku-builders | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-haiku-builders | rate-limit | 2 | 2 | 0 | PASS | works |

The final gate agreed with the hidden tests in 2 of 2 ship runs.

## Caveats

- One trial per cell unless stated: a single run cannot separate a real difference from run-to-run variance. Rerun with `--trials 3` (or new labels) and pool them with `node bench/report.mjs <label> <label>` before drawing firm conclusions.
- Workflows run at most min(16, CPUs - 2) agents at once. On this 4-CPU machine that is 2, so harness wall times here are slower than on a typical laptop.
- The tasks are small and well specified. Larger, vaguer tasks favour whoever plans and verifies better; tiny ones favour whoever has the least overhead.
