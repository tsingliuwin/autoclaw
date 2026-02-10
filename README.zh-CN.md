# AutoClaw 🦞

**稳定、高工程化、易规模化：专为无界面系统设计的高效自动化 Agent 框架。**

[English](./README.md) | 简体中文

AutoClaw 是一款针对 **“无界面系统” (Headless Systems)** 的高稳定性自动化 Agent 开源框架。

相比于 OpenClaw 等需要“看屏幕”的 Agent，AutoClaw 采用纯指令驱动，具有更强的**工程化**属性、更高的**稳定性**，以及极易**规模化**的特点。它专为在服务器集群、CI/CD 环境或大规模容器化部署中执行确定性的自动化任务而设计。

## 为什么选择 AutoClaw?

- 🐳 **Docker Native**: 专为容器而生，无 GUI 依赖，极致轻量（Node.js/Alpine 友好）。
- 🚀 **更强工程化 (Better Engineering)**: 并非依赖不稳定的视觉识别，而是通过系统 API 和 Shell 指令精准操作，确保任务执行的确定性。
- 🛡️ **高稳定性 (Superior Stability)**: 摆脱了图形界面渲染、屏幕分辨率、网络延迟对视觉识别的影响，即便在极端的 Headless 环境下也能稳定运行。
- 📈 **易于规模化 (Massive Scalability)**: 低资源占用使得你可以同时编排成千上万个 Agent 实例（如在 Kubernetes 集群中），实现真正的自动化蜂群。
- 🔌 **Swarm Ready**: 无状态设计，支持通过 K8s、Docker Swarm 或简单的 Shell 脚本进行大规模调度。

## 特性

- 📜 **无头执行 (Headless Execution)**: 真正的无头模式，无需浏览器或图形化界面。
- 🤖 **非交互式 (Non-Interactive)**: 支持自动化标志（`-y`），完美适配零干预的自动化流程。
- 📂 **全方位控制 (Universal Control)**: 从基础的文件 I/O 到复杂的系统管理与代码重构。
- 🧠 **上下文感知 (Context Aware)**: 自动识别操作系统与容器环境，动态优化执行策略。

## 安装

```bash
npm install -g autoclaw
```

## 更新

更新 AutoClaw 到最新版本：

```bash
npm update -g autoclaw
```

## 快速上手

1.  **配置**: 运行设置向导以配置您的 API 密钥。
    ```bash
    autoclaw setup
    ```
2.  **运行**: 启动 Agent。
    ```bash
    autoclaw
    ```

## 使用示例

- "列出 src 文件夹中所有的 TypeScript 文件。"
- "在 `components/Button.tsx` 中创建一个名为 Button 的新 React 组件。"
- "检查我的磁盘使用情况，并告诉我哪个文件夹最大。"

## 配置

AutoClaw 使用层级配置系统。

**优先级排序 (从高到低):**
1.  **CLI 参数**: (例如 `-m gpt-4o`)
2.  **环境变量**: (`OPENAI_API_KEY`, `.env` 文件)
3.  **项目配置**: (当前目录下的 `./.autoclaw/setting.json`)
4.  **全局配置**: (`~/.autoclaw/setting.json`)

### 支持的配置键 (JSON)
- `apiKey`: 您的 API 密钥。
- `baseUrl`: 自定义 API 基础地址。
- `model`: 默认使用的模型。

### 项目级配置示例
在 `.autoclaw/setting.json` 创建文件：
```json
{
  "model": "gpt-3.5-turbo",
  "baseUrl": "https://api.example.com/v1"
}
```

> **⚠️ 安全警告**: 如果您在 `.autoclaw/setting.json` 中存储了 `apiKey`，请务必将 `.autoclaw/` 添加到您的 `.gitignore` 文件中，以防泄露机密！

## 开源协议

MIT
