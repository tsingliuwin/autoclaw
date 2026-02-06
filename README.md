# AutoClaw 🦞

**The Docker-Native Headless Agent for Massive Scale Automation.**

AutoClaw is a hyper-lightweight AI agent designed to live inside **Docker containers**. Unlike heavy, GUI-dependent agents, AutoClaw is built for **headless, massive-scale concurrency**.

You can run one instance to fix a local script, or orchestrate **10,000+ instances** in a Kubernetes cluster to refactor codebases, audit servers, or process data streams in parallel.

## Why AutoClaw?
- 🐳 **Docker Native**: Built to run safely inside containers. Minimal footprint (Node.js/Alpine friendly).
- 🚀 **Massive Scalability**: Text-only, headless design means you can spawn thousands of agents without consuming graphical resources.
- 🛡️ **Sandbox Safety**: Ideal for running untrusted code when isolated in Docker.
- 🔌 **Swarm Ready**: Stateless design allows for easy orchestration via K8s, Docker Swarm, or simple shell loops.

## Features

- 📜 **Headless Execution**: No browsers, no GUIs. Pure terminal efficiency.
- 🤖 **Non-Interactive**: Intelligent flag handling (`-y`) for zero-touch automation.
- 📂 **Universal Control**: From simple file I/O to complex system administration.
- 🧠 **Context Aware**: Detects container environments to optimize command strategies.

## Installation

```bash
npm install -g autoclaw
```

## Updating

To update AutoClaw to the latest version:

```bash
npm update -g autoclaw
```

## Quick Start

1.  **Setup**: Run the setup wizard to configure your API key.
    ```bash
    autoclaw setup
    ```
2.  **Run**: Start the agent.
    ```bash
    autoclaw
    ```

## Usage Examples

- "List all TypeScript files in the src folder."
- "Create a new React component named Button in `components/Button.tsx`."
- "Check my disk usage and tell me which folder is the largest."

## Configuration

AutoClaw uses a hierarchical configuration system.

**Priority Order (Highest to Lowest):**
1.  **CLI Arguments**: (e.g., `-m gpt-4o`)
2.  **Environment Variables**: (`OPENAI_API_KEY`, `.env` file)
3.  **Project Config**: (`./.autoclaw/setting.json` in current directory)
4.  **Global Config**: (`~/.autoclaw/setting.json`)

### Supported Configuration Keys (JSON)
- `apiKey`: Your API Key.
- `baseUrl`: Custom Base URL.
- `model`: Default model to use.

### Project-Level Config (Example)
Create a file at `.autoclaw/setting.json`:
```json
{
  "model": "gpt-3.5-turbo",
  "baseUrl": "https://api.example.com/v1"
}
```

> **⚠️ Security Warning**: If you store your `apiKey` in `.autoclaw/setting.json`, make sure to add `.autoclaw/` to your `.gitignore` file to prevent leaking secrets!

## License

MIT
