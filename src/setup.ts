// Pure helpers behind the setup wizard: URL normalization, a live
// connection test with actionable error mapping, and provider model
// catalog fetching. Kept free of inquirer so they are unit-testable.

export function normalizeBaseUrl(url: string): string {
  let u = String(url ?? '').trim();
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, '');
}

export interface ConnectionTestResult {
  ok: boolean;
  kind: 'ok' | 'auth' | 'not-found' | 'model' | 'network' | 'server';
  message: string;
}

// Sends one tiny real prompt through the exact endpoint the user
// configured, and maps failures to the field that is most likely wrong.
export async function testConnection(baseUrl: string, apiKey: string, model: string): Promise<ConnectionTestResult> {
  const url = `${normalizeBaseUrl(baseUrl)}/chat/completions`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], stream: false })
    });
  } catch (err: any) {
    return { ok: false, kind: 'network', message: `Cannot reach ${url} (${err?.message ?? err}). Check the Base URL and your network.` };
  }

  if (resp.ok) {
    return { ok: true, kind: 'ok', message: `Connection OK — ${model} responded.` };
  }
  const detail = (await resp.text().catch(() => '')).slice(0, 300);
  if (resp.status === 401 || resp.status === 403) {
    return { ok: false, kind: 'auth', message: `API key rejected (${resp.status}). Double-check the key. ${detail}` };
  }
  if (resp.status === 404) {
    return { ok: false, kind: 'not-found', message: `Endpoint not found (404). The Base URL is likely wrong. ${detail}` };
  }
  if (resp.status === 400) {
    return { ok: false, kind: 'model', message: `Request rejected (400). The model name "${model}" is likely wrong for this endpoint. ${detail}` };
  }
  return { ok: false, kind: 'server', message: `Provider returned ${resp.status}. ${detail}` };
}

// Returns the provider's model IDs (sorted) or null when the endpoint does
// not offer a catalog — the wizard then falls back to manual entry.
export async function fetchModelIds(baseUrl: string, apiKey: string): Promise<string[] | null> {
  try {
    const resp = await fetch(`${normalizeBaseUrl(baseUrl)}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
    });
    if (!resp.ok) return null;
    const data: any = await resp.json();
    const ids: string[] = (Array.isArray(data?.data) ? data.data : [])
      .map((m: any) => m?.id)
      .filter((id: any): id is string => typeof id === 'string' && id.length > 0);
    ids.sort();
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}
