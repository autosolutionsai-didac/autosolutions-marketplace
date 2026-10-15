# Harness benchmark: 2026-10-15-range

Runs: 9 (9 comparative, 0 harness checks). Claude Code 2.1.300 (Claude Code), Node v22.22.0, 4 CPUs, 3 runs at a time, trials per comparative cell: 3. Later invocations (resumes or reruns of a subset) are recorded in run-config-<n>.json.

Costs are API list-price equivalents as reported by Claude Code (subscription users pay in usage limits instead). Tokens count everything the models read and wrote, including cache reads; "fresh" leaves cache reads out. Times are wall clock for the whole run, all turns.

## Teams

- **harness-sonnet-builders**: Harness defaults: Sonnet 5.5 builders (medium), Opus 5.5 fixes, Opus refuters, Fable gate
- **harness-lean**: Lean harness: Haiku 5.5 builders and finders; Opus 5.5 plans, integrates and fixes; two Opus refuters per unit at medium effort (correctness, edges and regressions) instead of three at high; Opus instead of Fable for the ship gate and the review and audit reports; Sonnet 5.5 verifiers at medium effort on review and audit

## Overall (comparative tasks)

| Team | Works | Works and complete | Total time | Total cost | Cost per working result | Tokens (all) | Fresh tokens | Output tokens |
|---|---|---|---|---|---|---|---|---|
| harness-sonnet-builders | 3/3 (100%) | 3/3 | 41.8 min | $8.86 | $2.95 | 4.43M | 981k | 180k |
| harness-lean | 6/6 (100%) | 6/6 | 53.5 min | $10.44 | $1.74 | 9.52M | 1.60M | 384k |

## Per task

### rate-limit

Feature: per-key rate limiting (new module, server wiring, tests, docs)

| Team | Works | Hidden tests passed | Spec complete | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|
| harness-lean | 100% (n=3) | 100% | 100% | 5.1 min | $1.42 | 1.12M | 57k |  |

### bugfix-trio

Three independent bug reports in three files, each with a regression test

| Team | Works | Hidden tests passed | Spec complete | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|
| harness-sonnet-builders | 100% (n=3) | 100% | 100% | 9.1 min | $2.89 | 1.47M | 64k | strict check passed in 3 of 3 |
| harness-lean | 100% (n=3) | 100% | 100% | 8.8 min | $1.69 | 1.70M | 68k | strict check passed in 3 of 3 |

## Where the money went

**harness-sonnet-builders**, by model: claude-opus-5-5 $6.14 (2.90M tokens); claude-fable-5-1 $1.96 (321k tokens); claude-sonnet-5-5 $0.75 (1.21M tokens)

| Role | Agents | API calls | Output tokens | Cost | Models |
|---|---|---|---|---|---|
| harness:refuter (Refute) | 27 | 115 | 85k | $4.27 | claude-opus-5-5 |
| harness:judge (Gate) | 3 | 20 | 22k | $1.96 | claude-fable-5-1 |
| workflow:Plan | 3 | 17 | 27k | $0.92 | claude-opus-5-5 |
| harness:builder (Build) | 9 | 63 | 32k | $0.75 | claude-sonnet-5-5 |
| main | 3 | 20 | 10k | $0.73 | claude-opus-5-5 |
| workflow:Integrate | 3 | 9 | 3k | $0.23 | claude-opus-5-5 |

**harness-lean**, by model: claude-opus-5-5 $10.28 (5.92M tokens); claude-haiku-5-5 $0.16 (3.60M tokens)

| Role | Agents | API calls | Output tokens | Cost | Models |
|---|---|---|---|---|---|
| harness:refuter (Refute) | 36 | 150 | 82k | $3.52 | claude-opus-5-5 |
| main | 6 | 66 | 49k | $2.95 | claude-opus-5-5 |
| workflow:Plan | 6 | 24 | 43k | $1.42 | claude-opus-5-5 |
| harness:judge (Gate) | 6 | 36 | 22k | $0.90 | claude-opus-5-5 |
| workflow:Integrate | 6 | 27 | 10k | $0.60 | claude-opus-5-5 |
| harness:builder (Fix) | 3 | 15 | 8k | $0.44 | claude-opus-5-5 |
| harness:refuter | 1 | 6 | 8k | $0.31 | claude-opus-5-5 |
| harness:builder (Build) | 15 | 139 | 160k | $0.16 | claude-haiku-5-5 |
| harness:judge | 1 | 5 | 3k | $0.13 | claude-opus-5-5 |

Role costs are recomputed from each agent's transcript at list price; they add up to the run totals within rounding.

## Inside /harness:ship

| Team | Task | Units | Passed | Fix rounds | Gate verdict | Hidden tests say |
|---|---|---|---|---|---|---|
| harness-lean | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-lean | bugfix-trio | 3 | 3 | 1 | PASS | works |
| harness-lean | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-lean | rate-limit | 2 | 2 | 1 | PASS | works |
| harness-lean | rate-limit | 2 | 1 | 1 | FAIL | works |
| harness-lean | rate-limit | 2 | 2 | 0 | PASS | works |
| harness-sonnet-builders | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-sonnet-builders | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-sonnet-builders | bugfix-trio | 3 | 3 | 0 | PASS | works |

The final gate agreed with the hidden tests in 8 of 9 ship runs.

## Caveats

- One trial per cell unless stated: a single run cannot separate a real difference from run-to-run variance. Rerun with `--trials 3` (or new labels) and pool them with `node bench/report.mjs <label> <label>` before drawing firm conclusions.
- Workflows run at most min(16, CPUs - 2) agents at once. On this 4-CPU machine that is 2, so harness wall times here are slower than on a typical laptop.
- The tasks are small and well specified. Larger, vaguer tasks favour whoever plans and verifies better; tiny ones favour whoever has the least overhead.
