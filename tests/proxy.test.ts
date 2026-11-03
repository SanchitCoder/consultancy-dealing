import { beforeEach, describe, expect, it } from 'vitest';
import { endpointList, endpoints, findEndpoint, isBlockedPath, SECRET_KEYS } from '@/contracts/deal-api';
import type { Session } from '@/lib/auth/session';
import { resetMockState } from '@/lib/mock/store';
import { resolveEndpoint, runEndpoint, stripSecrets } from '@/lib/server/proxy';
import { makeState } from './helpers';

const owner: Session = { role: 'owner', name: 'Owner', exp: Date.now() + 1e6 };
const consultant = (id: number): Session => ({ role: 'consultant', name: `C${id}`, consultantId: id, email: `c${id}@x.in`, exp: Date.now() + 1e6 });
let state = makeState();
beforeEach(() => { state = makeState(); resetMockState(state); });

const call = async (key: keyof typeof endpoints, s: Session, query: Record<string, string> = {}, body?: unknown) => runEndpoint(endpoints[key], s, query, body);

describe('allow-list', () => {
  it('never forwards the public tracking endpoints or the payment webhook', () => {
    for (const p of ['/deal/t/open', '/deal/t/click', '/deal/t/accept', '/deal/t/decline', '/deal/t/open/', '/deal/t/anything', '/deal/payment', '/deal/payment/']) {
      expect(isBlockedPath(p), p).toBe(true);
      expect(findEndpoint('GET', p), p).toBeUndefined();
      expect(findEndpoint('POST', p), p).toBeUndefined();
      expect(resolveEndpoint('GET', p.split('/').filter(Boolean)).blocked, p).toBe(true);
    }
    expect(endpointList.some((e) => /^\/deal\/(t\/|payment)/.test(e.path) && e.dashboard)).toBe(false);
  });
  it('does not expose the emailed approve link or raw booking intake', () => {
    expect(findEndpoint('GET', '/deal/proposal/approve')).toBeUndefined();
    expect(findEndpoint('POST', '/deal/call-booked')).toBeUndefined();
  });
  it('is method-specific and rejects unknown paths', () => {
    expect(findEndpoint('POST', '/deal/overview')).toBeUndefined();
    expect(findEndpoint('GET', '/deal/proposal/approve-admin')).toBeUndefined();
    expect(findEndpoint('GET', '/deal/unknown')).toBeUndefined();
    expect(findEndpoint('GET', '/deal/../../etc/passwd')).toBeUndefined();
    expect(findEndpoint('POST', '/deal/stage')?.key).toBe('stage');
  });
  it('every dashboard endpoint uses Header Auth', () => {
    expect(endpointList.filter((e) => e.dashboard).every((e) => e.auth === 'header')).toBe(true);
  });
});

describe('tokens never reach the browser', () => {
  const leaks = (json: unknown) => {
    const text = JSON.stringify(json);
    return SECRET_KEYS.filter((k) => text.includes(`"${k}"`));
  };
  it('GET /deal/proposal', async () => {
    const id = state.db.proposals.find((p) => p.status === 'drafted')!.id;
    const r = await call('proposal', owner, { id: String(id) });
    expect(r.status).toBe(200);
    expect(leaks(r.json)).toEqual([]);
    const secrets = state.db.proposals.flatMap((p) => [p.approve_token, p.tracking_token]);
    expect(secrets.some((t) => JSON.stringify(r.json).includes(t))).toBe(false);
    expect((r.json as { data: { approval: { can_approve: boolean } } }).data.approval.can_approve).toBe(true);
  });
  it('GET /deal/deal', async () => {
    const r = await call('deal', owner, { id: String(state.db.deals.find((d) => !d.is_test && state.db.proposals.some((p) => p.deal_id === d.id))!.id) });
    expect(r.status).toBe(200);
    expect(leaks(r.json)).toEqual([]);
    expect((r.json as { proposals: unknown[] }).proposals.length).toBeGreaterThan(0);
  });
  it('stripSecrets removes them at any depth, even if a schema forgot to', () => {
    const dirty = { a: [{ approve_token: 'x', ok: 1, deep: { tracking_token: 'y', ip_hash: 'z', keep: true } }] };
    expect(stripSecrets(dirty)).toEqual({ a: [{ ok: 1, deep: { keep: true } }] });
  });
});

describe('consultants only see and act on their own work', () => {
  const mine = (id: number) => state.db.deals.filter((d) => !d.is_test && d.consultant_id === id);
  it('list endpoints are forced to the caller, whatever the query says', async () => {
    const r = await call('deals', consultant(2), { consultant_id: '1', page_size: '500' });
    const rows = (r.json as { data: { consultant_id: number }[] }).data;
    expect(rows.length).toBe(mine(2).length);
    expect(rows.every((x) => x.consultant_id === 2)).toBe(true);
    const p = await call('proposals', consultant(3), { consultant_id: '1', page_size: '200' });
    expect((p.json as { data: { consultant_id: number }[] }).data.every((x) => x.consultant_id === 3)).toBe(true);
    const w = await call('winrate', consultant(4), { group_by: 'consultant' });
    expect((w.json as { data: { rows: { dimension_value: string }[] } }).data.rows.map((x) => x.dimension_value)).toEqual(['4']);
  });
  it("another consultant's deal, brief, proposal and actions are refused", async () => {
    const theirs = mine(1).find((d) => state.db.proposals.some((p) => p.deal_id === d.id))!;
    const prop = state.db.proposals.find((p) => p.deal_id === theirs.id)!;
    expect((await call('deal', consultant(2), { id: String(theirs.id) })).status).toBe(403);
    expect((await call('proposal', consultant(2), { id: String(prop.id) })).status).toBe(403);
    expect((await call('brief', consultant(2), { deal_id: String(theirs.id) })).status).toBe(403);
    expect((await call('approveAdmin', consultant(2), {}, { proposal_id: prop.id })).status).toBe(403);
    expect((await call('revise', consultant(2), {}, { proposal_id: prop.id, change_notes: 'change it please' })).status).toBe(403);
    expect((await call('stage', consultant(2), {}, { deal_id: theirs.id, to_stage: 'negotiation' })).status).toBe(403);
    expect((await call('briefRegenerate', consultant(2), {}, { deal_id: theirs.id })).status).toBe(403);
    expect((await call('callDone', consultant(2), {}, { deal_id: theirs.id, no_show: true })).status).toBe(403);
    expect((await call('deal', consultant(1), { id: String(theirs.id) })).status).toBe(200);
  });
  it('can approve their own drafted proposal', async () => {
    const draft = state.db.proposals.find((p) => p.status === 'drafted')!;
    const owner1 = state.db.deals.find((d) => d.id === draft.deal_id)!.consultant_id;
    const r = await call('approveAdmin', consultant(owner1), {}, { proposal_id: draft.id });
    expect(r.status).toBe(200);
    expect(state.db.proposals.find((p) => p.id === draft.id)!.status).toBe('sent');
  });
  it('owner-only endpoints are closed to consultants', async () => {
    expect((await call('consultants', consultant(1))).status).toBe(403);
    expect((await call('logs', consultant(1), { type: 'error' })).status).toBe(403);
    expect((await call('setup', consultant(1), {}, {})).status).toBe(403);
    expect((await call('test', consultant(1), {}, { scenario: 'cleanup' })).status).toBe(403);
    expect((await call('service', consultant(1), {}, { name: 'x', service_type: 'x', base_price_inr: 1 })).status).toBe(403);
    expect((await call('consultant', consultant(1), {}, { name: 'x', email: 'x@y.in' })).status).toBe(403);
    expect((await call('metrics', consultant(1))).status).toBe(403);
  });
  it('the owner can do everything', async () => {
    expect((await call('consultants', owner)).status).toBe(200);
    expect((await call('logs', owner, { type: 'error' })).status).toBe(200);
  });
});

describe('request validation happens before anything reaches the backend', () => {
  it('rejects marking a deal lost without a reason', async () => {
    const r = await call('stage', owner, {}, { deal_id: 1, to_stage: 'lost' });
    expect(r.status).toBe(400);
    expect((r.json as { error: string }).error).toMatch(/reason is required/);
  });
  it('rejects an invalid stage, a missing id and a bad email', async () => {
    expect((await call('stage', owner, {}, { deal_id: 1, to_stage: 'celebrating' })).status).toBe(400);
    expect((await call('approveAdmin', owner, {}, {})).status).toBe(400);
    expect((await call('consultant', owner, {}, { name: 'A', email: 'not-an-email' })).status).toBe(400);
    expect((await call('callDone', owner, {}, { deal_id: 1, transcript_text: 'too short' })).status).toBe(400);
    expect((await call('winrate', owner, { group_by: 'nonsense' })).status).toBe(400);
  });
  it('passes the backend message through on a refusal', async () => {
    const sent = state.db.proposals.find((p) => p.status === 'sent')!;
    const r = await call('approveAdmin', owner, {}, { proposal_id: sent.id });
    expect(r.status).toBe(409);
    expect((r.json as { error: string }).error).toMatch(/already sent and cannot be approved again/);
  });
  it('drops query parameters that are not in the contract', async () => {
    const r = await call('deals', owner, { page_size: '2', evil: "1' OR '1'='1" });
    expect(r.status).toBe(200);
  });
});

describe('contract health check', () => {
  it('passes for every GET endpoint on the mock', async () => {
    const { contractHealth } = await import('@/lib/server/proxy');
    const rows = await contractHealth(owner);
    expect(rows.length).toBeGreaterThanOrEqual(15);
    expect(rows.filter((r) => r.ok === false)).toEqual([]);
    expect(rows.every((r) => !r.path.startsWith('/deal/t/') && r.path !== '/deal/payment')).toBe(true);
  });
});
