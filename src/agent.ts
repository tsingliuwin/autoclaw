import OpenAI from 'openai';
import chalk from 'chalk';
import ora from 'ora';
import * as os from 'os';
import * as path from 'path';
import { getToolDefinitions, executeToolHandler } from './tools/index.js';

export class Agent {
  private client: OpenAI;
  private messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  private model: string;
  private config: any;

  constructor(apiKey: string, baseURL: string | undefined, model: string = 'gpt-4-turbo-preview', config: any = {}) {
    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL
    });
    this.model = model;
    this.config = config;

    const systemInfo = `
System Information:
- OS: ${os.type()} ${os.release()} (${os.platform()})
- Architecture: ${os.arch()}
- Node.js Version: ${process.version}
- Current Working Directory: ${process.cwd()}
- User: ${os.userInfo().username}
- Home Directory: ${os.homedir()}
- Current Date: ${new Date().toLocaleString()}
`;

    this.messages = [
      {
        role: "system",
        content: `You are AutoClaw, a Docker-Native Autonomous Agent designed for massive scale automation.
You are likely running inside a container or headless server, possibly as one of thousands of parallel units in a swarm.

CONTEXT:
${systemInfo}

ENVIRONMENT CONSTRAINTS:
1. HEADLESS: No GUI available. Do not try to open browsers or apps.
2. CONTAINER-OPTIMIZED: Assume you are in a sandbox. You can be aggressive with file creation but robust with errors.
3. NON-INTERACTIVE: Always use flags to suppress prompts (e.g., 'apt-get -y', 'rm -rf').

GUIDELINES:
1. EFFICIENCY: Your goal is speed and success. Write scripts that just work.
2. ROBUSTNESS: Use standard Linux/Unix tools found in minimal images (Alpine/Debian).
3. TOOLS: Use 'execute_shell_command' for actions, 'write_file' for code generation.
4. CLARITY: Output concise logs. You are a worker unit, not a chat bot.
`
      }
    ];
  }

  async chat(userInput: string): Promise<void> {
    this.messages.push({ role: "user", content: userInput });

    let active = true;
    while (active) {
      const spinner = ora('Thinking...').start();
      
      try {
        const response = await this.client.chat.completions.create({
            model: this.model,
            messages: this.messages,
            tools: getToolDefinitions() as any,
            tool_choice: "auto"
        });

        spinner.stop();
        
        const message = response.choices[0].message;
        this.messages.push(message);

        if (message.content) {
          console.log(chalk.blue("AutoClaw: ") + message.content);
        }

        if (message.tool_calls) {
          for (const toolCall of message.tool_calls) {
            if (toolCall.type !== 'function') continue;
            
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);
            
            console.log(chalk.gray(`Executing tool: ${functionName}...`));
            
            // Pass the full config to the tool handler
            const toolResult = await executeToolHandler(functionName, functionArgs, this.config);
            
            this.messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: toolResult
            });
          }
        } else {
          active = false;
        }

      } catch (error: any) {
        spinner.fail('Error during processing');
        console.error(chalk.red(error.message));
        active = false;
      }
    }
  }
}
