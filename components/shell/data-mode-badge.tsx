'use client';
import { FlaskConical, Radio } from 'lucide-react';
import { Tip } from '@/components/ui/tooltip';
import { IS_MOCK } from '@/lib/config';
import { cn } from '@/lib/utils';

/** Always visible in mock mode so nobody mistakes sample figures for real ones. */
export function DataModeBadge({ className }: { className?: string }) {
  return IS_MOCK ? (
    <Tip label="You are looking at made-up sample data. Actions change the sample only. Set NEXT_PUBLIC_DATA_MODE=live to connect your n8n workflow." side="bottom">
      <span tabIndex={0} className={cn('inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn-soft px-2.5 py-1 text-xs font-semibold text-warn', className)}>
        <FlaskConical className="size-3.5" aria-hidden /><span className="max-[420px]:hidden">Sample data</span><span className="min-[421px]:hidden">Sample</span>
      </span>
    </Tip>
  ) : (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-good-soft px-2.5 py-1 text-xs font-semibold text-good', className)}>
      <Radio className="size-3.5" aria-hidden />Live data
    </span>
  );
}
