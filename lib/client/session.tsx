'use client';
import { createContext, useContext, useEffect, useState } from 'react';

export interface ClientSession { role: 'owner' | 'consultant'; name: string; consultantId: number | null; email: string | null }
const Ctx = createContext<ClientSession | null>(null);
export const SessionProvider = Ctx.Provider;
export function useSession(): ClientSession {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
export const useIsOwner = (): boolean => useSession().role === 'owner';

/** Re-renders on an interval so "in 2h" / "14 min ago" stay true without refetching. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** localStorage with try/catch: only for per-viewer conveniences such as a remembered view. */
export function useStoredState<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial);
  useEffect(() => { try { const s = localStorage.getItem(key); if (s) setV(s as T); } catch { /* storage unavailable */ } }, [key]);
  return [v, (x: T) => { setV(x); try { localStorage.setItem(key, x); } catch { /* ignore */ } }];
}
