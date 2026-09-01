import { describe, expect, it, vi } from 'vitest';
import { parseManifest, runBatch, type BatchResult, type ManifestEntry } from './batch.js';

describe('parseManifest', () => {
  it('parses tasks and falls back to line-number ids', () => {
    const entries = parseManifest(
      '{"task":"do a"}\n{"id":"custom","task":"do b","maxSteps":5,"model":"m1","provider":"deepseek"}'
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ lineNo: 1, id: 'task-1', task: 'do a' });
    expect(entries[1]).toMatchObject({ id: 'custom', task: 'do b', maxSteps: 5, model: 'm1', provider: 'deepseek' });
  });

  it('marks malformed lines as errored entries instead of dropping them', () => {
    const entries = parseManifest('not json\n{"id":"ok","task":"fine"}\n{"id":"no-task"}\n"just a string"');

    expect(entries).toHaveLength(4);
    expect(entries[0]).toMatchObject({ lineNo: 1, id: 'task-1' });
    expect(entries[0].error).toBeTruthy();
    expect(entries[1]).toMatchObject({ id: 'ok', task: 'fine' });
    expect(entries[2]).toMatchObject({ lineNo: 3, id: 'no-task' });
    expect(entries[2].error).toBeTruthy();
    expect(entries[3].error).toBeTruthy();
  });

  it('skips blank lines and comments while keeping original line numbers', () => {
    const entries = parseManifest('\n# a comment\n{"task":"x"}\n   \n');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ lineNo: 3, task: 'x' });
  });
});

describe('runBatch', () => {
  const entries: ManifestEntry[] = [
    { lineNo: 1, id: 'a', task: 'a' },
    { lineNo: 2, id: 'b', task: 'b' },
    { lineNo: 3, id: 'c', task: 'c' }
  ];

  it('continues after failures and reports counts', async () => {
    const execute = vi.fn(async (e: ManifestEntry) => {
      if (e.id === 'b') throw new Error('boom');
      return { id: e.id, status: 'completed' as const, durationMs: 1 };
    });

    const outcome = await runBatch(entries, execute);

    expect(execute).toHaveBeenCalledTimes(3);
    expect(outcome.completed).toBe(2);
    expect(outcome.failed).toBe(1);
    expect(outcome.results[1]).toMatchObject({ id: 'b', status: 'error', error: 'boom' });
  });

  it('fail-fast stops at the first failure', async () => {
    const execute = vi.fn(async (e: ManifestEntry) => {
      if (e.id === 'a') return { id: e.id, status: 'error' as const, error: 'x', durationMs: 1 };
      return { id: e.id, status: 'completed' as const, durationMs: 1 };
    });

    const outcome = await runBatch(entries, execute, { failFast: true });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(outcome.failed).toBe(1);
    expect(outcome.results).toHaveLength(1);
  });

  it('reports manifest errors without invoking the executor', async () => {
    const execute = vi.fn(async (e: ManifestEntry) => ({ id: e.id, status: 'completed' as const, durationMs: 1 }));
    const withError: ManifestEntry[] = [{ lineNo: 1, id: 'bad', task: '', error: 'no task field' }];

    const outcome = await runBatch(withError, execute);

    expect(execute).not.toHaveBeenCalled();
    expect(outcome.failed).toBe(1);
    expect(outcome.results[0].error).toContain('no task field');
  });

  it('reports progress via onResult with done/total counters', async () => {
    const execute = vi.fn(async (e: ManifestEntry) => ({ id: e.id, status: 'completed' as const, durationMs: 1 }));
    const onResult = vi.fn();

    await runBatch(entries, execute, { onResult });

    expect(onResult).toHaveBeenCalledTimes(3);
    expect(onResult.mock.calls[2][2]).toBe(3);
    expect(onResult.mock.calls[2][3]).toBe(3);
  });

  it('resume skips already-completed tasks without executing them', async () => {
    const execute = vi.fn(async (e: ManifestEntry) => ({ id: e.id, status: 'completed' as const, durationMs: 1 }));
    const previousById = new Map<string, BatchResult>([
      ['a', { id: 'a', status: 'completed', durationMs: 5 }]
    ]);

    const outcome = await runBatch(entries, execute, {
      resume: { completedIds: new Set(['a']), previousById }
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(outcome.skipped).toBe(1);
    expect(outcome.completed).toBe(3);
    expect(outcome.failed).toBe(0);
    expect(outcome.results[0]).toMatchObject({ id: 'a', status: 'completed', durationMs: 5 });
    expect(outcome.results.map(r => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('runs tasks concurrently up to the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const execute = vi.fn(async (e: ManifestEntry) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 20));
      inFlight--;
      return { id: e.id, status: 'completed' as const, durationMs: 1 };
    });

    const outcome = await runBatch(entries, execute, { concurrency: 3 });

    expect(peak).toBe(3);
    expect(outcome.completed).toBe(3);
    expect(outcome.failed).toBe(0);
    expect(outcome.results).toHaveLength(3);
  });

  it('fail-fast with concurrency stops scheduling new tasks', async () => {
    const execute = vi.fn(async (e: ManifestEntry) => {
      if (e.id === 'a') return { id: e.id, status: 'error' as const, error: 'x', durationMs: 1 };
      return { id: e.id, status: 'completed' as const, durationMs: 1 };
    });

    const outcome = await runBatch(entries, execute, { concurrency: 3, failFast: true });

    expect(outcome.failed).toBe(1);
    expect(outcome.results[0]).toMatchObject({ id: 'a', status: 'error' });
  });
});
