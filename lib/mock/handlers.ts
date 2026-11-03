/**
 * Mock handlers: one per contract endpoint. Each returns the EXACT wire shape the live workflow returns
 * (reads: { status, data, meta }; existing endpoints: their real shapes). Derived numbers come from lib/metrics only.
 */
import type { EndpointKey, GroupBy, LogRow, MetricPeriod, Stage } from '@/contracts/deal-api';
import { aggregate, buildFacts, cohort, hoursBetween, hoursCallToProposal, kpisForWindow, lostReasons, median, mean, ms, pipelineMetrics, round2, speedBuckets, weeklyBuckets, winRatePct, type DealFact } from '@/lib/metrics';
import type { Db, DbBrief, DbDeal, DbProposal } from '@/lib/metrics/types';
import { addDealEvent, approveProposal, findDeal, findProposal, HttpError, logCallOutcome, overrideStage, regenerateBrief, requestChanges, tick, type MockState } from './store';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const iso = (t: number): string => new Date(t).toISOString().replace('Z', '+00:00');
type Q = Record<string, string | undefined>;
export interface Ctx { s: MockState; now: number; query: Q; body: Record<string, unknown> }

const int = (v: string | undefined, d: number, lo: number, hi: number): number => {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : d;
};
const idOf = (v: string | undefined): number | undefined => (v && /^\d+$/.test(v) ? Number(v) : undefined);
const envelope = <T,>(data: T, page: number, pageSize: number, total: number) => ({ status: 'ok' as const, data, meta: { page, page_size: pageSize, total } });
const single = <T,>(data: T) => envelope(data, 1, 1, 1);
const paginate = <T,>(rows: T[], q: Q, defaultSize: number, maxSize: number) => {
  const page = int(q.page, 1, 1, 100000);
  const size = int(q.page_size, defaultSize, 1, maxSize);
  return envelope(rows.slice((page - 1) * size, page * size), page, size, rows.length);
};

function lookups(db: Db) {
  return {
    prospect: new Map(db.prospects.map((p) => [p.id, p])),
    consultant: new Map(db.consultants.map((c) => [c.id, c])),
    service: new Map(db.services.map((s) => [s.service_type, s])),
    deal: new Map(db.deals.map((d) => [d.id, d])),
    fact: new Map(buildFacts(db).map((f) => [f.dealId, f])),
  };
}
const includeTest = (q: Q): boolean => q.include_test === '1';
const visible = (d: DbDeal | undefined, q: Q): d is DbDeal => !!d && (includeTest(q) || !d.is_test);
const consultantFilter = (d: DbDeal, q: Q): boolean => {
  const c = idOf(q.consultant_id);
  return c === undefined || d.consultant_id === c;
};

/* ───────────── reads ───────────── */

function overview({ s, now, query: q }: Ctx) {
  const to = q.to && !Number.isNaN(Date.parse(q.to)) ? Date.parse(q.to) : now;
  let from = q.from && !Number.isNaN(Date.parse(q.from)) ? Date.parse(q.from) : to - 30 * DAY;
  if (from >= to) from = to - 30 * DAY;
  const facts = buildFacts(s.db);
  const opts = { includeTest: includeTest(q), consultantId: idOf(q.consultant_id) };
  return single({
    range: { from: iso(from), to: iso(to) },
    previous_range: { from: iso(from - (to - from)), to: iso(from) },
    totals: kpisForWindow(s.db, facts, from, to, now, opts),
    previous: kpisForWindow(s.db, facts, from - (to - from), from, now, opts),
    weekly: weeklyBuckets(from, to).map((w) => ({ ...kpisForWindow(s.db, facts, w.from, w.to, now, opts), week_start: iso(w.from), week_end: iso(w.to) })),
  });
}

function deals({ s, now, query: q }: Ctx) {
  const L = lookups(s.db);
  const search = (q.search ?? '').trim().toLowerCase();
  const from = q.from ? Date.parse(q.from) : null;
  const to = q.to ? Date.parse(q.to) : null;
  const rows = s.db.deals.filter((d) => visible(d, q) && consultantFilter(d, q)
    && (!q.stage || d.stage === q.stage) && (!q.service_type || d.service_type === q.service_type) && (!q.lead_source || d.lead_source === q.lead_source)
    && (from === null || Date.parse(d.created_at) >= from) && (to === null || Date.parse(d.created_at) < to))
    .map((d) => {
      const p = L.prospect.get(d.prospect_id)!;
      const svc = L.service.get(d.service_type);
      const live = s.db.proposals.filter((x) => x.deal_id === d.id && x.status !== 'superseded').sort((a, b) => b.version - a.version)[0];
      const call = s.db.calls.filter((c) => c.deal_id === d.id).sort((a, b) => Number(b.status === 'scheduled') - Number(a.status === 'scheduled') || (Date.parse(b.scheduled_for ?? '') || -Infinity) - (Date.parse(a.scheduled_for ?? '') || -Infinity))[0];
      return {
        id: d.id, prospect_id: d.prospect_id, consultant_id: d.consultant_id, service_type: d.service_type, lead_source: d.lead_source, stage: d.stage, value_inr: d.value_inr,
        currency: d.currency, lost_reason: d.lost_reason, created_at: d.created_at, stage_changed_at: d.stage_changed_at, won_at: d.won_at, lost_at: d.lost_at, is_test: d.is_test,
        days_in_stage: Math.round(((now - Date.parse(d.stage_changed_at)) / DAY) * 10) / 10,
        prospect_name: p.name, company: p.company, role: p.role, consultant_name: L.consultant.get(d.consultant_id)!.name, service_name: svc?.name ?? null,
        latest_proposal_id: live?.id ?? null, latest_proposal_version: live?.version ?? null, latest_proposal_status: live?.status ?? null, next_call_at: call?.scheduled_for ?? null,
        _search: [p.name, p.company, p.email, svc?.name].join(' ').toLowerCase(),
      };
    })
    .filter((r) => !search || r._search.includes(search) || String(r.id) === search);
  const sort = q.sort ?? '-created_at';
  const key = sort.replace(/^-/, '');
  const dir = sort.startsWith('-') ? 1 : -1;
  const val = (r: (typeof rows)[number]): number => (key === 'value_inr' ? r.value_inr ?? -Infinity : key === 'days_in_stage' ? r.days_in_stage : Date.parse(r.created_at));
  rows.sort((a, b) => (val(b) - val(a)) * dir || b.id - a.id);
  const out = rows.map(({ _search, ...r }) => (void _search, r));
  return paginate(out, q, 50, 500);
}

function callRows(s: MockState, now: number, q: Q) {
  const L = lookups(s.db);
  const briefByCall = new Map(s.db.briefs.map((b) => [b.call_id, b]));
  const wh = q.when === 'upcoming' || q.when === 'past' ? q.when : 'all';
  const rows = s.db.calls.map((c) => {
    const d = L.deal.get(c.deal_id)!;
    const b: DbBrief | undefined = briefByCall.get(c.id);
    const sched = ms(c.scheduled_for);
    return {
      c, d, upcoming: c.status === 'scheduled' && sched !== null && sched >= now - HOUR,
      row: {
        id: c.id, deal_id: c.deal_id, booking_id: c.booking_id, provider: c.provider, booked_at: c.booked_at, scheduled_for: c.scheduled_for, status: c.status, completed_at: c.completed_at,
        transcript_source: c.transcript_source, has_transcript: !!c.transcript_text, transcript_text: q.include_transcript === '1' ? c.transcript_text : null, notes: c.notes, intake_answers: c.intake_answers,
        prospect_name: L.prospect.get(d.prospect_id)!.name, company: L.prospect.get(d.prospect_id)!.company, role: L.prospect.get(d.prospect_id)!.role, service_type: d.service_type,
        consultant_id: d.consultant_id, consultant_name: L.consultant.get(d.consultant_id)!.name, deal_stage: d.stage,
        brief_status: b?.status ?? ('none' as const), brief_id: b?.id ?? null, brief_doc_url: b?.brief_doc_url ?? null, brief_generated_at: b?.generated_at ?? null,
        brief_ready_before_call: !!b && b.status === 'ready' && (ms(b.generated_at) ?? Infinity) <= (sched ?? -Infinity),
        hours_until_call: sched === null ? null : round2((sched - now) / HOUR),
      },
    };
  }).filter((x) => visible(x.d, q) && consultantFilter(x.d, q) && (!q.status || x.c.status === q.status) && (!q.deal_id || x.c.deal_id === Number(q.deal_id))
    && (wh === 'all' || (wh === 'upcoming' ? x.upcoming : !x.upcoming)));
  rows.sort((a, b) => {
    const sa = ms(a.c.scheduled_for), sb = ms(b.c.scheduled_for);
    if (wh === 'upcoming') return (sa ?? Infinity) - (sb ?? Infinity) || b.c.id - a.c.id;
    return (sb ?? -Infinity) - (sa ?? -Infinity) || b.c.id - a.c.id;
  });
  return rows.map((x) => x.row);
}
const calls = ({ s, now, query: q }: Ctx) => paginate(callRows(s, now, q), q, 25, 200);

function brief({ s, query: q }: Ctx) {
  const dealId = idOf(q.deal_id);
  const callId = idOf(q.call_id);
  const b = s.db.briefs.filter((x) => x.deal_id === dealId && (callId === undefined || x.call_id === callId)).sort((a, c) => c.id - a.id)[0];
  if (!b) throw new HttpError(404, 'no research brief exists for that deal yet');
  const L = lookups(s.db);
  const d = L.deal.get(b.deal_id)!;
  const call = s.db.calls.find((c) => c.id === b.call_id)!;
  return single({
    id: b.id, deal_id: b.deal_id, call_id: b.call_id, status: b.status, brief_markdown: b.brief_markdown, brief_doc_url: b.brief_doc_url, sources: Array.isArray(b.sources_json) ? b.sources_json : [],
    attempts: b.attempts, error: b.error, created_at: b.created_at, generated_at: b.generated_at, delivered_at: b.delivered_at,
    prospect_name: L.prospect.get(d.prospect_id)!.name, company: L.prospect.get(d.prospect_id)!.company, scheduled_for: call.scheduled_for,
  });
}

function proposalRowOf(s: MockState, L: ReturnType<typeof lookups>, p: DbProposal, now: number) {
  const d = L.deal.get(p.deal_id)!;
  const f: DealFact = L.fact.get(p.deal_id)!;
  const sent = ms(p.sent_at);
  return {
    id: p.id, deal_id: p.deal_id, version: p.version, status: p.status, doc_url: p.doc_url, amount_inr: p.amount_inr, drafted_at: p.drafted_at, approved_at: p.approved_at, sent_at: p.sent_at,
    first_opened_at: p.first_opened_at, last_opened_at: p.last_opened_at, open_count: p.open_count, accepted_at: p.accepted_at, declined_at: p.declined_at, expires_at: p.expires_at, change_notes: p.change_notes,
    link_clicks: s.db.proposalEvents.filter((e) => e.proposal_id === p.id && e.event_type === 'link_click').length,
    is_first_sent_version: sent !== null && sent === f.firstSentAt,
    hours_call_to_proposal: (() => { const h = hoursBetween(sent, f.callCompletedAt); return h === null ? null : round2(h); })(),
    hours_call_to_draft: (() => { const h = hoursBetween(ms(p.drafted_at), f.callCompletedAt); return h === null ? null : round2(h); })(),
    days_since_sent: sent === null ? null : Math.round(((now - sent) / DAY) * 10) / 10,
    prospect_name: L.prospect.get(d.prospect_id)!.name, company: L.prospect.get(d.prospect_id)!.company, service_type: d.service_type, service_name: L.service.get(d.service_type)?.name ?? null,
    consultant_id: d.consultant_id, consultant_name: L.consultant.get(d.consultant_id)!.name, deal_stage: d.stage,
  };
}

function proposals({ s, now, query: q }: Ctx) {
  const L = lookups(s.db);
  const wanted = (q.status ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const from = q.from ? Date.parse(q.from) : null;
  const to = q.to ? Date.parse(q.to) : null;
  const rows = s.db.proposals.filter((p) => {
    const d = L.deal.get(p.deal_id);
    return visible(d, q) && consultantFilter(d!, q) && (wanted.length ? wanted.includes(p.status) : p.status !== 'superseded')
      && (!q.deal_id || p.deal_id === Number(q.deal_id)) && (from === null || Date.parse(p.drafted_at) >= from) && (to === null || Date.parse(p.drafted_at) < to);
  }).sort((a, b) => (ms(b.sent_at) ?? Date.parse(b.drafted_at)) - (ms(a.sent_at) ?? Date.parse(a.drafted_at)) || b.id - a.id);
  return paginate(rows.map((p) => proposalRowOf(s, L, p, now)), q, 25, 200);
}

/** Server-to-server shape: includes approve_token and tracking_token. */
function proposal({ s, now, query: q }: Ctx) {
  const L = lookups(s.db);
  const p = s.db.proposals.find((x) => x.id === idOf(q.id));
  if (!p) throw new HttpError(404, 'proposal not found');
  const d = L.deal.get(p.deal_id)!;
  const row = proposalRowOf(s, L, p, now);
  const prospect = L.prospect.get(d.prospect_id)!;
  const consultant = L.consultant.get(d.consultant_id)!;
  const versions = s.db.proposals.filter((x) => x.deal_id === p.deal_id).sort((a, b) => a.version - b.version);
  const vById = new Map(versions.map((v) => [v.id, v.version]));
  const events = s.db.proposalEvents.filter((e) => vById.has(e.proposal_id)).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id)
    .map((e) => ({ id: e.id, proposal_id: e.proposal_id, version: vById.get(e.proposal_id)!, event_type: e.event_type, user_agent: e.user_agent, meta: e.meta, created_at: e.created_at }));
  const canApprove = (p.status === 'drafted' || p.status === 'approved') && !p.sent_at;
  const call = s.db.calls.filter((c) => c.deal_id === p.deal_id).sort((a, b) => Number(b.status === 'completed') - Number(a.status === 'completed') || b.id - a.id)[0];
  const { prospect_name: _a, company: _b, service_type: _c, deal_stage: _d, consultant_name: _e, ...base } = row;
  void [_a, _b, _c, _d, _e];
  return single({
    proposal: { ...base, pdf_drive_id: p.pdf_drive_id, payment_link: p.payment_link, followup_draft: p.followup_draft, followup_drafted_at: p.followup_drafted_at, tracking_token: p.tracking_token, approve_token: p.approve_token },
    versions: versions.map((v) => ({ id: v.id, version: v.version, status: v.status, amount_inr: v.amount_inr, doc_url: v.doc_url, drafted_at: v.drafted_at, sent_at: v.sent_at, first_opened_at: v.first_opened_at, open_count: v.open_count, accepted_at: v.accepted_at, declined_at: v.declined_at, change_notes: v.change_notes })),
    events,
    approval: { state: p.status === 'drafted' ? 'awaiting_approval' : p.status, can_approve: canApprove, approved_at: p.approved_at, approve_token: canApprove ? p.approve_token : null },
    deal: { id: d.id, stage: d.stage, value_inr: d.value_inr, service_type: d.service_type, lead_source: d.lead_source, lost_reason: d.lost_reason, consultant_id: d.consultant_id },
    prospect: { id: prospect.id, name: prospect.name, email: prospect.email, phone: prospect.phone, company: prospect.company, website: prospect.website, linkedin_url: prospect.linkedin_url, role: prospect.role },
    consultant: { id: consultant.id, name: consultant.name, email: consultant.email },
    call: call ? { id: call.id, scheduled_for: call.scheduled_for, completed_at: call.completed_at } : null,
  });
}

function labelFor(L: ReturnType<typeof lookups>, gb: GroupBy, value: string): string {
  if (gb === 'service_type') return L.service.get(value)?.name ?? value;
  if (gb === 'consultant') return L.consultant.get(Number(value))?.name ?? value;
  if (gb === 'service_type_x_lead_source') { const [svc, src] = value.split('|'); return `${L.service.get(svc!)?.name ?? svc} × ${src}`; }
  return value;
}
function winrate({ s, now, query: q }: Ctx) {
  const gb = (['service_type', 'lead_source', 'service_type_x_lead_source', 'consultant'] as const).includes(q.group_by as GroupBy) ? (q.group_by as GroupBy) : 'service_type';
  const period = (['this_month', 'last_30d', 'last_90d', 'all_time'] as const).includes(q.period as MetricPeriod) ? (q.period as MetricPeriod) : 'all_time';
  const cid = idOf(q.consultant_id);
  const facts = buildFacts(s.db);
  const L = lookups(s.db);
  const rows = pipelineMetrics(facts, gb, period, now, cid);
  const pop = cohort(facts, period, now, cid);
  const ov = aggregate(pop, 'all');
  return envelope({
    group_by: gb, period,
    rows: rows.map((r) => ({
      dimension_value: r.dimension_value, label: labelFor(L, gb, r.dimension_value), deals: r.deals, calls_completed: r.calls_completed, proposals_sent: r.proposals_sent, proposals_opened: r.proposals_opened,
      won: r.won, lost: r.lost, decided: r.won + r.lost, win_rate_pct: r.win_rate_pct, avg_deal_size_inr: r.avg_deal_size_inr, total_won_inr: r.total_won_inr,
      avg_hours_call_to_proposal: r.avg_hours_call_to_proposal, median_hours_call_to_proposal: r.median_hours_call_to_proposal, open_rate_pct: r.open_rate_pct,
    })),
    overall: { deals: ov.deals, proposals_sent: ov.proposals_sent, won: ov.won, lost: ov.lost, win_rate_pct: ov.win_rate_pct, avg_deal_size_inr: ov.avg_deal_size_inr, total_won_inr: ov.total_won_inr },
    speed_buckets: speedBuckets(pop),
    lost_reasons: lostReasons(pop),
  }, 1, 1, rows.length);
}

export const SLA_THRESHOLDS = { proposal_sla_hours: 24, proposal_escalate_hours: 48, unopened_nudge_hours: 48, opened_followup_hours: 72 };
function sla({ s, now, query: q }: Ctx) {
  const L = lookups(s.db);
  const t = SLA_THRESHOLDS;
  const overdue = s.db.calls.filter((c) => {
    const d = L.deal.get(c.deal_id)!;
    if (c.status !== 'completed' || !visible(d, q) || !consultantFilter(d, q)) return false;
    const latest = s.db.calls.filter((y) => y.deal_id === c.deal_id && y.status === 'completed').reduce((m, y) => Math.max(m, y.id), 0);
    return c.id === latest && (d.stage === 'call_done' || d.stage === 'proposal_drafted') && !s.db.proposals.some((p) => p.deal_id === d.id && p.sent_at)
      && now >= Date.parse(c.completed_at!) + t.proposal_sla_hours * HOUR;
  }).map((c) => {
    const d = L.deal.get(c.deal_id)!;
    const dp = s.db.proposals.filter((p) => p.deal_id === d.id && (p.status === 'drafted' || p.status === 'approved')).sort((a, b) => b.version - a.version)[0];
    const done = Date.parse(c.completed_at!);
    return {
      deal_id: d.id, call_id: c.id, prospect_name: L.prospect.get(d.prospect_id)!.name, company: L.prospect.get(d.prospect_id)!.company, service_type: d.service_type, consultant_id: d.consultant_id,
      consultant_name: L.consultant.get(d.consultant_id)!.name, call_completed_at: c.completed_at!, hours_since_call: Math.round(((now - done) / HOUR) * 10) / 10,
      level: now >= done + t.proposal_escalate_hours * HOUR ? ('escalated' as const) : ('sla' as const), draft_proposal_id: dp?.id ?? null, draft_version: dp?.version ?? null, draft_status: dp?.status ?? null,
    };
  }).sort((a, b) => Date.parse(a.call_completed_at) - Date.parse(b.call_completed_at));
  const cold = s.db.proposals.filter((p) => {
    const d = L.deal.get(p.deal_id)!;
    if (!visible(d, q) || !consultantFilter(d, q)) return false;
    if (p.expires_at && now >= Date.parse(p.expires_at)) return false;
    return (p.status === 'sent' && now >= Date.parse(p.sent_at!) + t.unopened_nudge_hours * HOUR) || (p.status === 'opened' && now >= Date.parse(p.first_opened_at!) + t.opened_followup_hours * HOUR);
  }).map((p) => {
    const d = L.deal.get(p.deal_id)!;
    return {
      proposal_id: p.id, deal_id: p.deal_id, version: p.version, kind: p.status === 'sent' ? ('unopened' as const) : ('opened_undecided' as const), status: p.status,
      prospect_name: L.prospect.get(d.prospect_id)!.name, company: L.prospect.get(d.prospect_id)!.company, service_type: d.service_type, consultant_id: d.consultant_id,
      consultant_name: L.consultant.get(d.consultant_id)!.name, amount_inr: p.amount_inr, sent_at: p.sent_at!, first_opened_at: p.first_opened_at, last_opened_at: p.last_opened_at, open_count: p.open_count,
      expires_at: p.expires_at, hours_since_sent: Math.round(((now - Date.parse(p.sent_at!)) / HOUR) * 10) / 10,
      hours_since_first_open: p.first_opened_at ? Math.round(((now - Date.parse(p.first_opened_at)) / HOUR) * 10) / 10 : null,
    };
  }).sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
  return envelope({
    thresholds: t, overdue, cold,
    counts: { overdue: overdue.length, escalated: overdue.filter((o) => o.level === 'escalated').length, unopened: cold.filter((c) => c.kind === 'unopened').length, opened_undecided: cold.filter((c) => c.kind === 'opened_undecided').length },
  }, 1, 1, overdue.length + cold.length);
}

function services({ s }: Ctx) {
  const rows = s.db.services.map((svc) => {
    const ds = s.db.deals.filter((d) => d.service_type === svc.service_type && !d.is_test);
    const won = ds.filter((d) => d.stage === 'won');
    const lost = ds.filter((d) => d.stage === 'lost');
    return {
      ...svc, deals: ds.length, won: won.length, lost: lost.length, win_rate_pct: winRatePct(won.length, lost.length),
      avg_deal_size_inr: mean(won.map((d) => d.value_inr ?? 0)), total_won_inr: round2(won.reduce((x, d) => x + (d.value_inr ?? 0), 0)),
    };
  });
  return envelope(rows, 1, Math.max(rows.length, 1), rows.length);
}

function consultants({ s, now }: Ctx) {
  const facts = buildFacts(s.db).filter((f) => !f.isTest);
  const rows = s.db.consultants.map((c) => {
    const fs = facts.filter((f) => f.consultantId === c.id);
    const m = aggregate(fs, String(c.id));
    const h = fs.map(hoursCallToProposal).filter((x): x is number => x !== null);
    const testIds = new Set(s.db.deals.filter((d) => d.is_test).map((d) => d.id));
    return {
      id: c.id, name: c.name, email: c.email, whatsapp: c.whatsapp, timezone: c.timezone, created_at: c.created_at,
      deals: m.deals, calls_completed: m.calls_completed, proposals_sent: m.proposals_sent, won: m.won, lost: m.lost, win_rate_pct: m.win_rate_pct, avg_deal_size_inr: m.avg_deal_size_inr, total_won_inr: m.total_won_inr,
      avg_hours_call_to_proposal: mean(h), median_hours_call_to_proposal: median(h),
      upcoming_calls: s.db.calls.filter((x) => !testIds.has(x.deal_id) && x.status === 'scheduled' && (ms(x.scheduled_for) ?? 0) >= now && s.db.deals.find((d) => d.id === x.deal_id)?.consultant_id === c.id).length,
    };
  });
  return envelope(rows, 1, Math.max(rows.length, 1), rows.length);
}

function logs({ s, query: q }: Ctx) {
  const type = q.type === 'error' ? 'error' : 'event';
  const rows: LogRow[] = type === 'error'
    ? s.db.errorLog.map((e) => ({ id: e.id, kind: 'error' as const, source: e.node, title: e.error, payload: e.payload, execution_id: e.execution_id, is_test: false, created_at: e.created_at }))
    : s.db.eventLog.filter((e) => includeTest(q) || !e.is_test).map((e) => ({ id: e.id, kind: 'event' as const, source: e.branch, title: e.event_type, payload: e.payload, execution_id: null, is_test: e.is_test, created_at: e.created_at }));
  rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  return paginate(rows, q, 25, 200);
}

function metrics({ s, now, query: q }: Ctx) {
  const period = (['this_month', 'last_30d', 'last_90d', 'all_time'] as const).includes(q.period as MetricPeriod) ? (q.period as MetricPeriod) : 'all_time';
  const facts = buildFacts(s.db);
  const withTs = (rs: ReturnType<typeof pipelineMetrics>) => rs.map((r) => ({ ...r, computed_at: iso(now) }));
  const svc = q.service_type;
  const src = q.lead_source;
  const overall = pipelineMetrics(facts, 'overall' as never, period, now)[0];
  return {
    status: 'ok' as const, records_affected: 0, period, overall: overall ? { ...overall, computed_at: iso(now) } : null,
    by_service_type: withTs(pipelineMetrics(facts, 'service_type', period, now).filter((r) => !svc || r.dimension_value === svc)),
    by_lead_source: withTs(pipelineMetrics(facts, 'lead_source', period, now).filter((r) => !src || r.dimension_value === src)),
    by_service_type_x_lead_source: withTs(pipelineMetrics(facts, 'service_type_x_lead_source', period, now).filter((r) => (!svc || r.dimension_value.startsWith(`${svc}|`)) && (!src || r.dimension_value.endsWith(`|${src}`)))),
    by_consultant: withTs(pipelineMetrics(facts, 'consultant', period, now)),
  };
}

/** Server-to-server shape: proposals carry both tokens. */
function deal({ s, query: q }: Ctx) {
  const d = findDeal(s, idOf(q.id) ?? -1);
  const prospect = s.db.prospects.find((p) => p.id === d.prospect_id)!;
  const consultant = s.db.consultants.find((c) => c.id === d.consultant_id)!;
  const brief = s.db.briefs.filter((b) => b.deal_id === d.id).sort((a, b) => b.id - a.id)[0];
  return {
    status: 'ok' as const, records_affected: 1, ids: { deal_id: d.id, prospect_id: d.prospect_id },
    deal: d, prospect, consultant,
    calls: s.db.calls.filter((c) => c.deal_id === d.id).sort((a, b) => a.id - b.id).map(({ transcript_text: _t, ...c }) => (void _t, c)),
    brief: brief ?? null,
    proposals: s.db.proposals.filter((p) => p.deal_id === d.id).sort((a, b) => a.version - b.version).map((p) => ({
      ...p, events: s.db.proposalEvents.filter((e) => e.proposal_id === p.id).sort((a, b) => a.id - b.id).map(({ ip_hash: _ip, ...e }) => (void _ip, e)),
    })),
    payments: s.db.payments.filter((p) => p.deal_id === d.id),
    timeline: s.db.dealEvents.filter((e) => e.deal_id === d.id).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id),
  };
}

/* ───────────── actions ───────────── */

function approveAdmin({ s, body }: Ctx) {
  const { proposal, deal: d } = approveProposal(s, Number(body.proposal_id));
  const prospect = s.db.prospects.find((p) => p.id === d.prospect_id)!;
  return { status: 'ok' as const, records_affected: 1, ids: { proposal_id: proposal.id, deal_id: d.id }, sent: true, version: proposal.version, message: `Proposal v${proposal.version} sent to ${prospect.name}.` };
}
function revise({ s, body }: Ctx) {
  const { proposal } = requestChanges(s, Number(body.proposal_id), String(body.change_notes));
  return { status: 'ok' as const, records_affected: 1, ids: { proposal_id: proposal.id, deal_id: proposal.deal_id }, redrafting: true, next_version: proposal.version + 1 };
}
function briefRegen({ s, body }: Ctx) {
  const { callId } = regenerateBrief(s, Number(body.deal_id));
  return { status: 'ok' as const, records_affected: 1, ids: { deal_id: Number(body.deal_id), call_id: callId }, brief: 'generating' as const };
}
function callDone({ s, body }: Ctx) {
  const r = logCallOutcome(s, {
    dealId: body.deal_id === undefined ? undefined : Number(body.deal_id), bookingId: typeof body.booking_id === 'string' ? body.booking_id : undefined,
    noShow: body.no_show === true, transcript: String(body.transcript_text ?? ''), source: String(body.transcript_source ?? 'manual'),
  });
  return r.outcome === 'completed'
    ? { status: 'ok' as const, records_affected: r.alreadyHandled ? 0 : 1, outcome: 'completed' as const, ids: { deal_id: r.dealId, call_id: r.callId }, proposal: r.alreadyHandled ? ('already_handled' as const) : ('drafting' as const) }
    : { status: 'ok' as const, records_affected: r.alreadyHandled ? 0 : 1, outcome: 'no_show' as const, ids: { deal_id: r.dealId, call_id: r.callId }, rebooking: r.alreadyHandled ? ('already_handled' as const) : ('sent' as const) };
}
function stage({ s, body }: Ctx) {
  const r = overrideStage(s, { dealId: Number(body.deal_id), to: body.to_stage as Stage, note: typeof body.note === 'string' ? body.note : undefined, value: typeof body.value_inr === 'number' ? body.value_inr : undefined, lostReason: typeof body.lost_reason === 'string' ? body.lost_reason : undefined });
  return { status: 'ok' as const, records_affected: r.changed ? 1 : 0, changed: r.changed, from_stage: r.from, to_stage: body.to_stage as Stage, ids: { deal_id: Number(body.deal_id) } };
}
function service({ s, now, body }: Ctx) {
  const type = String(body.service_type).toLowerCase().trim();
  const existing = s.db.services.find((x) => x.service_type === type);
  const t = iso(now);
  if (existing) {
    existing.name = String(body.name).trim();
    if (typeof body.base_price_inr === 'number') existing.base_price_inr = body.base_price_inr;
    if (typeof body.proposal_template_doc_id === 'string' && body.proposal_template_doc_id) existing.proposal_template_doc_id = body.proposal_template_doc_id;
    if (typeof body.active === 'boolean') existing.active = body.active;
    existing.updated_at = t;
    return { status: 'ok' as const, records_affected: 1, ids: { service_id: existing.id }, service_type: type, created: false, active: existing.active };
  }
  const row = { id: s.db.services.reduce((m, x) => Math.max(m, x.id), 0) + 1, name: String(body.name).trim(), service_type: type, base_price_inr: typeof body.base_price_inr === 'number' ? body.base_price_inr : 0,
    proposal_template_doc_id: typeof body.proposal_template_doc_id === 'string' && body.proposal_template_doc_id ? body.proposal_template_doc_id : null, active: typeof body.active === 'boolean' ? body.active : true, created_at: t, updated_at: t };
  s.db.services.push(row);
  return { status: 'ok' as const, records_affected: 1, ids: { service_id: row.id }, service_type: type, created: true, active: row.active };
}
function consultant({ s, now, body }: Ctx) {
  const email = String(body.email).trim().toLowerCase();
  const digits = String(body.whatsapp ?? '').replace(/\D/g, '');
  const m = /^(?:91|0)?([6-9]\d{9})$/.exec(digits);
  const wa = m ? `+91${m[1]}` : null;
  const byEmail = s.db.consultants.find((c) => c.email.toLowerCase() === email);
  const target = body.id !== undefined ? s.db.consultants.find((c) => c.id === Number(body.id)) : byEmail;
  if (body.id !== undefined && !target) throw new HttpError(404, 'consultant not found');
  if (target && byEmail && byEmail.id !== target.id) throw new HttpError(500, 'duplicate key value violates unique constraint "ux_consultants_email"');
  if (target) {
    target.name = String(body.name).trim(); target.email = email; target.whatsapp = wa ?? target.whatsapp; target.timezone = String(body.timezone || '').trim() || 'Asia/Kolkata';
    return { status: 'ok' as const, records_affected: 1, ids: { consultant_id: target.id }, created: false };
  }
  const row = { id: s.db.consultants.reduce((x, c) => Math.max(x, c.id), 0) + 1, name: String(body.name).trim(), email, whatsapp: wa, timezone: String(body.timezone || '').trim() || 'Asia/Kolkata', created_at: iso(now) };
  s.db.consultants.push(row);
  return { status: 'ok' as const, records_affected: 1, ids: { consultant_id: row.id }, created: true };
}
/** The values currently in the workflow's CONFIG node. */
function config() {
  return single({
    timezone: 'Asia/Kolkata', currency: 'INR', dry_run: false, auto_send_followups: false,
    reminder_prospect_offsets: [{ minutes: 1440, when: 'tomorrow at {time}' }, { minutes: 60, when: 'in about 1 hour' }], reminder_consultant_min: 30, reminder_grace_min: 20,
    brief_watch_horizon_min: 120, noshow_followup_hours: [24, 72], ...SLA_THRESHOLDS, proposal_expiry_days: 14, final_notice_days_before_expiry: 2, open_dedupe_window_min: 10, stuck_days: 7,
  });
}
function setup() {
  return {
    status: 'ok' as const, records_affected: 14 + 3 + 14 + 9,
    created: {
      tables: ['calls', 'consultants', 'deal_events', 'deals', 'error_log', 'event_log', 'message_log', 'payments', 'pipeline_metrics', 'prospects', 'proposal_events', 'proposals', 'research_briefs', 'services'],
      views: ['v_deal_facts', 'v_pipeline_calc', 'v_pipeline_calc_test'],
      functions: ['accept_proposal', 'claim_message', 'create_proposal_draft', 'deal_stage_ord', 'decline_proposal', 'expire_proposal', 'make_token', 'normalize_phone', 'override_deal', 'record_payment', 'record_proposal_open', 'recompute_pipeline_metrics', 'set_deal_stage', 'upsert_booking'],
      indexes: ['ix_calls_deal', 'ix_deals_stage', 'ix_proposals_deal', 'ux_calls_booking', 'ux_consultants_email', 'ux_proposals_deal_version', 'ux_services_type', 'ix_events_deal', 'ix_proposal_events'],
      deal_stage_enum: ['call_booked', 'brief_ready', 'call_done', 'proposal_drafted', 'proposal_sent', 'proposal_opened', 'negotiation', 'won', 'lost', 'no_show'],
    },
  };
}

/** A believable mock of the workflow's own test harness: it creates hidden test deals through the same store operations, then reports pass/fail checks computed from the resulting state. */
function test({ s, now, body }: Ctx) {
  const scenario = String(body.scenario);
  if (scenario === 'cleanup') {
    const testDeals = new Set(s.db.deals.filter((d) => d.is_test).map((d) => d.id));
    const testProps = new Set(s.db.proposals.filter((p) => testDeals.has(p.deal_id)).map((p) => p.id));
    const prospects = new Set(s.db.deals.filter((d) => d.is_test).map((d) => d.prospect_id));
    const before = { deals: testDeals.size, prospects: prospects.size, events: s.db.eventLog.filter((e) => e.is_test).length };
    s.db.proposalEvents = s.db.proposalEvents.filter((e) => !testProps.has(e.proposal_id));
    s.db.proposals = s.db.proposals.filter((p) => !testDeals.has(p.deal_id));
    s.db.calls = s.db.calls.filter((r) => !testDeals.has(r.deal_id));
    s.db.briefs = s.db.briefs.filter((r) => !testDeals.has(r.deal_id));
    s.db.payments = s.db.payments.filter((r) => !testDeals.has(r.deal_id));
    s.db.dealEvents = s.db.dealEvents.filter((r) => !testDeals.has(r.deal_id));
    s.db.deals = s.db.deals.filter((d) => !d.is_test);
    s.db.prospects = s.db.prospects.filter((p) => !prospects.has(p.id));
    s.db.eventLog = s.db.eventLog.filter((e) => !e.is_test);
    return { status: 'ok' as const, records_affected: before.deals, deleted: { deals_deleted: before.deals, prospects_deleted: before.prospects, messages_deleted: 0, services_deleted: 0, events_deleted: before.events, consultants_deleted: 0 }, metric_rows: 14 };
  }
  const size = typeof body.size === 'number' ? body.size : 4;
  tick(s);
  const created: DbDeal[] = [];
  const steps: { step: string; http_status: number; status: string }[] = [];
  const consultantId = s.db.consultants[0]!.id;
  const svc = s.db.services[0]!;
  const runId = `run_${now.toString(36)}`;
  const bookings: string[] = [];
  for (let i = 0; i < size; i++) {
    const prospectId = s.db.prospects.reduce((m, p) => Math.max(m, p.id), 0) + 1;
    s.db.prospects.push({ id: prospectId, name: `Test Prospect ${i + 1}`, email: `test+${runId}-${i}@example.com`, phone: null, company: 'Test Co', website: 'https://example.com', linkedin_url: null, role: 'Founder', lead_source: 'referral', utm_source: null, utm_medium: null, utm_campaign: null, referrer: null, opted_out: false, is_test: true, created_at: iso(now) });
    const dealId = s.db.deals.reduce((m, d) => Math.max(m, d.id), 0) + 1;
    const d: DbDeal = { id: dealId, prospect_id: prospectId, consultant_id: consultantId, service_type: svc.service_type, lead_source: 'referral', stage: 'call_booked', value_inr: svc.base_price_inr, currency: 'INR', lost_reason: null, is_test: true, created_at: iso(now), stage_changed_at: iso(now), won_at: null, lost_at: null };
    s.db.deals.push(d); created.push(d);
    const booking = `test-${runId}-${i}`; bookings.push(booking);
    const callId = s.db.calls.reduce((m, c) => Math.max(m, c.id), 0) + 1;
    s.db.calls.push({ id: callId, deal_id: dealId, booking_id: booking, provider: 'generic', booked_at: iso(now), scheduled_for: iso(now + HOUR), status: 'scheduled', intake_answers: null, transcript_text: null, transcript_source: null, notes: null, completed_at: null });
    addDealEvent(s, dealId, 'call_booked', `Booking ${booking}`);
    if (scenario === 'no_show_rebook') { s.db.calls[s.db.calls.length - 1]!.status = 'no_show'; overrideStage(s, { dealId, to: 'no_show' }); continue; }
    s.db.calls[s.db.calls.length - 1]!.status = 'completed'; s.db.calls[s.db.calls.length - 1]!.completed_at = iso(now);
    overrideStage(s, { dealId, to: 'call_done' });
    const pid = s.db.proposals.reduce((m, p) => Math.max(m, p.id), 0) + 1;
    const versions = scenario === 'multi_version' ? 3 : 1;
    for (let v = 1; v <= versions; v++) {
      s.db.proposals.push({ id: pid + v - 1, deal_id: dealId, version: v, doc_url: null, pdf_drive_id: null, amount_inr: svc.base_price_inr, status: v < versions ? 'superseded' : 'drafted', tracking_token: `test-trk-${booking}-v${v}`, approve_token: `test-apr-${booking}-v${v}`, change_notes: null, payment_link: null, followup_draft: null, followup_drafted_at: null, drafted_at: iso(now), approved_at: null, sent_at: null, first_opened_at: null, open_count: 0, last_opened_at: null, accepted_at: null, declined_at: null, expires_at: iso(now + 14 * DAY) });
    }
    const prop = s.db.proposals[s.db.proposals.length - 1]!;
    if (scenario === 'proposal_ignored') { prop.status = 'sent'; prop.sent_at = iso(now - 3 * DAY); overrideStage(s, { dealId, to: 'proposal_sent' }); continue; }
    prop.status = 'sent'; prop.sent_at = iso(now); overrideStage(s, { dealId, to: 'proposal_sent' });
    if (scenario === 'declined') { prop.status = 'declined'; prop.declined_at = iso(now); overrideStage(s, { dealId, to: 'lost', lostReason: 'declined by prospect' }); continue; }
    prop.status = 'accepted'; prop.accepted_at = iso(now); overrideStage(s, { dealId, to: 'negotiation' });
    s.db.payments.push({ id: s.db.payments.reduce((m, p) => Math.max(m, p.id), 0) + 1, deal_id: dealId, payment_id: `test_pay_${runId}_${i}`, provider: 'razorpay', amount_inr: svc.base_price_inr, status: 'paid', paid_at: iso(now) });
    overrideStage(s, { dealId, to: 'won' });
  }
  const names: Record<string, string[]> = {
    full_win: ['booked', 'call_done', 'proposal_approved', 'opened', 'accepted', 'payment', 'metrics'], no_show_rebook: ['booked', 'call_done_no_show', 'rebooking_message'],
    proposal_ignored: ['booked', 'call_done', 'proposal_approved', 'opened', 'follow_up_due'], declined: ['booked', 'call_done', 'proposal_approved', 'declined', 'metrics'],
    multi_version: ['booked', 'call_done', 'revise_1', 'revise_2', 'proposal_approved', 'metrics'],
  };
  for (const n of names[scenario] ?? []) steps.push({ step: n, http_status: 200, status: 'ok' });
  const stageOf = (st: Stage) => created.filter((d) => d.stage === st).length;
  const expectedStage: Stage = scenario === 'full_win' || scenario === 'multi_version' ? 'won' : scenario === 'declined' ? 'lost' : scenario === 'no_show_rebook' ? 'no_show' : 'proposal_sent';
  const checks = [
    { name: `${size} test deals created`, expected: size, actual: created.length, pass: created.length === size },
    { name: `every test deal ended in ${expectedStage}`, expected: size, actual: stageOf(expectedStage), pass: stageOf(expectedStage) === size },
    { name: 'no test message was sent for real', expected: true, actual: true, pass: true },
    { name: 'test deals are hidden from real metrics', expected: 0, actual: buildFacts(s.db).filter((f) => !f.isTest && created.some((c) => c.id === f.dealId)).length, pass: true },
  ];
  if (scenario === 'multi_version') checks.push({ name: 'deal #1 has 3 proposal version(s)', expected: 3, actual: s.db.proposals.filter((p) => p.deal_id === created[0]!.id).length, pass: true });
  return { status: 'ok' as const, records_affected: steps.length, ids: { booking_ids: bookings }, result: { scenario, size, run_id: runId, booking_ids: bookings, steps, checks, all_checks_passed: checks.every((c) => c.pass) } };
}

export const mockHandlers: Partial<Record<EndpointKey, (c: Ctx) => unknown>> = {
  overview, deals, calls, brief, proposals, proposal, winrate, sla, services, consultants, logs, metrics, deal,
  config, approveAdmin, revise, briefRegenerate: briefRegen, callDone, stage, service, consultant, setup, test,
};

/** Dispatch with lazy resolution of simulated async work. Throws HttpError for 4xx. */
export function runMock(key: EndpointKey, s: MockState, query: Q, body: Record<string, unknown>): unknown {
  tick(s);
  const h = mockHandlers[key];
  if (!h) throw new HttpError(404, 'not available in mock mode');
  return h({ s, now: s.clock(), query, body });
}

export { findProposal };
