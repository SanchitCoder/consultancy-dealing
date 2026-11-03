'use client';
import { AlertTriangle, Inbox, RefreshCw, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/primitives';
import type { ApiError } from '@/lib/client/api';
import { cn } from '@/lib/utils';

export function EmptyState({ title, hint, icon, action, className }: { title: string; hint?: string; icon?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong px-6 py-10 text-center', className)}>
      <div className="mb-1 grid size-10 place-items-center rounded-full bg-surface-2 text-ink-3" aria-hidden>{icon ?? <Inbox className="size-5" />}</div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-sm text-[13px] text-ink-3">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Failed query. A response that broke the Zod contract names the endpoint and the field. */
export function ErrorState({ error, onRetry, className }: { error: ApiError | Error | null; onRetry?: () => void; className?: string }) {
  const contract = (error as ApiError | null)?.contract;
  return (
    <div role="alert" className={cn('rounded-xl border border-bad/30 bg-bad-soft p-4 text-sm', className)}>
      <div className="flex items-start gap-3">
        {contract ? <ShieldAlert className="mt-0.5 size-5 shrink-0 text-bad" aria-hidden /> : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-bad">{contract ? 'The backend answered in a shape this dashboard does not expect' : 'Could not load this'}</p>
          {contract ? (
            <div className="mt-1 space-y-2 text-ink-2">
              <p>Endpoint <code className="rounded bg-surface px-1 font-mono text-xs">{contract.endpoint}</code>, field <code className="rounded bg-surface px-1 font-mono text-xs">{contract.field}</code>.</p>
              <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
                {contract.issues.slice(0, 5).map((i) => <li key={i.path}><code className="font-mono text-xs">{i.path}</code>: {i.message}</li>)}
              </ul>
              <p className="text-xs text-ink-3">This usually means the workflow was changed without updating contracts/deal-api.ts, or the wrong webhook is being called.</p>
            </div>
          ) : (
            <p className="mt-0.5 text-ink-2">{error?.message ?? 'Something went wrong.'}</p>
          )}
        </div>
        {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}><RefreshCw className="size-3.5" />Try again</Button>}
      </div>
    </div>
  );
}

export const CardSkeleton = ({ lines = 3, className }: { lines?: number; className?: string }) => (
  <Card className={cn('space-y-3 p-5', className)} aria-busy>
    <Skeleton className="h-4 w-1/3" />
    {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className="h-3.5" style={{ width: `${88 - i * 14}%` }} />)}
  </Card>
);
export const ListSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-2" aria-busy aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
  </div>
);

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="display text-[26px] font-semibold leading-tight text-ink sm:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
