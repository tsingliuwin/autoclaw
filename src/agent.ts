import OpenAI from 'openai';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getToolDefinitions, executeToolHandler } from './tools/index.js';
import { withRetry } from './retry.js';

const DEFAULT_MAX_STEPS = 25;

export class Agent {
  private client: OpenAI;
  private messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  private model: string;
  private config: any;
  public lastOutputFile: string | null = null;

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
        content: `You are AutoClaw, a lightweight AI agent that operates directly in the terminal. You accomplish tasks by executing shell commands, reading and writing files, and using integrated tools — no GUI, no guesswork, deterministic results.

You may be running on a developer workstation, a headless server, inside a Docker container, or in a CI/CD pipeline. Adapt accordingly.

${systemInfo}

WHAT YOU CAN DO:
- Shell: execute_shell_command — run scripts, install packages, manage processes, interact with the OS
- Files: read_file / write_file — inspect logs, generate configs, produce reports
- Web: web_search — real-time information lookup; read_website — extract article content; take_screenshot — capture page visuals
- Communication: send_email — SMTP email delivery; send_notification — push to Feishu/DingTalk/WeCom
- Creation: generate_image — AI image generation (DALL-E compatible); optimize_prompt — refine raw prompts for creative/complex tasks
- Utility: get_current_datetime — accurate system time for temporal reasoning

RULES OF ENGAGEMENT:
1. One shot, not one chat. Produce working results, not conversation. Be terse.
2. Use the right tool for the job. Shell for system ops. Files for content. Web tools for external info.
3. Always pass non-interactive flags: --yes for npx, -y for apt/apk, -f for rm, etc. Assume no human is watching.
4. Container-friendly: stick to standard Unix tools available in Alpine/Debian slim images. No GUI apps, no browser-based debug tools.
5. For creative or complex tasks (image prompts, long-form writing, intricate scripts): call optimize_prompt first. It significantly raises output quality.
6. If a command fails, diagnose and try one alternative. Don't retry the same thing, don't give up on first error.
7. Read before write. When modifying a file, read it first. When installing a package, check if it's already there.
`
      }
    ];
  }

  async chat(userInput: string): Promise<void> {
    this.messages.push({ role: "user", content: userInput });

    const maxSteps = Number(this.config?.maxSteps || process.env.AUTOCLOW_MAX_STEPS || DEFAULT_MAX_STEPS);
    let active = true;
    let step = 0;
    while (active) {
      step++;
      if (step > maxSteps) {
        console.log(chalk.yellow(`\n[MaxSteps] Reached the ${maxSteps}-turn limit; stopping to avoid a runaway loop.`));
        break;
      }
      const spinner = ora('Thinking...').start();

      let stream: AsyncIterable<any>;
      try {
        // Retries cover request setup and the header phase; a failure after
        // the stream started yielding chunks is not retried, because partial
        // output may already have been printed.
        stream = await withRetry(
          async () => this.client.chat.completions.create({
              model: this.model,
              messages: this.messages,
              tools: getToolDefinitions() as any,
              tool_choice: "auto",
              stream: true
          }) as unknown as AsyncIterable<any>,
          {
            onRetry: (err, nextAttempt, delayMs) => {
              spinner.text = `API error (${err.message}); retrying in ${Math.round(delayMs / 1000)}s (attempt ${nextAttempt})...`;
            }
          }
        );
      } catch (error: any) {
        spinner.fail('Error during processing');
        console.error(chalk.red(error.message));
        active = false;
        break;
      }

      let content = '';
      let reasoningContent = '';
      let toolCalls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] = [];
      let contentStarted = false;
      let reasoningStarted = false;
      const toolNamesSeen = new Set<number>();

      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta as any;

          // Handle reasoning/thinking content (e.g., DeepSeek)
          if (delta?.reasoning_content) {
            if (!reasoningStarted) {
              spinner.stop();
              process.stdout.write(chalk.dim('\n[Thinking] '));
              reasoningStarted = true;
            }
            process.stdout.write(chalk.dim(delta.reasoning_content));
            reasoningContent += delta.reasoning_content;
          }

          // Handle regular content
          if (delta?.content) {
            if (!contentStarted) {
              spinner.stop();
              if (reasoningStarted) process.stdout.write('\n');
              process.stdout.write(chalk.blue("AutoClaw: "));
              contentStarted = true;
            }
            process.stdout.write(delta.content);
            content += delta.content;
          }

          // Handle tool calls - show name as soon as available
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCalls[idx]) {
                toolCalls[idx] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } };
              }
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;

              // Show tool name as soon as it's complete
              if (tc.function?.name && !toolNamesSeen.has(idx)) {
                toolNamesSeen.add(idx);
                spinner.stop();
                if (contentStarted) process.stdout.write('\n');
                if (reasoningStarted && !contentStarted) process.stdout.write('\n');
                process.stdout.write(chalk.cyan(`[Calling] ${tc.function.name}\n`));
              }
            }
          }
        }
      } catch (error: any) {
        spinner.fail('Error during processing');
        console.error(chalk.red(error.message));
        active = false;
        break;
      }

      if (reasoningStarted) {
        console.log(); // newline after reasoning
      }
      if (contentStarted) {
        console.log(); // newline after streamed content
      }
      if (!reasoningStarted && !contentStarted) {
        spinner.stop();
      }

      // Build the full message for history
      const message: any = { role: "assistant" };
      if (content) message.content = content;
      if (reasoningContent) message.reasoning_content = reasoningContent;
      if (toolCalls.length > 0) {
        message.tool_calls = toolCalls;
        message.content = message.content || null;
      }
      this.messages.push(message);

      if (toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          if (toolCall.type !== 'function') continue;

          const functionName = toolCall.function.name;
          let functionArgs: any;
          try {
            functionArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch (parseError: any) {
            // Feed the failure back so the model can correct itself next turn
            console.log(chalk.red(`\n[Tool] ${functionName} — malformed arguments (not valid JSON)`));
            this.messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: `Error: arguments for ${functionName} were not valid JSON (${parseError.message}). Re-issue the tool call with well-formed JSON arguments.`
            });
            continue;
          }

          // Display tool call info
          console.log(chalk.cyan(`\n[Tool] ${functionName}`));
          const argsStr = JSON.stringify(functionArgs, null, 2);
          const argsLines = argsStr.split('\n');
          if (argsLines.length > 8) {
            console.log(chalk.dim(argsLines.slice(0, 8).join('\n')));
            console.log(chalk.dim(`  ... (${argsLines.length - 8} more lines)`));
          } else {
            console.log(chalk.dim(argsStr));
          }

          const execSpinner = ora('Executing...').start();
          let toolResult: string;
          try {
            toolResult = await executeToolHandler(functionName, functionArgs, this.config);
            execSpinner.stop();
          } catch (err: any) {
            execSpinner.fail('Tool execution failed');
            toolResult = `Error: ${err.message}`;
          }

          // Display result with folding for long output
          const MAX_PREVIEW_LINES = 20;
          const resultLines = toolResult.split('\n');

          console.log(chalk.green(`[Result]`));

          if (resultLines.length > MAX_PREVIEW_LINES) {
            // Show preview
            console.log(resultLines.slice(0, MAX_PREVIEW_LINES).join('\n'));
            const remaining = resultLines.length - MAX_PREVIEW_LINES;
            console.log(chalk.dim(`\n  ... ${remaining} more lines (${resultLines.length} lines total)`));

            // Save full output to file
            const outputFile = await this.saveOutput(functionName, toolResult);
            console.log(chalk.dim(`  Type '/view' to see full output`));
            this.lastOutputFile = outputFile;
          } else {
            console.log(toolResult);
            this.lastOutputFile = null;
          }

          this.messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult
          });
        }
      } else {
        active = false;
      }

    }
  }

  private async saveOutput(functionName: string, toolResult: string): Promise<string> {
    const outputDir = path.join(os.homedir(), '.autoclaw', 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(outputDir, `${functionName}_${ts}.txt`);
    fs.writeFileSync(outputFile, toolResult, 'utf-8');
    return outputFile;
  }
}
