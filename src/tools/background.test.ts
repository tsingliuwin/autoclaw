import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CheckBackgroundProcessTool, StartBackgroundProcessTool, StopBackgroundProcessTool } from './background.js';

async function waitFor(cond: () => boolean | Promise<boolean>, timeoutMs = 10000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await cond()) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return cond();
}

describe('background process tools', () => {
  it('starts a process, reports its output, and observes its exit', { timeout: 30000 }, async () => {
    const start = await StartBackgroundProcessTool.handler(
      { command: 'node -e "console.log(\'bg hello\'); setTimeout(()=>process.exit(0), 400)"', rationale: 'test' },
      {}
    );
    expect(start).toContain('Background process started.');
    const id = /handle id: (bg-[\w-]+)/.exec(start)![1];
    const logPath = /log: (.+)/.exec(start)![1].trim();
    expect(fs.existsSync(logPath)).toBe(true);

    const during = await CheckBackgroundProcessTool.handler({ id }, {});
    expect(during).toContain(id);
    expect(during).toMatch(/running|exited/);

    const exited = await waitFor(() => CheckBackgroundProcessTool.handler({ id }, {}).then(r => r.includes('exited (code: 0)')));
    expect(exited).toBe(true);
    const final = await CheckBackgroundProcessTool.handler({ id }, {});
    expect(final).toContain('bg hello');
  }, 30000);

  it('stops a long-running background process via the tree', { timeout: 30000 }, async () => {
    const start = await StartBackgroundProcessTool.handler(
      { command: 'node -e "setInterval(()=>console.log(\'tick\'),100)"', rationale: 'test' },
      {}
    );
    const id = /handle id: (bg-[\w-]+)/.exec(start)![1];

    const hasTicks = await waitFor(() => CheckBackgroundProcessTool.handler({ id }, {}).then(r => r.includes('tick')));
    expect(hasTicks).toBe(true);

    const stopped = await StopBackgroundProcessTool.handler({ id }, {});
    expect(stopped).toContain('terminated');

    const after = await CheckBackgroundProcessTool.handler({ id }, {});
    expect(after).toContain('exited');
  });

  it('blocks destructive background commands through the safety gate', async () => {
    const result = await StartBackgroundProcessTool.handler(
      { command: 'node -e "require(\'child_process\').execSync(\'rm -rf /\')"', rationale: 'test' },
      {}
    );
    expect(result).toContain('blocked by AutoClaw safety policy');
  });

  it('returns readable errors for unknown handles', async () => {
    const r1 = await CheckBackgroundProcessTool.handler({ id: 'bg-nope' }, {});
    expect(r1).toContain('unknown background process id');
    const r2 = await StopBackgroundProcessTool.handler({ id: 'bg-nope' }, {});
    expect(r2).toContain('unknown background process id');
  });
});
