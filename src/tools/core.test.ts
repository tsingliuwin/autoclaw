import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ReadFileTool, WriteFileTool, DateTimeTool, ShellTool } from './core.js';

describe('core tools', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoclaw-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('WriteFileTool writes content and creates parent directories', async () => {
    const targetPath = path.join(tempDir, 'nested', 'file.txt');
    const content = 'hello from autoclaw tests';

    const result = await WriteFileTool.handler({ path: targetPath, content }, {});
    const saved = await fs.readFile(targetPath, 'utf-8');

    expect(result).toContain(`Successfully wrote to ${targetPath}`);
    expect(saved).toBe(content);
  });

  it('ReadFileTool returns file contents', async () => {
    const targetPath = path.join(tempDir, 'read.txt');
    await fs.writeFile(targetPath, 'read me', 'utf-8');

    const result = await ReadFileTool.handler({ path: targetPath }, {});
    expect(result).toBe('read me');
  });

  it('ReadFileTool returns a readable error message when file is missing', async () => {
    const missingPath = path.join(tempDir, 'missing.txt');
    const result = await ReadFileTool.handler({ path: missingPath }, {});
    expect(result).toContain('Error reading file:');
  });

  it('ReadFileTool truncates large files at 1MB with a notice', async () => {
    const bigPath = path.join(tempDir, 'big.txt');
    await fs.writeFile(bigPath, 'a'.repeat(1024 * 1024 + 100), 'utf-8');

    const result = await ReadFileTool.handler({ path: bigPath }, {});

    expect(result).toContain('File truncated at 1048576 bytes');
    expect(result.length).toBeLessThan(1024 * 1024 + 200);
  });

  it('ReadFileTool refuses binary files instead of returning mojibake', async () => {
    const binPath = path.join(tempDir, 'blob.bin');
    await fs.writeFile(binPath, Buffer.from([0x00, 0x01, 0x00, 0x02]));

    const result = await ReadFileTool.handler({ path: binPath }, {});

    expect(result).toContain('looks like a binary file');
  });

  it('WriteFileTool overwrites existing content', async () => {
    const p = path.join(tempDir, 'over.txt');
    await WriteFileTool.handler({ path: p, content: 'first' }, {});
    await WriteFileTool.handler({ path: p, content: 'second' }, {});

    expect(await fs.readFile(p, 'utf-8')).toBe('second');
  });

  it('WriteFileTool reports a readable error for invalid targets', async () => {
    const result = await WriteFileTool.handler({ path: tempDir, content: 'x' }, {});
    expect(result).toContain('Error writing file:');
  });

  it('blocks reads of AutoClaw credential files and .env stores', async () => {
    const settingPath = path.join(os.homedir(), '.autoclaw', 'setting.json');
    const envPath = path.join(tempDir, '.env.local');

    const r1 = await ReadFileTool.handler({ path: settingPath }, {});
    expect(r1).toContain('blocked by AutoClaw safety policy');

    await fs.writeFile(envPath, 'SECRET=1', 'utf-8');
    const r2 = await ReadFileTool.handler({ path: envPath }, {});
    expect(r2).toContain('blocked by AutoClaw safety policy');
  });

  it('blocks writes to credential files unless allowDangerous', async () => {
    const settingPath = path.join(os.homedir(), '.autoclaw', 'setting.json');

    const blocked = await WriteFileTool.handler({ path: settingPath, content: 'hacked' }, { autoConfirm: true });
    expect(blocked).toContain('It was NOT written');

    const allowed = await WriteFileTool.handler(
      { path: path.join(tempDir, '.env'), content: 'A=1' },
      { autoConfirm: true, allowDangerous: true }
    );
    expect(allowed).toContain('Successfully wrote');
    expect(await fs.readFile(path.join(tempDir, '.env'), 'utf-8')).toBe('A=1');
  });

  it('DateTimeTool returns valid JSON with expected fields', async () => {
    const result = await DateTimeTool.handler({}, {});
    const parsed = JSON.parse(result);

    expect(typeof parsed.iso).toBe('string');
    expect(typeof parsed.local).toBe('string');
    expect(typeof parsed.timezone).toBe('string');
    expect(typeof parsed.weekday).toBe('string');
    expect(Number.isNaN(Date.parse(parsed.iso))).toBe(false);
  });
});

describe('ShellTool', () => {
  const originalTTY = process.stdin.isTTY;

  afterAll(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalTTY, configurable: true });
  });

  it('denies execution when confirmation is required but stdin is not a TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

    const result = await ShellTool.handler({ command: 'echo hi', rationale: 'test' }, {});

    expect(result).toContain('no interactive terminal is attached');
    expect(result).toContain('--yes');
  });

  it('executes commands when autoConfirm is enabled', { timeout: 15000 }, async () => {
    const result = await ShellTool.handler(
      { command: 'node -e "console.log(41+1)"', rationale: 'test' },
      { autoConfirm: true }
    );

    expect(result).toContain('42');
  });

  it('blocks clearly destructive commands even with autoConfirm', async () => {
    const result = await ShellTool.handler(
      { command: 'rm -rf /', rationale: 'test' },
      { autoConfirm: true }
    );

    expect(result).toContain('blocked by AutoClaw safety policy');
    expect(result).toContain('rm with recursive+force');
    expect(result).toContain('--allow-dangerous');
  });

  it('blocks PowerShell recursive deletes and disk tooling', async () => {
    for (const cmd of ['Remove-Item C:\\data -Recurse -Force', 'format D: /q', 'shutdown /r']) {
      const result = await ShellTool.handler({ command: cmd, rationale: 'test' }, { autoConfirm: true });
      expect(result).toContain('blocked by AutoClaw safety policy');
    }
  });

  it('runs benign commands without blocking', { timeout: 15000 }, async () => {
    const result = await ShellTool.handler(
      { command: 'node -e "console.log(\'cleanup done\')"', rationale: 'test' },
      { autoConfirm: true }
    );

    expect(result).not.toContain('blocked');
    expect(result).toContain('cleanup done');
  });

  it('allows destructive commands only with allowDangerous', { timeout: 15000 }, async () => {
    const result = await ShellTool.handler(
      { command: 'echo rm -rf demo', rationale: 'test' },
      { autoConfirm: true, allowDangerous: true }
    );

    expect(result).not.toContain('blocked');
    expect(result).toContain('rm -rf demo');
  });

  it('kills commands that exceed the configured timeout', { timeout: 20000 }, async () => {
    const result = await ShellTool.handler(
      { command: 'node -e "setTimeout(()=>{},10000)"', rationale: 'test' },
      { autoConfirm: true, shellTimeout: 300 }
    );

    expect(result).toContain('timed out after 300ms');
  }, 10000);
});
