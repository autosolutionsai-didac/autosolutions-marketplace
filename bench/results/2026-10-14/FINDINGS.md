# What the 2026-10-14 run says: Haiku builders

One new team on the same five tasks as [2026-10-13](../2026-10-13/FINDINGS.md), one trial per task, same machine type (4 CPUs, 2 workflow agents at a time). Claude Code updated itself between the two days: the 2026-10-13 teams ran on 2.1.296, this one on 2.1.299, so the comparison includes any change in the CLI as well as in the team. The pooled numbers for all four teams are in [REPORT-pooled.md](../2026-10-13/REPORT-pooled.md); this run alone is in [REPORT.md](REPORT.md).

**The team, `harness-haiku-builders`:** Haiku 5.5 writes the code (ship's build stage and the `harness:builder` role) and does the first per-file pass on review and audit. Opus 5.5 is the architect and project manager: the main session at xhigh, the plan, the integration, the fix rounds and the three refuters per unit. Fable 5.1 is the final reviewer: ship's gate, and the final report of review and audit.

## The short version

- **Haiku builders did the job.** All five tasks passed every hidden test with complete specs, and all seeded defects were found. None of Haiku's five units came back from the refuters, so no fix round was needed (Sonnet builders needed two on 2026-10-13, Opus builders none).
- **Building became almost free, but building was never the bill.** Haiku's five builds cost $0.03 in all, against $0.56 for Sonnet and $1.05 for Opus. The run total barely moved: $10.47, against $10.88 (Sonnet builders) and $10.67 (Opus builders). Plain Opus 5.5 at xhigh did the same five tasks for $4.10.
- **Haiku cost under 1% of the run** ($0.08 for 1.72M tokens). Opus took 76% ($7.97), mostly as refuters and verifiers, and Fable 21% ($2.22).
- **Fable as final reviewer is the one change that added cost without changing a result.** Ranking the review and audit reports on Fable cost $1.39, against $0.49 and $0.50 on Opus for the other two harness teams, and the reports found the same seeded defects.

| Team | Works | Ship tasks (cost, time) | Review + audit (cost, time) | All five (cost, time) |
|---|---|---|---|---|
| native-opus-xhigh | 5/5 | $2.11, 14.4 min | $1.10, 4.7 min | $4.10, 20.5 min |
| harness-sonnet-builders | 5/5 | $5.66, 27.6 min | $4.93, 12.6 min | $10.88, 41.3 min |
| harness-opus-builders | 5/5 | $4.58, 12.4 min | $5.30, 14.9 min | $10.67, 28.6 min |
| harness-haiku-builders | 5/5 | $4.17, 14.8 min | $5.76, 18.4 min | $10.47, 34.5 min |

## Task by task

**Ship (rate-limit, bugfix-trio).** The cheapest harness team on the code tasks: $4.17, against $4.58 with Opus builders and $5.66 with Sonnet builders. Builds dropped to $0.01 and $0.02 per run. The rest stayed: three Opus refuters per unit ($1.96 for both tasks), the Fable gate ($0.83), Opus planning and integration. The gate passed both runs, and the hidden tests agreed.

**Review and audit.** Haiku finders cost $0.04 across both tasks, against $0.50 to $0.55 for Sonnet finders. The savings went elsewhere. Fable ranking cost $0.89 more than Opus ranking. On the audit, Haiku's candidate list drew more verification votes: 51 agents, against 43 and 45, and $2.52 of Opus verification, against $1.87 and $2.03. Net: review $1.81, cheaper than both other harness teams; audit $3.95 in 12.5 minutes, the dearest and slowest. Both found all four seeded defects. As on 2026-10-13, Opus 5.5's safeguards blocked one verifier on the security audit.

**Price refresh.** $0.55 in 1.4 minutes, within the range of the other teams. The main session did the lookup itself, as before.

## On the question behind this run

The cost of a harness run is set by the verification around the builders, not by the builders. Moving the builders from Opus to Sonnet to Haiku changed the total by less than 5%. Removing the harness cut it by more than 60%. On tasks this small, Haiku 5.5 builds as reliably as Opus; whether that holds on larger units is the open question, and the 2026-10-13 caveats still apply: one trial per cell, small well-specified tasks, and nothing broken for the refuters or gates to catch.

What would cut the bill is in the verifiers: fewer refuters per unit, refuters at medium effort, Sonnet verifiers on review and audit, and Opus rather than Fable for the final report.

## Next

The same five tasks with the decision gate on Jev, for all four teams (the `*-jev` teams), are being run from a separate session that has the Jev key; results go to `results/2026-10-14-jev/`. Preparing them found and fixed a harness bug: the decision gate never checked the final message of a `/harness:ship` run (see the 1.1.0 changelog).
