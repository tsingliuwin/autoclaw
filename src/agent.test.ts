import { afterEach, beforeEach, afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';
import { buildShellInfo } from './agent.js';

const mocks = vi.hoisted(() => {
  return {
    createMock: vi.fn(),
    getToolDefinitionsMock: vi.fn(),
    executeToolHandlerMock: vi.fn(),
    spinnerStopMock: vi.fn(),
    spinnerFailMock: vi.fn(),
    oraFactoryMock: vi.fn()
  };
});

vi.mock('openai', () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: mocks.createMock
      }
    };

    constructor(_config: any) {}
  }
  return {
    default: MockOpenAI
  };
});

vi.mock('./tools/index.js', () => {
  return {
    getToolDefinitions: mocks.getToolDefinitionsMock,
    executeToolHandler: mocks.executeToolHandlerMock
  };
});

vi.mock('ora', () => {
  return {
    default: mocks.oraFactoryMock
  };
});

// Redirect ~/.autoclaw/output writes to a temp dir so tests never touch the
// real user home.
const homedirMock = vi.hoisted(() => ({ dir: '' }));

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: () => homedirMock.dir || actual.homedir()
  };
});

// The agent consumes a streamed chat completion (stream: true), so mocks must
// return an async-iterable of OpenAI delta chunks instead of a full response.
function streamFrom(chunks: any[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        const delta = chunk.delta ?? chunk;
        yield { choices: [{ delta }], ...(chunk.usage ? { usage: chunk.usage } : {}) };
      }
    }
  };
}

describe('Agent.chat', () => {
  beforeAll(async () => {
    homedirMock.dir = await fs.mkdtemp(nodePath.join(nodeOs.tmpdir(), 'autoclaw-agent-home-'));
  });

  afterAll(async () => {
    if (homedirMock.dir) {
      await fs.rm(homedirMock.dir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToolDefinitionsMock.mockReturnValue([
      { type: 'function', function: { name: 'read_file' } }
    ]);
    mocks.oraFactoryMock.mockImplementation(() => ({
      start: () => ({
        stop: mocks.spinnerStopMock,
        fail: mocks.spinnerFailMock
      })
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends user prompt and exits when assistant responds with content only', async () => {
    const { Agent } = await import('./agent.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    mocks.createMock.mockResolvedValueOnce(
      streamFrom([{ content: 'Hello from assistant' }])
    );

    const agent = new Agent('test-key', 'https://example.com/v1', 'test-model', {});
    const result = await agent.chat('say hello');

    expect(mocks.createMock).toHaveBeenCalledTimes(1);
    expect(mocks.createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'test-model',
        tools: [{ type: 'function', function: { name: 'read_file' } }],
        tool_choice: 'auto',
        stream: true
      })
    );
    expect(mocks.executeToolHandlerMock).not.toHaveBeenCalled();
    expect(mocks.spinnerFailMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
    expect(result.status).toBe('completed');
    expect(result.steps).toBe(1);
    expect(result.message).toBe('Hello from assistant');
  });

  it('executes tool calls and continues loop until final assistant message', async () => {
    const { Agent } = await import('./agent.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    mocks.createMock
      .mockResolvedValueOnce(
        streamFrom([
          {
            tool_calls: [
              {
                index: 0,
                id: 'tool-call-1',
                type: 'function',
                function: {
                  name: 'read_file',
                  arguments: JSON.stringify({ path: 'README.md' })
                }
              }
            ]
          }
        ])
      )
      .mockResolvedValueOnce(streamFrom([{ content: 'Done' }]));

    mocks.executeToolHandlerMock.mockResolvedValueOnce('file content');

    const agent = new Agent('test-key', undefined, 'test-model', { autoConfirm: true });
    await agent.chat('read the readme');

    expect(mocks.createMock).toHaveBeenCalledTimes(2);
    expect(mocks.executeToolHandlerMock).toHaveBeenCalledWith(
      'read_file',
      { path: 'README.md' },
      { autoConfirm: true }
    );
    const secondCallArgs = mocks.createMock.mock.calls[1][0];
    expect(secondCallArgs.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'tool', tool_call_id: 'tool-call-1', content: 'file content' })
      ])
    );
    expect(mocks.spinnerFailMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[Tool] read_file'));
  });

  it('handles OpenAI request errors and stops processing loop', async () => {
    const { Agent } = await import('./agent.js');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mocks.createMock.mockRejectedValueOnce(new Error('API unavailable'));

    const agent = new Agent('test-key', undefined, 'test-model', {});
    const result = await agent.chat('trigger failure');

    expect(mocks.createMock).toHaveBeenCalledTimes(1);
    expect(mocks.spinnerFailMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    expect(result.status).toBe('error');
    expect(result.error).toBe('API unavailable');
  });

  it('retries transient API errors before the stream starts', async () => {
    vi.useFakeTimers();
    try {
      const { Agent } = await import('./agent.js');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      mocks.createMock
        .mockRejectedValueOnce(Object.assign(new Error('upstream down'), { status: 503 }))
        .mockResolvedValueOnce(streamFrom([{ content: 'Recovered' }]));

      const agent = new Agent('test-key', undefined, 'test-model', {});
      const done = agent.chat('flaky api');
      await vi.runAllTimersAsync();
      await done;

      expect(mocks.createMock).toHaveBeenCalledTimes(2);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops after reaching the max step limit', async () => {
    const { Agent } = await import('./agent.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    mocks.createMock.mockImplementation(async () =>
      streamFrom([
        {
          tool_calls: [
            {
              index: 0,
              id: `call-${Math.random()}`,
              type: 'function',
              function: { name: 'read_file', arguments: '{}' }
            }
          ]
        }
      ])
    );
    mocks.executeToolHandlerMock.mockResolvedValue('ok');

    const agent = new Agent('test-key', undefined, 'test-model', { maxSteps: 3 });
    const result = await agent.chat('loop forever');

    expect(mocks.createMock).toHaveBeenCalledTimes(3);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[MaxSteps]'));
    expect(result.status).toBe('max_steps');
    expect(result.steps).toBe(3);
  });

  it('feeds malformed tool arguments back to the model instead of crashing', async () => {
    const { Agent } = await import('./agent.js');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    mocks.createMock
      .mockResolvedValueOnce(
        streamFrom([
          {
            tool_calls: [
              {
                index: 0,
                id: 'call-bad',
                type: 'function',
                function: { name: 'read_file', arguments: '{not json' }
              }
            ]
          }
        ])
      )
      .mockResolvedValueOnce(streamFrom([{ content: 'Recovered' }]));

    const agent = new Agent('test-key', undefined, 'test-model', {});
    await agent.chat('bad args');

    expect(mocks.executeToolHandlerMock).not.toHaveBeenCalled();
    expect(mocks.createMock).toHaveBeenCalledTimes(2);
    const secondCallArgs = mocks.createMock.mock.calls[1][0];
    expect(secondCallArgs.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          tool_call_id: 'call-bad',
          content: expect.stringContaining('not valid JSON')
        })
      ])
    );
  });

  it('truncates oversized tool results before they enter the model context', async () => {
    const { Agent } = await import('./agent.js');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    mocks.createMock
      .mockResolvedValueOnce(
        streamFrom([
          {
            tool_calls: [
              {
                index: 0,
                id: 'call-huge',
                type: 'function',
                function: { name: 'read_file', arguments: JSON.stringify({ path: 'big.log' }) }
              }
            ]
          }
        ])
      )
      .mockResolvedValueOnce(streamFrom([{ content: 'Done' }]));

    const hugeOutput = Array.from({ length: 3000 }, (_, i) => `line-${i}: ${'x'.repeat(10)}`).join('\n');
    mocks.executeToolHandlerMock.mockResolvedValueOnce(hugeOutput);

    const agent = new Agent('test-key', undefined, 'test-model', {});
    await agent.chat('read big file');

    expect(agent.lastOutputFile).toBeTruthy();
    const savedContent = await fs.readFile(agent.lastOutputFile!, 'utf-8');
    expect(savedContent).toBe(hugeOutput);
    const secondCallArgs = mocks.createMock.mock.calls[1][0];
    const toolMessage = secondCallArgs.messages.find(
      (m: any) => m.role === 'tool' && m.tool_call_id === 'call-huge'
    );
    expect(toolMessage.content).toContain('[Truncated: showing 2000 of 3000 lines');
    expect(toolMessage.content.length).toBeLessThan(hugeOutput.length);
  });

  it('emits NDJSON events in JSON mode without touching stdout', async () => {
    const { Agent } = await import('./agent.js');
    const logCalls: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: any[]) => {
      logCalls.push(String(args[0]));
    });
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    mocks.createMock
      .mockResolvedValueOnce(
        streamFrom([
          {
            tool_calls: [
              {
                index: 0,
                id: 'call-1',
                type: 'function',
                function: { name: 'read_file', arguments: JSON.stringify({ path: 'README.md' }) }
              }
            ]
          }
        ])
      )
      .mockResolvedValueOnce(streamFrom([{ content: 'All done' }]));
    mocks.executeToolHandlerMock.mockResolvedValueOnce('file content');

    const agent = new Agent('test-key', undefined, 'test-model', { jsonMode: true });
    const result = await agent.chat('read the readme');

    expect(mocks.oraFactoryMock).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
    expect(result.status).toBe('completed');

    const events = logCalls.map((line) => JSON.parse(line));
    expect(events.map((e) => e.event)).toEqual(['run_start', 'tool_call', 'tool_result', 'run_end']);
    expect(events[0]).toMatchObject({ event: 'run_start', model: 'test-model', task: 'read the readme' });
    expect(events.find((e) => e.event === 'tool_call')).toMatchObject({
      tool: 'read_file',
      args: { path: 'README.md' }
    });
    expect(events.find((e) => e.event === 'tool_result')).toMatchObject({
      tool: 'read_file',
      truncated: false
    });
    expect(events.find((e) => e.event === 'run_end')).toMatchObject({
      status: 'completed',
      steps: 2,
      message: 'All done'
    });
  });

  it('collects token usage only when includeUsage is enabled', async () => {
    const { Agent } = await import('./agent.js');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    mocks.createMock.mockResolvedValueOnce(
      streamFrom([
        { content: 'Working' },
        { content: ' done', usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 } }
      ])
    );

    const agent = new Agent('test-key', undefined, 'test-model', { includeUsage: true });
    const result = await agent.chat('count tokens');

    expect(mocks.createMock).toHaveBeenCalledWith(
      expect.objectContaining({ stream_options: { include_usage: true } })
    );
    expect(result.usage).toEqual({ prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 });
    expect(result.status).toBe('completed');
  });

  it('does not request usage tracking by default', async () => {
    const { Agent } = await import('./agent.js');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    mocks.createMock.mockResolvedValueOnce(streamFrom([{ content: 'ok' }]));

    const agent = new Agent('test-key', undefined, 'test-model', {});
    await agent.chat('x');

    expect(mocks.createMock.mock.calls[0][0]).not.toHaveProperty('stream_options');
  });
});

describe('buildShellInfo', () => {
  it('describes cmd.exe semantics on Windows', () => {
    const info = buildShellInfo('win32');
    expect(info).toContain('cmd.exe');
    expect(info).toContain('&&');
    expect(info).toContain('powershell');
  });

  it('describes POSIX semantics on Unix platforms', () => {
    expect(buildShellInfo('linux')).toContain('POSIX');
    expect(buildShellInfo('darwin')).toContain('POSIX');
  });

  it('injects shell guidance into the system prompt', async () => {
    const { Agent } = await import('./agent.js');
    const agent = new Agent('test-key', undefined, 'test-model', {});
    const system = (agent as any).messages[0].content as string;

    expect(system).toContain('Shell:');
    expect(system).toContain(buildShellInfo());
  });
});
