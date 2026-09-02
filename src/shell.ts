import { spawn, execSync } from 'child_process';
import * as fs from 'fs';

// child_process.exec picks cmd.exe on Windows, whose dialect burns agent
// turns (; vs &&, no $(), GBK output). We resolve a concrete shell once and
// drive it via spawn with explicit argv, decoding output intelligently.

export type ShellType = 'bash' | 'powershell' | 'cmd' | 'sh';

const GIT_BASH_CANDIDATES = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
];

let cachedType: ShellType | null = null;
let cachedBashPath: string | null | undefined;

function findBashPath(): string | null {
  if (process.platform === 'win32') {
    for (const candidate of GIT_BASH_CANDIDATES) {
      if (fs.existsSync(candidate)) return candidate;
    }
    try {
      // 'where' may report WSL's System32\bash.exe, which has a different
      // filesystem view — exclude it.
      const out = execSync('where bash.exe', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      const hit = out.split(/\r?\n/).map(l => l.trim()).find(l => l && !/System32/i.test(l));
      return hit ?? null;
    } catch {
      return null;
    }
  }
  return fs.existsSync('/bin/bash') ? '/bin/bash' : null;
}

export function getBashPath(): string | null {
  if (cachedBashPath === undefined) cachedBashPath = findBashPath();
  return cachedBashPath;
}

export function resolveShellType(config?: any): ShellType {
  const requested = String(config?.shell || process.env.AUTOCLOW_SHELL || 'auto').toLowerCase();
  if (requested === 'bash' || requested === 'powershell' || requested === 'cmd' || requested === 'sh') {
    if (requested !== 'bash' || getBashPath()) return requested;
  }
  if (!cachedType) {
    cachedType = process.platform === 'win32' ? (getBashPath() ? 'bash' : 'powershell') : 'sh';
  }
  return cachedType;
}

// Windows tools emit GBK on CN-locale systems while Unix tools emit UTF-8;
// strict UTF-8 decode with GBK fallback covers both.
export function smartDecode(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder('gbk').decode(buf);
    } catch {
      return buf.toString('utf8');
    }
  }
}

export interface ShellExecResult {
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}

export function shellInvocation(command: string): { file: string; args: string[] } {
  const type = resolveShellType();
  if (type === 'bash') {
    // -l sources the profile so Git Bash's /usr/bin lands on PATH and Unix
    // tools (ls, grep, ...) actually resolve.
    return { file: getBashPath()!, args: ['-l', '-c', command] };
  }
  if (type === 'powershell') {
    return { file: 'powershell.exe', args: ['-NoProfile', '-Command', command] };
  }
  if (type === 'cmd') {
    return { file: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', command] };
  }
  return { file: '/bin/sh', args: ['-c', command] };
}

export function killProcessTree(pid: number): void {
  if (process.platform !== 'win32') {
    // The negative pid targets the detached process group.
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }
    return;
  }
  spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
}

export function execShellCommand(command: string, opts: { timeoutMs: number; maxBuffer: number }): Promise<ShellExecResult> {
  const type = resolveShellType();
  const { file, args } = shellInvocation(command);

  return new Promise(resolve => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let total = 0;
    let timedOut = false;
    let truncated = false;
    let settled = false;
    const posix = process.platform !== 'win32';
    const child = spawn(file, args, { windowsHide: true, detached: posix });

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: smartDecode(Buffer.concat(stdout)),
        stderr: smartDecode(Buffer.concat(stderr)),
        timedOut,
        truncated
      });
    };
    const killTree = () => {
      if (child.pid) killProcessTree(child.pid);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, Math.max(1, opts.timeoutMs));
    const collect = (buf: Buffer[], chunk: Buffer) => {
      if (total >= opts.maxBuffer) return;
      total += chunk.length;
      if (total > opts.maxBuffer) {
        buf.push(chunk.subarray(0, chunk.length - (total - opts.maxBuffer)));
        truncated = true;
        killTree();
      } else {
        buf.push(chunk);
      }
    };
    child.stdout.on('data', c => collect(stdout, c));
    child.stderr.on('data', c => collect(stderr, c));
    child.on('error', err => {
      stderr.push(Buffer.from(`\n[shell] failed to start ${type}: ${err.message}`));
      finish();
    });
    child.on('exit', () => {
      // The direct child is gone. Killed shells leave grandchildren holding
      // stdio pipes, so don't wait for 'close' after a kill — return what we
      // collected. On natural exit give the streams a short grace period
      // before 'close' confirms the full flush.
      if (timedOut || truncated) {
        finish();
      } else {
        const grace = setTimeout(finish, 1000);
        if (typeof grace.unref === 'function') grace.unref();
      }
    });
    child.on('close', finish);
  });
}

export function buildShellInfo(type: ShellType): string {
  switch (type) {
    case 'bash':
      return 'Bash (POSIX). Standard Unix tools, pipes and $() substitution work.';
    case 'powershell':
      return 'Windows PowerShell. Use PowerShell syntax: $() works, but && does not on Windows PowerShell 5 — use ; or separate calls. Prefer cmdlets like Get-ChildItem.';
    case 'cmd':
      return 'cmd.exe (Windows). Chain commands with && only, there is no $() command substitution, mkdir has no -p flag, and native tool output may be GBK-garbled. For system queries prefer: powershell -Command "..."';
    default:
      return 'POSIX shell (sh). Standard Unix tools apply.';
  }
}
