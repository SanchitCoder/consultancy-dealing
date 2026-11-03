'use client';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as React from 'react';
import { cn } from '@/lib/utils';
import type { Tone } from '@/lib/format/labels';

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]', className)} {...p} />
);
export const CardHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('flex items-start justify-between gap-3 px-4 pt-4 sm:px-5', className)} {...p} />;
export const CardTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className={cn('text-[15px] font-semibold leading-tight text-ink', className)} {...p} />;
export const CardBody = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('px-4 pb-4 pt-3 sm:px-5', className)} {...p} />;

const toneClass: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-2 border-border',
  info: 'bg-info-soft text-info border-transparent',
  good: 'bg-good-soft text-good border-transparent',
  warn: 'bg-warn-soft text-warn border-transparent',
  bad: 'bg-bad-soft text-bad border-transparent',
  accent: 'bg-accent-soft text-accent-soft-ink border-transparent',
};
export function Badge({ tone = 'neutral', className, children, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', toneClass[tone], className)} {...p}>{children}</span>;
}

const field = 'w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-ink-3 focus-visible:border-accent disabled:opacity-60';
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cn(field, 'h-9', className)} {...p} />);
Input.displayName = 'Input';
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} className={cn(field, 'min-h-24 py-2 leading-relaxed', className)} {...p} />);
Textarea.displayName = 'Textarea';
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn(field, 'h-9 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-8', "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')]", className)} {...p}>{children}</select>
));
Select.displayName = 'Select';
export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label className={cn('mb-1.5 block text-[13px] font-medium text-ink-2', className)} {...p} />;
export const FieldError = ({ children }: { children?: React.ReactNode }) => (children ? <p role="alert" className="mt-1.5 text-[13px] text-bad">{children}</p> : null);
export const Hint = ({ children, className }: { children: React.ReactNode; className?: string }) => <p className={cn('mt-1.5 text-xs text-ink-3', className)}>{children}</p>;

export function Skeleton({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('skeleton', className)} {...p} />;
}

export function Switch({ className, ...p }: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root className={cn('relative h-6 w-10 shrink-0 rounded-full border border-border-strong bg-surface-3 transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent', className)} {...p}>
      <SwitchPrimitive.Thumb className="block size-4.5 translate-x-0.5 rounded-full bg-white shadow transition-transform duration-150 ease-out data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}

export const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="rounded border border-border-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{children}</kbd>;
