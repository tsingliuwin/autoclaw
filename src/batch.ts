import type { AgentUsage } from './agent.js';

// Batch mode turns AutoClaw into a swarm worker: a JSONL manifest goes in,
// one isolated agent run per task, a JSONL result file comes out.

export interface ManifestEntry {
  lineNo: number;
  id: string;
  task: string;
  maxSteps?: number;
  model?: string;
  provider?: string;
  error?: string;
}

export interface BatchResult {
  id: string;
  status: 'completed' | 'error' | 'max_steps';
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
      if (typeof parsed.model === 'string' && parsed.model.trim()) entry.model = parsed.model.trim();
      if (typeof parsed.provider === 'string' && parsed.provider.trim()) entry.provider = parsed.provider.trim();
      return entry;
    })
    .filter((entry): entry is ManifestEntry => entry !== null);
}

export interface RunBatchOptions {
  failFast?: boolean;
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

  for (const entry of entries) {
    let result: BatchResult;
    if (entry.error) {
      result = { id: entry.id, status: 'error', error: `Manifest line ${entry.lineNo}: ${entry.error}`, durationMs: 0 };
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
    options.onResult?.(entry, result, results.length, total);

    if (options.failFast && result.status !== 'completed') break;
  }

  return { results, completed, failed };
}
