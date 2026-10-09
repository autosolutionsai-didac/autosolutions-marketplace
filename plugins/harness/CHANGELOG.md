# Changelog

## 1.0.0 (2026-10-09)

First release.

- Roles: scout (Haiku 5.5), web-scout (Haiku 5.5), builder (Sonnet 5.5), refuter (Opus 5.5, high), judge (Fable 5.1, high).
- Workflows: `/harness:ship` (plan, parallel build in worktrees, three-lens refutation, one fix round, integrate, Fable gate), `/harness:review` (per-file review with verified findings), `/harness:audit` (codebase sweep with two-vote verification).
- Skills: `harness` (delegation protocol), `/harness:setup`, `/harness:gate`, `/harness:judge`, `/harness:second-opinion`.
- Hooks: SessionStart context; Stop decision gate with TypeSafe Jev, Jev via OpenRouter, or OpenAI Decisions backends, failing open.
- MCP: bundled `openai-judge` server (Responses API) with `gpt_review` and `gpt_opinion`.
- Templates: Explore override on Haiku, recommended settings, Fable stop-gate hook, CLAUDE.md snippet.
- Tests: mock-backed script tests (`tests/test-scripts.mjs`).
