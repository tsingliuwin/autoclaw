import { ToolModule } from './interface.js';
import { ShellTool, ReadFileTool, WriteFileTool, DateTimeTool } from './core.js';
import { EmailTool } from './email.js';
import { SearchTool } from './search.js';
import { NotifyTool } from './notify.js';
import { BrowserTool } from './browser.js';
import { ScreenshotTool } from './screenshot.js';
import { ImageTool } from './image.js';
import { PromptOptimizerTool } from './prompt-optimizer.js';
import { RenderImageTool } from './render-image.js';
import { RenderPdfTool } from './render-pdf.js';
import { CheckBackgroundProcessTool, StartBackgroundProcessTool, StopBackgroundProcessTool } from './background.js';

// Central Registry of all available tools
export const toolRegistry: ToolModule[] = [
  ShellTool,
  ReadFileTool,
  WriteFileTool,
  DateTimeTool,
  PromptOptimizerTool,
  EmailTool,
  SearchTool,
  NotifyTool,
  BrowserTool,
  ScreenshotTool,
  ImageTool,
  RenderImageTool,
  RenderPdfTool,
  StartBackgroundProcessTool,
  CheckBackgroundProcessTool,
  StopBackgroundProcessTool
];

export function getToolDefinitions(config?: any) {
  return toolRegistry
    .filter(t => !t.isAvailable || t.isAvailable(config ?? {}))
    .map(t => t.definition);
}

export function listUnavailableTools(config?: any): string[] {
  return toolRegistry
    .filter(t => t.isAvailable && !t.isAvailable(config ?? {}))
    .map(t => t.definition.function.name);
}

export async function executeToolHandler(name: string, args: any, fullConfig: any): Promise<string> {
  const tool = toolRegistry.find(t => t.definition.function.name === name);
  if (!tool) {
    return `Error: Tool ${name} not found.`;
  }

  return await tool.handler(args, fullConfig);
}
