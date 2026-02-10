# AutoClaw 🦞

**The Engineering-First Headless Agent Framework: Stable, Scalable Automation for the Post-Vision Era.**

English | [简体中文](./README.zh-CN.md)

AutoClaw is a high-stability, open-source automation framework specifically engineered for **headless systems**.

Unlike "screen-seeing" agents (such as OpenClaw) that rely on visual interpretation, AutoClaw is built on a foundation of precise command-driven execution. This makes it significantly more **stable**, **robust from an engineering perspective**, and **easier to scale** across complex environments—whether it's a local server, a CI/CD pipeline, or thousands of containerized nodes.

## Why AutoClaw?
- 🐳 **Docker Native**: Built to run safely inside containers. Minimal footprint (Node.js/Alpine friendly).
- 🚀 **Better Engineering**: Operates via precise system APIs and shell commands rather than unstable visual recognition, ensuring deterministic outcomes.
- 🛡️ **Superior Stability**: Immune to issues like UI rendering, screen resolution, or network lag that plague vision-based agents.
- 📈 **Massive Scalability**: Low resource consumption allows orchestrating thousands of instances (e.g., in K8s) for true automation swarms.
- 🔌 **Swarm Ready**: Stateless design allows for easy orchestration via K8s, Docker Swarm, or simple shell loops.

## Features

- 📜 **Headless Execution**: No browsers, no GUIs. Pure terminal efficiency.
- 🤖 **Non-Interactive**: Intelligent flag handling (`-y`) for zero-touch automation.
- 📂 **Universal Control**: From simple file I/O to complex system administration and code refactoring.
- 🧠 **Context Aware**: Detects OS and container environments to optimize command strategies.

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