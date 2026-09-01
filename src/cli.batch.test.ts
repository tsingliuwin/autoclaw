import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// These tests exercise the real CLI (dist/index.js) against a local mock
// LLM endpoint, so they need `npm run build` to have been executed first.
const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.js');

type MockMode = 'ok' | 'fail' | 'toolloop';

async function startMockLLM(mode: MockMode) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (mode === 'fail') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'mock server failure', type: 'server_error' } }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    const send = (obj: any) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    if (mode === 'toolloop') {
      send({
        id: 'mock', object: 'chat.completion.chunk', created: 1, model: 'mock',
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'get_current_datetime', arguments: '{}' } }]
          }
        }]
      });
    } else {
      send({ id: 'mock', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta: { content: 'Done' } }] });
    }
    send({
      id: 'mock', object: 'chat.completion.chunk', created: 1, model: 'mock',
      choices: [{ index: 0, delta: {} }],
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }
    });
    res.write('data: [DONE]\n\n');
    res.end();
  });
  server.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as net.AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => new Promise<void>(resolve => server.close(() => resolve()))
  };
}

describe('CLI end-to-end (spawned process, mock LLM)', () => {
  let workDir: string;
  const hasDist = fs.existsSync(cliPath);

  beforeAll(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoclaw-cli-'));
  });

  afterAll(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  function runCli(args: string[], envOverrides: Record<string, string>) {
    return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [cliPath, ...args], {
        cwd: workDir,
        env: { ...process.env, ...envOverrides }
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', d => (stdout += d));
      child.stderr.on('data', d => (stderr += d));
      child.on('error', reject);
      child.on('close', code => resolve({ code, stdout, stderr }));
    });
  }

  it('runs a batch to completion, writes default results file, exits 0', { timeout: 60000 }, async () => {
    if (!hasDist) return console.warn('skipping: dist/index.js not built');
    const mock = await startMockLLM('ok');
    try {
      const manifest = path.join(workDir, 'tasks.jsonl');
      fs.writeFileSync(manifest, '{"id":"t1","task":"task one"}\n{"id":"t2","task":"task two"}\n');

      const { code, stdout } = await runCli(['batch', manifest, '-y'], {
        HOME: workDir,
        USERPROFILE: workDir,
        OPENAI_API_KEY: 'test-key',
        OPENAI_BASE_URL: mock.baseUrl,
        AUTOCLOW_INCLUDE_USAGE: '1'
      });

      expect(code).toBe(0);
      expect(stdout).toContain('Batch done: 2/2');

      const resultsPath = path.join(workDir, 'tasks.results.jsonl');
      const lines = fs.readFileSync(resultsPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatchObject({
        id: 't1',
        status: 'completed',
        steps: 1,
        message: 'Done',
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }
      });
      expect(lines[1]).toMatchObject({ id: 't2', status: 'completed' });
    } finally {
      await mock.close();
    }
  });

  it('continues past a failing task, writes error entries, exits 1', { timeout: 60000 }, async () => {
    if (!hasDist) return console.warn('skipping: dist/index.js not built');
    const mock = await startMockLLM('fail');
    try {
      const manifest = path.join(workDir, 'failing.jsonl');
      fs.writeFileSync(manifest, '{"id":"bad-1","task":"will fail"}\n{"id":"bad-2","task":"fails too"}\n');

      const { code, stdout } = await runCli(['batch', manifest, '-y', '-o', 'out.jsonl'], {
        HOME: workDir,
        USERPROFILE: workDir,
        OPENAI_API_KEY: 'test-key',
        OPENAI_BASE_URL: mock.baseUrl
      });

      expect(code).toBe(1);
      expect(stdout).toContain('Batch done: 0/2');

      const lines = fs.readFileSync(path.join(workDir, 'out.jsonl'), 'utf-8').trim().split('\n').map(l => JSON.parse(l));
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatchObject({ id: 'bad-1', status: 'error' });
      expect(lines[0].error).toBeTruthy();
      expect(lines[1]).toMatchObject({ id: 'bad-2', status: 'error' });
    } finally {
      await mock.close();
    }
  });

  it('maps the step cap to exit code 2 for a single headless run', { timeout: 60000 }, async () => {
    if (!hasDist) return console.warn('skipping: dist/index.js not built');
    const mock = await startMockLLM('toolloop');
    try {
      const { code, stdout } = await runCli(['do something repeatedly', '-y', '-n'], {
        HOME: workDir,
        USERPROFILE: workDir,
        OPENAI_API_KEY: 'test-key',
        OPENAI_BASE_URL: mock.baseUrl,
        AUTOCLOW_MAX_STEPS: '2'
      });

      expect(code).toBe(2);
      expect(stdout).toContain('[MaxSteps]');
    } finally {
      await mock.close();
    }
  });
});
