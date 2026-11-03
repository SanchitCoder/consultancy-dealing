import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endpointList, type EndpointKey } from '@/contracts/deal-api';
import type { Session } from '@/lib/auth/session';
import { makeState } from './helpers';

const owner: Session = { role: 'owner', name: 'Owner', exp: Date.now() + 1e6 };
const consultant = (id: number, email: string): Session => ({ role: 'consultant', name: 'C', consultantId: id, email, exp: Date.now() + 1e6 });

interface Seen { method: string; path: string; query: Record<string, string>; headers: Record<string, string>; body: unknown }
let seen: Seen[] = [];

/** A stand-in for n8n: answers live webhook URLs with the mock handlers' wire shapes and records exactly what it was sent. */
async function installFakeN8n() {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'live');
  vi.stubEnv('N8N_BASE_URL', 'https://n8n.example.test/webhook');
  vi.stubEnv('N8N_WEBHOOK_AUTH_HEADER_NAME', 'X-Test-Key');
  vi.stubEnv('N8N_WEBHOOK_AUTH_VALUE', 'secret-value-123');
  const { runMock } = await import('@/lib/mock/handlers');
  const { HttpError } = await import('@/lib/mock/store');
  const state = makeState();
  const keyFor = (method: string, path: string): EndpointKey => endpointList.find((e) => e.method === method && e.path === path)!.key as EndpointKey;
  vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/webhook', '');
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
    const query = Object.fromEntries(url.searchParams);
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    seen.push({ method: init.method ?? 'GET', path, query, headers, body });
    if (!endpointList.some((e) => e.method === init.method && e.path === path)) return new Response('<html>404</html>', { status: 404 });
    // the real workflow takes { token, notes } for revise; translate that into the mock's own input
    let mockBody = body as Record<string, unknown> | undefined;
    if (path === '/deal/proposal/revise') {
      const p = state.db.proposals.find((x) => x.approve_token === body.token);
      mockBody = { proposal_id: p?.id, change_notes: body.notes };
    }
    try {
      return new Response(JSON.stringify(runMock(keyFor(init.method!, path), state, query, mockBody ?? {})), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      if (e instanceof HttpError) return new Response(JSON.stringify({ status: 'error', error: e.message }), { status: e.status });
      throw e;
    }
  }));
  const { runEndpoint } = await import('@/lib/server/proxy');
  const { endpoints } = await import('@/contracts/deal-api');
  return { state, call: (k: EndpointKey, s: Session, q: Record<string, string> = {}, b?: unknown) => runEndpoint(endpoints[k], s, q, b) };
}

beforeEach(() => { seen = []; });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

describe('live mode talks to the workflow correctly', () => {
  it('adds Header Auth on the server and calls only /deal/* webhook paths', async () => {
    const { call } = await installFakeN8n();
    await call('overview', owner);
    await call('deals', owner, { page_size: '2' });
    expect(seen.length).toBe(2);
    for (const s of seen) {
      expect(s.headers['X-Test-Key']).toBe('secret-value-123');
      expect(s.path).toMatch(/^\/deal\//);
      expect(s.path).not.toMatch(/^\/deal\/(t\/|payment)/);
    }
    expect(seen[1]!.query).toEqual({ page_size: '2' });
  });
  it('revise resolves the approval token server-side and sends { token, notes } (the real backend contract)', async () => {
    const { call, state } = await installFakeN8n();
    const draft = state.db.proposals.find((p) => p.status === 'drafted')!;
    const r = await call('revise', owner, {}, { proposal_id: draft.id, change_notes: 'Please split into two payments' });
    expect(r.status).toBe(200);
    const sent = seen.find((s) => s.path === '/deal/proposal/revise')!;
    expect(sent.body).toEqual({ token: draft.approve_token, notes: 'Please split into two payments' });
    expect(JSON.stringify(r.json)).not.toContain(draft.approve_token);
  });
  it('stage adds the owning consultant email for the workflow ownership check', async () => {
    const { call, state } = await installFakeN8n();
    const deal = state.db.deals.find((d) => !d.is_test && d.stage === 'proposal_opened')!;
    const email = state.db.consultants.find((c) => c.id === deal.consultant_id)!.email;
    expect((await call('stage', owner, {}, { deal_id: deal.id, to_stage: 'negotiation' })).status).toBe(200);
    expect(seen.find((s) => s.path === '/deal/stage')!.body).toMatchObject({ deal_id: deal.id, to_stage: 'negotiation', consultant_email: email });
    const mine = state.db.deals.find((d) => !d.is_test && d.stage === 'negotiation')!;
    const myEmail = state.db.consultants.find((c) => c.id === mine.consultant_id)!.email;
    seen = [];
    await call('stage', consultant(mine.consultant_id, myEmail), {}, { deal_id: mine.id, to_stage: 'negotiation', value_inr: 99000 });
    expect(seen.find((s) => s.path === '/deal/stage')!.body).toMatchObject({ consultant_email: myEmail, value_inr: 99000 });
  });
  it('call-done maps no_show onto the workflow field', async () => {
    const { call, state } = await installFakeN8n();
    const up = state.db.calls.find((c) => c.status === 'scheduled' && Date.parse(c.scheduled_for!) > state.clock())!;
    await call('callDone', owner, {}, { deal_id: up.deal_id, no_show: true });
    expect(seen.find((s) => s.path === '/deal/call-done')!.body).toMatchObject({ deal_id: up.deal_id, outcome: 'no_show', no_show: true });
  });
  it('browser-visible output never has tokens even though the workflow sends them', async () => {
    const { call, state } = await installFakeN8n();
    const id = state.db.proposals.find((p) => p.status === 'drafted')!.id;
    const r = await call('proposal', owner, { id: String(id) });
    const raw = seen.find((s) => s.path === '/deal/proposal')!;
    expect(raw).toBeTruthy();
    expect(JSON.stringify(r.json)).not.toMatch(/approve_token|tracking_token/);
  });
  it('a consultant cannot reach another consultant\'s data through the live backend either', async () => {
    const { call, state } = await installFakeN8n();
    const theirs = state.db.deals.find((d) => !d.is_test && d.consultant_id === 1)!;
    expect((await call('deal', consultant(2, 'c2@x.in'), { id: String(theirs.id) })).status).toBe(403);
  });
  it('the contract health check calls only GET endpoints and none of the blocked ones', async () => {
    const { state } = await installFakeN8n();
    void state;
    const { contractHealth } = await import('@/lib/server/proxy');
    const rows = await contractHealth(owner);
    expect(rows.filter((r) => r.ok === false)).toEqual([]);
    expect(seen.every((s) => s.method === 'GET')).toBe(true);
    expect(seen.some((s) => /^\/deal\/(t\/|payment)/.test(s.path))).toBe(false);
  });
});
