/**
 * Runs the exact SQL saved in the n8n workflow (backend/n8n/queries/*.sql) on a real Postgres engine (PGlite) loaded with the
 * workflow's schema and the full sample data, then compares every answer with the mock handlers' answer through the Zod contract.
 * now() is pinned so both sides see the same instant.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { endpoints, type EndpointDef, type EndpointKey } from '@/contracts/deal-api';
import { runMock } from '@/lib/mock/handlers';
import { NOW, makeState } from './helpers';

const root = path.resolve(import.meta.dirname, '..');
const sqlOf = (name: string) => fs.readFileSync(path.join(root, 'backend/n8n/queries', `${name}.sql`), 'utf8');
const state = makeState(NOW);
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE FUNCTION public.now() RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT '${new Date(NOW).toISOString()}'::timestamptz $$; SET search_path = public, pg_catalog;`);
  await db.exec(fs.readFileSync(path.join(root, 'backend/n8n/test-schema.sql'), 'utf8'));
  const load = async (table: string, rows: unknown[]) => { if (rows.length) await db.query(`INSERT INTO ${table} OVERRIDING SYSTEM VALUE SELECT * FROM jsonb_populate_recordset(null::${table}, $1::jsonb)`, [JSON.stringify(rows)]); };
  const d = state.db;
  await load('consultants', d.consultants); await load('services', d.services); await load('prospects', d.prospects); await load('deals', d.deals);
  await load('calls', d.calls); await load('research_briefs', d.briefs); await load('proposals', d.proposals); await load('proposal_events', d.proposalEvents);
  await load('payments', d.payments); await load('deal_events', d.dealEvents); await load('event_log', d.eventLog); await load('error_log', d.errorLog);
  await db.exec('ALTER TABLE consultants ALTER COLUMN id RESTART WITH 1000');
  await db.query('SELECT recompute_pipeline_metrics()');
});

const schemaFor = (key: EndpointKey) => ((endpoints[key] as EndpointDef).serverResponse ?? endpoints[key].response);

/** Deep compare with tolerance for rounding and for timestamp formatting. */
function diff(a: unknown, b: unknown, at = '$'): string[] {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 0.011 ? [] : [`${at}: sql=${a} mock=${b}`];
  if (typeof a === 'string' && typeof b === 'string') {
    if (a === b) return [];
    if (/^\d{4}-\d\d-\d\dT/.test(a) && /^\d{4}-\d\d-\d\dT/.test(b) && Date.parse(a) === Date.parse(b)) return [];
    return [`${at}: sql=${JSON.stringify(a).slice(0, 80)} mock=${JSON.stringify(b).slice(0, 80)}`];
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return [`${at}: length sql=${a.length} mock=${b.length}`];
    return a.flatMap((x, i) => diff(x, b[i], `${at}[${i}]`)).slice(0, 6);
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) => diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${at}.${k}`)).slice(0, 6);
  }
  return a === b ? [] : [`${at}: sql=${JSON.stringify(a)} mock=${JSON.stringify(b)}`];
}

async function compare(file: string, key: EndpointKey, params: Record<string, string | number | null> | null, mockQuery: Record<string, string>): Promise<{ data: unknown; meta: { total: number } }> {
  const sql = (await db.query<{ result: unknown }>(sqlOf(file), params === null ? [] : [JSON.stringify(params)])).rows[0]!.result;
  const parsedSql = schemaFor(key).safeParse(sql);
  if (!parsedSql.success) throw new Error(`SQL output for ${file} breaks the contract: ${parsedSql.error.issues.slice(0, 4).map((i) => `${i.path.join('.')} ${i.message}`).join(' | ')}`);
  const mock = schemaFor(key).parse(runMock(key, state, mockQuery, {}));
  expect(diff(parsedSql.data, mock)).toEqual([]);
  return parsedSql.data as { data: unknown; meta: { total: number } };
}

const week = { from: new Date(NOW - 30 * 864e5).toISOString(), to: new Date(NOW).toISOString() };

describe('SQL in the workflow == mock handlers, through the contract', () => {
  it('overview (30 days)', async () => { await compare('overview', 'overview', week, week); });
  it('overview (90 days)', async () => { const w = { from: new Date(NOW - 90 * 864e5).toISOString(), to: week.to }; await compare('overview', 'overview', w, w); });
  it.each([1, 2, 3, 4])('overview for consultant %i', async (c) => { await compare('overview', 'overview', { ...week, consultant_id: String(c) }, { ...week, consultant_id: String(c) }); });

  it('deals: all, newest first', async () => { await compare('deals', 'deals', { page: 1, page_size: 500, sort: '-created_at' } as never, { page_size: '500', sort: '-created_at' }); });
  it('deals: by stage / source / consultant / search / sort', async () => {
    await compare('deals', 'deals', { stage: 'proposal_opened', page: 1, page_size: 50 } as never, { stage: 'proposal_opened' });
    await compare('deals', 'deals', { lead_source: 'referral', consultant_id: '1', sort: '-value_inr', page: 1, page_size: 50 } as never, { lead_source: 'referral', consultant_id: '1', sort: '-value_inr' });
    await compare('deals', 'deals', { search: 'organics', sort: 'days_in_stage', page: 1, page_size: 50 } as never, { search: 'organics', sort: 'days_in_stage' });
    await compare('deals', 'deals', { page: 3, page_size: 20, sort: 'created_at' } as never, { page: '3', page_size: '20', sort: 'created_at' });
  });
  it('deals: include_test', async () => { await compare('deals', 'deals', { include_test: '1', page: 1, page_size: 500 } as never, { include_test: '1', page_size: '500' }); });

  it('calls: upcoming / past / all / transcripts / by deal', async () => {
    await compare('calls', 'calls', { when: 'upcoming', page: 1, page_size: 100 } as never, { when: 'upcoming', page_size: '100' });
    await compare('calls', 'calls', { when: 'past', page: 1, page_size: 200 } as never, { when: 'past', page_size: '200' });
    await compare('calls', 'calls', { when: 'past', include_transcript: '1', consultant_id: '2', page: 1, page_size: 50 } as never, { when: 'past', include_transcript: '1', consultant_id: '2', page_size: '50' });
    await compare('calls', 'calls', { status: 'no_show', when: 'all', page: 1, page_size: 50 } as never, { status: 'no_show', page_size: '50' });
    const deal = state.db.calls.find((c) => c.status === 'completed')!.deal_id;
    await compare('calls', 'calls', { deal_id: String(deal), when: 'all', include_transcript: '1', page: 1, page_size: 25 } as never, { deal_id: String(deal), include_transcript: '1' });
  });

  it('brief: ready, failed, pending and missing', async () => {
    for (const status of ['ready', 'failed', 'pending'] as const) {
      const b = state.db.briefs.find((x) => x.status === status)!;
      await compare('brief', 'brief', { deal_id: String(b.deal_id) }, { deal_id: String(b.deal_id) });
    }
    const noBrief = state.db.deals.find((d) => !d.is_test && !state.db.briefs.some((b) => b.deal_id === d.id));
    if (noBrief) {
      const r = (await db.query<{ result: { status: string } }>(sqlOf('brief'), [JSON.stringify({ deal_id: String(noBrief.id) })])).rows[0]!.result;
      expect(r.status).toBe('error');
    }
  });

  it('proposals: default, by status, by consultant, paging', async () => {
    await compare('proposals', 'proposals', { page: 1, page_size: 200 } as never, { page_size: '200' });
    await compare('proposals', 'proposals', { status: 'drafted,approved', page: 1, page_size: 50 } as never, { status: 'drafted,approved', page_size: '50' });
    await compare('proposals', 'proposals', { status: 'sent', consultant_id: '3', page: 1, page_size: 50 } as never, { status: 'sent', consultant_id: '3', page_size: '50' });
    await compare('proposals', 'proposals', { status: 'declined,expired', page: 2, page_size: 10 } as never, { status: 'declined,expired', page: '2', page_size: '10' });
    await compare('proposals', 'proposals', { status: 'superseded', page: 1, page_size: 50 } as never, { status: 'superseded', page_size: '50' });
  });

  it('proposal detail: drafted, opened, accepted, declined, expired (server shape with tokens)', async () => {
    for (const status of ['drafted', 'opened', 'accepted', 'declined', 'expired', 'sent'] as const) {
      const p = state.db.proposals.find((x) => x.status === status && !state.db.deals.find((d) => d.id === x.deal_id)!.is_test)!;
      const out = await compare('proposal', 'proposal', { id: String(p.id) }, { id: String(p.id) });
      const d = out.data as { approval: { can_approve: boolean; approve_token: string | null } };
      expect(d.approval.can_approve).toBe(status === 'drafted');
      expect(d.approval.approve_token === null).toBe(status !== 'drafted');
    }
    const r = (await db.query<{ result: { status: string } }>(sqlOf('proposal'), [JSON.stringify({ id: '999999' })])).rows[0]!.result;
    expect(r.status).toBe('error');
  });

  it.each(['service_type', 'lead_source', 'service_type_x_lead_source', 'consultant'] as const)('winrate by %s (all periods)', async (gb) => {
    for (const period of ['all_time', 'last_90d', 'last_30d', 'this_month'] as const) await compare('winrate', 'winrate', { group_by: gb, period }, { group_by: gb, period });
  });
  it.each(['service_type', 'lead_source', 'consultant'] as const)('winrate by %s for one consultant (computed live, not from pipeline_metrics)', async (gb) => {
    await compare('winrate', 'winrate', { group_by: gb, period: 'all_time', consultant_id: '2' }, { group_by: gb, period: 'all_time', consultant_id: '2' });
  });

  it('sla board', async () => {
    const t = { sla: 24, escalate: 48, unopened: 48, opened: 72 };
    await compare('sla', 'sla', t, {});
    await compare('sla', 'sla', { ...t, consultant_id: '2' }, { consultant_id: '2' });
  });
  it('services', async () => { await compare('services', 'services', null, {}); });
  it('consultants', async () => { await compare('consultants', 'consultants', null, {}); });
  it('logs: events and errors', async () => {
    await compare('logs', 'logs', { type: 'event', page: 1, page_size: 25 } as never, { type: 'event' });
    await compare('logs', 'logs', { type: 'error', page: 1, page_size: 25 } as never, { type: 'error' });
    await compare('logs', 'logs', { type: 'event', page: 2, page_size: 10 } as never, { type: 'event', page: '2', page_size: '10' });
  });
});

describe('the action lookups in the workflow behave', () => {
  const acts = sqlOf('actions').split(/-- ==.*\n/).filter((x) => x.trim()).map((x) => x.trim().replace(/;\s*$/, ''));
  it('approve-admin finds a draft and flags it approvable (and a sent one as not)', async () => {
    const draft = state.db.proposals.find((p) => p.status === 'drafted')!;
    const sent = state.db.proposals.find((p) => p.status === 'sent')!;
    expect((await db.query<{ approvable: boolean; approve_token: string }>(acts[0]!, [String(draft.id)])).rows[0]).toMatchObject({ approvable: true, approve_token: draft.approve_token });
    expect((await db.query<{ approvable: boolean }>(acts[0]!, [String(sent.id)])).rows[0]!.approvable).toBe(false);
    expect((await db.query(acts[0]!, ['0'])).rows).toHaveLength(0);
  });
  it('brief regenerate picks the next scheduled call, else the latest completed one', async () => {
    const up = state.db.calls.find((c) => c.status === 'scheduled' && Date.parse(c.scheduled_for!) > NOW)!;
    expect((await db.query<{ call_id: number }>(acts[1]!, [String(up.deal_id)])).rows[0]!.call_id).toBe(up.id);
    const doneOnly = state.db.deals.find((d) => !d.is_test && state.db.calls.filter((c) => c.deal_id === d.id).every((c) => c.status === 'completed'))!;
    expect((await db.query(acts[1]!, [String(doneOnly.id)])).rows).toHaveLength(1);
  });
  it('consultant upsert: creates, normalises the phone, updates by id, merges on email', async () => {
    const q = (...p: string[]) => db.query<{ consultant_id: number; created: boolean }>(acts[2]!, p);
    const created = (await q('', 'Neha Bose', 'NEHA@northstargrowth.in', '98765 43210', '')).rows[0]!;
    expect(created.created).toBe(true);
    expect((await db.query<{ whatsapp: string; email: string; timezone: string }>('SELECT whatsapp, email, timezone FROM consultants WHERE id = $1', [created.consultant_id])).rows[0]).toEqual({ whatsapp: '+919876543210', email: 'neha@northstargrowth.in', timezone: 'Asia/Kolkata' });
    expect((await q(String(created.consultant_id), 'Neha B', 'neha@northstargrowth.in', '', 'Asia/Dubai')).rows[0]!.created).toBe(false);
    expect((await q('', 'Neha Again', 'neha@northstargrowth.in', '', '')).rows[0]).toMatchObject({ consultant_id: created.consultant_id, created: false });
  });
});
