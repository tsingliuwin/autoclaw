import { describe, expect, it, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { collectDoctorChecks, type DoctorConfig } from './doctor.js';

function baseConfig(overrides: Partial<DoctorConfig> = {}): DoctorConfig {
  return {
    apiKey: 'sk-test-key-123',
    baseUrl: 'https://api.example.com/v1',
    model: 'test-model',
    providerLabel: 'custom',
    globalFile: path.join(os.tmpdir(), 'global-setting.json'),
    projectFile: path.join(os.tmpdir(), 'project-setting.json'),
    globalExists: true,
    projectExists: false,
    toolConfig: {},
    ...overrides
  };
}

describe('collectDoctorChecks', () => {
  it('passes all critical checks on a working config', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' }));

    const checks = await collectDoctorChecks(baseConfig());

    const criticalFailed = checks.filter(c => c.critical && !c.ok);
    expect(criticalFailed).toHaveLength(0);
    expect(checks.find(c => c.name === 'Connection')?.ok).toBe(true);
    expect(checks.find(c => c.name === 'Tools')?.detail).toContain('registered');
  });

  it('fails critical checks when the API key is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const checks = await collectDoctorChecks(baseConfig({ apiKey: undefined }));

    const keyCheck = checks.find(c => c.name === 'API key');
    expect(keyCheck?.ok).toBe(false);
    expect(keyCheck?.critical).toBe(true);
    const conn = checks.find(c => c.name === 'Connection');
    expect(conn?.ok).toBe(false);
    expect(conn?.detail).toContain('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces connection failures as a critical check', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'bad key' }));

    const checks = await collectDoctorChecks(baseConfig());

    const conn = checks.find(c => c.name === 'Connection');
    expect(conn?.ok).toBe(false);
    expect(conn?.critical).toBe(true);
    expect(conn?.detail).toContain('API key rejected');
  });

  it('reports non-critical environment info without failing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' }));

    const checks = await collectDoctorChecks(baseConfig());

    const shell = checks.find(c => c.name === 'Shell');
    expect(shell?.ok).toBe(true);
    expect(shell?.critical).toBe(false);

    const pw = checks.find(c => c.name === 'Playwright browsers');
    expect(pw?.critical).toBe(false);
    expect(typeof pw?.ok).toBe('boolean');
  });

  it('flags a missing global config as critical', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' }));

    const checks = await collectDoctorChecks(baseConfig({ globalExists: false }));

    const g = checks.find(c => c.name === 'Global config');
    expect(g?.ok).toBe(false);
    expect(g?.critical).toBe(true);
    expect(g?.detail).toContain('autoclaw setup');
  });
});
