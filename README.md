# AutoClaw 🦞

[![NPM Version](https://img.shields.io/npm/v/autoclaw.svg?style=flat-square)](https://www.npmjs.com/package/autoclaw)
[![NPM Downloads](https://img.shields.io/npm/dm/autoclaw.svg?style=flat-square)](https://www.npmjs.com/package/autoclaw)
[![License](https://img.shields.io/npm/l/autoclaw.svg?style=flat-square)](https://github.com/tsingliuwin/autoclaw/blob/main/LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

**The Docker-Native Headless Agent for Massive Scale Automation.**

AutoClaw is a hyper-lightweight AI agent designed to live inside **Docker containers**. Unlike heavy, GUI-dependent agents, AutoClaw is built for **headless, massive-scale concurrency**.

You can run one instance to fix a local script, or orchestrate **10,000+ instances** in a Kubernetes cluster to refactor codebases, audit servers, or process data streams in parallel.

## Why AutoClaw?
- 🐳 **Docker Native**: Built to run safely inside containers. Minimal footprint (Node.js/Alpine friendly).
- 🚀 **Massive Scalability**: Text-only, headless design means you can spawn thousands of agents without consuming graphical resources.
- 🛡️ **Sandbox Safety**: Ideal for running untrusted code when isolated in Docker.
- 🔌 **Swarm Ready**: Stateless design allows for easy orchestration via K8s, Docker Swarm, or simple shell loops.
- 🧩 **Extensible Integrations**: Built-in support for Web Search (Tavily), Email (SMTP), and Notification Webhooks (Feishu, DingTalk, WeCom).

## Features

- 📜 **Headless Execution**: No browsers, no GUIs. Pure terminal efficiency.
- 🤖 **Non-Interactive Mode**: Intelligent flag handling (`-y`, `--no-interactive`) for zero-touch automation.
- 📂 **Universal Control**: From simple file I/O to complex system administration.
- 🧠 **Context Aware**: Detects container environments to optimize command strategies.
- 🌐 **Web Search**: Integrated with Tavily for real-time information retrieval.
- 📧 **Communication**: Send emails and push notifications to chat groups automatically.

## Tech Stack
- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Commander.js
- **UI**: Inquirer (interactivity), Chalk (styling), Ora (spinners)
- **AI**: OpenAI SDK (Compatible with DeepSeek, LocalLLM, etc.)

## Installation

### User Installation
Install globally via npm:
```bash
npm install -g autoclaw
```

### Development Installation
1.  Clone the repository:
    ```bash
    git clone https://github.com/tsingliuwin/autoclaw.git
    cd autoclaw
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Build the project:
    ```bash
    npm run build
    ```
4.  Link globally (optional):
    ```bash
    npm link
    ```

## Quick Start

1.  **Setup**: Run the interactive setup wizard to configure your API keys and integrations.
    ```bash
    autoclaw setup
    ```
2.  **Run**: Start the agent in interactive mode.
    ```bash
    autoclaw
    ```

## Usage

### Interactive Mode
Simply run `autoclaw` to enter the chat loop.
```bash
autoclaw
> List all TypeScript files in the src folder.
```

### Headless Mode (One-Shot)
Run a single command and exit.
```bash
autoclaw "Check disk usage and save the report to usage.txt" --no-interactive
```

### Auto-Confirm (CI/CD)
Automatically approve all tool executions (dangerous, use with caution or in sandboxes).
```bash
autoclaw "Refactor src/index.ts to use ES modules" -y
```

### CLI Options
- `-m, --model <model>`: Specify the LLM model (default: `gpt-4o`).
- `-n, --no-interactive`: Exit after processing the initial query (Headless mode).
- `-y, --yes`: Auto-confirm all tool executions (e.g., shell commands).

## Configuration

AutoClaw uses a hierarchical configuration system.

**Priority Order (Highest to Lowest):**
1.  **CLI Arguments**: (e.g., `-m gpt-4o`)
2.  **Environment Variables**: (`OPENAI_API_KEY`, `.env` file)
3.  **Project Config**: (`./.autoclaw/setting.json` in current directory)
4.  **Global Config**: (`~/.autoclaw/setting.json`)

### Supported Configuration Keys (JSON)
- `apiKey`: Your OpenAI API Key.
- `baseUrl`: Custom Base URL (e.g., for DeepSeek or LocalLLM).
- `model`: Default model to use.
- `tavilyApiKey`: API Key for Tavily Web Search.
- `smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`, `smtpFrom`: SMTP Email settings.
- `feishuWebhook`, `dingtalkWebhook`, `wecomWebhook`: Notification webhooks.

### Project-Level Config Example
Create a file at `.autoclaw/setting.json`:
```json
{
  "model": "gpt-3.5-turbo",
  "baseUrl": "https://api.deepseek.com/v1"
}
```

> **⚠️ Security Warning**: If you store your `apiKey` or secrets in `.autoclaw/setting.json`, make sure to add `.autoclaw/` to your `.gitignore` file to prevent leaking secrets!

## Integrations

### Web Search (Tavily)
AutoClaw can search the web if you provide a Tavily API Key during setup or in config.
- **Usage**: "Search for the latest Node.js release notes."

### Email (SMTP)
Configure SMTP settings to let the agent send emails.
- **Usage**: "Send an email to user@example.com with the summary of the log file."

### Notifications (Feishu/DingTalk/WeCom)
Configure webhooks to receive alerts or reports in your team chat apps.
- **Usage**: "Notify the team on Feishu that the build has finished."

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

---
GitHub: [https://github.com/tsingliuwin/autoclaw](https://github.com/tsingliuwin/autoclaw)