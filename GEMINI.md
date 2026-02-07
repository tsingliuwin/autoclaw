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
  - `index.ts`: CLI entry point and main loop.
  - `agent.ts`: Agent class handling LLM interaction and tool loop.
  - `tools.ts`: Implementation of tools (Shell execution, File I/O).
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
- **Safety**: All shell commands require user confirmation before execution.
- **Context Aware**: Automatically detects OS and environment.