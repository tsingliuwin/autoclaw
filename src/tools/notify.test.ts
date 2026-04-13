import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotifyTool } from './notify.js';

describe('NotifyTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an error for unknown platforms', async () => {
    const result = await NotifyTool.handler(
      { platform: 'slack', content: 'hello' },
      {}
    );
    expect(result).toContain("Unknown platform 'slack'");
  });

  it('returns a config error when webhook is missing', async () => {
    const result = await NotifyTool.handler(
      { platform: 'feishu', content: 'deploy done' },
      {}
    );
    expect(result).toBe('Error: Feishu Webhook URL is not configured.');
  });

  it('sends feishu notification and injects keyword if missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ code: 0 })
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await NotifyTool.handler(
      { platform: 'feishu', content: 'nightly build passed' },
      {
        feishuWebhook: 'https://hook.example/feishu',
        feishuKeyword: 'ALERT'
      }
    );

    expect(result).toBe('Notification sent to feishu successfully.');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hook.example/feishu',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          msg_type: 'text',
          content: { text: '[ALERT] nightly build passed' }
        })
      })
    );
  });

  it('returns API failure payload for dingtalk/wecom style response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ errcode: 300001, errmsg: 'invalid token' })
      })
    );

    const result = await NotifyTool.handler(
      { platform: 'dingtalk', content: 'message' },
      { dingtalkWebhook: 'https://hook.example/ding' }
    );

    expect(result).toContain('Failed to send to dingtalk.');
    expect(result).toContain('"errcode":300001');
  });

  it('handles network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

    const result = await NotifyTool.handler(
      { platform: 'wecom', content: 'hello' },
      { wecomWebhook: 'https://hook.example/wecom' }
    );

    expect(result).toBe('Network error sending notification: timeout');
  });
});
