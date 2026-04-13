import { beforeEach, describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import { EmailTool } from './email.js';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn()
  }
}));

describe('EmailTool', () => {
  const createTransportMock = vi.mocked(nodemailer.createTransport);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a config error when SMTP settings are missing', async () => {
    const result = await EmailTool.handler(
      { to: 'u@example.com', subject: 'x', body: 'y' },
      {}
    );

    expect(result).toContain('Email tool is not configured');
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('sends email successfully with attachments when configured', async () => {
    const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'abc-123' });
    createTransportMock.mockReturnValue({ sendMail: sendMailMock } as any);

    const result = await EmailTool.handler(
      {
        to: 'to@example.com',
        subject: 'Subject',
        body: 'Body',
        attachments: ['/tmp/a.txt', '/tmp/b.txt']
      },
      {
        smtpHost: 'smtp.example.com',
        smtpPort: '587',
        smtpUser: 'bot@example.com',
        smtpPass: 'secret',
        smtpFrom: 'from@example.com'
      }
    );

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        secure: false
      })
    );
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'from@example.com',
        to: 'to@example.com',
        subject: 'Subject',
        text: 'Body',
        attachments: [{ path: '/tmp/a.txt' }, { path: '/tmp/b.txt' }]
      })
    );
    expect(result).toBe('Email sent successfully. Message ID: abc-123');
  });

  it('returns detailed SMTP errors', async () => {
    const sendMailMock = vi.fn().mockRejectedValue({
      code: 'EAUTH',
      message: 'Invalid login',
      response: '535 Authentication failed'
    });
    createTransportMock.mockReturnValue({ sendMail: sendMailMock } as any);

    const result = await EmailTool.handler(
      { to: 'to@example.com', subject: 'S', body: 'B' },
      {
        smtpHost: 'smtp.example.com',
        smtpPort: '465',
        smtpUser: 'bot@example.com',
        smtpPass: 'bad-pass'
      }
    );

    expect(result).toContain('Failed to send email');
    expect(result).toContain('[Code: EAUTH]');
    expect(result).toContain('535 Authentication failed');
  });
});
