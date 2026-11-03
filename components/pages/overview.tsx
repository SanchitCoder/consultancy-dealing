'use client';
import { AlertTriangle, ArrowRight, CalendarClock, Clock3, FileCheck2, Lightbulb, Snowflake } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BriefBadge, RecentOpen } from '@/components/deal/badges';
import { ProposalActionsRow } from '@/components/deal/proposal-row';
import { KpiCard } from '@/components/deal/kpi';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/deal/states';
import { useDealDrawer } from '@/components/deal/use-deal-drawer';
import { Badge, Card, CardBody, CardHeader, CardTitle } from '@/components/ui/primitives';
import { useApi } from '@/lib/client/hooks';
import { useNow, useSession } from '@/lib/client/session';
import { calendarIst, countdown, hoursHuman, inr, inrCompact, pctText, num, relativeTime } from '@/lib/format';
import { useServiceName } from '@/lib/client/use-service-name';
import { buildInsights } from '@/lib/insights';
import { deltaPct } from '@/lib/metrics';
import { cn } from '@/lib/utils';

const RANGES = [{ id: '7', label: '7 days', days: 7 }, { id: '30', label: '30 days', days: 30 }, { id: '90', label: '90 days', days: 90 }] as const;

export function Overview() {
  const session = useSession();
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('30');
  const window = useMemo(() => {
    const to = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    return { from: new Date(to.getTime() - Number(range) * 86_400_000).toISOString(), to: to.toISOString() };
  }, [range]);
  const ov = useApi('overview', window);
  const sla = useApi('sla');
  const upcoming = useApi('calls', { when: 'upcoming', page_size: 6 });
  const drafts = useApi('proposals', { status: 'drafted,approved', page_size: 6 });
  const bySource = useApi('winrate', { group_by: 'lead_source', period: 'all_time' });
  const byService = useApi('winrate', { group_by: 'service_type', period: 'all_time' });
  const now = useNow();
  const insights = useMemo(() => buildInsights({ sources: bySource.data?.data, services: byService.data?.data }), [bySource.data, byService.data]);

  const t = ov.data?.data.totals;
  const p = ov.data?.data.previous;
  const w = ov.data?.data.weekly ?? [];
  const spark = (pick: (k: NonNullable<typeof t>) => number | null) => w.map(pick);
  const d = (pick: (k: NonNullable<typeof t>) => number | null) => (t && p ? deltaPct(pick(t), pick(p)) : null);
  const loading = ov.isLoading;
  const periodLabel = RANGES.find((r) => r.id === range)!.label;

  return (
    <>
      <PageHeader title={session.role === 'owner' ? 'Overview' : `Your overview`} subtitle={session.role === 'owner' ? `How calls are turning into revenue over the last ${periodLabel}.` : `Your calls, proposals and results over the last ${periodLabel}.`}
        actions={
          <div role="group" aria-label="Period" className="flex rounded-lg border border-border-strong bg-surface p-0.5">
            {RANGES.map((r) => (
              <button key={r.id} onClick={() => setRange(r.id)} aria-pressed={range === r.id} className={cn('rounded-md px-3 py-1 text-[13px] font-medium transition-colors', range === r.id ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink')}>{r.label}</button>
            ))}
          </div>
        } />

      {ov.isError ? <ErrorState error={ov.error} onRetry={() => ov.refetch()} className="mb-5" /> : (
        <section aria-label="Key numbers" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard loading={loading} label="Calls booked" value={t?.calls_booked ?? null} format={num} delta={d((k) => k.calls_booked)} series={spark((k) => k.calls_booked)} hint={`In the last ${periodLabel}`} />
          <KpiCard loading={loading} label="Briefs ready before the call" value={t?.brief_ready_pct ?? null} format={(n) => pctText(n, 0)} delta={d((k) => k.brief_ready_pct)} series={spark((k) => k.brief_ready_pct)} hint={t ? `${t.calls_brief_ready} of ${t.calls_due} calls that have happened` : undefined} />
          <KpiCard loading={loading} label="Proposals sent" value={t?.proposals_sent ?? null} format={num} delta={d((k) => k.proposals_sent)} series={spark((k) => k.proposals_sent)} hint="First version sent per deal" />
          <KpiCard loading={loading} label="Call to proposal (median)" value={t?.median_hours_call_to_proposal ?? null} format={(n) => hoursHuman(n)} delta={d((k) => k.median_hours_call_to_proposal)} higherIsBetter={false} series={spark((k) => k.median_hours_call_to_proposal)} hint={t?.median_hours_call_to_proposal != null ? (t.median_hours_call_to_proposal <= 24 ? 'Inside your 24h target' : 'Slower than your 24h target') : undefined} />
          <KpiCard loading={loading} label="Proposal open rate" value={t?.open_rate_pct ?? null} format={(n) => pctText(n, 0)} delta={d((k) => k.open_rate_pct)} series={spark((k) => k.open_rate_pct)} hint="Approximate: mail apps pre-load images" />
          <KpiCard loading={loading} label="Win rate" value={t?.win_rate_pct ?? null} format={(n) => pctText(n, 0)} delta={d((k) => k.win_rate_pct)} series={spark((k) => k.win_rate_pct)} hint={t?.win_rate_incl_open_pct != null ? `${pctText(t.win_rate_incl_open_pct, 0)} if open deals are counted` : 'Won ÷ (won + lost)'} tip="Won divided by won plus lost, for deals decided in this period" />
          <KpiCard loading={loading} label="Average deal size" value={t?.avg_deal_size_inr ?? null} format={inrCompact} delta={d((k) => k.avg_deal_size_inr)} series={spark((k) => k.avg_deal_size_inr)} hint="Mean of deals won" />
          <KpiCard loading={loading} label="Revenue won" value={t?.revenue_won_inr ?? null} format={inrCompact} delta={d((k) => k.revenue_won_inr)} series={spark((k) => k.revenue_won_inr)} hint={t ? `${t.won} deal${t.won === 1 ? '' : 's'} paid` : undefined} />
          <KpiCard loading={loading} label="Pipeline value" value={t?.pipeline_value_inr ?? null} format={inrCompact} delta={d((k) => k.pipeline_value_inr)} series={spark((k) => k.pipeline_value_inr)} hint={t ? `${t.open_deals} open deals` : undefined} />
        </section>
      )}

      {insights.length > 0 && (
        <section aria-label="What the numbers say" className="mt-5">
          <Card className="bg-accent-soft/50">
            <CardBody className="flex flex-col gap-2.5 py-4">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-ink"><Lightbulb className="size-4 text-accent" aria-hidden />What the numbers say</p>
              <ul className="grid gap-2 md:grid-cols-2">
                {insights.map((i) => <li key={i.id} className="flex gap-2 text-sm text-ink-2"><span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', i.tone === 'good' ? 'bg-[var(--good-solid)]' : i.tone === 'warn' ? 'bg-[var(--warn-solid)]' : 'bg-accent')} aria-hidden />{i.text}</li>)}
              </ul>
            </CardBody>
          </Card>
        </section>
      )}

      <section aria-label="Today" className="mt-5 grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <UpcomingCalls q={upcoming} now={now} />
        <WaitingForApproval q={drafts} />
      </section>

      <GoingCold q={sla} />
    </>
  );
}

function UpcomingCalls({ q, now }: { q: ReturnType<typeof useApi<'calls'>>; now: number }) {
  const { openDeal } = useDealDrawer();
  const svcName = useServiceName();
  return (
    <Card>
      <CardHeader>
        <CardTitle><span className="inline-flex items-center gap-2"><CalendarClock className="size-4 text-accent" aria-hidden />Coming up</span></CardTitle>
        <Link href="/calls" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">All calls<ArrowRight className="size-3.5" aria-hidden /></Link>
      </CardHeader>
      <CardBody>
        {q.isLoading ? <ListSkeleton rows={4} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data!.data.length === 0 ? <EmptyState title="No calls coming up" hint="New bookings appear here with their research brief status." /> : (
          <ul className="divide-y divide-border">
            {q.data!.data.map((c) => {
              const hrs = c.scheduled_for ? (Date.parse(c.scheduled_for) - now) / 3_600_000 : null;
              return (
                <li key={c.id}>
                  <button onClick={() => openDeal(c.deal_id)} className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left hover:bg-surface-2/70">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{c.company ?? c.prospect_name}</p>
                      <p className="truncate text-xs text-ink-3">{c.prospect_name} · {svcName(c.service_type)} · {c.consultant_name}</p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="tnum text-[13px] font-medium text-ink">{countdown(hrs)}</p>
                      <p className="text-xs text-ink-3">{calendarIst(c.scheduled_for, now)}</p>
                    </div>
                    <BriefBadge status={c.brief_status} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function WaitingForApproval({ q }: { q: ReturnType<typeof useApi<'proposals'>> }) {
  const { openDeal } = useDealDrawer();
  return (
    <Card>
      <CardHeader>
        <CardTitle><span className="inline-flex items-center gap-2"><FileCheck2 className="size-4 text-accent" aria-hidden />Waiting for your approval</span></CardTitle>
        <Link href="/proposals" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">Proposals<ArrowRight className="size-3.5" aria-hidden /></Link>
      </CardHeader>
      <CardBody>
        {q.isLoading ? <ListSkeleton rows={4} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data!.data.length === 0 ? <EmptyState title="Nothing waiting" hint="Drafts appear here a few hours after a call is logged." /> : (
          <ul className="divide-y divide-border">
            {q.data!.data.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                <button onClick={() => openDeal(p.deal_id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium text-ink">{p.company} <span className="font-normal text-ink-3">· v{p.version}</span></p>
                  <p className="truncate text-xs text-ink-3">{p.service_name} · {inr(p.amount_inr)} · drafted {relativeTime(p.drafted_at)}</p>
                </button>
                <ProposalActionsRow proposal={p} compact />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function GoingCold({ q }: { q: ReturnType<typeof useApi<'sla'>> }) {
  const { openDeal } = useDealDrawer();
  const data = q.data?.data;
  const items = useMemo(() => {
    if (!data) return [];
    return [
      ...data.overdue.map((o) => ({ key: `o${o.call_id}`, dealId: o.deal_id, tone: o.level === 'escalated' ? ('bad' as const) : ('warn' as const), icon: Clock3, title: o.company ?? o.prospect_name ?? 'Deal', who: o.consultant_name,
        text: o.draft_proposal_id ? `Draft v${o.draft_version} is waiting. The call ended ${hoursHuman(o.hours_since_call)} ago.` : `No proposal yet. The call ended ${hoursHuman(o.hours_since_call)} ago.`, badge: o.level === 'escalated' ? 'Over 48h' : 'Over 24h', sort: -o.hours_since_call })),
      ...data.cold.map((c) => ({ key: `c${c.proposal_id}`, dealId: c.deal_id, tone: 'info' as const, icon: Snowflake, title: c.company ?? c.prospect_name ?? 'Deal', who: c.consultant_name,
        text: c.kind === 'unopened' ? `Sent ${hoursHuman(c.hours_since_sent)} ago and not opened.` : `Opened ${c.open_count}× but no decision ${hoursHuman(c.hours_since_first_open)} after the first look.`, badge: c.kind === 'unopened' ? 'Unopened' : 'Opened, undecided', sort: -c.hours_since_sent })),
    ].sort((a, b) => a.sort - b.sort);
  }, [data]);
  return (
    <section aria-label="Going cold" className="mt-5">
      <Card>
        <CardHeader>
          <CardTitle><span className="inline-flex items-center gap-2"><AlertTriangle className="size-4 text-[var(--warn)]" aria-hidden />Going cold</span></CardTitle>
          {data && <div className="flex flex-wrap gap-1.5 text-xs"><Badge tone="warn">{data.counts.overdue} over SLA</Badge><Badge tone="info">{data.counts.unopened} unopened</Badge><Badge tone="accent">{data.counts.opened_undecided} undecided</Badge></div>}
        </CardHeader>
        <CardBody>
          {q.isLoading ? <ListSkeleton rows={3} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : items.length === 0 ? <EmptyState title="Nothing is going cold" hint="Proposals past the 24h target, unopened after 48h, or opened but undecided after 72h will show up here." /> : (
            <ul className="grid gap-x-6 md:grid-cols-2 [&>*]:min-w-0">
              {items.slice(0, 8).map((i) => (
                <li key={i.key} className="border-b border-border last:border-0">
                  <button onClick={() => openDeal(i.dealId)} className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-surface-2/60">
                    <i.icon className={cn('mt-0.5 size-4 shrink-0', i.tone === 'bad' ? 'text-bad' : i.tone === 'warn' ? 'text-warn' : 'text-info')} aria-hidden />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{i.title} <span className="font-normal text-ink-3">· {i.who}</span></span><span className="block text-[13px] text-ink-2">{i.text}</span></span>
                    <Badge tone={i.tone}>{i.badge}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </section>
  );
}

export { RecentOpen };
