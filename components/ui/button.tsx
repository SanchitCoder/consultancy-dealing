'use client';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,border-color,color,transform,opacity] duration-150 ease-out select-none disabled:pointer-events-none disabled:opacity-50 active:translate-y-px',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink shadow-[var(--shadow-card)] hover:bg-accent-hover',
        secondary: 'border border-border-strong bg-surface text-ink hover:bg-surface-2',
        ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        danger: 'bg-bad text-white hover:opacity-90',
        'danger-soft': 'border border-border-strong bg-surface text-bad hover:bg-bad-soft',
        link: 'text-accent underline-offset-4 hover:underline h-auto p-0',
      },
      size: { sm: 'h-8 px-3 text-[13px]', md: 'h-9 px-3.5', lg: 'h-11 px-5 text-[15px]', icon: 'h-9 w-9' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? children : (<>{loading && <Loader2 className="size-4 animate-spin" aria-hidden />}{children}</>)}
    </Comp>
  );
});
Button.displayName = 'Button';
