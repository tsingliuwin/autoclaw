import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('Agent.chat', () => {
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

    mocks.createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Hello from assistant'
          }
        }
      ]
    });

    const agent = new Agent('test-key', 'https://example.com/v1', 'test-model', {});
    await agent.chat('say hello');

    expect(mocks.createMock).toHaveBeenCalledTimes(1);
    expect(mocks.createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'test-model',
        tools: [{ type: 'function', function: { name: 'read_file' } }],
        tool_choice: 'auto'
      })
    );
    expect(mocks.executeToolHandlerMock).not.toHaveBeenCalled();
    expect(mocks.spinnerStopMock).toHaveBeenCalledTimes(1);
    expect(mocks.spinnerFailMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
  });

  it('executes tool calls and continues loop until final assistant message', async () => {
    const { Agent } = await import('./agent.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.createMock
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'tool-call-1',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: JSON.stringify({ path: 'README.md' })
                  }
                }
              ]
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Done'
            }
          }
        ]
      });

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
    expect(mocks.spinnerStopMock).toHaveBeenCalledTimes(2);
    expect(mocks.spinnerFailMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Executing tool: read_file...'));
  });

  it('handles OpenAI request errors and stops processing loop', async () => {
    const { Agent } = await import('./agent.js');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mocks.createMock.mockRejectedValueOnce(new Error('API unavailable'));

    const agent = new Agent('test-key', undefined, 'test-model', {});
    await agent.chat('trigger failure');

    expect(mocks.createMock).toHaveBeenCalledTimes(1);
    expect(mocks.spinnerFailMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
  });
});
