import { describe, expect, it } from 'vitest';
import { buildFacts, kpisForWindow, round2 } from '@/lib/metrics';
import { generateSeed } from '@/lib/mock/seed';
import { measureStory, storyProblems } from '@/lib/mock/story';
import { D, H, NOW } from './helpers';

const db = generateSeed({ now: NOW });
const real = db.deals.filter((d) => !d.is_test);

describe('sample data: Northstar Growth Partners', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(generateSeed({ now: NOW }))).toBe(JSON.stringify(db));
  });
  it('has the shape that was asked for', () => {
    expect(db.consultants).toHaveLength(4);
    expect(db.services.map((s) => [s.name, s.base_price_inr])).toEqual([
      ['AI Automation Setup', 150_000], ['Webinar Funnel Build', 80_000], ['Content Repurposing Retainer', 45_000], ['Sales Process Consulting', 200_000], ['Brand Strategy Sprint', 60_000],
    ]);
    expect(new Set(real.map((d) => d.lead_source))).toEqual(new Set(['linkedin_outbound', 'instagram', 'referral', 'webinar', 'google_search', 'cold_email']));
    expect(real.length).toBeGreaterThanOrEqual(250);
    expect(real.length).toBeLessThanOrEqual(280);
    const oldest = Math.min(...real.map((d) => Date.parse(d.created_at)));
    expect(NOW - oldest).toBeGreaterThan(100 * D);
    expect(NOW - oldest).toBeLessThanOrEqual(121 * D);
  });
  it.each(['2026-11-02T10:00:00Z', '2026-11-02T22:30:00Z', '2026-12-09T05:15:00Z', '2027-02-17T13:45:00Z'])('tells the intended story on %s', (d) => {
    const now = Date.parse(d);
    expect(storyProblems(measureStory(generateSeed({ now }), now))).toEqual([]);
  });
  it('has proposal versions 1 to 3, with some deals revised', () => {
    const maxV = Math.max(...db.proposals.map((p) => p.version));
    expect(maxV).toBe(3);
    expect(db.proposals.filter((p) => p.version === 2).length).toBeGreaterThan(20);
  });
  it('has every proposal status and open counts between 0 and 9', () => {
    const statuses = new Set(db.proposals.map((p) => p.status));
    for (const s of ['drafted', 'sent', 'opened', 'accepted', 'declined', 'expired', 'superseded']) expect(statuses.has(s as never)).toBe(true);
    expect(Math.max(...db.proposals.map((p) => p.open_count))).toBeLessThanOrEqual(9);
    expect(db.proposals.some((p) => p.open_count === 0 && p.sent_at)).toBe(true);
  });
  it('has the four lost reasons', () => {
    expect(new Set(real.filter((d) => d.stage === 'lost').map((d) => d.lost_reason))).toEqual(new Set(['budget', 'timing', 'went with competitor', 'no response']));
  });
  it('has no-shows, reschedules, cancellations and a few failed or pending briefs', () => {
    const calls = new Set(db.calls.map((c) => c.status));
    for (const s of ['scheduled', 'completed', 'no_show', 'canceled', 'rescheduled']) expect(calls.has(s as never)).toBe(true);
    expect(db.briefs.some((b) => b.status === 'failed')).toBe(true);
    expect(db.briefs.some((b) => b.status === 'pending')).toBe(true);
  });
  it('hides test rows by marking them is_test', () => {
    expect(db.deals.filter((d) => d.is_test).length).toBeGreaterThan(0);
    expect(db.errorLog.length).toBeGreaterThanOrEqual(3);
  });
});

describe('sample data is internally consistent', () => {
  const callsByDeal = (id: number) => db.calls.filter((c) => c.deal_id === id);
  const propsByDeal = (id: number) => db.proposals.filter((p) => p.deal_id === id);
  it('every won deal has a payment equal to its value and a won_at; every lost deal has a reason and lost_at', () => {
    for (const d of real) {
      if (d.stage === 'won') {
        const pays = db.payments.filter((p) => p.deal_id === d.id);
        expect(pays).toHaveLength(1);
        expect(pays[0]!.amount_inr).toBe(d.value_inr);
        expect(d.won_at).toBe(pays[0]!.paid_at);
      }
      if (d.stage === 'lost') { expect(d.lost_reason).toBeTruthy(); expect(d.lost_at).toBeTruthy(); }
    }
  });
  it('the proposal is sent after the call finished and after it was drafted', () => {
    for (const p of db.proposals) {
      if (!p.sent_at) continue;
      const done = callsByDeal(p.deal_id).filter((c) => c.completed_at).map((c) => Date.parse(c.completed_at!));
      expect(done.length).toBeGreaterThan(0);
      expect(Date.parse(p.sent_at)).toBeGreaterThan(Math.min(...done));
      expect(Date.parse(p.sent_at)).toBeGreaterThanOrEqual(Date.parse(p.drafted_at));
    }
  });
  it('nothing happens in the future', () => {
    const future = (t: string | null) => t !== null && Date.parse(t) > NOW + 1000;
    for (const p of db.proposals) for (const k of ['drafted_at', 'sent_at', 'first_opened_at', 'last_opened_at', 'accepted_at', 'declined_at'] as const) expect(future(p[k])).toBe(false);
    for (const c of db.calls) expect(future(c.completed_at)).toBe(false);
    for (const e of db.dealEvents) expect(future(e.created_at)).toBe(false);
  });
  it('open_count equals the number of open events, and the open/accept/decline timestamps line up', () => {
    for (const p of db.proposals) {
      const opens = db.proposalEvents.filter((e) => e.proposal_id === p.id && e.event_type === 'open');
      expect(opens.length).toBe(p.open_count);
      if (p.open_count > 0) {
        expect(Date.parse(p.first_opened_at!)).toBe(Math.min(...opens.map((e) => Date.parse(e.created_at))));
        expect(Date.parse(p.last_opened_at!)).toBeGreaterThanOrEqual(Date.parse(p.first_opened_at!));
      }
      if (p.status === 'accepted') expect(db.proposalEvents.some((e) => e.proposal_id === p.id && e.event_type === 'accept_click')).toBe(true);
      if (p.status === 'declined') expect(db.proposalEvents.some((e) => e.proposal_id === p.id && e.event_type === 'decline_click')).toBe(true);
    }
  });
  it('only the newest version of an unsent deal is live; superseded versions were never sent', () => {
    for (const d of real) {
      const ps = propsByDeal(d.id).sort((a, b) => a.version - b.version);
      for (const p of ps.slice(0, -1)) { expect(p.status).toBe('superseded'); expect(p.sent_at).toBeNull(); }
    }
  });
  it("each deal's stage equals the destination of its last stage_change event, and the timeline is chronological", () => {
    for (const d of real) {
      const evs = db.dealEvents.filter((e) => e.deal_id === d.id);
      const stages = evs.filter((e) => e.event_type === 'stage_change');
      expect(stages[stages.length - 1]!.to_stage).toBe(d.stage);
      for (let i = 1; i < evs.length; i++) expect(Date.parse(evs[i]!.created_at)).toBeGreaterThanOrEqual(Date.parse(evs[i - 1]!.created_at));
    }
  });
  it('ids are unique and references resolve', () => {
    const ids = (rows: { id: number }[]) => new Set(rows.map((r) => r.id)).size === rows.length;
    for (const t of [db.deals, db.calls, db.briefs, db.proposals, db.proposalEvents, db.prospects, db.dealEvents, db.payments] as { id: number }[][]) expect(ids(t)).toBe(true);
    const dealIds = new Set(db.deals.map((d) => d.id));
    for (const c of db.calls) expect(dealIds.has(c.deal_id)).toBe(true);
    for (const p of db.proposals) expect(dealIds.has(p.deal_id)).toBe(true);
  });
});

describe('KPIs add up: the overview equals a naive recount of the raw records', () => {
  const facts = buildFacts(db);
  const from = NOW - 30 * D;
  const to = NOW;
  const inW = (t: string | null) => t !== null && Date.parse(t) >= from && Date.parse(t) < to;
  const k = kpisForWindow(db, facts, from, to, NOW);
  const realIds = new Set(real.map((d) => d.id));

  it('proposals sent = deals whose first sent version went out in the window', () => {
    const firstSent = new Map<number, number>();
    for (const p of db.proposals) if (p.sent_at && realIds.has(p.deal_id)) firstSent.set(p.deal_id, Math.min(firstSent.get(p.deal_id) ?? Infinity, Date.parse(p.sent_at)));
    expect([...firstSent.values()].filter((t) => t >= from && t < to).length).toBe(k.proposals_sent);
  });
  it('won / lost / revenue / average deal size', () => {
    const won = real.filter((d) => inW(d.won_at));
    const lost = real.filter((d) => inW(d.lost_at));
    expect(k.won).toBe(won.length);
    expect(k.lost).toBe(lost.length);
    expect(k.revenue_won_inr).toBe(won.reduce((s, d) => s + (d.value_inr ?? 0), 0));
    expect(k.avg_deal_size_inr).toBe(won.length ? round2(won.reduce((s, d) => s + (d.value_inr ?? 0), 0) / won.length) : null);
    expect(k.win_rate_pct).toBe(won.length + lost.length ? round2((100 * won.length) / (won.length + lost.length)) : null);
    // revenue also equals the payments recorded in the window
    expect(k.revenue_won_inr).toBe(db.payments.filter((p) => realIds.has(p.deal_id) && inW(p.paid_at)).reduce((s, p) => s + p.amount_inr, 0));
  });
  it('median hours call -> proposal, recounted by hand', () => {
    const hours: number[] = [];
    for (const d of real) {
      const sent = db.proposals.filter((p) => p.deal_id === d.id && p.sent_at).map((p) => Date.parse(p.sent_at!));
      const done = db.calls.filter((c) => c.deal_id === d.id && c.status === 'completed').map((c) => Date.parse(c.completed_at!));
      if (!sent.length || !done.length) continue;
      const first = Math.min(...sent);
      if (first >= from && first < to) hours.push((first - Math.min(...done)) / H);
    }
    hours.sort((a, b) => a - b);
    const mid = hours.length / 2;
    const expected = hours.length % 2 ? hours[Math.floor(mid)]! : (hours[mid - 1]! + hours[mid]!) / 2;
    expect(k.median_hours_call_to_proposal).toBe(round2(expected));
  });
  it('open rate = proposals with an open / proposals sent', () => {
    const sent = new Map<number, { t: number; opened: boolean }>();
    for (const p of db.proposals) if (p.sent_at && realIds.has(p.deal_id)) {
      const cur = sent.get(p.deal_id) ?? { t: Infinity, opened: false };
      sent.set(p.deal_id, { t: Math.min(cur.t, Date.parse(p.sent_at)), opened: cur.opened || p.first_opened_at !== null });
    }
    const inWin = [...sent.values()].filter((x) => x.t >= from && x.t < to);
    expect(k.open_rate_pct).toBe(inWin.length ? round2((100 * inWin.filter((x) => x.opened).length) / inWin.length) : null);
  });
  it('calls booked and brief-ready-before-call', () => {
    expect(k.calls_booked).toBe(db.calls.filter((c) => realIds.has(c.deal_id) && inW(c.booked_at)).length);
    const due = db.calls.filter((c) => realIds.has(c.deal_id) && inW(c.scheduled_for) && Date.parse(c.scheduled_for!) <= NOW && c.status !== 'canceled' && c.status !== 'rescheduled');
    const ready = due.filter((c) => { const b = db.briefs.find((x) => x.call_id === c.id); return b?.status === 'ready' && Date.parse(b.generated_at!) <= Date.parse(c.scheduled_for!); });
    expect(k.calls_due).toBe(due.length);
    expect(k.calls_brief_ready).toBe(ready.length);
  });
  it('pipeline value is the sum of open deals', () => {
    const open = real.filter((d) => !['won', 'lost', 'no_show'].includes(d.stage));
    expect(k.open_deals).toBe(open.length);
    expect(k.pipeline_value_inr).toBe(open.reduce((s, d) => s + (d.value_inr ?? 0), 0));
  });
});
