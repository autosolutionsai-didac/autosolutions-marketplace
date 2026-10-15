# What the 2026-10-15-range runs say: reviewing the whole input range

[2026-10-14-lean](../2026-10-14-lean/FINDINGS.md) added a strict check to the bugfix task: the discount rule must hold for fractional percents, not only the whole-number ones in the task's examples. Plain Opus got it right in 2 of 2 runs; the harness in 1 of 11. These runs test the change that finding suggested: every stage of `/harness:ship` now looks past the request's examples.

Two labels, same machine type (4 CPUs, 2 workflow agents at a time), Claude Code 2.1.300, three trials per cell:

- **2026-10-15-range** (this folder): the first wording. Lean team on bugfix-trio and rate-limit, default harness (`harness-sonnet-builders`) on bugfix-trio. Report: [REPORT.md](REPORT.md).
- **[2026-10-15-range2](../2026-10-15-range2/REPORT.md)**: the planner reworded after the first wording misfired on rate-limit (below). Same cells.

## The change

In `/harness:ship` (plugin changelog, 1.1.0):

- **Planner:** acceptance criteria name the input range the changed code accepts and say a stated rule holds across all of it, not only the task's examples. Where the change adds new inputs, the planner sets explicit bounds and says how values outside them are rejected.
- **Builders:** make the change hold for every accepted input and test at least one case beyond the examples.
- **Correctness refuter:** find the accepted range from types, validation and callers, test the rule across it, and compare against a quick independent reference when that is cheap.
- **Gate:** try a few accepted inputs beyond the request's examples.
- The `refuter` and `judge` agent definitions say the same.

The wording is general: it names no task, no discounts and no rounding.

## The short version

- **The strict check moved from 1 in 11 harness runs to every run.** Lean team 3 of 3 under both wordings; default harness 3 of 3 under both. In every passing run the builder got the rounding right on the first build; no reviewer or gate had to catch it.
- **The cost depends on the gate.** With the final wording the lean team's bugfix runs cost $1.37 on average (against $1.41 before the change) and its rate-limit runs $1.20 (against $1.13). The default harness's bugfix runs cost $3.46 (against $2.45 and $3.32 in its two earlier runs): its Fable gate now probes inputs too and cost $0.78 a run, against $0.26 and $0.37. All hidden tests still passed.
- **The first wording misfired once.** On rate-limit, one planner read "every input the code accepts" as "accept every positive limit and window". The refuters made the builder remove its safety bounds, the next refuters showed the extreme values broke the limiter, and the unit could never pass. The main session finished by hand and that run cost $2.82. The reworded planner sets bounds for new inputs; in the three reruns nothing like it happened.

| Team, task | Before (2026-10-13 to 10-14) | First wording | Final wording |
|---|---|---|---|
| Lean, bugfix-trio: strict check | 1 of 3 | 3 of 3 | 3 of 3 |
| Lean, bugfix-trio: mean cost, time | $1.41, 11.2 min | $1.64, 10.0 min | $1.37, 8.8 min |
| Lean, rate-limit: mean cost, time | $1.13, 5.9 min | $1.84, 7.8 min | $1.20, 7.3 min |
| Default harness, bugfix-trio: strict check | 0 of 2 (and 0 of 6 for the other Fable-gated runs) | 3 of 3 | 3 of 3 |
| Default harness, bugfix-trio: mean cost | $2.45 to $3.32 (one run each, two labels) | $2.95, 13.9 min | $3.46, 13.3 min |

Hidden tests: every run passed, with complete specs. Every lean run used the lean team's models (the options-delivered check).

## What changed inside the runs

**Bugfix.** The builders now check the rounding themselves. One builder reported comparing its fix "against exact rounding over 3,000 subtotals and every percent from 0 to 100 in 0.07 steps"; the fixes moved to exact integer arithmetic. With the final wording no bugfix unit was sent back, so the refuters' extra checking showed up only as a slightly larger refute bill ($0.56 per run against $0.48), offset by a smaller main session.

**Rate-limit.** Two of the three final-wording runs had a unit sent back once (none did before the change). The fix rounds were cheap ($0.12 and $0.18) and the gate passed all three. The misfiring first-wording run did surface real issues the hidden tests do not check: memory that grows forever with random API keys, a URL Node cannot parse skipping the limiter, and a `Retry-After` one second too high under a fractional clock. That is the trade the change makes: more of what the code accepts gets looked at, and the hidden tests only see part of it.

## How far to trust this

- **Same task that found the gap.** The strict check is on the bug that motivated the change. The wording is general, but only a task the harness has never been tuned on can show it generalises. A held-out task with a different input-range edge is the next test.
- **Small samples.** Three runs per cell, against one to three before. 3 of 3 against 1 of 11 is a large gap; the cost differences of a few cents are within run-to-run noise.
- **Plain Opus was not rerun.** It needs no harness change and passed the strict check in both of its earlier runs.

## Next

- A held-out task whose spec gives examples that leave out part of the accepted input range, run on the lean and default teams and plain Opus.
- An effort sweep on the plain arm, which outside cost research recommends: plain Opus 5.5 at low, medium, high and xhigh, plus Sonnet 5.5, on the same five tasks. It would show whether xhigh is what got plain Opus the strict check, or whether a cheaper setting does too.
