/**
 * Shared metrics module. The ONLY place derived numbers are computed from raw records.
 * Formulas are the backend's (v_deal_facts / v_pipeline_calc in the "Setup" node, and backend/n8n/queries/overview.sql):
 *   win rate            = won / (won + lost)            for decided deals; secondary: won / (won + lost + open)
 *   average deal size   = mean(value_inr) of won deals
 *   hours call->proposal = first sent proposal's sent_at - the call's completed_at   (first completed call, first sent version)
 *   open rate           = proposals with >= 1 open / proposals sent
 *   median              = percentile_cont(0.5), i.e. mean of the two middle values for an even count
 */
import type { GroupBy, MetricPeriod } from '@/contracts/deal-api';
import type { Db, DbDeal } from './types';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const IST_OFFSET = 5.5 * HOUR;

export const ms = (iso: string | null | undefined): number | null => (iso ? Date.parse(iso) : null);
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
export const hoursBetween = (later: number | null, earlier: number | null): number | null => (later === null || earlier === null ? null : (later - earlier) / HOUR);

export function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? round2((100 * numerator) / denominator) : null;
}
/** won / (won + lost) in percent, null when nothing has been decided. */
export const winRatePct = (won: number, lost: number): number | null => pct(won, won + lost);
/** Secondary figure: counts open deals in the denominator too. */
export const winRateInclOpenPct = (won: number, lost: number, open: number): number | null => pct(won, won + lost + open);
export const openRatePct = (opened: number, sent: number): number | null => pct(opened, sent);
export function mean(xs: number[]): number | null {
  return xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length / 2;
  return round2(s.length % 2 ? s[Math.floor(mid)]! : (s[mid - 1]! + s[mid]!) / 2);
}
export const avgDealSize = (wonValues: number[]): number | null => mean(wonValues);

/** Start of the current IST month, as an epoch (matches date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'). */
export function startOfIstMonth(now: number): number {
  const d = new Date(now + IST_OFFSET);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - IST_OFFSET;
}
export function periodSince(period: MetricPeriod, now: number): number {
  switch (period) {
    case 'this_month': return startOfIstMonth(now);
    case 'last_30d': return now - 30 * DAY;
    case 'last_90d': return now - 90 * DAY;
    default: return Number.NEGATIVE_INFINITY;
  }
}

/** One row per deal; mirrors the v_deal_facts view. */
export interface DealFact {
  dealId: number; serviceType: string; leadSource: string; consultantId: number; stage: DbDeal['stage']; valueInr: number | null; createdAt: number; isTest: boolean;
  wonAt: number | null; lostAt: number | null; lostReason: string | null;
  callCompletedAt: number | null; callCompleted: boolean; briefReady: boolean; firstDraftedAt: number | null; firstSentAt: number | null;
  proposalDrafted: boolean; proposalSent: boolean; proposalOpened: boolean; proposalAccepted: boolean; decisionAt: number | null;
}

export function buildFacts(db: Db): DealFact[] {
  const callsByDeal = new Map<number, Db['calls']>();
  for (const c of db.calls) (callsByDeal.get(c.deal_id) ?? callsByDeal.set(c.deal_id, []).get(c.deal_id)!).push(c);
  const briefsByDeal = new Map<number, Db['briefs']>();
  for (const b of db.briefs) (briefsByDeal.get(b.deal_id) ?? briefsByDeal.set(b.deal_id, []).get(b.deal_id)!).push(b);
  const propsByDeal = new Map<number, Db['proposals']>();
  for (const p of db.proposals) (propsByDeal.get(p.deal_id) ?? propsByDeal.set(p.deal_id, []).get(p.deal_id)!).push(p);

  return db.deals.map((d) => {
    const calls = callsByDeal.get(d.id) ?? [];
    const completed = calls.filter((c) => c.status === 'completed' && c.completed_at);
    const props = propsByDeal.get(d.id) ?? [];
    const min = (xs: (number | null)[]): number | null => {
      const v = xs.filter((x): x is number => x !== null);
      return v.length ? Math.min(...v) : null;
    };
    const decisions = props
      .filter((p) => p.accepted_at || p.declined_at)
      .map((p) => Math.min(ms(p.accepted_at) ?? Infinity, ms(p.declined_at) ?? Infinity));
    return {
      dealId: d.id, serviceType: d.service_type, leadSource: d.lead_source, consultantId: d.consultant_id, stage: d.stage, valueInr: d.value_inr,
      createdAt: Date.parse(d.created_at), isTest: d.is_test, wonAt: ms(d.won_at), lostAt: ms(d.lost_at), lostReason: d.lost_reason,
      callCompletedAt: min(completed.map((c) => ms(c.completed_at))), callCompleted: completed.length > 0,
      briefReady: (briefsByDeal.get(d.id) ?? []).some((b) => b.status === 'ready'),
      firstDraftedAt: min(props.map((p) => ms(p.drafted_at))), firstSentAt: min(props.map((p) => ms(p.sent_at))),
      proposalDrafted: props.length > 0, proposalSent: props.some((p) => p.sent_at !== null), proposalOpened: props.some((p) => p.first_opened_at !== null),
      proposalAccepted: props.some((p) => p.accepted_at !== null), decisionAt: decisions.length ? Math.min(...decisions) : null,
    };
  });
}

/** Hours from the call finishing to the first sent version of the proposal. */
export function hoursCallToProposal(f: Pick<DealFact, 'firstSentAt' | 'callCompletedAt'>): number | null {
  return hoursBetween(f.firstSentAt, f.callCompletedAt);
}

export interface MetricRow {
  dimension_value: string; deals: number; calls_completed: number; proposals_sent: number; proposals_opened: number; won: number; lost: number;
  win_rate_pct: number | null; avg_deal_size_inr: number | null; total_won_inr: number;
  avg_hours_call_to_proposal: number | null; median_hours_call_to_proposal: number | null; avg_hours_proposal_to_decision: number | null;
  open_rate_pct: number | null; briefs_ready: number; brief_ready_pct: number | null; proposals_drafted: number; proposals_accepted: number; avg_hours_call_to_draft: number | null;
}

/** Aggregate a set of deal facts the way v_pipeline_calc aggregates one (dimension, value, period) group. */
export function aggregate(facts: DealFact[], dimensionValue: string): MetricRow {
  const won = facts.filter((f) => f.stage === 'won');
  const lost = facts.filter((f) => f.stage === 'lost');
  const sent = facts.filter((f) => f.proposalSent);
  const opened = facts.filter((f) => f.proposalOpened);
  const h2p = facts.map(hoursCallToProposal).filter((h): h is number => h !== null);
  const h2d = facts.map((f) => hoursBetween(f.firstDraftedAt, f.callCompletedAt)).filter((h): h is number => h !== null);
  const dec = facts.map((f) => hoursBetween(f.decisionAt, f.firstSentAt)).filter((h): h is number => h !== null);
  return {
    dimension_value: dimensionValue, deals: facts.length, calls_completed: facts.filter((f) => f.callCompleted).length,
    proposals_sent: sent.length, proposals_opened: opened.length, won: won.length, lost: lost.length,
    win_rate_pct: winRatePct(won.length, lost.length),
    avg_deal_size_inr: avgDealSize(won.map((f) => f.valueInr ?? 0)),
    total_won_inr: round2(won.reduce((s, f) => s + (f.valueInr ?? 0), 0)),
    avg_hours_call_to_proposal: mean(h2p), median_hours_call_to_proposal: median(h2p), avg_hours_proposal_to_decision: mean(dec),
    open_rate_pct: openRatePct(opened.length, sent.length),
    briefs_ready: facts.filter((f) => f.briefReady).length, brief_ready_pct: pct(facts.filter((f) => f.briefReady).length, facts.length),
    proposals_drafted: facts.filter((f) => f.proposalDrafted).length, proposals_accepted: facts.filter((f) => f.proposalAccepted).length,
    avg_hours_call_to_draft: mean(h2d),
  };
}

export function dimensionValueOf(f: DealFact, dim: GroupBy | 'overall'): string {
  switch (dim) {
    case 'overall': return 'all';
    case 'service_type': return f.serviceType;
    case 'lead_source': return f.leadSource;
    case 'service_type_x_lead_source': return `${f.serviceType}|${f.leadSource}`;
    case 'consultant': return String(f.consultantId);
  }
}

/** Equivalent of the pipeline_metrics rows for one dimension and period (cohort = deals created in the period, test deals excluded). */
export function pipelineMetrics(facts: DealFact[], dim: GroupBy | 'overall', period: MetricPeriod, now: number, consultantId?: number): MetricRow[] {
  const since = periodSince(period, now);
  const scope = facts.filter((f) => !f.isTest && f.createdAt >= since && (consultantId === undefined || f.consultantId === consultantId));
  const groups = new Map<string, DealFact[]>();
  for (const f of scope) {
    const k = dimensionValueOf(f, dim);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(f);
  }
  return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, fs]) => aggregate(fs, k));
}

/** Wins and losses by how long the proposal took after the call: <24h, 24-48h, 48h+. Only deals with a sent proposal and a decision count. */
export function speedBuckets(facts: DealFact[]) {
  const defs = [
    { bucket: 'lt_24h' as const, label: 'Under 24h', test: (h: number) => h < 24 },
    { bucket: '24_48h' as const, label: '24–48h', test: (h: number) => h >= 24 && h < 48 },
    { bucket: 'gt_48h' as const, label: 'Over 48h', test: (h: number) => h >= 48 },
  ];
  const decided = facts.filter((f) => (f.stage === 'won' || f.stage === 'lost') && hoursCallToProposal(f) !== null);
  return defs.map((d) => {
    const inB = decided.filter((f) => d.test(hoursCallToProposal(f)!));
    const won = inB.filter((f) => f.stage === 'won').length;
    return { bucket: d.bucket, label: d.label, decided: inB.length, won, lost: inB.length - won, win_rate_pct: pct(won, inB.length) };
  });
}

export function lostReasons(facts: DealFact[]): { reason: string; count: number }[] {
  const m = new Map<string, number>();
  for (const f of facts) if (f.stage === 'lost') m.set(f.lostReason?.trim() || 'unspecified', (m.get(f.lostReason?.trim() || 'unspecified') ?? 0) + 1);
  return [...m.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || (a.reason < b.reason ? -1 : 1));
}

/** The population the Win Rate page and the backend's pipeline_metrics both use. */
export function cohort(facts: DealFact[], period: MetricPeriod, now: number, consultantId?: number): DealFact[] {
  const since = periodSince(period, now);
  return facts.filter((f) => !f.isTest && f.createdAt >= since && (consultantId === undefined || f.consultantId === consultantId));
}

export interface KpiBlockValues {
  calls_booked: number; calls_due: number; calls_brief_ready: number; brief_ready_pct: number | null;
  proposals_sent: number; median_hours_call_to_proposal: number | null; open_rate_pct: number | null;
  won: number; lost: number; open_deals: number; win_rate_pct: number | null; win_rate_incl_open_pct: number | null;
  avg_deal_size_inr: number | null; revenue_won_inr: number; pipeline_value_inr: number;
}

/** KPIs for the window [from, to). Event-based: a deal counts as won/lost in the window its won_at / lost_at falls in. Mirrors overview.sql exactly. */
export function kpisForWindow(db: Db, facts: DealFact[], from: number, to: number, now: number, opts: { includeTest?: boolean; consultantId?: number } = {}): KpiBlockValues {
  const inWin = (t: number | null): boolean => t !== null && t >= from && t < to;
  const dealOk = (id: number): boolean => {
    const f = factById(facts, id);
    return !!f && (opts.includeTest || !f.isTest) && (opts.consultantId === undefined || f.consultantId === opts.consultantId);
  };
  const fs = facts.filter((f) => (opts.includeTest || !f.isTest) && (opts.consultantId === undefined || f.consultantId === opts.consultantId));
  const calls = db.calls.filter((c) => dealOk(c.deal_id));
  const briefByCall = new Map(db.briefs.map((b) => [b.call_id, b]));
  const due = calls.filter((c) => {
    const s = ms(c.scheduled_for);
    return s !== null && s >= from && s < to && s <= now && c.status !== 'canceled' && c.status !== 'rescheduled';
  });
  const dueReady = due.filter((c) => {
    const b = briefByCall.get(c.id);
    return !!b && b.status === 'ready' && (ms(b.generated_at) ?? Infinity) <= (ms(c.scheduled_for) ?? -Infinity);
  });
  const sentInWin = fs.filter((f) => inWin(f.firstSentAt));
  const wonInWin = fs.filter((f) => inWin(f.wonAt));
  const lostInWin = fs.filter((f) => inWin(f.lostAt));
  const openAtEnd = fs.filter((f) => f.createdAt < to && f.stage !== 'no_show' && (f.wonAt ?? f.lostAt ?? Infinity) >= to);
  const h = sentInWin.map(hoursCallToProposal).filter((x): x is number => x !== null);
  return {
    calls_booked: calls.filter((c) => inWin(ms(c.booked_at))).length, calls_due: due.length, calls_brief_ready: dueReady.length,
    brief_ready_pct: pct(dueReady.length, due.length),
    proposals_sent: sentInWin.length, median_hours_call_to_proposal: median(h),
    open_rate_pct: openRatePct(sentInWin.filter((f) => f.proposalOpened).length, sentInWin.length),
    won: wonInWin.length, lost: lostInWin.length, open_deals: openAtEnd.length,
    win_rate_pct: winRatePct(wonInWin.length, lostInWin.length),
    win_rate_incl_open_pct: winRateInclOpenPct(wonInWin.length, lostInWin.length, openAtEnd.length),
    avg_deal_size_inr: avgDealSize(wonInWin.map((f) => f.valueInr ?? 0)),
    revenue_won_inr: round2(wonInWin.reduce((s, f) => s + (f.valueInr ?? 0), 0)),
    pipeline_value_inr: round2(openAtEnd.reduce((s, f) => s + (f.valueInr ?? 0), 0)),
  };
}

const factIndexCache = new WeakMap<DealFact[], Map<number, DealFact>>();
function factById(facts: DealFact[], id: number): DealFact | undefined {
  let m = factIndexCache.get(facts);
  if (!m) factIndexCache.set(facts, (m = new Map(facts.map((f) => [f.dealId, f]))));
  return m.get(id);
}

export function weeklyBuckets(from: number, to: number): { i: number; from: number; to: number }[] {
  const n = Math.min(12, Math.max(4, Math.ceil((to - from) / (7 * DAY))));
  return Array.from({ length: n }, (_, i) => ({ i, from: to - (i + 1) * 7 * DAY, to: to - i * 7 * DAY })).reverse();
}

/** Percentage change versus the previous period; null when there is nothing to compare with. */
export function deltaPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}
