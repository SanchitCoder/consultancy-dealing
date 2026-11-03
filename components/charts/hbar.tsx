'use client';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS } from './chart-card';

export interface BarDatum { key: string; label: string; value: number | null; low?: boolean; color?: string; tooltip: { title: string; lines: string[] } }

function Tip({ active, payload }: { active?: boolean; payload?: { payload: BarDatum }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]!.payload;
  return (
    <div className="max-w-60 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
      <p className="mb-1 font-semibold text-ink">{d.tooltip.title}</p>
      {d.tooltip.lines.map((l) => <p key={l} className="text-ink-2">{l}</p>)}
      {d.low && <p className="mt-1 font-medium text-warn">Low data: fewer than 5 decided deals</p>}
    </div>
  );
}

/** Horizontal bars, thin, rounded at the data end, one hue. Low-data bars are hatched. A direct label sits at the end of each bar. */
export function HBarChart({ data, format, max, id, height }: { data: BarDatum[]; format: (n: number) => string; max?: number; id: string; height?: number }) {
  const h = height ?? Math.max(160, data.length * 38 + 24);
  return (
    <div style={{ height: h }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart accessibilityLayer={false} data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 0 }} barCategoryGap={10}>
          <defs>
            <pattern id={`hatch-${id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--surface-2)" /><rect width="2.5" height="6" fill="var(--series-1)" opacity="0.65" /></pattern>
          </defs>
          <XAxis type="number" hide domain={[0, max ?? 'dataMax']} />
          <YAxis type="category" dataKey="label" width={150} tickLine={false} axisLine={false} tick={{ ...AXIS, fill: 'var(--ink-2)' }} interval={0} />
          <Tooltip cursor={{ fill: 'var(--surface-2)', opacity: 0.6 }} content={<Tip />} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18} background={{ fill: 'var(--surface-2)', radius: 4 } as never} isAnimationActive animationDuration={500}>
            {data.map((d) => <Cell key={d.key} fill={d.low ? `url(#hatch-${id})` : d.color ?? 'var(--series-1)'} />)}
            <LabelList dataKey="value" position="right" formatter={(v) => (typeof v === 'number' ? format(v) : '—')} style={{ fill: 'var(--ink)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
