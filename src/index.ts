#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { Agent } from './agent.js';
import { parseManifest, runBatch } from './batch.js';
import type { BatchResult, ManifestEntry, ResumeState } from './batch.js';
import { PROVIDER_PRESETS, providerNames, resolveProvider } from './providers.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'node:readline/promises';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

// Handle Ctrl+C gracefully
function handleExit() {
  console.log(chalk.cyan("\n\nGoodbye! (Interrupted)"));
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
  process.exit(0);
}

process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.autoclaw');
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, 'setting.json');
const LOCAL_CONFIG_FILE = path.join(process.cwd(), '.autoclaw', 'setting.json');
const GLOBAL_ENV_FILE = path.join(GLOBAL_CONFIG_DIR, '.env');

interface AppConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  provider?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  tavilyApiKey?: string;
  imageApiKey?: string;
  imageBaseUrl?: string;
  imageModel?: string;
  imageSize?: string;
  imageQuality?: string;
  imageStyle?: string;
  imageN?: number;
  autoConfirm?: boolean;
  jsonMode?: boolean;
  includeUsage?: boolean;
  maxSteps?: number;
  feishuWebhook?: string;
  feishuKeyword?: string;
  dingtalkWebhook?: string;
  dingtalkKeyword?: string;
  wecomWebhook?: string;
  wecomKeyword?: string;
}

function loadJsonConfig(filePath: string): AppConfig {
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
      console.error(chalk.yellow(`Warning: Failed to parse config file at ${filePath}`));
    }
  }
  return {};
}

// Load env vars only from AutoClaw's own config directory to avoid
// unrelated project/home .env files overriding API settings.
dotenv.config({ path: GLOBAL_ENV_FILE });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In dist/index.js, package.json is usually up one level in the root
const pkgPath = path.join(__dirname, '..', 'package.json');
let version = '1.3.1';

try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  version = pkg.version;
} catch (e) {
  // Fallback if package.json not found in expected location
}

const program = new Command();

program
  .name('autoclaw')
  .description('A lightweight AI agent CLI tool')
  .version(version)
  .option('-m, --model <model>', 'Model to use')
  .option('-P, --provider <name>', 'Use a provider preset (openai, deepseek, moonshot, dashscope, zhipu, openrouter, ollama)')
  .option('-n, --no-interactive', 'Exit after processing the initial query (Headless mode)')
  .option('-y, --yes', 'Auto-confirm all tool executions (e.g., shell commands)')
  .option('--json', 'Emit NDJSON events on stdout (for orchestrators; use with -n)');

program
  .command('setup')
  .description('Run the interactive setup wizard to configure API keys')
  .option('-p, --project', 'Save configuration to project-level (.autoclaw/setting.json)')
  .action(async (options) => {
    await runSetup(options);
  });

program
  .command('chat [query...]', { isDefault: true })
  .description('Start the AI agent (default)')
  .action(async (queryParts) => {
    const options = program.opts();
    await runChat(queryParts, options);
  });

program
  .command('batch <manifest>')
  .description('Run tasks from a JSONL manifest, each in a fresh agent ({"id":"...","task":"..."})')
  .option('-o, --output <file>', 'Per-task results as JSONL (default: <manifest base>.results.jsonl)')
  .option('--fail-fast', 'Stop on the first failed task')
  .option('--resume', 'Skip tasks already completed in the results file')
  .option('-c, --concurrency <n>', 'Max tasks to run in parallel (default: 1)')
  .action(async (manifest, cmdOptions) => {
    const options = program.opts();
    await runBatchCommand(manifest, options, cmdOptions);
  });

program.parse(process.argv);

async function runSetup(options: any = {}) {
  const isProject = options.project;
  const targetFile = isProject ? LOCAL_CONFIG_FILE : GLOBAL_CONFIG_FILE;
  const targetDir = isProject ? path.join(process.cwd(), '.autoclaw') : GLOBAL_CONFIG_DIR;

  console.log(chalk.bold.cyan("AutoClaw Setup Wizard 🦞\n"));
  console.log(chalk.dim(`Config will be saved to: ${targetFile}`));

  // Load both to show current effective values as defaults
  const globalConfig = loadJsonConfig(GLOBAL_CONFIG_FILE);
  const localConfig = loadJsonConfig(LOCAL_CONFIG_FILE);
  // If setting up Global (default), prioritize Global values for display, falling back to Local.
  // If setting up Project, prioritize Project values (standard effective config).
  const currentConfig = isProject 
    ? { ...globalConfig, ...localConfig }
    : { ...localConfig, ...globalConfig };

  function maskSecret(secret?: string): string {
    if (!secret || secret.length < 8) return '******';
    return `${secret.slice(0, 3)}...${secret.slice(-4)}`;
  }

  const providerAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Select your LLM provider:',
      choices: [
        ...providerNames().map((name) => ({ name: `${PROVIDER_PRESETS[name].label} (${name})`, value: name })),
        { name: 'Custom OpenAI-compatible endpoint', value: 'custom' }
      ],
      default: currentConfig.provider || 'openai'
    }
  ]);
  const provider: string = providerAnswer.provider;
  const preset = resolveProvider(provider === 'custom' ? undefined : provider);

  const answers = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: currentConfig.apiKey 
        ? `Enter OpenAI API Key (Leave empty to keep ${maskSecret(currentConfig.apiKey)}):`
        : 'Enter OpenAI API Key:',
      mask: '*',
      validate: (input) => {
        if (input.length > 0) return true;
        if (currentConfig.apiKey) return true;
        return 'API Key cannot be empty.';
      }
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Enter API Base URL:',
      default: currentConfig.baseUrl || preset?.baseUrl || 'https://api.openai.com/v1'
    },
    {
      type: 'input',
      name: 'model',
      message: 'Enter default Model:',
      default: currentConfig.model || preset?.defaultModel || 'gpt-5.6'
    },
    {
      type: 'confirm',
      name: 'configureImage',
      message: currentConfig.imageApiKey
        ? `Do you want to reconfigure Image Generation (DALL-E)? (current: ${maskSecret(currentConfig.imageApiKey)})`
        : 'Do you want to configure a separate Image Generation Service (DALL-E)?',
      default: false
    },
    {
      type: 'confirm',
      name: 'configureEmail',
      message: currentConfig.smtpHost
        ? `Do you want to reconfigure Email (SMTP)? (current: ${currentConfig.smtpUser}@${currentConfig.smtpHost})`
        : 'Do you want to configure the Email Tool (SMTP)?',
      default: false
    },
    {
      type: 'confirm',
      name: 'configureSearch',
      message: currentConfig.tavilyApiKey
        ? `Do you want to reconfigure Web Search (Tavily)? (current: ${maskSecret(currentConfig.tavilyApiKey)})`
        : 'Do you want to configure Web Search (Tavily)?',
      default: false
    },
    {
      type: 'confirm',
      name: 'configureNotify',
      message: (currentConfig.feishuWebhook || currentConfig.dingtalkWebhook || currentConfig.wecomWebhook)
        ? 'Do you want to reconfigure Group Bots (Feishu/DingTalk/WeCom)?'
        : 'Do you want to configure Group Bots (Feishu/DingTalk/WeCom)?',
      default: false
    }
  ]);

  // Resolve sensitive values (Keep old if empty)
  const finalApiKey = answers.apiKey || currentConfig.apiKey;

  let imageConfig: any = {
    imageApiKey: currentConfig.imageApiKey,
    imageBaseUrl: currentConfig.imageBaseUrl,
    imageModel: currentConfig.imageModel
  };
  if (answers.configureImage) {
    const imageAnswers = await inquirer.prompt([
      {
        type: 'password',
        name: 'imageApiKey',
        message: currentConfig.imageApiKey
          ? `Enter Image Service API Key (Leave empty to keep ${maskSecret(currentConfig.imageApiKey)}, or leave empty to use main API key):`
          : 'Enter Image Service API Key (Leave empty to use main API key):',
        mask: '*'
      },
      {
        type: 'input',
        name: 'imageBaseUrl',
        message: 'Enter Image Service Base URL:',
        default: currentConfig.imageBaseUrl || currentConfig.baseUrl || 'https://api.openai.com/v1'
      },
      {
        type: 'input',
        name: 'imageModel',
        message: 'Default Image Model:',
        default: currentConfig.imageModel || 'dall-e-3'
      }
    ]);
    imageConfig = {
      imageApiKey: imageAnswers.imageApiKey || currentConfig.imageApiKey,
      imageBaseUrl: imageAnswers.imageBaseUrl,
      imageModel: imageAnswers.imageModel
    };
  }

  let emailConfig: any = {
    smtpHost: currentConfig.smtpHost,
    smtpPort: currentConfig.smtpPort,
    smtpUser: currentConfig.smtpUser,
    smtpPass: currentConfig.smtpPass,
    smtpFrom: currentConfig.smtpFrom
  };
  if (answers.configureEmail) {
     const emailAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'smtpHost',
        message: 'SMTP Host:',
        default: currentConfig.smtpHost
      },
      {
        type: 'input',
        name: 'smtpPort',
        message: 'SMTP Port:',
        default: currentConfig.smtpPort || '587'
      },
      {
        type: 'input',
        name: 'smtpUser',
        message: 'SMTP Username:',
        default: currentConfig.smtpUser
      },
      {
        type: 'password',
        name: 'smtpPass',
        message: currentConfig.smtpPass
          ? `SMTP Password (Leave empty to keep ${maskSecret(currentConfig.smtpPass)}):`
          : 'SMTP Password:',
        mask: '*',
        validate: (input) => { return true; }
      },
      {
        type: 'input',
        name: 'smtpFrom',
        message: 'Sender Email Address (From):',
        default: currentConfig.smtpFrom || currentConfig.smtpUser
      }
    ]);
    emailConfig = { ...emailAnswers, smtpPass: emailAnswers.smtpPass || currentConfig.smtpPass };
    if (!emailConfig.smtpFrom && emailConfig.smtpUser) { emailConfig.smtpFrom = emailConfig.smtpUser; }
  }

  let searchConfig: any = {
    tavilyApiKey: currentConfig.tavilyApiKey
  };
  if (answers.configureSearch) {
    const searchAnswers = await inquirer.prompt([
      {
        type: 'password',
        name: 'tavilyApiKey',
        message: currentConfig.tavilyApiKey
          ? `Tavily API Key (Leave empty to keep ${maskSecret(currentConfig.tavilyApiKey)}):`
          : 'Tavily API Key (Free at tavily.com):',
        mask: '*'
      }
    ]);
    searchConfig = { tavilyApiKey: searchAnswers.tavilyApiKey || currentConfig.tavilyApiKey };
  }

  let notifyConfig: any = {
    feishuWebhook: currentConfig.feishuWebhook,
    feishuKeyword: currentConfig.feishuKeyword,
    dingtalkWebhook: currentConfig.dingtalkWebhook,
    dingtalkKeyword: currentConfig.dingtalkKeyword,
    wecomWebhook: currentConfig.wecomWebhook,
    wecomKeyword: currentConfig.wecomKeyword
  };
  if (answers.configureNotify) {
    const notifyAnswers = await inquirer.prompt([
      {
        type: 'password',
        name: 'feishuWebhook',
        message: currentConfig.feishuWebhook
          ? `Feishu Webhook (Leave empty to keep ${maskSecret(currentConfig.feishuWebhook)}):`
          : 'Feishu Webhook (Optional):',
        mask: '*'
      },
      {
        type: 'input',
        name: 'feishuKeyword',
        message: 'Feishu Security Keyword (Optional):',
        default: currentConfig.feishuKeyword
      },
      {
        type: 'password',
        name: 'dingtalkWebhook',
        message: currentConfig.dingtalkWebhook
          ? `DingTalk Webhook (Leave empty to keep ${maskSecret(currentConfig.dingtalkWebhook)}):`
          : 'DingTalk Webhook (Optional):',
        mask: '*'
      },
      {
        type: 'input',
        name: 'dingtalkKeyword',
        message: 'DingTalk Security Keyword (Optional):',
        default: currentConfig.dingtalkKeyword
      },
      {
        type: 'password',
        name: 'wecomWebhook',
        message: currentConfig.wecomWebhook
          ? `WeCom Webhook (Leave empty to keep ${maskSecret(currentConfig.wecomWebhook)}):`
          : 'WeCom Webhook (Optional):',
        mask: '*'
      },
      {
        type: 'input',
        name: 'wecomKeyword',
        message: 'WeCom Security Keyword (Optional):',
        default: currentConfig.wecomKeyword
      }
    ]);
    notifyConfig = {
      feishuWebhook: notifyAnswers.feishuWebhook || currentConfig.feishuWebhook,
      feishuKeyword: notifyAnswers.feishuKeyword || currentConfig.feishuKeyword,
      dingtalkWebhook: notifyAnswers.dingtalkWebhook || currentConfig.dingtalkWebhook,
      dingtalkKeyword: notifyAnswers.dingtalkKeyword || currentConfig.dingtalkKeyword,
      wecomWebhook: notifyAnswers.wecomWebhook || currentConfig.wecomWebhook,
      wecomKeyword: notifyAnswers.wecomKeyword || currentConfig.wecomKeyword
    };
  }

  const newConfig: AppConfig = {
    apiKey: finalApiKey,
    baseUrl: answers.baseUrl,
    model: answers.model,
    provider: provider === 'custom' ? undefined : provider,
    ...imageConfig,
    ...emailConfig,
    ...searchConfig,
    ...notifyConfig
  };

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(targetFile, JSON.stringify(newConfig, null, 2), { mode: 0o600 });
    console.log(chalk.green(`\n✅ Configuration saved to ${targetFile}`));
    console.log(chalk.cyan("You can now run 'autoclaw' to start using the agent."));
  } catch (error: any) {
    console.error(chalk.red(`Failed to write config: ${error.message}`));
  }
}

// Shared by `chat` and `batch`: resolve credentials, endpoints and runtime
// flags from CLI args > env > project config > global config > provider preset.
async function resolveRuntime(options: any): Promise<{ apiKey: string; baseURL?: string; model: string; fullConfig: AppConfig }> {
  // 1. Load Global JSON
  const globalConfig = loadJsonConfig(GLOBAL_CONFIG_FILE);

  // 2. Load Local JSON (Project Level)
  const localConfig = loadJsonConfig(LOCAL_CONFIG_FILE);
  if (Object.keys(localConfig).length > 0 && options.interactive) {
    console.log(chalk.dim(`Loaded project config from ${LOCAL_CONFIG_FILE}`));
  }

  // 3. Merge Configs for Tool Usage
  // Priority: Local > Global
  const fullConfig: AppConfig = { ...globalConfig, ...localConfig };

  // 4. Resolve Provider Preset (CLI > Env > Config)
  const providerName = options.provider || process.env.AUTOCLOW_PROVIDER || fullConfig.provider;
  const preset = resolveProvider(providerName);
  if (providerName && !preset) {
    console.log(chalk.yellow(`Unknown provider '${providerName}'. Known providers: ${providerNames().join(', ')}`));
  }

  // 5. Resolve Env Vars (CLI > Env > Config > Provider preset)
  let apiKey = process.env.OPENAI_API_KEY || fullConfig.apiKey || (preset?.apiKeyEnv ? process.env[preset.apiKeyEnv] : undefined);
  let baseURL = process.env.OPENAI_BASE_URL || fullConfig.baseUrl || preset?.baseUrl;
  let model = options.model || process.env.OPENAI_MODEL || fullConfig.model || preset?.defaultModel || 'gpt-5.6';

  // Inject Runtime Flags
  fullConfig.autoConfirm = options.yes;
  fullConfig.jsonMode = !!options.json;
  // Usage tracking is opt-in: not every OpenAI-compatible provider accepts
  // stream_options.include_usage, so never force it on.
  fullConfig.includeUsage =
    !!fullConfig.includeUsage ||
    process.env.AUTOCLOW_INCLUDE_USAGE === '1' ||
    process.env.AUTOCLOW_INCLUDE_USAGE === 'true';

  // Inject Env vars
  if (process.env.SMTP_HOST) fullConfig.smtpHost = process.env.SMTP_HOST;
  if (process.env.SMTP_PORT) fullConfig.smtpPort = process.env.SMTP_PORT;
  if (process.env.SMTP_USER) fullConfig.smtpUser = process.env.SMTP_USER;
  if (process.env.SMTP_PASS) fullConfig.smtpPass = process.env.SMTP_PASS;
  if (process.env.TAVILY_API_KEY) fullConfig.tavilyApiKey = process.env.TAVILY_API_KEY;
  if (process.env.FEISHU_WEBHOOK) fullConfig.feishuWebhook = process.env.FEISHU_WEBHOOK;
  if (process.env.FEISHU_KEYWORD) fullConfig.feishuKeyword = process.env.FEISHU_KEYWORD;
  if (process.env.DINGTALK_WEBHOOK) fullConfig.dingtalkWebhook = process.env.DINGTALK_WEBHOOK;
  if (process.env.DINGTALK_KEYWORD) fullConfig.dingtalkKeyword = process.env.DINGTALK_KEYWORD;
  if (process.env.WECOM_WEBHOOK) fullConfig.wecomWebhook = process.env.WECOM_WEBHOOK;
  if (process.env.WECOM_KEYWORD) fullConfig.wecomKeyword = process.env.WECOM_KEYWORD;

  if (!apiKey) {
    console.log(chalk.yellow("API Key not found."));
    const { doSetup } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'doSetup',
        message: 'Would you like to run the setup wizard now?',
        default: true
      }
    ]);

    if (doSetup) {
      await runSetup();
      const newConfig = loadJsonConfig(GLOBAL_CONFIG_FILE);
      const setupPreset = resolveProvider(newConfig.provider);
      apiKey = newConfig.apiKey || (setupPreset?.apiKeyEnv ? process.env[setupPreset.apiKeyEnv] : undefined);
      baseURL = newConfig.baseUrl || setupPreset?.baseUrl;
      model = options.model || newConfig.model || setupPreset?.defaultModel || 'gpt-5.6';
      Object.assign(fullConfig, newConfig);
    } else {
      console.error(chalk.red("API Key is required to proceed."));
      process.exit(1);
    }
  }

  if (!apiKey) {
     console.error(chalk.red("API Key is still missing. Exiting."));
     process.exit(1);
  }

  return { apiKey, baseURL, model, fullConfig };
}

async function runBatchCommand(manifestPath: string, globalOptions: any, cmdOptions: any) {
  const { apiKey, baseURL, model, fullConfig } = await resolveRuntime(globalOptions);

  let raw: string;
  try {
    raw = fs.readFileSync(manifestPath, 'utf-8');
  } catch (err: any) {
    console.error(chalk.red(`Cannot read manifest ${manifestPath}: ${err.message}`));
    process.exit(1);
  }

  const entries = parseManifest(raw);
  if (entries.length === 0) {
    console.error(chalk.red(`Manifest ${manifestPath} contains no tasks (blank lines and '#' comments are skipped).`));
    process.exit(1);
  }

  const outputPath = cmdOptions.output || manifestPath.replace(/\.[^.]+$/, '') + '.results.jsonl';

  let resumeState: ResumeState | undefined;
  if (cmdOptions.resume) {
    const previousById = new Map<string, BatchResult>();
    const completedIds = new Set<string>();
    if (fs.existsSync(outputPath)) {
      for (const line of fs.readFileSync(outputPath, 'utf-8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const r = JSON.parse(line) as BatchResult;
          if (r?.id) {
            previousById.set(r.id, r);
            if (r.status === 'completed') completedIds.add(r.id);
          }
        } catch {
          // ignore malformed lines in the previous results file
        }
      }
    } else {
      console.log(chalk.yellow(`--resume: no previous results at ${outputPath}; starting fresh.`));
    }
    resumeState = { completedIds, previousById };
  }
  const concurrency = Math.max(1, parseInt(cmdOptions.concurrency ?? '1', 10) || 1);

  console.log(chalk.bold.cyan(`AutoClaw Batch 🦞  ${entries.length} task(s)${concurrency > 1 ? ` (concurrency ${concurrency})` : ''}${resumeState ? ' [resume]' : ''}`));
  console.log(chalk.dim(`Results: ${outputPath}\n`));
  const startedAt = Date.now();

  const { results, completed, failed, skipped } = await runBatch(
    entries,
    async (entry: ManifestEntry): Promise<BatchResult> => {
      // A fresh Agent per task keeps contexts isolated; per-task overrides
      // beat the globally resolved defaults.
      const taskPreset = resolveProvider(entry.provider);
      const taskModel = entry.model || taskPreset?.defaultModel || model;
      const taskBaseURL = taskPreset?.baseUrl || baseURL;
      const taskConfig: AppConfig = {
        ...fullConfig,
        // The results file is the machine-readable contract in batch mode.
        jsonMode: false,
        maxSteps: entry.maxSteps ?? fullConfig.maxSteps
      };
      const agent = new Agent(apiKey, taskBaseURL, taskModel, taskConfig);
      const start = Date.now();
      const runResult = await agent.chat(entry.task);
      return {
        id: entry.id,
        status: runResult.status,
        steps: runResult.steps,
        message: runResult.message ?? null,
        ...(runResult.error ? { error: runResult.error } : {}),
        ...(runResult.usage ? { usage: runResult.usage } : {}),
        durationMs: Date.now() - start
      };
    },
    {
      failFast: !!cmdOptions.failFast,
      concurrency,
      resume: resumeState,
      onResult: (entry, result, done, total) => {
        const color = result.status === 'completed' ? chalk.green : chalk.red;
        console.log(color(`[${done}/${total}] ${entry.id} -> ${result.status} (${Math.round(result.durationMs / 1000)}s)`));
      }
    }
  );

  try {
    fs.writeFileSync(outputPath, results.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
  } catch (err: any) {
    console.error(chalk.red(`Failed to write results to ${outputPath}: ${err.message}`));
    process.exit(1);
  }

  const skipNote = skipped > 0 ? `, ${skipped} skipped (resume)` : '';
  console.log(chalk.cyan(`\nBatch done: ${completed}/${results.length + skipped} completed, ${failed} failed${skipNote} in ${Math.round((Date.now() - startedAt) / 1000)}s -> ${outputPath}`));
  process.exit(failed > 0 ? 1 : 0);
}

async function runChat(queryParts: string[], options: any) {
  if (options.interactive) {
    console.log(chalk.bold.cyan("Welcome to AutoClaw CLI 🦞"));
  }
  
  const initialQuery = queryParts.join(' ');
  
  const { apiKey, baseURL, model, fullConfig } = await resolveRuntime(options);

  const agent = new Agent(apiKey, baseURL, model, fullConfig);
  
  if (options.interactive) {
    console.log(chalk.green(`Agent initialized with model: ${model}`));
    console.log(chalk.gray("Type 'exit' or 'quit' to leave."));
  }

  // Handle initial query if present
  if (initialQuery) {
    if (options.interactive) {
        console.log(chalk.blue("\nProcessing initial request: ") + chalk.bold(initialQuery));
    }
    const result = await agent.chat(initialQuery);

    // Headless mode exit — the exit code is the orchestrator-facing outcome:
    // 0 completed, 1 hard failure, 2 step cap reached (task unfinished).
    if (!options.interactive) {
      process.exit(result.status === 'completed' ? 0 : result.status === 'max_steps' ? 2 : 1);
    }
  }

  // Main chat loop
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  try {
    while (true) {
      const userInput = await rl.question(chalk.green('?') + ' You > ');

      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        console.log(chalk.cyan("Goodbye!"));
        break;
      }

      if (userInput.toLowerCase() === '/view') {
        if (agent.lastOutputFile && fs.existsSync(agent.lastOutputFile)) {
          rl.pause();
          try {
            await new Promise<void>((resolve, reject) => {
              const isWin = process.platform === 'win32';
              const cmd = isWin ? 'more' : (process.env.PAGER || 'less');
              const args = isWin ? [agent.lastOutputFile!] : ['-R', agent.lastOutputFile!];
              const child = spawn(cmd, args, { stdio: 'inherit' });
              child.on('close', () => resolve());
              child.on('error', (err) => {
                console.error(chalk.red(`Failed to open pager: ${err.message}`));
                console.log(chalk.dim(`You can manually view: ${agent.lastOutputFile}`));
                resolve();
              });
            });
          } finally {
            rl.resume();
          }
        } else {
          console.log(chalk.yellow("No tool output to view."));
        }
        continue;
      }

      if (userInput.trim() === '') continue;

      rl.pause();
      try {
        await agent.chat(userInput);
      } finally {
        rl.resume();
      }
    }
  } catch (err: any) {
    if (isUserAbort(err)) {
       console.log(chalk.cyan("\nGoodbye!"));
    } else {
       console.error(chalk.red("Error in chat loop:"), err);
    }
  } finally {
    rl.close();
  }
}

function isUserAbort(err: any): boolean {
  return err.code === 'ABORT_ERR'
    || (err.message && (err.message.includes('User force closed') || err.message.includes('Prompt was canceled')));
}

// Global error handler
main().catch(err => {
  if (isUserAbort(err)) {
    console.log(chalk.cyan("\nGoodbye!"));
    process.exit(0);
  }
  console.error(chalk.red("Fatal Error:"), err);
  process.exit(1);
});

async function main() {
  // Just a wrapper to keep the promise chain clean if needed, 
  // but currently logic is triggered by program.parse()
}
