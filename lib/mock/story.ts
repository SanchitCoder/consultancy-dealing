/** Measures the story a seed tells, computed with the shared metrics module. Used by the seed search script and by tests. */
import { buildFacts, cohort, hoursCallToProposal, pipelineMetrics, speedBuckets } from '@/lib/metrics';
import type { Db } from '@/lib/metrics/types';

const HOUR = 3_600_000;

export interface Story {
  deals: number;
  bySource: Record<string, { deals: number; winRate: number | null; avgDeal: number | null; decided: number }>;
  byService: Record<string, { deals: number; avgDeal: number | null }>;
  byConsultant: Record<string, { winRate: number | null; medianHours: number | null; decided: number }>;
  speed: { lt24: number | null; mid: number | null; gt48: number | null; decided: number[] };
  briefReadyBeforeCallPct: number;
  stageCounts: Record<string, number>;
  upcomingCalls: number;
  awaitingApproval: number;
  overdue24: number;
}

export function measureStory(db: Db, now: number): Story {
  const facts = buildFacts(db);
  const real = cohort(facts, 'all_time', now);
  const rows = (dim: 'lead_source' | 'service_type' | 'consultant') => pipelineMetrics(facts, dim, 'all_time', now);
  const bySource = Object.fromEntries(rows('lead_source').map((r) => [r.dimension_value, { deals: r.deals, winRate: r.win_rate_pct, avgDeal: r.avg_deal_size_inr, decided: r.won + r.lost }]));
  const byService = Object.fromEntries(rows('service_type').map((r) => [r.dimension_value, { deals: r.deals, avgDeal: r.avg_deal_size_inr }]));
  const byConsultant = Object.fromEntries(rows('consultant').map((r) => [r.dimension_value, { winRate: r.win_rate_pct, medianHours: r.median_hours_call_to_proposal, decided: r.won + r.lost }]));
  const sb = speedBuckets(real);
  const testDeals = new Set(db.deals.filter((d) => d.is_test).map((d) => d.id));
  const held = db.calls.filter((c) => !testDeals.has(c.deal_id) && (c.status === 'completed' || c.status === 'no_show'));
  const ready = held.filter((c) => {
    const b = db.briefs.find((x) => x.call_id === c.id);
    return !!b && b.status === 'ready' && Date.parse(b.generated_at!) <= Date.parse(c.scheduled_for!);
  });
  const stageCounts: Record<string, number> = {};
  for (const d of db.deals) if (!d.is_test) stageCounts[d.stage] = (stageCounts[d.stage] ?? 0) + 1;
  const overdue24 = real.filter((f) => (f.stage === 'call_done' || f.stage === 'proposal_drafted') && f.callCompletedAt !== null && now - f.callCompletedAt > 24 * HOUR).length;
  return {
    deals: real.length, bySource, byService, byConsultant,
    speed: { lt24: sb[0]!.win_rate_pct, mid: sb[1]!.win_rate_pct, gt48: sb[2]!.win_rate_pct, decided: sb.map((b) => b.decided) },
    briefReadyBeforeCallPct: (100 * ready.length) / Math.max(1, held.length),
    stageCounts,
    upcomingCalls: db.calls.filter((c) => !testDeals.has(c.deal_id) && c.status === 'scheduled' && Date.parse(c.scheduled_for!) >= now).length,
    awaitingApproval: stageCounts.proposal_drafted ?? 0,
    overdue24,
  };
}

/** Empty list = the sample data tells the intended story. */
export function storyProblems(s: Story): string[] {
  const out: string[] = [];
  const src = Object.entries(s.bySource);
  const byWin = [...src].sort((a, b) => (b[1].winRate ?? -1) - (a[1].winRate ?? -1));
  if (byWin[0]?.[0] !== 'referral') out.push(`referral is not the top win rate (${byWin[0]?.[0]})`);
  else if ((byWin[0][1].winRate ?? 0) - (byWin[1]?.[1].winRate ?? 0) < 8) out.push('referral lead over second place is under 8 points');
  const mostDeals = [...src].sort((a, b) => b[1].deals - a[1].deals)[0]?.[0];
  if (mostDeals !== 'linkedin_outbound') out.push(`linkedin_outbound is not the highest volume (${mostDeals})`);
  const li = s.bySource.linkedin_outbound;
  if (!li || (li.winRate ?? 100) > 20) out.push(`linkedin win rate too high (${li?.winRate})`);
  const lowestWin = byWin[byWin.length - 1]?.[0];
  if (lowestWin !== 'linkedin_outbound' && lowestWin !== 'instagram') out.push(`lowest win rate is ${lowestWin}`);
  const minAvg = [...src].filter(([, v]) => v.avgDeal !== null).sort((a, b) => a[1].avgDeal! - b[1].avgDeal!)[0]?.[0];
  if (minAvg !== 'instagram') out.push(`instagram is not the smallest average deal (${minAvg})`);
  const maxSvc = Object.entries(s.byService).filter(([, v]) => v.avgDeal !== null).sort((a, b) => b[1].avgDeal! - a[1].avgDeal!)[0]?.[0];
  if (maxSvc !== 'sales_process') out.push(`sales_process is not the largest average deal (${maxSvc})`);
  const { lt24, mid, gt48 } = s.speed;
  if (!lt24 || !gt48 || lt24 / gt48 < 1.7 || lt24 / gt48 > 2.4) out.push(`speed ratio off (${lt24}/${gt48})`);
  if (mid !== null && lt24 !== null && gt48 !== null && !(mid <= lt24 && mid >= gt48)) out.push('24-48h bucket is not between the other two');
  if (s.speed.decided.some((n) => n < 25)) out.push('a speed bucket has fewer than 25 decided deals');
  const c = s.byConsultant;
  const wins = Object.entries(c).sort((a, b) => (b[1].winRate ?? -1) - (a[1].winRate ?? -1));
  if (wins[0]?.[0] !== '1') out.push(`fast consultant is not the top win rate (${wins[0]?.[0]})`);
  if ((c['1']?.medianHours ?? 99) > 18) out.push('fast consultant median over 18h');
  if ((c['2']?.medianHours ?? 0) < 36) out.push('slow consultant median under 36h');
  if (wins[wins.length - 1]?.[0] !== '2') out.push(`slow consultant is not the lowest win rate (${wins[wins.length - 1]?.[0]})`);
  if (s.briefReadyBeforeCallPct < 88 || s.briefReadyBeforeCallPct > 94) out.push(`brief-ready-before-call ${s.briefReadyBeforeCallPct.toFixed(1)}%`);
  if ((s.stageCounts.proposal_opened ?? 0) < 7) out.push('fewer than 7 opened');
  if ((s.stageCounts.proposal_sent ?? 0) < 5) out.push('fewer than 5 sent');
  if ((s.stageCounts.negotiation ?? 0) < 3) out.push('fewer than 3 in negotiation');
  if (s.awaitingApproval < 6) out.push('fewer than 6 awaiting approval');
  if (s.overdue24 < 3) out.push('fewer than 3 SLA-overdue');
  if (s.upcomingCalls < 8) out.push('fewer than 8 upcoming calls');
  if (s.deals < 245 || s.deals > 275) out.push(`deal count ${s.deals}`);
  void hoursCallToProposal;
  return out;
}
