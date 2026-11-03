import type { Metadata } from 'next';
import { WinRate } from '@/components/pages/winrate';

export const metadata: Metadata = { title: 'Win rate' };
export default function Page() {
  return <WinRate />;
}
