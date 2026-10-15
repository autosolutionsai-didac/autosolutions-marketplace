# Harness benchmark: 2026-10-14-lean

Runs: 15 (15 comparative, 0 harness checks). Claude Code 2.1.300 (Claude Code), Node v22.22.0, 4 CPUs, 3 runs at a time, trials per comparative cell: 3. Later invocations (resumes or reruns of a subset) are recorded in run-config-<n>.json.

Costs are API list-price equivalents as reported by Claude Code (subscription users pay in usage limits instead). Tokens count everything the models read and wrote, including cache reads; "fresh" leaves cache reads out. Times are wall clock for the whole run, all turns.

## Teams

- **harness-lean**: Lean harness: Haiku 5.5 builders and finders; Opus 5.5 plans, integrates and fixes; two Opus refuters per unit at medium effort (correctness, edges and regressions) instead of three at high; Opus instead of Fable for the ship gate and the review and audit reports; Sonnet 5.5 verifiers at medium effort on review and audit

## Overall (comparative tasks)

| Team | Works | Works and complete | Total time | Total cost | Cost per working result | Tokens (all) | Fresh tokens | Output tokens |
|---|---|---|---|---|---|---|---|---|
| harness-lean | 15/15 (100%) | 15/15 | 86.5 min | $15.90 | $1.06 | 16.40M | 3.18M | 629k |

## Per task

### rate-limit

Feature: per-key rate limiting (new module, server wiring, tests, docs)

| Team | Works | Hidden tests passed | Spec complete | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|
| harness-lean | 100% (n=3) | 100% | 100% | 6.8 min | $1.05 | 865k | 35k |  |

### bugfix-trio

Three independent bug reports in three files, each with a regression test

| Team | Works | Hidden tests passed | Spec complete | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|
| harness-lean | 100% (n=3) | 100% | 100% | 11.7 min | $1.45 | 1.29M | 37k | strict check passed in 1 of 3 |

### price-refresh

Add current Claude 5.5 prices, which postdate the models' training data

| Team | Works | Hidden tests passed | Spec complete | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|
| harness-lean | 100% (n=3) | 100% | 100% | 2.1 min | $0.63 | 564k | 27k |  |

### review-import

Review a feature branch with four seeded defects

| Team | Works | Seeded found | Findings | Valid extras | Unmatched | Duplicates | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| harness-lean | 100% (n=3) | 100% | 7.7 | 2.7 | 0.3 | 0.7 | 3.4 min | $0.73 | 769k | 35k |  |

### audit-input

Security audit with four seeded vulnerabilities reachable over HTTP

| Team | Works | Seeded found | Findings | Valid extras | Unmatched | Duplicates | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| harness-lean | 100% (n=3) | 100% | 7.7 | 1.3 | 2 | 0.3 | 6.4 min | $1.42 | 1.86M | 70k |  |

## Where the money went

**harness-lean**, by model: claude-opus-5-5 $12.85 (7.99M tokens); claude-sonnet-5-5 $2.74 (2.64M tokens); claude-haiku-5-5 $0.25 (5.56M tokens)

| Role | Agents | API calls | Output tokens | Cost | Models |
|---|---|---|---|---|---|
| main | 15 | 160 | 106k | $6.20 | claude-opus-5-5 |
| harness:refuter (Verify) | 146 | 408 | 120k | $2.74 | claude-sonnet-5-5 |
| harness:refuter (Refute) | 30 | 107 | 43k | $2.48 | claude-opus-5-5 |
| workflow:Rank | 6 | 9 | 31k | $1.31 | claude-opus-5-5 |
| workflow:Plan | 6 | 23 | 30k | $1.07 | claude-opus-5-5 |
| harness:judge (Gate) | 6 | 38 | 22k | $0.90 | claude-opus-5-5 |
| workflow:Integrate | 6 | 24 | 8k | $0.60 | claude-opus-5-5 |
| harness:refuter | 1 | 9 | 8k | $0.28 | claude-opus-5-5 |
| workflow:Find | 45 | 198 | 115k | $0.14 | claude-haiku-5-5 |
| harness:builder (Build) | 15 | 117 | 91k | $0.10 | claude-haiku-5-5 |
| workflow:Scope | 3 | 6 | 2k | $0.01 | claude-haiku-5-5 |
| harness:scout (Scope) | 3 | 9 | 5k | $0.00 | claude-haiku-5-5 |

Role costs are recomputed from each agent's transcript at list price; they add up to the run totals within rounding.

## Inside /harness:ship

| Team | Task | Units | Passed | Fix rounds | Gate verdict | Hidden tests say |
|---|---|---|---|---|---|---|
| harness-lean | bugfix-trio | 3 | 3 | 0 | FAIL | works |
| harness-lean | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-lean | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-lean | rate-limit | 2 | 2 | 0 | PASS | works |
| harness-lean | rate-limit | 2 | 2 | 0 | PASS | works |
| harness-lean | rate-limit | 2 | 2 | 0 | PASS | works |

The final gate agreed with the hidden tests in 5 of 6 ship runs.

## Caveats

- One trial per cell unless stated: a single run cannot separate a real difference from run-to-run variance. Rerun with `--trials 3` (or new labels) and pool them with `node bench/report.mjs <label> <label>` before drawing firm conclusions.
- Workflows run at most min(16, CPUs - 2) agents at once. On this 4-CPU machine that is 2, so harness wall times here are slower than on a typical laptop.
- The tasks are small and well specified. Larger, vaguer tasks favour whoever plans and verifies better; tiny ones favour whoever has the least overhead.
