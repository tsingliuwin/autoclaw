import { describe, expect, it } from 'vitest';
import { PROVIDER_PRESETS, providerNames, resolveProvider } from './providers.js';

describe('provider presets', () => {
  it('resolves presets case-insensitively', () => {
    expect(resolveProvider('deepseek')?.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(resolveProvider('DeepSeek')?.defaultModel).toBe('deepseek-chat');
    expect(resolveProvider('MOONSHOT')?.label).toContain('Kimi');
  });

  it('returns undefined for unknown or missing names', () => {
    expect(resolveProvider('nope')).toBeUndefined();
    expect(resolveProvider(undefined)).toBeUndefined();
  });

  it('has complete presets for every provider', () => {
    for (const name of providerNames()) {
      const preset = PROVIDER_PRESETS[name];
      expect(preset.baseUrl).toMatch(/^https?:\/\//);
      expect(preset.defaultModel).toBeTruthy();
      expect(preset.label).toBeTruthy();
      if (name !== 'ollama') {
        expect(preset.apiKeyEnv).toBeTruthy();
      }
    }
  });
});
