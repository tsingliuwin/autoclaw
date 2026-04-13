import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchTool } from './search.js';

describe('SearchTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an error when Tavily API key is missing', async () => {
    const result = await SearchTool.handler({ query: 'latest news' }, {});
    expect(result).toContain('Tavily API Key is missing');
  });

  it('returns API error details for non-OK responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('unauthorized')
      })
    );

    const result = await SearchTool.handler(
      { query: 'autoclaw' },
      { tavilyApiKey: 'key' }
    );

    expect(result).toBe('Search API Error: 401 - unauthorized');
  });

  it('formats successful results including direct answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          answer: 'AutoClaw is a CLI agent.',
          results: [
            {
              title: 'AutoClaw',
              url: 'https://example.com/autoclaw',
              content: 'Project page'
            }
          ]
        })
      })
    );

    const result = await SearchTool.handler(
      { query: 'what is autoclaw' },
      { tavilyApiKey: 'key' }
    );

    expect(result).toContain('Search Results for "what is autoclaw"');
    expect(result).toContain('Direct Answer');
    expect(result).toContain('https://example.com/autoclaw');
  });

  it('handles fetch/network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await SearchTool.handler(
      { query: 'autoclaw' },
      { tavilyApiKey: 'key' }
    );

    expect(result).toBe('Failed to perform web search: network down');
  });
});
