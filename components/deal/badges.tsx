'use client';
import { AlertTriangle, Eye, EyeOff, Hourglass } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CallBriefStatus, ProposalStatus, Stage } from '@/contracts/deal-api';
import { STAGE_LABEL } from '@/contracts/deal-api';
import { Badge } from '@/components/ui/primitives';
import { maskEmail, maskPhone, relativeTime } from '@/lib/format';
import { PROPOSAL_LABEL, PROPOSAL_TONE, STAGE_TONE } from '@/lib/format/labels';
import { useNow } from '@/lib/client/session';
import { cn } from '@/lib/utils';

export const StageBadge = ({ stage }: { stage: Stage }) => <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>;
export const ProposalBadge = ({ status }: { status: ProposalStatus }) => <Badge tone={PROPOSAL_TONE[status]}>{PROPOSAL_LABEL[status]}</Badge>;

/** The headline signal on every call: is the research brief ready? The check draws itself when it appears. */
export function BriefBadge({ status, large, className }: { status: CallBriefStatus; large?: boolean; className?: string }) {
  const size = large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  if (status === 'ready') {
    return (
      <span className={cn('check-badge inline-flex items-center gap-1.5 rounded-full bg-good-soft font-semibold text-good', size, className)}>
        <svg viewBox="0 0 24 24" className={large ? 'size-4' : 'size-3.5'} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        Brief ready
      </span>
    );
  }
  if (status === 'pending') return <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-warn-soft font-semibold text-warn', size, className)}><Hourglass className={large ? 'size-4' : 'size-3.5'} aria-hidden />Generating</span>;
  if (status === 'failed') return <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-bad-soft font-semibold text-bad', size, className)}><AlertTriangle className={large ? 'size-4' : 'size-3.5'} aria-hidden />Failed</span>;
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-surface-2 font-medium text-ink-3', size, className)}>No brief yet</span>;
}

/** Green pulse for proposals opened in the last hour. */
export function RecentOpen({ lastOpenedAt, className }: { lastOpenedAt: string | null; className?: string }) {
  const now = useNow(30_000);
  if (!lastOpenedAt || now - Date.parse(lastOpenedAt) > 3_600_000) return null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium text-good', className)}>
      <span className="pulse-dot size-2 rounded-full bg-[var(--good-solid)]" aria-hidden />
      Opened {relativeTime(lastOpenedAt, now)}
    </span>
  );
}

/** Phones and emails stay masked until someone asks; they re-mask after a short while. */
export function Masked({ kind, value, className }: { kind: 'email' | 'phone'; value: string | null | undefined; className?: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { if (!shown) return; const t = setTimeout(() => setShown(false), 20_000); return () => clearTimeout(t); }, [shown]);
  if (!value) return <span className="text-ink-3">—</span>;
  const href = kind === 'email' ? `mailto:${value}` : `tel:${value}`;
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {shown ? <a href={href} className="tnum text-accent hover:underline">{value}</a> : <span className="tnum text-ink-2" aria-label={`Hidden ${kind}`}>{kind === 'email' ? maskEmail(value) : maskPhone(value)}</span>}
      <button type="button" onClick={() => setShown((s) => !s)} className="rounded p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={shown ? `Hide ${kind}` : `Show ${kind}`} aria-pressed={shown}>
        {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </span>
  );
}
