'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRightLeft, Banknote, ExternalLink, Globe, Link2, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, Sheet, SheetClose } from '@/components/ui/dialog';
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from '@/components/ui/dropdown';
import { FieldError, Hint, Input, Label, Select, Skeleton, Textarea } from '@/components/ui/primitives';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { STAGE_LABEL, type DealDetail } from '@/contracts/deal-api';
import { useAction, useApi } from '@/lib/client/hooks';
import { useNow } from '@/lib/client/session';
import { calendarIst, formatIst, inr, relativeTime } from '@/lib/format';
import { LOST_REASONS, sourceLabel } from '@/lib/format/labels';
import { useServiceName } from '@/lib/client/use-service-name';
import { Masked, ProposalBadge, StageBadge } from './badges';
import { BriefViewer, RegenerateBriefButton } from './brief-viewer';
import { ConfirmDialog } from './confirm';
import { allowedMoves, type MoveTarget } from './deal-card';
import { LogOutcomeDialog } from './log-outcome';
import { ProposalTracking } from './proposal-tracking';
import { RequestChangesButton } from './proposal-actions';
import { EmptyState, ErrorState } from './states';
import { useDealDrawer } from './use-deal-drawer';

export function DealDrawer() {
  const { dealId, closeDeal } = useDealDrawer();
  return (
    <Dialog open={dealId !== null} onOpenChange={(o) => !o && closeDeal()}>
      {dealId !== null && <Sheet title="Deal details" description="Everything about this deal"><DrawerBody dealId={dealId} onClose={closeDeal} /></Sheet>}
    </Dialog>
  );
}

const valueSchema = z.object({ value: z.coerce.number({ error: 'Enter an amount' }).min(0, 'Cannot be negative').max(100_000_000, 'That looks too large') });

function DrawerBody({ dealId, onClose }: { dealId: number; onClose: () => void }) {
  const q = useApi('deal', { id: String(dealId) }, { refetchInterval: 20_000, retry: false });
  const [tab, setTab] = useState('overview');
  const header = (
    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
      {q.data ? <Header d={q.data} /> : <div className="min-w-0 flex-1"><Skeleton className="h-6 w-1/2" /><Skeleton className="mt-2 h-4 w-2/3" /></div>}
      <SheetClose className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close deal"><X className="size-5" /></SheetClose>
    </div>
  );
  if (q.isError) return <>{header}<div className="p-5"><ErrorState error={q.error} onRetry={() => q.refetch()} /><Button className="mt-3" onClick={onClose}>Close</Button></div></>;
  if (!q.data) return <>{header}<div className="space-y-3 p-5" aria-busy><Skeleton className="h-10" /><Skeleton className="h-40" /><Skeleton className="h-24" /></div></>;
  const d = q.data;
  return (
    <>
      {header}
      <ActionsBar d={d} />
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-5 py-2.5"><TabsList aria-label="Deal sections" className="w-full"><TabsTrigger value="overview">Profile</TabsTrigger><TabsTrigger value="brief">Brief</TabsTrigger><TabsTrigger value="calls">Calls</TabsTrigger><TabsTrigger value="proposals">Proposals <span className="tnum text-ink-3">{d.proposals.filter((p) => p.status !== 'superseded').length}</span></TabsTrigger><TabsTrigger value="timeline">Timeline</TabsTrigger></TabsList></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <TabsContent value="overview" className="mt-0"><Profile d={d} /></TabsContent>
          <TabsContent value="brief" className="mt-0">{tab === 'brief' && <BriefViewer dealId={dealId} />}</TabsContent>
          <TabsContent value="calls" className="mt-0">{tab === 'calls' && <CallsTab dealId={dealId} company={d.prospect.company} prospect={d.prospect.name} />}</TabsContent>
          <TabsContent value="proposals" className="mt-0"><ProposalsTab d={d} /></TabsContent>
          <TabsContent value="timeline" className="mt-0"><Timeline d={d} /></TabsContent>
        </div>
      </Tabs>
    </>
  );
}

function Header({ d }: { d: DealDetail }) {
  const svcName = useServiceName();
  return (
    <div className="min-w-0 flex-1">
      <h2 className="display truncate text-xl font-semibold text-ink">{d.prospect.company ?? d.prospect.name}</h2>
      <p className="mt-0.5 truncate text-[13px] text-ink-3">{d.prospect.name}{d.prospect.role ? ` · ${d.prospect.role}` : ''}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
        <StageBadge stage={d.deal.stage} />
        <span className="tnum font-semibold text-ink">{inr(d.deal.value_inr)}</span>
        <span className="text-ink-3">{svcName(d.deal.service_type)}</span>
        <span className="text-ink-3">· {d.consultant.name}</span>
      </div>
    </div>
  );
}

function ActionsBar({ d }: { d: DealDetail }) {
  const moves = allowedMoves(d.deal.stage);
  const [confirm, setConfirm] = useState<MoveTarget | null>(null);
  const [valueOpen, setValueOpen] = useState(false);
  const [reason, setReason] = useState<string>('budget');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const move = useAction('stage', { onSuccess: () => { setConfirm(null); setValueOpen(false); } });
  const draft = d.proposals.find((p) => p.status === 'drafted' || p.status === 'approved');
  const vf = useForm<z.input<typeof valueSchema>, unknown, z.output<typeof valueSchema>>({ resolver: zodResolver(valueSchema), defaultValues: { value: d.deal.value_inr ?? 0 } });
  const submitLost = () => {
    const r = reason === 'other' ? note.trim() : reason;
    if (!r) { setErr('A reason is required when marking a deal lost.'); return; }
    move.mutate({ deal_id: d.deal.id, to_stage: 'lost', lost_reason: r, ...(reason !== 'other' && note.trim() ? { note: note.trim() } : {}) });
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/50 px-5 py-2.5">
      <Dropdown>
        <DropdownTrigger asChild><Button size="sm" variant="secondary" disabled={moves.length === 0}><ArrowRightLeft className="size-3.5" aria-hidden />Change stage</Button></DropdownTrigger>
        <DropdownContent align="start">{moves.map((m) => <DropdownItem key={m} onSelect={() => { setErr(null); setNote(''); setReason('budget'); setConfirm(m); }}>{m === 'lost' ? 'Mark as lost…' : `Move to ${STAGE_LABEL[m]}`}</DropdownItem>)}</DropdownContent>
      </Dropdown>
      <Button size="sm" variant="secondary" onClick={() => setValueOpen(true)}><Banknote className="size-3.5" aria-hidden />Change value</Button>
      <RegenerateBriefButton dealId={d.deal.id} label="Regenerate brief" />
      {draft && <RequestChangesButton proposal={{ id: draft.id, version: draft.version, company: d.prospect.company, prospect_name: d.prospect.name, amount_inr: draft.amount_inr }} />}

      <ConfirmDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)} pending={move.isPending} tone={confirm === 'lost' ? 'danger' : 'primary'}
        title={confirm === 'lost' ? `Mark ${d.prospect.company ?? 'this deal'} as lost?` : `Move to ${confirm ? STAGE_LABEL[confirm] : ''}?`} confirmLabel={confirm === 'lost' ? 'Mark as lost' : 'Move deal'}
        description={confirm === 'lost' ? 'It counts as a loss in your win rate and leaves the open pipeline.' : 'Recorded in the deal timeline.'}
        onConfirm={() => (confirm === 'lost' ? submitLost() : move.mutate({ deal_id: d.deal.id, to_stage: 'negotiation' }))}>
        {confirm === 'lost' && (
          <div className="space-y-3">
            <div><Label htmlFor="dd-reason">Why was it lost?</Label><Select id="dd-reason" value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }}>{LOST_REASONS.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}<option value="other">Other…</option></Select></div>
            <div><Label htmlFor="dd-note">{reason === 'other' ? 'Reason (required)' : 'Note (optional)'}</Label><Textarea id="dd-note" rows={2} value={note} onChange={(e) => { setNote(e.target.value); setErr(null); }} /></div>
            <FieldError>{err}</FieldError>
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog open={valueOpen} onOpenChange={setValueOpen} pending={move.isPending} title="Change the deal value" confirmLabel="Save value" description="Updates the value used in pipeline totals. It does not change what the prospect was quoted."
        onConfirm={vf.handleSubmit((v) => move.mutate({ deal_id: d.deal.id, to_stage: d.deal.stage, value_inr: v.value }))}>
        <Label htmlFor="dd-value">Value (₹)</Label><Input id="dd-value" inputMode="numeric" {...vf.register('value')} aria-invalid={!!vf.formState.errors.value} /><FieldError>{vf.formState.errors.value?.message}</FieldError>
        <Hint>Currently {inr(d.deal.value_inr)}.</Hint>
      </ConfirmDialog>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[110px_1fr] gap-3 py-2 text-[13px]"><dt className="text-ink-3">{label}</dt><dd className="min-w-0 break-words text-ink">{children}</dd></div>;
}

function Profile({ d }: { d: DealDetail }) {
  const svcName = useServiceName();
  const p = d.prospect;
  return (
    <div className="space-y-5">
      <dl className="divide-y divide-border rounded-xl border border-border px-4">
        <Row label="Company">{p.company ?? '—'}</Row>
        <Row label="Contact">{p.name} <span className="text-ink-3">· {p.role ?? 'role unknown'}</span></Row>
        <Row label="Email"><Masked kind="email" value={p.email} /></Row>
        <Row label="Phone"><Masked kind="phone" value={p.phone} /></Row>
        <Row label="Website">{p.website ? <a href={p.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent hover:underline"><Globe className="size-3.5" aria-hidden />{p.website.replace(/^https?:\/\/(www\.)?/, '')}</a> : '—'}</Row>
        <Row label="LinkedIn">{p.linkedin_url ? <a href={p.linkedin_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent hover:underline"><Link2 className="size-3.5" aria-hidden />View profile<span className="sr-only"> (opens LinkedIn)</span></a> : '—'}</Row>
        <Row label="Lead source">{sourceLabel(d.deal.lead_source)}{p.utm_campaign && <span className="text-ink-3"> · campaign “{p.utm_campaign}”</span>}{p.referrer && <span className="text-ink-3"> · via {p.referrer}</span>}</Row>
        <Row label="Service">{svcName(d.deal.service_type)}</Row>
        <Row label="Consultant">{d.consultant.name}</Row>
        <Row label="First booked">{formatIst(d.deal.created_at, 'd MMM yyyy')} <span className="text-ink-3">({relativeTime(d.deal.created_at)})</span></Row>
        {d.deal.lost_reason && <Row label="Lost because"><span className="text-bad">{d.deal.lost_reason}</span></Row>}
      </dl>
      <details className="rounded-xl border border-border px-4 py-2.5 text-[13px]">
        <summary className="cursor-pointer font-medium text-ink-2">Technical details</summary>
        <dl className="mt-2 space-y-1 font-mono text-xs text-ink-3">
          <div>deal_id: {d.deal.id}</div><div>prospect_id: {d.deal.prospect_id}</div><div>consultant_id: {d.deal.consultant_id}</div>
          {d.calls.map((c) => <div key={c.id} className="break-all">call {c.id}: {c.booking_id} ({c.provider})</div>)}
          {d.payments.map((x) => <div key={x.id}>payment: {x.payment_id} ({x.provider})</div>)}
          {d.proposals.map((x) => <div key={x.id}>proposal_id {x.id} · v{x.version}</div>)}
        </dl>
      </details>
    </div>
  );
}

function CallsTab({ dealId, company, prospect }: { dealId: number; company: string | null; prospect: string | null }) {
  const q = useApi('calls', { deal_id: String(dealId), when: 'all', include_transcript: '1', page_size: 20 });
  const now = useNow();
  const [log, setLog] = useState(false);
  if (q.isLoading) return <Skeleton className="h-40" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data!.data.length) return <EmptyState title="No calls on this deal" />;
  return (
    <ul className="space-y-3">
      {q.data!.data.map((c) => (
        <li key={c.id} className="rounded-xl border border-border p-3.5">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-medium text-ink">{calendarIst(c.scheduled_for, now)}</span>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs capitalize text-ink-2">{c.status.replace('_', ' ')}</span>
            {c.status === 'scheduled' && <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setLog(true)}>Log outcome</Button>}
          </div>
          {c.completed_at && <p className="mt-1 text-xs text-ink-3">Finished {relativeTime(c.completed_at, now)}{c.transcript_source ? ` · transcript from ${c.transcript_source}` : ''}</p>}
          {c.transcript_text ? (
            <details className="mt-2"><summary className="cursor-pointer text-[13px] font-medium text-accent">Read transcript</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-sans text-[13px] leading-relaxed text-ink-2">{c.transcript_text}</pre></details>
          ) : c.status === 'completed' ? <p className="mt-2 text-xs text-ink-3">No transcript was saved for this call.</p> : null}
        </li>
      ))}
      <LogOutcomeDialog target={log ? { dealId, company, prospect } : null} onOpenChange={(o) => !o && setLog(false)} />
    </ul>
  );
}

function ProposalsTab({ d }: { d: DealDetail }) {
  const live = [...d.proposals].reverse().find((p) => p.status !== 'superseded') ?? d.proposals[d.proposals.length - 1];
  if (!live) return <EmptyState title="No proposal yet" hint="A draft is created after the call outcome is logged." />;
  return (
    <div className="space-y-4">
      <ul className="flex flex-wrap gap-1.5" aria-label="Versions">{d.proposals.map((p) => <li key={p.id}><span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-ink-2">v{p.version}<ProposalBadge status={p.status} /></span></li>)}</ul>
      <ProposalTracking proposalId={live.id} compact />
    </div>
  );
}

function Timeline({ d }: { d: DealDetail }) {
  const now = useNow();
  return (
    <div className="space-y-5">
      {d.payments.length > 0 && (
        <section aria-label="Payments"><h3 className="mb-2 text-[13px] font-semibold text-ink">Payments</h3>
          <ul className="space-y-2">{d.payments.map((p) => <li key={p.id} className="flex items-center justify-between rounded-xl border border-border bg-good-soft p-3 text-[13px]"><span className="text-good"><strong className="tnum">{inr(p.amount_inr)}</strong> received via {p.provider}</span><span className="text-ink-3">{formatIst(p.paid_at)}</span></li>)}</ul></section>
      )}
      <section aria-label="Timeline"><h3 className="mb-2 text-[13px] font-semibold text-ink">Everything that happened</h3>
        <ol className="relative space-y-3 border-l border-border pl-5">
          {[...d.timeline].reverse().map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-bg bg-ink-3" aria-hidden />
              <p className="text-[13px] text-ink">{e.event_type === 'stage_change' ? <>Moved {e.from_stage ? <>from <strong>{STAGE_LABEL[e.from_stage]}</strong> </> : null}to <strong>{e.to_stage ? STAGE_LABEL[e.to_stage] : '—'}</strong></> : <span className="capitalize">{e.event_type.replace(/_/g, ' ')}</span>}</p>
              {e.note && <p className="text-xs text-ink-2">{e.note}</p>}
              <p className="text-xs text-ink-3">{formatIst(e.created_at)} · {relativeTime(e.created_at, now)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export { ExternalLink };
