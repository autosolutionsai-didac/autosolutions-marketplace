# What the 2026-10-14-lean run says: a cheaper harness

One new team on the same five tasks as [2026-10-13](../2026-10-13/FINDINGS.md) and [2026-10-14](../2026-10-14/FINDINGS.md), this time with three trials per task, on the same machine type (4 CPUs, 2 workflow agents at a time). Claude Code had updated itself again: this run used 2.1.300, against 2.1.296 and 2.1.299 for the earlier labels, so the comparison includes any change in the CLI. This run alone is in [REPORT.md](REPORT.md); all four labels pooled are in [REPORT-pooled.md](../2026-10-13/REPORT-pooled.md).

**The team, `harness-lean`:** the Haiku-builder team with the review spend cut back where the earlier runs showed it bought nothing. Haiku 5.5 builds and does the first pass of review and audit. Opus 5.5 is the main session, plans, integrates and fixes, as before. What changed:

- two Opus refuters per unit (correctness, edges and regressions) at medium effort, instead of three at high;
- Opus instead of Fable for ship's final gate and for the review and audit reports;
- Sonnet 5.5 verifiers at medium effort on review and audit, instead of Opus at high.

## The short version

- **Same results at about half the price.** All 15 runs passed every hidden test with complete specs, and review and audit found every seeded defect. A set of the five tasks cost $5.30 on average ($4.57 to $5.74 across the three sets) and took 29 minutes. The earlier harness teams cost $10.47 to $10.88 for one set. Plain Opus 5.5 at xhigh did the same five tasks for $4.10 in 20.5 minutes.
- **The savings came from the reviewers, as predicted.** Against the Haiku-builder team, per set of five: verification $3.51 to $0.91, refuters $1.96 to $0.83, the review and audit report $1.39 to $0.44, the final gate $0.83 to $0.30. The main session, planning, building and finding cost the same.
- **A stricter test found a bug that every harness run but one shipped.** See below. Plain Opus got it right both times. The lean team's Opus gate caught it once in three runs; the Fable gate passed it in all eight runs it checked.
- **A harness bug hid in the first attempt.** Five of the first 15 runs silently ran the default models instead of the lean team's. The harness now handles the cause, the benchmark now checks for it, and those five runs were rerun.

| Team | Trials | Works | Ship tasks (cost, time) | Review + audit (cost, time) | All five (cost, time) |
|---|---|---|---|---|---|
| native-opus-xhigh | 1 | 5/5 | $2.11, 14.4 min | $1.10, 4.7 min | $4.10, 20.5 min |
| harness-sonnet-builders | 1 | 5/5 | $5.66, 27.6 min | $4.93, 12.6 min | $10.88, 41.3 min |
| harness-opus-builders | 1 | 5/5 | $4.58, 12.4 min | $5.30, 14.9 min | $10.67, 28.6 min |
| harness-haiku-builders | 1 | 5/5 | $4.17, 14.8 min | $5.76, 18.4 min | $10.47, 34.5 min |
| harness-lean (mean of 3) | 3 | 15/15 | $2.54, 17.1 min | $2.15, 9.7 min | $5.30, 28.8 min |

## Task by task

**Ship (rate-limit, bugfix-trio).** $2.54 per pair of tasks, against $4.17 to $5.66 for the other harness teams and $2.11 for plain Opus. No unit came back from the refuters, so no fix round ran, the same as the Haiku-builder team. Two refuters at medium cost $0.83 per pair against $1.96 for three at high, and no unit they passed failed a hidden test. The Opus gate cost $0.30 per pair against $0.83 for Fable.

**Review and audit.** $2.15 per pair, against $4.93 to $5.76 for the other harness teams and $1.10 for plain Opus. Sonnet verifiers at medium did the work of Opus verifiers at high for a quarter of the cost, and all four seeded defects were found in all six runs. The audit still needs the most verification (about 35 verifier agents per run, against 12 to 15 for the review), so it remains the dearest task at $1.43.

**Price refresh.** $0.61 in 2 minutes on average, in line with the other teams. The main session did the lookup itself.

## The stricter test

The bugfix task asks for discounts rounded half up to the nearest cent. The hidden tests checked whole-number percents, and our own reference solution had the same blind spot: it was only right for whole numbers. The ledger accepts any percent from 0 to 100, and floating-point arithmetic gets some fractional ones a cent low (875 cents at 28.4% off should be 627, not 626).

We added a strict check after the runs ([b1-fractional.test.js](../../tasks/bugfix-trio/strict/b1-fractional.test.js): three known cases plus a brute force over every one-decimal percent against an exact integer reference) and fixed the reference. The check is reported apart from the hidden tests and does not change any run's success. Runs from the 2026-10-14-jev label were checked by applying each run's saved diff to the fixture, since their work directories are gone.

| Who wrote the fix | Final gate | Strict check passed |
|---|---|---|
| Plain Opus 5.5 at xhigh (with and without Jev) | none | 2 of 2 |
| Harness, Sonnet, Opus or Haiku builders (with and without Jev), and the two lean runs that lost their options | Fable 5.1 | 0 of 8 |
| Harness, lean team | Opus 5.5 | 1 of 3 |

In the one lean run that passed, the Opus gate failed the merged change, reproduced the bug ($1.25 at 64.4% off gave $0.44, not $0.45), and the main session rewrote the rounding in exact integer arithmetic. That catch cost $0.30 to $0.72 and 2.5 to 6.5 minutes more than the other two lean bugfix runs. In the other two, the Opus gate passed the flawed fix, as Fable did in all eight of its runs.

Two cautions. One catch in three is not a reliable gate, and eight misses for Fable on one bug is not a verdict on Fable. What it does show is that the harness's reviewers, built to check the spec, mostly checked the spec's examples, while plain Opus at xhigh thought about the input range on its own.

## The options bug

Claude sometimes passes a workflow's options as JSON encoded twice: a string that holds the JSON text as a string. The workflows read that as plain text, used the whole thing as the task, and ran on their default models with no error. In the first pass of this label, 5 of 15 runs did this, including both bugfix runs and two rate-limit runs that cost up to $3.05 each.

The workflows now unwrap up to three layers of encoding (see the plugin changelog), and the benchmark now checks that each stage ran on the model the team asked for (`optionsDelivered`), so a run that falls back to the defaults is flagged in the report. The five runs were renamed `*.options-lost.*` and rerun; the reruns all delivered the team's options.

Two earlier runs were also affected. The 2026-10-13 Sonnet-builder audit scanned the whole repository instead of `src` (it still found all four vulnerabilities), and the 2026-10-14-jev Haiku-builder review ran on the default models instead of Haiku and Fable. Neither changed a result, but that review cell compares the defaults, not the Haiku team.

## On the question behind this run

The lean team is what the 2026-10-14 findings proposed, with Haiku builders as asked. It did the job on all five tasks in all three trials for about half of what the other harness setups cost, which puts it within $1.20 of plain Opus. Plain Opus is still cheaper and faster on tasks this small, and on the one bug that needed thinking past the spec's examples, it was right where the harness mostly was not.

The caveats from the earlier labels still apply: small, well-specified tasks; nothing broken for the refuters to catch apart from the fractional rounding; three trials for this team against one for the others.

## Next

- Give the refuters and the gate an explicit question about the input range (the spec's rules beyond its examples) and see whether the strict check moves.
- Bigger and vaguer tasks, where planning and verification should matter more than they do here.
- Decision models like Jev where agents stop too early: weaker main models and vaguer tasks. On these runs Jev changed no outcome (see [2026-10-14-jev](../2026-10-14-jev/FINDINGS.md)).
