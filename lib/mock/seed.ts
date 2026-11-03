/**
 * Deterministic sample data for the fictional consultancy "Northstar Growth Partners".
 * ~260 deals over 120 days, generated from a seeded PRNG so every run (and every test) sees the same records.
 * The story is produced by the generator's parameters (lead-source win odds, consultant speed, service prices),
 * NOT by hard-coded totals: every KPI is computed from these raw records by lib/metrics.
 */
import type { Stage } from '@/contracts/deal-api';
import type { Db, DbCall, DbBrief, DbDeal, DbDealEvent, DbProposal, DbProposalEvent, DbProspect } from '@/lib/metrics/types';
import { buildBrief, buildTranscript, COMPANY_PREFIXES, COMPANY_SUFFIXES, FIRST_NAMES, LAST_NAMES, ROLES } from './content';

export const CONSULTANCY_NAME = 'Northstar Growth Partners';
const HOUR = 3_600_000;
const DAY = 86_400_000;
const IST = 5.5 * HOUR;

export const SERVICE_DEFS = [
  { service_type: 'ai_automation', name: 'AI Automation Setup', base: 150_000 },
  { service_type: 'webinar_funnel', name: 'Webinar Funnel Build', base: 80_000 },
  { service_type: 'content_repurposing', name: 'Content Repurposing Retainer', base: 45_000 },
  { service_type: 'sales_process', name: 'Sales Process Consulting', base: 200_000 },
  { service_type: 'brand_strategy', name: 'Brand Strategy Sprint', base: 60_000 },
] as const;

type SourceKey = 'linkedin_outbound' | 'instagram' | 'referral' | 'webinar' | 'google_search' | 'cold_email';
interface SourceDef { key: SourceKey; weight: number; baseWin: number; discount: [number, number]; services: Record<string, number>; utm: [string, string] }
/** Win odds are the lever that produces the story: referrals win most, LinkedIn volume wins least, Instagram skews to small services. */
const SOURCES: SourceDef[] = [
  { key: 'linkedin_outbound', weight: 0.31, baseWin: 0.17, discount: [0.9, 1.04], services: { ai_automation: 3, sales_process: 3, webinar_funnel: 1.5, content_repurposing: 1.5, brand_strategy: 1 }, utm: ['linkedin', 'outbound'] },
  { key: 'instagram', weight: 0.14, baseWin: 0.21, discount: [0.8, 0.94], services: { content_repurposing: 5, brand_strategy: 4, webinar_funnel: 1.5, ai_automation: 0.4, sales_process: 0.2 }, utm: ['instagram', 'social'] },
  { key: 'referral', weight: 0.12, baseWin: 0.86, discount: [0.96, 1.1], services: { sales_process: 4, ai_automation: 3, webinar_funnel: 1.5, brand_strategy: 1.2, content_repurposing: 0.8 }, utm: ['referral', 'partner'] },
  { key: 'webinar', weight: 0.15, baseWin: 0.36, discount: [0.9, 1.05], services: { webinar_funnel: 5, ai_automation: 2, sales_process: 1.5, content_repurposing: 1.5, brand_strategy: 1 }, utm: ['webinar', 'event'] },
  { key: 'google_search', weight: 0.17, baseWin: 0.33, discount: [0.9, 1.06], services: { ai_automation: 3, sales_process: 2.5, brand_strategy: 2, webinar_funnel: 1.5, content_repurposing: 1.5 }, utm: ['google', 'cpc'] },
  { key: 'cold_email', weight: 0.11, baseWin: 0.2, discount: [0.88, 1.02], services: { ai_automation: 3, sales_process: 3, webinar_funnel: 1.5, content_repurposing: 1.5, brand_strategy: 1.5 }, utm: ['email', 'cold'] },
];

/** Speed matters: proposals sent within 24h of the call win roughly twice as often as those sent after 48h. */
const speedMultiplier = (hours: number): number => (hours < 24 ? 1.3 : hours < 48 ? 0.9 : 0.62);

interface ConsultantDef { name: string; email: string; whatsapp: string; weight: number; winMult: number; delay: (u: () => number) => number; role: string }
const CONSULTANTS: ConsultantDef[] = [
  { name: 'Aarav Mehta', email: 'aarav@northstargrowth.in', whatsapp: '+919810011201', weight: 0.3, winMult: 1.08, role: 'fast', delay: (u) => 2 + u() * 17 },
  { name: 'Kavya Nair', email: 'kavya@northstargrowth.in', whatsapp: '+919820022302', weight: 0.22, winMult: 0.92, role: 'slow', delay: (u) => 28 + u() * 52 },
  { name: 'Rohan Iyer', email: 'rohan@northstargrowth.in', whatsapp: '+919830033403', weight: 0.25, winMult: 1, role: 'average', delay: (u) => (u() < 0.62 ? 6 + u() * 26 : 30 + u() * 28) },
  { name: 'Sneha Kulkarni', email: 'sneha@northstargrowth.in', whatsapp: '+919840044504', weight: 0.23, winMult: 1, role: 'average', delay: (u) => (u() < 0.58 ? 8 + u() * 24 : 30 + u() * 30) },
];

export interface SeedOptions { now: number; seed?: number; deals?: number }

function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const iso = (t: number): string => new Date(t).toISOString().replace('Z', '+00:00');

/** Snap an instant to a 30-minute slot between 10:00 and 17:30 IST on the same IST day. */
function businessSlot(t: number, u: () => number): number {
  const d = new Date(t + IST);
  const day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return day0 + (10 + Math.floor(u() * 8)) * HOUR + (u() < 0.5 ? 0 : 0.5 * HOUR) - IST;
}

interface Plan { createdAt: number; source: SourceDef; service: (typeof SERVICE_DEFS)[number]; consultantIdx: number; forceScheduled?: number; briefState?: 'ready' | 'pending' | 'failed'; awaitingHours?: number }

/** Found with scripts/find-seed.ts: the first seed whose story holds for several reference dates. */
export const DEFAULT_SEED = 301;

export function generateSeed({ now, seed = DEFAULT_SEED, deals: nDeals = 256 }: SeedOptions): Db {
  const rng = mulberry32(seed);
  const u = () => rng();
  const between = (a: number, b: number) => a + u() * (b - a);
  const int = (a: number, b: number) => Math.floor(between(a, b + 1));
  const chance = (p: number) => u() < p;
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(u() * xs.length)]!;
  const weighted = <T,>(xs: readonly (readonly [T, number])[]): T => {
    const total = xs.reduce((s, [, w]) => s + w, 0);
    let r = u() * total;
    for (const [x, w] of xs) { r -= w; if (r <= 0) return x; }
    return xs[xs.length - 1]![0];
  };
  const hex = (n: number) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(u() * 16)]).join('');
  const roundTo = (x: number, step: number) => Math.round(x / step) * step;

  const db: Db = {
    consultants: [], services: [], prospects: [], deals: [], calls: [], briefs: [], proposals: [], proposalEvents: [], payments: [], dealEvents: [], eventLog: [], errorLog: [],
  };
  const start = now - 121 * DAY;

  CONSULTANTS.forEach((c, i) => db.consultants.push({ id: i + 1, name: c.name, email: c.email, whatsapp: c.whatsapp, timezone: 'Asia/Kolkata', created_at: iso(start - 40 * DAY) }));
  SERVICE_DEFS.forEach((s, i) => db.services.push({
    id: i + 1, name: s.name, service_type: s.service_type, base_price_inr: s.base, proposal_template_doc_id: `1${hex(10)}Tpl${i + 1}${hex(14)}`, active: true,
    created_at: iso(start - 40 * DAY), updated_at: iso(start - 40 * DAY),
  }));

  /* ---- plans ---- */
  const plans: Plan[] = [];
  const pickConsultant = () => weighted(CONSULTANTS.map((c, i) => [i, c.weight] as const));
  const pickSource = () => weighted(SOURCES.map((s) => [s, s.weight] as const));
  const pickService = (s: SourceDef) => { const k = weighted(Object.entries(s.services).map(([key, w]) => [key, w] as const)); return SERVICE_DEFS.find((d) => d.service_type === k)!; };
  for (let i = 0; i < nDeals; i++) {
    const source = pickSource();
    plans.push({ createdAt: now - HOUR - Math.pow(u(), 1.35) * (120 * DAY - HOUR), source, service: pickService(source), consultantIdx: pickConsultant() });
  }
  // A handful of calls that are certainly upcoming (so "today" is never empty), with their brief states.
  const upcomingHours = [1.6, 3.2, 5.5, 8, 21, 29, 47, 70];
  const upcomingBrief: ('ready' | 'pending' | 'failed')[] = ['ready', 'ready', 'pending', 'ready', 'ready', 'failed', 'ready', 'ready'];
  upcomingHours.forEach((h, i) => {
    const source = pickSource();
    plans.push({ createdAt: now - between(0.6, 5) * DAY, source, service: pickService(source), consultantIdx: pickConsultant(), forceScheduled: now + h * HOUR, briefState: upcomingBrief[i] });
  });
  // Calls that finished recently whose proposal is drafted but not yet approved: the approval queue and the SLA board are never empty.
  [3, 9, 20, 27, 40, 55].forEach((h) => {
    const source = pickSource();
    plans.push({ createdAt: now - between(4, 9) * DAY, source, service: pickService(source), consultantIdx: pickConsultant(), awaitingHours: h });
  });
  plans.sort((a, b) => a.createdAt - b.createdAt);

  /* ---- id counters ---- */
  let dealEventSeq = 0;
  const usedNames = new Set<string>();
  const newPerson = (createdAt: number, source: SourceDef, test: boolean): DbProspect => {
    let first = '', last = '', prefix = '', suffix = '', key = '';
    do { first = pick(FIRST_NAMES); last = pick(LAST_NAMES); prefix = pick(COMPANY_PREFIXES); suffix = pick(COMPANY_SUFFIXES); key = `${first}${last}${prefix}${suffix}`; } while (usedNames.has(key));
    usedNames.add(key);
    const company = test ? 'Test Co Pvt Ltd' : `${prefix} ${suffix}`;
    const slug = `${prefix}${suffix}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    const handle = `${first}-${last}`.toLowerCase();
    return {
      id: db.prospects.length + 1, name: test ? `Test Prospect ${db.prospects.length + 1}` : `${first} ${last}`,
      email: test ? `test+${db.prospects.length + 1}@example.com` : `${first.toLowerCase()}@${slug}.${pick(['in', 'com', 'co.in', 'io'])}`,
      phone: `+91${pick(['98', '97', '99', '96', '90', '88', '81', '70'])}${String(int(0, 99999999)).padStart(8, '0')}`,
      company, website: test ? 'https://example.com' : `https://www.${slug}.${pick(['in', 'com'])}`,
      linkedin_url: `https://www.linkedin.com/in/${handle}-${hex(5)}`, role: pick(ROLES), lead_source: source.key,
      utm_source: source.utm[0], utm_medium: source.utm[1], utm_campaign: pick(['q3-growth-audit', 'founder-playbook', 'scale-with-systems', 'always-on']),
      referrer: source.key === 'referral' ? pick(['Existing client', 'Founder community', 'Ex-colleague']) : null, opted_out: false, is_test: test, created_at: iso(createdAt),
    };
  };

  const proposalDocUrl = () => `https://docs.google.com/document/d/1${hex(10)}${hex(33)}/edit`;
  const REASONS_DECLINED = [['budget', 0.36], ['timing', 0.28], ['went with competitor', 0.36]] as const;

  /* ---- deals ---- */
  const dealEventsRaw: (Omit<DbDealEvent, 'id'> & { t: number })[] = [];
  const proposalEventsRaw: (Omit<DbProposalEvent, 'id'> & { t: number })[] = [];
  const eventLogRaw: { t: number; branch: string; event_type: string; payload: unknown; is_test: boolean }[] = [];

  for (const plan of plans) {
    const consultant = CONSULTANTS[plan.consultantIdx]!;
    const consultantId = plan.consultantIdx + 1;
    const prospect = newPerson(plan.createdAt, plan.source, false);
    db.prospects.push(prospect);
    const dealId = db.deals.length + 1;
    const price = plan.service.base;
    const deal: DbDeal = {
      id: dealId, prospect_id: prospect.id, consultant_id: consultantId, service_type: plan.service.service_type, lead_source: plan.source.key, stage: 'call_booked',
      value_inr: price, currency: 'INR', lost_reason: null, is_test: false, created_at: iso(plan.createdAt), stage_changed_at: iso(plan.createdAt), won_at: null, lost_at: null,
    };
    db.deals.push(deal);
    let curStage: Stage = 'call_booked';
    let stageAt = plan.createdAt;
    const ev = (t: number, type: string, note: string | null, payload?: unknown) => dealEventsRaw.push({ deal_id: dealId, event_type: type, from_stage: null, to_stage: null, note, payload: payload ?? null, created_at: iso(t), t });
    const go = (t: number, to: Stage, note: string) => {
      dealEventsRaw.push({ deal_id: dealId, event_type: 'stage_change', from_stage: curStage, to_stage: to, note, payload: null, created_at: iso(t), t });
      curStage = to; stageAt = t;
    };
    dealEventsRaw.push({ deal_id: dealId, event_type: 'stage_change', from_stage: null, to_stage: 'call_booked', note: 'Call booked via calendly', payload: null, created_at: iso(plan.createdAt), t: plan.createdAt });
    const finish = () => { deal.stage = curStage; deal.stage_changed_at = iso(stageAt); };
    const provider = weighted([['calendly', 0.7], ['cal_com', 0.2], ['generic', 0.1]] as const);
    const mkCall = (scheduledFor: number, bookedAt: number): DbCall => {
      const c: DbCall = {
        id: db.calls.length + 1, deal_id: dealId, booking_id: provider === 'calendly' ? `https://api.calendly.com/scheduled_events/${hex(8)}-${hex(4)}/invitees/${hex(8)}` : `bk_${hex(10)}`,
        provider, booked_at: iso(bookedAt), scheduled_for: iso(scheduledFor), status: 'scheduled',
        intake_answers: [{ q: 'What is your biggest growth bottleneck right now?', a: pick(['Leads dry up every quarter', 'Sales team is not following a process', 'We are not sure what to automate first', 'Content takes too long to produce', 'Our brand does not stand out']) }, { q: 'Monthly revenue range?', a: pick(['₹5–10L', '₹10–25L', '₹25–60L', '₹60L+']) }],
        transcript_text: null, transcript_source: null, notes: null, completed_at: null,
      };
      db.calls.push(c);
      ev(bookedAt, 'call_booked', `Booking ${c.booking_id}`);
      return c;
    };
    const mkBrief = (call: DbCall, state: 'ready' | 'pending' | 'failed' | 'late' | 'none', readyAt: number) => {
      if (state === 'none') return;
      const b: DbBrief = {
        id: db.briefs.length + 1, deal_id: dealId, call_id: call.id, status: state === 'late' ? 'ready' : state, brief_markdown: null, brief_doc_url: null, sources_json: null,
        attempts: state === 'ready' || state === 'late' ? 1 : state === 'failed' ? 3 : 0, error: state === 'failed' ? pick(['Search tool timed out after 3 attempts', 'Prospect website blocked automated reading']) : null,
        created_at: call.booked_at, generated_at: null, delivered_at: null,
      };
      if (state === 'ready' || state === 'late') {
        const brief = buildBrief({ prospect, service: plan.service.name, serviceType: plan.service.service_type, source: plan.source.key, consultant: consultant.name, u, pick });
        b.brief_markdown = brief.markdown; b.sources_json = brief.sources;
        b.brief_doc_url = `https://docs.google.com/document/d/1${hex(10)}${hex(33)}/edit`;
        b.generated_at = iso(readyAt); b.delivered_at = iso(readyAt);
        ev(readyAt, 'brief_ready', b.brief_doc_url);
        if (curStage === 'call_booked' && readyAt <= Date.parse(call.scheduled_for ?? iso(readyAt))) go(readyAt, 'brief_ready', 'Research brief ready');
      } else if (state === 'failed') ev(readyAt, 'brief_failed', b.error);
      db.briefs.push(b);
    };

    /* the call */
    const forcedWait = plan.awaitingHours !== undefined;
    let scheduledFor = plan.forceScheduled ?? (forcedWait ? now - (plan.awaitingHours! + 0.9) * HOUR : businessSlot(plan.createdAt + between(2, 8) * DAY, u));
    let call = mkCall(scheduledFor, plan.createdAt);
    const briefAtBooking = plan.createdAt + between(3, 14) * 60_000;

    // upcoming
    if (plan.forceScheduled || scheduledFor >= now - HOUR) {
      const st = plan.briefState ?? weighted([['ready', 0.9], ['pending', 0.06], ['failed', 0.04]] as const);
      mkBrief(call, st, st === 'ready' ? Math.min(briefAtBooking, now - 60_000) : Math.min(plan.createdAt + 20 * 60_000, now));
      finish(); continue;
    }
    // call is in the last 25 hours and nobody has logged the outcome yet
    if (!forcedWait && scheduledFor <= now - HOUR && scheduledFor > now - 25 * HOUR && chance(0.55)) {
      mkBrief(call, 'ready', Math.min(briefAtBooking, scheduledFor - HOUR));
      finish(); continue;
    }

    // a few calls were moved once: the first slot is recorded as rescheduled and the new slot carries the deal on
    if (!forcedWait && chance(0.03) && scheduledFor + 4 * DAY < now - 2 * DAY) {
      call.status = 'rescheduled';
      ev(scheduledFor - 2 * HOUR, 'call_rescheduling', `Booking ${call.booking_id}`);
      mkBrief(call, 'ready', briefAtBooking);
      scheduledFor = businessSlot(scheduledFor + between(2, 5) * DAY, u);
      call = mkCall(scheduledFor, scheduledFor - 3 * DAY);
      ev(scheduledFor - 3 * DAY + HOUR, 'call_rescheduled', `Moved to ${iso(scheduledFor)}`);
    }

    const r = forcedWait ? 1 : u();
    const briefState = forcedWait ? 'ready' : weighted([['ready', 0.925], ['late', 0.03], ['failed', 0.025], ['pending', 0.01], ['none', 0.01]] as const);
    const existingBrief = db.briefs.some((b) => b.call_id === call.id);
    if (!existingBrief) {
      const readyAt = briefState === 'late' ? scheduledFor + between(-1.2, 3) * HOUR : Math.min(Date.parse(call.booked_at) + between(3, 14) * 60_000, scheduledFor - HOUR);
      mkBrief(call, briefState, readyAt);
    }

    // cancellations and no-shows
    if (r < 0.03) {
      call.status = 'canceled';
      ev(scheduledFor - 3 * HOUR, 'call_canceled', `Booking ${call.booking_id}`);
      deal.lost_reason = 'timing'; deal.lost_at = iso(scheduledFor - 3 * HOUR);
      go(scheduledFor - 3 * HOUR, 'lost', 'Call canceled');
      finish(); continue;
    }
    if (r < 0.11) {
      call.status = 'no_show';
      const noShowAt = scheduledFor + 40 * 60_000;
      ev(noShowAt, 'call_no_show', 'Prospect did not join');
      go(noShowAt, 'no_show', 'No-show');
      const canRebook = scheduledFor < now - 12 * DAY && chance(0.4);
      if (!canRebook) { finish(); continue; }
      scheduledFor = businessSlot(scheduledFor + between(2, 6) * DAY, u);
      const rebookAt = Math.max(noShowAt + HOUR, scheduledFor - 2 * DAY);
      call = mkCall(scheduledFor, rebookAt);
      go(rebookAt, 'call_booked', 'Rebooked after no-show');
      mkBrief(call, 'ready', rebookAt + 10 * 60_000);
    }

    /* completed call */
    const completedAt = scheduledFor + between(35, 70) * 60_000;
    call.status = 'completed'; call.completed_at = iso(completedAt);
    call.transcript_text = buildTranscript({ prospect, consultant: consultant.name, serviceType: plan.service.service_type, price, u, pick });
    call.transcript_source = weighted([['fireflies', 0.55], ['manual', 0.45]] as const);
    ev(completedAt, 'call_completed', `Transcript from ${call.transcript_source}`);
    go(completedAt, 'call_done', 'Call completed');

    // lost straight after the call
    if (!forcedWait && chance(0.06)) {
      const t = completedAt + between(0.5, 3) * DAY;
      deal.lost_reason = weighted([['budget', 0.4], ['timing', 0.35], ['went with competitor', 0.25]] as const);
      if (t < now) { deal.lost_at = iso(t); go(t, 'lost', `Lost: ${deal.lost_reason}`); }
      else deal.lost_reason = null;
      finish(); continue;
    }

    /* proposals */
    const nVers = weighted([[1, 0.7], [2, 0.22], [3, 0.08]] as const);
    let draftT = completedAt + between(0.4, 3.5) * HOUR;
    const versions: { version: number; draftedAt: number; amount: number; notes: string | null }[] = [];
    let amount = roundTo(price * between(plan.source.discount[0], plan.source.discount[1]), price >= 100_000 ? 5000 : 1000);
    for (let v = 1; v <= nVers; v++) {
      versions.push({ version: v, draftedAt: draftT, amount, notes: v > 1 ? pick(['Split the payment into two milestones', 'Add a reporting dashboard to the scope', 'Reduce scope to phase one only', 'Include the content calendar in the first month', 'Lower the retainer for a 6-month commitment']) : null });
      draftT += between(2, 20) * HOUR;
      amount = roundTo(amount * between(0.88, 1.06), price >= 100_000 ? 5000 : 1000);
    }
    while (versions.length && versions[versions.length - 1]!.draftedAt > now - 60_000) versions.pop();
    if (!versions.length) { finish(); continue; }
    const last = versions[versions.length - 1]!;
    const sendDelay = consultant.delay(u);
    const sentAt = forcedWait ? now + 6 * HOUR : Math.max(last.draftedAt + between(0.3, 1.5) * HOUR, completedAt + sendDelay * HOUR);
    const hoursToSend = (sentAt - completedAt) / HOUR;
    const expiresAt = sentAt + 14 * DAY;

    const mkProposal = (v: (typeof versions)[number], status: DbProposal['status']): DbProposal => {
      const p: DbProposal = {
        id: db.proposals.length + 1, deal_id: dealId, version: v.version, doc_url: proposalDocUrl(), pdf_drive_id: null, amount_inr: v.amount, status,
        tracking_token: hex(64), approve_token: hex(64), change_notes: v.notes, payment_link: null, followup_draft: null, followup_drafted_at: null,
        drafted_at: iso(v.draftedAt), approved_at: null, sent_at: null, first_opened_at: null, open_count: 0, last_opened_at: null, accepted_at: null, declined_at: null,
        expires_at: iso(v.draftedAt + 14 * DAY),
      };
      db.proposals.push(p);
      ev(v.draftedAt, 'proposal_drafted', `Version ${v.version}`, { proposal_id: p.id, amount_inr: v.amount });
      if (v.version === 1) go(v.draftedAt, 'proposal_drafted', 'Proposal v1 drafted');
      if (v.notes) ev(v.draftedAt - 30 * 60_000, 'changes_requested', v.notes);
      return p;
    };
    // earlier versions were redrafted before anything was sent
    for (const v of versions.slice(0, -1)) mkProposal(v, 'superseded');

    if (sentAt > now) {
      mkProposal(last, 'drafted');
      finish(); continue;
    }

    /* the sent version and what happened next */
    const prop = mkProposal(last, 'sent');
    prop.expires_at = iso(expiresAt);
    prop.approved_at = iso(sentAt - 5 * 60_000);
    prop.sent_at = iso(sentAt);
    prop.pdf_drive_id = `1${hex(10)}${hex(24)}`;
    ev(sentAt, 'proposal_sent', `Version ${last.version} sent`);
    go(sentAt, 'proposal_sent', `Proposal v${last.version} sent`);

    const pWin = Math.min(0.92, plan.source.baseWin * speedMultiplier(hoursToSend) * consultant.winMult);
    const isWin = chance(pWin);
    const lossKind = isWin ? null : chance(0.55) ? 'declined' : 'expired';
    const acceptedAt = isWin ? sentAt + between(0.3, 6) * DAY : null;
    const paidAt = acceptedAt !== null ? acceptedAt + between(0.2, 7) * DAY : null;
    const declinedAt = lossKind === 'declined' ? sentAt + between(0.4, 9) * DAY : null;
    const decisionT = acceptedAt ?? declinedAt ?? null;

    // opens
    let openAt: number | null = null;
    const decidedSoon = decisionT !== null && decisionT <= now;
    const openProb = decidedSoon ? 1 : lossKind === 'expired' ? 0.4 : 0.8;
    if (chance(openProb)) {
      const maxGap = decisionT !== null ? Math.max(0.2, ((decisionT - sentAt) / HOUR) * 0.8) : 40;
      openAt = sentAt + between(0.1, Math.min(40, maxGap)) * HOUR;
      if (openAt > now) openAt = null;
    }
    if (openAt !== null) {
      const endCap = Math.min(now - 60_000, decisionT !== null && decisionT <= now ? decisionT - 60_000 : now - 60_000);
      const count = isWin ? weighted([[3, 0.2], [4, 0.2], [5, 0.2], [6, 0.15], [7, 0.1], [8, 0.1], [9, 0.05]] as const)
        : weighted([[1, 0.3], [2, 0.22], [3, 0.16], [4, 0.12], [5, 0.08], [6, 0.06], [7, 0.03], [8, 0.02], [9, 0.01]] as const);
      const times = [openAt];
      const spread = Math.max(0, Math.min(endCap - openAt, between(0.5, 6) * DAY));
      for (let i = 1; i < count; i++) times.push(openAt + u() * spread);
      times.sort((a, b) => a - b);
      times.forEach((t, i) => proposalEventsRaw.push({
        proposal_id: prop.id, event_type: 'open', ip_hash: hex(16), user_agent: i === 0 && chance(0.4) ? 'Mozilla/5.0 (via ggpht.com GoogleImageProxy)' : pick(['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Safari/605.1.15']),
        meta: null, created_at: iso(t), t,
      }));
      prop.open_count = times.length; prop.first_opened_at = iso(times[0]!); prop.last_opened_at = iso(times[times.length - 1]!); prop.status = 'opened';
      ev(times[0]!, 'proposal_opened', `First open of version ${last.version}`);
      go(times[0]!, 'proposal_opened', 'Proposal opened');
      if (chance(0.5)) {
        const nClicks = int(1, 3);
        for (let i = 0; i < nClicks; i++) { const t = times[Math.min(i, times.length - 1)]! + int(5, 90) * 1000; proposalEventsRaw.push({ proposal_id: prop.id, event_type: 'link_click', ip_hash: hex(16), user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/126.0', meta: { target: prop.doc_url }, created_at: iso(t), t }); }
      }
    }

    // outcome as of now
    if (isWin && acceptedAt !== null && acceptedAt <= now) {
      prop.status = 'accepted'; prop.accepted_at = iso(acceptedAt);
      if (!prop.first_opened_at) { prop.first_opened_at = iso(acceptedAt - 60_000); prop.last_opened_at = prop.first_opened_at; prop.open_count = 1; proposalEventsRaw.push({ proposal_id: prop.id, event_type: 'open', ip_hash: hex(16), user_agent: 'Mozilla/5.0 (iPhone) Safari/604.1', meta: null, created_at: prop.first_opened_at, t: acceptedAt - 60_000 }); }
      prop.payment_link = `https://rzp.io/i/${hex(7)}`;
      proposalEventsRaw.push({ proposal_id: prop.id, event_type: 'accept_click', ip_hash: hex(16), user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/126.0', meta: null, created_at: iso(acceptedAt), t: acceptedAt });
      ev(acceptedAt, 'proposal_accepted', `Version ${last.version}`);
      go(acceptedAt, 'negotiation', 'Proposal accepted, awaiting payment');
      if (paidAt !== null && paidAt <= now) {
        const finalAmount = prop.amount_inr ?? price;
        db.payments.push({ id: db.payments.length + 1, deal_id: dealId, payment_id: `pay_${hex(14)}`, provider: chance(0.8) ? 'razorpay' : 'stripe', amount_inr: finalAmount, status: 'paid', paid_at: iso(paidAt) });
        proposalEventsRaw.push({ proposal_id: prop.id, event_type: 'pay', ip_hash: null, user_agent: null, meta: null, created_at: iso(paidAt), t: paidAt });
        deal.value_inr = finalAmount; deal.won_at = iso(paidAt);
        ev(paidAt, 'payment_received', `Rs ${finalAmount}`);
        go(paidAt, 'won', `Payment pay_${hex(6)}`);
      }
    } else if (lossKind === 'declined' && declinedAt !== null && declinedAt <= now) {
      const reason = weighted(REASONS_DECLINED.map((x) => [x[0], x[1]] as const));
      prop.status = 'declined'; prop.declined_at = iso(declinedAt);
      if (!prop.first_opened_at) { prop.first_opened_at = iso(declinedAt - 60_000); prop.last_opened_at = prop.first_opened_at; prop.open_count = 1; proposalEventsRaw.push({ proposal_id: prop.id, event_type: 'open', ip_hash: hex(16), user_agent: 'Mozilla/5.0 (iPhone) Safari/604.1', meta: null, created_at: prop.first_opened_at, t: declinedAt - 60_000 }); }
      proposalEventsRaw.push({ proposal_id: prop.id, event_type: 'decline_click', ip_hash: hex(16), user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/126.0', meta: { reason }, created_at: iso(declinedAt), t: declinedAt });
      deal.lost_reason = reason; deal.lost_at = iso(declinedAt);
      go(declinedAt, 'lost', `Declined: ${reason}`);
    } else if (lossKind === 'expired' && expiresAt <= now) {
      prop.status = 'expired'; deal.lost_reason = 'no response'; deal.lost_at = iso(expiresAt);
      go(expiresAt, 'lost', 'Proposal expired');
    }
    finish();
  }

  /* ---- a few recent opens, for the "opened in the last hour" pulse ---- */
  const recent = db.proposals.filter((p) => p.status === 'opened' && p.sent_at && Date.parse(p.sent_at) > now - 6 * DAY && p.open_count >= 2).slice(0, 2);
  recent.forEach((p, i) => {
    const t = now - (i === 0 ? 14 : 41) * 60_000;
    const evs = proposalEventsRaw.filter((e) => e.proposal_id === p.id && e.event_type === 'open').sort((a, b) => a.t - b.t);
    const lastEv = evs[evs.length - 1]!;
    if (lastEv !== evs[0]) { lastEv.t = t; lastEv.created_at = iso(t); p.last_opened_at = iso(t); }
  });

  /* ---- test rows (hidden by default) ---- */
  for (let i = 0; i < 6; i++) {
    const source = SOURCES[i % SOURCES.length]!;
    const createdAt = now - (i + 1) * 0.4 * DAY;
    const prospect = newPerson(createdAt, source, true);
    db.prospects.push(prospect);
    const dealId = db.deals.length + 1;
    const stage: Stage = (['won', 'proposal_sent', 'lost', 'call_booked', 'negotiation', 'proposal_drafted'] as Stage[])[i]!;
    db.deals.push({
      id: dealId, prospect_id: prospect.id, consultant_id: 1 + (i % 4), service_type: SERVICE_DEFS[i % 5]!.service_type, lead_source: source.key, stage, value_inr: SERVICE_DEFS[i % 5]!.base,
      currency: 'INR', lost_reason: stage === 'lost' ? 'declined by prospect' : null, is_test: true, created_at: iso(createdAt), stage_changed_at: iso(createdAt + HOUR), won_at: stage === 'won' ? iso(createdAt + 2 * HOUR) : null, lost_at: stage === 'lost' ? iso(createdAt + 2 * HOUR) : null,
    });
    db.calls.push({ id: db.calls.length + 1, deal_id: dealId, booking_id: `test-bk-${i + 1}`, provider: 'generic', booked_at: iso(createdAt), scheduled_for: iso(createdAt + HOUR), status: 'completed', intake_answers: null, transcript_text: 'Test transcript', transcript_source: 'manual', notes: null, completed_at: iso(createdAt + 1.5 * HOUR) });
    eventLogRaw.push({ t: createdAt, branch: 'test', event_type: 'test_scenario_step', payload: { step: 'booked', deal_id: dealId }, is_test: true });
    dealEventsRaw.push({ deal_id: dealId, event_type: 'stage_change', from_stage: null, to_stage: 'call_booked', note: 'Call booked via generic', payload: null, created_at: iso(createdAt), t: createdAt });
  }

  /* ---- logs ---- */
  const branches = [['booking', 'call_booked'], ['brief', 'brief_ready'], ['proposal', 'proposal_sent'], ['tracking', 'proposal_opened'], ['sla', 'sla_nudge_sent'], ['followups', 'followup_draft_stored'], ['metrics', 'metrics_recomputed']] as const;
  for (let i = 0; i < 70; i++) {
    const [branch, type] = pick(branches);
    eventLogRaw.push({ t: now - u() * 20 * DAY, branch, event_type: type, payload: { deal_id: int(1, db.deals.length - 6) }, is_test: false });
  }
  const errorPool = [
    ['Gmail – Send Proposal To Prospect', 'The caller does not have permission (invalid_grant: Token has been expired or revoked)'],
    ['Brief – Research Agent', 'Tool "Web Search" timed out after 30000ms'],
    ['Drive – Copy Proposal Template', 'File not found: template document id is wrong or not shared with the service account'],
    ['Razorpay – Create Payment Link', 'BAD_REQUEST_ERROR: The amount must be at least INR 1.00'],
    ['Send – Gmail Message', 'Recipient address rejected: mailbox unavailable'],
    ['Booking – Upsert Prospect, Deal and Call', 'new row for relation "prospects" violates check constraint "prospects_phone_check"'],
  ] as const;
  errorPool.forEach(([node, error], i) => {
    const t = now - (i * 2.3 + 0.2) * DAY - u() * HOUR;
    db.errorLog.push({ id: i + 1, node, error, payload: JSON.stringify({ failed_node: node, hint: 'sample' }), execution_id: String(41_000 + i * 17), created_at: iso(t) });
  });

  /* ---- ids for time-ordered tables ---- */
  dealEventsRaw.sort((a, b) => a.t - b.t || a.deal_id - b.deal_id);
  dealEventsRaw.forEach((e) => { const { t: _t, ...row } = e; db.dealEvents.push({ id: ++dealEventSeq, ...row }); });
  proposalEventsRaw.sort((a, b) => a.t - b.t);
  proposalEventsRaw.forEach((e, i) => { const { t: _t, ...row } = e; db.proposalEvents.push({ id: i + 1, ...row }); });
  eventLogRaw.sort((a, b) => a.t - b.t);
  eventLogRaw.forEach((e, i) => db.eventLog.push({ id: i + 1, branch: e.branch, event_type: e.event_type, payload: e.payload, is_test: e.is_test, created_at: iso(e.t) }));
  db.errorLog.sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((e, i) => { e.id = i + 1; });

  return db;
}
