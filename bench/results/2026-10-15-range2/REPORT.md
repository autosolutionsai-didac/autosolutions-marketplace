# Harness benchmark: 2026-10-15-range2

Runs: 6 (6 comparative, 0 harness checks). Claude Code 2.1.300 (Claude Code), Node v22.22.0, 4 CPUs, 3 runs at a time, trials per comparative cell: 3.

Costs are API list-price equivalents as reported by Claude Code (subscription users pay in usage limits instead). Tokens count everything the models read and wrote, including cache reads; "fresh" leaves cache reads out. Times are wall clock for the whole run, all turns.

## Teams

- **harness-lean**: Lean harness: Haiku 5.5 builders and finders; Opus 5.5 plans, integrates and fixes; two Opus refuters per unit at medium effort (correctness, edges and regressions) instead of three at high; Opus instead of Fable for the ship gate and the review and audit reports; Sonnet 5.5 verifiers at medium effort on review and audit

## Overall (comparative tasks)

| Team | Works | Works and complete | Total time | Total cost | Cost per working result | Tokens (all) | Fresh tokens | Output tokens |
|---|---|---|---|---|---|---|---|---|
| harness-lean | 6/6 (100%) | 6/6 | 48.2 min | $7.72 | $1.29 | 7.38M | 1.30M | 310k |

## Per task

### rate-limit

Feature: per-key rate limiting (new module, server wiring, tests, docs)

| Team | Works | Hidden tests passed | Spec complete | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|
| harness-lean | 100% (n=3) | 100% | 100% | 7.4 min | $1.17 | 1.19M | 49k |  |

### bugfix-trio

Three independent bug reports in three files, each with a regression test

| Team | Works | Hidden tests passed | Spec complete | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|
| harness-lean | 100% (n=3) | 100% | 100% | 9.4 min | $1.37 | 1.29M | 50k | strict check passed in 3 of 3 |

## Where the money went

**harness-lean**, by model: claude-opus-5-5 $7.57 (3.72M tokens); claude-haiku-5-5 $0.14 (3.66M tokens)

| Role | Agents | API calls | Output tokens | Cost | Models |
|---|---|---|---|---|---|
| harness:refuter (Refute) | 34 | 130 | 66k | $3.02 | claude-opus-5-5 |
| workflow:Plan | 6 | 26 | 50k | $1.53 | claude-opus-5-5 |
| main | 6 | 32 | 19k | $1.30 | claude-opus-5-5 |
| harness:judge (Gate) | 6 | 39 | 23k | $0.93 | claude-opus-5-5 |
| workflow:Integrate | 6 | 24 | 8k | $0.49 | claude-opus-5-5 |
| harness:builder (Fix) | 2 | 9 | 5k | $0.30 | claude-opus-5-5 |
| harness:builder (Build) | 15 | 135 | 139k | $0.14 | claude-haiku-5-5 |

Role costs are recomputed from each agent's transcript at list price; they add up to the run totals within rounding.

## Inside /harness:ship

| Team | Task | Units | Passed | Fix rounds | Gate verdict | Hidden tests say |
|---|---|---|---|---|---|---|
| harness-lean | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-lean | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-lean | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-lean | rate-limit | 2 | 2 | 0 | PASS | works |
| harness-lean | rate-limit | 2 | 2 | 1 | PASS | works |
| harness-lean | rate-limit | 2 | 2 | 1 | PASS | works |

The final gate agreed with the hidden tests in 6 of 6 ship runs.

## Caveats

- One trial per cell unless stated: a single run cannot separate a real difference from run-to-run variance. Rerun with `--trials 3` (or new labels) and pool them with `node bench/report.mjs <label> <label>` before drawing firm conclusions.
- Workflows run at most min(16, CPUs - 2) agents at once. On this 4-CPU machine that is 2, so harness wall times here are slower than on a typical laptop.
- The tasks are small and well specified. Larger, vaguer tasks favour whoever plans and verifies better; tiny ones favour whoever has the least overhead.
