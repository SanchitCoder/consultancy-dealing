'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/** The deal drawer lives in the URL (?deal=123) so it can be shared, refreshed and closed with Back. */
export function useDealDrawer() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const dealId = params.get('deal') && /^\d+$/.test(params.get('deal')!) ? Number(params.get('deal')) : null;
  const set = useCallback((id: number | null) => {
    const next = new URLSearchParams(params.toString());
    if (id === null) next.delete('deal'); else next.set('deal', String(id));
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);
  return { dealId, openDeal: (id: number) => set(id), closeDeal: () => set(null) };
}
