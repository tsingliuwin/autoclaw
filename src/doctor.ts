import * as fs from 'fs';
import { createRequire } from 'module';
import { testConnection } from './setup.js';
import { getBashPath, resolveShellType } from './shell.js';
import { getToolDefinitions, listUnavailableTools } from './tools/index.js';

export interface DoctorCheck {
  name: string;
  ok: boolean;
  critical: boolean;
  detail: string;
}

export interface DoctorConfig {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  providerLabel: string;
  globalFile: string;
  projectFile: string;
  globalExists: boolean;
  projectExists: boolean;
  toolConfig: any;
}

const require = createRequire(import.meta.url);

function playwrightBrowserStatus(): { ok: boolean; detail: string } {
  try {
    const { chromium } = require('playwright');
    const exe: string = chromium.executablePath();
    if (exe && fs.existsSync(exe)) {
      return { ok: true, detail: exe };
    }
    return { ok: false, detail: 'playwright installed but no browser downloaded (run: npx playwright install chromium)' };
  } catch (err: any) {
    return { ok: false, detail: `playwright not available (${String(err?.message ?? err).split('\n')[0]})` };
  }
}

function maskKey(key?: string): string {
  if (!key) return 'missing';
  if (key.length < 8) return '***';
  return `${key.slice(0, 6)}***${key.slice(-4)}`;
}

// Headless self-diagnosis: every check reports ok/critical/detail, so the
// CLI can render ✓/✗ and derive an exit code without any interaction.
export async function collectDoctorChecks(cfg: DoctorConfig): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  checks.push({
    name: 'Global config',
    ok: cfg.globalExists,
    critical: true,
    detail: cfg.globalExists ? cfg.globalFile : `${cfg.globalFile} (missing — run: autoclaw setup)`
  });
  checks.push({
    name: 'Project config',
    ok: true,
    critical: false,
    detail: cfg.projectExists ? cfg.projectFile : '(none)'
  });
  checks.push({
    name: 'API key',
    ok: !!cfg.apiKey,
    critical: true,
    detail: maskKey(cfg.apiKey)
  });
  checks.push({
    name: 'Endpoint',
    ok: !!cfg.baseUrl,
    critical: true,
    detail: `${cfg.providerLabel} | ${cfg.baseUrl || '?'} | model: ${cfg.model}`
  });

  if (cfg.apiKey && cfg.baseUrl && cfg.model) {
    const t = await testConnection(cfg.baseUrl, cfg.apiKey, cfg.model);
    checks.push({ name: 'Connection', ok: t.ok, critical: true, detail: t.message });
  } else {
    checks.push({ name: 'Connection', ok: false, critical: true, detail: 'skipped (key / baseUrl / model missing)' });
  }

  const shellType = resolveShellType(cfg.toolConfig);
  const bashPath = shellType === 'bash' ? getBashPath() : null;
  checks.push({
    name: 'Shell',
    ok: true,
    critical: false,
    detail: bashPath ? `${shellType} (${bashPath})` : shellType
  });

  const registered = getToolDefinitions(cfg.toolConfig).length;
  const missing = listUnavailableTools(cfg.toolConfig);
  checks.push({
    name: 'Tools',
    ok: true,
    critical: false,
    detail: `${registered} registered${missing.length ? ` (not configured: ${missing.join(', ')})` : ''}`
  });

  const pw = playwrightBrowserStatus();
  checks.push({ name: 'Playwright browsers', ok: pw.ok, critical: false, detail: pw.detail });

  return checks;
}
