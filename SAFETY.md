# Safety

English | [简体中文](SAFETY.zh-CN.md)

## What AutoClaw can do

AutoClaw executes model-generated shell commands, reads and writes files, and can reach the network, send email, and push notifications to group chats. It is designed to run unattended (`-y -n`), which means **no human reviews individual commands before they run**.

## Status

AutoClaw has not undergone a security audit. Incorrect model output, defects, misconfiguration, or malicious input (including prompt injection carried in web pages, repository files, or tool results) may damage the host, modify or delete files, or disclose data or credentials.

## Built-in mitigations — and their limits

| Mitigation | What it does | What it does NOT do |
| --- | --- | --- |
| Destructive-command gate | Refuses clearly destructive patterns (`rm -rf`, `format`, `shutdown`, ...) even with `-y` | Not a complete blocklist; novel destructive commands can pass |
| Sensitive-path guard | `read_file`/`write_file` refuse AutoClaw's own credential stores and `.env*` files | `execute_shell_command` can still read those paths — the gate raises the bar, it is not a hard boundary |
| Step cap / wall-clock timeout | Bounds how long and how far a run can go | Does not judge what happens within the budget |
| Tool-result trimming | Keeps long outputs from flooding the model context | Does not sanitize content |
| Run log | Records what happened for post-hoc debugging | Records locally; it is not an audit service |
| Sandbox modes | bubblewrap / sandbox-exec confine command writes to the workspace (Linux/macOS) | No Windows backend yet (non-default modes fail closed); no read or network confinement |

`--allow-dangerous` disables the destructive-command gate. Treat any run with it as fully trusted only if you also trust the task and everything the task can read.

## Responsible use

- Run AutoClaw with the least privileges and file access the task requires; prefer a disposable container or VM for untrusted workloads.
- Keep backups of anything AutoClaw can write.
- Do not put more credentials into `~/.autoclaw/setting.json` than the tasks need (each integration is optional).
- Review `~/.autoclaw/logs/runs.jsonl` after unattended runs.
- `autoclaw doctor` reports the effective configuration before you start.

## No warranty

AutoClaw is provided under the MIT License, without warranty of any kind. You are responsible for how you use it.
