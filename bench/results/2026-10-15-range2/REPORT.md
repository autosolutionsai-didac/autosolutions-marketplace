# Harness benchmark: 2026-10-15-range2

Runs: 9 (9 comparative, 0 harness checks). Claude Code 2.1.300 (Claude Code), Node v22.22.0, 4 CPUs, 3 runs at a time, trials per comparative cell: 3. Later invocations (resumes or reruns of a subset) are recorded in run-config-<n>.json.

Costs are API list-price equivalents as reported by Claude Code (subscription users pay in usage limits instead). Tokens count everything the models read and wrote, including cache reads; "fresh" leaves cache reads out. Times are wall clock for the whole run, all turns.

## Teams

- **harness-sonnet-builders**: Harness defaults: Sonnet 5.5 builders (medium), Opus 5.5 fixes, Opus refuters, Fable gate
- **harness-lean**: Lean harness: Haiku 5.5 builders and finders; Opus 5.5 plans, integrates and fixes; two Opus refuters per unit at medium effort (correctness, edges and regressions) instead of three at high; Opus instead of Fable for the ship gate and the review and audit reports; Sonnet 5.5 verifiers at medium effort on review and audit

## Overall (comparative tasks)

| Team | Works | Works and complete | Total time | Total cost | Cost per working result | Tokens (all) | Fresh tokens | Output tokens |
|---|---|---|---|---|---|---|---|---|
| harness-sonnet-builders | 3/3 (100%) | 3/3 | 39.7 min | $10.37 | $3.46 | 5.51M | 1.14M | 218k |
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
| harness-sonnet-builders | 100% (n=3) | 100% | 100% | 12.3 min | $3.31 | 1.81M | 68k | strict check passed in 3 of 3 |
| harness-lean | 100% (n=3) | 100% | 100% | 9.4 min | $1.37 | 1.29M | 50k | strict check passed in 3 of 3 |

## Where the money went

**harness-sonnet-builders**, by model: claude-opus-5-5 $7.03 (3.41M tokens); claude-fable-5-1 $2.35 (574k tokens); claude-sonnet-5-5 $0.99 (1.52M tokens)

| Role | Agents | API calls | Output tokens | Cost | Models |
|---|---|---|---|---|---|
| harness:refuter (Refute) | 30 | 141 | 102k | $5.12 | claude-opus-5-5 |
| harness:judge (Gate) | 3 | 31 | 26k | $2.35 | claude-fable-5-1 |
| harness:builder (Build) | 9 | 75 | 48k | $0.99 | claude-sonnet-5-5 |
| workflow:Plan | 3 | 14 | 26k | $0.85 | claude-opus-5-5 |
| main | 3 | 16 | 9k | $0.65 | claude-opus-5-5 |
| workflow:Integrate | 3 | 12 | 4k | $0.25 | claude-opus-5-5 |
| harness:builder (Fix) | 1 | 5 | 2k | $0.15 | claude-opus-5-5 |

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
| harness-sonnet-builders | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-sonnet-builders | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-sonnet-builders | bugfix-trio | 3 | 3 | 1 | PASS | works |

The final gate agreed with the hidden tests in 9 of 9 ship runs.

## Caveats

- One trial per cell unless stated: a single run cannot separate a real difference from run-to-run variance. Rerun with `--trials 3` (or new labels) and pool them with `node bench/report.mjs <label> <label>` before drawing firm conclusions.
- Workflows run at most min(16, CPUs - 2) agents at once. On this 4-CPU machine that is 2, so harness wall times here are slower than on a typical laptop.
- The tasks are small and well specified. Larger, vaguer tasks favour whoever plans and verifies better; tiny ones favour whoever has the least overhead.
