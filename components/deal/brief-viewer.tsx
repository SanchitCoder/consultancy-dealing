'use client';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/primitives';
import { useAction, useApi } from '@/lib/client/hooks';
import { calendarIst, relativeTime } from '@/lib/format';
import { BriefBadge } from './badges';
import { ConfirmDialog } from './confirm';
import { EmptyState, ErrorState } from './states';

const isRealUrl = (u: string | null | undefined): u is string => !!u && /^https?:\/\//.test(u);

export function RegenerateBriefButton({ dealId, label = 'Regenerate', variant = 'secondary', size = 'sm' }: { dealId: number; label?: string; variant?: 'secondary' | 'ghost'; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false);
  const regen = useAction('briefRegenerate', { poll: ['brief', 'calls', 'deal'], onSuccess: () => setOpen(false) });
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}><RefreshCw className="size-3.5" aria-hidden />{label}</Button>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Regenerate the research brief?" confirmLabel="Regenerate" pending={regen.isPending} onConfirm={() => regen.mutate({ deal_id: dealId })}
        description="The research agent will read the prospect's site and profile again and write a fresh brief. The current one is replaced when the new one is ready. Your consultant may get a notification." />
    </>
  );
}

/** Rendered brief: markdown, sources, link to the Google Doc, regenerate. */
export function BriefViewer({ dealId }: { dealId: number }) {
  const q = useApi('brief', { deal_id: String(dealId) }, { refetchInterval: (query) => (query.state.data?.data.status === 'pending' ? 3000 : false), retry: false });
  if (q.isLoading) return <div className="space-y-3 p-1" aria-busy><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-24" /></div>;
  if (q.isError) {
    if (q.error.status === 404) return <EmptyState title="No research brief yet" hint="A brief is written automatically when a call is booked. You can start one now." action={<RegenerateBriefButton dealId={dealId} label="Generate brief" />} />;
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  }
  const b = q.data!.data;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <BriefBadge status={b.status} large />
        {b.generated_at && <span className="text-xs text-ink-3">Written {relativeTime(b.generated_at)}</span>}
        {b.scheduled_for && <span className="text-xs text-ink-3">· Call {calendarIst(b.scheduled_for)}</span>}
        <div className="ml-auto flex gap-2">
          {isRealUrl(b.brief_doc_url) && <Button asChild size="sm" variant="secondary"><a href={b.brief_doc_url} target="_blank" rel="noreferrer noopener"><ExternalLink className="size-3.5" aria-hidden />Open in Google Docs</a></Button>}
          <RegenerateBriefButton dealId={dealId} />
        </div>
      </div>
      {b.status === 'pending' && <div role="status" className="mt-4 flex items-center gap-2 rounded-lg bg-warn-soft p-3 text-sm text-warn"><Loader2 className="size-4 animate-spin" aria-hidden />The research agent is reading their site and profile. This page updates by itself.</div>}
      {b.status === 'failed' && <div role="alert" className="mt-4 rounded-lg bg-bad-soft p-3 text-sm text-bad">The research did not finish{b.error ? `: ${b.error}` : '.'} Try again, or prepare for the call by hand.</div>}
      {b.brief_markdown ? (
        <article className="mt-4 text-sm leading-relaxed text-ink-2 [&_a]:text-accent [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_em]:text-ink-3 [&_h1]:display [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:text-ink [&_h2]:display [&_h2]:mb-1.5 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a> }}>{b.brief_markdown}</ReactMarkdown>
        </article>
      ) : b.status === 'ready' ? <p className="mt-4 text-sm text-ink-3">The brief is ready but has no text. Open the Google Doc.</p> : null}
      {b.sources.length > 0 && (
        <section className="mt-5 border-t border-border pt-4" aria-label="Sources">
          <h3 className="text-[13px] font-semibold text-ink">Sources the agent read</h3>
          <ul className="mt-2 space-y-1">
            {b.sources.map((s, i) => {
              const url = typeof s === 'string' ? s : s.url;
              const title = typeof s === 'string' ? s : s.title ?? s.url ?? 'Source';
              return <li key={i} className="truncate text-[13px]">{isRealUrl(url) ? <a href={url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">{title}</a> : <span className="text-ink-2">{title}</span>}</li>;
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
