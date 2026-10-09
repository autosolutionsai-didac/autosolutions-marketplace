---
name: judge
description: One-off Fable verdict on the current change. Gathers the diff and the verification evidence, runs the harness:judge subagent once, and reports PASS or FAIL with blocking issues. Usage: /harness:judge [base-branch]
argument-hint: "[base-branch]"
---

# /harness:judge

Base branch: `$ARGUMENTS` (default `main`; try `origin/main` then `master` if it does not exist).

1. Gather the evidence yourself first, cheaply:
   - `git diff --stat <base>...HEAD` and `git status --porcelain` for the shape of the change.
   - What was verified this session: the test, build, lint or type-check commands that ran and their outcome. If none ran, say so explicitly in the brief; do not run the whole suite now just to look good, the judge decides what to re-run.
   - Any refuter findings from earlier in the session, with their status (fixed, disputed, open).
2. Spawn `harness:judge` once. Do not pass a `model` parameter: its definition pins the `fable` alias, and users who cannot run Fable remap that alias with `ANTHROPIC_DEFAULT_FABLE_MODEL` (see `/harness:setup --judge-opus`). The brief must contain: the original request in one paragraph, the base ref, the diff stat, the verification evidence, the open findings, and the instruction to read the full diff with `git diff <base>...HEAD` plus `git diff` for uncommitted work.
3. Relay the verdict verbatim (VERDICT, CONFIDENCE, BLOCKING, ADVISORY, VERIFIED BY ME, SUMMARY). Do not soften a FAIL.
4. If FAIL: propose the fix order (blocking first) and offer to run `/harness:review` after the fixes rather than calling the judge again immediately. The judge is the most expensive model in the harness; one verdict per change is the budget.
