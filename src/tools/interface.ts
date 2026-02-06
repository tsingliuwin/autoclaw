export interface ToolDefinition {
  type: "function";
  function: {
    name: "execute_shell_command" | "read_file" | "write_file" | "send_email" | string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export interface ToolModule {
  name: string; // Display name for setup (e.g., "Email Service")
  configKeys?: string[]; // Keys needed in setting.json (e.g., ["smtpHost", "smtpUser"])
  definition: ToolDefinition; // OpenAI Tool Definition
  handler: (args: any, config?: any) => Promise<string>; // Implementation
}
