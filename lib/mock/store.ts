/**
 * In-memory mock backend state. Actions really change it (approve -> sent, revise -> version + 1, log outcome -> call_done + a draft later, ...),
 * so the dashboard behaves like the live workflow without any server.
 * Work the real workflow does asynchronously (AI drafting, brief research) is simulated with short delays resolved lazily by tick().
 */
import type { Stage } from '@/contracts/deal-api';
import type { Db, DbDeal, DbProposal } from '@/lib/metrics/types';
import { buildBrief } from './content';
import { generateSeed } from './seed';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const DRAFT_DELAY_MS = 4_000;
export const BRIEF_DELAY_MS = 3_500;
const HOUR = 3_600_000;
const DAY = 86_400_000;

type Pending =
  | { kind: 'draft'; dealId: number; readyAt: number; changeNotes: string | null }
  | { kind: 'brief'; dealId: number; callId: number; readyAt: number };

export interface MockState {
  db: Db;
  clock: () => number;
  pending: Pending[];
}

const iso = (t: number): string => new Date(t).toISOString().replace('Z', '+00:00');
const rid = (n: number): string => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const nextId = (rows: { id: number }[]): number => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;

export function createMockState(opts: { now?: number; clock?: () => number } = {}): MockState {
  const clock = opts.clock ?? (() => Date.now());
  return { db: generateSeed({ now: opts.now ?? clock() }), clock, pending: [] };
}

const g = globalThis as unknown as { __dealMockState?: MockState };
export function getMockState(): MockState {
  return (g.__dealMockState ??= createMockState());
}
export function resetMockState(state?: MockState): MockState {
  return (g.__dealMockState = state ?? createMockState());
}

/* ───────────── helpers ───────────── */

export function addDealEvent(s: MockState, dealId: number, type: string, note: string | null, fields: { from?: Stage | null; to?: Stage | null; payload?: unknown } = {}): void {
  s.db.dealEvents.push({ id: nextId(s.db.dealEvents), deal_id: dealId, event_type: type, from_stage: fields.from ?? null, to_stage: fields.to ?? null, note, payload: fields.payload ?? null, created_at: iso(s.clock()) });
}
export function setStage(s: MockState, deal: DbDeal, to: Stage, note: string, opts: { force?: boolean; payload?: unknown } = {}): { changed: boolean; from: Stage } {
  const from = deal.stage;
  if (from === to) return { changed: false, from };
  const order: Stage[] = ['call_booked', 'brief_ready', 'call_done', 'proposal_drafted', 'proposal_sent', 'proposal_opened', 'negotiation', 'won'];
  const ok = opts.force || (from !== 'won' && from !== 'lost' && (to === 'lost' || to === 'won' || (to === 'no_show' && (from === 'call_booked' || from === 'brief_ready')) || (to !== 'no_show' && from !== 'no_show' && order.indexOf(to) > order.indexOf(from))));
  if (!ok) return { changed: false, from };
  const t = iso(s.clock());
  deal.stage = to; deal.stage_changed_at = t;
  if (to === 'won') deal.won_at ??= t;
  if (to === 'lost') deal.lost_at ??= t;
  addDealEvent(s, deal.id, 'stage_change', note, { from, to, payload: opts.payload });
  return { changed: true, from };
}
export const findDeal = (s: MockState, id: number): DbDeal => {
  const d = s.db.deals.find((x) => x.id === id);
  if (!d) throw new HttpError(404, 'deal not found');
  return d;
};
export const findProposal = (s: MockState, id: number): DbProposal => {
  const p = s.db.proposals.find((x) => x.id === id);
  if (!p) throw new HttpError(404, 'proposal not found');
  return p;
};

/* ───────────── lazy resolution of simulated async work ───────────── */

export function tick(s: MockState): void {
  const now = s.clock();
  const due = s.pending.filter((p) => p.readyAt <= now);
  if (!due.length) return;
  s.pending = s.pending.filter((p) => p.readyAt > now);
  for (const p of due) {
    if (p.kind === 'draft') createDraft(s, p.dealId, p.changeNotes, p.readyAt);
    else completeBrief(s, p.dealId, p.callId, p.readyAt);
  }
}

function createDraft(s: MockState, dealId: number, changeNotes: string | null, at: number): void {
  const deal = findDeal(s, dealId);
  const svc = s.db.services.find((x) => x.service_type === deal.service_type);
  const mine = s.db.proposals.filter((p) => p.deal_id === dealId);
  const version = mine.reduce((m, p) => Math.max(m, p.version), 0) + 1;
  const prev = [...mine].sort((a, b) => b.version - a.version)[0];
  for (const p of mine) if (p.status === 'drafted' || p.status === 'approved') p.status = 'superseded';
  const base = prev?.amount_inr ?? svc?.base_price_inr ?? deal.value_inr ?? 0;
  const amount = changeNotes ? Math.round((base * 0.96) / 1000) * 1000 : Math.round(((svc?.base_price_inr ?? base) * 0.97) / 1000) * 1000;
  const t = iso(at);
  s.db.proposals.push({
    id: nextId(s.db.proposals), deal_id: dealId, version, doc_url: `https://docs.google.com/document/d/1${rid(43)}/edit`, pdf_drive_id: null, amount_inr: amount, status: 'drafted',
    tracking_token: rid(64), approve_token: rid(64), change_notes: changeNotes, payment_link: null, followup_draft: null, followup_drafted_at: null,
    drafted_at: t, approved_at: null, sent_at: null, first_opened_at: null, open_count: 0, last_opened_at: null, accepted_at: null, declined_at: null, expires_at: iso(at + 14 * DAY),
  });
  addDealEvent(s, dealId, 'proposal_drafted', `Version ${version}`, { payload: { amount_inr: amount } });
  setStage(s, deal, 'proposal_drafted', `Proposal v${version} drafted`);
}

function completeBrief(s: MockState, dealId: number, callId: number, at: number): void {
  const brief = s.db.briefs.find((b) => b.call_id === callId);
  const deal = s.db.deals.find((d) => d.id === dealId);
  const prospect = s.db.prospects.find((p) => p.id === deal?.prospect_id);
  const consultant = s.db.consultants.find((c) => c.id === deal?.consultant_id);
  if (!brief || !deal || !prospect || !consultant) return;
  const svc = s.db.services.find((x) => x.service_type === deal.service_type);
  const u = Math.random;
  const built = buildBrief({ prospect, service: svc?.name ?? deal.service_type, serviceType: deal.service_type, source: deal.lead_source, consultant: consultant.name, u, pick: (xs) => xs[Math.floor(u() * xs.length)]! });
  brief.status = 'ready'; brief.brief_markdown = built.markdown; brief.sources_json = built.sources; brief.error = null; brief.attempts += 1;
  brief.brief_doc_url = `https://docs.google.com/document/d/1${rid(43)}/edit`;
  brief.generated_at = iso(at); brief.delivered_at = iso(at);
  addDealEvent(s, dealId, 'brief_ready', brief.brief_doc_url);
  if (deal.stage === 'call_booked') setStage(s, deal, 'brief_ready', 'Research brief ready');
}

/* ───────────── actions ───────────── */

export function approveProposal(s: MockState, proposalId: number): { proposal: DbProposal; deal: DbDeal } {
  const p = findProposal(s, proposalId);
  if (!(p.status === 'drafted' || p.status === 'approved') || p.sent_at) throw new HttpError(409, `This proposal is already ${p.status} and cannot be approved again.`);
  const deal = findDeal(s, p.deal_id);
  const now = s.clock();
  p.status = 'sent'; p.approved_at = iso(now - 60_000); p.sent_at = iso(now); p.pdf_drive_id = `1${rid(33)}`; p.expires_at = iso(now + 14 * DAY);
  addDealEvent(s, deal.id, 'proposal_sent', `Version ${p.version} sent`);
  setStage(s, deal, 'proposal_sent', `Proposal v${p.version} sent`);
  return { proposal: p, deal };
}

export function requestChanges(s: MockState, proposalId: number, notes: string): { proposal: DbProposal } {
  const p = findProposal(s, proposalId);
  if (!(p.status === 'drafted' || p.status === 'approved') || p.sent_at) throw new HttpError(409, 'no editable draft for this token (unknown, already sent or superseded)');
  p.change_notes = notes;
  addDealEvent(s, p.deal_id, 'changes_requested', notes.slice(0, 300));
  s.pending.push({ kind: 'draft', dealId: p.deal_id, readyAt: s.clock() + DRAFT_DELAY_MS, changeNotes: notes });
  return { proposal: p };
}

export function regenerateBrief(s: MockState, dealId: number): { callId: number } {
  findDeal(s, dealId);
  const calls = s.db.calls.filter((c) => c.deal_id === dealId && (c.status === 'scheduled' || c.status === 'completed'));
  if (!calls.length) throw new HttpError(404, 'No scheduled or completed call found for that deal, so there is nothing to research.');
  const call = [...calls].sort((a, b) => Number(b.status === 'scheduled') - Number(a.status === 'scheduled') || (Date.parse(b.scheduled_for ?? '') || 0) - (Date.parse(a.scheduled_for ?? '') || 0) || b.id - a.id)[0]!;
  let brief = s.db.briefs.find((b) => b.call_id === call.id);
  if (!brief) {
    brief = { id: nextId(s.db.briefs), deal_id: dealId, call_id: call.id, status: 'pending', brief_markdown: null, brief_doc_url: null, sources_json: null, attempts: 0, error: null, created_at: iso(s.clock()), generated_at: null, delivered_at: null };
    s.db.briefs.push(brief);
  }
  brief.status = 'pending'; brief.attempts = 0; brief.error = null;
  s.pending = s.pending.filter((p) => !(p.kind === 'brief' && p.callId === call.id));
  s.pending.push({ kind: 'brief', dealId, callId: call.id, readyAt: s.clock() + BRIEF_DELAY_MS });
  return { callId: call.id };
}

export function logCallOutcome(s: MockState, input: { dealId?: number; bookingId?: string; noShow: boolean; transcript: string; source: string }):
  { outcome: 'completed' | 'no_show'; dealId: number; callId: number; alreadyHandled: boolean } {
  const calls = s.db.calls.filter((c) => (input.bookingId && c.booking_id === input.bookingId) || (input.dealId !== undefined && c.deal_id === input.dealId));
  const call = [...calls].sort((a, b) => Number(b.booking_id === input.bookingId) - Number(a.booking_id === input.bookingId) || b.id - a.id)[0];
  if (!call) throw new HttpError(404, 'no call matches that booking_id or deal_id');
  const deal = findDeal(s, call.deal_id);
  const now = s.clock();
  if (input.noShow) {
    const already = call.status === 'no_show';
    if (!already) {
      call.status = 'no_show';
      addDealEvent(s, deal.id, 'call_no_show', 'Prospect did not join');
      setStage(s, deal, 'no_show', 'No-show');
    }
    return { outcome: 'no_show', dealId: deal.id, callId: call.id, alreadyHandled: already };
  }
  const already = call.status === 'completed';
  if (!already) {
    call.status = 'completed'; call.completed_at = iso(now); call.transcript_text = input.transcript; call.transcript_source = input.source;
    addDealEvent(s, deal.id, 'call_completed', `Transcript from ${input.source}`);
    setStage(s, deal, 'call_done', 'Call completed');
    s.pending.push({ kind: 'draft', dealId: deal.id, readyAt: now + DRAFT_DELAY_MS, changeNotes: null });
  }
  return { outcome: 'completed', dealId: deal.id, callId: call.id, alreadyHandled: already };
}

export function overrideStage(s: MockState, input: { dealId: number; to: Stage; note?: string; value?: number; lostReason?: string }): { changed: boolean; from: Stage } {
  const deal = findDeal(s, input.dealId);
  if (input.value !== undefined) deal.value_inr = input.value;
  if (input.to === 'lost') deal.lost_reason = input.lostReason?.trim() || deal.lost_reason || 'marked lost manually';
  return setStage(s, deal, input.to, input.note || 'Manual override', { force: true, payload: { manual: true } });
}

export function nowIso(s: MockState): string { return iso(s.clock()); }
export const HOURS = HOUR;
