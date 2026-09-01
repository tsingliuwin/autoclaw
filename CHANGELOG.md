# Changelog

## 1.3.4 (2026-09-01)

### Added
- **Sensitive-path guard for file tools**: `read_file`/`write_file` refuse AutoClaw's own `setting.json` (global and project), `~/.autoclaw/.env`, and any `.env*` file unless `--allow-dangerous` — an unattended agent reads web pages and repos, and a prompt injection must not end up reading the local API keys to exfiltrate them.
- **Run history**: every agent run appends a best-effort JSONL line to `~/.autoclaw/logs/runs.jsonl` (time, model, task excerpt, status, steps, error, usage, duration) for post-hoc debugging of unattended batches.
- **Task wall-clock timeout**: `config.taskTimeoutMs` / `AUTOCLOW_TASK_TIMEOUT_MS` / per-task `taskTimeoutMs` in batch manifests bound the whole task (aborting in-flight API calls, new `timeout` status mapped to exit 2 like `max_steps`).

## 1.3.3 (2026-09-01)

### Added
- **`autoclaw doctor`**: headless self-diagnosis — config files, resolved provider/baseUrl/model, API key, a live connection test, resolved shell, registered tools, and playwright browser status; ✓/✗ output and an exit code (0 ready / 1 critical failure). `resolveRuntime` gained an interactive flag so doctor reports a missing key instead of prompting.
- **Safety gate for destructive shell commands**: even with `--yes`, patterns like `rm -rf`, `rd/del /s`, `Remove-Item -Recurse -Force`, `format`/`diskpart`/`mkfs`, `dd of=`, block-device writes, `shutdown`/`reboot`, and `reg delete` are refused with a message the model can act on. `--allow-dangerous` is the explicit override. Protects unattended runs against destructive instructions reaching the shell (e.g. via prompt injection).
- **Provider presets `ark` (Volcano Ark)** and **`siliconflow` (SiliconFlow)**, with `ARK_API_KEY` / `SILICONFLOW_API_KEY` env fallbacks.
- **README recipes**: Linux cron and Windows Task Scheduler sweeps, manifest-internal pipelines, and `autoclaw doctor` for CI.

## 1.3.2 (2026-09-01)

### Added
- **Setup wizard hardening**: live connection test with actionable error mapping (401 = API key, 404 = base URL, 400 = model name; retry / re-enter / save-anyway loop), model selection from the provider's own `/models` catalog when available, and a saved-config summary line.
- **Shell execution layer** (`src/shell.ts`): resolves a concrete shell (Git Bash > PowerShell > cmd on Windows; `config.shell` / `AUTOCLOW_SHELL` override) and drives it via spawn with explicit argv — no more cmd.exe-by-default. Timeouts kill the whole process tree (`taskkill /T /F`), output is decoded as UTF-8 with GBK fallback, and `maxBuffer` overflow truncates instead of throwing.
- **On-demand tool registration**: optional tools (email, search, group notify, image, prompt optimizer — and browser/screenshot when playwright is missing) are dropped from the tool definitions and the system prompt until their credentials exist, cutting per-turn prompt overhead.
- **Tool-result trimming**: in long loops, tool results older than the last three are replaced in history by a bounded excerpt with a re-run hint; large outputs stay on disk via `/view`.
- **Batch `--resume`**: skips tasks already `completed` in the results file and carries their results over — `--fail-fast` then `--resume` forms a natural retry loop.
- **Batch `-c/--concurrency <n>`**: run up to N tasks in parallel (default: 1, sequential).
- Performance budget suite runs as part of `npm test`: 1MB file write/read, 50k-line truncation, 1MB decode, and shell spawn each must finish under loose CI-safe latency ceilings.

### Changed
- **Per-tool hardening**: `read_file` caps reads at 1MB with a truncation notice and refuses binary files (NUL detection) instead of returning mojibake; all outbound HTTP calls (web search, group notify, image download, setup connection test / model catalog) now time out (15–120s) instead of hanging forever; nodemailer uses explicit connection/greeting/socket timeouts.

### Fixed
- **Setup wizard crashed on the first question** since 1.2.0: the provider selector used inquirer's removed `list` prompt type under inquirer v13; now uses `select`.

## 1.3.1 (2026-09-01)

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
