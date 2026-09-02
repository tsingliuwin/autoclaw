import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DateTimeTool, ReadFileTool, WriteFileTool } from './core.js';
import { execShellCommand, smartDecode } from '../shell.js';
import { truncateOutput } from '../truncate.js';

// Loose, CI-safe latency budgets: they exist to catch gross regressions
// (accidental O(n^2), forgotten awaits, unbounded reads), not to measure
// absolute performance.
describe('tool performance budgets', () => {
  it('DateTimeTool responds within 50ms', async () => {
    const t0 = performance.now();
    await DateTimeTool.handler({}, {});
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it('writes and reads a 1MB file within 2s each', { timeout: 15000 }, async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoclaw-perf-'));
    try {
      const p = path.join(dir, 'big.txt');
      const content = 'x'.repeat(1024 * 1024);

      let t0 = performance.now();
      await WriteFileTool.handler({ path: p, content }, {});
      expect(performance.now() - t0).toBeLessThan(2000);

      t0 = performance.now();
      const out = await ReadFileTool.handler({ path: p }, {});
      expect(performance.now() - t0).toBeLessThan(2000);
      expect(out).toContain('File truncated at 1048576 bytes');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('truncateOutput handles 50k lines within 500ms', () => {
    const content = Array.from({ length: 50000 }, (_, i) => `line-${i}`).join('\n');
    const t0 = performance.now();
    const r = truncateOutput(content);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(r.truncated).toBe(true);
    expect(r.emittedLines).toBe(2000);
  });

  it('smartDecode handles 1MB within 500ms', () => {
    const buf = Buffer.from('x'.repeat(1024 * 1024), 'utf8');
    const t0 = performance.now();
    expect(smartDecode(buf)).toHaveLength(1024 * 1024);
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it('execShellCommand completes a trivial command within 10s', { timeout: 20000 }, async () => {
    const t0 = performance.now();
    const r = await execShellCommand('node -e "console.log(1)"', { timeoutMs: 10000, maxBuffer: 1024 * 1024 });
    expect(r.stdout).toContain('1');
    expect(performance.now() - t0).toBeLessThan(10000);
  });
});
