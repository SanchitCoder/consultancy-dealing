'use client';
import { MoreHorizontal } from 'lucide-react';
import type { DealListItem, Stage } from '@/contracts/deal-api';
import { STAGE_LABEL } from '@/contracts/deal-api';
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from '@/components/ui/dropdown';
import { inrCompact } from '@/lib/format';
import { initials, PROPOSAL_LABEL, serviceLabel, sourceLabel } from '@/lib/format/labels';
import { cn } from '@/lib/utils';

export type MoveTarget = 'negotiation' | 'lost';
/** The only manual moves the dashboard offers. Won happens by itself when a payment arrives; finished deals stay finished. */
export function allowedMoves(stage: Stage): MoveTarget[] {
  if (stage === 'won' || stage === 'lost') return [];
  const out: MoveTarget[] = [];
  if (stage !== 'negotiation') out.push('negotiation');
  out.push('lost');
  return out;
}

export function stuckTone(days: number, stage: Stage, stuckDays: number): 'ok' | 'amber' | 'red' {
  if (stage === 'won' || stage === 'lost' || stage === 'no_show') return 'ok';
  if (days >= stuckDays) return 'red';
  if (days >= Math.ceil(stuckDays / 2)) return 'amber';
  return 'ok';
}
export function DaysInStage({ days, stage, stuckDays }: { days: number; stage: Stage; stuckDays: number }) {
  const t = stuckTone(days, stage, stuckDays);
  const label = days < 1 ? 'today' : `${Math.round(days)}d`;
  return (
    <span className={cn('tnum inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium', t === 'red' ? 'bg-bad-soft text-bad' : t === 'amber' ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-ink-3')}
      title={t === 'ok' ? `${label} in this stage` : `${label} in this stage - ${t === 'red' ? 'stuck' : 'getting slow'}`}>
      {label}{t !== 'ok' && <span className="sr-only"> {t === 'red' ? 'stuck' : 'slow'}</span>}
    </span>
  );
}

export function DealCardBody({ deal, stuckDays, onMove, onOpen, dragging }: { deal: DealListItem; stuckDays: number; onMove?: (to: MoveTarget) => void; onOpen: () => void; dragging?: boolean }) {
  const moves = allowedMoves(deal.stage);
  return (
    <div className={cn('group rounded-xl border border-border bg-surface p-3 shadow-[var(--shadow-card)] transition-shadow hover:border-border-strong', dragging && 'shadow-[var(--shadow-pop)] ring-2 ring-accent')}>
      <div className="flex items-start gap-2">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13.5px] font-semibold text-ink">{deal.company ?? deal.prospect_name}</span>
          <span className="block truncate text-xs text-ink-3">{deal.prospect_name}{deal.role ? ` · ${deal.role}` : ''}</span>
        </button>
        {moves.length > 0 && onMove && (
          <Dropdown>
            <DropdownTrigger asChild>
              <button className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Move ${deal.company ?? 'deal'}`}><MoreHorizontal className="size-4" /></button>
            </DropdownTrigger>
            <DropdownContent>
              {moves.map((m) => <DropdownItem key={m} onSelect={() => onMove(m)}>{m === 'lost' ? 'Mark as lost…' : `Move to ${STAGE_LABEL[m]}`}</DropdownItem>)}
            </DropdownContent>
          </Dropdown>
        )}
      </div>
      <p className="mt-2 truncate text-xs text-ink-2">{serviceLabel(deal.service_type, deal.service_name)}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="tnum text-sm font-semibold text-ink">{inrCompact(deal.value_inr)}</span>
        <DaysInStage days={deal.days_in_stage} stage={deal.stage} stuckDays={stuckDays} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-3">
        <span className="truncate rounded bg-surface-2 px-1.5 py-0.5 text-ink-2">{sourceLabel(deal.lead_source)}</span>
        <span className="flex items-center gap-1 truncate" title={deal.consultant_name}><span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent-soft-ink" aria-hidden>{initials(deal.consultant_name)}</span>{deal.consultant_name.split(' ')[0]}</span>
      </div>
      {deal.latest_proposal_status && deal.stage !== 'won' && deal.stage !== 'lost' && (
        <p className="mt-2 truncate border-t border-border pt-2 text-xs text-ink-3">Proposal v{deal.latest_proposal_version}: {PROPOSAL_LABEL[deal.latest_proposal_status].toLowerCase()}</p>
      )}
      {deal.stage === 'lost' && deal.lost_reason && <p className="mt-2 truncate border-t border-border pt-2 text-xs text-bad">Lost: {deal.lost_reason}</p>}
    </div>
  );
}
