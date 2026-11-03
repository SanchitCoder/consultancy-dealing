'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarCheck, FileText, PhoneOff } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { FieldError, Hint, Label, Textarea } from '@/components/ui/primitives';
import { useAction, useApi } from '@/lib/client/hooks';
import { cn } from '@/lib/utils';

const schema = z.object({ outcome: z.enum(['completed', 'no_show']), transcript: z.string().optional() })
  .superRefine((v, ctx) => { if (v.outcome === 'completed' && (v.transcript ?? '').trim().length < 20) ctx.addIssue({ code: 'custom', path: ['transcript'], message: 'Paste at least a few lines of transcript or notes so the proposal has something to work from.' }); });
type Form = z.infer<typeof schema>;

export interface LogOutcomeTarget { dealId: number; company: string | null; prospect: string | null }

export function LogOutcomeDialog({ target, onOpenChange }: { target: LogOutcomeTarget | null; onOpenChange: (o: boolean) => void }) {
  const cfg = useApi('config', undefined, { enabled: !!target });
  const f = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { outcome: 'completed', transcript: '' } });
  const outcome = useWatch({ control: f.control, name: 'outcome' });
  const act = useAction('callDone', { poll: ['proposals', 'deals', 'deal', 'sla', 'calls'], onSuccess: () => { onOpenChange(false); f.reset(); } });
  const hours = cfg.data?.data.noshow_followup_hours ?? [24, 72];

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!act.isPending) onOpenChange(o); }}>
      <DialogContent title="Log the call outcome" description={target ? `${target.prospect ?? 'Prospect'} at ${target.company ?? 'their company'}` : undefined} className="max-w-xl">
        <form onSubmit={f.handleSubmit((v) => target && act.mutate(v.outcome === 'no_show' ? { deal_id: target.dealId, no_show: true } : { deal_id: target.dealId, transcript_text: v.transcript!.trim(), transcript_source: 'manual' }))} noValidate className="space-y-4">
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-ink-2">What happened?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {([['completed', 'The call happened', CalendarCheck], ['no_show', "They didn't show up", PhoneOff]] as const).map(([value, label, Icon]) => (
                <label key={value} className={cn('flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent', outcome === value ? 'border-accent bg-accent-soft text-accent-soft-ink' : 'border-border-strong bg-surface text-ink-2 hover:bg-surface-2')}>
                  <input type="radio" value={value} className="sr-only" {...f.register('outcome')} /><Icon className="size-4" aria-hidden />{label}
                </label>
              ))}
            </div>
          </fieldset>
          {outcome === 'completed' ? (
            <div>
              <Label htmlFor="lo-transcript">Transcript or your notes</Label>
              <Textarea id="lo-transcript" rows={7} placeholder="Paste the call transcript, or type what you agreed: their goals, budget, timing, what they asked for." {...f.register('transcript')} aria-invalid={!!f.formState.errors.transcript} />
              <FieldError>{f.formState.errors.transcript?.message}</FieldError>
              <div className="mt-3 flex gap-2.5 rounded-lg bg-info-soft p-3 text-[13px] text-info"><FileText className="mt-0.5 size-4 shrink-0" aria-hidden /><p><strong>What happens next:</strong> the call is marked done and a proposal is drafted from what you wrote. It waits in your approval queue, so nothing is sent until you tap <em>Approve &amp; send</em>. Aim to send within 24 hours of the call.</p></div>
            </div>
          ) : (
            <div className="flex gap-2.5 rounded-lg bg-info-soft p-3 text-[13px] text-info"><PhoneOff className="mt-0.5 size-4 shrink-0" aria-hidden /><p><strong>What happens next:</strong> the deal moves to No-show and the prospect gets a friendly message with your booking link. We nudge again after {hours.join(' and ')} hours if they stay quiet. If they rebook, the same deal continues.</p></div>
          )}
          <Hint>This changes the deal. You can see everything that happened in its timeline.</Hint>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild><Button type="button" variant="ghost" disabled={act.isPending}>Cancel</Button></DialogClose>
            <Button type="submit" variant="primary" loading={act.isPending}>{outcome === 'completed' ? 'Log call and draft proposal' : 'Log no-show and rebook'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
