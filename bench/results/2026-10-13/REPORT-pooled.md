# Harness benchmark: 2026-10-13 + 2026-10-14 + 2026-10-14-jev + 2026-10-14-lean

Runs: 64 (55 comparative, 9 harness checks). Claude Code 2.1.296 (Claude Code), Node v22.22.0, 4 CPUs, 3 runs at a time, trials per comparative cell: 3. Later invocations (resumes or reruns of a subset) are recorded in run-config-<n>.json.

Versions by label: 2026-10-13: Claude Code 2.1.296; 2026-10-14: Claude Code 2.1.299; 2026-10-14-jev: Claude Code 2.1.299; 2026-10-14-lean: Claude Code 2.1.300.

Costs are API list-price equivalents as reported by Claude Code (subscription users pay in usage limits instead). Tokens count everything the models read and wrote, including cache reads; "fresh" leaves cache reads out. Times are wall clock for the whole run, all turns.

## Teams

- **native-opus-xhigh**: No harness: plain Claude Code, Opus 5.5 at xhigh for everything
- **harness-sonnet-builders**: Harness defaults: Sonnet 5.5 builders (medium), Opus 5.5 fixes, Opus refuters, Fable gate
- **harness-opus-builders**: Harness with Opus 5.5 builders (medium); everything else as the defaults
- **harness-haiku-builders**: Harness with Haiku 5.5 builders and finders; Opus 5.5 as architect and project manager (main session, plan, integrate, fix rounds, refuters); Fable 5.1 as final reviewer (ship gate, review and audit reports)
- **harness-lean**: Lean harness: Haiku 5.5 builders and finders; Opus 5.5 plans, integrates and fixes; two Opus refuters per unit at medium effort (correctness, edges and regressions) instead of three at high; Opus instead of Fable for the ship gate and the review and audit reports; Sonnet 5.5 verifiers at medium effort on review and audit
- **native-opus-xhigh-jev**: native-opus-xhigh plus the harness decision gate on Jev (only the Stop hook, nothing else from the harness)
- **harness-sonnet-builders-jev**: harness-sonnet-builders with the decision gate on Jev
- **harness-opus-builders-jev**: harness-opus-builders with the decision gate on Jev
- **harness-haiku-builders-jev**: harness-haiku-builders with the decision gate on Jev

## Overall (comparative tasks)

| Team | Works | Works and complete | Total time | Total cost | Cost per working result | Tokens (all) | Fresh tokens | Output tokens |
|---|---|---|---|---|---|---|---|---|
| native-opus-xhigh | 5/5 (100%) | 5/5 | 20.5 min | $4.10 | $0.82 | 2.92M | 323k | 90k |
| harness-sonnet-builders | 5/5 (100%) | 5/5 | 41.3 min | $10.88 | $2.18 | 6.63M | 1.36M | 246k |
| harness-opus-builders | 5/5 (100%) | 5/5 | 28.6 min | $10.67 | $2.13 | 5.74M | 1.22M | 224k |
| harness-haiku-builders | 5/5 (100%) | 5/5 | 34.5 min | $10.47 | $2.09 | 6.01M | 1.36M | 254k |
| harness-lean | 15/15 (100%) | 15/15 | 86.5 min | $15.90 | $1.06 | 16.40M | 3.18M | 629k |
| native-opus-xhigh-jev | 5/5 (100%) | 5/5 | 19.2 min | $4.19 | $0.84 | 2.94M | 395k | 95k |
| harness-sonnet-builders-jev | 5/5 (100%) | 5/5 | 39.8 min | $10.62 | $2.12 | 6.36M | 1.36M | 247k |
| harness-opus-builders-jev | 5/5 (100%) | 5/5 | 30.1 min | $10.22 | $2.04 | 5.58M | 1.19M | 215k |
| harness-haiku-builders-jev | 5/5 (100%) | 5/5 | 35.5 min | $10.67 | $2.13 | 7.06M | 1.37M | 266k |

## Per task

### rate-limit

Feature: per-key rate limiting (new module, server wiring, tests, docs)

| Team | Works | Hidden tests passed | Spec complete | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|
| native-opus-xhigh | 100% (n=1) | 100% | 100% | 7.1 min | $1.19 | 824k | 33k |  |
| harness-sonnet-builders | 100% (n=1) | 100% | 100% | 14.6 min | $2.34 | 1.44M | 52k |  |
| harness-opus-builders | 100% (n=1) | 100% | 100% | 4.7 min | $2.32 | 1.10M | 43k |  |
| harness-haiku-builders | 100% (n=1) | 100% | 100% | 7.1 min | $1.85 | 1.22M | 45k |  |
| harness-lean | 100% (n=3) | 100% | 100% | 6.8 min | $1.05 | 865k | 35k |  |
| native-opus-xhigh-jev | 100% (n=1) | 100% | 100% | 6.6 min | $1.14 | 798k | 30k |  |
| harness-sonnet-builders-jev | 100% (n=1) | 100% | 100% | 16.0 min | $2.07 | 1.36M | 45k |  |
| harness-opus-builders-jev | 100% (n=1) | 100% | 100% | 7.1 min | $2.41 | 1.17M | 42k |  |
| harness-haiku-builders-jev | 100% (n=1) | 100% | 100% | 10.5 min | $1.63 | 1.28M | 48k |  |

### bugfix-trio

Three independent bug reports in three files, each with a regression test

| Team | Works | Hidden tests passed | Spec complete | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|
| native-opus-xhigh | 100% (n=1) | 100% | 100% | 7.3 min | $0.92 | 703k | 22k | strict check passed in 1 of 1 |
| harness-sonnet-builders | 100% (n=1) | 100% | 100% | 13.0 min | $3.32 | 2.17M | 64k | strict check passed in 0 of 1 |
| harness-opus-builders | 100% (n=1) | 100% | 100% | 7.7 min | $2.26 | 1.04M | 37k | strict check passed in 0 of 1 |
| harness-haiku-builders | 100% (n=1) | 100% | 100% | 7.7 min | $2.32 | 1.25M | 41k | strict check passed in 0 of 1 |
| harness-lean | 100% (n=3) | 100% | 100% | 11.7 min | $1.45 | 1.29M | 37k | strict check passed in 1 of 3 |
| native-opus-xhigh-jev | 100% (n=1) | 100% | 100% | 6.0 min | $0.94 | 708k | 23k |  |
| harness-sonnet-builders-jev | 100% (n=1) | 100% | 100% | 7.6 min | $2.45 | 1.46M | 44k | 1 ship run(s) got a changed spec |
| harness-opus-builders-jev | 100% (n=1) | 100% | 100% | 8.2 min | $2.53 | 1.20M | 39k |  |
| harness-haiku-builders-jev | 100% (n=1) | 100% | 100% | 8.1 min | $1.98 | 1.18M | 44k |  |

### price-refresh

Add current Claude 5.5 prices, which postdate the models' training data

| Team | Works | Hidden tests passed | Spec complete | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|
| native-opus-xhigh | 100% (n=1) | 100% | 100% | 1.4 min | $0.90 | 775k | 10k |  |
| harness-sonnet-builders | 100% (n=1) | 100% | 100% | 1.1 min | $0.30 | 263k | 8k |  |
| harness-opus-builders | 100% (n=1) | 100% | 100% | 1.2 min | $0.79 | 659k | 9k |  |
| harness-haiku-builders | 100% (n=1) | 100% | 100% | 1.4 min | $0.55 | 364k | 10k |  |
| harness-lean | 100% (n=3) | 100% | 100% | 2.1 min | $0.63 | 564k | 27k |  |
| native-opus-xhigh-jev | 100% (n=1) | 100% | 100% | 1.8 min | $1.05 | 764k | 15k |  |
| harness-sonnet-builders-jev | 100% (n=1) | 100% | 100% | 1.9 min | $0.54 | 498k | 17k |  |
| harness-opus-builders-jev | 100% (n=1) | 100% | 100% | 1.4 min | $0.41 | 348k | 9k |  |
| harness-haiku-builders-jev | 100% (n=1) | 100% | 100% | 1.2 min | $0.92 | 980k | 7k |  |

### review-import

Review a feature branch with four seeded defects

| Team | Works | Seeded found | Findings | Valid extras | Unmatched | Duplicates | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| native-opus-xhigh | 100% (n=1) | 100% | 10 | 6 | 0 | 0 | 1.5 min | $0.41 | 292k | 9k |  |
| harness-sonnet-builders | 100% (n=1) | 100% | 7 | 2 | 1 | 0 | 4.4 min | $1.87 | 902k | 47k |  |
| harness-opus-builders | 100% (n=1) | 100% | 7 | 3 | 0 | 0 | 5.3 min | $2.08 | 1.03M | 54k |  |
| harness-haiku-builders | 100% (n=1) | 100% | 7 | 3 | 0 | 0 | 5.9 min | $1.81 | 888k | 48k |  |
| harness-lean | 100% (n=3) | 100% | 7.7 | 2.7 | 0.3 | 0.7 | 3.4 min | $0.73 | 769k | 35k |  |
| native-opus-xhigh-jev | 100% (n=1) | 100% | 9 | 4 | 0 | 1 | 2.1 min | $0.46 | 331k | 11k |  |
| harness-sonnet-builders-jev | 100% (n=1) | 100% | 8 | 3 | 1 | 0 | 4.9 min | $2.08 | 1.07M | 51k |  |
| harness-opus-builders-jev | 100% (n=1) | 100% | 7 | 2 | 0 | 1 | 4.9 min | $1.86 | 980k | 48k |  |
| harness-haiku-builders-jev | 100% (n=1) | 100% | 8 | 3 | 1 | 0 | 5.5 min | $2.26 | 1.14M | 58k |  |

### audit-input

Security audit with four seeded vulnerabilities reachable over HTTP

| Team | Works | Seeded found | Findings | Valid extras | Unmatched | Duplicates | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| native-opus-xhigh | 100% (n=1) | 100% | 8 | 3 | 1 | 0 | 3.2 min | $0.69 | 328k | 16k |  |
| harness-sonnet-builders | 100% (n=1) | 100% | 9 | 1 | 3 | 1 | 8.2 min | $3.06 | 1.85M | 75k |  |
| harness-opus-builders | 100% (n=1) | 100% | 8 | 2 | 2 | 0 | 9.6 min | $3.22 | 1.91M | 82k |  |
| harness-haiku-builders | 100% (n=1) | 100% | 8 | 1 | 3 | 0 | 12.5 min | $3.95 | 2.28M | 110k |  |
| harness-lean | 100% (n=3) | 100% | 7.7 | 1.3 | 2 | 0.3 | 6.4 min | $1.42 | 1.86M | 70k |  |
| native-opus-xhigh-jev | 100% (n=1) | 100% | 12 | 4 | 3 | 1 | 2.7 min | $0.60 | 343k | 16k |  |
| harness-sonnet-builders-jev | 100% (n=1) | 100% | 11 | 2 | 4 | 1 | 9.5 min | $3.47 | 1.98M | 89k |  |
| harness-opus-builders-jev | 100% (n=1) | 100% | 9 | 1 | 3 | 1 | 8.5 min | $3.01 | 1.88M | 76k |  |
| harness-haiku-builders-jev | 100% (n=1) | 100% | 9 | 2 | 3 | 0 | 10.2 min | $3.87 | 2.47M | 109k |  |

## Where the money went

**native-opus-xhigh**, by model: claude-opus-5-5 $3.89 (2.84M tokens); claude-opus-4-8 $0.18 (34k tokens)

**harness-sonnet-builders**, by model: claude-opus-5-5 $9.02 (4.82M tokens); claude-sonnet-5-5 $1.10 (1.61M tokens); claude-fable-5-1 $0.63 (117k tokens); claude-opus-4-8 $0.09 (26k tokens); claude-haiku-5-5 $0.00 (35k tokens)

| Role | Agents | API calls | Output tokens | Cost | Models |
|---|---|---|---|---|---|
| harness:refuter (Refute) | 21 | 107 | 62k | $3.31 | claude-opus-5-5 |
| harness:refuter (Verify) | 46 | 167 | 78k | $3.06 | claude-opus-5-5, claude-opus-4-8 |
| main | 5 | 38 | 24k | $1.37 | claude-opus-5-5 |
| harness:judge (Gate) | 2 | 11 | 6k | $0.63 | claude-fable-5-1 |
| harness:builder (Build) | 5 | 41 | 26k | $0.56 | claude-sonnet-5-5 |
| workflow:Find | 15 | 53 | 18k | $0.55 | claude-sonnet-5-5 |
| workflow:Rank | 2 | 2 | 10k | $0.50 | claude-opus-5-5 |
| workflow:Plan | 2 | 8 | 10k | $0.41 | claude-opus-5-5 |
| harness:builder (Fix) | 2 | 13 | 6k | $0.27 | claude-opus-5-5 |
| workflow:Integrate | 2 | 7 | 2k | $0.18 | claude-opus-5-5 |
| workflow:Scope | 1 | 2 | 1k | $0.00 | claude-haiku-5-5 |
| harness:scout (Scope) | 1 | 2 | 1k | $0.00 | claude-haiku-5-5 |

**harness-opus-builders**, by model: claude-opus-5-5 $9.02 (4.74M tokens); claude-fable-5-1 $0.85 (168k tokens); claude-sonnet-5-5 $0.49 (639k tokens); claude-opus-4-8 $0.26 (70k tokens); claude-haiku-5-5 $0.00 (40k tokens)

| Role | Agents | API calls | Output tokens | Cost | Models |
|---|---|---|---|---|---|
| harness:refuter (Verify) | 50 | 181 | 90k | $3.44 | claude-opus-5-5, claude-opus-4-8 |
| main | 5 | 38 | 24k | $1.87 | claude-opus-5-5 |
| harness:refuter (Refute) | 15 | 64 | 31k | $1.82 | claude-opus-5-5 |
| harness:builder (Build) | 5 | 31 | 22k | $1.05 | claude-opus-5-5 |
| harness:judge (Gate) | 2 | 12 | 8k | $0.85 | claude-fable-5-1 |
| workflow:Rank | 2 | 3 | 12k | $0.51 | claude-opus-5-5 |
| workflow:Find | 15 | 48 | 18k | $0.49 | claude-sonnet-5-5 |
| workflow:Plan | 2 | 7 | 12k | $0.41 | claude-opus-5-5 |
| workflow:Integrate | 2 | 7 | 3k | $0.18 | claude-opus-5-5 |
| workflow:Scope | 1 | 2 | 1k | $0.00 | claude-haiku-5-5 |
| harness:scout (Scope) | 1 | 3 | 1k | $0.00 | claude-haiku-5-5 |

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

**native-opus-xhigh-jev**, by model: claude-opus-5-5 $4.17 (2.87M tokens)

**harness-sonnet-builders-jev**, by model: claude-opus-5-5 $8.54 (4.42M tokens); claude-sonnet-5-5 $1.11 (1.61M tokens); claude-fable-5-1 $0.69 (127k tokens); claude-opus-4-8 $0.21 (54k tokens); claude-haiku-5-5 $0.00 (35k tokens)

| Role | Agents | API calls | Output tokens | Cost | Models |
|---|---|---|---|---|---|
| harness:refuter (Verify) | 49 | 179 | 89k | $3.47 | claude-opus-5-5, claude-opus-4-8 |
| harness:refuter (Refute) | 15 | 66 | 39k | $2.16 | claude-opus-5-5 |
| main | 5 | 51 | 32k | $1.95 | claude-opus-5-5 |
| harness:judge (Gate) | 2 | 11 | 6k | $0.69 | claude-fable-5-1 |
| workflow:Rank | 2 | 3 | 13k | $0.58 | claude-opus-5-5 |
| harness:builder (Build) | 5 | 43 | 23k | $0.58 | claude-sonnet-5-5 |
| workflow:Find | 15 | 50 | 18k | $0.53 | claude-sonnet-5-5 |
| workflow:Plan | 2 | 7 | 10k | $0.36 | claude-opus-5-5 |
| workflow:Integrate | 2 | 9 | 3k | $0.21 | claude-opus-5-5 |
| workflow:Scope | 1 | 2 | 1k | $0.00 | claude-haiku-5-5 |
| harness:scout (Scope) | 1 | 2 | 1k | $0.00 | claude-haiku-5-5 |

**harness-opus-builders-jev**, by model: claude-opus-5-5 $8.68 (4.66M tokens); claude-fable-5-1 $0.83 (129k tokens); claude-sonnet-5-5 $0.48 (639k tokens); claude-opus-4-8 $0.19 (51k tokens); claude-haiku-5-5 $0.00 (35k tokens)

| Role | Agents | API calls | Output tokens | Cost | Models |
|---|---|---|---|---|---|
| harness:refuter (Verify) | 43 | 166 | 81k | $3.13 | claude-opus-5-5, claude-opus-4-8 |
| harness:refuter (Refute) | 15 | 57 | 33k | $2.01 | claude-opus-5-5 |
| main | 5 | 48 | 27k | $1.72 | claude-opus-5-5 |
| harness:builder (Build) | 5 | 35 | 21k | $1.05 | claude-opus-5-5 |
| harness:judge (Gate) | 2 | 11 | 8k | $0.83 | claude-fable-5-1 |
| workflow:Find | 15 | 48 | 16k | $0.48 | claude-sonnet-5-5 |
| workflow:Rank | 2 | 2 | 10k | $0.41 | claude-opus-5-5 |
| workflow:Plan | 2 | 8 | 10k | $0.38 | claude-opus-5-5 |
| workflow:Integrate | 2 | 7 | 2k | $0.18 | claude-opus-5-5 |
| workflow:Scope | 1 | 2 | 1k | $0.00 | claude-haiku-5-5 |
| harness:scout (Scope) | 1 | 2 | 2k | $0.00 | claude-haiku-5-5 |

**harness-haiku-builders-jev**, by model: claude-opus-5-5 $8.92 (4.90M tokens); claude-fable-5-1 $1.37 (160k tokens); claude-sonnet-5-5 $0.17 (196k tokens); claude-opus-4-8 $0.10 (33k tokens); claude-haiku-5-5 $0.07 (1.71M tokens)

| Role | Agents | API calls | Output tokens | Cost | Models |
|---|---|---|---|---|---|
| harness:refuter (Verify) | 57 | 201 | 106k | $4.07 | claude-opus-5-5, claude-opus-4-8 |
| main | 5 | 51 | 29k | $2.27 | claude-opus-5-5 |
| harness:refuter (Refute) | 15 | 61 | 38k | $2.04 | claude-opus-5-5 |
| workflow:Rank | 2 | 3 | 10k | $0.96 | claude-fable-5-1, claude-opus-5-5 |
| harness:judge (Gate) | 2 | 8 | 6k | $0.58 | claude-fable-5-1 |
| workflow:Plan | 2 | 8 | 9k | $0.35 | claude-opus-5-5 |
| workflow:Find | 15 | 65 | 32k | $0.20 | claude-haiku-5-5, claude-sonnet-5-5 |
| workflow:Integrate | 2 | 7 | 2k | $0.13 | claude-opus-5-5 |
| harness:builder (Build) | 5 | 40 | 30k | $0.04 | claude-haiku-5-5 |
| workflow:Scope | 1 | 4 | 1k | $0.00 | claude-haiku-5-5 |
| harness:scout (Scope) | 1 | 3 | 2k | $0.00 | claude-haiku-5-5 |

Role costs are recomputed from each agent's transcript at list price; they add up to the run totals within rounding.

## Inside /harness:ship

| Team | Task | Units | Passed | Fix rounds | Gate verdict | Hidden tests say |
|---|---|---|---|---|---|---|
| harness-opus-builders | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-opus-builders | rate-limit | 2 | 2 | 0 | PASS | works |
| harness-sonnet-builders | bugfix-trio | 3 | 3 | 2 | PASS | works |
| harness-sonnet-builders | rate-limit | 2 | 2 | 0 | PASS | works |
| harness-haiku-builders | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-haiku-builders | rate-limit | 2 | 2 | 0 | PASS | works |
| harness-haiku-builders-jev | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-haiku-builders-jev | rate-limit | 2 | 2 | 0 | PASS | works |
| harness-opus-builders-jev | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-opus-builders-jev | rate-limit | 2 | 2 | 0 | PASS | works |
| harness-sonnet-builders-jev | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-sonnet-builders-jev | rate-limit | 2 | 2 | 0 | PASS | works |
| harness-lean | bugfix-trio | 3 | 3 | 0 | FAIL | works |
| harness-lean | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-lean | bugfix-trio | 3 | 3 | 0 | PASS | works |
| harness-lean | rate-limit | 2 | 2 | 0 | PASS | works |
| harness-lean | rate-limit | 2 | 2 | 0 | PASS | works |
| harness-lean | rate-limit | 2 | 2 | 0 | PASS | works |

The final gate agreed with the hidden tests in 17 of 18 ship runs.

## The decision gate (Jev)

Backend: typesafe. The gate runs when Claude stops after changing files and can send it back once per stop. A wrapper records the work tree whenever it does, so each block can be scored twice: as the run would have ended without the gate (the tree at the block) and as it did end. That comparison is only possible when the run's first block came at what would have been its last stop; a block in an earlier turn, or while a workflow was still running, changed what came after it in ways a snapshot cannot replay. The time and cost after a block run until Claude stopped again. Harness teams are also told at session start that the gate is on (the native team is not), so a block's direct effect is not the whole effect of adding Jev; the team-against-team comparison below includes the rest, along with run-to-run variance.

| Team | Task | Stops checked | Jev calls | Blocks | Errors | Jev latency (median) | Jev cost | Claude time after blocks | Claude cost after blocks | Without the gate | With the gate |
|---|---|---|---|---|---|---|---|---|---|---|---|
| harness-haiku-builders-jev | audit-input | 4 | 1 | 1 | 0 | 299 ms | $0.0000 | 0.1 min | $0.04 | works (recall 100%) | works (recall 100%) |
| harness-haiku-builders-jev | bugfix-trio | 2 | 1 | 0 | 0 | 306 ms | $0.0001 | - | - | works (9/9) | works (9/9) |
| harness-haiku-builders-jev | price-refresh | 1 | 1 | 0 | 0 | 234 ms | $0.0001 | - | - | works (5/5) | works (5/5) |
| harness-haiku-builders-jev | rate-limit | 3 | 1 | 1 | 0 | 275 ms | $0.0001 | 0.3 min | $0.07 | works (9/9) | works (9/9) |
| harness-haiku-builders-jev | review-import | 4 | 1 | 1 | 0 | 298 ms | $0.0000 | 0.1 min | $0.04 | works (recall 100%) | works (recall 100%) |
| harness-opus-builders-jev | audit-input | 4 | 1 | 1 | 0 | 254 ms | $0.0000 | 0.2 min | $0.05 | works (recall 100%) | works (recall 100%) |
| harness-opus-builders-jev | bugfix-trio | 2 | 1 | 0 | 0 | 262 ms | $0.0001 | - | - | works (9/9) | works (9/9) |
| harness-opus-builders-jev | price-refresh | 1 | 1 | 0 | 0 | 303 ms | $0.0001 | - | - | works (5/5) | works (5/5) |
| harness-opus-builders-jev | rate-limit | 3 | 1 | 1 | 0 | 236 ms | $0.0001 | 0.2 min | $0.04 | works (9/9) | works (9/9) |
| harness-opus-builders-jev | review-import | 4 | 1 | 1 | 0 | 284 ms | $0.0000 | 0.2 min | $0.05 | works (recall 100%) | works (recall 100%) |
| harness-sonnet-builders-jev | audit-input | 4 | 1 | 1 | 0 | 273 ms | $0.0000 | 0.2 min | $0.05 | works (recall 100%) | works (recall 100%) |
| harness-sonnet-builders-jev | bugfix-trio | 3 | 1 | 1 | 0 | 323 ms | $0.0001 | 0.4 min | $0.13 | works (9/9) | works (9/9) |
| harness-sonnet-builders-jev | price-refresh | 2 | 1 | 1 | 0 | 244 ms | $0.0001 | 0.1 min | $0.05 | works (5/5) | works (5/5) |
| harness-sonnet-builders-jev | rate-limit | 3 | 1 | 1 | 0 | 508 ms | $0.0000 | 0.2 min | $0.04 | works (9/9) | works (9/9) |
| harness-sonnet-builders-jev | review-import | 3 | 1 | 0 | 0 | 255 ms | $0.0000 | - | - | works (recall 100%) | works (recall 100%) |
| native-opus-xhigh-jev | audit-input | 3 | 1 | 1 | 0 | 253 ms | $0.0000 | 0.2 min | $0.05 | works (recall 100%) | works (recall 100%) |
| native-opus-xhigh-jev | bugfix-trio | 2 | 1 | 1 | 0 | 299 ms | $0.0001 | 0.3 min | $0.06 | works (9/9) | works (9/9) |
| native-opus-xhigh-jev | price-refresh | 1 | 1 | 0 | 0 | 296 ms | $0.0001 | - | - | works (5/5) | works (5/5) |
| native-opus-xhigh-jev | rate-limit | 2 | 1 | 1 | 0 | 388 ms | $0.0001 | 0.1 min | $0.05 | works (9/9) | works (9/9) |
| native-opus-xhigh-jev | review-import | 3 | 1 | 1 | 0 | 325 ms | $0.0000 | 0.3 min | $0.04 | works (recall 100%) | works (recall 100%) |

**Ceiling:** on rate-limit, bugfix-trio, price-refresh, review-import, audit-input every team without the gate already succeeded, so a gain in success cannot show there; those tasks measure only what the gate costs and whether it breaks anything.

Across 20 runs with the gate: 14 had at least one block (14 blocks in all). Of the 20 runs where the result without the gate can be scored, the gate turned 0 broken result(s) into working ones and 0 working result(s) into broken ones. Jev itself cost $0.0010 in all; the Claude work it triggered cost $0.77 and took 3.0 min.

**Each team with and without the gate**, over the tasks both sides ran (per task the median run, summed). The two sides ran at different times and possibly on different Claude Code versions, so differences include run-to-run variance; the gate table above shows what the blocks themselves did.

| Team | Tasks compared | Works without / with | Cost without / with (incl. Jev) | Time without / with | Claude Code without / with |
|---|---|---|---|---|---|
| native-opus-xhigh | 5 | 5/5 / 5/5 | $4.10 / $4.19 | 20.5 min / 19.2 min | 2.1.296 / 2.1.299 (differ) |
| harness-sonnet-builders | 5 | 5/5 / 5/5 | $10.88 / $10.62 | 41.3 min / 39.8 min | 2.1.296 / 2.1.299 (differ) |
| harness-opus-builders | 5 | 5/5 / 5/5 | $10.67 / $10.22 | 28.6 min / 30.1 min | 2.1.296 / 2.1.299 (differ) |
| harness-haiku-builders | 5 | 5/5 / 5/5 | $10.47 / $10.67 | 34.5 min / 35.5 min | 2.1.299 / 2.1.299 |

**Every block**

- harness-haiku-builders-jev / audit-input, turn 2, last stop: you report the work as done but no test, build or check command ran this turn and the message cites no verification (p_done=0.92, p_verified=0.43). Claude then worked 0.1 min more for $0.04. At the block the work was works (recall 100%). Message judged: "I wrote `AUDIT.json` to the repository root. It holds the 9 findings I reported, in the same order: 3 high, 5 medium, 1 low. The file is valid JSON, and every entry has exactly the five fields you ask"
- harness-haiku-builders-jev / rate-limit, turn 1, last stop: the message still mentions an unresolved error, failing check or TODO (p=0.92). Claude then worked 0.3 min more for $0.07. At the block the work was works (9/9). Message judged: "Rate limiting is in place and merged into your local `main`. The final review passed it with no blocking issues, and I re-ran `npm test` myself: 29 of 29 pass (the 16 existing tests plus 13 new ones)."
- harness-haiku-builders-jev / review-import, turn 2, last stop: you report the work as done but no test, build or check command ran this turn and the message cites no verification (p_done=0.85, p_verified=0.45). Claude then worked 0.1 min more for $0.04. At the block the work was works (recall 100%). Message judged: "I wrote `REVIEW.json` to the repository root. It has the 8 findings I reported, in the same order and with the same severities: 2 blocking, 4 major and 2 minor. It parses as valid JSON, and `git statu"
- harness-opus-builders-jev / audit-input, turn 2, last stop: you report the work as done but no test, build or check command ran this turn and the message cites no verification (p_done=0.90, p_verified=0.48). Claude then worked 0.2 min more for $0.05. At the block the work was works (recall 100%). Message judged: "I wrote `AUDIT.json` to the repository root. It's a JSON array of the 9 findings I reported (3 high, 4 medium, 2 low), and each entry has the five fields you asked for. The file parses as valid JSON, "
- harness-opus-builders-jev / rate-limit, turn 1, last stop: the message still mentions an unresolved error, failing check or TODO (p=0.90). Claude then worked 0.2 min more for $0.04. At the block the work was works (9/9). Message judged: "Rate limiting is in and the final check passed. The two units (code plus tests, and README) are merged into `main` locally as `6deaf26` and `e60edc8`. Nothing was pushed. I re-ran `npm test` afterward"
- harness-opus-builders-jev / review-import, turn 2, last stop: you report the work as done but no test, build or check command ran this turn and the message cites no verification (p_done=0.76, p_verified=0.48). Claude then worked 0.2 min more for $0.05. At the block the work was works (recall 100%). Message judged: "I wrote `REVIEW.json` to the repository root with all 7 findings: 2 blocking, 4 major and 1 minor, in the same order as my report. It parses as valid JSON, and `git status` shows it is the only change"
- harness-sonnet-builders-jev / audit-input, turn 2, last stop: you report the work as done but no test, build or check command ran this turn and the message cites no verification (p_done=0.88, p_verified=0.47). Claude then worked 0.2 min more for $0.05. At the block the work was works (recall 100%). Message judged: "I wrote all 11 findings I reported to `AUDIT.json` in the repository root: 3 high, 4 medium and 4 low, in the same order as before. The file parses as valid JSON, and `git status` shows it is the only"
- harness-sonnet-builders-jev / bugfix-trio, turn 1, last stop: the message still mentions an unresolved error, failing check or TODO (p=0.96). Claude then worked 0.4 min more for $0.13. At the block the work was works (9/9). Message judged: "All three bugs are fixed and merged into `main`. The full suite passes: I re-ran `npm test` after the merge and got 26 passed, 0 failed. Nothing has been pushed. For each fix, a separate review tempor"
- harness-sonnet-builders-jev / price-refresh, turn 1, last stop: the message still mentions an unresolved error, failing check or TODO (p=0.92). Claude then worked 0.1 min more for $0.05. At the block the work was works (5/5). Message judged: "I've added the three 5.5 models to `src/prices.js` with their prices as of 2026-10-13. The three existing entries are unchanged, and `npm test` passes (17 of 17, including the new test). | Model | inp"
- harness-sonnet-builders-jev / rate-limit, turn 1, last stop: the message still mentions an unresolved error, failing check or TODO (p=0.88). Claude then worked 0.2 min more for $0.04. At the block the work was works (9/9). Message judged: "Per-API-key rate limiting is now merged into `main`, and the final review gave it a high-confidence pass. I ran `npm test` again myself on `main` and all 28 tests passed: the 16 that were already ther"
- native-opus-xhigh-jev / audit-input, turn 2, last stop: you report the work as done but no test, build or check command ran this turn and the message cites no verification (p_done=0.96, p_verified=0.23). Claude then worked 0.2 min more for $0.05. At the block the work was works (recall 100%). Message judged: "I wrote all 12 findings from the audit to `AUDIT.json` in the repository root, ordered by severity (3 high, 6 medium, 3 low), and no other file was changed. I checked that the file is valid JSON, that"
- native-opus-xhigh-jev / bugfix-trio, turn 1, last stop: the message still mentions an unresolved error, failing check or TODO (p=0.95). Claude then worked 0.3 min more for $0.06. At the block the work was works (9/9). Message judged: "I fixed all three bugs, and each one has a regression test that fails before the fix and passes after it. The full suite passes: the 16 existing tests plus 6 new ones (22 total). Before the fixes, the"
- native-opus-xhigh-jev / rate-limit, turn 1, last stop: the message still mentions an unresolved error, failing check or TODO (p=0.91). Claude then worked 0.1 min more for $0.05. At the block the work was works (9/9). Message judged: "I've added per-API-key rate limiting. `npm test` passes: 28 tests, 12 of them new and the 16 existing ones unchanged. Nothing is committed. **What changed** - **`src/rate-limit.js`** (new): a `RateLim"
- native-opus-xhigh-jev / review-import, turn 2, last stop: you report the work as done but no test, build or check command ran this turn and the message cites no verification (p_done=0.90, p_verified=0.48). Claude then worked 0.3 min more for $0.04. At the block the work was works (recall 100%). Message judged: "I wrote all nine findings to `REVIEW.json` in the repository root: 2 blocking, 3 major and 4 minor, with the same severities as in my review. The file parses as valid JSON, and `git status` shows it i"

## Harness feature checks

| Check | Result | Time | Cost | Evidence |
|---|---|---|---|---|
| check-routing: Each role subagent is served by the model its definition pins | PASS | 0.8 min | $0.26 | {"harness:scout":{"spawned":1,"servedBy":["claude-haiku-5-5"],"expected":"claude-haiku-5-5","ok":true},"harness:web-scout":{"spawned":1,"servedBy":["claude-haiku-5-5"],"expected":"claude-haiku-5-5","ok":true},"harness:refuter":{"spawned":1,"servedBy":["claude-opus-5-5"],"expected":"claude-opus-5-5", |
| check-judge: /harness:judge runs the judge role on Fable 5.1 and fails a branch with seeded defects | PASS | 1.5 min | $0.62 | {"spawned":1,"servedBy":["claude-fable-5-1"],"verdict":"FAIL","expectedVerdict":"FAIL (the branch has four seeded defects)","verdictCorrect":true} |
| check-decision-gate: The Stop-hook decision gate blocks an unverified 'Done' once and the session then runs the tests (local mock of the Jev API) | PASS | 0.2 min | $0.10 | {"gateCalls":1,"calls":[{"path":"/v1/systemone","authorized":true,"final_message":"Done.","tests_run":[],"answers":{"claims_done":0.95,"cites_verification":0.05,"unresolved_problem":0.05,"deferred_to_user":0.05}}],"stopBlocks":[{"turn":"turn-1.stream.jsonl","hook":"Stop","output":"[decision-gate] pr |
| check-fable-gate: /harness:gate on installs the Fable stop gate, which then reviews the next change | FAIL | 0.5 min | $0.16 | {"installedInSettingsLocal":true,"fableUsage":null,"stopHooksStarted":2,"stopBlocks":[],"hooks":{"SessionStart:started":2,"SessionStart:success":2,"Stop:started":2,"Stop:success":2}} |
| check-fable-gate: /harness:gate on installs the Fable stop gate, which then reviews the next change | PASS | 1.4 min | $0.83 | {"installedInSettingsLocal":true,"fableUsage":{"inputTokens":132,"outputTokens":2445,"cacheReadInputTokens":48700,"cacheCreationInputTokens":39842,"thinkingTokens":746,"webSearchRequests":0,"costUSD":0.63377},"stopHooksStarted":2,"stopBlocks":[],"hooks":{"SessionStart:started":2,"SessionStart:succes |
| check-second-opinion: /harness:second-opinion without an OpenAI key degrades gracefully and names the fix | PASS | 0.9 min | $0.28 | {"mentionsKeyOrCodex":true,"mcpToolCalled":true,"toolUses":{"Bash":6,"ToolSearch":1,"mcp__plugin_harness_openai-judge__gpt_review":1},"finalMessage":"I couldn't get the GPT review. Codex isn't installed and the `openai-judge` server reported that `OPENAI_API_KEY` is not set. What follows is my own r |
| check-setup: /harness:setup runs its checks and reports status | PASS | 1.2 min | $0.38 | {"reportsVersionsAndStatus":true,"finalMessage":"# /harness:setup report\n\nI didn't change any files. No flags were passed, so four of the steps below need your answer first.\n\n**1. Versions**\n- `OK` Claude Code 2.1.296, which meets the 2.1.293 minimum.\n- `OK` Node v22.22.0, which meets the 20+  |
| check-gate-claude-cli: The free claude-cli gate (Haiku through the Claude Code login) blocks an unverified "Done." and the session then runs the tests | PASS | 0.3 min | $0.10 | {"provider":"claude-cli","blocks":["[decision-gate] provider=claude-cli probs={\"claims_done\":0.9,\"cites_verification\":0.02,\"unresolved_problem\":0.05,\"deferred_to_user\":0.05} tests_run=0\n{\"decision\":\"block\",\"reason\":\"Decision gate (claude-cli): you report the work as done but no test, |
| check-gate-heuristic: The free heuristic gate (rules, no model) blocks an unverified "Done." and the session then runs the tests | PASS | 0.2 min | $0.10 | {"provider":"heuristic","blocks":["[decision-gate] provider=heuristic probs={\"claims_done\":0.9,\"cites_verification\":0.1,\"unresolved_problem\":0.1,\"deferred_to_user\":0.1} tests_run=0\n{\"decision\":\"block\",\"reason\":\"Decision gate (heuristic): you report the work as done but no test, build |

## Caveats

- One trial per cell unless stated: a single run cannot separate a real difference from run-to-run variance. Rerun with `--trials 3` (or new labels) and pool them with `node bench/report.mjs <label> <label>` before drawing firm conclusions.
- Workflows run at most min(16, CPUs - 2) agents at once. On this 4-CPU machine that is 2, so harness wall times here are slower than on a typical laptop.
- The tasks are small and well specified. Larger, vaguer tasks favour whoever plans and verifies better; tiny ones favour whoever has the least overhead.
