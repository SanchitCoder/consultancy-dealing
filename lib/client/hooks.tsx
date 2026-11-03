'use client';
import { useMutation, useQuery, useQueryClient, type QueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { endpoints, type EndpointKey, type Infer } from '@/contracts/deal-api';
import { apiGet, apiPost, ApiError } from './api';

type Reads = { [K in EndpointKey]: (typeof endpoints)[K]['method'] extends 'GET' ? K : never }[EndpointKey];
type Actions = { [K in EndpointKey]: (typeof endpoints)[K]['method'] extends 'POST' ? K : never }[EndpointKey];
type QueryOf<K extends EndpointKey> = (typeof endpoints)[K] extends { query: infer Q extends z.ZodType } ? z.input<Q> : never;
type BodyOf<K extends EndpointKey> = (typeof endpoints)[K] extends { body: infer B extends z.ZodType } ? z.input<B> : Record<string, never>;

export function useApi<K extends Reads>(key: K, query?: QueryOf<K>, options?: Partial<Omit<UseQueryOptions<Infer<K>, ApiError>, 'queryKey' | 'queryFn'>>) {
  return useQuery<Infer<K>, ApiError>({
    queryKey: [key, query ?? {}],
    queryFn: () => apiGet(key, query as Record<string, string> | undefined),
    staleTime: 20_000,
    retry: (n, e) => n < 1 && e.status >= 500 && !e.contract,
    ...options,
  });
}

/** After work the workflow finishes asynchronously (AI drafting, research) the lists refresh a few times so the result simply appears. */
export function refetchSoon(qc: QueryClient, keys: string[], delays = [2500, 5500, 10000]) {
  for (const d of delays) setTimeout(() => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] })), d);
}

/** Plain-language success line per action, built from the backend's answer. */
export function describeAction(key: Actions, res: unknown, vars: unknown): string {
  const r = res as Record<string, unknown>;
  switch (key) {
    case 'approveAdmin': return String(r.message ?? 'Proposal approved and sent.');
    case 'revise': return `Changes sent. Version ${r.next_version} is being redrafted and will appear here shortly.`;
    case 'briefRegenerate': return 'Research started. The new brief will be ready in a moment.';
    case 'callDone': return r.outcome === 'no_show'
      ? (r.rebooking === 'already_handled' ? 'This no-show was already logged.' : 'Logged as a no-show. A rebooking message is on its way.')
      : (r.proposal === 'already_handled' ? 'This call was already logged.' : 'Call logged. A proposal draft is being prepared and will wait for your approval.');
    case 'stage': return r.changed ? `Deal moved to ${String(r.to_stage).replace(/_/g, ' ')}.` : 'Deal updated.';
    case 'service': return r.created ? 'Service created.' : 'Service updated.';
    case 'consultant': return r.created ? 'Consultant added.' : 'Consultant updated.';
    case 'setup': return `Backend initialised: ${r.records_affected} objects checked or created.`;
    case 'test': return String((r as { status?: string }).status === 'checks_failed' ? 'Scenario ran but some checks failed.' : 'Scenario finished.');
    default: void vars; return 'Done.';
  }
}

export function useAction<K extends Actions>(key: K, opts: { onSuccess?: (res: Infer<K>, vars: BodyOf<K>) => void; silent?: boolean; poll?: string[] } = {}) {
  const qc = useQueryClient();
  const def = endpoints[key];
  return useMutation<Infer<K>, ApiError, BodyOf<K>>({
    mutationFn: (vars) => apiPost(key, vars),
    onSuccess: (res, vars) => {
      const invalidates: string[] = (def as { invalidates?: string[] }).invalidates ?? [];
      invalidates.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      if (opts.poll) refetchSoon(qc, opts.poll);
      if (!opts.silent) toast.success(describeAction(key, res, vars));
      opts.onSuccess?.(res, vars);
    },
    onError: (e) => { if (!opts.silent) toast.error(e.message); },
  });
}
