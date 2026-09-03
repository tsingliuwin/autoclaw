# AutoClaw 🦞

[![NPM Version](https://img.shields.io/npm/v/autoclaw.svg?style=flat-square)](https://www.npmjs.com/package/autoclaw)
[![NPM Downloads](https://img.shields.io/npm/dm/autoclaw.svg?style=flat-square)](https://www.npmjs.com/package/autoclaw)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github&style=flat-square)](https://github.com/tsingliuwin/autoclaw)
[![License](https://img.shields.io/npm/l/autoclaw.svg?style=flat-square)](https://github.com/tsingliuwin/autoclaw/blob/main/LICENSE)
[![Safety](https://img.shields.io/badge/Safety-Notice-yellow?style=flat-square)](./SAFETY.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

**The Engineering-First Headless Agent Framework: Stable, Scalable Automation for the Post-Vision Era.**

English | [简体中文](./README.zh-CN.md)

---

🔗 **GitHub Repository**: [https://github.com/tsingliuwin/autoclaw](https://github.com/tsingliuwin/autoclaw)

---

AutoClaw is a high-stability, open-source automation framework specifically engineered for **headless systems**.

Unlike "screen-seeing" agents (such as OpenClaw) that rely on visual interpretation, AutoClaw is built on a foundation of precise command-driven execution. This makes it significantly more **stable**, **robust from an engineering perspective**, and **easier to scale** across complex environments—whether it's a local server, a CI/CD pipeline, or thousands of containerized nodes.

## Why AutoClaw?
- 🐳 **Docker Native**: Built to run safely inside containers. Minimal footprint (Node.js/Alpine friendly).
- 🚀 **Better Engineering**: Operates via precise system APIs and shell commands rather than unstable visual recognition, ensuring deterministic outcomes.
- 🛡️ **Superior Stability**: Immune to issues like UI rendering, screen resolution, or network lag that plague vision-based agents.
- 📈 **Massive Scalability**: Low resource consumption allows orchestrating thousands of instances (e.g., in K8s) for true automation swarms.
- 🔌 **Swarm Ready**: Stateless design allows for easy orchestration via K8s, Docker Swarm, or simple shell loops.
- 🧩 **Extensible Integrations**: Built-in support for Web Search (Tavily), Email (SMTP), and Notification Webhooks (Feishu, DingTalk, WeCom).

## Features

- 📜 **Headless Execution**: No GUI required — pure terminal efficiency. Core operation is shell + file I/O; the optional web tools run in headless Chromium.
- 🤖 **Non-Interactive Mode**: Intelligent flag handling (`-y`, `--no-interactive`) for zero-touch automation.
- 📂 **Universal Control**: From simple file I/O to complex system administration.
- 🖥️ **Background Processes**: start long-lived commands (dev servers, watchers) detached and poll their output without blocking the run.
- 🛡️ **Safety Rails**: destructive-command gate, credential-file guard, step cap, wall-clock timeout, and API retries — designed for machines nobody is watching.
- 🧠 **Context Aware**: Provides accurate OS, system and time context so relative dates ("today", "next Monday") are handled correctly.
- 🌐 **Web Search**: Integrated with Tavily for real-time information retrieval.
- 🌍 **Web Reading & Screenshots**: Extract article content and capture page screenshots (requires `npx playwright install chromium`).
- 🎨 **Image Generation**: DALL-E compatible image generation via any OpenAI-compatible images API.
- 🖼️ **Deterministic Image Rendering** (`render_image`): HTML + Tailwind templates rendered into PNG/JPEG/WebP/SVG, plus animations (animated WebP/GIF/APNG from CSS `@keyframes`). Fully offline, no browser, milliseconds per render — for OG cards, banners, badges and data cards where exact text and layout matter.
- 📄 **PDF Rendering** (`render_pdf`): HTML templates rendered into paged PDFs with selectable text, repeating headers/footers and page counters. Fully offline, no browser — for invoices, reports and certificates.
- 🕒 **Time Accuracy**: Built-in tool to get precise system date and time for correct temporal context.
- 📧 **Communication**: Send emails and push notifications to chat groups automatically.

## Tech Stack
- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Commander.js
- **UI**: Inquirer (interactivity), Chalk (styling), Ora (spinners)
- **AI**: OpenAI SDK (any OpenAI-compatible endpoint: DeepSeek, Kimi, Qwen, GLM, Ollama, …)
- **Web tools**: Playwright (headless Chromium for `read_website` / `take_screenshot`)
- **Rendering**: Takumi (Rust engine via native binding — powers `render_image` / `render_pdf`, no browser)

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

1.  **Setup**: Run the interactive setup wizard to configure your API keys and integrations. The wizard runs a live connection test (failures map to the likely wrong field: 401 = key, 404 = base URL, 400 = model name) and can list the provider's models for you to pick from.
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
Interactive commands: `exit` / `quit` to leave, and `/view` to open the full output of the last tool result in a pager — tool output longer than 20 lines is folded on screen and saved to `~/.autoclaw/output/`.

### Headless Mode (One-Shot)
Run a single command and exit.
```bash
autoclaw "Check disk usage and save the report to usage.txt" --no-interactive
```
The exit code reports the outcome for orchestrators: `0` completed, `1` hard failure (e.g. API error), `2` step cap reached (task unfinished).

### Machine-Readable Output (--json)
Add `--json` to print one JSON event per line on stdout (run_start, tool_call, tool_result, usage, run_end); human output moves to stderr, including anything tools print themselves.
```bash
autoclaw "Deploy and report" -y -n --json
```
Token usage is collected only when `AUTOCLOW_INCLUDE_USAGE=1` (or `true`) is set — it is opt-in because not every OpenAI-compatible provider accepts `stream_options.include_usage`.

### Batch Mode (Swarm Worker)
Feed a JSONL manifest of tasks; each task runs in a fresh, isolated agent (one task's context never leaks into another) and per-task results are written as JSONL:
```bash
autoclaw batch tasks.jsonl -y                          # results -> tasks.results.jsonl
autoclaw batch tasks.jsonl -o out.jsonl --fail-fast
```
Manifest lines are `{"id": "...", "task": "..."}` — `id` is optional (defaults to `task-N`); blank lines and `#` comments are skipped. Optional per-task overrides: `maxSteps`, `model`, `provider`.

One failing task does not stop the batch (use `--fail-fast` for that). The process exits `0` when every task completed, `1` otherwise, so cron and K8s Jobs can detect bad batches. Task output stays human-readable on stdout — the results file is the machine-readable contract, with `status`, `steps`, `message`, `error` and `usage` per task.

Long batches can stop and pick up where they left off, and can use local parallelism:
```bash
autoclaw batch big.jsonl -y --resume        # skip tasks already completed in the results file
autoclaw batch big.jsonl -y -c 4            # run up to 4 tasks in parallel
```
Unattempted tasks are simply absent from the results file, so `--fail-fast` followed by `--resume` is a natural retry loop.

AutoClaw also keeps its own prompt lean: optional tools (web search, email, group notifications, image generation) only register once their credentials are configured, and in long loops older tool results in the model context are replaced by short excerpts.

### Skills (Portable Capability Packages)
AutoClaw runs `SKILL.md` skill packages — the same format used by the WorkBuddy skill store, so one package runs both inside AutoClaw and on other platforms. The system prompt only carries a one-line manifest per skill; when a task matches, the agent reads that skill's `SKILL.md` and follows it with the normal file and shell tools. There is no privileged runtime: skill scripts pass through the same destructive-command gate, sandbox and step caps as any command.

Scopes (later shadows earlier on name collision): built-in `skills/` (ships with the npm package) → `~/.autoclaw/skills/` → `.autoclaw/skills/`.

```bash
autoclaw skill list                     # show discovered skills with scope and version
autoclaw skill install <zip|dir|https-url>  # install into ~/.autoclaw/skills/ (zip-slip protected)
autoclaw skill remove <name>            # remove a user-installed skill (built-ins are protected)
autoclaw skill pack <dir>               # zip a skill dir -> <name>-skill-<version>.zip (SKILL.md at zip root)
```

Install accepts any SKILL.md-compatible package: a local directory, a local zip, or an https download URL. It tolerates third-party layout variance (SKILL.md at the zip root, a plain folder, or a `skills/<name>/` wrapper, macOS `__MACOSX`/`.DS_Store` junk) and always installs under the skill's frontmatter `name`, so discovery and the manifest stay consistent.

Three built-in skills, layered: [`code2media`](skills/code2media/SKILL.md) (Code to Media) is the universal rendering engine — a standalone Node script turning any HTML into images/SVG/paged PDFs/animations; [`poster-maker`](skills/poster-maker/SKILL.md) and [`invoice-maker`](skills/invoice-maker/SKILL.md) are independently optimized scenario skills carrying platform size specs, document layout conventions and quality checklists. The same zips publish to any SKILL.md-compatible store. Skills compose with batch mode: one manifest line like `{"id":"inv-042","task":"用 invoice-maker 技能根据 orders-042.json 生成发票 invoices/042.pdf"}` drives an isolated swarm worker through the same skill.

### Recipes

Daily ops sweep on Linux (crontab):
```cron
0 9 * * * autoclaw batch /opt/ops/daily.jsonl -y -n --resume >> /var/log/autoclaw.log 2>&1
```

Scheduled sweep on Windows (Task Scheduler):
```bash
schtasks /create /tn "AutoClaw Daily" /tr "autoclaw batch C:\ops\daily.jsonl -y -n" /sc daily /st 09:00
```

Pipeline inside one manifest — each task writes files the next task reads:
```jsonl
{"id": "sweep", "task": "检查磁盘与关键服务状态,报告写入 report/sweep.md"}
{"id": "notify", "task": "读取 report/sweep.md,用三句话总结后推送到飞书"}
```

Diagnostics on a fresh machine or in CI:
```bash
autoclaw doctor   # exit 0 = ready; exit 1 = what's missing is printed
```

### Auto-Confirm (CI/CD)
Automatically approve all tool executions (dangerous, use with caution or in sandboxes).
```bash
autoclaw "Refactor src/index.ts to use ES modules" -y
```

### CLI Options
- `-m, --model <model>`: Specify the LLM model (default: `gpt-5.6`).
- `-P, --provider <name>`: Use a provider preset (see [Providers](#providers)).
- `-n, --no-interactive`: Exit after processing the initial query (Headless mode).
- `-y, --yes`: Auto-confirm all tool executions (e.g., shell commands).
- `--allow-dangerous`: Let `-y` run clearly destructive commands (rm -rf, format, shutdown, ...) that the built-in safety gate would block.
- `--json`: Emit NDJSON events on stdout (for orchestrators; use with `-n`).

### Diagnostics
`autoclaw doctor` checks everything headlessly and prints ✓/✗ per item: config files, resolved provider/baseUrl/model, API key, a live connection test, resolved shell, registered tools, and playwright browser status. Exit `0` = ready, `1` = a critical item failed (the failing item is printed). Ideal for CI or a fresh machine.

### Sandbox
Command execution can be confined with `config.sandbox` / `AUTOCLOW_SANDBOX` (vocabulary borrowed from DeepSeek Harness):
- `danger-full-access` (default): commands run unconstrained.
- `workspace-write`: commands can write only inside the current working directory and `/tmp`.
- `read-only`: commands cannot write anywhere.

Backends: bubblewrap on Linux (`apt install bubblewrap`), `sandbox-exec` on macOS. **Windows has no backend yet** — non-default modes fail closed (commands are refused with a clear error) instead of pretending to confine; run with `danger-full-access` there for now. Reads and network are not confined by this vocabulary.

### Providers
AutoClaw works with any OpenAI-compatible endpoint. Built-in presets fill in the base URL and a default model for you:
```bash
autoclaw -P deepseek "Check disk usage and save a report" -y -n
```
Available presets: `openai`, `deepseek`, `moonshot` (Kimi), `dashscope` (Qwen), `zhipu` (GLM), `ark` (Volcano Ark), `siliconflow`, `openrouter`, `ollama` (local). You can still override the model with `-m` or config. When `OPENAI_API_KEY` is not set, the API key is read from the provider's own env var (e.g. `DEEPSEEK_API_KEY`, `MOONSHOT_API_KEY`, `DASHSCOPE_API_KEY`, `ZHIPU_API_KEY`, `ARK_API_KEY`, `SILICONFLOW_API_KEY`, `OPENROUTER_API_KEY`).

## Configuration

AutoClaw uses a hierarchical configuration system.

**Priority Order (Highest to Lowest):**
1.  **CLI Arguments**: (e.g., `-m gpt-5.6`)
2.  **Environment Variables**: (`OPENAI_API_KEY`, `.env` file)
3.  **Project Config**: (`./.autoclaw/setting.json` in current directory)
4.  **Global Config**: (`~/.autoclaw/setting.json`)

### Supported Configuration Keys (JSON)
- `provider`: Provider preset name (e.g. `deepseek`).
- `apiKey`: Your OpenAI API Key.
- `baseUrl`: Custom Base URL (e.g., for DeepSeek or LocalLLM).
- `model`: Default model to use.
- `maxSteps`: Max LLM turns per task before the agent stops (default: `25`).
- `shellTimeout`: Shell command timeout in milliseconds (default: `120000`).
- `taskTimeoutMs`: Whole-task wall-clock timeout in milliseconds (off by default; aborts in-flight API calls and stops with `timeout` status).
- `sandbox`: Confine shell commands (`read-only`, `workspace-write`, `danger-full-access`; default: `danger-full-access`).
- `skillsEnabled`: Set `false` to disable the skill system (default: `true`).
- `shell`: Force a shell for `execute_shell_command` (`bash`, `powershell`, `cmd`, `sh`; default: auto-detect — Git Bash > PowerShell > cmd on Windows).
- `tavilyApiKey`: API Key for Tavily Web Search.
- `smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`, `smtpFrom`: SMTP Email settings.
- `feishuWebhook`, `dingtalkWebhook`, `wecomWebhook`: Notification webhooks.

### Project-Level Config Example
Create a file at `.autoclaw/setting.json`:
```json
{
  "model": "gpt-5.6",
  "baseUrl": "https://api.deepseek.com/v1"
}
```

> **⚠️ Security Warning**: If you store your `apiKey` or secrets in `.autoclaw/setting.json`, make sure to add `.autoclaw/` to your `.gitignore` file to prevent leaking secrets!

### Environment Variables
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`: main LLM settings.
- `AUTOCLOW_PROVIDER`: provider preset used when `-P` is not passed.
- `AUTOCLOW_MAX_STEPS`, `AUTOCLOW_SHELL_TIMEOUT`: reliability limits (max LLM turns per task; shell timeout in ms).
- `AUTOCLOW_TASK_TIMEOUT_MS`: whole-task wall-clock timeout in ms.
- `AUTOCLOW_SANDBOX`: confine shell commands (`read-only`, `workspace-write`, `danger-full-access`).
- `AUTOCLOW_SHELL`: force the shell for shell commands (`bash`, `powershell`, `cmd`, `sh`).
- `AUTOCLOW_INCLUDE_USAGE`: set to `1`/`true` to request token usage from the API (opt-in).
- `TAVILY_API_KEY`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`, `FEISHU_WEBHOOK`/`FEISHU_KEYWORD`, `DINGTALK_WEBHOOK`/`DINGTALK_KEYWORD`, `WECOM_WEBHOOK`/`WECOM_KEYWORD`: tool credentials as an alternative to setup.

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

### Date & Time
Built-in utility to provide the agent with the current system time, ensuring accurate handling of relative time requests.
- **Usage**: "What's the date today?" or "Remind me to check the logs next Monday."

### Deterministic Rendering (Takumi)
`render_image` turns HTML templates into precise images — PNG, JPEG, WebP or vector SVG — offline with no browser or AI model involved. `render_pdf` turns HTML templates into paged PDFs with selectable text, repeating header/footer bands, and `<span class="pageNumber">` / `<span class="totalPages">` counters. Templates are styled with inline CSS, `<style>` blocks, or Tailwind v4 utilities via the `tw` attribute (`<div tw="w-full h-full bg-blue-500">`); plain `class` attributes only match regular CSS selectors. Both tools auto-detect common system fonts (CJK/emoji included); register specific font files via `font_paths`.

Typical workflows — describe the job in natural language and the agent writes the templates itself:

```bash
# Blog SEO: one OG share image per post
autoclaw "Read the title and summary of every .md file in content/posts/ and render an OG share image (1200x630) for each into public/og/" -y -n

# Finance / e-commerce: invoice PDFs from an orders export, then email them out
autoclaw "Read orders.csv, render a PDF invoice for each order into invoices/ (A4, page-number footer), then email every invoice to the customer address in its row" -y

# HR / training: personalized completion certificates for an attendee list
autoclaw "Read attendees.json and render a completion certificate (1414x1000) for each attendee into certs/, numbered from AC-2026-0001" -y -n

# Ops reporting under cron/CI: deterministic output — same input produces the same PDF
autoclaw "Aggregate this week's nginx access log into a one-page A4 PDF report with a metrics table and save it as report.pdf" -y -n
```

Swarm scale via batch mode — each task renders in its own isolated agent:

```bash
cat > render-jobs.jsonl <<'EOF'
{"id": "og-001", "task": "Render an OG share image for post-001.md into public/og/001.png"}
{"id": "og-002", "task": "Render an OG share image for post-002.md into public/og/002.png"}
EOF
autoclaw batch render-jobs.jsonl -y -c 4
```

Tool choice: use `render_image` / `render_pdf` when exact text, layout and branding matter (cards, banners, badges, documents); use `generate_image` for artistic or photographic imagery. Emoji in templates are fetched from the Twemoji CDN by default, so fully offline environments should keep templates text-only.

Runnable examples with committed previews: [examples/render](examples/render/README.md) (OG cards, social posters, KPI cards, weekly-report PDFs, SVG badges, certificates, animations, multi-page invoices — plus a real agent one-shot run under `agent-run/`). The same capability ships as a portable [WorkBuddy skill](skills/code2media/SKILL.md) (`code2media-skill-1.2.1.zip`) that renders HTML → image/SVG/PDF/animation via a standalone Node script on any machine with Node >= 20.19.

## Docker Support

### Build & Run
The repository ships a multi-stage `Dockerfile` (node:22-alpine, browser downloads skipped to keep the image slim). The container runs headless one-shot tasks against the mounted directory:
```bash
docker build -t autoclaw .
docker run --rm -v "$PWD":/workspace -w /workspace -e OPENAI_API_KEY=sk-... autoclaw "Check disk usage and save a report" -y -n
```
Note: browser-based tools (`read_website` / `take_screenshot`) are not functional in the default image since browsers are not bundled — they return a friendly install hint instead.

### Chinese Font Issues in Screenshots and Rendered Output
When running AutoClaw inside a Docker container (especially Alpine or Debian Slim), screenshots of Chinese websites may display text as square boxes ("tofu") due to missing fonts. Emojis (e.g., 🔥) may also appear as squares. The same affects `render_image` / `render_pdf` output containing CJK text.

**Solution:** Install CJK (Chinese/Japanese/Korean) and Emoji fonts in your container. The render tools auto-detect the same font paths, so installing these packages fixes both screenshots and rendered images/PDFs.

**For Debian/Ubuntu:**
```bash
apt-get update && apt-get install -y fonts-noto-cjk fonts-wqy-zenhei fonts-noto-color-emoji
```

**For Alpine Linux:**
```bash
apk add font-noto-cjk font-noto-emoji
```

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

## Star History

<a href="https://www.star-history.com/?repos=tsingliuwin%2Fautoclaw&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=tsingliuwin/autoclaw&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=tsingliuwin/autoclaw&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=tsingliuwin/autoclaw&type=date&legend=top-left" />
 </picture>
</a>
