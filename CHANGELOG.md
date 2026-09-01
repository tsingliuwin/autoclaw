# Changelog

## 1.3.0 (2026-09-01)

### Added
- **Batch mode** (`autoclaw batch <manifest.jsonl>`): run a JSONL task list sequentially, each task in a fresh isolated agent; per-task results (`status`, `steps`, `message`, `error`, `usage`) written to a JSONL file (`-o`, default `<manifest>.results.jsonl`). Continue-on-error with `--fail-fast` opt-in; process exits `0` only when every task completed. Optional per-task `maxSteps` / `model` / `provider` overrides.
- Coverage tooling (`npm run coverage`) and spawn-based CLI end-to-end tests against a local mock LLM endpoint.

### Changed
- System prompt now describes the actual shell per platform (on Windows: cmd.exe semantics — `&&` only, no `$()` substitution, no `mkdir -p`, GBK output; prefer `powershell -Command`) — cuts trial-and-error turns when automating Windows machines.

## 1.2.0 (2026-09-01)

### Added
- **Reliability hardening** for unattended runs: max-step cap per task (`maxSteps` / `AUTOCLOW_MAX_STEPS`, default 25), API retries with exponential backoff on transient failures (429/408/5xx, network errors), shell command timeout (`shellTimeout` / `AUTOCLOW_SHELL_TIMEOUT`, default 120s), 10MB shell output buffer, and tool-output truncation (2000 lines / 50KB) before results enter the model context (full output is saved to `~/.autoclaw/output/` for `/view`).
- **Headless contract**: `agent.chat()` returns a structured result; headless runs now exit `0` (completed), `1` (hard failure), or `2` (step cap reached). New `--json` flag emits NDJSON events (`run_start`, `tool_call`, `tool_result`, `usage`, `run_end`) on stdout and moves all human/tool output to stderr.
- **Opt-in token usage**: set `AUTOCLOW_INCLUDE_USAGE=1` to request usage via `stream_options.include_usage`.
- **Provider presets**: `-P/--provider`, `AUTOCLOW_PROVIDER` or `config.provider` for `openai`, `deepseek`, `moonshot` (Kimi), `dashscope` (Qwen), `zhipu` (GLM), `openrouter`, `ollama` — pure data, no extra dependencies. Setup wizard now starts with a provider picker.
- **Dockerfile** (multi-stage, node:22-alpine, browser downloads skipped) and `.dockerignore`.
- **CI**: GitHub Actions workflow running build + tests on main and PRs.
- **Test suite**: Vitest with unit tests for the agent loop and all tool modules (57 tests); `npm test` / `npm run test:watch`.
- Malformed tool-call arguments are fed back to the model as a tool error instead of crashing the turn; shell execution is denied with an actionable hint when confirmation is required but no TTY is attached; system prompt now sets `GIT_TERMINAL_PROMPT=0`.
- `AGENTS.md` (replaces GEMINI.md) describing structure and conventions for coding agents.

### Changed
- Default models updated to current flagships: `gpt-5.6`, `deepseek-v4-pro`, `kimi-k3`, `qwen3.8-max`, `glm-5`, `openai/gpt-5.6`, `qwen3` (ollama).
- README (English & Chinese) aligned with actual behavior: web tools require Playwright browsers, provider presets, `--json`, exit codes, env-var reference, Docker build & run instructions.
- CONTRIBUTING.md now requires `npm test` in addition to `npm run build`.

### Fixed
- `SMTP_USER` environment variable was read under a mixed-case name (`SMTP_User`) and never matched on case-sensitive platforms.
- Tool results are truncated before entering the model context (previously only the terminal display was folded).
- Test files no longer compile into `dist/`.
