# Optional: the decision gate (Jev or OpenAI Decisions)

A near-free, near-instant check that runs when Claude finishes a turn in which it changed files, and sends it back once if it claimed "done" without showing its work.

## What it checks

The gate sends the final message plus hard evidence from the session transcript (which files were edited, which test/build/lint commands ran, which subagents were used, a `git status` sample) to a decision model and asks four yes/no questions:

1. Does the message claim the work is complete?
2. Does it cite verification the assistant performed itself this turn (a command and its result)?
3. Does it still mention an error, failing check or TODO?
4. Does it leave a step to the user that the assistant could have done?

Code owns the rule. With the default threshold of 0.7, the stop is blocked when the message claims completion and neither a check command ran nor the message cites verification, or when it leaves an unresolved problem or a deferred step. The block reason tells Claude exactly what to do: run the relevant checks for the files it changed, fix what fails, resolve or scope out open items, and finish with a two-line verification summary.

It runs once per turn at most (Claude Code's `stop_hook_active` guard), and it fails open on every error path: no key, network trouble, a malformed response or a timeout all let the turn end normally.

## Backends

The two services answer the same kind of question in the same shape, so the gate treats them as interchangeable. Set one key:

| Backend | Key | Endpoint | Notes |
|---|---|---|---|
| TypeSafe Jev | `TYPESAFE_API_KEY` or plugin option "TypeSafe (Jev) API key" | `https://api.typesafe.ai/v1/systemone` | Jev is TypeSafe's "System One" model (September 2026): no text generation, typed answers with calibrated probabilities, $0.042 per million input tokens, output free, 70 to 500 ms. Early access may be waitlisted |
| Jev via OpenRouter | `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1/systemone` | Same model, billed to your OpenRouter credits, no waitlist. Model `typesafe/jev-latest` |
| OpenAI Decisions | `OPENAI_API_KEY` or plugin option "OpenAI API key" | `https://api.openai.com/v1/decisions` | Public beta on `gpt-6-luna`; about 150 ms per decision in OpenAI's launch figures. Accepts text (and images, unused here) |

Order when several keys exist: TypeSafe, then OpenRouter, then OpenAI. Force one with `HARNESS_DECISION_PROVIDER=typesafe|openrouter|openai`.

## Knobs

| Setting | Default | Meaning |
|---|---|---|
| Plugin option **Decision gate** (`/config`) or `HARNESS_DECISION_GATE` | `auto` | `off` disables the gate entirely |
| `HARNESS_GATE_THRESHOLD` | `0.7` | Probability above which "claims done" counts (clamped to 0.5 to 0.95). Unresolved-problem and deferred-step checks use threshold + 0.05 |
| `HARNESS_JEV_MODEL` | `jev-latest` (`typesafe/jev-latest` on OpenRouter) | Pin a Jev version such as `jev-1.13.0` once you have calibrated thresholds; the alias moves |
| `HARNESS_OPENAI_DECISION_MODEL` | `gpt-6-luna` | Only model the Decisions API supports today |
| `TYPESAFE_BASE_URL`, `OPENAI_BASE_URL` | vendor defaults | Gateways and self-hosted System One compatible servers |
| `HARNESS_DEBUG=1` | off | Logs provider, probabilities and the evidence counts to the hook's stderr (visible in Claude Code's debug log) |

## Testing it without spending anything

```
node plugins/harness/tests/test-scripts.mjs
```

runs the gate against mock backends for both request shapes, plus the fail-open paths. To see it live, set `HARNESS_DEBUG=1`, make a change in a scratch repository, and end a turn with "Done" without running tests; the next turn starts with the gate's reason.

## Privacy

Each check sends the final assistant message, the list of edited file paths, the test commands that ran (truncated), the subagent names and a short `git status` sample to the provider you chose. No file contents, no diffs. If that is still more than your policy allows, leave the gate off.

## Limits worth knowing

Decision models read instructions literally, cannot count and cannot read the code; they judge the message, not the change. That is why the hard evidence (what tools actually ran) is passed alongside, and why the gate's only power is one nudge per turn. Independent testing of Jev in September 2026 found it a good early-warning system and not a final check, which is exactly the job it has here. The judge is the final check.
