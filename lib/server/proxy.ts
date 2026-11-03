import 'server-only';
import type { z } from 'zod';
import { endpoints, errorBody, findEndpoint, isBlockedPath, SECRET_KEYS, type EndpointDef, type EndpointKey } from '@/contracts/deal-api';
import type { Session } from '@/lib/auth/session';
import { DATA_MODE } from '@/lib/config';
import { callBackend } from './backend';

export interface ContractIssue { path: string; message: string }
export interface ProxyResult { status: number; json: unknown }

const fail = (status: number, error: string, extra: Record<string, unknown> = {}): ProxyResult => ({ status, json: { status: 'error', error, ...extra } });

/** "data.rows[2].win_rate_pct" */
export function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>((acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc ? `${acc}.${String(p)}` : String(p)), '');
}
export function issuesOf(err: z.ZodError): ContractIssue[] {
  return err.issues.slice(0, 8).map((i) => ({ path: formatPath(i.path) || '(root)', message: i.message }));
}
export function mismatch(def: Pick<EndpointDef, 'method' | 'path' | 'key'>, issues: ContractIssue[]): ProxyResult {
  const first = issues[0];
  return fail(502, `Contract mismatch on ${def.method} ${def.path}: ${first ? `${first.path} - ${first.message}` : 'unexpected response'}`, {
    contract_mismatch: { endpoint: `${def.method} ${def.path}`, key: def.key, field: first?.path ?? '(root)', issues },
  });
}

/** Removes tokens and hashes anywhere in a response, whatever the schema says. */
export function stripSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripSecrets) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (!(SECRET_KEYS as readonly string[]).includes(k)) out[k] = stripSecrets(v);
    return out as T;
  }
  return value;
}

const idFrom = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** Which consultant owns this deal? (server-to-server lookup; null = unknown deal) */
async function dealOwner(dealId: number): Promise<number | null> {
  const r = await callBackend('deal', { query: { id: String(dealId) } });
  const owner = (r.json as { deal?: { consultant_id?: number } } | null)?.deal?.consultant_id;
  return r.status < 400 && typeof owner === 'number' ? owner : null;
}
async function proposalOwner(proposalId: number): Promise<number | null> {
  const r = await callBackend('proposal', { query: { id: String(proposalId) } });
  const owner = (r.json as { data?: { deal?: { consultant_id?: number } } } | null)?.data?.deal?.consultant_id;
  return r.status < 400 && typeof owner === 'number' ? owner : null;
}

/** Consultants only ever see and act on their own work. Returns an error result, or null when allowed. */
async function enforceScope(def: EndpointDef, session: Session, query: Record<string, string>, body: Record<string, unknown>): Promise<ProxyResult | null> {
  if (!def.roles.includes(session.role)) return fail(403, 'This page is for the owner only.');
  if (session.role === 'owner') return null;
  const me = session.consultantId!;
  switch (def.scoping) {
    case 'consultant_param': query.consultant_id = String(me); return null;
    case 'deal': {
      const id = idFrom(body.deal_id ?? query.deal_id ?? query.id);
      if (id === undefined) return fail(400, 'deal_id is required');
      const owner = await dealOwner(id);
      return owner === me ? null : fail(owner === null ? 404 : 403, owner === null ? 'deal not found' : 'You can only open your own deals.');
    }
    case 'proposal': {
      const id = idFrom(body.proposal_id ?? query.id);
      if (id === undefined) return fail(400, 'proposal id is required');
      const owner = await proposalOwner(id);
      return owner === me ? null : fail(owner === null ? 404 : 403, owner === null ? 'proposal not found' : 'You can only open your own proposals.');
    }
    default: return null;
  }
}

/** Client request -> what the workflow's webhook really expects (live mode only; the mock takes the client shape). */
async function adaptForLive(key: EndpointKey, session: Session, body: Record<string, unknown>): Promise<{ body?: Record<string, unknown>; error?: ProxyResult }> {
  if (DATA_MODE !== 'live') return { body };
  switch (key) {
    case 'revise': {
      const r = await callBackend('proposal', { query: { id: String(body.proposal_id) } });
      const token = (r.json as { data?: { approval?: { approve_token?: string | null } } } | null)?.data?.approval?.approve_token;
      if (r.status >= 400 || !token) return { error: fail(409, 'This proposal can no longer be edited (it was sent or replaced by a newer version).') };
      return { body: { token, notes: body.change_notes } };
    }
    case 'stage': {
      let email = session.email;
      if (session.role === 'owner') {
        const r = await callBackend('deal', { query: { id: String(body.deal_id) } });
        email = (r.json as { consultant?: { email?: string } } | null)?.consultant?.email;
      }
      if (!email) return { error: fail(404, 'deal not found') };
      return { body: { ...body, consultant_email: email } };
    }
    case 'callDone': {
      const { no_show, ...rest } = body;
      return { body: { ...rest, outcome: no_show ? 'no_show' : 'completed', no_show: no_show === true } };
    }
    default: return { body };
  }
}

function toStringRecord(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (x !== undefined && x !== null && x !== '') out[k] = String(x);
  return out;
}

/** The full pipeline for one allowed endpoint call. Exported so the contract health check can reuse it. */
export async function runEndpoint(def: EndpointDef, session: Session, rawQuery: Record<string, string>, rawBody: unknown): Promise<ProxyResult> {
  // 1. validate the browser's request against the contract
  let query: Record<string, string> = {};
  if (def.query) {
    const parsed = (def.query as z.ZodType).safeParse(rawQuery);
    if (!parsed.success) return fail(400, `Invalid request: ${issuesOf(parsed.error).map((i) => `${i.path} ${i.message}`).join('; ')}`);
    query = toStringRecord(parsed.data);
  }
  let body: Record<string, unknown> = {};
  if (def.body) {
    const parsed = (def.body as z.ZodType).safeParse(rawBody ?? {});
    if (!parsed.success) return fail(400, `Invalid request: ${issuesOf(parsed.error).map((i) => `${i.path.replace(/^$/, 'body')} ${i.message}`).join('; ')}`);
    body = parsed.data as Record<string, unknown>;
  }
  // 2. role and per-consultant scope
  const denied = await enforceScope(def, session, query, body);
  if (denied) return denied;
  // 3. adapt to the backend's real fields and call it (auth header added inside callBackend)
  const adapted = await adaptForLive(def.key as EndpointKey, session, body);
  if (adapted.error) return adapted.error;
  const res = await callBackend(def.key as EndpointKey, { query, body: adapted.body });
  // 4. errors pass through with the backend's own message
  const err = errorBody.safeParse(res.json);
  if (res.status >= 400 || err.success) {
    const message = err.success ? err.data.error : (res.json as { message?: string } | null)?.message ?? `The workflow returned HTTP ${res.status}.`;
    return fail(res.status >= 400 ? res.status : 502, message);
  }
  // 5. validate the backend's answer against the contract; tokens are parsed on the server schema, then removed by the client schema
  const serverSchema = (def.serverResponse ?? def.response) as z.ZodType;
  const parsed = serverSchema.safeParse(res.json);
  if (!parsed.success) return mismatch(def, issuesOf(parsed.error));
  const clean = def.serverResponse ? (def.response as z.ZodType).safeParse(parsed.data) : parsed;
  if (!clean.success) return mismatch(def, issuesOf(clean.error));
  return { status: 200, json: stripSecrets(clean.data) };
}

export function resolveEndpoint(method: string, segments: string[]): { def?: EndpointDef; blocked?: boolean } {
  const path = `/${segments.join('/')}`;
  if (isBlockedPath(path)) return { blocked: true };
  return { def: findEndpoint(method, path) };
}

/** Calls every GET endpoint with real parameters and reports pass/fail against the Zod schemas. */
export interface HealthRow { key: string; method: string; path: string; ok: boolean | null; status: number | null; ms: number | null; detail: string; issues: ContractIssue[] }
export async function contractHealth(session: Session): Promise<HealthRow[]> {
  const rows: HealthRow[] = [];
  const probe = async (key: EndpointKey, query: Record<string, string>, label?: string): Promise<unknown> => {
    const def = endpoints[key];
    const t0 = Date.now();
    const r = await runEndpoint(def, session, query, undefined);
    const cm = (r.json as { contract_mismatch?: { issues: ContractIssue[] } }).contract_mismatch;
    rows.push({
      key: label ?? key, method: def.method, path: def.path, ok: r.status === 200, status: r.status, ms: Date.now() - t0,
      detail: r.status === 200 ? 'Matches the contract' : cm ? 'Response does not match the contract' : String((r.json as { error?: string }).error ?? 'Request failed'),
      issues: cm?.issues ?? [],
    });
    return r.status === 200 ? r.json : null;
  };
  const skipped = (key: EndpointKey, why: string) => rows.push({ key, method: endpoints[key].method, path: endpoints[key].path, ok: null, status: null, ms: null, detail: why, issues: [] });

  await probe('overview', {});
  const dealsJson = (await probe('deals', { page_size: '5' })) as { data: { id: number }[] } | null;
  const callsJson = (await probe('calls', { when: 'all', page_size: '50' })) as { data: { deal_id: number; brief_status: string }[] } | null;
  await probe('calls', { when: 'upcoming' }, 'calls (upcoming)');
  const briefDeal = callsJson?.data.find((c) => c.brief_status === 'ready')?.deal_id;
  if (briefDeal !== undefined) await probe('brief', { deal_id: String(briefDeal) }); else skipped('brief', 'No ready brief to read yet');
  const propsJson = (await probe('proposals', { page_size: '5' })) as { data: { id: number }[] } | null;
  const pid = propsJson?.data[0]?.id;
  if (pid !== undefined) await probe('proposal', { id: String(pid) }); else skipped('proposal', 'No proposal to read yet');
  for (const gb of ['service_type', 'lead_source', 'service_type_x_lead_source', 'consultant']) await probe('winrate', { group_by: gb, period: 'all_time' }, `winrate (${gb})`);
  await probe('sla', {});
  await probe('services', {});
  await probe('consultants', {});
  await probe('logs', { type: 'event' }, 'logs (event)');
  await probe('logs', { type: 'error' }, 'logs (error)');
  await probe('config', {});
  await probe('metrics', { period: 'all_time' });
  const did = dealsJson?.data[0]?.id;
  if (did !== undefined) await probe('deal', { id: String(did) }); else skipped('deal', 'No deal to read yet');
  return rows;
}
