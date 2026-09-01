import { describe, expect, it, vi } from 'vitest';
import { fetchModelIds, normalizeBaseUrl, testConnection } from './setup.js';

describe('normalizeBaseUrl', () => {
  it('adds https and strips trailing slashes', () => {
    expect(normalizeBaseUrl(' api.example.com/v1 ')).toBe('https://api.example.com/v1');
    expect(normalizeBaseUrl('https://api.deepseek.com/v1/')).toBe('https://api.deepseek.com/v1');
    expect(normalizeBaseUrl('http://localhost:11434/v1//')).toBe('http://localhost:11434/v1');
  });

  it('keeps http for local endpoints', () => {
    expect(normalizeBaseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/v1');
  });
});

describe('testConnection', () => {
  it('reports success on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    const r = await testConnection('https://api.example.com/v1', 'sk-key', 'm1');

    expect(r.ok).toBe(true);
    expect(r.kind).toBe('ok');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-key' })
      })
    );
  });

  it('maps 401 to an auth problem', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'bad key' }));
    const r = await testConnection('https://api.example.com/v1', 'sk-wrong', 'm1');
    expect(r.ok).toBe(false);
    expect(r.kind).toBe('auth');
    expect(r.message).toContain('bad key');
  });

  it('maps 404 to a base URL problem', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'nope' }));
    const r = await testConnection('https://wrong.example.com/v1', 'k', 'm1');
    expect(r.kind).toBe('not-found');
    expect(r.message).toContain('Base URL');
  });

  it('maps 400 to a model name problem', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'model not exist' }));
    const r = await testConnection('https://api.example.com/v1', 'k', 'wrong-model');
    expect(r.kind).toBe('model');
    expect(r.message).toContain('wrong-model');
  });

  it('maps connection failures to a network problem', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    const r = await testConnection('https://unreachable.example.com/v1', 'k', 'm1');
    expect(r.kind).toBe('network');
    expect(r.message).toContain('ECONNRESET');
  });
});

describe('fetchModelIds', () => {
  it('returns sorted model ids from the catalog', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'model-b' }, { id: 'model-a' }, { nope: true }] })
    }));
    expect(await fetchModelIds('https://api.example.com/v1', 'k')).toEqual(['model-a', 'model-b']);
  });

  it('returns null on non-OK responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await fetchModelIds('https://api.example.com/v1', 'k')).toBeNull();
  });

  it('returns null on network errors or malformed payloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect(await fetchModelIds('https://x/v1', 'k')).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ weird: true }) }));
    expect(await fetchModelIds('https://x/v1', 'k')).toBeNull();
  });
});
