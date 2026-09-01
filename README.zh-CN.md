# AutoClaw 🦞

[![NPM Version](https://img.shields.io/npm/v/autoclaw.svg?style=flat-square)](https://www.npmjs.com/package/autoclaw)
[![NPM Downloads](https://img.shields.io/npm/dm/autoclaw.svg?style=flat-square)](https://www.npmjs.com/package/autoclaw)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github&style=flat-square)](https://github.com/tsingliuwin/autoclaw)
[![License](https://img.shields.io/npm/l/autoclaw.svg?style=flat-square)](https://github.com/tsingliuwin/autoclaw/blob/main/LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

**稳定、高工程化、易规模化：专为无界面系统设计的高效自动化 Agent 框架。**

[English](./README.md) | 简体中文

---

🔗 **GitHub 仓库**: [https://github.com/tsingliuwin/autoclaw](https://github.com/tsingliuwin/autoclaw)

---

AutoClaw 是一款针对 **“无界面系统” (Headless Systems)** 的高稳定性自动化 Agent 开源框架。

相比于 OpenClaw 等需要“看屏幕”的 Agent（如视觉解析），AutoClaw 采用纯指令驱动，具有更强的**工程化**属性、更高的**稳定性**，以及极易**规模化**的特点。它专为在各种复杂环境中执行确定性的自动化任务而设计——无论是本地服务器、CI/CD 流水线，还是成千上万个容器节点。

## 为什么选择 AutoClaw?

- 🐳 **Docker 友好**: 专为容器化环境设计，无 GUI 依赖，极致轻量（Node.js/Alpine 友好）。
- 🚀 **更强工程化 (Better Engineering)**: 并非依赖不稳定的视觉识别，而是通过系统 API 和 Shell 指令精准操作，确保任务执行的确定性。
- 🛡️ **高稳定性 (Superior Stability)**: 摆脱了图形界面渲染、屏幕分辨率、网络延迟对视觉识别的影响，即便在极端的 Headless 环境下也能稳定运行。
- 📈 **易于规模化 (Massive Scalability)**: 低资源占用使得你可以同时编排成千上万个 Agent 实例（如在 Kubernetes 集群中），实现真正的自动化蜂群。
- 🔌 **集群就绪 (Swarm Ready)**: 无状态设计，支持通过 K8s、Docker Swarm 或简单的 Shell 脚本进行大规模调度。
- 🧩 **可扩展集成**: 内置支持网页搜索 (Tavily)、邮件发送 (SMTP) 以及通知钩子 (飞书、钉钉、企业微信)。

## 特性

- 📜 **无头执行 (Headless Execution)**: 无需图形界面，纯终端运行。核心流程仅依赖 Shell 与文件操作；可选的网页工具在无头 Chromium 中运行。
- 🤖 **非交互模式**: 支持自动化标志（`-y`, `--no-interactive`），完美适配零干预的自动化流程。
- 📂 **全方位控制 (Universal Control)**: 从基础的文件 I/O 到复杂的系统管理。
- 🛡️ **防失控保护**: 单任务步数上限、API 指数退避重试、Shell 命令超时、工具输出截断，保证模型上下文不被撑爆。
- 🧠 **上下文感知 (Context Aware)**: 提供精确的操作系统与时间上下文，正确处理"今天"、"下周一"等相对时间。
- 🌐 **网页搜索**: 集成 Tavily，支持实时信息检索。
- 🌍 **网页阅读与截图**: 提取文章正文、截取页面图片（需先执行 `npx playwright install chromium`）。
- 🎨 **图像生成**: 通过任意 OpenAI 兼容的图像接口生成图片（兼容 DALL-E）。
- 🕒 **时间精准**: 内置工具获取精确系统日期和时间，确保正确的时间上下文。
- 📧 **通讯能力**: 自动发送电子邮件并将通知推送至聊天群组。

## 技术栈
- **运行时**: Node.js
- **语言**: TypeScript
- **框架**: Commander.js
- **UI**: Inquirer (交互), Chalk (样式), Ora (加载动画)
- **AI**: OpenAI SDK（任意 OpenAI 兼容端点：DeepSeek、Kimi、Qwen、GLM、Ollama 等）
- **网页工具**: Playwright（无头 Chromium，用于 `read_website` / `take_screenshot`）

## 安装

### 用户安装
通过 npm 全局安装：
```bash
npm install -g autoclaw
```

### 开发安装
1.  克隆仓库：
    ```bash
    git clone https://github.com/tsingliuwin/autoclaw.git
    cd autoclaw
    ```
2.  安装依赖：
    ```bash
    npm install
    ```
3.  构建项目：
    ```bash
    npm run build
    ```
4.  全局链接 (可选)：
    ```bash
    npm link
    ```

## 快速上手

1.  **配置**: 运行交互式设置向导以配置您的 API 密钥和集成插件。向导会现场做连接测试(失败映射到最可能出错的字段:401=key 错、404=URL 错、400=模型名错),并能拉取服务商的模型列表供你直接选择。
    ```bash
    autoclaw setup
    ```
2.  **运行**: 在交互模式下启动 Agent。
    ```bash
    autoclaw
    ```

## 使用方法

### 交互模式
直接运行 `autoclaw` 进入对话循环。
```bash
autoclaw
> 列出 src 文件夹中所有的 TypeScript 文件。
```
交互命令：`exit` / `quit` 退出；`/view` 用分页器查看上一次工具的完整输出——超过 20 行的工具输出会在屏幕上折叠，并保存到 `~/.autoclaw/output/`。

### 无头模式 (一次性任务)
执行单个指令后立即退出。
```bash
autoclaw "检查磁盘使用情况并将报告保存到 usage.txt" --no-interactive
```
退出码向编排器报告结果：`0` 完成，`1` 硬性失败（如 API 错误），`2` 触发步数上限（任务未完成）。

### 机器可读输出 (--json)
加 `--json` 后，stdout 每行输出一个 JSON 事件（run_start、tool_call、tool_result、usage、run_end）；人类可读输出（包括工具自己打印的内容）全部转到 stderr。
```bash
autoclaw "执行部署并汇报" -y -n --json
```
Token 用量仅在设置 `AUTOCLOW_INCLUDE_USAGE=1`（或 `true`）时才收集——这是可选项，因为并非所有 OpenAI 兼容端点都接受 `stream_options.include_usage`。

### 批处理模式 (蜂群工人)
把 JSONL 任务清单交给 AutoClaw；每个任务在全新的隔离 Agent 中执行（任务之间上下文互不污染），结果逐行写入 JSONL 文件：
```bash
autoclaw batch tasks.jsonl -y                          # 结果 -> tasks.results.jsonl
autoclaw batch tasks.jsonl -o out.jsonl --fail-fast
```
清单每行为 `{"id": "...", "task": "..."}`——`id` 可省略（默认 `task-N`）；空行和 `#` 注释行会跳过。可选的每任务覆盖项：`maxSteps`、`model`、`provider`。

单个任务失败不会中断批次（需要中断用 `--fail-fast`）。全部完成时进程退出 `0`，否则 `1`，cron 和 K8s Job 由此感知批次成败。任务输出保持人类可读——结果文件才是机器可读契约，含每个任务的 `status`、`steps`、`message`、`error`、`usage`。

长批次可以中途停、从断点继续，也可以本地并行：
```bash
autoclaw batch big.jsonl -y --resume        # 跳过结果文件中已完成的任务
autoclaw batch big.jsonl -y -c 4            # 最多 4 个任务并行
```
未执行的任务不会出现在结果文件里，所以 `--fail-fast` 之后接 `--resume` 就是天然的重试循环。

AutoClaw 同时会自动给提示词瘦身：可选工具（网页搜索、邮件、群通知、图像生成）只在凭据配置后才会注册进工具定义；长循环中较早的工具结果会被替换为短摘要。

### 自动确认 (CI/CD)
自动批准所有工具执行（危险操作，请谨慎使用或在沙箱环境下运行）。
```bash
autoclaw "将 src/index.ts 重构为使用 ES 模块" -y
```

### CLI 选项
- `-m, --model <model>`: 指定 LLM 模型 (默认: `gpt-5.6`)。
- `-P, --provider <name>`: 使用 provider 预设 (见 [Provider 预设](#provider-预设))。
- `-n, --no-interactive`: 处理完初始查询后退出 (无头模式)。
- `-y, --yes`: 自动确认所有工具执行 (例如 Shell 命令)。
- `--json`: 在 stdout 输出 NDJSON 事件流 (供编排器使用,配合 `-n`)。

### Provider 预设
AutoClaw 可对接任意 OpenAI 兼容端点。内置预设可自动填好 Base URL 和默认模型：
```bash
autoclaw -P deepseek "检查磁盘使用情况并保存报告" -y -n
```
可用预设：`openai`、`deepseek`、`moonshot` (Kimi)、`dashscope` (Qwen)、`zhipu` (GLM)、`openrouter`、`ollama` (本地)。模型仍可用 `-m` 或配置覆盖。未设置 `OPENAI_API_KEY` 时，会自动读取各家自己的环境变量 (如 `DEEPSEEK_API_KEY`、`MOONSHOT_API_KEY`、`DASHSCOPE_API_KEY`、`ZHIPU_API_KEY`、`OPENROUTER_API_KEY`)。

## 配置

AutoClaw 使用层级配置系统。

**优先级排序 (从高到低):**
1.  **CLI 参数**: (例如 `-m gpt-5.6`)
2.  **环境变量**: (`OPENAI_API_KEY`, `.env` 文件)
3.  **项目配置**: (当前目录下的 `./.autoclaw/setting.json`)
4.  **全局配置**: (`~/.autoclaw/setting.json`)

### 支持的配置键 (JSON)
- `provider`: Provider 预设名 (如 `deepseek`)。
- `apiKey`: 您的 OpenAI API 密钥。
- `baseUrl`: 自定义 API 基础地址 (例如 DeepSeek 或本地 LLM)。
- `model`: 默认使用的模型。
- `maxSteps`: 单任务最大 LLM 轮数，超出后自动停止 (默认: `25`)。
- `shellTimeout`: Shell 命令超时时间（毫秒）(默认: `120000`)。
- `shell`: 强制 `execute_shell_command` 使用的 shell (`bash`、`powershell`、`cmd`、`sh`；默认自动检测——Windows 上优先 Git Bash > PowerShell > cmd)。
- `tavilyApiKey`: Tavily 网页搜索的 API 密钥。
- `smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`, `smtpFrom`: SMTP 邮件设置。
- `feishuWebhook`, `dingtalkWebhook`, `wecomWebhook`: 通知钩子地址。

### 项目级配置示例
在 `.autoclaw/setting.json` 创建文件：
```json
{
  "model": "gpt-5.6",
  "baseUrl": "https://api.deepseek.com/v1"
}
```

> **⚠️ 安全警告**: 如果您在 `.autoclaw/setting.json` 中存储了 `apiKey` 或机密信息，请务必将 `.autoclaw/` 添加到您的 `.gitignore` 文件中，以防泄露！

### 环境变量
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`: 主模型设置。
- `AUTOCLOW_PROVIDER`: 未传 `-P` 时使用的 provider 预设。
- `AUTOCLOW_MAX_STEPS`, `AUTOCLOW_SHELL_TIMEOUT`: 稳定性限制（单任务最大轮数；Shell 超时毫秒数）。
- `AUTOCLOW_SHELL`: 强制 shell 命令使用的 shell (`bash`、`powershell`、`cmd`、`sh`)。
- `AUTOCLOW_INCLUDE_USAGE`: 设为 `1`/`true` 时向 API 请求 token 用量（可选开启）。
- `TAVILY_API_KEY`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`, `FEISHU_WEBHOOK`/`FEISHU_KEYWORD`, `DINGTALK_WEBHOOK`/`DINGTALK_KEYWORD`, `WECOM_WEBHOOK`/`WECOM_KEYWORD`: 工具凭据，可作为 setup 的替代方式。

## 集成功能

### 网页搜索 (Tavily)
如果您在设置中提供了 Tavily API 密钥，AutoClaw 可以搜索网页。
- **示例**: "搜索最新的 Node.js 发布说明。"

### 邮件 (SMTP)
配置 SMTP 设置以允许 Agent 发送邮件。
- **示例**: "向 user@example.com 发送一封包含日志文件摘要的邮件。"

### 通知 (飞书/钉钉/企业微信)
配置 Webhook 以在团队聊天应用中接收警报或报告。
- **示例**: "在飞书上通知团队构建已完成。"

### 日期与时间
内置工具为 Agent 提供当前系统时间，确保准确处理相对时间请求。
- **示例**: "今天是几号？" 或 "提醒我下周一检查日志。"

## Docker 支持

### 构建与运行
仓库自带多阶段构建的 `Dockerfile`（node:22-alpine，跳过浏览器下载保持镜像苗条）。容器内直接运行无头一次性任务，配合目录挂载操作当前目录：
```bash
docker build -t autoclaw .
docker run --rm -v "$PWD":/workspace -w /workspace -e OPENAI_API_KEY=sk-... autoclaw "检查磁盘使用情况并保存报告" -y -n
```
注意：默认镜像中未内置浏览器，基于浏览器的工具（`read_website` / `take_screenshot`）不可用——它们会返回友好的安装提示，而不是报错崩溃。

### 截图中的中文显示问题
在 Docker 容器（尤其是 Alpine 或 Debian Slim）中运行时，网页截图中的中文可能会显示为方块（"豆腐块"）。表情符号（如 🔥）也可能显示为方块。

**解决方案:** 在容器中安装 CJK（中日韩）和 Emoji 字体。

**Debian/Ubuntu:**
```bash
apt-get update && apt-get install -y fonts-noto-cjk fonts-wqy-zenhei fonts-noto-color-emoji
```

**Alpine Linux:**
```bash
apk add font-noto-cjk font-noto-emoji
```

## 开源协议

MIT

## 贡献指南

欢迎贡献！请随时提交 Pull Request。

1.  Fork 本项目
2.  创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3.  提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4.  推送至分支 (`git push origin feature/AmazingFeature`)
5.  开启一个 Pull Request

---
GitHub: [https://github.com/tsingliuwin/autoclaw](https://github.com/tsingliuwin/autoclaw)