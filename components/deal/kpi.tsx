'use client';
import { animate, useReducedMotion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import { Card, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/** Counts up from the previous value to the new one; instant for people who prefer reduced motion. */
export function CountUp({ value, format }: { value: number | null; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState<number | null>(reduce ? value : null);
  const from = useRef(0);
  useEffect(() => {
    if (value === null) { setShown(null); return; }
    if (reduce) { setShown(value); from.current = value; return; }
    const c = animate(from.current, value, { duration: 0.8, ease: [0.165, 0.84, 0.44, 1], onUpdate: (v) => setShown(v), onComplete: () => { from.current = value; } });
    return () => { from.current = value; c.stop(); };
  }, [value, reduce]);
  return <span className="tnum">{value === null ? '—' : format(shown ?? 0)}</span>;
}

export function Delta({ pct, higherIsBetter = true, label = 'vs previous period' }: { pct: number | null; higherIsBetter?: boolean; label?: string }) {
  if (pct === null) return <span className="inline-flex items-center gap-1 text-xs text-ink-3"><Minus className="size-3" aria-hidden />no comparison</span>;
  const up = pct > 0;
  const flat = Math.abs(pct) < 0.5;
  const good = flat ? null : up === higherIsBetter;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', good === null ? 'text-ink-3' : good ? 'text-good' : 'text-bad')} title={label}>
      <Icon className="size-3.5" aria-hidden />
      <span className="tnum">{up ? '+' : ''}{pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)}%</span>
      <span className="sr-only"> {label}</span>
    </span>
  );
}

export function Sparkline({ data, className }: { data: (number | null)[]; className?: string }) {
  const pts = data.map((v, i) => ({ i, v }));
  if (pts.filter((p) => p.v !== null).length < 2) return <div className={cn('h-9', className)} />;
  return (
    <div className={cn('h-9', className)} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart accessibilityLayer={false} data={pts} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line type="monotone" dataKey="v" stroke="var(--series-1)" strokeWidth={2} dot={false} connectNulls isAnimationActive animationDuration={700} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function KpiCard({ label, value, format, delta, higherIsBetter = true, series, hint, loading, tip }: {
  label: string; value: number | null; format: (n: number) => string; delta: number | null; higherIsBetter?: boolean; series: (number | null)[]; hint?: string; loading?: boolean; tip?: string;
}) {
  if (loading) return <Card className="space-y-3 p-4"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-8 w-2/3" /><Skeleton className="h-9 w-full" /></Card>;
  return (
    <Card className="flex flex-col p-4" title={tip}>
      <p className="text-[13px] font-medium text-ink-2">{label}</p>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <p className="display text-[28px] font-semibold leading-none text-ink"><CountUp value={value} format={format} /></p>
        <Delta pct={delta} higherIsBetter={higherIsBetter} />
      </div>
      <Sparkline data={series} className="mt-2" />
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </Card>
  );
}
