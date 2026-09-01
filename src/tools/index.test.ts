import { describe, it, expect } from 'vitest';
import { getToolDefinitions, executeToolHandler } from './index.js';

describe('tool registry', () => {
  it('exposes known core tool definitions', () => {
    const definitions = getToolDefinitions();
    const functionNames = definitions.map((d: any) => d.function.name);

    expect(functionNames).toContain('execute_shell_command');
    expect(functionNames).toContain('read_file');
    expect(functionNames).toContain('write_file');
    expect(functionNames).toContain('get_current_datetime');
  });

  it('returns an explicit error for unknown tools', async () => {
    const result = await executeToolHandler('nonexistent_tool', {}, {});
    expect(result).toBe('Error: Tool nonexistent_tool not found.');
  });
});
