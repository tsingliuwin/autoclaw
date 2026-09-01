import type { AgentUsage } from './agent.js';

// Batch mode turns AutoClaw into a swarm worker: a JSONL manifest goes in,
// one isolated agent run per task, a JSONL result file comes out.

export interface ManifestEntry {
  lineNo: number;
  id: string;
  task: string;
  maxSteps?: number;
  taskTimeoutMs?: number;
  model?: string;
  provider?: string;
  error?: string;
}

export interface BatchResult {
  id: string;
  status: 'completed' | 'error' | 'max_steps' | 'timeout';
  steps?: number;
  message?: string | null;
  error?: string;
  usage?: AgentUsage;
  durationMs: number;
}

export interface BatchOutcome {
  results: BatchResult[];
  completed: number;
  failed: number;
  skipped: number;
}

// Blank lines and lines starting with '#' are skipped. Malformed lines are
// kept as errored entries (in manifest order) rather than dropped, so the
// result file accounts for every task the user submitted.
export function parseManifest(raw: string): ManifestEntry[] {
  return raw
    .split('\n')
    .map((line, idx) => {
      const lineNo = idx + 1;
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return null;

      let parsed: any = null;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        // fall through to the error entry below
      }

      const id =
        parsed && typeof parsed === 'object' && typeof parsed.id === 'string' && parsed.id.trim()
          ? parsed.id.trim()
          : `task-${lineNo}`;

      if (!parsed || typeof parsed !== 'object' || typeof parsed.task !== 'string' || !parsed.task.trim()) {
        return { lineNo, id, task: '', error: 'not valid JSON or missing "task" field' };
      }

      const entry: ManifestEntry = { lineNo, id, task: parsed.task.trim() };
      if (typeof parsed.maxSteps === 'number' && parsed.maxSteps > 0) entry.maxSteps = parsed.maxSteps;
      if (typeof parsed.taskTimeoutMs === 'number' && parsed.taskTimeoutMs > 0) entry.taskTimeoutMs = parsed.taskTimeoutMs;
      if (typeof parsed.model === 'string' && parsed.model.trim()) entry.model = parsed.model.trim();
      if (typeof parsed.provider === 'string' && parsed.provider.trim()) entry.provider = parsed.provider.trim();
      return entry;
    })
    .filter((entry): entry is ManifestEntry => entry !== null);
}

export interface ResumeState {
  completedIds: Set<string>;
  previousById: Map<string, BatchResult>;
}

export interface RunBatchOptions {
  failFast?: boolean;
  concurrency?: number;
  resume?: ResumeState;
  onResult?: (entry: ManifestEntry, result: BatchResult, done: number, total: number) => void;
}

export async function runBatch(
  entries: ManifestEntry[],
  execute: (entry: ManifestEntry) => Promise<BatchResult>,
  options: RunBatchOptions = {}
): Promise<BatchOutcome> {
  const total = entries.length;
  const results: BatchResult[] = [];
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let stopped = false;
  let done = 0;

  const runEntry = async (i: number): Promise<void> => {
    const entry = entries[i];
    let result: BatchResult;
    if (entry.error) {
      result = { id: entry.id, status: 'error', error: `Manifest line ${entry.lineNo}: ${entry.error}`, durationMs: 0 };
    } else if (options.resume?.completedIds.has(entry.id)) {
      result = options.resume.previousById.get(entry.id) ?? {
        id: entry.id, status: 'error', error: 'missing previous result', durationMs: 0
      };
      skipped++;
    } else {
      try {
        result = await execute(entry);
      } catch (err: any) {
        result = { id: entry.id, status: 'error', error: err?.message ?? String(err), durationMs: 0 };
      }
    }

    if (result.status === 'completed') completed++;
    else failed++;
    results.push(result);
    done++;
    options.onResult?.(entry, result, done, total);
    if (options.failFast && result.status !== 'completed') stopped = true;
  };

  const concurrency = Math.max(1, Math.min(options.concurrency ?? 1, total || 1));
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < total && !stopped) {
      const i = next++;
      await runEntry(i);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return { results, completed, failed, skipped };
}
