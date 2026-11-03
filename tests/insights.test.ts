import { describe, expect, it } from 'vitest';
import type { WinRow, WinrateData } from '@/contracts/deal-api';
import { buildInsights } from '@/lib/insights';

const row = (v: string, o: Partial<WinRow>): WinRow => ({ dimension_value: v, label: v, deals: 20, calls_completed: 18, proposals_sent: 15, proposals_opened: 12, won: 4, lost: 10, decided: 14, win_rate_pct: 28, avg_deal_size_inr: 100_000, total_won_inr: 400_000, avg_hours_call_to_proposal: 20, median_hours_call_to_proposal: 18, open_rate_pct: 80, ...o });
const data = (rows: WinRow[], speed: WinrateData['speed_buckets'] = []): WinrateData => ({ group_by: 'lead_source', period: 'all_time', rows, overall: { deals: 0, proposals_sent: 0, won: 0, lost: 0, win_rate_pct: null, avg_deal_size_inr: null, total_won_inr: 0 }, speed_buckets: speed, lost_reasons: [] });
const sp = (a: number, b: number, n = 30): WinrateData['speed_buckets'] => [
  { bucket: 'lt_24h', label: '', decided: n, won: 0, lost: 0, win_rate_pct: a }, { bucket: '24_48h', label: '', decided: n, won: 0, lost: 0, win_rate_pct: 30 }, { bucket: 'gt_48h', label: '', decided: n, won: 0, lost: 0, win_rate_pct: b },
];

describe('plain-language insights', () => {
  it('says how much faster proposals win', () => {
    const t = buildInsights({ sources: data([], sp(42, 20)) }).find((i) => i.id === 'speed')!.text;
    expect(t).toBe('Proposals sent within 24h of the call win 2.1× more often than ones sent after 48h (42% vs 20%).');
  });
  it('compares best and worst lead sources', () => {
    const rows = [row('referral', { win_rate_pct: 48 }), row('linkedin_outbound', { win_rate_pct: 14 }), row('webinar', { win_rate_pct: 30 })];
    expect(buildInsights({ sources: data(rows) }).find((i) => i.id === 'source')!.text).toBe('Referral wins 48% vs 14% for LinkedIn outbound.');
  });
  it('flags a high-volume, low-win source', () => {
    const rows = [row('referral', { win_rate_pct: 50, deals: 10 }), row('linkedin_outbound', { win_rate_pct: 12, deals: 90 })];
    expect(buildInsights({ sources: data(rows) }).find((i) => i.id === 'volume')!.text).toMatch(/LinkedIn outbound brings the most deals \(90\) but only 12%/);
  });
  it('refuses to make claims from thin data', () => {
    const rows = [row('referral', { win_rate_pct: 80, decided: 3 }), row('linkedin_outbound', { win_rate_pct: 10, decided: 4 })];
    expect(buildInsights({ sources: data(rows, sp(60, 10, 3)) })).toEqual([]);
  });
  it('names the service with the largest average deal', () => {
    const svc = data([row('sales_process', { label: 'Sales Process Consulting', avg_deal_size_inr: 200_000, won: 5 }), row('brand_strategy', { label: 'Brand Strategy Sprint', avg_deal_size_inr: 60_000, won: 5 })]);
    expect(buildInsights({ services: svc }).find((i) => i.id === 'service')!.text).toBe('Sales Process Consulting has the largest average deal at ₹2L.');
  });
});
