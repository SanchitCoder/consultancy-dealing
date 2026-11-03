'use client';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';

/** Every action that changes backend state asks first, says what will happen, and shows a pending state. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, tone = 'primary', pending, onConfirm, children, disabled }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; confirmLabel: string; tone?: 'primary' | 'danger'; pending?: boolean;
  onConfirm: () => void; children?: ReactNode; disabled?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) onOpenChange(o); }}>
      <DialogContent title={title} description={typeof description === 'string' ? description : undefined}>
        {typeof description !== 'string' && description && <div className="mb-3 text-sm text-ink-2">{description}</div>}
        {children}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild><Button variant="ghost" disabled={pending}>Cancel</Button></DialogClose>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={pending} disabled={disabled} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
