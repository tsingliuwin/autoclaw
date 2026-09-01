import { describe, expect, it } from 'vitest';
import { buildShellInfo, execShellCommand, resolveShellType, smartDecode } from './shell.js';

describe('smartDecode', () => {
  it('decodes UTF-8 content', () => {
    expect(smartDecode(Buffer.from('hello 中文', 'utf8'))).toBe('hello 中文');
  });

  it('falls back to GBK when bytes are not valid UTF-8', () => {
    // "中文" in GBK encoding
    const gbkBytes = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]);
    expect(smartDecode(gbkBytes)).toBe('中文');
  });

  it('handles empty output', () => {
    expect(smartDecode(Buffer.alloc(0))).toBe('');
  });
});

describe('resolveShellType', () => {
  it('honors an explicit config override', () => {
    expect(resolveShellType({ shell: 'cmd' })).toBe('cmd');
    expect(resolveShellType({ shell: 'powershell' })).toBe('powershell');
  });

  it('honors the AUTOCLOW_SHELL env override', () => {
    const previous = process.env.AUTOCLOW_SHELL;
    process.env.AUTOCLOW_SHELL = 'sh';
    try {
      expect(resolveShellType({})).toBe('sh');
    } finally {
      if (previous === undefined) delete process.env.AUTOCLOW_SHELL;
      else process.env.AUTOCLOW_SHELL = previous;
    }
  });

  it('auto-resolves to a supported shell', () => {
    const type = resolveShellType({});
    expect(['bash', 'powershell', 'cmd', 'sh']).toContain(type);
  });
});

describe('buildShellInfo', () => {
  it('describes each shell dialect', () => {
    expect(buildShellInfo('cmd')).toContain('cmd.exe');
    expect(buildShellInfo('powershell')).toContain('PowerShell');
    expect(buildShellInfo('bash')).toContain('Bash');
    expect(buildShellInfo('sh')).toContain('POSIX');
  });
});

describe('execShellCommand', () => {
  it('runs a command and returns decoded stdout', { timeout: 30000 }, async () => {
    const r = await execShellCommand('node -e "console.log(\'hello shell\')"', {
      timeoutMs: 30000,
      maxBuffer: 1024 * 1024
    });
    expect(r.timedOut).toBe(false);
    expect(r.stdout).toContain('hello shell');
  });

  it('kills commands that exceed the timeout', { timeout: 30000 }, async () => {
    const r = await execShellCommand('node -e "setTimeout(()=>{},10000)"', {
      timeoutMs: 300,
      maxBuffer: 1024 * 1024
    });
    expect(r.timedOut).toBe(true);
  });

  it('captures stderr', { timeout: 30000 }, async () => {
    const r = await execShellCommand('node -e "console.error(\'to stderr\')"', {
      timeoutMs: 30000,
      maxBuffer: 1024 * 1024
    });
    expect(r.stderr).toContain('to stderr');
  });
});
