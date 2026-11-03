import { endpoints, type EndpointKey, type Infer } from '@/contracts/deal-api';

export interface ContractMismatch { endpoint: string; key: string; field: string; issues: { path: string; message: string }[] }

/** Every failed call becomes one of these, carrying the backend's own message and, for contract problems, the endpoint and field. */
export class ApiError extends Error {
  constructor(message: string, public status: number, public contract?: ContractMismatch) { super(message); this.name = 'ApiError'; }
}

type QueryParams = Record<string, string | number | boolean | undefined | null>;

async function request(key: EndpointKey, init: { query?: QueryParams; body?: unknown }): Promise<unknown> {
  const def = endpoints[key];
  const url = new URL(`/api/n8n${def.path}`, window.location.origin);
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(url, { method: def.method, headers: def.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined, body: def.method === 'POST' ? JSON.stringify(init.body ?? {}) : undefined, cache: 'no-store' });
  } catch {
    throw new ApiError('Could not reach the dashboard server. Check your connection and try again.', 0);
  }
  if (res.status === 401 && !window.location.pathname.startsWith('/login')) {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    throw new ApiError('Your session ended. Please sign in again.', 401);
  }
  const json = (await res.json().catch(() => null)) as (Record<string, unknown> & { error?: string; contract_mismatch?: ContractMismatch }) | null;
  if (!res.ok || json === null || json.status === 'error') {
    throw new ApiError(json?.error ?? `Something went wrong (HTTP ${res.status}).`, res.status, json?.contract_mismatch);
  }
  return json;
}

export const apiGet = <K extends EndpointKey>(key: K, query?: QueryParams) => request(key, { query }) as Promise<Infer<K>>;
export const apiPost = <K extends EndpointKey>(key: K, body: unknown) => request(key, { body }) as Promise<Infer<K>>;
