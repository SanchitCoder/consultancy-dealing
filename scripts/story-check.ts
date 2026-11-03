import { generateSeed } from '@/lib/mock/seed';
import { buildFacts, pipelineMetrics, speedBuckets, cohort, lostReasons } from '@/lib/metrics';
const now = Date.parse('2026-11-02T10:00:00Z');
const db = generateSeed({ now });
const facts = buildFacts(db);
const real = facts.filter((f) => !f.isTest);
const count = (k: string) => db.deals.filter((d) => !d.is_test).reduce((m, d) => ((m[(d as never)[k]] = (m[(d as never)[k]] ?? 0) + 1), m), {} as Record<string, number>);
console.log('deals', db.deals.length, 'calls', db.calls.length, 'briefs', db.briefs.length, 'proposals', db.proposals.length, 'payments', db.payments.length);
console.log('stages', count('stage'));
for (const dim of ['lead_source', 'service_type', 'consultant'] as const)
  console.table(pipelineMetrics(facts, dim, 'all_time', now).map((r) => ({ v: r.dimension_value, deals: r.deals, won: r.won, lost: r.lost, wr: r.win_rate_pct, avg: r.avg_deal_size_inr, med_h: r.median_hours_call_to_proposal })));
console.table(speedBuckets(cohort(real, 'all_time', now)));
console.log(lostReasons(real));
const past = db.calls.filter((c) => c.status === 'completed' || c.status === 'no_show');
const ready = past.filter((c) => { const b = db.briefs.find((x) => x.call_id === c.id); return b?.status === 'ready' && Date.parse(b.generated_at!) <= Date.parse(c.scheduled_for!); });
console.log('brief ready before call', ready.length, '/', past.length, ((100 * ready.length) / past.length).toFixed(1) + '%');
