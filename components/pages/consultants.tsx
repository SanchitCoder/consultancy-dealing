'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Masked } from '@/components/deal/badges';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/deal/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Badge, Card, FieldError, Hint, Input, Label, Select } from '@/components/ui/primitives';
import type { ConsultantRow } from '@/contracts/deal-api';
import { useAction, useApi } from '@/lib/client/hooks';
import { hoursHuman, inrCompact, pctText } from '@/lib/format';
import { initials } from '@/lib/format/labels';
import { MIN_DECIDED } from '@/lib/insights';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter a name'),
  email: z.string().trim().pipe(z.email('Enter a valid email address')),
  whatsapp: z.string().trim().optional().refine((v) => !v || /^(\+?91|0)?[6-9]\d{9}$/.test(v.replace(/[\s-]/g, '')), 'Use an Indian mobile number, e.g. 98765 43210'),
  timezone: z.string().min(1),
});
type Form = z.infer<typeof schema>;
const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York'];

export function Consultants() {
  const q = useApi('consultants');
  const codes = useQuery({ queryKey: ['codes'], queryFn: async () => (await (await fetch('/api/consultants/codes')).json()) as { codes: Record<string, string> }, staleTime: 60_000 });
  const [edit, setEdit] = useState<ConsultantRow | 'new' | null>(null);
  return (
    <>
      <PageHeader title="Consultants" subtitle="Who takes the calls, how fast their proposals go out, and how they convert. Each consultant signs in with their email and a personal code."
        actions={<Button variant="primary" onClick={() => setEdit('new')}><Plus className="size-4" aria-hidden />Add consultant</Button>} />
      {q.isLoading ? <ListSkeleton rows={4} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data!.data.length ? <EmptyState title="No consultants yet" action={<Button variant="primary" onClick={() => setEdit('new')}>Add consultant</Button>} /> : (
        <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
          {q.data!.data.map((c) => {
            const speed = c.median_hours_call_to_proposal;
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent-soft-ink" aria-hidden>{initials(c.name)}</span>
                  <div className="min-w-0 flex-1"><h2 className="truncate text-[15px] font-semibold text-ink">{c.name}</h2><div className="mt-0.5 space-y-0.5 text-[13px]"><div><Masked kind="email" value={c.email} /></div><div><Masked kind="phone" value={c.whatsapp} /></div></div></div>
                  <Button size="sm" variant="secondary" onClick={() => setEdit(c)}><Pencil className="size-3.5" aria-hidden />Edit</Button>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                  {[['Calls done', String(c.calls_completed)], ['Coming up', String(c.upcoming_calls)], ['Proposals', String(c.proposals_sent)], ['Win rate', pctText(c.win_rate_pct, 0)], ['Avg deal', inrCompact(c.avg_deal_size_inr)], ['Revenue', inrCompact(c.total_won_inr)]].map(([l, v]) => <div key={l} className="rounded-lg bg-surface-2 py-2"><dt className="text-[11px] text-ink-3">{l}</dt><dd className="tnum text-sm font-semibold text-ink">{v}</dd></div>)}
                </dl>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={speed === null ? 'neutral' : speed <= 24 ? 'good' : speed <= 48 ? 'warn' : 'bad'}>Proposal speed: {speed === null ? 'no data' : `${hoursHuman(speed)} median`}</Badge>
                  {c.won + c.lost < MIN_DECIDED && <Badge tone="warn">Low data</Badge>}
                  <CodeChip code={codes.data?.codes?.[c.id]} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Dialog open={edit !== null} onOpenChange={(o) => !o && setEdit(null)}>{edit !== null && <EditDialog key={edit === 'new' ? 'new' : edit.id} row={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}</Dialog>
    </>
  );
}

function CodeChip({ code }: { code?: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  return (
    <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-ink-2">
      <KeyRound className="size-3.5 text-ink-3" aria-hidden />
      <button type="button" className="font-mono" onClick={() => setShown((s) => !s)} aria-pressed={shown} aria-label={shown ? 'Hide sign-in code' : 'Show sign-in code'}>{shown ? code : '••••-••••'}</button>
      {shown && <button type="button" aria-label="Copy sign-in code" className="text-ink-3 hover:text-ink" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { toast.error('Could not copy. Select the code instead.'); } }}>{copied ? <Check className="size-3.5 text-good" /> : <Copy className="size-3.5" />}</button>}
    </span>
  );
}

function EditDialog({ row, onClose }: { row: ConsultantRow | null; onClose: () => void }) {
  const save = useAction('consultant', { onSuccess: () => onClose() });
  const f = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: row?.name ?? '', email: row?.email ?? '', whatsapp: row?.whatsapp ?? '', timezone: row?.timezone ?? 'Asia/Kolkata' } });
  const e = f.formState.errors;
  return (
    <DialogContent title={row ? `Edit ${row.name}` : 'Add a consultant'} description={row ? 'Changing the email also changes their sign-in code.' : 'They can sign in with their email and the code shown on their card.'}>
      <form onSubmit={f.handleSubmit((v) => save.mutate({ ...(row ? { id: row.id } : {}), name: v.name, email: v.email, timezone: v.timezone, ...(v.whatsapp ? { whatsapp: v.whatsapp } : {}) }))} className="space-y-4" noValidate>
        <div><Label htmlFor="co-name">Name</Label><Input id="co-name" {...f.register('name')} aria-invalid={!!e.name} /><FieldError>{e.name?.message}</FieldError></div>
        <div><Label htmlFor="co-email">Work email</Label><Input id="co-email" type="email" {...f.register('email')} aria-invalid={!!e.email} /><FieldError>{e.email?.message}</FieldError><Hint>Must match the email on their calendar bookings so calls are assigned to them.</Hint></div>
        <div><Label htmlFor="co-wa">WhatsApp</Label><Input id="co-wa" inputMode="tel" placeholder="98765 43210" {...f.register('whatsapp')} aria-invalid={!!e.whatsapp} /><FieldError>{e.whatsapp?.message}</FieldError><Hint>For brief-ready and proposal alerts.</Hint></div>
        <div><Label htmlFor="co-tz">Time zone</Label><Select id="co-tz" {...f.register('timezone')}>{TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><DialogClose asChild><Button type="button" variant="ghost" disabled={save.isPending}>Cancel</Button></DialogClose><Button type="submit" variant="primary" loading={save.isPending}>{row ? 'Save changes' : 'Add consultant'}</Button></div>
      </form>
    </DialogContent>
  );
}
