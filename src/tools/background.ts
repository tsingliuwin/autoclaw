import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ToolModule } from './interface.js';
import { killProcessTree, shellInvocation } from '../shell.js';
import { matchDangerousPattern } from './core.js';

// Long-lived processes for unattended work: start a server or a long build
// without blocking the agent's turn, poll its output, stop it when done.
// Handles live in the current AutoClaw process; log files persist on disk.

interface BgProcess {
  id: string;
  pid: number | undefined;
  command: string;
  logPath: string;
  startedAt: number;
  exited: boolean;
  exitCode: number | null;
}

const handles = new Map<string, BgProcess>();
const MAX_TRACKED = 20;

function newHandleId(): string {
  return `bg-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function tailOf(logPath: string, bytes = 4000): string {
  try {
    if (!fs.existsSync(logPath)) return '(no output yet)';
    const stat = fs.statSync(logPath);
    const start = Math.max(0, stat.size - bytes);
    const fd = fs.openSync(logPath, 'r');
    try {
      const buf = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      return (start > 0 ? '…(earlier output omitted)\n' : '') + buf.toString('utf-8');
    } finally {
      fs.closeSync(fd);
    }
  } catch (err: any) {
    return `(could not read log: ${err.message})`;
  }
}

export const StartBackgroundProcessTool: ToolModule = {
  name: "Background Process Starter",
  definition: {
    type: "function",
    function: {
      name: "start_background_process",
      description: "Start a long-lived command in the background without blocking: dev servers, watchers, long builds. Output is written to a log file you can read later.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The command to run in the background." },
          rationale: { type: "string", description: "Explain why this command should run in the background." }
        },
        required: ["command", "rationale"]
      }
    }
  },
  handler: async (args: any) => {
    const command = String(args.command ?? '').trim();
    if (!command) return 'Error: "command" is required.';

    // Same safety gate as the foreground shell tool.
    const gateLabel = matchDangerousPattern(command);
    if (gateLabel) {
      return `Error: command blocked by AutoClaw safety policy (matched: ${gateLabel}). It was NOT started. If this task genuinely requires it, restart AutoClaw with --allow-dangerous.`;
    }

    for (const [id, h] of handles) {
      if (h.exited && Date.now() - h.startedAt > 3600_000) handles.delete(id);
    }
    if (handles.size >= MAX_TRACKED) {
      return `Error: too many tracked background processes (${MAX_TRACKED}). Stop finished ones first or wait for them to exit.`;
    }

    const id = newHandleId();
    const logDir = path.join(os.homedir(), '.autoclaw', 'output');
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, `bg-${id}.log`);
    const { file, args: spawnArgs } = shellInvocation(command);
    const out = fs.openSync(logPath, 'a');
    let child;
    try {
      child = spawn(file, spawnArgs, {
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', out, out]
      });
    } catch (err: any) {
      fs.closeSync(out);
      return `Error: failed to start background process: ${err.message}`;
    }
    fs.closeSync(out);

    const entry: BgProcess = { id, pid: child.pid, command, logPath, startedAt: Date.now(), exited: false, exitCode: null };
    handles.set(id, entry);
    child.on('exit', code => { entry.exited = true; entry.exitCode = code ?? null; });
    child.unref();

    return `Background process started.\n- handle id: ${id}\n- pid: ${child.pid}\n- log: ${logPath}\nUse check_background_process with this id to read output, or stop_background_process to terminate it.`;
  }
};

export const CheckBackgroundProcessTool: ToolModule = {
  name: "Background Process Checker",
  definition: {
    type: "function",
    function: {
      name: "check_background_process",
      description: "Check a background process started with start_background_process: running/exited status and the tail of its output log.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The handle id returned by start_background_process." }
        },
        required: ["id"]
      }
    }
  },
  handler: async (args: any) => {
    const id = String(args.id ?? '');
    const entry = handles.get(id);
    if (!entry) {
      return `Error: unknown background process id "${id}". Handles live for the current AutoClaw process only; the log file may still exist under ~/.autoclaw/output/.`;
    }
    const status = entry.exited
      ? `exited (code: ${entry.exitCode ?? 'unknown'})`
      : `running (pid: ${entry.pid}, ${Math.round((Date.now() - entry.startedAt) / 1000)}s elapsed)`;
    return `Background process ${id}: ${status}\nCommand: ${entry.command}\nLog tail:\n${tailOf(entry.logPath)}`;
  }
};

export const StopBackgroundProcessTool: ToolModule = {
  name: "Background Process Stopper",
  definition: {
    type: "function",
    function: {
      name: "stop_background_process",
      description: "Terminate a background process started with start_background_process (kills the whole process tree).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The handle id returned by start_background_process." }
        },
        required: ["id"]
      }
    }
  },
  handler: async (args: any) => {
    const id = String(args.id ?? '');
    const entry = handles.get(id);
    if (!entry) {
      return `Error: unknown background process id "${id}".`;
    }
    if (entry.exited) {
      return `Background process ${id} already exited (code: ${entry.exitCode ?? 'unknown'}). Log: ${entry.logPath}`;
    }
    if (entry.pid) killProcessTree(entry.pid);
    entry.exited = true;
    return `Background process ${id} terminated.\nLog: ${entry.logPath}\nLog tail:\n${tailOf(entry.logPath)}`;
  }
};
