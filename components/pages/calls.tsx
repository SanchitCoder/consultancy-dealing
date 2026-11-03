'use client';
import { keepPreviousData } from '@tanstack/react-query';
import { BookOpen, CircleCheck, ClipboardPen, FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { BriefBadge } from '@/components/deal/badges';
import { BriefViewer, RegenerateBriefButton } from '@/components/deal/brief-viewer';
import { LogOutcomeDialog, type LogOutcomeTarget } from '@/components/deal/log-outcome';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/deal/states';
import { useDealDrawer } from '@/components/deal/use-deal-drawer';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose } from '@/components/ui/dialog';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Card, Select } from '@/components/ui/primitives';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CallRow } from '@/contracts/deal-api';
import { useApi } from '@/lib/client/hooks';
import { useIsOwner, useNow } from '@/lib/client/session';
import { calendarIst, countdown, formatIst, relativeTime } from '@/lib/format';
import { useServiceName } from '@/lib/client/use-service-name';
import type { Tone } from '@/lib/format/labels';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

const OUTCOME: Record<CallRow['status'], { label: string; tone: Tone }> = {
  scheduled: { label: 'Waiting for outcome', tone: 'warn' }, completed: { label: 'Completed', tone: 'good' }, no_show: { label: 'No-show', tone: 'bad' }, canceled: { label: 'Canceled', tone: 'neutral' }, rescheduled: { label: 'Moved to a new time', tone: 'info' },
};

export function Calls() {
  const svcName = useServiceName();
  const [tab, setTab] = useState('upcoming');
  const [brief, setBrief] = useState<CallRow | null>(null);
  const [log, setLog] = useState<LogOutcomeTarget | null>(null);
  return (
    <>
      <PageHeader title="Calls & briefs" subtitle="Know who you are speaking to before you pick up. Every booked call gets a research brief; log what happened afterwards and the proposal follows." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Calls"><TabsTrigger value="upcoming">Upcoming</TabsTrigger><TabsTrigger value="past">Past & outcomes</TabsTrigger></TabsList>
        <TabsContent value="upcoming"><Upcoming onBrief={setBrief} onLog={setLog} /></TabsContent>
        <TabsContent value="past"><Past onBrief={setBrief} onLog={setLog} /></TabsContent>
      </Tabs>
      <Dialog open={!!brief} onOpenChange={(o) => !o && setBrief(null)}>
        {brief && (
          <Sheet title={`Research brief for ${brief.company ?? brief.prospect_name}`}>
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0"><h2 className="display truncate text-xl font-semibold text-ink">{brief.company ?? brief.prospect_name}</h2><p className="truncate text-[13px] text-ink-3">{brief.prospect_name}{brief.role ? ` · ${brief.role}` : ''} · {svcName(brief.service_type)} · {brief.consultant_name}</p></div>
              <SheetClose className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close brief"><X className="size-5" /></SheetClose>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4"><BriefViewer dealId={brief.deal_id} /></div>
          </Sheet>
        )}
      </Dialog>
      <LogOutcomeDialog target={log} onOpenChange={(o) => !o && setLog(null)} />
    </>
  );
}

function CallCard({ c, now, onBrief, onLog, upcoming }: { c: CallRow; now: number; onBrief: (c: CallRow) => void; onLog: (t: LogOutcomeTarget) => void; upcoming: boolean }) {
  const { openDeal } = useDealDrawer();
  const svcName = useServiceName();
  const hrs = c.scheduled_for ? (Date.parse(c.scheduled_for) - now) / 3_600_000 : null;
  const needsOutcome = c.status === 'scheduled' && hrs !== null && hrs < 0;
  const o = OUTCOME[c.status];
  const target: LogOutcomeTarget = { dealId: c.deal_id, company: c.company, prospect: c.prospect_name };
  return (
    <Card className={cn('p-4', needsOutcome && 'border-warn/50')}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <button onClick={() => openDeal(c.deal_id)} className="block max-w-full truncate text-left text-[15px] font-semibold text-ink hover:underline">{c.company ?? c.prospect_name}</button>
          <p className="truncate text-[13px] text-ink-3">{c.prospect_name}{c.role ? ` · ${c.role}` : ''}</p>
          <p className="mt-1 truncate text-[13px] text-ink-2">{svcName(c.service_type)} · with {c.consultant_name}</p>
        </div>
        <div className="basis-40">
          <p className="tnum text-sm font-semibold text-ink">{upcoming && !needsOutcome ? countdown(hrs) : calendarIst(c.scheduled_for, now)}</p>
          <p className="text-xs text-ink-3">{upcoming && !needsOutcome ? calendarIst(c.scheduled_for, now) : relativeTime(c.scheduled_for, now)}</p>
        </div>
        <div className="flex basis-auto flex-col items-start gap-2">
          <BriefBadge status={c.brief_status} large />
          {!upcoming && c.status !== 'scheduled' && <Badge tone={o.tone}>{o.label}</Badge>}
          {needsOutcome && <Badge tone="warn">{o.label}</Badge>}
          {!upcoming && c.brief_status === 'ready' && c.status === 'completed' && <span className="text-xs text-ink-3">{c.brief_ready_before_call ? 'Ready before the call' : 'Finished after the call'}</span>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button size="sm" variant={c.brief_status === 'ready' ? 'primary' : 'secondary'} onClick={() => onBrief(c)} disabled={c.brief_status === 'none'}><BookOpen className="size-3.5" aria-hidden />{c.brief_status === 'ready' ? 'Read brief' : 'Brief details'}</Button>
        {(c.brief_status === 'failed' || c.brief_status === 'none') && <RegenerateBriefButton dealId={c.deal_id} label={c.brief_status === 'none' ? 'Generate brief' : 'Try again'} />}
        {(upcoming || c.status === 'scheduled') && <Button size="sm" variant={needsOutcome ? 'primary' : 'secondary'} onClick={() => onLog(target)}><ClipboardPen className="size-3.5" aria-hidden />Log outcome</Button>}
        {c.status === 'completed' && c.has_transcript && <span className="inline-flex items-center gap-1 text-xs text-ink-3"><CircleCheck className="size-3.5 text-good" aria-hidden />Transcript saved{c.transcript_source ? ` (${c.transcript_source})` : ''}</span>}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => openDeal(c.deal_id)}><FolderOpen className="size-3.5" aria-hidden />Open deal</Button>
      </div>
    </Card>
  );
}

function Upcoming({ onBrief, onLog }: { onBrief: (c: CallRow) => void; onLog: (t: LogOutcomeTarget) => void }) {
  const now = useNow();
  const q = useApi('calls', { when: 'upcoming', page_size: 60 }, { refetchInterval: 20_000 });
  if (q.isLoading) return <ListSkeleton rows={4} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const rows = q.data!.data;
  const ready = rows.filter((r) => r.brief_status === 'ready').length;
  if (!rows.length) return <EmptyState title="No upcoming calls" hint="When someone books, the call shows up here with its brief status." />;
  return (
    <>
      <p className="mb-3 text-[13px] text-ink-2"><strong className="text-ink">{ready} of {rows.length}</strong> upcoming calls have a brief ready.</p>
      <div className="grid gap-3 xl:grid-cols-2 [&>*]:min-w-0">{rows.map((c) => <CallCard key={c.id} c={c} now={now} onBrief={onBrief} onLog={onLog} upcoming />)}</div>
    </>
  );
}

function Past({ onBrief, onLog }: { onBrief: (c: CallRow) => void; onLog: (t: LogOutcomeTarget) => void }) {
  const owner = useIsOwner();
  const now = useNow();
  const [status, setStatus] = useState('');
  const [consultant, setConsultant] = useState('');
  const [page, setPage] = useState(1);
  const consultants = useApi('consultants', undefined, { enabled: owner });
  const q = useApi('calls', { when: 'past', page, page_size: 20, ...(status ? { status: status as CallRow['status'] } : {}), ...(consultant ? { consultant_id: consultant } : {}) }, { placeholderData: keepPreviousData });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.meta.total / q.data.meta.page_size)) : 1;
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <Select aria-label="Outcome" className="w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Any outcome</option><option value="scheduled">Waiting for outcome</option><option value="completed">Completed</option><option value="no_show">No-show</option><option value="canceled">Canceled</option><option value="rescheduled">Moved</option>
        </Select>
        {owner && <Select aria-label="Consultant" className="w-48" value={consultant} onChange={(e) => { setConsultant(e.target.value); setPage(1); }}><option value="">All consultants</option>{consultants.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
      </div>
      {q.isLoading ? <ListSkeleton rows={5} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data!.data.length ? <EmptyState title="No past calls match" hint="Try a different outcome." /> : (
        <>
          <div className="grid gap-3 xl:grid-cols-2 [&>*]:min-w-0">{q.data!.data.map((c) => <CallCard key={c.id} c={c} now={now} onBrief={onBrief} onLog={onLog} upcoming={false} />)}</div>
          <div className="mt-4 flex items-center justify-between text-xs text-ink-3">
            <span className="tnum">{q.data!.meta.total} calls · page {page} of {pages}</span>
            <div className="flex gap-1.5"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button></div>
          </div>
        </>
      )}
      <p className="sr-only">{formatIst(now)}</p>
    </>
  );
}
