import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ReadFileTool, WriteFileTool, DateTimeTool } from './core.js';

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
