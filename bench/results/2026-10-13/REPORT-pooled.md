# Harness benchmark: 2026-10-13 + 2026-10-14

Runs: 29 (20 comparative, 9 harness checks). Claude Code 2.1.296 (Claude Code), Node v22.22.0, 4 CPUs, 3 runs at a time, trials per comparative cell: 1. Later invocations (resumes or reruns of a subset) are recorded in run-config-<n>.json.

Versions by label: 2026-10-13: Claude Code 2.1.296 (Claude Code); 2026-10-14: Claude Code 2.1.299 (Claude Code).

Costs are API list-price equivalents as reported by Claude Code (subscription users pay in usage limits instead). Tokens count everything the models read and wrote, including cache reads; "fresh" leaves cache reads out. Times are wall clock for the whole run, all turns.

## Teams

- **native-opus-xhigh**: No harness: plain Claude Code, Opus 5.5 at xhigh for everything
- **harness-sonnet-builders**: Harness defaults: Sonnet 5.5 builders (medium), Opus 5.5 fixes, Opus refuters, Fable gate
- **harness-opus-builders**: Harness with Opus 5.5 builders (medium); everything else as the defaults
- **harness-haiku-builders**: Harness with Haiku 5.5 builders and finders; Opus 5.5 as architect and project manager (main session, plan, integrate, fix rounds, refuters); Fable 5.1 as final reviewer (ship gate, review and audit reports)

## Overall (comparative tasks)

| Team | Works | Works and complete | Total time | Total cost | Cost per working result | Tokens (all) | Fresh tokens | Output tokens |
|---|---|---|---|---|---|---|---|---|
| native-opus-xhigh | 5/5 (100%) | 5/5 | 20.5 min | $4.10 | $0.82 | 2.92M | 323k | 90k |
| harness-sonnet-builders | 5/5 (100%) | 5/5 | 41.3 min | $10.88 | $2.18 | 6.63M | 1.36M | 246k |
| harness-opus-builders | 5/5 (100%) | 5/5 | 28.6 min | $10.67 | $2.13 | 5.74M | 1.22M | 224k |
| harness-haiku-builders | 5/5 (100%) | 5/5 | 34.5 min | $10.47 | $2.09 | 6.01M | 1.36M | 254k |

## Per task

### rate-limit

Feature: per-key rate limiting (new module, server wiring, tests, docs)

| Team | Works | Hidden tests passed | Spec complete | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|
| native-opus-xhigh | 100% (n=1) | 100% | 100% | 7.1 min | $1.19 | 824k | 33k |  |
| harness-sonnet-builders | 100% (n=1) | 100% | 100% | 14.6 min | $2.34 | 1.44M | 52k |  |
| harness-opus-builders | 100% (n=1) | 100% | 100% | 4.7 min | $2.32 | 1.10M | 43k |  |
| harness-haiku-builders | 100% (n=1) | 100% | 100% | 7.1 min | $1.85 | 1.22M | 45k |  |

### bugfix-trio

Three independent bug reports in three files, each with a regression test

| Team | Works | Hidden tests passed | Spec complete | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|
| native-opus-xhigh | 100% (n=1) | 100% | 100% | 7.3 min | $0.92 | 703k | 22k |  |
| harness-sonnet-builders | 100% (n=1) | 100% | 100% | 13.0 min | $3.32 | 2.17M | 64k |  |
| harness-opus-builders | 100% (n=1) | 100% | 100% | 7.7 min | $2.26 | 1.04M | 37k |  |
| harness-haiku-builders | 100% (n=1) | 100% | 100% | 7.7 min | $2.32 | 1.25M | 41k |  |

### price-refresh

Add current Claude 5.5 prices, which postdate the models' training data

| Team | Works | Hidden tests passed | Spec complete | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|
| native-opus-xhigh | 100% (n=1) | 100% | 100% | 1.4 min | $0.90 | 775k | 10k |  |
| harness-sonnet-builders | 100% (n=1) | 100% | 100% | 1.1 min | $0.30 | 263k | 8k |  |
| harness-opus-builders | 100% (n=1) | 100% | 100% | 1.2 min | $0.79 | 659k | 9k |  |
| harness-haiku-builders | 100% (n=1) | 100% | 100% | 1.4 min | $0.55 | 364k | 10k |  |

### review-import

Review a feature branch with four seeded defects

| Team | Works | Seeded found | Findings | Valid extras | Unmatched | Duplicates | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| native-opus-xhigh | 100% (n=1) | 100% | 10 | 6 | 0 | 0 | 1.5 min | $0.41 | 292k | 9k |  |
| harness-sonnet-builders | 100% (n=1) | 100% | 7 | 2 | 1 | 0 | 4.4 min | $1.87 | 902k | 47k |  |
| harness-opus-builders | 100% (n=1) | 100% | 7 | 3 | 0 | 0 | 5.3 min | $2.08 | 1.03M | 54k |  |
| harness-haiku-builders | 100% (n=1) | 100% | 7 | 3 | 0 | 0 | 5.9 min | $1.81 | 888k | 48k |  |

### audit-input

Security audit with four seeded vulnerabilities reachable over HTTP

| Team | Works | Seeded found | Findings | Valid extras | Unmatched | Duplicates | Time | Cost | Tokens (all) | Output tokens | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| native-opus-xhigh | 100% (n=1) | 100% | 8 | 3 | 1 | 0 | 3.2 min | $0.69 | 328k | 16k |  |
| harness-sonnet-builders | 100% (n=1) | 100% | 9 | 1 | 3 | 1 | 8.2 min | $3.06 | 1.85M | 75k |  |
| harness-opus-builders | 100% (n=1) | 100% | 8 | 2 | 2 | 0 | 9.6 min | $3.22 | 1.91M | 82k |  |
| harness-haiku-builders | 100% (n=1) | 100% | 8 | 1 | 3 | 0 | 12.5 min | $3.95 | 2.28M | 110k |  |

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

The final gate agreed with the hidden tests in 6 of 6 ship runs.

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
