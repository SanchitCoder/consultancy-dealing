import { describe, expect, it } from 'vitest';
import { aggregate, avgDealSize, buildFacts, deltaPct, hoursCallToProposal, kpisForWindow, median, openRatePct, pct, periodSince, pipelineMetrics, speedBuckets, startOfIstMonth, weeklyBuckets, winRateInclOpenPct, winRatePct } from '@/lib/metrics';
import type { Db } from '@/lib/metrics/types';

const iso = (t: number) => new Date(t).toISOString();
const H = 3_600_000;
const D = 24 * H;
const T0 = Date.parse('2026-10-01T00:00:00Z');

/** A tiny hand-built book where every answer can be worked out on paper. */
function book(): Db {
  const db: Db = { consultants: [], services: [], prospects: [], deals: [], calls: [], briefs: [], proposals: [], proposalEvents: [], payments: [], dealEvents: [], eventLog: [], errorLog: [] };
  let cid = 0, prid = 0;
  const deal = (id: number, o: { stage: 'won' | 'lost' | 'proposal_sent' | 'call_booked'; src: string; svc: string; value: number; created: number; won?: number; lost?: number; test?: boolean; consultant?: number }) => {
    db.deals.push({ id, prospect_id: id, consultant_id: o.consultant ?? 1, service_type: o.svc, lead_source: o.src, stage: o.stage, value_inr: o.value, currency: 'INR', lost_reason: o.stage === 'lost' ? 'budget' : null, is_test: !!o.test, created_at: iso(o.created), stage_changed_at: iso(o.created), won_at: o.won ? iso(o.won) : null, lost_at: o.lost ? iso(o.lost) : null });
  };
  const call = (dealId: number, completedAt: number | null, scheduled: number) => db.calls.push({ id: ++cid, deal_id: dealId, booking_id: `b${cid}`, provider: 'generic', booked_at: iso(scheduled - 2 * D), scheduled_for: iso(scheduled), status: completedAt ? 'completed' : 'scheduled', intake_answers: null, transcript_text: null, transcript_source: null, notes: null, completed_at: completedAt ? iso(completedAt) : null });
  const prop = (dealId: number, version: number, o: { sent?: number; opened?: boolean; status?: 'sent' | 'opened' | 'accepted' | 'superseded' | 'declined' }) => db.proposals.push({ id: ++prid, deal_id: dealId, version, doc_url: null, pdf_drive_id: null, amount_inr: 1000, status: o.status ?? 'sent', tracking_token: `t${prid}`, approve_token: `a${prid}`, change_notes: null, payment_link: null, followup_draft: null, followup_drafted_at: null, drafted_at: iso(T0), approved_at: null, sent_at: o.sent ? iso(o.sent) : null, first_opened_at: o.opened ? iso((o.sent ?? T0) + H) : null, open_count: o.opened ? 2 : 0, last_opened_at: null, accepted_at: o.status === 'accepted' ? iso(T0 + 9 * D) : null, declined_at: o.status === 'declined' ? iso(T0 + 9 * D) : null, expires_at: null });
  // 1: won, 100k, proposal sent 10h after the call (v1 never sent, v2 sent) -> first SENT version counts
  deal(1, { stage: 'won', src: 'referral', svc: 'a', value: 100_000, created: T0, won: T0 + 12 * D });
  call(1, T0 + 5 * D, T0 + 5 * D); prop(1, 1, { status: 'superseded' }); prop(1, 2, { sent: T0 + 5 * D + 10 * H, opened: true, status: 'accepted' });
  // 2: won, 200k, sent after 30h
  deal(2, { stage: 'won', src: 'referral', svc: 'b', value: 200_000, created: T0, won: T0 + 14 * D });
  call(2, T0 + 5 * D, T0 + 5 * D); prop(2, 1, { sent: T0 + 5 * D + 30 * H, opened: true, status: 'accepted' });
  // 3: lost after 60h, opened
  deal(3, { stage: 'lost', src: 'linkedin', svc: 'a', value: 100_000, created: T0, lost: T0 + 15 * D });
  call(3, T0 + 5 * D, T0 + 5 * D); prop(3, 1, { sent: T0 + 5 * D + 60 * H, opened: true, status: 'declined' });
  // 4: lost, never opened, sent after 20h
  deal(4, { stage: 'lost', src: 'linkedin', svc: 'a', value: 100_000, created: T0, lost: T0 + 20 * D });
  call(4, T0 + 6 * D, T0 + 6 * D); prop(4, 1, { sent: T0 + 6 * D + 20 * H, status: 'sent' });
  // 5: still open (proposal sent, not opened)
  deal(5, { stage: 'proposal_sent', src: 'linkedin', svc: 'b', value: 50_000, created: T0 + D });
  call(5, T0 + 7 * D, T0 + 7 * D); prop(5, 1, { sent: T0 + 7 * D + 4 * H });
  // 6: a test deal that must never be counted
  deal(6, { stage: 'won', src: 'referral', svc: 'a', value: 9_999_999, created: T0, won: T0 + 3 * D, test: true });
  return db;
}

describe('formulas', () => {
  it('win rate = won / (won + lost); null when nothing decided', () => {
    expect(winRatePct(2, 2)).toBe(50);
    expect(winRatePct(1, 3)).toBe(25);
    expect(winRatePct(0, 0)).toBeNull();
  });
  it('secondary win rate includes open deals', () => {
    expect(winRateInclOpenPct(2, 2, 4)).toBe(25);
  });
  it('open rate = proposals with an open / proposals sent', () => {
    expect(openRatePct(3, 4)).toBe(75);
    expect(openRatePct(0, 0)).toBeNull();
  });
  it('average deal size is the mean of won values', () => {
    expect(avgDealSize([100_000, 200_000])).toBe(150_000);
    expect(avgDealSize([])).toBeNull();
  });
  it('median of an even count is the mean of the middle two, like percentile_cont', () => {
    expect(median([10, 30, 20, 40])).toBe(25);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([])).toBeNull();
  });
  it('pct rounds to two decimals', () => expect(pct(1, 3)).toBe(33.33));
  it('deltaPct is relative to the previous period and null without a base', () => {
    expect(deltaPct(150, 100)).toBe(50);
    expect(deltaPct(50, 100)).toBe(-50);
    expect(deltaPct(5, 0)).toBeNull();
    expect(deltaPct(null, 3)).toBeNull();
  });
  it('IST month starts at 18:30 UTC the evening before', () => {
    expect(new Date(startOfIstMonth(Date.parse('2026-11-02T10:00:00Z'))).toISOString()).toBe('2026-10-31T18:30:00.000Z');
    expect(new Date(periodSince('last_30d', T0)).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('derived facts from raw records', () => {
  const facts = buildFacts(book());
  const f = (id: number) => facts.find((x) => x.dealId === id)!;
  it('hours call -> proposal uses the FIRST SENT version, not the first drafted one', () => {
    expect(hoursCallToProposal(f(1))).toBe(10);
    expect(hoursCallToProposal(f(2))).toBe(30);
    expect(hoursCallToProposal(f(3))).toBe(60);
  });
  it('flags opened / sent per deal', () => {
    expect(f(4).proposalSent).toBe(true);
    expect(f(4).proposalOpened).toBe(false);
    expect(f(1).proposalOpened).toBe(true);
  });
});

describe('aggregates match the backend view (v_pipeline_calc)', () => {
  const facts = buildFacts(book());
  const now = T0 + 30 * D;
  it('overall: 2 won, 2 lost, 50% win rate, avg 150k, total 300k', () => {
    const [all] = pipelineMetrics(facts, 'overall' as never, 'all_time', now);
    expect(all).toMatchObject({ deals: 5, won: 2, lost: 2, win_rate_pct: 50, avg_deal_size_inr: 150_000, total_won_inr: 300_000, proposals_sent: 5, proposals_opened: 3, open_rate_pct: 60 });
    expect(all!.avg_hours_call_to_proposal).toBe(24.8); // (10+30+60+20+4)/5
    expect(all!.median_hours_call_to_proposal).toBe(20);
  });
  it('excludes test deals', () => {
    const rows = pipelineMetrics(facts, 'lead_source', 'all_time', now);
    expect(rows.find((r) => r.dimension_value === 'referral')).toMatchObject({ deals: 2, won: 2, win_rate_pct: 100, total_won_inr: 300_000 });
  });
  it('by lead source', () => {
    const li = pipelineMetrics(facts, 'lead_source', 'all_time', now).find((r) => r.dimension_value === 'linkedin')!;
    expect(li).toMatchObject({ deals: 3, won: 0, lost: 2, win_rate_pct: 0, avg_deal_size_inr: null });
  });
  it('by consultant uses the id as the dimension value', () => {
    expect(pipelineMetrics(facts, 'consultant', 'all_time', now)[0]!.dimension_value).toBe('1');
  });
  it('aggregate of nothing is safe', () => expect(aggregate([], 'x')).toMatchObject({ deals: 0, win_rate_pct: null, avg_deal_size_inr: null, total_won_inr: 0 }));
  it('speed buckets: under 24h, 24-48h, 48h+', () => {
    const b = speedBuckets(facts.filter((x) => !x.isTest));
    expect(b.map((x) => [x.bucket, x.decided, x.won])).toEqual([['lt_24h', 2, 1], ['24_48h', 1, 1], ['gt_48h', 1, 0]]);
  });
});

describe('overview window KPIs', () => {
  const db = book();
  const facts = buildFacts(db);
  const now = T0 + 40 * D;
  it('counts events inside the window only', () => {
    const k = kpisForWindow(db, facts, T0 + 12 * D, T0 + 20 * D, now);
    // won_at: deal1 (+12d) and deal2 (+14d) are inside; lost_at: deal3 (+15d) inside, deal4 (+20d) excluded (end is exclusive)
    expect(k).toMatchObject({ won: 2, lost: 1, win_rate_pct: 66.67, revenue_won_inr: 300_000, avg_deal_size_inr: 150_000 });
  });
  it('proposals sent / open rate / median are by first-sent date', () => {
    const k = kpisForWindow(db, facts, T0 + 5 * D, T0 + 8 * D, now);
    expect(k.proposals_sent).toBe(5);
    expect(k.open_rate_pct).toBe(60);
    expect(k.median_hours_call_to_proposal).toBe(20);
  });
  it('open pipeline at the end of the window excludes decided deals', () => {
    const k = kpisForWindow(db, facts, T0, T0 + 10 * D, now);
    expect(k.open_deals).toBe(5);
    expect(k.pipeline_value_inr).toBe(100_000 + 200_000 + 100_000 + 100_000 + 50_000);
    expect(k.win_rate_incl_open_pct).toBe(0); // 0 / (0 + 0 + 5)
    expect(k.win_rate_pct).toBeNull(); // nothing decided inside the window
  });
  it('test deals are hidden unless asked for', () => {
    const k = kpisForWindow(db, facts, T0, T0 + 40 * D, now);
    expect(k.revenue_won_inr).toBe(300_000);
    expect(kpisForWindow(db, facts, T0, T0 + 40 * D, now, { includeTest: true }).revenue_won_inr).toBe(300_000 + 9_999_999);
  });
  it('consultant filter', () => {
    expect(kpisForWindow(db, facts, T0, T0 + 40 * D, now, { consultantId: 99 }).won).toBe(0);
  });
  it('weekly buckets are contiguous, oldest first, 4 to 12 of them', () => {
    const w = weeklyBuckets(T0, T0 + 30 * D);
    expect(w).toHaveLength(5);
    for (let i = 1; i < w.length; i++) expect(w[i]!.from).toBe(w[i - 1]!.to);
    expect(w[w.length - 1]!.to).toBe(T0 + 30 * D);
    expect(weeklyBuckets(T0, T0 + 2 * D)).toHaveLength(4);
    expect(weeklyBuckets(T0, T0 + 400 * D)).toHaveLength(12);
  });
});
