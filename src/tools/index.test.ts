import { describe, it, expect, vi, afterEach } from 'vitest';
import { getToolDefinitions, executeToolHandler } from './index.js';

describe('tool registry', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('exposes known core tool definitions', () => {
    const definitions = getToolDefinitions({});
    const functionNames = definitions.map((d: any) => d.function.name);

    expect(functionNames).toContain('execute_shell_command');
    expect(functionNames).toContain('read_file');
    expect(functionNames).toContain('write_file');
    expect(functionNames).toContain('get_current_datetime');
  });

  it('drops unconfigured optional tools from the definitions', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('TAVILY_API_KEY', '');

    const functionNames = getToolDefinitions({}).map((d: any) => d.function.name);

    expect(functionNames).not.toContain('send_email');
    expect(functionNames).not.toContain('web_search');
    expect(functionNames).not.toContain('send_notification');
    expect(functionNames).not.toContain('generate_image');
    expect(functionNames).not.toContain('optimize_prompt');
  });

  it('registers optional tools once their requirements are met', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('TAVILY_API_KEY', '');

    const functionNames = getToolDefinitions({
      apiKey: 'k',
      tavilyApiKey: 'k',
      smtpHost: 'smtp.example.com',
      smtpUser: 'bot@example.com',
      smtpPass: 'secret',
      feishuWebhook: 'https://hook.example/feishu'
    }).map((d: any) => d.function.name);

    expect(functionNames).toContain('send_email');
    expect(functionNames).toContain('web_search');
    expect(functionNames).toContain('send_notification');
    expect(functionNames).toContain('generate_image');
    expect(functionNames).toContain('optimize_prompt');
  });

  it('returns an explicit error for unknown tools', async () => {
    const result = await executeToolHandler('nonexistent_tool', {}, {});
    expect(result).toBe('Error: Tool nonexistent_tool not found.');
  });
});
