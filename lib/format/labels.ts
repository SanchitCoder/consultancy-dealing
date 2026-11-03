import type { ProposalStatus, Stage } from '@/contracts/deal-api';

const SOURCE: Record<string, string> = {
  linkedin_outbound: 'LinkedIn outbound', instagram: 'Instagram', referral: 'Referral', webinar: 'Webinar', google_search: 'Google search', cold_email: 'Cold email', direct: 'Direct',
};
const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const sourceLabel = (s: string | null | undefined): string => (s ? SOURCE[s] ?? titleCase(s) : '—');
export const serviceLabel = (type: string, name?: string | null): string => name ?? titleCase(type);

export const PROPOSAL_LABEL: Record<ProposalStatus, string> = {
  drafted: 'Awaiting approval', approved: 'Approved', sent: 'Sent', opened: 'Opened', accepted: 'Accepted', declined: 'Declined', expired: 'Expired', superseded: 'Replaced by newer version',
};
export type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad' | 'accent';
export const PROPOSAL_TONE: Record<ProposalStatus, Tone> = {
  drafted: 'warn', approved: 'info', sent: 'info', opened: 'accent', accepted: 'good', declined: 'bad', expired: 'neutral', superseded: 'neutral',
};
export const STAGE_TONE: Record<Stage, Tone> = {
  call_booked: 'neutral', brief_ready: 'info', call_done: 'info', proposal_drafted: 'warn', proposal_sent: 'info', proposal_opened: 'accent', negotiation: 'accent', won: 'good', lost: 'bad', no_show: 'neutral',
};
export const LOST_REASONS = ['budget', 'timing', 'went with competitor', 'no response', 'not the right fit'] as const;
export const initials = (name: string | null | undefined): string => (name ?? '?').split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
