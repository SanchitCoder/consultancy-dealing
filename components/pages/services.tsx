'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/deal/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Badge, Card, FieldError, Hint, Input, Label, Switch } from '@/components/ui/primitives';
import type { ServiceRow } from '@/contracts/deal-api';
import { useAction, useApi } from '@/lib/client/hooks';
import { inr, inrCompact, pctText } from '@/lib/format';
import { MIN_DECIDED } from '@/lib/insights';

const schema = z.object({
  name: z.string().trim().min(2, 'Give the service a name'),
  service_type: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]+$/, 'Letters, numbers, - and _ only (no spaces)'),
  base_price_inr: z.coerce.number({ error: 'Enter a price' }).min(0, 'Cannot be negative'),
  proposal_template_doc_id: z.string().trim().optional(),
  active: z.boolean(),
});
type FormIn = z.input<typeof schema>;
type FormOut = z.output<typeof schema>;

export function Services() {
  const q = useApi('services');
  const [edit, setEdit] = useState<ServiceRow | 'new' | null>(null);
  return (
    <>
      <PageHeader title="Services" subtitle="What you sell, what it costs, and how each service performs. The base price is what new proposals start from."
        actions={<Button variant="primary" onClick={() => setEdit('new')}><Plus className="size-4" aria-hidden />Add service</Button>} />
      {q.isLoading ? <ListSkeleton rows={5} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data!.data.length ? <EmptyState title="No services yet" hint="Add your first service so bookings can be matched to it." action={<Button variant="primary" onClick={() => setEdit('new')}>Add service</Button>} /> : (
        <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
          {q.data!.data.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1"><h2 className="truncate text-[15px] font-semibold text-ink">{s.name}</h2><p className="font-mono text-xs text-ink-3">{s.service_type}</p></div>
                <div className="text-right"><p className="tnum text-lg font-semibold text-ink">{inr(s.base_price_inr)}</p><p className="text-xs text-ink-3">base price</p></div>
              </div>
              <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[['Deals', String(s.deals)], ['Win rate', pctText(s.win_rate_pct, 0)], ['Avg deal', inrCompact(s.avg_deal_size_inr)], ['Total won', inrCompact(s.total_won_inr)]].map(([l, v]) => <div key={l} className="rounded-lg bg-surface-2 py-2"><dt className="text-[11px] text-ink-3">{l}</dt><dd className="tnum text-sm font-semibold text-ink">{v}</dd></div>)}
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {s.active ? <Badge tone="good">Active</Badge> : <Badge>Paused</Badge>}
                {s.won + s.lost < MIN_DECIDED && <Badge tone="warn">Low data: {s.won + s.lost} decided</Badge>}
                <span className="truncate text-ink-3">{s.proposal_template_doc_id ? `Template ${s.proposal_template_doc_id.slice(0, 14)}…` : 'No proposal template set'}</span>
                <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setEdit(s)}><Pencil className="size-3.5" aria-hidden />Edit</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <ServiceDialog edit={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function ServiceDialog({ edit, onClose }: { edit: ServiceRow | 'new' | null; onClose: () => void }) {
  const isNew = edit === 'new';
  const row = edit && edit !== 'new' ? edit : null;
  const save = useAction('service', { onSuccess: () => onClose() });
  return (
    <Dialog open={edit !== null} onOpenChange={(o) => { if (!o && !save.isPending) onClose(); }}>
      {edit !== null && (
        <DialogContent title={isNew ? 'Add a service' : `Edit ${row!.name}`} description="Saving updates the service for every new booking and proposal.">
          <ServiceForm key={row?.id ?? 'new'} row={row} isNew={isNew} pending={save.isPending} onSubmit={(v) => save.mutate({ name: v.name, service_type: v.service_type, base_price_inr: v.base_price_inr, active: v.active, ...(v.proposal_template_doc_id ? { proposal_template_doc_id: v.proposal_template_doc_id } : {}) })} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function ServiceForm({ row, isNew, pending, onSubmit }: { row: ServiceRow | null; isNew: boolean; pending: boolean; onSubmit: (v: FormOut) => void }) {
  const f = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(schema), defaultValues: { name: row?.name ?? '', service_type: row?.service_type ?? '', base_price_inr: row?.base_price_inr ?? 0, proposal_template_doc_id: row?.proposal_template_doc_id ?? '', active: row?.active ?? true } });
  const active = useWatch({ control: f.control, name: 'active' });
  const e = f.formState.errors;
  return (
    <form onSubmit={f.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div><Label htmlFor="sv-name">Name</Label><Input id="sv-name" {...f.register('name')} aria-invalid={!!e.name} /><FieldError>{e.name?.message}</FieldError></div>
      <div><Label htmlFor="sv-type">Service type (short code)</Label><Input id="sv-type" className="font-mono" disabled={!isNew} {...f.register('service_type')} aria-invalid={!!e.service_type} /><FieldError>{e.service_type?.message}</FieldError><Hint>{isNew ? 'Used to match bookings, e.g. ai_automation. Cannot be changed later.' : 'The code cannot be changed after creation.'}</Hint></div>
      <div><Label htmlFor="sv-price">Base price (₹)</Label><Input id="sv-price" inputMode="numeric" {...f.register('base_price_inr')} aria-invalid={!!e.base_price_inr} /><FieldError>{e.base_price_inr?.message}</FieldError></div>
      <div><Label htmlFor="sv-doc">Proposal template (Google Doc ID)</Label><Input id="sv-doc" className="font-mono" placeholder="1AbC…" {...f.register('proposal_template_doc_id')} /><Hint>The long ID in the Google Doc link. New proposals are copied from this document.</Hint></div>
      <div className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
        <div><p className="text-sm font-medium text-ink">Active</p><p className="text-xs text-ink-3">Paused services are not matched to new bookings.</p></div>
        <Switch checked={active} onCheckedChange={(c) => f.setValue('active', c)} aria-label="Active" />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><DialogClose asChild><Button type="button" variant="ghost" disabled={pending}>Cancel</Button></DialogClose><Button type="submit" variant="primary" loading={pending}>{isNew ? 'Create service' : 'Save changes'}</Button></div>
    </form>
  );
}
