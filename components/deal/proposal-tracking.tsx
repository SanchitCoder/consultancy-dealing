'use client';
import { CheckCircle2, CircleDollarSign, ExternalLink, Eye, FilePlus2, Info, Link2, MousePointerClick, Send, ThumbsDown, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/primitives';
import type { ProposalDetail } from '@/contracts/deal-api';
import { useApi } from '@/lib/client/hooks';
import { useNow } from '@/lib/client/session';
import { deviceLabel, expiryText, formatIst, hoursHuman, inr, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Masked, ProposalBadge, RecentOpen } from './badges';
import { ApproveSendButton, RequestChangesButton } from './proposal-actions';
import { ErrorState } from './states';

export const OPENS_NOTE = 'Opens are approximate. Many mail apps (Apple Mail, Gmail) pre-load images, so a pre-load can look like an open. Accepts and link clicks are the reliable signals.';

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return <div className="rounded-lg bg-surface-2 p-3"><p className="text-xs text-ink-3">{label}</p><p className="tnum mt-0.5 text-[15px] font-semibold text-ink">{value}</p>{sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}</div>;
}

type TimelineItem = { at: string; icon: typeof Eye; tone: string; title: string; sub?: string };
function buildTimeline(d: ProposalDetail): TimelineItem[] {
  const p = d.proposal;
  const items: TimelineItem[] = [{ at: p.drafted_at, icon: FilePlus2, tone: 'text-ink-3', title: `Version ${p.version} drafted` }];
  if (p.approved_at) items.push({ at: p.approved_at, icon: CheckCircle2, tone: 'text-info', title: 'Approved' });
  if (p.sent_at) items.push({ at: p.sent_at, icon: Send, tone: 'text-info', title: 'Sent to the prospect' });
  for (const e of d.events.filter((x) => x.proposal_id === p.id)) {
    if (e.event_type === 'open') items.push({ at: e.created_at, icon: Eye, tone: 'text-accent', title: 'Opened', sub: deviceLabel(e.user_agent) });
    else if (e.event_type === 'link_click') items.push({ at: e.created_at, icon: MousePointerClick, tone: 'text-accent', title: 'Clicked the proposal link', sub: deviceLabel(e.user_agent) });
    else if (e.event_type === 'accept_click') items.push({ at: e.created_at, icon: CheckCircle2, tone: 'text-good', title: 'Accepted', sub: 'Reliable signal' });
    else if (e.event_type === 'decline_click') items.push({ at: e.created_at, icon: ThumbsDown, tone: 'text-bad', title: 'Declined', sub: (e.meta as { reason?: string } | null)?.reason ? `Reason: ${(e.meta as { reason: string }).reason}` : undefined });
    else if (e.event_type === 'pay') items.push({ at: e.created_at, icon: CircleDollarSign, tone: 'text-good', title: 'Payment received' });
  }
  if (p.status === 'expired' && p.expires_at) items.push({ at: p.expires_at, icon: XCircle, tone: 'text-ink-3', title: 'Expired without a decision' });
  return items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Everything about one proposal after it is written: versions, opens, clicks, decisions, timings and expiry. */
export function ProposalTracking({ proposalId: initial, compact }: { proposalId: number; compact?: boolean }) {
  const [id, setId] = useState(initial);
  const now = useNow();
  const q = useApi('proposal', { id: String(id) }, { refetchInterval: 15_000 });
  if (q.isLoading) return <div className="space-y-3" aria-busy><Skeleton className="h-8 w-2/3" /><div className="grid grid-cols-2 gap-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div><Skeleton className="h-40" /></div>;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!.data;
  const p = d.proposal;
  const timeline = buildTimeline(d);
  const ref = { id: p.id, version: p.version, company: d.prospect.company, prospect_name: d.prospect.name, amount_inr: p.amount_inr };
  return (
    <div className={cn('space-y-5', compact && 'text-[13px]')}>
      <div className="flex flex-wrap items-center gap-2">
        <ProposalBadge status={p.status} />
        <span className="tnum text-lg font-semibold text-ink">{inr(p.amount_inr)}</span>
        <span className="text-ink-3">Version {p.version}</span>
        <RecentOpen lastOpenedAt={p.last_opened_at} />
        {p.doc_url && <Button asChild size="sm" variant="ghost" className="ml-auto"><a href={p.doc_url} target="_blank" rel="noreferrer noopener"><ExternalLink className="size-3.5" aria-hidden />Open proposal<span className="sr-only"> (opens Google Docs)</span></a></Button>}
      </div>

      {d.approval.can_approve && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warn/40 bg-warn-soft p-3">
          <p className="min-w-48 flex-1 text-sm text-warn">This draft is waiting for your approval. Nothing has been sent.</p>
          <RequestChangesButton proposal={ref} /><ApproveSendButton proposal={ref} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Call to proposal" value={p.hours_call_to_proposal !== null ? hoursHuman(p.hours_call_to_proposal) : 'Not sent yet'} sub={p.sent_at && !p.is_first_sent_version ? 'This is a later version' : p.hours_call_to_draft !== null ? `Draft ready after ${hoursHuman(p.hours_call_to_draft)}` : undefined} />
        <Stat label="Since it was sent" value={p.days_since_sent !== null ? (p.days_since_sent < 1 ? 'Today' : `${Math.round(p.days_since_sent)} days`) : '—'} sub={p.sent_at ? formatIst(p.sent_at) : undefined} />
        <Stat label="Validity" value={p.status === 'expired' ? 'Expired' : p.sent_at ? expiryText(p.expires_at, now).replace('Expires ', '') : 'Starts when sent'} sub={p.expires_at ? formatIst(p.expires_at, 'd MMM yyyy') : undefined} />
        <Stat label="Opens" value={p.open_count} sub={p.first_opened_at ? `First ${relativeTime(p.first_opened_at, now)}` : 'Not opened yet'} />
        <Stat label="Last opened" value={p.last_opened_at ? relativeTime(p.last_opened_at, now) : '—'} sub={p.last_opened_at ? formatIst(p.last_opened_at) : undefined} />
        <Stat label="Link clicks" value={p.link_clicks} sub={p.link_clicks ? 'Reliable signal' : undefined} />
      </div>

      <p className="flex gap-2 rounded-lg bg-info-soft p-3 text-[13px] text-info"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{OPENS_NOTE}</p>

      <section aria-label="Timeline">
        <h3 className="mb-2 text-[13px] font-semibold text-ink">What happened</h3>
        <ol className="relative space-y-3 border-l border-border pl-5">
          {timeline.map((t, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[27px] grid size-[22px] place-items-center rounded-full border border-border bg-surface"><t.icon className={cn('size-3', t.tone)} aria-hidden /></span>
              <p className="text-sm text-ink">{t.title} <span className="text-ink-3">· {relativeTime(t.at, now)}</span></p>
              <p className="text-xs text-ink-3">{formatIst(t.at)}{t.sub ? ` · ${t.sub}` : ''}</p>
            </li>
          ))}
        </ol>
      </section>

      {d.versions.length > 1 && (
        <section aria-label="Version history">
          <h3 className="mb-2 text-[13px] font-semibold text-ink">Version history</h3>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {d.versions.map((v) => (
              <li key={v.id}>
                <button onClick={() => setId(v.id)} aria-current={v.id === p.id} className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2/60', v.id === p.id && 'bg-surface-2')}>
                  <span className="tnum w-8 text-sm font-semibold text-ink">v{v.version}</span>
                  <span className="min-w-0 flex-1"><span className="block text-[13px] text-ink-2">{inr(v.amount_inr)} · drafted {relativeTime(v.drafted_at, now)}{v.sent_at ? ` · sent ${relativeTime(v.sent_at, now)}` : ''}</span>{v.change_notes && <span className="block truncate text-xs text-ink-3">Changes asked: {v.change_notes}</span>}</span>
                  <ProposalBadge status={v.status} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Contact" className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-2">
        <div><p className="text-xs text-ink-3">Prospect</p><p className="text-sm font-medium text-ink">{d.prospect.name}</p><p className="text-xs text-ink-3">{d.prospect.role} · {d.prospect.company}</p></div>
        <div className="space-y-0.5 text-[13px]"><div className="flex items-center gap-2"><span className="w-12 text-xs text-ink-3">Email</span><Masked kind="email" value={d.prospect.email} /></div><div className="flex items-center gap-2"><span className="w-12 text-xs text-ink-3">Phone</span><Masked kind="phone" value={d.prospect.phone} /></div>
          {d.prospect.website && <div className="flex items-center gap-2"><span className="w-12 text-xs text-ink-3">Website</span><a href={d.prospect.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 truncate text-accent hover:underline"><Link2 className="size-3" aria-hidden />{d.prospect.website.replace(/^https?:\/\/(www\.)?/, '')}</a></div>}</div>
      </section>
    </div>
  );
}
