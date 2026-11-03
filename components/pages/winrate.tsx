'use client';
import { TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ChartCard, type TableColumn } from '@/components/charts/chart-card';
import { HBarChart, type BarDatum } from '@/components/charts/hbar';
import { EmptyState, ErrorState, PageHeader, CardSkeleton } from '@/components/deal/states';
import { Card, CardBody, CardHeader, CardTitle, Select } from '@/components/ui/primitives';
import type { GroupBy, MetricPeriod, WinRow } from '@/contracts/deal-api';
import { useApi } from '@/lib/client/hooks';
import { useIsOwner } from '@/lib/client/session';
import { hoursHuman, inr, inrCompact, num, pctText } from '@/lib/format';
import { serviceLabel, sourceLabel } from '@/lib/format/labels';
import { MIN_DECIDED } from '@/lib/insights';
import { cn } from '@/lib/utils';

const GROUPS: { id: GroupBy; label: string; owner?: boolean }[] = [
  { id: 'service_type', label: 'Service' }, { id: 'lead_source', label: 'Lead source' }, { id: 'service_type_x_lead_source', label: 'Service × source' }, { id: 'consultant', label: 'Consultant', owner: true },
];
const PERIODS: { id: MetricPeriod; label: string }[] = [{ id: 'this_month', label: 'This month' }, { id: 'last_30d', label: 'Last 30 days' }, { id: 'last_90d', label: 'Last 90 days' }, { id: 'all_time', label: 'All time' }];
const SOURCE_ORDER = ['linkedin_outbound', 'instagram', 'referral', 'webinar', 'google_search', 'cold_email'];
/** Colour follows the entity: a source keeps its colour in every chart and filter. */
const sourceColor = (s: string) => `var(--series-${(Math.max(0, SOURCE_ORDER.indexOf(s)) % 6) + 1})`;

const low = (r: Pick<WinRow, 'won' | 'lost'>) => r.won + r.lost < MIN_DECIDED;
const nameOf = (r: WinRow, gb: GroupBy) => (gb === 'lead_source' ? sourceLabel(r.dimension_value) : gb === 'service_type' ? serviceLabel(r.dimension_value, r.label) : r.label);

export function WinRate() {
  const owner = useIsOwner();
  const [group, setGroup] = useState<GroupBy>('service_type');
  const [period, setPeriod] = useState<MetricPeriod>('all_time');
  const main = useApi('winrate', { group_by: group, period });
  const sources = useApi('winrate', { group_by: 'lead_source', period });
  const d = main.data?.data;
  const lowCount = d ? d.rows.filter(low).length : 0;
  const isMatrix = group === 'service_type_x_lead_source';

  return (
    <>
      <PageHeader title="Win rate & deal size" subtitle="What wins, what it is worth, and how speed changes the odds. Win rate is won ÷ (won + lost): open deals are not counted until they are decided."
        actions={
          <>
            <div role="group" aria-label="Group by" className="flex flex-wrap rounded-lg border border-border-strong bg-surface p-0.5">
              {GROUPS.filter((g) => !g.owner || owner).map((g) => <button key={g.id} onClick={() => setGroup(g.id)} aria-pressed={group === g.id} className={cn('rounded-md px-3 py-1 text-[13px] font-medium transition-colors', group === g.id ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink')}>{g.label}</button>)}
            </div>
            <Select aria-label="Period" className="w-40" value={period} onChange={(e) => setPeriod(e.target.value as MetricPeriod)}>{PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>
          </>
        } />

      {main.isError ? <ErrorState error={main.error} onRetry={() => main.refetch()} /> : main.isLoading || !d ? (
        <div className="grid gap-4 lg:grid-cols-2"><CardSkeleton lines={6} /><CardSkeleton lines={6} /><CardSkeleton lines={6} /><CardSkeleton lines={6} /></div>
      ) : (
        <>
          <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Totals for this selection">
            {[['Deals', num(d.overall.deals)], ['Won', num(d.overall.won)], ['Win rate', pctText(d.overall.win_rate_pct, 1)], ['Total won', inrCompact(d.overall.total_won_inr)]].map(([l, v]) => (
              <Card key={l} className="p-3.5"><p className="text-xs text-ink-3">{l}</p><p className="display tnum mt-0.5 text-2xl font-semibold text-ink">{v}</p></Card>
            ))}
          </section>
          {lowCount > 0 && (
            <p role="note" className="mb-4 flex gap-2 rounded-xl border border-warn/30 bg-warn-soft p-3 text-[13px] text-warn"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {lowCount} of {d.rows.length} groups have fewer than {MIN_DECIDED} decided deals. Their numbers can swing wildly, so they are hatched and should not be trusted yet.</p>
          )}
          {d.rows.length === 0 ? <EmptyState title="No deals in this period" hint="Pick a longer period." /> : (
            <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
              {isMatrix ? <Heatmap rows={d.rows} className="lg:col-span-2" /> : <GroupCharts rows={d.rows} group={group} />}
              <SourcesWon q={sources} />
              <SpeedChart buckets={d.speed_buckets} />
              <LostReasons reasons={d.lost_reasons} />
            </div>
          )}
        </>
      )}
    </>
  );
}

function GroupCharts({ rows, group }: { rows: WinRow[]; group: GroupBy }) {
  const winData = useMemo<BarDatum[]>(() => [...rows].sort((a, b) => (b.win_rate_pct ?? -1) - (a.win_rate_pct ?? -1)).map((r) => ({
    key: r.dimension_value, label: nameOf(r, group), value: r.win_rate_pct, low: low(r),
    tooltip: { title: nameOf(r, group), lines: [`Win rate ${pctText(r.win_rate_pct, 1)}`, `${r.won} won, ${r.lost} lost, ${r.deals - r.won - r.lost} still open`, `Average deal ${inr(r.avg_deal_size_inr)}`] },
  })), [rows, group]);
  const sizeData = useMemo<BarDatum[]>(() => [...rows].filter((r) => r.avg_deal_size_inr !== null).sort((a, b) => b.avg_deal_size_inr! - a.avg_deal_size_inr!).map((r) => ({
    key: r.dimension_value, label: nameOf(r, group), value: r.avg_deal_size_inr, low: r.won < 3,
    tooltip: { title: nameOf(r, group), lines: [`Average deal ${inr(r.avg_deal_size_inr)}`, `From ${r.won} won deals`, `Total won ${inr(r.total_won_inr)}`] },
  })), [rows, group]);
  const cols: TableColumn[] = [
    { key: 'name', label: 'Group' }, { key: 'win', label: 'Win rate', align: 'right' }, { key: 'won', label: 'Won', align: 'right' }, { key: 'lost', label: 'Lost', align: 'right' },
    { key: 'avg', label: 'Avg deal', align: 'right' }, { key: 'total', label: 'Total won', align: 'right' }, { key: 'hrs', label: 'Median call → proposal', align: 'right' }, { key: 'flag', label: '' },
  ];
  const tableRows = rows.map((r) => ({ name: nameOf(r, group), win: pctText(r.win_rate_pct, 1), won: r.won, lost: r.lost, avg: inr(r.avg_deal_size_inr), total: inr(r.total_won_inr), hrs: hoursHuman(r.median_hours_call_to_proposal), flag: low(r) ? 'Low data' : '' }));
  return (
    <>
      <ChartCard title="Win rate" caption={`Share of decided deals that were won, by ${GROUPS.find((g) => g.id === group)!.label.toLowerCase()}.`} columns={cols.slice(0, 4).concat(cols[7]!)} rows={tableRows}><HBarChart id="win" data={winData} format={(n) => pctText(n, 0)} max={100} /></ChartCard>
      <ChartCard title="Average deal size" caption="Mean value of won deals. Hatched bars rest on fewer than 3 wins." columns={[cols[0]!, cols[4]!, cols[5]!]} rows={tableRows} empty={!sizeData.length}><HBarChart id="size" data={sizeData} format={inrCompact} /></ChartCard>
    </>
  );
}

function Heatmap({ rows, className }: { rows: WinRow[]; className?: string }) {
  const cells = new Map(rows.map((r) => [r.dimension_value, r]));
  const services = [...new Set(rows.map((r) => r.dimension_value.split('|')[0]!))];
  const sources = SOURCE_ORDER.filter((s) => rows.some((r) => r.dimension_value.endsWith(`|${s}`)));
  const level = (w: number | null) => (w === null ? 0 : w < 10 ? 1 : w < 20 ? 2 : w < 35 ? 3 : w < 50 ? 4 : 5);
  const svcName = (t: string) => rows.find((r) => r.dimension_value.startsWith(`${t}|`))?.label.split(' × ')[0] ?? t;
  const tableRows = rows.map((r) => ({ combo: r.label, win: pctText(r.win_rate_pct, 1), avg: inr(r.avg_deal_size_inr), n: r.won + r.lost, flag: low(r) ? 'Low data' : '' }));
  return (
    <ChartCard className={className} title="Win rate by service and lead source" caption="Darker = higher win rate. Each cell shows win rate and average deal size; hatched cells have fewer than 5 decided deals."
      columns={[{ key: 'combo', label: 'Service × source' }, { key: 'win', label: 'Win rate', align: 'right' }, { key: 'avg', label: 'Avg deal', align: 'right' }, { key: 'n', label: 'Decided', align: 'right' }, { key: 'flag', label: '' }]} rows={tableRows}>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-1 text-center text-xs">
          <thead><tr><th className="w-40" /><>{sources.map((s) => <th key={s} scope="col" className="px-1 pb-1 font-medium text-ink-2"><span className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: sourceColor(s) }} aria-hidden />{sourceLabel(s)}</th>)}</></tr></thead>
          <tbody>
            {services.map((svc) => (
              <tr key={svc}>
                <th scope="row" className="pr-2 text-right text-[13px] font-medium text-ink-2">{svcName(svc)}</th>
                {sources.map((src) => {
                  const r = cells.get(`${svc}|${src}`);
                  if (!r || r.deals === 0) return <td key={src} className="heat-low rounded-md p-2" title="No deals">—</td>;
                  const isLow = low(r);
                  return (
                    <td key={src} className={cn('rounded-md p-2', isLow || r.win_rate_pct === null ? 'heat-low' : `heat-${level(r.win_rate_pct)}`)} title={`${svcName(svc)} via ${sourceLabel(src)}: ${r.won} won, ${r.lost} lost${isLow ? ' (low data)' : ''}`}>
                      <span className="tnum block text-sm font-semibold">{r.win_rate_pct === null ? '—' : `${Math.round(r.win_rate_pct)}%`}</span>
                      <span className="tnum block opacity-90">{r.avg_deal_size_inr === null ? 'no wins' : inrCompact(r.avg_deal_size_inr)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-ink-3" aria-hidden><span>Lower</span>{[1, 2, 3, 4, 5].map((l) => <span key={l} className={cn('h-3 w-7 rounded-sm', `heat-${l}`)} />)}<span>Higher</span></div>
    </ChartCard>
  );
}

function SourcesWon({ q }: { q: ReturnType<typeof useApi<'winrate'>> }) {
  if (q.isLoading) return <CardSkeleton lines={5} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const rows = [...q.data!.data.rows].sort((a, b) => b.total_won_inr - a.total_won_inr);
  const data: BarDatum[] = rows.map((r) => ({ key: r.dimension_value, label: sourceLabel(r.dimension_value), value: r.total_won_inr, color: sourceColor(r.dimension_value), tooltip: { title: sourceLabel(r.dimension_value), lines: [`Won ${inr(r.total_won_inr)}`, `${r.won} deals won`, `Win rate ${pctText(r.win_rate_pct, 1)}`] } }));
  return (
    <ChartCard title="Revenue won by lead source" caption="Where the money actually came from." empty={!rows.length}
      columns={[{ key: 'src', label: 'Lead source' }, { key: 'total', label: 'Total won', align: 'right' }, { key: 'won', label: 'Deals won', align: 'right' }]}
      rows={rows.map((r) => ({ src: sourceLabel(r.dimension_value), total: inr(r.total_won_inr), won: r.won }))}>
      <HBarChart id="src" data={data} format={inrCompact} />
    </ChartCard>
  );
}

function SpeedChart({ buckets }: { buckets: { bucket: string; label: string; decided: number; won: number; lost: number; win_rate_pct: number | null }[] }) {
  const data: BarDatum[] = buckets.map((b) => ({ key: b.bucket, label: b.label, value: b.win_rate_pct, low: b.decided < MIN_DECIDED, tooltip: { title: `Proposal sent ${b.label.toLowerCase()} after the call`, lines: [`Win rate ${pctText(b.win_rate_pct, 1)}`, `${b.won} won, ${b.lost} lost`] } }));
  return (
    <ChartCard title="Speed vs win rate" caption="Win rate by how long the first proposal took after the call ended." columns={[{ key: 'b', label: 'Time to proposal' }, { key: 'w', label: 'Win rate', align: 'right' }, { key: 'n', label: 'Decided', align: 'right' }]}
      rows={buckets.map((b) => ({ b: b.label, w: pctText(b.win_rate_pct, 1), n: b.decided }))} empty={buckets.every((b) => b.decided === 0)}>
      <HBarChart id="speed" data={data} format={(n) => pctText(n, 0)} max={100} height={170} />
    </ChartCard>
  );
}

function LostReasons({ reasons }: { reasons: { reason: string; count: number }[] }) {
  const total = reasons.reduce((s, r) => s + r.count, 0);
  const data: BarDatum[] = reasons.map((r) => ({ key: r.reason, label: r.reason.charAt(0).toUpperCase() + r.reason.slice(1), value: r.count, tooltip: { title: r.reason, lines: [`${r.count} lost deals`, `${Math.round((100 * r.count) / Math.max(1, total))}% of losses`] } }));
  return (
    <ChartCard title="Why deals were lost" caption="Reasons recorded when a deal was declined, expired or marked lost." empty={!reasons.length}
      columns={[{ key: 'r', label: 'Reason' }, { key: 'c', label: 'Deals', align: 'right' }, { key: 'p', label: 'Share', align: 'right' }]} rows={reasons.map((r) => ({ r: r.reason, c: r.count, p: pctText((100 * r.count) / Math.max(1, total), 0) }))}>
      <HBarChart id="lost" data={data} format={(n) => String(n)} height={Math.max(150, reasons.length * 38 + 24)} />
    </ChartCard>
  );
}

export { Card, CardBody, CardHeader, CardTitle };
