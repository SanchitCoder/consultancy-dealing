import { beforeEach, describe, expect, it } from 'vitest';
import { endpoints, type EndpointDef, type EndpointKey } from '@/contracts/deal-api';
import { runMock } from '@/lib/mock/handlers';
import { DRAFT_DELAY_MS, HttpError } from '@/lib/mock/store';
import { makeState } from './helpers';

let s = makeState();
beforeEach(() => { s = makeState(); });
const run = (key: EndpointKey, query: Record<string, string> = {}, body: Record<string, unknown> = {}) => runMock(key, s, query, body);
const server = (key: EndpointKey) => ((endpoints[key] as EndpointDef).serverResponse ?? endpoints[key].response);

describe('every mock read answers in exactly the contract shape', () => {
  const firstDeal = () => (run('deals', { page_size: '1' }) as { data: { id: number }[] }).data[0]!.id;
  const readyBriefDeal = () => (run('calls', { when: 'all', page_size: '200' }) as { data: { deal_id: number; brief_status: string }[] }).data.find((c) => c.brief_status === 'ready')!.deal_id;
  const firstProposal = () => (run('proposals', { page_size: '1' }) as { data: { id: number }[] }).data[0]!.id;
  const cases: [string, EndpointKey, () => Record<string, string>][] = [
    ['overview', 'overview', () => ({})],
    ['overview with range', 'overview', () => ({ from: new Date(s.clock() - 7 * 864e5).toISOString(), to: new Date(s.clock()).toISOString() })],
    ['deals', 'deals', () => ({ page_size: '500' })],
    ['deals filtered', 'deals', () => ({ stage: 'won', sort: '-value_inr', search: 'a' })],
    ['calls upcoming', 'calls', () => ({ when: 'upcoming' })],
    ['calls past with transcripts', 'calls', () => ({ when: 'past', include_transcript: '1' })],
    ['brief', 'brief', () => ({ deal_id: String(readyBriefDeal()) })],
    ['proposals', 'proposals', () => ({})],
    ['proposals by status', 'proposals', () => ({ status: 'sent,opened' })],
    ['proposal detail (server shape, with tokens)', 'proposal', () => ({ id: String(firstProposal()) })],
    ['winrate service', 'winrate', () => ({ group_by: 'service_type' })],
    ['winrate source', 'winrate', () => ({ group_by: 'lead_source', period: 'last_90d' })],
    ['winrate matrix', 'winrate', () => ({ group_by: 'service_type_x_lead_source' })],
    ['winrate consultant', 'winrate', () => ({ group_by: 'consultant', period: 'this_month' })],
    ['sla', 'sla', () => ({})],
    ['services', 'services', () => ({})],
    ['consultants', 'consultants', () => ({})],
    ['event log', 'logs', () => ({ type: 'event' })],
    ['error log', 'logs', () => ({ type: 'error' })],
    ['config', 'config', () => ({})],
    ['metrics', 'metrics', () => ({ period: 'all_time' })],
    ['deal detail (server shape, with tokens)', 'deal', () => ({ id: String(firstDeal()) })],
  ];
  it.each(cases)('%s', (_n, key, q) => {
    const res = run(key, q());
    const parsed = server(key).safeParse(res);
    if (!parsed.success) throw new Error(`${key}: ${parsed.error.issues.slice(0, 4).map((i) => `${i.path.join('.')} ${i.message}`).join(' | ')}`);
    expect(parsed.success).toBe(true);
  });
  it('hides test deals unless include_test=1', () => {
    const hidden = (run('deals', { page_size: '500' }) as { data: { is_test: boolean }[] }).data;
    const shown = (run('deals', { page_size: '500', include_test: '1' }) as { data: { is_test: boolean }[] }).data;
    expect(hidden.some((d) => d.is_test)).toBe(false);
    expect(shown.some((d) => d.is_test)).toBe(true);
  });
  it('filters by consultant', () => {
    const rows = (run('deals', { page_size: '500', consultant_id: '2' }) as { data: { consultant_id: number }[] }).data;
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r) => r.consultant_id === 2)).toBe(true);
  });
  it('paginates with a meta total', () => {
    const r = run('deals', { page: '2', page_size: '10' }) as { data: unknown[]; meta: { page: number; page_size: number; total: number } };
    expect(r.data).toHaveLength(10);
    expect(r.meta).toMatchObject({ page: 2, page_size: 10 });
    expect(r.meta.total).toBeGreaterThan(200);
  });
  it('upcoming calls carry a countdown and a brief state', () => {
    const rows = (run('calls', { when: 'upcoming' }) as { data: { hours_until_call: number; brief_status: string; status: string }[] }).data;
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(rows.every((r) => r.status === 'scheduled' && r.hours_until_call >= -1)).toBe(true);
    expect(new Set(rows.map((r) => r.brief_status))).toContain('ready');
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.hours_until_call).toBeGreaterThanOrEqual(rows[i - 1]!.hours_until_call);
  });
  it('SLA board lists overdue drafts and cold proposals', () => {
    const d = (run('sla') as { data: { overdue: { level: string; hours_since_call: number }[]; cold: unknown[]; counts: { overdue: number } } }).data;
    expect(d.overdue.length).toBeGreaterThanOrEqual(3);
    expect(d.overdue.every((o) => o.hours_since_call >= 24)).toBe(true);
    expect(d.overdue.some((o) => o.level === 'escalated')).toBe(true);
    expect(d.counts.overdue).toBe(d.overdue.length);
  });
  it('winrate rows equal the sum of the deals they group', () => {
    const rows = (run('winrate', { group_by: 'lead_source' }) as { data: { rows: { deals: number }[]; overall: { deals: number } } }).data;
    expect(rows.rows.reduce((t, r) => t + r.deals, 0)).toBe(rows.overall.deals);
  });
});

describe('mock actions really change mock state', () => {
  const draft = () => (run('proposals', { status: 'drafted' }) as { data: { id: number; deal_id: number; version: number; consultant_id: number }[] }).data[0]!;

  it('approve -> proposal sent, deal moves to proposal_sent, and a deal event is recorded', () => {
    const p = draft();
    const r = run('approveAdmin', {}, { proposal_id: p.id }) as { sent: boolean; message: string };
    expect(r.sent).toBe(true);
    expect(r.message).toMatch(/sent to/);
    const after = s.db.proposals.find((x) => x.id === p.id)!;
    expect(after.status).toBe('sent');
    expect(after.sent_at).not.toBeNull();
    expect(s.db.deals.find((d) => d.id === p.deal_id)!.stage).toBe('proposal_sent');
    expect(s.db.dealEvents.some((e) => e.deal_id === p.deal_id && e.event_type === 'proposal_sent')).toBe(true);
  });
  it('approving twice is refused with the backend message', () => {
    const p = draft();
    run('approveAdmin', {}, { proposal_id: p.id });
    expect(() => run('approveAdmin', {}, { proposal_id: p.id })).toThrowError(HttpError);
    expect(() => run('approveAdmin', {}, { proposal_id: p.id })).toThrowError(/cannot be approved again/);
  });
  it('approving moves the proposal into the "going cold" watch only after the thresholds pass', () => {
    const p = draft();
    run('approveAdmin', {}, { proposal_id: p.id });
    expect((run('sla') as { data: { cold: { proposal_id: number }[] } }).data.cold.some((c) => c.proposal_id === p.id)).toBe(false);
    s.advance(49 * 3_600_000);
    expect((run('sla') as { data: { cold: { proposal_id: number; kind: string }[] } }).data.cold.find((c) => c.proposal_id === p.id)?.kind).toBe('unopened');
  });
  it('revise -> version + 1 appears as drafted (after the simulated redraft) and the old one is superseded', () => {
    const p = draft();
    const r = run('revise', {}, { proposal_id: p.id, change_notes: 'Lower the price and add a dashboard' }) as { redrafting: boolean; next_version: number };
    expect(r).toMatchObject({ redrafting: true, next_version: p.version + 1 });
    expect(s.db.proposals.find((x) => x.deal_id === p.deal_id && x.version === p.version + 1)).toBeUndefined();
    s.advance(DRAFT_DELAY_MS + 100);
    run('services'); // any call resolves pending work
    const next = s.db.proposals.find((x) => x.deal_id === p.deal_id && x.version === p.version + 1)!;
    expect(next.status).toBe('drafted');
    expect(next.change_notes).toBe('Lower the price and add a dashboard');
    expect(s.db.proposals.find((x) => x.id === p.id)!.status).toBe('superseded');
    expect(s.db.dealEvents.some((e) => e.deal_id === p.deal_id && e.event_type === 'changes_requested')).toBe(true);
  });
  it('revise on a sent proposal is refused', () => {
    const sent = (run('proposals', { status: 'sent' }) as { data: { id: number }[] }).data[0]!;
    expect(() => run('revise', {}, { proposal_id: sent.id, change_notes: 'anything' })).toThrowError(/no editable draft/);
  });
  it('log call outcome -> call_done now, a drafted proposal after the simulated delay', () => {
    const upcoming = (run('calls', { when: 'upcoming' }) as { data: { deal_id: number; booking_id: string }[] }).data[0]!;
    const r = run('callDone', {}, { deal_id: upcoming.deal_id, transcript_text: 'We talked through the funnel and agreed a webinar build.' }) as { outcome: string; proposal: string };
    expect(r).toMatchObject({ outcome: 'completed', proposal: 'drafting' });
    const deal = s.db.deals.find((d) => d.id === upcoming.deal_id)!;
    expect(deal.stage).toBe('call_done');
    expect(s.db.proposals.some((p) => p.deal_id === deal.id && p.status === 'drafted')).toBe(false);
    s.advance(DRAFT_DELAY_MS + 100);
    run('services');
    expect(s.db.proposals.find((p) => p.deal_id === deal.id && p.status === 'drafted')).toBeTruthy();
    expect(s.db.deals.find((d) => d.id === deal.id)!.stage).toBe('proposal_drafted');
  });
  it('logging the same outcome twice does not draft twice', () => {
    const upcoming = (run('calls', { when: 'upcoming' }) as { data: { deal_id: number }[] }).data[0]!;
    run('callDone', {}, { deal_id: upcoming.deal_id, transcript_text: 'x'.repeat(40) });
    const again = run('callDone', {}, { deal_id: upcoming.deal_id, transcript_text: 'x'.repeat(40) }) as { proposal: string };
    expect(again.proposal).toBe('already_handled');
    s.advance(DRAFT_DELAY_MS + 100); run('services');
    expect(s.db.proposals.filter((p) => p.deal_id === upcoming.deal_id)).toHaveLength(1);
  });
  it('no-show -> deal in no_show and a rebooking message', () => {
    const upcoming = (run('calls', { when: 'upcoming' }) as { data: { deal_id: number }[] }).data[0]!;
    const r = run('callDone', {}, { deal_id: upcoming.deal_id, no_show: true }) as { outcome: string; rebooking: string };
    expect(r).toMatchObject({ outcome: 'no_show', rebooking: 'sent' });
    expect(s.db.deals.find((d) => d.id === upcoming.deal_id)!.stage).toBe('no_show');
  });
  it('mark lost -> stage lost with the reason and lost_at; shows up in the loss breakdown', () => {
    const open = (run('deals', { stage: 'proposal_opened' }) as { data: { id: number }[] }).data[0]!;
    const before = (run('winrate', { group_by: 'lead_source' }) as { data: { lost_reasons: { reason: string; count: number }[] } }).data.lost_reasons.find((x) => x.reason === 'budget')?.count ?? 0;
    const r = run('stage', {}, { deal_id: open.id, to_stage: 'lost', lost_reason: 'budget', note: 'Asked to wait until next year' }) as { changed: boolean; from_stage: string };
    expect(r).toMatchObject({ changed: true, from_stage: 'proposal_opened' });
    const d = s.db.deals.find((x) => x.id === open.id)!;
    expect(d).toMatchObject({ stage: 'lost', lost_reason: 'budget' });
    expect(d.lost_at).not.toBeNull();
    const after = (run('winrate', { group_by: 'lead_source' }) as { data: { lost_reasons: { reason: string; count: number }[] } }).data.lost_reasons.find((x) => x.reason === 'budget')?.count;
    expect(after).toBe(before + 1);
  });
  it('a value change keeps the stage', () => {
    const open = (run('deals', { stage: 'negotiation' }) as { data: { id: number }[] }).data[0]!;
    const r = run('stage', {}, { deal_id: open.id, to_stage: 'negotiation', value_inr: 123_000 }) as { changed: boolean };
    expect(r.changed).toBe(false);
    expect(s.db.deals.find((d) => d.id === open.id)).toMatchObject({ stage: 'negotiation', value_inr: 123_000 });
  });
  it('regenerate brief -> pending now, ready after the delay', () => {
    const c = (run('calls', { when: 'upcoming' }) as { data: { deal_id: number; call_id?: number; id: number; brief_status: string }[] }).data.find((x) => x.brief_status === 'ready')!;
    const r = run('briefRegenerate', {}, { deal_id: c.deal_id }) as { brief: string; ids: { call_id: number } };
    expect(r.brief).toBe('generating');
    expect(s.db.briefs.find((b) => b.call_id === r.ids.call_id)!.status).toBe('pending');
    s.advance(4000); run('services');
    expect(s.db.briefs.find((b) => b.call_id === r.ids.call_id)!.status).toBe('ready');
  });
  it('service and consultant upserts', () => {
    const created = run('service', {}, { name: 'Pricing Review', service_type: 'pricing_review', base_price_inr: 35_000 }) as { created: boolean };
    expect(created.created).toBe(true);
    const updated = run('service', {}, { name: 'Pricing Review', service_type: 'pricing_review', base_price_inr: 40_000, active: false }) as { created: boolean; active: boolean };
    expect(updated).toMatchObject({ created: false, active: false });
    expect(s.db.services.find((x) => x.service_type === 'pricing_review')!.base_price_inr).toBe(40_000);
    const c = run('consultant', {}, { name: 'New Person', email: 'new@northstargrowth.in', whatsapp: '98765 43210' }) as { created: boolean; ids: { consultant_id: number } };
    expect(c.created).toBe(true);
    expect(s.db.consultants.find((x) => x.id === c.ids.consultant_id)!.whatsapp).toBe('+919876543210');
    expect(() => run('consultant', {}, { id: 1, name: 'Dup', email: 'kavya@northstargrowth.in' })).toThrowError(/duplicate key/);
  });
  it('test scenarios create hidden deals, report passing checks, and cleanup removes them', () => {
    const realBefore = (run('deals', { page_size: '500' }) as { meta: { total: number } }).meta.total;
    const r = run('test', {}, { scenario: 'full_win', size: 3 }) as { status: string; result: { all_checks_passed: boolean; checks: unknown[] } };
    expect(r.status).toBe('ok');
    expect(r.result.all_checks_passed).toBe(true);
    expect((run('deals', { page_size: '500' }) as { meta: { total: number } }).meta.total).toBe(realBefore);
    expect(s.db.deals.filter((d) => d.is_test).length).toBeGreaterThanOrEqual(3);
    const c = run('test', {}, { scenario: 'cleanup' }) as { deleted: { deals_deleted: number } };
    expect(c.deleted.deals_deleted).toBeGreaterThanOrEqual(3);
    expect(s.db.deals.filter((d) => d.is_test)).toHaveLength(0);
    expect(endpoints.test.response.safeParse(c).success).toBe(true);
  });
  it('every action response matches its contract', () => {
    const p = draft();
    const checks: [EndpointKey, unknown][] = [
      ['approveAdmin', run('approveAdmin', {}, { proposal_id: p.id })],
      ['stage', run('stage', {}, { deal_id: p.deal_id, to_stage: 'negotiation' })],
      ['setup', run('setup')],
      ['briefRegenerate', run('briefRegenerate', {}, { deal_id: (run('calls', { when: 'upcoming' }) as { data: { deal_id: number }[] }).data[0]!.deal_id })],
    ];
    for (const [k, res] of checks) expect(endpoints[k].response.safeParse(res).success, k).toBe(true);
  });
});
