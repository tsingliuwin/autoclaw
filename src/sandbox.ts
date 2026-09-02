import * as fs from 'fs';
import * as path from 'path';
import { shellInvocation } from './shell.js';

// Sandbox policy for command execution, with a vocabulary borrowed from
// DeepSeek Harness: read-only | workspace-write | danger-full-access.
// Backends: bubblewrap on Linux, sandbox-exec on macOS. Windows has no
// backend yet — non-default modes fail CLOSED there instead of pretending.

export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export function resolveSandboxMode(config?: any): SandboxMode {
  const requested = String(config?.sandbox || process.env.AUTOCLOW_SANDBOX || 'danger-full-access').toLowerCase();
  if (requested === 'read-only' || requested === 'workspace-write' || requested === 'danger-full-access') {
    return requested;
  }
  return 'danger-full-access';
}

export interface SandboxBackend {
  backend: 'bwrap' | 'sandbox-exec' | 'none';
  available: boolean;
  detail: string;
}

export function sandboxBackend(platform: string = process.platform): SandboxBackend {
  if (platform === 'linux') {
    const available = hasExecutable('bwrap');
    return {
      backend: 'bwrap',
      available,
      detail: available
        ? 'bubblewrap found'
        : 'bubblewrap (bwrap) not found — install it (e.g. apt install bubblewrap) or set sandbox to danger-full-access'
    };
  }
  if (platform === 'darwin') {
    const available = fs.existsSync('/usr/bin/sandbox-exec');
    return {
      backend: 'sandbox-exec',
      available,
      detail: available ? 'sandbox-exec found' : 'sandbox-exec missing (unexpected on macOS)'
    };
  }
  return {
    backend: 'none',
    available: false,
    detail: 'no sandbox backend on this platform yet (Windows restricted-token rung is planned). Set sandbox to danger-full-access to run unrestricted.'
  };
}

function hasExecutable(name: string): boolean {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    try {
      if (fs.existsSync(path.join(dir, name))) return true;
    } catch {
      // skip unreadable PATH entries
    }
  }
  return false;
}

export interface SandboxInvocation {
  file: string;
  args: string[];
}

export interface SandboxBlocked {
  blocked: true;
  detail: string;
}

// Pure shape builder: wraps the platform shell invocation so the command can
// only write where the mode allows. danger-full-access returns the command
// unchanged; read-only/workspace-write require the platform backend, which
// the caller checks with sandboxBackend() first (fail-closed otherwise).
export function sandboxedInvocation(
  command: string,
  mode: SandboxMode,
  workspace: string,
  platform: string = process.platform
): SandboxInvocation | SandboxBlocked {
  const base = shellInvocation(command);
  if (mode === 'danger-full-access') return base;

  if (platform === 'linux') {
    if (mode === 'read-only') {
      return {
        file: 'bwrap',
        args: ['--ro-bind', '/', '/', '--dev-bind', '/dev', '/dev', '--proc', '/proc', '--', base.file, ...base.args]
      };
    }
    return {
      file: 'bwrap',
      args: [
        '--ro-bind', '/', '/',
        '--bind', workspace, workspace,
        '--dev-bind', '/dev', '/dev',
        '--proc', '/proc',
        '--tmpfs', '/tmp',
        '--', base.file, ...base.args
      ]
    };
  }

  if (platform === 'darwin') {
    const ws = workspace.replace(/"/g, '\\"');
    if (mode === 'read-only') {
      return {
        file: '/usr/bin/sandbox-exec',
        args: ['-p', '(version 1)(allow default)(deny file-write*)', base.file, ...base.args]
      };
    }
    return {
      file: '/usr/bin/sandbox-exec',
      args: [
        '-p',
        `(version 1)(allow default)(deny file-write*)(allow file-write* (subpath "${ws}") (subpath "/private/tmp") (regex #"^/private/var/folders/"))`,
        base.file,
        ...base.args
      ]
    };
  }

  return { blocked: true, detail: sandboxBackend(platform).detail };
}
