/**
 * Consultancy Deal Pipeline Engine - API contract (single source of truth).
 *
 * Derived from the live n8n workflow "Consultancy Deal Pipeline Engine" (id bmxJh5bbbjYbKYqL):
 *   - existing endpoints use the response shapes the workflow's Respond-to-Webhook nodes really return;
 *   - dashboard endpoints (added in the same workflow, see backend/n8n/README.md) use { status, data, meta }.
 * Mock mode serves these exact shapes; live mode validates n8n's answers against them.
 *
 * Differences between what was briefed and what the backend really does are listed in docs/BACKEND-DIFFERENCES.md.
 */
import { z } from 'zod';

/* ───────────────────────── enums ───────────────────────── */

export const STAGES = [
  'call_booked', 'brief_ready', 'call_done', 'proposal_drafted', 'proposal_sent',
  'proposal_opened', 'negotiation', 'won', 'lost', 'no_show',
] as const;
export const stageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof stageSchema>;
/** Board order. no_show sits outside the happy path. */
export const BOARD_STAGES: Stage[] = [
  'call_booked', 'brief_ready', 'call_done', 'proposal_drafted', 'proposal_sent', 'proposal_opened', 'negotiation', 'won', 'lost',
];
export const OPEN_STAGES: Stage[] = [
  'call_booked', 'brief_ready', 'call_done', 'proposal_drafted', 'proposal_sent', 'proposal_opened', 'negotiation',
];

export const PROPOSAL_STATUSES = ['drafted', 'approved', 'sent', 'opened', 'accepted', 'declined', 'expired', 'superseded'] as const;
export const proposalStatusSchema = z.enum(PROPOSAL_STATUSES);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const CALL_STATUSES = ['scheduled', 'completed', 'no_show', 'canceled', 'rescheduled'] as const;
export const callStatusSchema = z.enum(CALL_STATUSES);
export type CallStatus = z.infer<typeof callStatusSchema>;

export const briefStatusSchema = z.enum(['pending', 'ready', 'failed']);
/** Calls with no research_briefs row yet report "none". */
export const callBriefStatusSchema = z.enum(['pending', 'ready', 'failed', 'none']);
export type CallBriefStatus = z.infer<typeof callBriefStatusSchema>;

export const PROPOSAL_EVENT_TYPES = ['open', 'link_click', 'accept_click', 'decline_click', 'sign', 'pay'] as const;
export const proposalEventTypeSchema = z.enum(PROPOSAL_EVENT_TYPES);

export const METRIC_PERIODS = ['this_month', 'last_30d', 'last_90d', 'all_time'] as const;
export const periodSchema = z.enum(METRIC_PERIODS);
export type MetricPeriod = z.infer<typeof periodSchema>;

export const GROUP_BYS = ['service_type', 'lead_source', 'service_type_x_lead_source', 'consultant'] as const;
export const groupBySchema = z.enum(GROUP_BYS);
export type GroupBy = z.infer<typeof groupBySchema>;

export const TEST_SCENARIOS = ['full_win', 'no_show_rebook', 'proposal_ignored', 'declined', 'multi_version', 'cleanup'] as const;
export const testScenarioSchema = z.enum(TEST_SCENARIOS);

/* ───────────────────────── primitives ───────────────────────── */

/** Postgres timestamptz as jsonb emits it: 2026-10-31T14:30:49.023+00:00 */
export const ts = z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: 'expected an ISO timestamp' });
const id = z.number().int();
const nstr = z.string().nullable();
const nnum = z.number().nullable();
const nts = ts.nullable();

export const envelopeMeta = z.object({ page: z.number(), page_size: z.number(), total: z.number() });
export type EnvelopeMeta = z.infer<typeof envelopeMeta>;
export const envelope = <T extends z.ZodType>(data: T) => z.object({ status: z.literal('ok'), data, meta: envelopeMeta });
export const errorBody = z.object({ status: z.literal('error'), error: z.string() });
export type ErrorBody = z.infer<typeof errorBody>;

/* ───────────────────────── shared row schemas ───────────────────────── */

export const dealListItem = z.object({
  id, prospect_id: id, consultant_id: id, service_type: z.string(), lead_source: z.string(), stage: stageSchema,
  value_inr: nnum, currency: z.string(), lost_reason: nstr, created_at: ts, stage_changed_at: ts, won_at: nts, lost_at: nts, is_test: z.boolean(),
  days_in_stage: z.number(),
  prospect_name: nstr, company: nstr, role: nstr, consultant_name: z.string(), service_name: nstr,
  latest_proposal_id: id.nullable(), latest_proposal_version: z.number().nullable(), latest_proposal_status: proposalStatusSchema.nullable(),
  next_call_at: nts,
});
export type DealListItem = z.infer<typeof dealListItem>;

export const callRow = z.object({
  id, deal_id: id, booking_id: z.string(), provider: z.string(), booked_at: ts, scheduled_for: nts, status: callStatusSchema,
  completed_at: nts, transcript_source: nstr, has_transcript: z.boolean(), transcript_text: nstr, notes: nstr,
  intake_answers: z.unknown().nullable(),
  prospect_name: nstr, company: nstr, role: nstr, service_type: z.string(), consultant_id: id, consultant_name: z.string(), deal_stage: stageSchema,
  brief_status: callBriefStatusSchema, brief_id: id.nullable(), brief_doc_url: nstr, brief_generated_at: nts, brief_ready_before_call: z.boolean(),
  hours_until_call: nnum,
});
export type CallRow = z.infer<typeof callRow>;

export const briefSource = z.union([z.string(), z.object({ title: z.string().optional(), url: z.string().optional() }).loose()]);
export const briefRow = z.object({
  id, deal_id: id, call_id: id, status: briefStatusSchema, brief_markdown: nstr, brief_doc_url: nstr, sources: z.array(briefSource),
  attempts: z.number(), error: nstr, created_at: ts, generated_at: nts, delivered_at: nts,
  prospect_name: nstr, company: nstr, scheduled_for: nts,
});
export type BriefRow = z.infer<typeof briefRow>;

export const proposalRow = z.object({
  id, deal_id: id, version: z.number().int(), status: proposalStatusSchema, doc_url: nstr, amount_inr: nnum,
  drafted_at: ts, approved_at: nts, sent_at: nts, first_opened_at: nts, last_opened_at: nts, open_count: z.number().int(),
  accepted_at: nts, declined_at: nts, expires_at: nts, change_notes: nstr,
  link_clicks: z.number().int(), is_first_sent_version: z.boolean(), hours_call_to_proposal: nnum, hours_call_to_draft: nnum, days_since_sent: nnum,
  prospect_name: nstr, company: nstr, service_type: z.string(), service_name: nstr, consultant_id: id, consultant_name: z.string(), deal_stage: stageSchema,
});
export type ProposalRow = z.infer<typeof proposalRow>;

export const proposalEvent = z.object({
  id, proposal_id: id, version: z.number().int(), event_type: proposalEventTypeSchema, user_agent: nstr, meta: z.unknown().nullable(), created_at: ts,
});
export type ProposalEvent = z.infer<typeof proposalEvent>;

/* ───────────────────────── dashboard READ endpoints ───────────────────────── */

const kpiBlock = z.object({
  calls_booked: z.number(), calls_due: z.number(), calls_brief_ready: z.number(), brief_ready_pct: nnum,
  proposals_sent: z.number(), median_hours_call_to_proposal: nnum, open_rate_pct: nnum,
  won: z.number(), lost: z.number(), open_deals: z.number(),
  win_rate_pct: nnum, win_rate_incl_open_pct: nnum, avg_deal_size_inr: nnum, revenue_won_inr: z.number(), pipeline_value_inr: z.number(),
});
export type KpiBlock = z.infer<typeof kpiBlock>;
export const overviewData = z.object({
  range: z.object({ from: ts, to: ts }),
  previous_range: z.object({ from: ts, to: ts }),
  totals: kpiBlock,
  previous: kpiBlock,
  weekly: z.array(kpiBlock.extend({ week_start: ts, week_end: ts })),
});
export type OverviewData = z.infer<typeof overviewData>;

export const overviewQuery = z.object({ from: z.string().optional(), to: z.string().optional(), consultant_id: z.string().optional(), include_test: z.enum(['1']).optional() });
export const overviewResponse = envelope(overviewData);

export const dealsQuery = z.object({
  stage: stageSchema.optional(), service_type: z.string().optional(), lead_source: z.string().optional(), consultant_id: z.string().optional(),
  search: z.string().optional(), from: z.string().optional(), to: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(), page_size: z.coerce.number().int().min(1).max(500).optional(),
  sort: z.enum(['created_at', '-created_at', 'value_inr', '-value_inr', 'days_in_stage', '-days_in_stage']).optional(),
  include_test: z.enum(['1']).optional(),
});
export const dealsResponse = envelope(z.array(dealListItem));

export const callsQuery = z.object({
  when: z.enum(['upcoming', 'past', 'all']).optional(), status: callStatusSchema.optional(), consultant_id: z.string().optional(), deal_id: z.string().optional(),
  include_transcript: z.enum(['1']).optional(), page: z.coerce.number().int().min(1).optional(), page_size: z.coerce.number().int().min(1).max(200).optional(),
  include_test: z.enum(['1']).optional(),
});
export const callsResponse = envelope(z.array(callRow));

export const briefQuery = z.object({ deal_id: z.string().regex(/^\d+$/), call_id: z.string().regex(/^\d+$/).optional() });
export const briefResponse = envelope(briefRow);

export const proposalsQuery = z.object({
  status: z.string().optional(), consultant_id: z.string().optional(), deal_id: z.string().optional(), from: z.string().optional(), to: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(), page_size: z.coerce.number().int().min(1).max(200).optional(), include_test: z.enum(['1']).optional(),
});
export const proposalsResponse = envelope(z.array(proposalRow));

const proposalDetailBase = proposalRow.omit({ prospect_name: true, company: true, service_type: true, deal_stage: true, consultant_name: true }).extend({
  pdf_drive_id: nstr, payment_link: nstr, followup_draft: nstr, followup_drafted_at: nts,
});
const proposalVersion = z.object({
  id, version: z.number().int(), status: proposalStatusSchema, amount_inr: nnum, doc_url: nstr, drafted_at: ts, sent_at: nts, first_opened_at: nts,
  open_count: z.number().int(), accepted_at: nts, declined_at: nts, change_notes: nstr,
});
const proposalDetailCommon = {
  versions: z.array(proposalVersion),
  events: z.array(proposalEvent),
  deal: z.object({ id, stage: stageSchema, value_inr: nnum, service_type: z.string(), lead_source: z.string(), lost_reason: nstr, consultant_id: id }),
  prospect: z.object({ id, name: nstr, email: nstr, phone: nstr, company: nstr, website: nstr, linkedin_url: nstr, role: nstr }),
  consultant: z.object({ id, name: z.string(), email: z.string() }),
  call: z.object({ id, scheduled_for: nts, completed_at: nts }).nullable(),
};
const approvalState = z.enum(['awaiting_approval', 'approved', 'sent', 'opened', 'accepted', 'declined', 'expired', 'superseded']);
/** What the browser may see: no tokens. */
export const proposalDetailData = z.object({
  proposal: proposalDetailBase,
  approval: z.object({ state: approvalState, can_approve: z.boolean(), approved_at: nts }),
  ...proposalDetailCommon,
});
export type ProposalDetail = z.infer<typeof proposalDetailData>;
/** Server-to-server only: carries the approval + tracking tokens. The proxy parses this, then re-parses with proposalDetailData (which drops them). */
export const proposalDetailServerData = z.object({
  proposal: proposalDetailBase.extend({ tracking_token: z.string(), approve_token: z.string() }),
  approval: z.object({ state: approvalState, can_approve: z.boolean(), approved_at: nts, approve_token: nstr }),
  ...proposalDetailCommon,
});
export const proposalQuery = z.object({ id: z.string().regex(/^\d+$/) });
export const proposalResponse = envelope(proposalDetailData);
export const proposalServerResponse = envelope(proposalDetailServerData);

const winRow = z.object({
  dimension_value: z.string(), label: z.string(), deals: z.number(), calls_completed: z.number(), proposals_sent: z.number(), proposals_opened: z.number(),
  won: z.number(), lost: z.number(), decided: z.number(), win_rate_pct: nnum, avg_deal_size_inr: nnum, total_won_inr: z.number(),
  avg_hours_call_to_proposal: nnum, median_hours_call_to_proposal: nnum, open_rate_pct: nnum,
});
export type WinRow = z.infer<typeof winRow>;
export const winrateData = z.object({
  group_by: groupBySchema, period: periodSchema, rows: z.array(winRow),
  overall: z.object({ deals: z.number(), proposals_sent: z.number(), won: z.number(), lost: z.number(), win_rate_pct: nnum, avg_deal_size_inr: nnum, total_won_inr: z.number() }),
  speed_buckets: z.array(z.object({ bucket: z.enum(['lt_24h', '24_48h', 'gt_48h']), label: z.string(), decided: z.number(), won: z.number(), lost: z.number(), win_rate_pct: nnum })),
  lost_reasons: z.array(z.object({ reason: z.string(), count: z.number() })),
});
export type WinrateData = z.infer<typeof winrateData>;
export const winrateQuery = z.object({ group_by: groupBySchema.optional(), period: periodSchema.optional(), consultant_id: z.string().optional() });
export const winrateResponse = envelope(winrateData);

export const slaData = z.object({
  thresholds: z.object({ proposal_sla_hours: z.number(), proposal_escalate_hours: z.number(), unopened_nudge_hours: z.number(), opened_followup_hours: z.number() }),
  overdue: z.array(z.object({
    deal_id: id, call_id: id, prospect_name: nstr, company: nstr, service_type: z.string(), consultant_id: id, consultant_name: z.string(), call_completed_at: ts,
    hours_since_call: z.number(), level: z.enum(['sla', 'escalated']), draft_proposal_id: id.nullable(), draft_version: z.number().nullable(), draft_status: proposalStatusSchema.nullable(),
  })),
  cold: z.array(z.object({
    proposal_id: id, deal_id: id, version: z.number(), kind: z.enum(['unopened', 'opened_undecided']), status: proposalStatusSchema,
    prospect_name: nstr, company: nstr, service_type: z.string(), consultant_id: id, consultant_name: z.string(), amount_inr: nnum,
    sent_at: ts, first_opened_at: nts, last_opened_at: nts, open_count: z.number(), expires_at: nts, hours_since_sent: z.number(), hours_since_first_open: nnum,
  })),
  counts: z.object({ overdue: z.number(), escalated: z.number(), unopened: z.number(), opened_undecided: z.number() }),
});
export type SlaData = z.infer<typeof slaData>;
export const slaQuery = z.object({ consultant_id: z.string().optional(), include_test: z.enum(['1']).optional() });
export const slaResponse = envelope(slaData);

export const serviceRow = z.object({
  id, name: z.string(), service_type: z.string(), base_price_inr: z.number(), proposal_template_doc_id: nstr, active: z.boolean(), created_at: ts, updated_at: ts,
  deals: z.number(), won: z.number(), lost: z.number(), win_rate_pct: nnum, avg_deal_size_inr: nnum, total_won_inr: z.number(),
});
export type ServiceRow = z.infer<typeof serviceRow>;
export const servicesResponse = envelope(z.array(serviceRow));

export const consultantRow = z.object({
  id, name: z.string(), email: z.string(), whatsapp: nstr, timezone: z.string(), created_at: ts,
  deals: z.number(), calls_completed: z.number(), proposals_sent: z.number(), won: z.number(), lost: z.number(), win_rate_pct: nnum,
  avg_deal_size_inr: nnum, total_won_inr: z.number(), avg_hours_call_to_proposal: nnum, median_hours_call_to_proposal: nnum, upcoming_calls: z.number(),
});
export type ConsultantRow = z.infer<typeof consultantRow>;
export const consultantsResponse = envelope(z.array(consultantRow));

export const logRow = z.object({
  id, kind: z.enum(['event', 'error']), source: nstr, title: nstr, payload: z.unknown().nullable(), execution_id: nstr, is_test: z.boolean(), created_at: ts,
});
export type LogRow = z.infer<typeof logRow>;
export const logsQuery = z.object({
  type: z.enum(['event', 'error']).optional(), page: z.coerce.number().int().min(1).optional(), page_size: z.coerce.number().int().min(1).max(200).optional(),
  include_test: z.enum(['1']).optional(),
});
export const logsResponse = envelope(z.array(logRow));

export const configData = z.object({
  timezone: z.string(), currency: z.string(), dry_run: z.boolean(), auto_send_followups: z.boolean(),
  reminder_prospect_offsets: z.array(z.object({ minutes: z.number(), when: z.string() })), reminder_consultant_min: z.number(), reminder_grace_min: z.number(),
  brief_watch_horizon_min: z.number(), noshow_followup_hours: z.array(z.number()),
  proposal_sla_hours: z.number(), proposal_escalate_hours: z.number(), unopened_nudge_hours: z.number(), opened_followup_hours: z.number(),
  proposal_expiry_days: z.number(), final_notice_days_before_expiry: z.number(), open_dedupe_window_min: z.number(), stuck_days: z.number(),
});
export type ConfigData = z.infer<typeof configData>;
export const configResponse = envelope(configData);

/* ───────────────────────── EXISTING endpoints (real backend shapes) ───────────────────────── */

const okBase = { status: z.literal('ok'), records_affected: z.number() };

export const setupResponse = z.object({
  ...okBase,
  created: z.object({
    tables: z.array(z.string()), views: z.array(z.string()), functions: z.array(z.string()), indexes: z.array(z.string()), deal_stage_enum: z.array(z.string()),
  }),
});

export const serviceBody = z.object({
  name: z.string().min(1), service_type: z.string().regex(/^[a-z0-9_-]+$/i, 'letters, digits, - and _ only'),
  base_price_inr: z.number().min(0).optional(), proposal_template_doc_id: z.string().optional(), active: z.boolean().optional(),
});
export const serviceResponse = z.object({ ...okBase, ids: z.object({ service_id: id }), service_type: z.string(), created: z.boolean(), active: z.boolean() });

/** Browser -> proxy. The proxy maps it onto the backend's fields (booking_id | deal_id, outcome, transcript_text). */
export const callDoneBody = z.object({
  deal_id: id.optional(), booking_id: z.string().optional(), no_show: z.boolean().optional(),
  transcript_text: z.string().optional(), transcript_source: z.string().optional(), notes: z.string().optional(),
}).refine((v) => v.deal_id !== undefined || v.booking_id, { message: 'deal_id or booking_id is required' })
  .refine((v) => v.no_show || (v.transcript_text ?? '').trim().length >= 20, { message: 'Paste at least a few lines of transcript or notes, or mark the call as a no-show.' });
export const callDoneResponse = z.union([
  z.object({ ...okBase, outcome: z.literal('completed'), ids: z.object({ deal_id: id, call_id: id }), proposal: z.enum(['drafting', 'already_handled']) }),
  z.object({ ...okBase, outcome: z.literal('no_show'), ids: z.object({ deal_id: id, call_id: id }), rebooking: z.enum(['sent', 'already_handled']) }),
]);

/** Browser -> proxy. The backend wants { token, notes }; the proxy resolves the approval token server-side. */
export const reviseBody = z.object({ proposal_id: id, change_notes: z.string().min(3, 'Tell us what to change') });
export const reviseBackendBody = z.object({ token: z.string(), notes: z.string() });
export const reviseResponse = z.object({ ...okBase, ids: z.object({ proposal_id: id, deal_id: id }), redrafting: z.boolean(), next_version: z.number() });

export const approveAdminBody = z.object({ proposal_id: id });
export const approveAdminResponse = z.object({
  ...okBase, ids: z.object({ proposal_id: id, deal_id: id }), sent: z.boolean(), version: z.number(), message: z.string(),
});

export const briefRegenerateBody = z.object({ deal_id: id });
export const briefRegenerateResponse = z.object({ ...okBase, ids: z.object({ deal_id: id, call_id: id }), brief: z.literal('generating') });

/** Browser -> proxy. The backend also wants consultant_email (ownership check); the proxy supplies it. */
export const stageBody = z.object({
  deal_id: id, to_stage: stageSchema, note: z.string().optional(), value_inr: z.number().min(0).optional(), lost_reason: z.string().optional(),
}).refine((v) => v.to_stage !== 'lost' || (v.lost_reason ?? '').trim().length > 0, { message: 'A reason is required when marking a deal lost.', path: ['lost_reason'] });
export const stageBackendBody = z.object({
  deal_id: z.union([id, z.string()]), to_stage: stageSchema, consultant_email: z.string(), note: z.string().optional(), value_inr: z.number().optional(), lost_reason: z.string().optional(),
});
export const stageResponse = z.object({ ...okBase, changed: z.boolean(), from_stage: stageSchema.nullable(), to_stage: stageSchema, ids: z.object({ deal_id: id }) });

export const consultantBody = z.object({
  id: id.optional(), name: z.string().min(1), email: z.email(), whatsapp: z.string().optional(), timezone: z.string().optional(),
});
export const consultantResponse = z.object({ ...okBase, ids: z.object({ consultant_id: id }), created: z.boolean() });

const metricsRow = z.object({
  dimension_value: z.string(), deals: z.number(), calls_completed: z.number(), proposals_sent: z.number(), proposals_opened: z.number(), won: z.number(), lost: z.number(),
  win_rate_pct: nnum, avg_deal_size_inr: nnum, total_won_inr: z.number(), avg_hours_call_to_proposal: nnum, median_hours_call_to_proposal: nnum,
  avg_hours_proposal_to_decision: nnum, open_rate_pct: nnum, briefs_ready: z.number(), brief_ready_pct: nnum, proposals_drafted: z.number(),
  proposals_accepted: z.number(), avg_hours_call_to_draft: nnum, computed_at: ts,
});
export const metricsQuery = z.object({ period: periodSchema.optional(), service_type: z.string().optional(), lead_source: z.string().optional() });
export const metricsResponse = z.object({
  ...okBase, period: periodSchema, overall: metricsRow.nullable(), by_service_type: z.array(metricsRow), by_lead_source: z.array(metricsRow),
  by_service_type_x_lead_source: z.array(metricsRow), by_consultant: z.array(metricsRow),
});

const dealRowRaw = z.object({
  id, prospect_id: id, consultant_id: id, service_type: z.string(), lead_source: z.string(), stage: stageSchema, value_inr: nnum, currency: z.string(),
  lost_reason: nstr, is_test: z.boolean(), created_at: ts, stage_changed_at: ts, won_at: nts, lost_at: nts,
});
const prospectRaw = z.object({
  id, name: nstr, email: nstr, phone: nstr, company: nstr, website: nstr, linkedin_url: nstr, role: nstr, lead_source: nstr,
  utm_source: nstr, utm_medium: nstr, utm_campaign: nstr, referrer: nstr, opted_out: z.boolean(), is_test: z.boolean(), created_at: ts,
});
const callRaw = z.object({
  id, deal_id: id, booking_id: z.string(), provider: z.string(), booked_at: ts, scheduled_for: nts, status: callStatusSchema, intake_answers: z.unknown().nullable(),
  transcript_source: nstr, notes: nstr, completed_at: nts,
});
const briefRaw = z.object({
  id, deal_id: id, call_id: id, status: briefStatusSchema, brief_markdown: nstr, brief_doc_url: nstr, sources_json: z.unknown().nullable(), attempts: z.number(), error: nstr,
  created_at: ts, generated_at: nts, delivered_at: nts,
});
const dealTimelineProposal = z.object({
  id, deal_id: id, version: z.number(), doc_url: nstr, pdf_drive_id: nstr, amount_inr: nnum, status: proposalStatusSchema, change_notes: nstr, payment_link: nstr,
  followup_draft: nstr, followup_drafted_at: nts, drafted_at: ts, approved_at: nts, sent_at: nts, first_opened_at: nts, open_count: z.number(), last_opened_at: nts,
  accepted_at: nts, declined_at: nts, expires_at: nts,
  events: z.array(z.object({ id, proposal_id: id, event_type: proposalEventTypeSchema, user_agent: nstr, meta: z.unknown().nullable(), created_at: ts })),
});
const paymentRaw = z.object({ id, deal_id: id, payment_id: z.string(), provider: z.string(), amount_inr: z.number(), status: z.string(), paid_at: ts });
const dealEventRaw = z.object({
  id, deal_id: id, event_type: z.string(), from_stage: stageSchema.nullable(), to_stage: stageSchema.nullable(), note: nstr, payload: z.unknown().nullable(), created_at: ts,
});
export type DealEvent = z.infer<typeof dealEventRaw>;
export type DealTimelineProposal = z.infer<typeof dealTimelineProposal>;
export type PaymentRow = z.infer<typeof paymentRaw>;
export const dealDetailQuery = z.object({ id: z.string().regex(/^\d+$/) });
/** GET /deal/deal as the backend returns it (flat, with status/records_affected/ids). Tokens are declared only on the server schema. */
const dealDetailShape = {
  ...okBase, ids: z.object({ deal_id: id, prospect_id: id }),
  deal: dealRowRaw, prospect: prospectRaw, consultant: z.object({ id, name: z.string(), email: z.string(), whatsapp: nstr, timezone: z.string(), created_at: ts }),
  calls: z.array(callRaw), brief: briefRaw.nullable(), payments: z.array(paymentRaw), timeline: z.array(dealEventRaw),
};
export const dealDetailResponse = z.object({ ...dealDetailShape, proposals: z.array(dealTimelineProposal) });
export const dealDetailServerResponse = z.object({
  ...dealDetailShape, proposals: z.array(dealTimelineProposal.extend({ tracking_token: z.string(), approve_token: z.string() })),
});
export type DealDetail = z.infer<typeof dealDetailResponse>;

export const testBody = z.object({ scenario: testScenarioSchema, size: z.number().int().min(1).max(10).optional() });
export const testCheck = z.object({ name: z.string(), expected: z.unknown(), actual: z.unknown(), pass: z.boolean() });
export const testResponse = z.union([
  z.object({
    status: z.enum(['ok', 'checks_failed']), records_affected: z.number(), ids: z.object({ booking_ids: z.array(z.string()) }).optional(),
    result: z.object({
      scenario: z.string(), size: z.number().optional(), run_id: z.string().optional(), booking_ids: z.array(z.string()).optional(),
      steps: z.array(z.object({ step: z.string(), http_status: z.number(), status: z.unknown().optional() })),
      checks: z.array(testCheck), all_checks_passed: z.boolean(),
    }).loose(),
  }),
  z.object({ ...okBase, deleted: z.record(z.string(), z.number()), metric_rows: z.number().optional() }),
]);
export type TestResponse = z.infer<typeof testResponse>;

/** Shown only for completeness: the dashboard never calls these (see BLOCKED below). */
export const callBookedBody = z.record(z.string(), z.unknown());

/* ───────────────────────── endpoint map ───────────────────────── */

export type Role = 'owner' | 'consultant';
/**
 * How the proxy confines a consultant:
 *  - 'consultant_param' : consultant_id is forced to the caller's own id
 *  - 'deal'             : the deal named by deal_id / id must belong to the caller
 *  - 'proposal'         : the proposal named by id / proposal_id must belong to the caller
 *  - 'none'             : no per-consultant data
 */
export type Scoping = 'consultant_param' | 'deal' | 'proposal' | 'none';

export interface EndpointDef {
  key: string;
  method: 'GET' | 'POST';
  /** n8n path (also the suffix after /api/n8n in the browser). */
  path: string;
  kind: 'read' | 'action';
  roles: Role[];
  scoping: Scoping;
  summary: string;
  /** Where the dashboard uses it. */
  screen: string;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
  /** Response schema carrying tokens, parsed server-side only. */
  serverResponse?: z.ZodType;
  /** n8n auth: Header Auth unless noted. */
  auth: 'header' | 'none';
  /** true = added by the dashboard work to the same workflow; false = existed already. */
  addedByDashboard: boolean;
  /** Changes backend state: UI must confirm. */
  mutates: boolean;
  /** Which query keys the UI must refetch afterwards. */
  invalidates?: string[];
  /** false = part of the workflow but never called by the dashboard. */
  dashboard: boolean;
}

/** `const` keeps each endpoint's literal key and its exact Zod schemas, so hooks get precise response types. */
const E = <const D extends EndpointDef>(d: D): D => d;

export const endpoints = {
  overview: E({ key: 'overview', method: 'GET', path: '/deal/overview', kind: 'read', roles: ['owner', 'consultant'], scoping: 'consultant_param', summary: 'KPI totals, previous period, weekly sparkline series', screen: 'Overview', query: overviewQuery, response: overviewResponse, auth: 'header', addedByDashboard: true, mutates: false, dashboard: true }),
  deals: E({ key: 'deals', method: 'GET', path: '/deal/deals', kind: 'read', roles: ['owner', 'consultant'], scoping: 'consultant_param', summary: 'Pipeline list with days in stage and latest proposal status', screen: 'Pipeline, search', query: dealsQuery, response: dealsResponse, auth: 'header', addedByDashboard: true, mutates: false, dashboard: true }),
  calls: E({ key: 'calls', method: 'GET', path: '/deal/calls', kind: 'read', roles: ['owner', 'consultant'], scoping: 'consultant_param', summary: 'Calls with brief status and hours until the call', screen: 'Calls & Briefs, Overview, deal drawer', query: callsQuery, response: callsResponse, auth: 'header', addedByDashboard: true, mutates: false, dashboard: true }),
  brief: E({ key: 'brief', method: 'GET', path: '/deal/brief', kind: 'read', roles: ['owner', 'consultant'], scoping: 'deal', summary: 'Research brief markdown, doc URL and sources', screen: 'Calls & Briefs, deal drawer', query: briefQuery, response: briefResponse, auth: 'header', addedByDashboard: true, mutates: false, dashboard: true }),
  proposals: E({ key: 'proposals', method: 'GET', path: '/deal/proposals', kind: 'read', roles: ['owner', 'consultant'], scoping: 'consultant_param', summary: 'Proposals with tracking counters and timings', screen: 'Proposals', query: proposalsQuery, response: proposalsResponse, auth: 'header', addedByDashboard: true, mutates: false, dashboard: true }),
  proposal: E({ key: 'proposal', method: 'GET', path: '/deal/proposal', kind: 'read', roles: ['owner', 'consultant'], scoping: 'proposal', summary: 'All versions, events and approval state of one proposal', screen: 'Proposals', query: proposalQuery, response: proposalResponse, serverResponse: proposalServerResponse, auth: 'header', addedByDashboard: true, mutates: false, dashboard: true }),
  winrate: E({ key: 'winrate', method: 'GET', path: '/deal/winrate', kind: 'read', roles: ['owner', 'consultant'], scoping: 'consultant_param', summary: 'Win rate and deal size grouped by a dimension, speed buckets, lost reasons', screen: 'Win Rate & Deal Size', query: winrateQuery, response: winrateResponse, auth: 'header', addedByDashboard: true, mutates: false, dashboard: true }),
  sla: E({ key: 'sla', method: 'GET', path: '/deal/sla', kind: 'read', roles: ['owner', 'consultant'], scoping: 'consultant_param', summary: 'Proposals overdue and going cold', screen: 'Overview', query: slaQuery, response: slaResponse, auth: 'header', addedByDashboard: true, mutates: false, dashboard: true }),
  services: E({ key: 'services', method: 'GET', path: '/deal/services', kind: 'read', roles: ['owner', 'consultant'], scoping: 'none', summary: 'Services with win rate and deal size', screen: 'Services, filters', response: servicesResponse, auth: 'header', addedByDashboard: true, mutates: false, dashboard: true }),
  consultants: E({ key: 'consultants', method: 'GET', path: '/deal/consultants', kind: 'read', roles: ['owner'], scoping: 'none', summary: 'Consultants with call, speed and win stats', screen: 'Consultants, filters', response: consultantsResponse, auth: 'header', addedByDashboard: true, mutates: false, dashboard: true }),
  logs: E({ key: 'logs', method: 'GET', path: '/deal/logs', kind: 'read', roles: ['owner'], scoping: 'none', summary: 'Event and error log', screen: 'System', query: logsQuery, response: logsResponse, auth: 'header', addedByDashboard: true, mutates: false, dashboard: true }),
  config: E({ key: 'config', method: 'GET', path: '/deal/config', kind: 'read', roles: ['owner', 'consultant'], scoping: 'none', summary: 'Non-secret CONFIG values (timings, flags) in plain numbers', screen: 'System, Pipeline (stuck threshold)', response: configResponse, auth: 'header', addedByDashboard: true, mutates: false, dashboard: true }),
  metrics: E({ key: 'metrics', method: 'GET', path: '/deal/metrics', kind: 'read', roles: ['owner'], scoping: 'none', summary: 'Recomputes and returns pipeline_metrics (existing)', screen: 'System health check', query: metricsQuery, response: metricsResponse, auth: 'header', addedByDashboard: false, mutates: false, dashboard: true }),
  deal: E({ key: 'deal', method: 'GET', path: '/deal/deal', kind: 'read', roles: ['owner', 'consultant'], scoping: 'deal', summary: 'Full timeline of one deal (existing)', screen: 'Deal drawer', query: dealDetailQuery, response: dealDetailResponse, serverResponse: dealDetailServerResponse, auth: 'header', addedByDashboard: false, mutates: false, dashboard: true }),

  approveAdmin: E({ key: 'approveAdmin', method: 'POST', path: '/deal/proposal/approve-admin', kind: 'action', roles: ['owner', 'consultant'], scoping: 'proposal', summary: 'Approve and send a drafted proposal (same chain as the emailed approve link)', screen: 'Proposals', body: approveAdminBody, response: approveAdminResponse, auth: 'header', addedByDashboard: true, mutates: true, invalidates: ['proposals', 'proposal', 'sla', 'overview', 'deals', 'deal'], dashboard: true }),
  revise: E({ key: 'revise', method: 'POST', path: '/deal/proposal/revise', kind: 'action', roles: ['owner', 'consultant'], scoping: 'proposal', summary: 'Request changes: stores notes and redrafts as the next version (existing)', screen: 'Proposals, deal drawer', body: reviseBody, response: reviseResponse, auth: 'header', addedByDashboard: false, mutates: true, invalidates: ['proposals', 'proposal', 'sla', 'deals', 'deal'], dashboard: true }),
  briefRegenerate: E({ key: 'briefRegenerate', method: 'POST', path: '/deal/brief/regenerate', kind: 'action', roles: ['owner', 'consultant'], scoping: 'deal', summary: 'Regenerate the research brief for a deal', screen: 'Calls & Briefs, deal drawer', body: briefRegenerateBody, response: briefRegenerateResponse, auth: 'header', addedByDashboard: true, mutates: true, invalidates: ['brief', 'calls', 'deal', 'overview'], dashboard: true }),
  callDone: E({ key: 'callDone', method: 'POST', path: '/deal/call-done', kind: 'action', roles: ['owner', 'consultant'], scoping: 'deal', summary: 'Log a call outcome: transcript/notes or no-show (existing)', screen: 'Calls & Briefs', body: callDoneBody, response: callDoneResponse, auth: 'header', addedByDashboard: false, mutates: true, invalidates: ['calls', 'deals', 'deal', 'proposals', 'sla', 'overview'], dashboard: true }),
  stage: E({ key: 'stage', method: 'POST', path: '/deal/stage', kind: 'action', roles: ['owner', 'consultant'], scoping: 'deal', summary: 'Manual stage override and value change (existing)', screen: 'Pipeline, deal drawer', body: stageBody, response: stageResponse, auth: 'header', addedByDashboard: false, mutates: true, invalidates: ['deals', 'deal', 'overview', 'winrate', 'services', 'consultants'], dashboard: true }),
  service: E({ key: 'service', method: 'POST', path: '/deal/service', kind: 'action', roles: ['owner'], scoping: 'none', summary: 'Create or update a service (existing)', screen: 'Services', body: serviceBody, response: serviceResponse, auth: 'header', addedByDashboard: false, mutates: true, invalidates: ['services'], dashboard: true }),
  consultant: E({ key: 'consultant', method: 'POST', path: '/deal/consultant', kind: 'action', roles: ['owner'], scoping: 'none', summary: 'Create or update a consultant', screen: 'Consultants', body: consultantBody, response: consultantResponse, auth: 'header', addedByDashboard: true, mutates: true, invalidates: ['consultants'], dashboard: true }),
  setup: E({ key: 'setup', method: 'POST', path: '/deal/setup', kind: 'action', roles: ['owner'], scoping: 'none', summary: 'Create tables, views and functions (existing, idempotent)', screen: 'System', response: setupResponse, auth: 'header', addedByDashboard: false, mutates: true, dashboard: true }),
  test: E({ key: 'test', method: 'POST', path: '/deal/test', kind: 'action', roles: ['owner'], scoping: 'none', summary: 'Run a test scenario or clean test data up (existing)', screen: 'System', body: testBody, response: testResponse, auth: 'header', addedByDashboard: false, mutates: true, invalidates: ['deals', 'calls', 'proposals', 'overview', 'winrate', 'sla'], dashboard: true }),

  callBooked: E({ key: 'callBooked', method: 'POST', path: '/deal/call-booked', kind: 'action', roles: ['owner'], scoping: 'none', summary: 'Booking intake (Calendly/Cal.com/generic) - used by integrations, not the dashboard', screen: '-', body: callBookedBody, response: z.unknown(), auth: 'header', addedByDashboard: false, mutates: true, dashboard: false }),
  approveLink: E({ key: 'approveLink', method: 'GET', path: '/deal/proposal/approve', kind: 'action', roles: ['owner'], scoping: 'none', summary: 'Emailed approve link (token auth, returns HTML) - replaced by approve-admin in the dashboard', screen: '-', response: z.unknown(), auth: 'none', addedByDashboard: false, mutates: true, dashboard: false }),
} as const;

export type EndpointKey = keyof typeof endpoints;
export const endpointList: EndpointDef[] = Object.values(endpoints);

/**
 * Paths the dashboard must NEVER call: calling them would create fake opens, clicks, acceptances, declines or payments.
 * The proxy refuses them even if they are somehow requested.
 */
export const BLOCKED_PATH_PATTERNS: RegExp[] = [/^\/deal\/t(\/|$)/, /^\/deal\/payment(\/|$)/];
export const BLOCKED_PATHS_DOC = ['/deal/t/open', '/deal/t/click', '/deal/t/accept', '/deal/t/decline', '/deal/payment'] as const;
export function isBlockedPath(pathname: string): boolean {
  return BLOCKED_PATH_PATTERNS.some((re) => re.test(pathname.replace(/\/+$/, '')));
}

/** The only paths the proxy forwards. */
export function findEndpoint(method: string, pathname: string): EndpointDef | undefined {
  const p = pathname.replace(/\/+$/, '');
  if (isBlockedPath(p)) return undefined;
  return endpointList.find((e) => e.dashboard && e.method === method.toUpperCase() && e.path === p);
}

/** Keys removed from every response before it reaches a browser, whatever the schema says. */
export const SECRET_KEYS = ['approve_token', 'tracking_token', 'ip_hash'] as const;

export type Infer<K extends EndpointKey> = z.infer<(typeof endpoints)[K]['response']>;

/** Human labels */
export const STAGE_LABEL: Record<Stage, string> = {
  call_booked: 'Call booked', brief_ready: 'Brief ready', call_done: 'Call done', proposal_drafted: 'Proposal drafted', proposal_sent: 'Proposal sent',
  proposal_opened: 'Proposal opened', negotiation: 'Negotiation', won: 'Won', lost: 'Lost', no_show: 'No-show',
};
