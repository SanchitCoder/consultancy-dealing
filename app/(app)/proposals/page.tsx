import type { Metadata } from 'next';
import { Proposals } from '@/components/pages/proposals';

export const metadata: Metadata = { title: 'Proposals' };
export default function Page() {
  return <Proposals />;
}
