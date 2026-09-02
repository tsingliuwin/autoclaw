import { describe, expect, it } from 'vitest';
import { resolveSandboxMode, sandboxBackend, sandboxedInvocation } from './sandbox.js';
import { shellInvocation } from './shell.js';

describe('resolveSandboxMode', () => {
  it('defaults to danger-full-access', () => {
    expect(resolveSandboxMode({})).toBe('danger-full-access');
    expect(resolveSandboxMode({ sandbox: 'weird' })).toBe('danger-full-access');
  });

  it('honors config and env overrides', () => {
    expect(resolveSandboxMode({ sandbox: 'read-only' })).toBe('read-only');
    expect(resolveSandboxMode({ sandbox: 'WORKSPACE-WRITE' })).toBe('workspace-write');
    const previous = process.env.AUTOCLOW_SANDBOX;
    process.env.AUTOCLOW_SANDBOX = 'read-only';
    try {
      expect(resolveSandboxMode({})).toBe('read-only');
    } finally {
      if (previous === undefined) delete process.env.AUTOCLOW_SANDBOX;
      else process.env.AUTOCLOW_SANDBOX = previous;
    }
  });
});

describe('sandboxBackend', () => {
  it('reports no backend on win32', () => {
    const b = sandboxBackend('win32');
    expect(b.backend).toBe('none');
    expect(b.available).toBe(false);
    expect(b.detail).toContain('danger-full-access');
  });

  it('uses bwrap on linux', () => {
    const b = sandboxBackend('linux');
    expect(b.backend).toBe('bwrap');
    expect(typeof b.available).toBe('boolean');
  });

  it('uses sandbox-exec on darwin', () => {
    const b = sandboxBackend('darwin');
    expect(b.backend).toBe('sandbox-exec');
  });
});

describe('sandboxedInvocation', () => {
  it('passes the command through unchanged under danger-full-access', () => {
    const base = shellInvocation('echo hi');
    const inv = sandboxedInvocation('echo hi', 'danger-full-access', '/ws', 'linux');
    expect(inv).toEqual(base);
  });

  it('wraps read-only with a read-only bubblewrap mount', () => {
    const inv = sandboxedInvocation('echo hi', 'read-only', '/ws', 'linux') as { file: string; args: string[] };
    expect(inv.file).toBe('bwrap');
    expect(inv.args).toContain('--ro-bind');
    expect(inv.args).not.toContain('--bind');
  });

  it('workspace-write binds the workspace writable and /tmp as tmpfs', () => {
    const inv = sandboxedInvocation('echo hi', 'workspace-write', '/ws', 'linux') as { file: string; args: string[] };
    expect(inv.file).toBe('bwrap');
    const bindIdx = inv.args.indexOf('--bind');
    expect(inv.args[bindIdx + 1]).toBe('/ws');
    expect(inv.args).toContain('--tmpfs');
  });

  it('wraps macOS modes with sandbox-exec profiles', () => {
    const ro = sandboxedInvocation('echo hi', 'read-only', '/ws', 'darwin') as { file: string; args: string[] };
    expect(ro.file).toBe('/usr/bin/sandbox-exec');
    expect(ro.args[1]).toContain('(deny file-write*)');

    const ws = sandboxedInvocation('echo hi', 'workspace-write', '/ws', 'darwin') as { file: string; args: string[] };
    expect(ws.args[1]).toContain('/ws');
  });

  it('fails closed on platforms without a backend', () => {
    const inv = sandboxedInvocation('echo hi', 'workspace-write', '/ws', 'win32');
    expect('blocked' in inv).toBe(true);
    if ('blocked' in inv) expect(inv.detail).toContain('no sandbox backend');
  });
});

describe('ShellTool sandbox integration (win32 host)', () => {
  const isWin = process.platform === 'win32';

  it('refuses non-default sandbox modes when no backend exists', { skip: !isWin }, async () => {
    const { ShellTool } = await import('./tools/core.js');
    const result = await ShellTool.handler(
      { command: 'node -e "console.log(1)"', rationale: 'test' },
      { autoConfirm: true, sandbox: 'workspace-write' }
    );
    expect(result).toContain('no sandbox backend is available');
  });

  it('still executes normally under danger-full-access', async () => {
    const { ShellTool } = await import('./tools/core.js');
    const result = await ShellTool.handler(
      { command: 'node -e "console.log(\'ok sandbox off\')"', rationale: 'test' },
      { autoConfirm: true }
    );
    expect(result).toContain('ok sandbox off');
  });
});
