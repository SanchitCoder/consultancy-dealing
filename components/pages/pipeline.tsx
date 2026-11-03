'use client';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table';
import { LayoutGroup, motion } from 'framer-motion';
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, LayoutGrid, Lock, Search, Table2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ProposalBadge, StageBadge } from '@/components/deal/badges';
import { ConfirmDialog } from '@/components/deal/confirm';
import { allowedMoves, DaysInStage, DealCardBody, type MoveTarget } from '@/components/deal/deal-card';
import { EmptyState, ErrorState, PageHeader } from '@/components/deal/states';
import { useDealDrawer } from '@/components/deal/use-deal-drawer';
import { Button } from '@/components/ui/button';
import { Card, Input, Label, Select, Skeleton, Textarea, FieldError } from '@/components/ui/primitives';
import { BOARD_STAGES, STAGE_LABEL, type DealListItem, type Infer, type Stage } from '@/contracts/deal-api';
import { useAction, useApi } from '@/lib/client/hooks';
import { useIsOwner, useStoredState } from '@/lib/client/session';
import { formatIstDate, inr, inrCompact, relativeTime, toCsv } from '@/lib/format';
import { LOST_REASONS, serviceLabel, sourceLabel } from '@/lib/format/labels';
import { cn } from '@/lib/utils';

const SOURCES = ['linkedin_outbound', 'instagram', 'referral', 'webinar', 'google_search', 'cold_email'];
const COLUMNS: Stage[] = [...BOARD_STAGES, 'no_show'];
const COLUMN_HINT: Partial<Record<Stage, string>> = { won: 'Moves here by itself when a payment arrives', no_show: 'Waiting to be rebooked' };
const SHOWN_IN_CLOSED = 12;

function useDebounced<T>(v: T, ms = 300): T {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export function Pipeline() {
  const owner = useIsOwner();
  const qc = useQueryClient();
  const { openDeal } = useDealDrawer();
  const [view, setView] = useStoredState<'board' | 'table'>('pipeline-view', 'board');
  const [search, setSearch] = useState('');
  const [service, setService] = useState('');
  const [source, setSource] = useState('');
  const [consultant, setConsultant] = useState('');
  const dSearch = useDebounced(search.trim());
  const query = { page_size: 500, sort: '-created_at' as const, ...(dSearch ? { search: dSearch } : {}), ...(service ? { service_type: service } : {}), ...(source ? { lead_source: source } : {}), ...(consultant ? { consultant_id: consultant } : {}) };
  const deals = useApi('deals', query, { placeholderData: keepPreviousData });
  const services = useApi('services');
  const consultants = useApi('consultants', undefined, { enabled: owner });
  const config = useApi('config');
  const stuckDays = config.data?.data.stuck_days ?? 7;
  const rows = deals.data?.data ?? [];
  const [pending, setPending] = useState<{ deal: DealListItem; to: MoveTarget } | null>(null);
  const [reason, setReason] = useState<string>('budget');
  const [note, setNote] = useState('');
  const [reasonErr, setReasonErr] = useState<string | null>(null);

  const move = useAction('stage', { silent: false });
  const confirmMove = () => {
    if (!pending) return;
    const { deal, to } = pending;
    const lostReason = reason === 'other' ? note.trim() : reason;
    if (to === 'lost' && !lostReason) { setReasonErr('A reason is required when marking a deal lost.'); return; }
    const key = ['deals', query];
    const prev = qc.getQueryData<Infer<'deals'>>(key);
    // optimistic: the card slides to its new column straight away; it snaps back if the backend refuses
    if (prev) qc.setQueryData(key, { ...prev, data: prev.data.map((d) => (d.id === deal.id ? { ...d, stage: to, days_in_stage: 0, ...(to === 'lost' ? { lost_reason: lostReason } : {}) } : d)) });
    move.mutate({ deal_id: deal.id, to_stage: to, ...(to === 'lost' ? { lost_reason: lostReason } : {}), ...(note.trim() ? { note: note.trim() } : {}) }, {
      onSuccess: () => { setPending(null); setNote(''); setReason('budget'); },
      onError: () => { if (prev) qc.setQueryData(key, prev); setPending(null); },
    });
  };
  const ask = (deal: DealListItem, to: MoveTarget) => { setReasonErr(null); setNote(''); setReason('budget'); setPending({ deal, to }); };

  const exportCsv = () => {
    const csv = toCsv(rows.map((d) => ({
      Company: d.company, Prospect: d.prospect_name, Role: d.role, Service: serviceLabel(d.service_type, d.service_name), Stage: STAGE_LABEL[d.stage], 'Value (INR)': d.value_inr,
      'Lead source': sourceLabel(d.lead_source), Consultant: d.consultant_name, 'Days in stage': d.days_in_stage, 'Latest proposal': d.latest_proposal_status ?? '', 'Lost reason': d.lost_reason ?? '', Created: formatIstDate(d.created_at),
    })));
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `pipeline-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} deals.`);
  };

  return (
    <>
      <PageHeader title="Pipeline" subtitle="Every deal from booked call to won. Drag a card to Negotiation or Lost; everything else moves by itself."
        actions={
          <>
            <div role="group" aria-label="View" className="flex rounded-lg border border-border-strong bg-surface p-0.5">
              <button onClick={() => setView('board')} aria-pressed={view === 'board'} className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[13px] font-medium', view === 'board' ? 'bg-ink text-bg' : 'text-ink-2')}><LayoutGrid className="size-3.5" aria-hidden />Board</button>
              <button onClick={() => setView('table')} aria-pressed={view === 'table'} className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[13px] font-medium', view === 'table' ? 'bg-ink text-bg' : 'text-ink-2')}><Table2 className="size-3.5" aria-hidden />Table</button>
            </div>
            <Button onClick={exportCsv} disabled={!rows.length}><Download className="size-4" aria-hidden />Export CSV</Button>
          </>
        } />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.4fr)_1fr_1fr_1fr]">
        <div className="relative">
          <Label htmlFor="pf-search" className="sr-only">Search deals</Label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input id="pf-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, person, service…" className="pl-9" />
        </div>
        <div><Label htmlFor="pf-service" className="sr-only">Service</Label><Select id="pf-service" value={service} onChange={(e) => setService(e.target.value)}><option value="">All services</option>{services.data?.data.map((s) => <option key={s.service_type} value={s.service_type}>{s.name}</option>)}</Select></div>
        <div><Label htmlFor="pf-source" className="sr-only">Lead source</Label><Select id="pf-source" value={source} onChange={(e) => setSource(e.target.value)}><option value="">All lead sources</option>{SOURCES.map((s) => <option key={s} value={s}>{sourceLabel(s)}</option>)}</Select></div>
        {owner && <div><Label htmlFor="pf-cons" className="sr-only">Consultant</Label><Select id="pf-cons" value={consultant} onChange={(e) => setConsultant(e.target.value)}><option value="">All consultants</option>{consultants.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>}
      </div>

      {deals.isError ? <ErrorState error={deals.error} onRetry={() => deals.refetch()} /> : deals.isLoading ? <BoardSkeleton /> : rows.length === 0 ? (
        <EmptyState title="No deals match" hint="Clear a filter or search for something else." action={<Button onClick={() => { setSearch(''); setService(''); setSource(''); setConsultant(''); }}>Clear filters</Button>} />
      ) : view === 'board' ? (
        <Board rows={rows} stuckDays={stuckDays} onMove={ask} onOpen={openDeal} />
      ) : (
        <DealTable rows={rows} stuckDays={stuckDays} onOpen={openDeal} />
      )}
      {deals.data && deals.data.meta.total > rows.length && <p className="mt-3 text-xs text-ink-3">Showing the newest {rows.length} of {deals.data.meta.total} deals. Narrow the filters to see the rest.</p>}

      <ConfirmDialog open={!!pending} onOpenChange={(o) => !o && !move.isPending && setPending(null)} pending={move.isPending} onConfirm={confirmMove}
        tone={pending?.to === 'lost' ? 'danger' : 'primary'} confirmLabel={pending?.to === 'lost' ? 'Mark as lost' : 'Move to Negotiation'}
        title={pending?.to === 'lost' ? `Mark ${pending.deal.company ?? 'this deal'} as lost?` : `Move ${pending?.deal.company ?? 'this deal'} to Negotiation?`}
        description={pending?.to === 'lost' ? 'It leaves the open pipeline and counts as a loss in your win rate. This is recorded in the deal timeline.' : 'Use this when the prospect is discussing terms. It is recorded in the deal timeline.'}>
        {pending?.to === 'lost' && (
          <div className="space-y-3">
            <div><Label htmlFor="lost-reason">Why was it lost?</Label>
              <Select id="lost-reason" value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr(null); }}>
                {LOST_REASONS.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}<option value="other">Other…</option>
              </Select></div>
            <div><Label htmlFor="lost-note">{reason === 'other' ? 'Reason (required)' : 'Note (optional)'}</Label><Textarea id="lost-note" rows={2} value={note} onChange={(e) => { setNote(e.target.value); setReasonErr(null); }} placeholder="Anything worth remembering" /></div>
            <FieldError>{reasonErr}</FieldError>
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

function BoardSkeleton() {
  return <div className="flex gap-3 overflow-hidden">{Array.from({ length: 5 }, (_, i) => <div key={i} className="w-64 shrink-0 space-y-2"><Skeleton className="h-8" />{Array.from({ length: 3 }, (_, j) => <Skeleton key={j} className="h-28 rounded-xl" />)}</div>)}</div>;
}

function Board({ rows, stuckDays, onMove, onOpen }: { rows: DealListItem[]; stuckDays: number; onMove: (d: DealListItem, to: MoveTarget) => void; onOpen: (id: number) => void }) {
  // Keyboard users move cards with each card's "Move…" menu; touch users press and hold for a moment so the board can still scroll.
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }));
  const [active, setActive] = useState<DealListItem | null>(null);
  const byStage = useMemo(() => {
    const m = new Map<Stage, DealListItem[]>(COLUMNS.map((s) => [s, []]));
    for (const d of rows) m.get(d.stage)?.push(d);
    for (const s of ['won', 'lost', 'no_show'] as Stage[]) m.get(s)!.sort((a, b) => Date.parse(b.stage_changed_at) - Date.parse(a.stage_changed_at));
    return m;
  }, [rows]);
  const [expanded, setExpanded] = useState<Set<Stage>>(new Set());

  const start = (e: DragStartEvent) => setActive(rows.find((d) => d.id === e.active.id) ?? null);
  const end = (e: DragEndEvent) => {
    const deal = rows.find((d) => d.id === e.active.id);
    setActive(null);
    const to = e.over?.id as Stage | undefined;
    if (!deal || !to || to === deal.stage) return;
    if (to === 'won') { toast.info('Deals are marked won automatically when their payment arrives.'); return; }
    if (to === 'negotiation' || to === 'lost') {
      if (allowedMoves(deal.stage).includes(to)) onMove(deal, to);
      else toast.info(deal.stage === 'won' || deal.stage === 'lost' ? 'Finished deals stay where they are.' : 'This deal is already there.');
      return;
    }
    toast.info('Only Negotiation and Lost can be set by hand. The other stages follow what actually happens.');
  };

  return (
    <DndContext sensors={sensors} onDragStart={start} onDragEnd={end} onDragCancel={() => setActive(null)}>
      <LayoutGroup>
        <div className="relative -mx-3 flex gap-3 overflow-x-auto px-3 pb-4 sm:-mx-6 sm:px-6" role="region" aria-label="Pipeline board" tabIndex={0}>
          {COLUMNS.map((stage) => {
            const list = byStage.get(stage) ?? [];
            const closed = stage === 'won' || stage === 'lost' || stage === 'no_show';
            const shown = closed && !expanded.has(stage) ? list.slice(0, SHOWN_IN_CLOSED) : list;
            const total = list.reduce((s, d) => s + (d.value_inr ?? 0), 0);
            return (
              <Column key={stage} stage={stage} count={list.length} total={total} activeDeal={active}>
                {shown.map((d) => <DraggableCard key={d.id} deal={d} stuckDays={stuckDays} onMove={(to) => onMove(d, to)} onOpen={() => onOpen(d.id)} />)}
                {closed && list.length > SHOWN_IN_CLOSED && (
                  <button onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(stage)) n.delete(stage); else n.add(stage); return n; })} className="w-full rounded-lg py-2 text-xs font-medium text-accent hover:bg-surface-2">
                    {expanded.has(stage) ? 'Show fewer' : `Show all ${list.length}`}
                  </button>
                )}
                {list.length === 0 && <p className="px-2 py-6 text-center text-xs text-ink-3">Nothing here</p>}
              </Column>
            );
          })}
        </div>
      </LayoutGroup>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.165,.84,.44,1)' }}>
        {active ? <div className="w-64 rotate-1"><DealCardBody deal={active} stuckDays={stuckDays} onOpen={() => undefined} dragging /></div> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ stage, count, total, activeDeal, children }: { stage: Stage; count: number; total: number; activeDeal: DealListItem | null; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const valid = activeDeal ? (stage === 'won' ? false : allowedMoves(activeDeal.stage).includes(stage as MoveTarget)) : null;
  return (
    <section ref={setNodeRef} aria-label={`${STAGE_LABEL[stage]}, ${count} deals`}
      className={cn('flex max-h-[calc(100dvh-17rem)] min-h-64 w-64 shrink-0 flex-col rounded-2xl border bg-surface-2/60 transition-colors duration-150', isOver && valid ? 'border-accent bg-accent-soft/60' : 'border-border', valid === false && 'opacity-55')}>
      <header className="px-3 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">{STAGE_LABEL[stage]}{stage === 'won' && <Lock className="size-3 text-ink-3" aria-label="Moves here automatically" />}</h2>
          <span className="tnum rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-ink-2">{count}</span>
        </div>
        <p className="tnum mt-0.5 truncate text-xs text-ink-3">{COLUMN_HINT[stage] && count === 0 ? COLUMN_HINT[stage] : inrCompact(total)}</p>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">{children}</div>
    </section>
  );
}

function DraggableCard({ deal, stuckDays, onMove, onOpen }: { deal: DealListItem; stuckDays: number; onMove: (to: MoveTarget) => void; onOpen: () => void }) {
  const draggable = allowedMoves(deal.stage).length > 0;
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: deal.id, disabled: !draggable });
  return (
    <div ref={setNodeRef} {...(draggable ? listeners : {})} data-draggable={draggable ? 'deal-card' : undefined} className={cn(draggable && 'cursor-grab active:cursor-grabbing', isDragging && 'opacity-35')}>
      <motion.div layout="position" layoutId={`deal-${deal.id}`} transition={{ duration: 0.24, ease: [0.645, 0.045, 0.355, 1] }}>
        <DealCardBody deal={deal} stuckDays={stuckDays} onMove={onMove} onOpen={onOpen} />
      </motion.div>
    </div>
  );
}

function DealTable({ rows, stuckDays, onOpen }: { rows: DealListItem[]; stuckDays: number; onOpen: (id: number) => void }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created', desc: true }]);
  const columns = useMemo<ColumnDef<DealListItem>[]>(() => [
    { id: 'company', header: 'Company', accessorFn: (d) => d.company ?? d.prospect_name ?? '', cell: ({ row: { original: d } }) => <button onClick={() => onOpen(d.id)} className="text-left"><span className="block font-medium text-ink">{d.company ?? d.prospect_name}</span><span className="block text-xs text-ink-3">{d.prospect_name}</span></button> },
    { id: 'service', header: 'Service', accessorFn: (d) => serviceLabel(d.service_type, d.service_name), cell: ({ getValue }) => <span className="text-ink-2">{getValue<string>()}</span> },
    { id: 'stage', header: 'Stage', accessorFn: (d) => STAGE_LABEL[d.stage], cell: ({ row }) => <StageBadge stage={row.original.stage} /> },
    { id: 'value', header: 'Value', accessorFn: (d) => d.value_inr ?? 0, cell: ({ row }) => <span className="tnum font-medium">{inr(row.original.value_inr)}</span>, meta: { align: 'right' } },
    { id: 'source', header: 'Lead source', accessorFn: (d) => sourceLabel(d.lead_source), cell: ({ getValue }) => <span className="text-ink-2">{getValue<string>()}</span> },
    { id: 'consultant', header: 'Consultant', accessorFn: (d) => d.consultant_name, cell: ({ getValue }) => <span className="text-ink-2">{getValue<string>()}</span> },
    { id: 'days', header: 'In stage', accessorFn: (d) => d.days_in_stage, cell: ({ row }) => <DaysInStage days={row.original.days_in_stage} stage={row.original.stage} stuckDays={stuckDays} />, meta: { align: 'right' } },
    { id: 'proposal', header: 'Proposal', accessorFn: (d) => d.latest_proposal_status ?? '', cell: ({ row }) => row.original.latest_proposal_status ? <span className="inline-flex items-center gap-1.5"><span className="text-xs text-ink-3">v{row.original.latest_proposal_version}</span><ProposalBadge status={row.original.latest_proposal_status} /></span> : <span className="text-ink-3">—</span> },
    { id: 'created', header: 'Created', accessorFn: (d) => Date.parse(d.created_at), cell: ({ row }) => <span className="text-ink-3" title={formatIstDate(row.original.created_at)}>{relativeTime(row.original.created_at)}</span> },
  ], [onOpen, stuckDays]);
  const table = useReactTable({ data: rows, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize: 25 } } });
  return (
    <Card className="overflow-hidden">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[860px] text-[13px]">
          <caption className="sr-only">Deals</caption>
          <thead className="bg-surface-2 text-left text-xs text-ink-2">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>{hg.headers.map((h) => {
                const sorted = h.column.getIsSorted();
                const right = (h.column.columnDef.meta as { align?: string } | undefined)?.align === 'right';
                return (
                  <th key={h.id} scope="col" aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'} className={cn('px-3 py-2.5 font-medium', right && 'text-right')}>
                    <button onClick={h.column.getToggleSortingHandler()} className={cn('inline-flex items-center gap-1 hover:text-ink', right && 'flex-row-reverse')}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {sorted === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : sorted === 'desc' ? <ArrowDown className="size-3" aria-hidden /> : <ChevronsUpDown className="size-3 opacity-40" aria-hidden />}
                    </button>
                  </th>
                );
              })}</tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-surface-2/50">
                {r.getVisibleCells().map((c) => <td key={c.id} className={cn('px-3 py-2.5 align-middle', (c.column.columnDef.meta as { align?: string } | undefined)?.align === 'right' && 'text-right')}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-ink-3">
        <span className="tnum">{rows.length} deals · page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span>
        <div className="flex gap-1.5"><Button size="sm" variant="secondary" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</Button><Button size="sm" variant="secondary" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</Button></div>
      </div>
    </Card>
  );
}
