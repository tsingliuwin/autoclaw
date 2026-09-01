import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserTool } from './browser.js';

const mocks = vi.hoisted(() => ({
  launchMock: vi.fn(),
  parseMock: vi.fn()
}));

vi.mock('playwright', () => ({
  chromium: {
    launch: mocks.launchMock
  }
}));

vi.mock('jsdom', () => ({
  JSDOM: class MockJSDOM {
    window = { document: {} };
    constructor(_html: string, _opts: any) {}
  }
}));

vi.mock('@mozilla/readability', () => ({
  Readability: class MockReadability {
    constructor(_doc: any) {}
    parse() {
      return mocks.parseMock();
    }
  }
}));

describe('BrowserTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns install instruction when Playwright executable is missing', async () => {
    mocks.launchMock.mockRejectedValue(
      new Error("Executable doesn't exist at /fake/chromium")
    );

    const result = await BrowserTool.handler({ url: 'https://example.com' }, {});
    expect(result).toContain('Playwright browsers are not installed');
  });

  it('returns parsed article content on successful read', async () => {
    const closeMock = vi.fn();
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      content: vi.fn().mockResolvedValue('<html></html>'),
      innerText: vi.fn().mockResolvedValue('raw body')
    };
    const context = {
      newPage: vi.fn().mockResolvedValue(page)
    };
    const browser = {
      newContext: vi.fn().mockResolvedValue(context),
      close: closeMock
    };
    mocks.launchMock.mockResolvedValue(browser);
    mocks.parseMock.mockReturnValue({
      title: 'Article title',
      textContent: 'Main article content'
    });

    const result = await BrowserTool.handler({ url: 'https://example.com/post' }, {});

    expect(result).toContain('Title: Article title');
    expect(result).toContain('Main article content');
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to raw body text when readability parsing fails', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      content: vi.fn().mockResolvedValue('<html></html>'),
      innerText: vi.fn().mockResolvedValue('fallback body text')
    };
    const browser = {
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue(page)
      }),
      close: vi.fn()
    };
    mocks.launchMock.mockResolvedValue(browser);
    mocks.parseMock.mockReturnValue(null);

    const result = await BrowserTool.handler({ url: 'https://example.com/post' }, {});

    expect(result).toContain('Could not parse article content with Readability');
    expect(result).toContain('fallback body text');
  });
});
