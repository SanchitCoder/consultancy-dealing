import { createMockState, type MockState } from '@/lib/mock/store';

export const NOW = Date.parse('2026-11-02T10:00:00Z');
export const H = 3_600_000;
export const D = 86_400_000;

/** A mock state with a controllable clock. */
export function makeState(now = NOW): MockState & { advance: (ms: number) => void; setNow: (t: number) => void } {
  let t = now;
  const s = createMockState({ now, clock: () => t });
  return Object.assign(s, { advance: (ms: number) => { t += ms; }, setNow: (x: number) => { t = x; } });
}
