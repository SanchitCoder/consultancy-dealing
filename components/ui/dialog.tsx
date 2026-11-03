'use client';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const Overlay = () => <DialogPrimitive.Overlay className="dlg-overlay fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />;

export function DialogContent({ className, children, title, description, hideClose, ...p }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string; description?: string; hideClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content className={cn('dlg-pop fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-pop)] sm:p-6', className)} {...p}>
        <DialogPrimitive.Title className="display pr-8 text-xl font-semibold text-ink">{title}</DialogPrimitive.Title>
        {description ? <DialogPrimitive.Description className="mt-1.5 text-sm text-ink-2">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
        <div className="mt-4">{children}</div>
        {!hideClose && (
          <DialogPrimitive.Close className="absolute right-3 top-3 rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close"><X className="size-4" /></DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Right-hand drawer (full width on phones). */
export function Sheet({ className, children, title, description, ...p }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string; description?: string }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content className={cn('sheet fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-bg shadow-[var(--shadow-pop)] sm:max-w-[640px]', className)} {...p}>
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">{description ?? title}</DialogPrimitive.Description>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export const SheetClose = DialogPrimitive.Close;
