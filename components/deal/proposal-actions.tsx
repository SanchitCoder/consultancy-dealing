'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Send } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, type ButtonProps } from '@/components/ui/button';
import { FieldError, Hint, Label, Textarea } from '@/components/ui/primitives';
import { useAction } from '@/lib/client/hooks';
import { inr } from '@/lib/format';
import { ConfirmDialog } from './confirm';

export interface ProposalRef { id: number; version: number; company: string | null; prospect_name: string | null; amount_inr: number | null }

/** One tap to approve and send, after a confirmation that says exactly what will happen. */
export function ApproveSendButton({ proposal, size = 'sm', variant = 'primary', label = 'Approve & send', onDone }: { proposal: ProposalRef; size?: ButtonProps['size']; variant?: ButtonProps['variant']; label?: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const approve = useAction('approveAdmin', { onSuccess: () => { setOpen(false); onDone?.(); } });
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}><Send className="size-3.5" aria-hidden />{label}</Button>
      <ConfirmDialog open={open} onOpenChange={setOpen} title={`Send proposal v${proposal.version}?`} confirmLabel="Approve & send" pending={approve.isPending}
        onConfirm={() => approve.mutate({ proposal_id: proposal.id })}
        description={<>This emails <strong>{proposal.prospect_name ?? 'the prospect'}</strong> at {proposal.company ?? 'their company'} the {inr(proposal.amount_inr)} proposal with tracking links. It starts the expiry clock and cannot be unsent.</>} />
    </>
  );
}

const reviseSchema = z.object({ change_notes: z.string().trim().min(3, 'Tell us what to change, even briefly').max(1500, 'Keep it under 1,500 characters') });

export function RequestChangesButton({ proposal, size = 'sm', variant = 'secondary', onDone }: { proposal: ProposalRef; size?: ButtonProps['size']; variant?: ButtonProps['variant']; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const f = useForm<z.infer<typeof reviseSchema>>({ resolver: zodResolver(reviseSchema), defaultValues: { change_notes: '' } });
  const revise = useAction('revise', { poll: ['proposals', 'proposal', 'deal', 'sla'], onSuccess: () => { setOpen(false); f.reset(); onDone?.(); } });
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}><Pencil className="size-3.5" aria-hidden />Request changes</Button>
      <ConfirmDialog open={open} onOpenChange={setOpen} title={`Request changes to v${proposal.version}`} confirmLabel="Redraft as next version" pending={revise.isPending}
        onConfirm={f.handleSubmit((v) => revise.mutate({ proposal_id: proposal.id, change_notes: v.change_notes }))}
        description={`We will redraft this for ${proposal.company ?? 'the prospect'} as version ${proposal.version + 1}. You will approve that one before anything is sent.`}>
        <div>
          <Label htmlFor={`notes-${proposal.id}`}>What should change?</Label>
          <Textarea id={`notes-${proposal.id}`} rows={4} placeholder="e.g. Split the fee into two milestones and add a reporting dashboard to the scope." {...f.register('change_notes')} aria-invalid={!!f.formState.errors.change_notes} />
          <FieldError>{f.formState.errors.change_notes?.message}</FieldError>
          <Hint>Redrafting takes a few seconds. The new version appears in the approval queue.</Hint>
        </div>
      </ConfirmDialog>
    </>
  );
}
