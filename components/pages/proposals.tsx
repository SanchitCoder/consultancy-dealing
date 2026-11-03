'use client';
import { keepPreviousData } from '@tanstack/react-query';
import { Clock3, Eye, MousePointerClick, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ProposalBadge, RecentOpen } from '@/components/deal/badges';
import { ProposalTracking, OPENS_NOTE } from '@/components/deal/proposal-tracking';
import { ProposalActionsRow } from '@/components/deal/proposal-row';
import { RequestChangesButton } from '@/components/deal/proposal-actions';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/deal/states';
import { useDealDrawer } from '@/components/deal/use-deal-drawer';
import { Button } from '@/components/ui/button';
import { Dialog, Sheet, SheetClose } from '@/components/ui/dialog';
import { Badge, Card } from '@/components/ui/primitives';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ProposalRow } from '@/contracts/deal-api';
import { useApi } from '@/lib/client/hooks';
import { useNow } from '@/lib/client/session';
import { expiryText, hoursHuman, inr, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'awaiting', label: 'Awaiting approval', status: 'drafted,approved' },
  { id: 'sent', label: 'Sent', status: 'sent' },
  { id: 'opened', label: 'Opened', status: 'opened' },
  { id: 'accepted', label: 'Accepted', status: 'accepted' },
  { id: 'closed', label: 'Declined / expired', status: 'declined,expired' },
] as const;

function Count({ status }: { status: string }) {
  const q = useApi('proposals', { status, page_size: 1 });
  return q.data ? <span className="tnum rounded-full bg-surface-3 px-1.5 text-[11px] text-ink-2">{q.data.meta.total}</span> : null;
}

export function Proposals() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = TABS.find((t) => t.id === params.get('tab'))?.id ?? 'awaiting';
  const openId = params.get('open') && /^\d+$/.test(params.get('open')!) ? Number(params.get('open')) : null;
  const setParam = (k: string, v: string | null) => { const n = new URLSearchParams(params.toString()); if (v === null) n.delete(k); else n.set(k, v); router.replace(`/proposals?${n.toString()}`, { scroll: false }); };
  return (
    <>
      <PageHeader title="Proposals" subtitle="Approve drafts, then watch what happens: opened, clicked, accepted or going quiet." />
      <Tabs value={tab} onValueChange={(v) => { const n = new URLSearchParams(params.toString()); n.set('tab', v); n.delete('open'); router.replace(`/proposals?${n.toString()}`, { scroll: false }); }}>
        <TabsList aria-label="Proposal status">{TABS.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}<Count status={t.status} /></TabsTrigger>)}</TabsList>
        {TABS.map((t) => <TabsContent key={t.id} value={t.id}>{tab === t.id && (t.id === 'awaiting' ? <ApprovalQueue onOpen={(id) => setParam('open', String(id))} /> : <TrackedList status={t.status} empty={t.id} onOpen={(id) => setParam('open', String(id))} />)}</TabsContent>)}
      </Tabs>
      <p className="mt-4 text-xs text-ink-3">{OPENS_NOTE}</p>
      <Dialog open={openId !== null} onOpenChange={(o) => !o && setParam('open', null)}>
        {openId !== null && (
          <Sheet title="Proposal tracking">
            <div className="flex items-center justify-between border-b border-border px-5 py-4"><h2 className="display text-xl font-semibold text-ink">Proposal tracking</h2><SheetClose className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close"><X className="size-5" /></SheetClose></div>
            <div className="flex-1 overflow-y-auto px-5 py-4"><ProposalTracking proposalId={openId} /></div>
          </Sheet>
        )}
      </Dialog>
    </>
  );
}

function ApprovalQueue({ onOpen }: { onOpen: (id: number) => void }) {
  const q = useApi('proposals', { status: 'drafted,approved', page_size: 50 }, { refetchInterval: 15_000 });
  const sla = useApi('sla');
  const waiting = new Map((sla.data?.data.overdue ?? []).map((o) => [o.deal_id, o]));
  const { openDeal } = useDealDrawer();
  if (q.isLoading) return <ListSkeleton rows={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const rows = [...q.data!.data].sort((a, b) => Date.parse(a.drafted_at) - Date.parse(b.drafted_at));
  if (!rows.length) return <EmptyState title="Nothing waiting for approval" hint="When a call is logged, the drafted proposal appears here a few minutes later." />;
  return (
    <div className="grid gap-3 xl:grid-cols-2 [&>*]:min-w-0">
      {rows.map((p) => {
        const late = waiting.get(p.deal_id);
        return (
          <Card key={p.id} className={cn('p-4', late?.level === 'escalated' && 'border-bad/40', late?.level === 'sla' && 'border-warn/50')}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <button onClick={() => openDeal(p.deal_id)} className="block max-w-full truncate text-left text-[15px] font-semibold text-ink hover:underline">{p.company}</button>
                <p className="truncate text-[13px] text-ink-3">{p.prospect_name} · {p.service_name} · {p.consultant_name}</p>
              </div>
              <div className="text-right"><p className="tnum text-lg font-semibold text-ink">{inr(p.amount_inr)}</p><p className="text-xs text-ink-3">Version {p.version}</p></div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-ink-3">Drafted {relativeTime(p.drafted_at)}{p.hours_call_to_draft !== null ? `, ${hoursHuman(p.hours_call_to_draft)} after the call` : ''}</span>
              {late && <Badge tone={late.level === 'escalated' ? 'bad' : 'warn'}><Clock3 className="size-3" aria-hidden />{hoursHuman(late.hours_since_call)} since the call</Badge>}
              {p.status === 'approved' && <Badge tone="info">Approved, sending</Badge>}
            </div>
            {p.change_notes && <p className="mt-2 rounded-lg bg-surface-2 p-2 text-xs text-ink-2"><span className="font-medium text-ink">You asked for:</span> {p.change_notes}</p>}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <Button size="sm" variant="ghost" onClick={() => onOpen(p.id)}>Details</Button>
              <div className="flex flex-wrap items-center gap-2"><ProposalActionsRow proposal={p} /></div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function TrackedList({ status, empty, onOpen }: { status: string; empty: string; onOpen: (id: number) => void }) {
  const [page, setPage] = useState(1);
  const now = useNow();
  const q = useApi('proposals', { status, page, page_size: 20 }, { placeholderData: keepPreviousData, refetchInterval: 20_000 });
  if (q.isLoading) return <ListSkeleton rows={5} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const rows = q.data!.data;
  const pages = Math.max(1, Math.ceil(q.data!.meta.total / q.data!.meta.page_size));
  const hints: Record<string, string> = { sent: 'Approved proposals that have not been opened yet show up here.', opened: 'Proposals the prospect has opened but not decided on.', accepted: 'Accepted proposals, waiting for payment or already paid.', closed: 'Declined and expired proposals.' };
  if (!rows.length) return <EmptyState title="Nothing here yet" hint={hints[empty]} />;
  return (
    <>
      <ul className="space-y-2">{rows.map((p) => <ProposalRowItem key={p.id} p={p} now={now} onOpen={() => onOpen(p.id)} />)}</ul>
      {pages > 1 && <div className="mt-4 flex items-center justify-between text-xs text-ink-3"><span className="tnum">Page {page} of {pages}</span><div className="flex gap-1.5"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((x) => x + 1)}>Next</Button></div></div>}
    </>
  );
}

function ProposalRowItem({ p, now, onOpen }: { p: ProposalRow; now: number; onOpen: () => void }) {
  return (
    <li>
      <button onClick={onOpen} className="grid w-full gap-x-4 gap-y-2 rounded-xl border border-border bg-surface p-3.5 text-left shadow-[var(--shadow-card)] transition-colors hover:border-border-strong sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{p.company} <span className="font-normal text-ink-3">· v{p.version}</span></p>
          <p className="truncate text-xs text-ink-3">{p.prospect_name} · {p.service_name} · {p.consultant_name}</p>
          <RecentOpen lastOpenedAt={p.last_opened_at} className="mt-1" />
        </div>
        <div className="space-y-0.5 text-xs text-ink-2">
          <p className="flex items-center gap-1.5"><Eye className="size-3.5 text-ink-3" aria-hidden /><span className="tnum">{p.open_count} {p.open_count === 1 ? 'open' : 'opens'}</span>{p.first_opened_at && <span className="text-ink-3">· first {relativeTime(p.first_opened_at, now)}</span>}</p>
          <p className="flex items-center gap-1.5"><MousePointerClick className="size-3.5 text-ink-3" aria-hidden /><span className="tnum">{p.link_clicks} {p.link_clicks === 1 ? 'click' : 'clicks'}</span>{p.sent_at && <span className="text-ink-3">· sent {relativeTime(p.sent_at, now)}</span>}</p>
          {p.status !== 'accepted' && p.status !== 'declined' && <p className="text-ink-3">{expiryText(p.expires_at, now)}</p>}
        </div>
        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center">
          <span className="tnum text-sm font-semibold text-ink">{inr(p.amount_inr)}</span>
          <ProposalBadge status={p.status} />
        </div>
      </button>
    </li>
  );
}

export { RequestChangesButton };
