# What the 2026-10-14-jev run says: adding Jev

The four teams of [2026-10-13](../2026-10-13/FINDINGS.md) and [2026-10-14](../2026-10-14/FINDINGS.md), each with the harness decision gate running on TypeSafe's Jev (`jev-1.13.0`, live API), on the same five tasks. One trial per task, Claude Code 2.1.299, 4 CPUs, each run in its own PID namespace. Numbers: [REPORT.md](REPORT.md) for this run, [REPORT-pooled.md](../2026-10-13/REPORT-pooled.md) for all eight teams. The replay of the gate's calls is in [replay.json](replay.json).

**What the gate does.** When Claude stops after changing files, the gate asks Jev four questions about the final message and the evidence from the transcript: does it claim to be done, does it cite verification, does it say something is still wrong, does it hand work back to the user. Code applies thresholds to the answers and can send Claude back once per stop. A benchmark-only wrapper saved the work tree each time the gate sent Claude back, so every block could be scored twice, as the run would have ended without it and as it did end.

## The short version

- **No result improved, and none got worse.** All 20 runs passed every hidden test and found every seeded defect, as the same teams did without Jev. On these tasks that was always going to be the answer: every team already succeeded on every task, so there was no failure for Jev to prevent. For all 20 runs the result at the moment of the block can be scored, and it matched the final result every time.
- **Jev is fast, reliable and nearly free.** 20 calls, 0 errors, median 290 ms (slowest 508 ms), 22,906 input tokens for $0.001 in all.
- **The gate sent Claude back in 14 of 20 runs.** The extra Claude work cost $0.77 and took 3.0 minutes across the 20 runs, about 2% of the run cost ($35.70). Team totals with and without Jev differ by less than run-to-run variance (table below).
- **Half of those blocks were the harness's fault, and are fixed.** Seven came on turns that only wrote a JSON report, where the gate demanded a test run. A turn whose changes are all documents or data files is no longer asked for one.
- **The other half caught Claude mentioning open problems, which it then had to resolve or scope out.** Mostly these were bugs in code the task didn't touch, which Claude had noticed and listed. In one run Claude fixed its own new test, which could hang. The hidden tests can't see that kind of gain.

## The blocks

| Kind | Blocks | What Jev reacted to | What Claude did next | Extra Claude cost and time |
|---|---|---|---|---|
| Report turns (review, audit) | 7 of 10 | "Done" with no test run, on a turn that only wrote `REVIEW.json` or `AUDIT.json` | Re-checked the JSON file and said so | $0.32, 81 s |
| Code tasks (ship, native fixes, prices) | 7 of 12 | The message listed problems: pre-existing bugs it had noticed elsewhere (a CSV invoice route that crashes the server, a 500 on a malformed URL, security issues in other files), out-of-scope gaps, one of its own tests that could hang, a deliberate test failure | Re-ran the tests and either fixed what it had flagged or said why it was outside the task. One run confirmed the CSV crash on the commit before the change; one fixed its own hanging test | $0.45, 97 s |

Every block was answered within one more stop. No block came while a workflow was still running, and each was at the run's last stop, so all 14 could be scored at the block: 14 of 14 already passed there.

## With and without Jev, by team

| Team | Without Jev | With Jev (incl. Jev) | Blocks |
|---|---|---|---|
| native-opus-xhigh | $4.10, 20.5 min | $4.19, 19.2 min | 4 of 5 |
| harness-sonnet-builders | $10.88, 41.3 min | $10.62, 39.8 min | 4 of 5 |
| harness-opus-builders | $10.67, 28.6 min | $10.22, 30.1 min | 3 of 5 |
| harness-haiku-builders | $10.47, 34.5 min | $10.67, 35.5 min | 3 of 5 |

Each pair ran at different times, and three of the four base teams ran on Claude Code 2.1.296 rather than 2.1.299. Differences of a few percent either way are noise. The direct cost of the blocks is the $0.77 and 3 minutes above.

## Fixing the gate, and checking the fix on live Jev

Two changes to the harness (1.1.0 changelog):

1. **A turn that only changes documents or data files is not asked for a test run.** Package manifests, TypeScript configs and CI files still count as code.
2. **The unresolved-problem question now excludes problems the message reports as fixed.** It used to ask whether the message "mentions a failing test, an error, a crash, a TODO, a known bug". A summary of a bug fix names the bug, and decision models read questions literally.

`bench/jev-replay.mjs` asked Jev again about all 20 real stops, once with the old questions and rules and once with the new ones, plus six made-up turns whose right answer is known. That was 52 calls for $0.002. The replay rebuilds each stop from the gate log, so its probabilities differ somewhat from the live run. The old and new rules were judged on the same rebuilt stops. With the old rules the replay sent back 9 of the 14 stops the live run sent back, and nothing else. The other 5 scored just under the thresholds on the rebuilt input: four on "unresolved", one on "no verification". Those answers sit close to the line, so expect some run-to-run variation in how often the gate fires.

| | Old rules | New rules |
|---|---|---|
| Real stops sent back (all 20 runs worked) | 9 of 20 | 3 of 20 |
| Report turns sent back | 6 of 10 | 0 of 10 |
| Made-up turns judged right | 5 of 6 | 6 of 6 |

Every made-up turn that should be sent back still is, under the new rules:
- claiming done without testing
- reporting two tests still failing
- leaving a TODO
- asking the user to run the tests

A clean bug-fix summary with passing tests had scored 0.50 on "still unresolved" and now scores 0.08. The three real stops still sent back are the Sonnet-builder team's summaries, each of which lists open problems:
- a test that could hang
- a deliberate test failure plus an out-of-scope pricing gap
- three follow-ups, one of them a crash in a route the task didn't touch

By the hidden tests these are still false alarms: all three runs already passed. By the gate's own purpose they are fair, since the gate makes Claude either deal with what it mentions or say it is out of scope.

## Two harness bugs found on the way

1. **The gate never checked the end of a `/harness:ship` run.** The workflow reports back through a completion notice. The gate took that notice for a new prompt and, finding a clean tree with nothing edited, skipped the final "done" message. It was fixed before this run; replaying 2026-10-13's ship transcripts showed the old gate skipping it in two of the three replayed runs.
2. **The two false-alarm patterns above.**

An adversarial review of the benchmark before the run also found that concurrent runs could see and kill each other's processes: one agent's `pkill -f 'node --test'` reached another run. Each run now gets its own PID namespace.

## What this suggests

- **Jev itself is not the cost.** At $0.001 for 20 calls and about 0.3 s each, the gate's real cost is the extra Claude work after each block, about $0.05 and 12 s. With the fixed rules, the replay suggests blocks drop from 14 to about 3 on these tasks.
- **On well-specified tasks with a strong main model, Jev cannot show a gain.** Opus 5.5 at xhigh ran the tests and reported them every time. A gate earns its place where an agent stops without verifying, or claims done with something still broken.
- **Next, to measure what Jev can add:**
  - Run the same gate with Sonnet 5.5 or Haiku 5.5 as the main session.
  - Add tasks where a first pass tends to stop early: an untestable requirement, a flaky dependency, a long multi-step change.
  - Run base and Jev teams in one invocation (`--teams X,X-jev`), so they share the same conditions and Claude Code version.
  - Use `--trials 3`.
