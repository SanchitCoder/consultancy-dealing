'use client';
import { Table2, BarChart3 } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

export interface TableColumn { key: string; label: string; align?: 'left' | 'right'; format?: (v: unknown, row: Record<string, unknown>) => ReactNode }

/** Every chart: a title, a one-line caption saying what it shows, and a "view as table" toggle. */
export function ChartCard({ title, caption, children, columns, rows, className, actions, empty }: {
  title: string; caption: string; children: ReactNode; columns: TableColumn[]; rows: Record<string, unknown>[]; className?: string; actions?: ReactNode; empty?: boolean;
}) {
  const [table, setTable] = useState(false);
  const id = useId();
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <p id={`${id}-cap`} className="mt-0.5 text-[13px] text-ink-3">{caption}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <Button size="sm" variant="ghost" aria-pressed={table} onClick={() => setTable((t) => !t)} aria-label={table ? 'Show chart' : 'View as table'}>
            {table ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
            <span className="hidden sm:inline">{table ? 'Chart' : 'Table'}</span>
          </Button>
        </div>
      </CardHeader>
      <CardBody className="min-h-0 flex-1">
        {empty ? <p className="py-10 text-center text-sm text-ink-3">Nothing to show for this selection yet.</p> : table ? (
          <div className="max-h-80 overflow-auto rounded-lg border border-border">
            <table className="w-full text-[13px]">
              <caption className="sr-only">{title}: {caption}</caption>
              <thead className="sticky top-0 bg-surface-2 text-left text-xs text-ink-2">
                <tr>{columns.map((c) => <th key={c.key} scope="col" className={cn('px-3 py-2 font-medium', c.align === 'right' && 'text-right')}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    {columns.map((c) => <td key={c.key} className={cn('tnum px-3 py-1.5', c.align === 'right' && 'text-right')}>{c.format ? c.format(r[c.key], r) : String(r[c.key] ?? '—')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div role="img" aria-labelledby={`${id}-cap`}>{children}</div>}
      </CardBody>
    </Card>
  );
}

/** Chart palette (validated): categorical slots in fixed order. */
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)'] as const;
export const SEQ = ['var(--seq-100)', 'var(--seq-250)', 'var(--seq-400)', 'var(--seq-550)', 'var(--seq-700)'] as const;
export const AXIS = { fill: 'var(--ink-3)', fontSize: 12 } as const;
