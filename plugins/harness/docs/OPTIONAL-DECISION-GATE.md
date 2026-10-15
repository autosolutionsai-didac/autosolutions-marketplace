# Optional: the decision gate (free, or Jev or OpenAI Decisions)

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

Pick one with `HARNESS_DECISION_PROVIDER` or the plugin option "Decision provider". On `auto` the gate uses the first paid key it finds, then a local server if its URL is set. The free backends below need no paid key.

### Free backends

| Backend | What answers | Cost | Speed | Setup | Privacy |
|---|---|---|---|---|---|
| `claude-cli` | Haiku 5.5 through `claude -p` and the login Claude Code already has | No extra money; draws on your plan's usage limits (about $0.0003 to $0.0004 per check in API terms) | About 3 s per check, measured | None | The final message and the evidence go to Anthropic, which already sees the session |
| `local` | An open decision model on your machine (Kev-0.8B by default) behind llama.cpp `llama-server` or Ollama, or Cloudflare's hosted Clef | $0 locally; Cloudflare's free daily allowance covers several hundred checks | Under 2 s on a GPU or Apple Silicon per the model authors; not measured on a plain x86 CPU, where it may be too slow | Install a server and a model, keep it running | Nothing leaves your machine (Cloudflare: their no-train, no-store terms) |
| `heuristic` | Rules over the final message and the transcript evidence | $0 | Instant | None | Nothing leaves your machine |

**`claude-cli`: free, no setup.** Set "Decision provider" to `claude-cli` (or `HARNESS_DECISION_PROVIDER=claude-cli`). The gate runs `claude -p` on Haiku 5.5 at low effort with a JSON schema for the four probabilities, no tools, no MCP servers, hooks disabled and `HARNESS_DECISION_GATE=off` in the child so it cannot trigger itself. It removes `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` from the child so the check uses your subscription rather than billing an API key; an `apiKeyHelper` in your settings would still win. In our live test it blocked a bare "Done.", allowed "npm test: 16 passed, 0 failed" after tests ran, and blocked "please run npm test yourself", each in about 3 seconds. The probabilities are the model's own estimates (0.85, 0.9) rather than token probabilities, so they are coarser than a decision model's. Knobs: `HARNESS_CLAUDE_MODEL` (default `claude-haiku-5-5`; on Bedrock, Vertex and Foundry use that provider's Haiku ID), `HARNESS_CLAUDE_EFFORT` (default `low`), `HARNESS_CLAUDE_TIMEOUT_MS` (default 15000). Two caveats: each check counts against your plan's usage windows, and Anthropic's terms for third-party tools using a subscription login have changed before, so this is a convenience for your own machine, not something to build a product on.

**`local`: free, private, offline.** Several open "decision models" now speak the same System One API as Jev, and llama.cpp's `llama-server` and Ollama serve them on `POST /v1/systemone`. The gate sends exactly the request it sends to TypeSafe, with the state rendered as text. Start a server and point the gate at it:

```
llama-server -hf ggml-org/Kev-0.8B-GGUF:Q8_0 --port 8080 -c 8192 -b 8192 -ub 8192 -np 1
# then: plugin option "Local decision server URL" = http://127.0.0.1:8080   (or HARNESS_LOCAL_URL)
```

Kev-0.8B is Apache-2.0 with an 8,192-token context, enough for the gate's payload. The gate asks the server's `GET /v1/models` for the model that lists `decisions` as an output, so a chat model loaded on the same server is not picked by mistake; set `HARNESS_LOCAL_MODEL` to choose one yourself (Ollama routes on the model name). `HARNESS_LOCAL_API_KEY` adds a bearer token. A URL that already names an endpoint is used as given, which is how Cloudflare's hosted Clef works: `HARNESS_LOCAL_URL=https://api.cloudflare.com/client/v4/accounts/<id>/ai/run/@cf/cloudflare/clef-flash`, `HARNESS_LOCAL_MODEL=clef-flash`, `HARNESS_LOCAL_API_KEY=<Cloudflare token>`. Before relying on it, measure it on your machine: the published latencies come from GPUs and Apple Silicon, small models on a plain CPU can take longer than the gate's 9-second limit (`HARNESS_LOCAL_TIMEOUT_MS`), and the server must stay warm. Avoid decision models whose context is shorter than the payload (for example Tev1 at about 2,000 tokens). Larger choices for stronger hardware: Kev-4B, or LiquidAI d1-3B (LFM Open License, free under $10M annual revenue).

**`heuristic`: free, instant, conservative.** No model. It treats a message as claiming completion only on a non-negated "done", "fixed", "implemented" and similar near the end; counts a test command in the transcript or a concrete pass report ("16 tests pass", "0 failed") as verification; and flags "please run" style hand-offs and "still failing" style open problems. It is built to miss cases rather than block good work, and it trusts a written pass report, so it will not catch an invented one. Its best use is as a fallback: `HARNESS_DECISION_FALLBACK=heuristic` answers when the main backend is down or slow.

**Not shipped, and why.** A generic OpenAI-compatible provider that reads yes/no token probabilities from any small chat model would work with Ollama (logprobs since v0.12.11) and llama.cpp, but raw token probabilities from chat models are badly calibrated and sensitive to wording, and the decision models above do the same job properly. Free hosted chat tiers (Groq's free plan, OpenRouter `:free` models) need an account, have tight daily limits, and some train on prompts. Claude Code's native `type: "prompt"` Stop hook needs no code, but it returns only ok or not ok, cannot see the edit and test evidence this gate collects, and can loop up to Claude Code's eight-continuation cap.

**Calibrating a free backend.** Every vendor fits its probabilities on its own data, and independent testing finds decision models overconfident. Set `HARNESS_GATE_LOG=~/.claude/gate-log.jsonl` to record each decision (backend, probabilities, whether tests ran, whether it blocked, and a hash of the message; add `HARNESS_GATE_LOG_TEXT=1` to keep the text). After a few hundred turns, check how often the blocks were right and move `HARNESS_GATE_THRESHOLD` accordingly.

### Paid backends

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
| `HARNESS_DECISION_PROVIDER` | `auto` | `local`, `claude-cli`, `heuristic`, `typesafe`, `openrouter` or `openai`; also the plugin option "Decision provider" |
| `HARNESS_DECISION_FALLBACK` | none | `heuristic` or `claude-cli`, tried once when the main backend fails |
| `HARNESS_LOCAL_URL`, `HARNESS_LOCAL_MODEL`, `HARNESS_LOCAL_API_KEY`, `HARNESS_LOCAL_TIMEOUT_MS` | none, discovered, none, 9000 | The `local` backend |
| `HARNESS_CLAUDE_MODEL`, `HARNESS_CLAUDE_EFFORT`, `HARNESS_CLAUDE_TIMEOUT_MS` | `claude-haiku-5-5`, `low`, 15000 | The `claude-cli` backend |
| `HARNESS_GATE_LOG`, `HARNESS_GATE_LOG_TEXT` | off | Append every decision to a JSONL file, optionally with the message text |
| `HARNESS_DEBUG=1` | off | Logs provider, probabilities and the evidence counts to the hook's stderr (visible in Claude Code's debug log) |

## Testing it without spending anything

```
node plugins/harness/tests/test-scripts.mjs
```

runs the gate against mock backends for both request shapes, plus the fail-open paths. To see it live, set `HARNESS_DEBUG=1`, make a change in a scratch repository, and end a turn with "Done" without running tests; the next turn starts with the gate's reason.

## Privacy

Each check sends the final assistant message, the list of edited file paths, the test commands that ran (truncated), the subagent and workflow names and a short `git status` sample to the provider you chose. No file contents, no diffs. With `local` or `heuristic` nothing leaves your machine. If that is still more than your policy allows, leave the gate off.

## Limits worth knowing

Decision models read instructions literally, cannot count and cannot read the code; they judge the message, not the change. That is why the hard evidence (what tools actually ran) is passed alongside, and why the gate's only power is one nudge per turn. Independent testing of Jev in September 2026 found it a good early-warning system and not a final check, which is exactly the job it has here. The judge is the final check.

## Sources for the free backends (checked 2026-10-13)

- Kev-0.8B model card and GGUF build: https://huggingface.co/jaredpalmer/kev-0.8b, https://huggingface.co/ggml-org/Kev-0.8B-GGUF
- llama.cpp server, `/v1/systemone` and `/v1/models`: https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
- Ollama decision models: https://docs.ollama.com/capabilities/decision
- Cloudflare Clef on Workers AI and its free allowance: https://developers.cloudflare.com/workers-ai/models/clef-flash/, https://developers.cloudflare.com/workers-ai/platform/pricing/
- Independent evaluation of decision models: https://artificialanalysis.ai/articles/artificial-analysis-decision-index
- Claude Code headless mode, hooks and authentication order: https://code.claude.com/docs/en/headless, https://code.claude.com/docs/en/hooks, https://code.claude.com/docs/en/authentication
