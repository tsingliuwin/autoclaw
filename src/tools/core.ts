import * as fs from 'fs/promises';
import * as path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { ToolModule } from './interface.js';
import { execShellCommand } from '../shell.js';

const DEFAULT_SHELL_TIMEOUT_MS = 120000;
const SHELL_MAX_BUFFER = 10 * 1024 * 1024;
// Bounded reads keep a huge file from exhausting memory or the model context;
// the agent-level truncation in truncate.ts applies on top of this.
const READ_FILE_MAX_BYTES = 1024 * 1024;

// Even with -y, an unattended agent must not execute clearly destructive
// commands — a poisoned tool result (e.g. prompt injection via a web page)
// would otherwise reach the shell directly. Matched commands are refused
// with a message the model can act on; --allow-dangerous overrides.
export const DANGEROUS_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\brm\s+(?:-\w+\s+)*-\w*[rR]\w*[fF]\b/, label: 'rm with recursive+force' },
  { re: /\b(?:rd|rmdir|del|erase)\s+\/[sS]\b/, label: 'Windows recursive delete (rd/del /s)' },
  { re: /\bRemove-Item\b[^;\n]*-(?:Recurse[^;\n]*Force|Force[^;\n]*Recurse)/i, label: 'PowerShell Remove-Item -Recurse -Force' },
  { re: /\b(?:format|diskpart)\b/i, label: 'disk format / diskpart' },
  { re: /\bmkfs(?:\.\w+)?\b/i, label: 'mkfs' },
  { re: /\bdd\b[^|]*\bof=/i, label: 'dd raw write' },
  { re: /(?:>>?|tee)\s*\/dev\/(?:sd|nvme|hd|vd)[a-z]/i, label: 'write to block device' },
  { re: /\b(?:shutdown|reboot|halt|poweroff)\b/i, label: 'host power control' },
  { re: /\breg\s+delete\b/i, label: 'registry delete' }
];

export function matchDangerousPattern(command: string): string | null {
  const hit = DANGEROUS_PATTERNS.find(p => p.re.test(command));
  return hit ? hit.label : null;
}

export const ShellTool: ToolModule = {
  name: "Shell Execution",
  definition: {
    type: "function",
    function: {
      name: "execute_shell_command",
      description: "Execute a shell command on the host machine. Use this to run scripts, list files, or interact with the system.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to execute." },
          rationale: { type: "string", description: "Explain why you are running this command." }
        },
        required: ["command", "rationale"]
      }
    }
  },
  handler: async (args: any, config: any) => {
    console.log(chalk.yellow(`\nAI wants to execute: `) + chalk.bold(args.command));
    console.log(chalk.dim(`Reason: ${args.rationale}`));

    // Safety gate runs first: blocked commands are refused even with --yes.
    if (!config?.allowDangerous) {
      const label = matchDangerousPattern(args.command);
      if (label) {
        console.log(chalk.red(`\n[blocked] ${label}`));
        return `Error: command blocked by AutoClaw safety policy (matched: ${label}). It was NOT executed. If this task genuinely requires it, the user must restart AutoClaw with --allow-dangerous; otherwise find a safer way to achieve the same goal.`;
      }
    }

    const timeoutMs = Number(config?.shellTimeout || process.env.AUTOCLOW_SHELL_TIMEOUT || DEFAULT_SHELL_TIMEOUT_MS);

    // Check for auto-confirm flag
    if (!config?.autoConfirm) {
      if (!process.stdin.isTTY) {
        // No human can answer the confirmation prompt in this environment;
        // denying beats hanging on a dead prompt or auto-running unasked.
        return "Denied: this shell command requires user confirmation, but no interactive terminal is attached. Re-run with --yes (or -y) to allow unattended execution.";
      }
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Do you want to run this command?',
          default: false
        }
      ]);

      if (!confirm) return "User denied command execution.";
    } else {
      console.log(chalk.gray("(Auto-confirming command execution due to --yes flag)"));
    }

    try {
      const r = await execShellCommand(args.command, { timeoutMs, maxBuffer: SHELL_MAX_BUFFER });
      if (r.timedOut) {
        return `Command timed out after ${timeoutMs}ms and was terminated.\nStdout: ${r.stdout}\nStderr: ${r.stderr}`;
      }
      return (
        r.stdout +
        (r.truncated ? '\n[AutoClaw] Output truncated at the buffer limit.' : '') +
        (r.stderr ? `\nStderr: ${r.stderr}` : '')
      );
    } catch (error: any) {
      return `Command failed: ${error.message}\nStdout: ${error.stdout}\nStderr: ${error.stderr}`;
    }
  }
};

export const ReadFileTool: ToolModule = {
  name: "File Reader",
  definition: {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the content of a file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The path to the file to read." }
        },
        required: ["path"]
      }
    }
  },
  handler: async (args: any) => {
    let fh;
    try {
      fh = await fs.open(args.path, 'r');
      const buf = Buffer.alloc(READ_FILE_MAX_BYTES);
      const { bytesRead } = await fh.read(buf, 0, READ_FILE_MAX_BYTES, 0);
      const slice = buf.subarray(0, bytesRead);
      // NUL bytes are the reliable tell for binary content; returning them
      // as "utf-8" would only hand the model mojibake.
      if (slice.includes(0)) {
        return `Error: ${args.path} looks like a binary file (${bytesRead} bytes read). Inspect it with execute_shell_command instead (e.g. strings, xxd, file).`;
      }
      const content = slice.toString('utf-8');
      if (bytesRead === READ_FILE_MAX_BYTES) {
        const { size } = await fh.stat();
        return `${content}\n[AutoClaw] File truncated at ${READ_FILE_MAX_BYTES} bytes (file is ${size} bytes). Use execute_shell_command to read specific ranges.`;
      }
      return content;
    } catch (error: any) {
      return `Error reading file: ${error.message}`;
    } finally {
      await fh?.close();
    }
  }
};

export const WriteFileTool: ToolModule = {
  name: "File Writer",
  definition: {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file. Overwrites existing files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The path to the file to write." },
          content: { type: "string", description: "The content to write." }
        },
        required: ["path", "content"]
      }
    }
  },
  handler: async (args: any) => {
    try {
      await fs.mkdir(path.dirname(args.path), { recursive: true });
      await fs.writeFile(args.path, args.content, 'utf-8');
      return `Successfully wrote to ${args.path}`;
    } catch (error: any) {
      return `Error writing file: ${error.message}`;
    }
  }
};

export const DateTimeTool: ToolModule = {
  name: "Date & Time",
  definition: {
    type: "function",
    function: {
      name: "get_current_datetime",
      description: "Get the current system date and time. Use this when the user refers to relative dates (like 'today', 'next week', 'this March') to ensure accuracy.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  handler: async () => {
    const now = new Date();
    return JSON.stringify({
      iso: now.toISOString(),
      local: now.toLocaleString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      weekday: now.toLocaleDateString('en-US', { weekday: 'long' })
    }, null, 2);
  }
};
