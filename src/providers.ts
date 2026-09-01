// Provider presets are pure data: every listed provider exposes an
// OpenAI-compatible endpoint, so resolving a preset only needs to fill in
// baseUrl/model defaults — no per-provider protocol adapters required.
export interface ProviderPreset {
  label: string;
  baseUrl: string;
  defaultModel: string;
  apiKeyEnv?: string;
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.6',
    apiKeyEnv: 'OPENAI_API_KEY'
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-pro',
    apiKeyEnv: 'DEEPSEEK_API_KEY'
  },
  moonshot: {
    label: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k3',
    apiKeyEnv: 'MOONSHOT_API_KEY'
  },
  dashscope: {
    label: 'Alibaba DashScope (Qwen)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3.8-max',
    apiKeyEnv: 'DASHSCOPE_API_KEY'
  },
  zhipu: {
    label: 'Zhipu (GLM)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5',
    apiKeyEnv: 'ZHIPU_API_KEY'
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-5.6',
    apiKeyEnv: 'OPENROUTER_API_KEY'
  },
  ollama: {
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen3'
  }
};

export function resolveProvider(name?: string): ProviderPreset | undefined {
  if (!name) return undefined;
  return PROVIDER_PRESETS[name.toLowerCase()];
}

export function providerNames(): string[] {
  return Object.keys(PROVIDER_PRESETS);
}
