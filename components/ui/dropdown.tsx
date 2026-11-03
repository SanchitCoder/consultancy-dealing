'use client';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Dropdown = DropdownMenu.Root;
export const DropdownTrigger = DropdownMenu.Trigger;
export const DropdownContent = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof DropdownMenu.Content>) => (
  <DropdownMenu.Portal>
    <DropdownMenu.Content sideOffset={6} align="end" className={cn('dlg-pop-menu z-[60] min-w-48 rounded-xl border border-border bg-surface p-1.5 shadow-[var(--shadow-pop)]', className)} {...p} />
  </DropdownMenu.Portal>
);
export const DropdownItem = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof DropdownMenu.Item>) => (
  <DropdownMenu.Item className={cn('flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-surface-2', className)} {...p} />
);
export const DropdownLabel = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof DropdownMenu.Label>) => <DropdownMenu.Label className={cn('px-2.5 py-1.5 text-xs text-ink-3', className)} {...p} />;
export const DropdownSeparator = () => <DropdownMenu.Separator className="my-1 h-px bg-border" />;
