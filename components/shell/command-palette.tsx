'use client';
import { Command } from 'cmdk';
import { Building2, FileText, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { StageBadge, ProposalBadge } from '@/components/deal/badges';
import { useDealDrawer } from '@/components/deal/use-deal-drawer';
import { useApi } from '@/lib/client/hooks';
import type { ClientSession } from '@/lib/client/session';
import { inrCompact } from '@/lib/format';
import { sourceLabel } from '@/lib/format/labels';
import { NAV } from './nav';

function useDebounced<T>(v: T, ms = 220): T {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/** ⌘K: jump to a page, or find a deal, company or proposal. */
export function CommandPalette({ open, onOpenChange, session }: { open: boolean; onOpenChange: (o: boolean) => void; session: ClientSession }) {
  const router = useRouter();
  const { openDeal } = useDealDrawer();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  useEffect(() => { if (!open) setQ(''); }, [open]);
  const deals = useApi('deals', { search: dq, page_size: 8, sort: '-created_at' }, { enabled: open && dq.length >= 2 });
  const props = useApi('proposals', { page_size: 200 }, { enabled: open && dq.length >= 2 });
  const matchedProposals = useMemo(() => {
    const s = dq.toLowerCase();
    return (props.data?.data ?? []).filter((p) => `${p.company} ${p.prospect_name} ${p.service_name}`.toLowerCase().includes(s)).slice(0, 5);
  }, [props.data, dq]);
  const go = (fn: () => void) => { onOpenChange(false); setTimeout(fn, 0); };
  // Enter should act on the best match, not on whatever was highlighted before the results arrived.
  const firstValue = dq.length >= 2 && deals.data?.data[0] ? `deal-${deals.data.data[0].id}` : dq.length >= 2 && matchedProposals[0] ? `proposal-${matchedProposals[0].id}` : `go-${NAV[0]!.href}`;
  const [active, setActive] = useState('');
  useEffect(() => { setActive(firstValue); }, [firstValue, open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dlg-overlay fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="dlg-pop fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-pop)]">
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Search deals, companies and proposals, or jump to a page.</DialogPrimitive.Description>
          <Command shouldFilter={false} label="Search" value={active} onValueChange={setActive} className="flex max-h-[70dvh] flex-col">
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 text-ink-3" aria-hidden />
              <Command.Input value={q} onValueChange={setQ} placeholder="Search deals, companies, proposals…" className="h-12 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3" />
            </div>
            <Command.List className="overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-ink-3">{dq.length < 2 ? 'Type at least two letters.' : deals.isFetching ? 'Searching…' : 'No deal, company or proposal matches that.'}</Command.Empty>
              {dq.length >= 2 && (deals.data?.data.length ?? 0) > 0 && (
                <Command.Group heading="Deals" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3">
                  {deals.data!.data.map((d) => (
                    <Command.Item key={`d${d.id}`} value={`deal-${d.id}`} onSelect={() => go(() => openDeal(d.id))} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 data-[selected=true]:bg-surface-2">
                      <Building2 className="size-4 shrink-0 text-ink-3" aria-hidden />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{d.company ?? d.prospect_name}</span><span className="block truncate text-xs text-ink-3">{d.prospect_name} · {sourceLabel(d.lead_source)} · {inrCompact(d.value_inr)}</span></span>
                      <StageBadge stage={d.stage} />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {matchedProposals.length > 0 && (
                <Command.Group heading="Proposals" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3">
                  {matchedProposals.map((p) => (
                    <Command.Item key={`p${p.id}`} value={`proposal-${p.id}`} onSelect={() => go(() => router.push(`/proposals?open=${p.id}`))} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 data-[selected=true]:bg-surface-2">
                      <FileText className="size-4 shrink-0 text-ink-3" aria-hidden />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{p.company} · v{p.version}</span><span className="block truncate text-xs text-ink-3">{p.service_name} · {inrCompact(p.amount_inr)}</span></span>
                      <ProposalBadge status={p.status} />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3">
                {NAV.filter((n) => !n.owner || session.role === 'owner').map((n) => (
                  <Command.Item key={n.href} value={`go-${n.href}`} onSelect={() => go(() => router.push(n.href))} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm data-[selected=true]:bg-surface-2">
                    <n.icon className="size-4 text-ink-3" aria-hidden />{n.label}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
