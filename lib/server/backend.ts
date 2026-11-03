import 'server-only';
import type { EndpointKey } from '@/contracts/deal-api';
import { endpoints } from '@/contracts/deal-api';
import { DATA_MODE } from '@/lib/config';
import { runMock } from '@/lib/mock/handlers';
import { getMockState, HttpError } from '@/lib/mock/store';
import { serverEnv } from './env';

export interface BackendResult { status: number; json: unknown; ms: number }

/**
 * The one place the server talks to "the backend": the mock store, or the n8n workflow's webhooks (Header Auth added here, never in the browser).
 * `query` and `body` are already in the shape the workflow expects.
 */
export async function callBackend(key: EndpointKey, input: { query?: Record<string, string>; body?: unknown }): Promise<BackendResult> {
  const def = endpoints[key];
  const t0 = Date.now();
  if (DATA_MODE === 'mock') {
    try {
      const json = runMock(key, getMockState(), input.query ?? {}, (input.body ?? {}) as Record<string, unknown>);
      return { status: 200, json, ms: Date.now() - t0 };
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, json: { status: 'error', error: e.message }, ms: Date.now() - t0 };
      throw e;
    }
  }
  const url = new URL(`${serverEnv.n8nBaseUrl}${def.path}`);
  for (const [k, v] of Object.entries(input.query ?? {})) if (v !== '') url.searchParams.set(k, v);
  const headers: Record<string, string> = { Accept: 'application/json', [serverEnv.authHeaderName]: serverEnv.authHeaderValue };
  if (def.method === 'POST') headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, { method: def.method, headers, body: def.method === 'POST' ? JSON.stringify(input.body ?? {}) : undefined, cache: 'no-store', signal: AbortSignal.timeout(90_000) });
  } catch (e) {
    return { status: 504, json: { status: 'error', error: `Could not reach the workflow (${e instanceof Error ? e.message : 'network error'}). Is n8n up and the workflow active?` }, ms: Date.now() - t0 };
  }
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch {
    return { status: 502, json: { status: 'error', error: `The workflow answered with something other than JSON (HTTP ${res.status}). Check that the webhook is active and its path is correct.` }, ms: Date.now() - t0 };
  }
  return { status: res.status, json, ms: Date.now() - t0 };
}
