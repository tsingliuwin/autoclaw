#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { Agent } from './agent.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

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

interface AppConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  tavilyApiKey?: string;
  autoConfirm?: boolean;
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

// Load local env vars (lowest priority of env vars, but env vars override JSON)
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In dist/index.js, package.json is usually up one level in the root
const pkgPath = path.join(__dirname, '..', 'package.json');
let version = '1.0.2';

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
  .option('-n, --no-interactive', 'Exit after processing the initial query (Headless mode)')
  .option('-y, --yes', 'Auto-confirm all tool executions (e.g., shell commands)');

program
  .command('setup')
  .description('Run the interactive setup wizard to configure API keys')
  .action(async () => {
    await runSetup();
  });

program
  .command('chat [query...]', { isDefault: true })
  .description('Start the AI agent (default)')
  .action(async (queryParts) => {
    const options = program.opts();
    await runChat(queryParts, options);
  });

program.parse(process.argv);

async function runSetup() {
  console.log(chalk.bold.cyan("AutoClaw Setup Wizard 🦞\n"));
  console.log(chalk.dim(`Config will be saved to: ${GLOBAL_CONFIG_FILE}`));

  const currentConfig = loadJsonConfig(GLOBAL_CONFIG_FILE);

  function maskSecret(secret?: string): string {
    if (!secret || secret.length < 8) return '******';
    return `${secret.slice(0, 3)}...${secret.slice(-4)}`;
  }

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
      default: currentConfig.baseUrl || 'https://api.openai.com/v1'
    },
    {
      type: 'input',
      name: 'model',
      message: 'Enter default Model:',
      default: currentConfig.model || 'gpt-4o'
    },
    {
      type: 'confirm',
      name: 'configureEmail',
      message: 'Do you want to configure the Email Tool (SMTP)?',
      default: !!currentConfig.smtpHost
    },
    {
      type: 'confirm',
      name: 'configureSearch',
      message: 'Do you want to configure Web Search (Tavily)?',
      default: !!currentConfig.tavilyApiKey
    },
    {
      type: 'confirm',
      name: 'configureNotify',
      message: 'Do you want to configure Group Bots (Feishu/DingTalk/WeCom)?',
      default: !!(currentConfig.feishuWebhook || currentConfig.dingtalkWebhook || currentConfig.wecomWebhook)
    }
  ]);

  // Resolve sensitive values (Keep old if empty)
  const finalApiKey = answers.apiKey || currentConfig.apiKey;

  let emailConfig: any = {};
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

  let searchConfig: any = {};
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

  let notifyConfig: any = {};
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
    ...emailConfig,
    ...searchConfig,
    ...notifyConfig
  };

  try {
    if (!fs.existsSync(GLOBAL_CONFIG_DIR)) {
      fs.mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(GLOBAL_CONFIG_FILE, JSON.stringify(newConfig, null, 2), { mode: 0o600 });
    console.log(chalk.green(`\n✅ Configuration saved to ${GLOBAL_CONFIG_FILE}`));
    console.log(chalk.cyan("You can now run 'autoclaw' to start using the agent."));
  } catch (error: any) {
    console.error(chalk.red(`Failed to write config: ${error.message}`));
  }
}

async function runChat(queryParts: string[], options: any) {
  if (options.interactive) {
    console.log(chalk.bold.cyan("Welcome to AutoClaw CLI 🦞"));
  }
  
  const initialQuery = queryParts.join(' ');
  
  // 1. Load Global JSON
  const globalConfig = loadJsonConfig(GLOBAL_CONFIG_FILE);

  // 2. Load Local JSON (Project Level)
  const localConfig = loadJsonConfig(LOCAL_CONFIG_FILE);
  if (Object.keys(localConfig).length > 0 && options.interactive) {
    console.log(chalk.dim(`Loaded project config from ${LOCAL_CONFIG_FILE}`));
  }
  
  // 3. Merge Configs for Tool Usage
  // Priority: Local > Global
  const fullConfig = { ...globalConfig, ...localConfig };

  // 4. Resolve Env Vars (CLI > Env > Config)
  let apiKey = process.env.OPENAI_API_KEY || fullConfig.apiKey;
  let baseURL = process.env.OPENAI_BASE_URL || fullConfig.baseUrl;
  let model = options.model || process.env.OPENAI_MODEL || fullConfig.model || 'gpt-4o';
  
  // Inject Runtime Flags
  fullConfig.autoConfirm = options.yes;

  // Inject Env vars
  if (process.env.SMTP_HOST) fullConfig.smtpHost = process.env.SMTP_HOST;
  if (process.env.SMTP_PORT) fullConfig.smtpPort = process.env.SMTP_PORT;
  if (process.env.SMTP_User) fullConfig.smtpUser = process.env.SMTP_USER;
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
      apiKey = newConfig.apiKey;
      baseURL = newConfig.baseUrl;
      model = options.model || newConfig.model || 'gpt-4o';
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

  const agent = new Agent(apiKey!, baseURL, model, fullConfig);
  
  if (options.interactive) {
    console.log(chalk.green(`Agent initialized with model: ${model}`));
    console.log(chalk.gray("Type 'exit' or 'quit' to leave."));
  }

  // Handle initial query if present
  if (initialQuery) {
    if (options.interactive) {
        console.log(chalk.blue("\nProcessing initial request: ") + chalk.bold(initialQuery));
    }
    await agent.chat(initialQuery);
    
    // Headless mode exit
    if (!options.interactive) {
      process.exit(0);
    }
  }

  // Main chat loop
  try {
    while (true) {
      const { userInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'userInput',
          message: 'You >'
        }
      ]);

      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        console.log(chalk.cyan("Goodbye!"));
        break;
      }

      if (userInput.trim() === '') continue;

      await agent.chat(userInput);
    }
  } catch (err: any) {
    // Check for Inquirer interruption error (Ctrl+C often causes this)
    if (err.message && (err.message.includes('User force closed') || err.message.includes('Prompt was canceled'))) {
       console.log(chalk.cyan("\nGoodbye!"));
       process.exit(0);
    }
    throw err; // Re-throw real errors to be caught by main().catch
  }
}

// Global error handler
main().catch(err => {
  if (err.message && (err.message.includes('User force closed') || err.message.includes('Prompt was canceled'))) {
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
