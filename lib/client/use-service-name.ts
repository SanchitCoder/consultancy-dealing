'use client';
import { useMemo } from 'react';
import { useApi } from './hooks';
import { serviceLabel } from '@/lib/format/labels';

/** Real service names from /deal/services, falling back to a tidy version of the code. */
export function useServiceName(): (type: string) => string {
  const q = useApi('services');
  const map = useMemo(() => new Map((q.data?.data ?? []).map((s) => [s.service_type, s.name])), [q.data]);
  return (type) => map.get(type) ?? serviceLabel(type);
}
