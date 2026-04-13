import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenshotTool } from './screenshot.js';

const mocks = vi.hoisted(() => ({
  launchMock: vi.fn()
}));

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    platform: vi.fn(() => 'darwin')
  };
});

vi.mock('playwright', () => ({
  chromium: {
    launch: mocks.launchMock
  }
}));

describe('ScreenshotTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns install instruction when Playwright executable is missing', async () => {
    mocks.launchMock
      .mockRejectedValueOnce(new Error('system chrome unavailable'))
      .mockRejectedValueOnce(new Error("Executable doesn't exist"));

    const result = await ScreenshotTool.handler(
      { url: 'https://example.com', outputPath: 'shot.png' },
      {}
    );

    expect(result).toContain('Playwright browsers are not installed');
  });

  it('captures screenshot successfully with default fullPage behavior', async () => {
    const screenshotMock = vi.fn().mockResolvedValue(undefined);
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      addStyleTag: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      screenshot: screenshotMock
    };
    const browser = {
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue(page)
      }),
      close: vi.fn().mockResolvedValue(undefined)
    };
    mocks.launchMock.mockResolvedValueOnce(browser);

    const result = await ScreenshotTool.handler(
      { url: 'https://example.com', outputPath: 'shot.png', waitTime: 0 },
      {}
    );

    expect(result).toContain('Successfully captured screenshot');
    expect(screenshotMock).toHaveBeenCalledWith({
      path: 'shot.png',
      fullPage: true
    });
  });
});
