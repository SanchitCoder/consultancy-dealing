import type { WinRow, WinrateData } from '@/contracts/deal-api';
import { inrCompact } from '@/lib/format';
import { serviceLabel, sourceLabel } from '@/lib/format/labels';

export const MIN_DECIDED = 5;
export interface Insight { id: string; text: string; tone: 'good' | 'info' | 'warn' }

const wr = (r: WinRow) => r.win_rate_pct ?? 0;

/** One-line, plain-language findings. A group needs at least MIN_DECIDED decided deals before it is allowed to make a claim. */
export function buildInsights(input: { sources?: WinrateData; services?: WinrateData }): Insight[] {
  const out: Insight[] = [];
  const speed = input.sources?.speed_buckets ?? input.services?.speed_buckets;
  if (speed) {
    const fast = speed.find((b) => b.bucket === 'lt_24h');
    const slow = speed.find((b) => b.bucket === 'gt_48h');
    if (fast && slow && fast.decided >= MIN_DECIDED && slow.decided >= MIN_DECIDED && fast.win_rate_pct && slow.win_rate_pct) {
      const ratio = fast.win_rate_pct / slow.win_rate_pct;
      if (ratio >= 1.2) out.push({ id: 'speed', tone: 'good', text: `Proposals sent within 24h of the call win ${ratio.toFixed(1)}× more often than ones sent after 48h (${Math.round(fast.win_rate_pct)}% vs ${Math.round(slow.win_rate_pct)}%).` });
    }
  }
  const src = (input.sources?.rows ?? []).filter((r) => r.decided >= MIN_DECIDED && r.win_rate_pct !== null);
  if (src.length >= 2) {
    const sorted = [...src].sort((a, b) => wr(b) - wr(a));
    const best = sorted[0]!;
    const worst = sorted[sorted.length - 1]!;
    if (wr(best) - wr(worst) >= 8) out.push({ id: 'source', tone: 'info', text: `${sourceLabel(best.dimension_value)} wins ${Math.round(wr(best))}% vs ${Math.round(wr(worst))}% for ${sourceLabel(worst.dimension_value)}.` });
    const volume = [...(input.sources?.rows ?? [])].sort((a, b) => b.deals - a.deals)[0];
    if (volume && volume.dimension_value !== best.dimension_value && volume.win_rate_pct !== null && wr(volume) < wr(best) - 8 && volume.decided >= MIN_DECIDED) {
      out.push({ id: 'volume', tone: 'warn', text: `${sourceLabel(volume.dimension_value)} brings the most deals (${volume.deals}) but only ${Math.round(wr(volume))}% of decided ones are won.` });
    }
    const small = [...src].filter((r) => r.avg_deal_size_inr !== null).sort((a, b) => a.avg_deal_size_inr! - b.avg_deal_size_inr!)[0];
    const big = [...src].filter((r) => r.avg_deal_size_inr !== null).sort((a, b) => b.avg_deal_size_inr! - a.avg_deal_size_inr!)[0];
    if (small && big && small.dimension_value !== big.dimension_value && big.avg_deal_size_inr! >= small.avg_deal_size_inr! * 1.5) {
      out.push({ id: 'small', tone: 'info', text: `${sourceLabel(small.dimension_value)} deals are the smallest: ${inrCompact(small.avg_deal_size_inr)} on average, against ${inrCompact(big.avg_deal_size_inr)} for ${sourceLabel(big.dimension_value)}.` });
    }
  }
  const svc = (input.services?.rows ?? []).filter((r) => r.won >= 2 && r.avg_deal_size_inr !== null);
  if (svc.length >= 2) {
    const top = [...svc].sort((a, b) => b.avg_deal_size_inr! - a.avg_deal_size_inr!)[0]!;
    out.push({ id: 'service', tone: 'good', text: `${serviceLabel(top.dimension_value, top.label)} has the largest average deal at ${inrCompact(top.avg_deal_size_inr)}.` });
  }
  return out;
}
