/** Raw records, shaped like the Postgres tables (timestamps as ISO strings, as the workflow's JSON emits them). */
import type { CallStatus, ProposalStatus, Stage } from '@/contracts/deal-api';

export interface DbConsultant { id: number; name: string; email: string; whatsapp: string | null; timezone: string; created_at: string }
export interface DbService {
  id: number; name: string; service_type: string; base_price_inr: number; proposal_template_doc_id: string | null; active: boolean; created_at: string; updated_at: string;
}
export interface DbProspect {
  id: number; name: string | null; email: string | null; phone: string | null; company: string | null; website: string | null; linkedin_url: string | null; role: string | null;
  lead_source: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; referrer: string | null;
  opted_out: boolean; is_test: boolean; created_at: string;
}
export interface DbDeal {
  id: number; prospect_id: number; consultant_id: number; service_type: string; lead_source: string; stage: Stage; value_inr: number | null; currency: string;
  lost_reason: string | null; is_test: boolean; created_at: string; stage_changed_at: string; won_at: string | null; lost_at: string | null;
}
export interface DbCall {
  id: number; deal_id: number; booking_id: string; provider: string; booked_at: string; scheduled_for: string | null; status: CallStatus;
  intake_answers: unknown; transcript_text: string | null; transcript_source: string | null; notes: string | null; completed_at: string | null;
}
export interface DbBrief {
  id: number; deal_id: number; call_id: number; status: 'pending' | 'ready' | 'failed'; brief_markdown: string | null; brief_doc_url: string | null;
  sources_json: unknown; attempts: number; error: string | null; created_at: string; generated_at: string | null; delivered_at: string | null;
}
export interface DbProposal {
  id: number; deal_id: number; version: number; doc_url: string | null; pdf_drive_id: string | null; amount_inr: number | null; status: ProposalStatus;
  tracking_token: string; approve_token: string; change_notes: string | null; payment_link: string | null; followup_draft: string | null; followup_drafted_at: string | null;
  drafted_at: string; approved_at: string | null; sent_at: string | null; first_opened_at: string | null; open_count: number; last_opened_at: string | null;
  accepted_at: string | null; declined_at: string | null; expires_at: string | null;
}
export interface DbProposalEvent {
  id: number; proposal_id: number; event_type: 'open' | 'link_click' | 'accept_click' | 'decline_click' | 'sign' | 'pay'; ip_hash: string | null;
  user_agent: string | null; meta: unknown; created_at: string;
}
export interface DbPayment { id: number; deal_id: number; payment_id: string; provider: string; amount_inr: number; status: string; paid_at: string }
export interface DbDealEvent {
  id: number; deal_id: number; event_type: string; from_stage: Stage | null; to_stage: Stage | null; note: string | null; payload: unknown; created_at: string;
}
export interface DbEventLog { id: number; branch: string; event_type: string; payload: unknown; is_test: boolean; created_at: string }
export interface DbErrorLog { id: number; node: string | null; error: string | null; payload: unknown; execution_id: string | null; created_at: string }

export interface Db {
  consultants: DbConsultant[]; services: DbService[]; prospects: DbProspect[]; deals: DbDeal[]; calls: DbCall[]; briefs: DbBrief[];
  proposals: DbProposal[]; proposalEvents: DbProposalEvent[]; payments: DbPayment[]; dealEvents: DbDealEvent[]; eventLog: DbEventLog[]; errorLog: DbErrorLog[];
}
