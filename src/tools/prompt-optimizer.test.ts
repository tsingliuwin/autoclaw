import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptOptimizerTool } from './prompt-optimizer.js';

const mocks = vi.hoisted(() => ({
  createCompletionMock: vi.fn()
}));

vi.mock('openai', () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: mocks.createCompletionMock
      }
    };
    constructor(_config: any) {}
  }
  return { default: MockOpenAI };
});

describe('PromptOptimizerTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns config error when API key is missing', async () => {
    const result = await PromptOptimizerTool.handler(
      { raw_prompt: 'make this better' },
      {}
    );
    expect(result).toContain('OpenAI API Key is missing');
  });

  it('returns optimized prompt content from OpenAI', async () => {
    mocks.createCompletionMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'Optimized prompt output'
          }
        }
      ]
    });

    const result = await PromptOptimizerTool.handler(
      { raw_prompt: 'write docs', context: 'for engineers' },
      { apiKey: 'test-key', baseUrl: 'https://example.com/v1', model: 'gpt-4o-mini' }
    );

    expect(mocks.createCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o-mini' })
    );
    expect(result).toBe('Optimized prompt output');
  });

  it('handles OpenAI errors', async () => {
    mocks.createCompletionMock.mockRejectedValue(new Error('upstream failure'));

    const result = await PromptOptimizerTool.handler(
      { raw_prompt: 'hello' },
      { apiKey: 'test-key' }
    );

    expect(result).toBe('Error optimizing prompt: upstream failure');
  });
});
