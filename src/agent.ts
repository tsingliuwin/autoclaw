import OpenAI from 'openai';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as util from 'util';
import { getToolDefinitions, executeToolHandler, listUnavailableTools } from './tools/index.js';
import { withRetry } from './retry.js';
import { truncateOutput } from './truncate.js';
import { buildShellInfo, resolveShellType } from './shell.js';
import { buildSkillsManifest } from './skills.js';

const DEFAULT_MAX_STEPS = 25;
const TOOL_RESULT_TRIM_MARKER = 'older tool output trimmed';

// Canonical JSON: sorted object keys, so equivalent arguments from
// different model turns map to the same repeat signature.
function canonicalArgs(args: any): string {
  try {
    return JSON.stringify(args, (_key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value).sort().reduce((acc: any, k) => { acc[k] = value[k]; return acc; }, {});
      }
      return value;
    });
  } catch {
    return String(args);
  }
}

export interface AgentUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface AgentRunResult {
  status: 'completed' | 'error' | 'max_steps' | 'timeout';
  steps: number;
  error?: string;
  message?: string | null;
  usage?: AgentUsage;
}

export class Agent {
  private client: OpenAI;
  private messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  private model: string;
  private config: any;
  public lastOutputFile: string | null = null;

  constructor(apiKey: string, baseURL: string | undefined, model: string = 'gpt-5.6', config: any = {}) {
    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL
    });
    this.model = model;
    this.config = config;

    const shellType = resolveShellType(config);

    const systemInfo = `
System Information:
- OS: ${os.type()} ${os.release()} (${os.platform()})
- Shell: ${buildShellInfo(shellType)}
- Architecture: ${os.arch()}
- Node.js Version: ${process.version}
- Current Working Directory: ${process.cwd()}
- User: ${os.userInfo().username}
- Home Directory: ${os.homedir()}
- Current Date: ${new Date().toLocaleString()}
`;
    const shellRule = shellType === 'cmd'
      ? `\n8. Mind the shell noted above: on Windows it is cmd.exe, not bash — && only, no \$(...) substitution, no mkdir -p, GBK output possible; prefer powershell -Command "..." for system queries.`
      : shellType === 'powershell'
        ? `\n8. The shell is Windows PowerShell: use PowerShell syntax — \$( ) works, but && does not in Windows PowerShell 5; use ; or separate tool calls instead.`
        : '';

    // Every turn resends every tool definition, so unconfigured capabilities
    // are dropped from both the tool array and this capability list.
    const unavailable = listUnavailableTools(config);
    const has = (tool: string) => !unavailable.includes(tool);
    const capabilities = [
      '- Shell: execute_shell_command — run scripts, install packages, manage processes, interact with the OS',
      '- Files: read_file / write_file — inspect logs, generate configs, produce reports',
      has('web_search') ? '- Web: web_search — real-time information lookup' : null,
      has('read_website') ? '- Web: read_website — extract article content from a URL' : null,
      has('take_screenshot') ? '- Web: take_screenshot — capture page visuals' : null,
      has('start_background_process') ? '- Processes: start_background_process / check_background_process / stop_background_process — run long-lived commands (servers, watchers) in the background and poll their output' : null,
      has('send_email') ? '- Communication: send_email — SMTP email delivery' : null,
      has('send_notification') ? '- Communication: send_notification — push to Feishu/DingTalk/WeCom' : null,
      has('generate_image') ? '- Creation: generate_image — AI image generation (DALL-E compatible)' : null,
      has('optimize_prompt') ? '- Creation: optimize_prompt — refine raw prompts for creative/complex tasks (recommended before creative work)' : null,
      '- Utility: get_current_datetime — accurate system time for temporal reasoning'
    ].filter((line): line is string => line !== null).join('\n');

    // Skills ride along as one-line manifest entries; the body is only read
    // (via read_file) when a task actually matches. Never break startup on
    // a malformed skill directory.
    let skillsManifest: string | null = null;
    try {
      skillsManifest = buildSkillsManifest(config);
    } catch {
      skillsManifest = null;
    }
    const skillsBlock = skillsManifest ? `\n${skillsManifest}\n` : '';

    this.messages = [
      {
        role: "system",
        content: `You are AutoClaw, a lightweight AI agent that operates directly in the terminal. You accomplish tasks by executing shell commands, reading and writing files, and using integrated tools — no GUI, no guesswork, deterministic results.

You may be running on a developer workstation, a headless server, inside a Docker container, or in a CI/CD pipeline. Adapt accordingly.

${systemInfo}

WHAT YOU CAN DO:
${capabilities}
${skillsBlock}
RULES OF ENGAGEMENT:
1. One shot, not one chat. Produce working results, not conversation. Be terse.
2. Use the right tool for the job. Shell for system ops. Files for content. Web tools for external info.
3. Always pass non-interactive flags: --yes for npx, -y for apt/apk, -f for rm, etc. Assume no human is watching. Set GIT_TERMINAL_PROMPT=0 for git commands that may need credentials so they fail fast instead of hanging.
4. Container-friendly: stick to standard Unix tools available in Alpine/Debian slim images. No GUI apps, no browser-based debug tools.
5. For creative or complex tasks (image prompts, long-form writing, intricate scripts): call optimize_prompt first. It significantly raises output quality.
6. If a command fails, diagnose and try one alternative. Don't retry the same thing, don't give up on first error.
7. Read before write. When modifying a file, read it first. When installing a package, check if it's already there.${shellRule}
`
      }
    ];
  }

  private get jsonMode(): boolean {
    return !!this.config?.jsonMode;
  }

  private emitEvent(event: Record<string, unknown>) {
    if (this.jsonMode) console.log(JSON.stringify(event));
  }

  // Tool handlers print progress via console; in JSON mode stdout is an NDJSON
  // contract, so route those prints to stderr for the duration of the call.
  private async runToolQuietly(run: () => Promise<string>): Promise<string> {
    const original = [console.log, console.info, console.warn, console.error];
    const toStderr = (...args: unknown[]) => process.stderr.write(util.format(...args) + '\n');
    [console.log, console.info, console.warn, console.error] = [toStderr, toStderr, toStderr, toStderr] as any;
    try {
      return await run();
    } finally {
      [console.log, console.info, console.warn, console.error] = original;
    }
  }

  async chat(userInput: string): Promise<AgentRunResult> {
    this.messages.push({ role: "user", content: userInput });

    const maxSteps = Number(this.config?.maxSteps || process.env.AUTOCLOW_MAX_STEPS || DEFAULT_MAX_STEPS);
    const taskTimeoutMs = Number(this.config?.taskTimeoutMs || process.env.AUTOCLOW_TASK_TIMEOUT_MS || 0);
    const deadline = taskTimeoutMs > 0 ? Date.now() + taskTimeoutMs : Number.POSITIVE_INFINITY;
    const abortController = new AbortController();
    const abortTimer = taskTimeoutMs > 0
      ? setTimeout(
          () => abortController.abort(new Error(`task wall-clock timeout after ${taskTimeoutMs}ms`)),
          taskTimeoutMs
        )
      : null;
    const startedAt = Date.now();
    let active = true;
    let step = 0;
    let status: AgentRunResult['status'] = 'completed';
    let errorMessage: string | undefined;
    let lastContent: string | null = null;
    let lastToolSignature: string | null = null;
    let consecutiveRepeats = 0;
    const totalUsage: AgentUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let sawUsage = false;

    this.emitEvent({ event: 'run_start', model: this.model, task: userInput });

    while (active) {
      if (step >= maxSteps) {
        status = 'max_steps';
        if (!this.jsonMode) {
          console.log(chalk.yellow(`\n[MaxSteps] Reached the ${maxSteps}-turn limit; stopping to avoid a runaway loop.`));
        }
        break;
      }
      if (Date.now() > deadline) {
        status = 'timeout';
        if (!this.jsonMode) {
          console.log(chalk.yellow(`\n[TaskTimeout] Wall-clock limit of ${taskTimeoutMs}ms reached; stopping.`));
        }
        break;
      }
      this.trimOldToolResults();
      step++;
      const spinner: any = this.jsonMode
        ? { stop() {}, fail() {}, text: '' }
        : ora('Thinking...').start();

      let stream: AsyncIterable<any>;
      try {
        // Retries cover request setup and the header phase; a failure after
        // the stream started yielding chunks is not retried, because partial
        // output may already have been printed.
        stream = await withRetry(
          async () => this.client.chat.completions.create({
              model: this.model,
              messages: this.messages,
              tools: getToolDefinitions(this.config) as any,
              tool_choice: "auto",
              stream: true,
              // Not every OpenAI-compatible provider accepts stream_options;
              // usage tracking is therefore opt-in only.
              ...(this.config?.includeUsage ? { stream_options: { include_usage: true } } : {})
          }, { signal: abortController.signal }) as unknown as AsyncIterable<any>,
          {
            onRetry: (err, nextAttempt, delayMs) => {
              spinner.text = `API error (${err.message}); retrying in ${Math.round(delayMs / 1000)}s (attempt ${nextAttempt})...`;
            }
          }
        );
      } catch (error: any) {
        spinner.fail('Error during processing');
        if (!this.jsonMode) console.error(chalk.red(error.message));
        if (abortController.signal.aborted) {
          status = 'timeout';
          errorMessage = `task wall-clock timeout after ${taskTimeoutMs}ms`;
        } else {
          status = 'error';
          errorMessage = error.message;
        }
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
          if (chunk.usage) {
            sawUsage = true;
            totalUsage.prompt_tokens += chunk.usage.prompt_tokens ?? 0;
            totalUsage.completion_tokens += chunk.usage.completion_tokens ?? 0;
            totalUsage.total_tokens += chunk.usage.total_tokens ?? 0;
          }
          const delta = chunk.choices[0]?.delta as any;

          // Handle reasoning/thinking content (e.g., DeepSeek)
          if (delta?.reasoning_content) {
            if (!reasoningStarted) {
              spinner.stop();
              if (!this.jsonMode) {
                process.stdout.write(chalk.dim('\n[Thinking] '));
              }
              reasoningStarted = true;
            }
            if (!this.jsonMode) {
              process.stdout.write(chalk.dim(delta.reasoning_content));
            }
            reasoningContent += delta.reasoning_content;
          }

          // Handle regular content
          if (delta?.content) {
            if (!contentStarted) {
              spinner.stop();
              if (!this.jsonMode) {
                if (reasoningStarted) process.stdout.write('\n');
                process.stdout.write(chalk.blue("AutoClaw: "));
              }
              contentStarted = true;
            }
            if (!this.jsonMode) {
              process.stdout.write(delta.content);
            }
            content += delta.content;
          }

          // Handle tool calls
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCalls[idx]) {
                toolCalls[idx] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } };
              }
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;

              if (tc.function?.name && !toolNamesSeen.has(idx)) {
                toolNamesSeen.add(idx);
                spinner.stop();
                if (!this.jsonMode) {
                  if (contentStarted) process.stdout.write('\n');
                  if (reasoningStarted && !contentStarted) process.stdout.write('\n');
                  process.stdout.write(chalk.cyan(`[Calling] ${tc.function.name}\n`));
                }
              }
            }
          }
        }
      } catch (error: any) {
        spinner.fail('Error during processing');
        if (!this.jsonMode) console.error(chalk.red(error.message));
        if (abortController.signal.aborted) {
          status = 'timeout';
          errorMessage = `task wall-clock timeout after ${taskTimeoutMs}ms`;
        } else {
          status = 'error';
          errorMessage = error.message;
        }
        active = false;
        break;
      }

      if (!this.jsonMode) {
        if (reasoningStarted) console.log(); // newline after reasoning
        if (contentStarted) console.log(); // newline after streamed content
        if (!reasoningStarted && !contentStarted) spinner.stop();
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
      if (content) lastContent = content;

      if (toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          if (toolCall.type !== 'function') continue;

          const functionName = toolCall.function.name;
          let functionArgs: any;
          try {
            functionArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch (parseError: any) {
            // Feed the failure back so the model can correct itself next turn
            if (!this.jsonMode) {
              console.log(chalk.red(`\n[Tool] ${functionName} — malformed arguments (not valid JSON)`));
            }
            this.messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: `Error: arguments for ${functionName} were not valid JSON (${parseError.message}). Re-issue the tool call with well-formed JSON arguments.`
            });
            continue;
          }

          if (this.jsonMode) {
            this.emitEvent({ event: 'tool_call', step, tool: functionName, args: functionArgs });
          } else {
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
          }

          let toolResult: string;
          try {
            const run = () => executeToolHandler(functionName, functionArgs, this.config);
            toolResult = this.jsonMode ? await this.runToolQuietly(run) : await run();
          } catch (err: any) {
            toolResult = `Error: ${err.message}`;
          }

          // Bound what goes back into the model context; the full output is
          // kept on disk for /view.
          const MAX_PREVIEW_LINES = 20;
          const truncation = truncateOutput(toolResult);
          const boundedResult = truncation.content;
          const resultLines = boundedResult.split('\n');

          // Loop hygiene (idea from dsh repeat-tool-reminder): identical
          // consecutive calls get an escalating reminder so the model changes
          // approach early instead of burning turns until the step cap.
          const signature = `${functionName}:${canonicalArgs(functionArgs)}`;
          if (signature === lastToolSignature) consecutiveRepeats++;
          else { consecutiveRepeats = 1; lastToolSignature = signature; }
          const repeatSuffix = consecutiveRepeats < 3
            ? ''
            : consecutiveRepeats < 5
              ? `\n[AutoClaw] Note: this is the ${consecutiveRepeats}th identical ${functionName} call in a row. If it keeps returning the same result, change approach instead of repeating it.`
              : `\n[AutoClaw] You have now made the identical ${functionName} call ${consecutiveRepeats} times in a row (arguments: ${JSON.stringify(functionArgs).slice(0, 120)}). This exact call keeps returning the same result. Stop retrying it: change approach, fix the underlying problem, or finish the task with what you already have.`;
          let outputFile: string | null = null;

          if (resultLines.length > MAX_PREVIEW_LINES || truncation.truncated) {
            outputFile = await this.saveOutput(functionName, toolResult);
            this.lastOutputFile = outputFile;
            if (!this.jsonMode) {
              console.log(chalk.green(`[Result]`));
              console.log(resultLines.slice(0, MAX_PREVIEW_LINES).join('\n'));
              const remaining = resultLines.length - MAX_PREVIEW_LINES;
              if (remaining > 0) {
                console.log(chalk.dim(`\n  ... ${remaining} more lines (${resultLines.length} lines total)`));
              }
              console.log(chalk.dim(`  Type '/view' to see full output`));
            }
          } else if (!this.jsonMode) {
            console.log(chalk.green(`[Result]`));
            console.log(boundedResult);
            this.lastOutputFile = null;
          }

          if (this.jsonMode) {
            this.emitEvent({
              event: 'tool_result',
              step,
              tool: functionName,
              truncated: truncation.truncated,
              bytes: truncation.totalBytes,
              ...(outputFile ? { output_file: outputFile } : {})
            });
          }

          this.messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: boundedResult + repeatSuffix
          });
        }
      } else {
        active = false;
      }

      if (sawUsage) {
        this.emitEvent({ event: 'usage', step, ...totalUsage });
      }
    }

    if (abortTimer) clearTimeout(abortTimer);

    const result: AgentRunResult = {
      status,
      steps: step,
      message: lastContent,
      ...(errorMessage ? { error: errorMessage } : {}),
      ...(sawUsage ? { usage: totalUsage } : {})
    };
    this.appendRunLog(userInput, result, startedAt);
    this.emitEvent({ event: 'run_end', ...result });
    return result;
  }

  // Best-effort local run history: ~/.autoclaw/logs/runs.jsonl, one line
  // per run, for post-hoc debugging of unattended batches. Logging must
  // never fail a run.
  private appendRunLog(userInput: string, result: AgentRunResult, startedAt: number): void {
    try {
      const dir = path.join(os.homedir(), '.autoclaw', 'logs');
      fs.mkdirSync(dir, { recursive: true });
      const line = JSON.stringify({
        time: new Date().toISOString(),
        model: this.model,
        task: String(userInput).slice(0, 200),
        status: result.status,
        steps: result.steps,
        ...(result.error ? { error: result.error.slice(0, 300) } : {}),
        ...(result.usage ? { usage: result.usage } : {}),
        durationMs: Date.now() - startedAt
      });
      fs.appendFileSync(path.join(dir, 'runs.jsonl'), line + '\n');
    } catch {
      // ignore
    }
  }

  // Every turn resends the full history, so early large tool results
  // dominate context growth. Keep the most recent results intact and bound
  // older ones to a short excerpt (full output stays on disk via /view when
  // it was large enough to be saved).
  private trimOldToolResults(): void {
    const toolIndexes: number[] = [];
    this.messages.forEach((m, i) => {
      if ((m as any).role === 'tool') toolIndexes.push(i);
    });
    const cutoff = toolIndexes.length - 3;
    for (let k = 0; k < cutoff; k++) {
      const msg: any = this.messages[toolIndexes[k]];
      if (typeof msg.content === 'string' && msg.content.length > 512 && !msg.content.includes(TOOL_RESULT_TRIM_MARKER)) {
        const original = msg.content.length;
        msg.content = `${msg.content.slice(0, 256)}\n[${TOOL_RESULT_TRIM_MARKER}: ${original} bytes total; re-run the tool if you need the full output again]`;
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
