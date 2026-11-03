'use client';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

export const TooltipProvider = ({ children }: { children: React.ReactNode }) => <TooltipPrimitive.Provider delayDuration={250}>{children}</TooltipPrimitive.Provider>;
export function Tip({ label, children, side = 'top' }: { label: React.ReactNode; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-[60] max-w-64 rounded-lg bg-ink px-2.5 py-1.5 text-xs leading-snug text-bg shadow-[var(--shadow-pop)]">
          {label}
          <TooltipPrimitive.Arrow className="fill-ink" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
