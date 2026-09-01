# Project: AutoClaw

## Project Overview
**AutoClaw** is a hyper-lightweight AI agent designed for **massive scale automation** in **headless/containerized environments**.
It serves as the ideal "runtime" for executing LLM-driven tasks within Docker containers, allowing users to orchestrate thousands of agents simultaneously for complex parallel workflows.

**GitHub**: [https://github.com/tsingliuwin/autoclaw](https://github.com/tsingliuwin/autoclaw)

## Core Philosophy
- **Docker First**: Designed to run inside isolated containers (Alpine/Debian).
- **Massive Scalability**: Low resource footprint enables high-concurrency swarms.
- **Headless & Non-Interactive**: Zero GUI dependencies; optimized for CI/CD and Clusters.

## Technology Stack
- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Commander.js
- **UI**: Inquirer (interactivity), Chalk (styling), Ora (spinners)
- **AI**: OpenAI SDK

## Directory Structure
- `src/`: Source code
  - `index.ts`: CLI entry point, config resolution and main loop.
  - `agent.ts`: Agent class handling LLM streaming, the tool loop, retries and step caps.
  - `providers.ts`: Provider presets (OpenAI-compatible endpoints as pure data).
  - `truncate.ts`, `retry.ts`: Tool-output truncation and API retry helpers.
  - `tools/`: Tool modules (Shell, files, time, search, browser, screenshot, email, notify, image, prompt optimizer), each exporting a `ToolModule` registered in `tools/index.ts`.
  - `*.test.ts`: Vitest unit tests, run with `npm test`.
- `dist/`: Compiled JavaScript files.

## Getting Started

### Prerequisites
- Node.js installed.
- OpenAI API Key (or compatible provider like DeepSeek, LocalLLM).

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
1.  **CLI Arguments**: (`-m`)
2.  **Environment Variables**: (`.env`, System Vars)
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

## Features
- **Natural Language Command Execution**: "List all markdown files in this folder."
- **File Management**: "Create a new file called test.txt with 'Hello World'."
- **Providers**: Built-in presets for DeepSeek, Kimi, Qwen, GLM, OpenRouter and Ollama via `-P`.
- **Safety**: Shell commands require user confirmation unless `--yes` is passed; without an interactive terminal they are denied instead of hanging.
- **Reliability**: Max-step cap, API retries with backoff, shell timeouts and tool-output truncation.
- **Context Aware**: Automatically detects OS and environment.