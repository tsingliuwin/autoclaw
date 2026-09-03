# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository.

## Project Overview
**AutoClaw** is a hyper-lightweight AI agent designed for **massive scale automation** in **headless/containerized environments**.
It serves as the ideal "runtime" for executing LLM-driven tasks within Docker containers, allowing users to orchestrate thousands of agents simultaneously for complex parallel workflows.

**GitHub**: [https://github.com/tsingliuwin/autoclaw](https://github.com/tsingliuwin/autoclaw)

## Core Philosophy
- **Docker First**: Designed to run inside isolated containers (Alpine/Debian).
- **Massive Scalability**: Low resource footprint enables high-concurrency swarms.
- **Headless & Non-Interactive**: Zero GUI dependencies; optimized for CI/CD and Clusters.

Guard these properties when making changes: no new heavy dependencies, no interactive requirements on the headless path, and no features that assume a human is watching.

## Technology Stack
- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Commander.js
- **UI**: Inquirer (interactivity), Chalk (styling), Ora (spinners)
- **AI**: OpenAI SDK (any OpenAI-compatible endpoint)

## Directory Structure
- `src/`: Source code
  - `index.ts`: CLI entry point, config resolution and main loop.
  - `agent.ts`: Agent class handling LLM streaming, the tool loop, retries and step caps.
  - `providers.ts`: Provider presets (OpenAI-compatible endpoints as pure data).
  - `shell.ts`: Shell resolution (Git Bash/PowerShell/cmd/sh), spawn-based execution with process-tree kill and UTF-8/GBK decoding.
  - `sandbox.ts`: Sandbox policy (read-only / workspace-write / danger-full-access) with bwrap / sandbox-exec backends; Windows fail-closed.
  - `batch.ts`: Batch execution over JSONL task manifests (manifest parsing + per-task orchestration).
  - `skills.ts`: Skill system — SKILL.md parsing (zero-dependency YAML subset), scope discovery (builtin/user/project), system-prompt manifest, install/remove/pack.
  - `zip.ts`: Minimal dependency-free ZIP reader/writer (deflate + CRC32, deterministic output, zip-slip protection) for skill packages.
  - `truncate.ts`, `retry.ts`: Tool-output truncation and API retry helpers.
  - `tools/`: Tool modules (Shell, files, time, search, browser, screenshot, email, notify, image, render, prompt optimizer, background processes), each exporting a `ToolModule` registered in `tools/index.ts`.
  - `../skills/`: Built-in skill packages shipped with the npm package via the `files` field; user skills live in `~/.autoclaw/skills/`, project skills in `.autoclaw/skills/`. Three built-ins, layered: `code2media` is the universal HTML→image/SVG/PDF/animation engine; `poster-maker` and `invoice-maker` are independently optimized scenario skills (platform size specs, document layout conventions, quality checklists). Naming: the general engine is input→output named; scenario skills are named by the scenario (what the user gets), never by implementation.
  - `*.test.ts`: Vitest unit tests, run with `npm test`.
- `dist/`: Compiled JavaScript files.

## Getting Started

### Prerequisites
- Node.js installed.
- OpenAI API Key (or a compatible provider like DeepSeek, Kimi, Qwen, GLM).

### Installation (Development)
1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Build the project:
    ```bash
    npm run build
    ```
3.  Run tests:
    ```bash
    npm test
    ```

### Installation (User)
```bash
npm install -g autoclaw
```

### Updating
```bash
npm update -g autoclaw
```

### Configuration
AutoClaw uses a hierarchical configuration system.

**Priority Order:**
1.  **CLI Arguments**: (`-m`, `-P`)
2.  **Environment Variables**: (`OPENAI_API_KEY`, `AUTOCLOW_*`, system vars)
3.  **Project Config**: (`./.autoclaw/setting.json`)
4.  **Global Config**: (`~/.autoclaw/setting.json`)

**Setup:**
Run `autoclaw setup` to configure the global JSON settings.

**Security:**
Add `.autoclaw/` to `.gitignore` if using project-level config with secrets.

### Usage
Run the tool:
```bash
npm start
```
Or use the CLI command if installed globally:
```bash
autoclaw
```

## Conventions for Changes
- Before committing, run `npm test` and `npm run build`; both must pass.
- New tools should follow the `ToolModule` pattern in `src/tools/interface.ts` and be registered in `src/tools/index.ts`, with unit tests and mocked external services.
- Keep external services mocked in tests; the suite must never require network access or API keys.
- Documentation (README.md / README.zh-CN.md) must state what the code actually does — keep claims in sync with behavior, and mirror changes in both languages.
