import { ToolModule } from './interface.js';
import { ShellTool, ReadFileTool, WriteFileTool } from './core.js';
import { EmailTool } from './email.js';
import { SearchTool } from './search.js';
import { NotifyTool } from './notify.js';

// Central Registry of all available tools
export const toolRegistry: ToolModule[] = [
  ShellTool,
  ReadFileTool,
  WriteFileTool,
  EmailTool,
  SearchTool,
  NotifyTool
];

export function getToolDefinitions() {
  return toolRegistry.map(t => t.definition);
}

export async function executeToolHandler(name: string, args: any, fullConfig: any): Promise<string> {
  const tool = toolRegistry.find(t => t.definition.function.name === name);
  if (!tool) {
    return `Error: Tool ${name} not found.`;
  }
  
  return await tool.handler(args, fullConfig);
}
