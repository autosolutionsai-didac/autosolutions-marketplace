# What the 2026-10-13 run says

The first full run of the benchmark: 15 comparative runs (5 tasks, 3 teams, one trial each) and 9 harness feature checks, on Claude Code 2.1.296. The numbers are in [REPORT.md](REPORT.md); this page is the reading of them. One trial per cell means every comparison below is a direction, not a verdict.

## The short version

- **Everyone solved everything.** All three teams passed every hidden test on all five tasks, with complete specs (tests, docs, source comments) and all seeded defects found. These tasks are too well specified to separate the teams on quality, so the comparison comes down to cost and time.
- **Plain Opus 5.5 at xhigh was the cheapest and the fastest here.** $4.10 for all five tasks in 20.5 minutes, against $10.88 (41.3 min) for the harness with Sonnet builders and $10.67 (28.6 min) with Opus builders. The harness cost about 2.6 times as much for the same results.
- **The refuters are the harness's bill.** They took $6.37 (59%) of the Sonnet-builder team's spend and $5.26 (49%) of the Opus-builder team's. Builders were under 10%.
- **On your original question, Opus builders came out ahead.** The two harness teams cost about the same in total, but the Opus-builder team finished the ship tasks in 12.4 minutes against 27.6, for $4.59 against $5.66. Sonnet's first builds were rejected on 2 of 5 units, which triggered 2 fix rounds and 6 more refuter runs. Opus's were rejected on none.

## Task by task

**Ship tasks (rate-limit, bugfix-trio).** Native: $2.11, 14.4 min. Harness, Sonnet builders: $5.66, 27.6 min. Harness, Opus builders: $4.59, 12.4 min. Every unit in every ship run ended up passing its refuters, and the Fable gate passed all four ship runs. The hidden tests agreed every time, but there was no broken result for the gate to catch, so this run does not show whether it catches broken work.

**Price refresh (needs web lookup).** All three got every price right, including Sonnet 5.5's recently cut cache-read price. The harness teams did not delegate: the main Opus session fetched the pricing page itself, as the harness protocol says to do for a small change. Costs ranged from $0.30 to $0.90, which says more about run-to-run variance than about the teams.

**Review and audit.** All teams found all four seeded defects on both tasks. Native: $1.09 and 4.7 minutes for both. The harness review and audit workflows: $4.93 to $5.30 and 12.6 to 14.9 minutes, with 40 to 50 agents per task. Native also reported more real issues beyond the seeded ones on the review (6 against 2 to 3). Refuter verification did not buy cleaner reports here: native had 0 and 1 unmatched findings, the harness 0 to 3.

**Safeguards.** On the security audit, Opus 5.5's cybersecurity safeguards stepped in for every team: some requests were answered by Opus 4.8 instead (native 34k tokens, Sonnet-builder team 26k, Opus-builder team 70k). In the Sonnet-builder team's audit one refuter was refused outright ("Opus 5.5's safeguards flagged this session"). Refuters are told to prove a finding by running it, which on a security audit means trying the exploit. Expect `/harness:audit` on security topics to trip the safeguards more often than a plain review, and to lose the occasional verifier.

## The hypotheses written before the run

1. *Harness teams succeed at least as often as native on code tasks.* Held, trivially: every team succeeded on every task.
2. *Native costs less and finishes sooner on these tasks.* Held: about 40% of the cost, and faster than both harness teams overall.
3. *Opus builders cost more than Sonnet builders, by less than 2x, and need fewer fix rounds.* Half held: they needed no fix rounds against Sonnet's two, but did not cost more; the saved refuter runs paid for the dearer builds.
4. *On review and audit the harness finds at least as many seeded defects, with fewer unverified extras.* Held for seeded defects (all teams found all). The harness did report fewer extra findings, but fewer valid ones too, so its filtering did not buy a cleaner report.
5. *Every harness feature check passes.* Failed on the first run: the Fable stop gate never ran. Held after the fix.

## Harness features

All nine checks pass after one fix: role routing (scout and web-scout on Haiku, refuter on Opus), `/harness:judge` on Fable correctly failing the defective branch, the decision gate against a mock Jev API, both new free gates (`claude-cli` and `heuristic`), `/harness:second-opinion` without a key, `/harness:setup`, and the Fable stop gate. The Fable stop gate failed on its first run (t1) and passes after the fix (t2).

## Bugs the testing found in the harness (fixed in this PR)

1. **The Fable stop gate never ran.** Its hook asked for model `fable`; hooks do not resolve that alias, so the review failed silently on every turn. It now pins `claude-fable-5-1`.
2. **The decision gate skipped most harness turns.** It only counted Edit/Write calls, so turns that changed files through the shell, a subagent or a workflow went unchecked.
3. **The decision gate did not recognise `node --test`** (or `deno test`, `python -m unittest`) as a test run.
4. **Options typed after `/harness:ship`, `/harness:review` and `/harness:audit` were silently dropped**: the whole text became the task, base branch or concern.
5. **Docs:** Sonnet was described as a fifth of Opus's price (it is half); the remap of the `fable` alias was said to cover the stop gate (it cannot).

## What this suggests

- **For small, well-specified tasks, plain Opus 5.5 at xhigh is the better deal**: the same results at about 40% of the cost. The harness's case is that refuters catch defects before they ship, and nothing here was broken for them to catch. The next tasks should be ones where a single pass fails.
- **Opus builders look worth it, pending more trials.** At equal total cost they finished faster, because fewer of their units came back from the refuters. If three trials confirm it, make `claude-opus-5-5` the default `buildModel`.
- **The cost lever is the refuters, not the builders.** Teams worth adding to `teams.json`: two refuters instead of three, refuters at medium effort, Sonnet refuters for small units, and skipping refutation for units whose checks pass with a small diff.

## Next runs

1. `--trials 3` on the same matrix, pooled with `node bench/report.mjs 2026-10-13 <new label>`, to separate signal from variance.
2. Harder tasks: a multi-module refactor, an ambiguous spec, a task where single-pass Opus is known to fail, and a broken result so the gates have something to catch.
3. More teams: the refuter variants above, the harness with the free `claude-cli` gate on, native Opus at medium and native Sonnet as cheaper baselines.
4. A machine with 18 or more CPUs for timing. This one runs two workflow agents at a time, which slows the harness, not native.

## How the run was kept fair

Before this run the benchmark was reviewed adversarially and these flaws were fixed: a findings scorer that credited unrelated findings, an inherited `MAX_THINKING_TOKENS` that replaced adaptive xhigh thinking for every team, `claude -p` stopping workflows 10 minutes after the last turn, killed runs recorded as $0, and runs that hit rate limits being scored as failures. During the run, two collector bugs were caught and corrected without rerunning anything (`node bench/rescore.mjs 2026-10-13 --recover` recomputes every result from its work directory): a contamination check that flagged each run's own directory, and a crash on API-error rows. The plan's five-hour window went from 34% to 50% over the run; the list-price equivalent was $25.66 for the comparative runs and $2.82 for the checks.
