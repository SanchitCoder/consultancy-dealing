import type { Metadata } from 'next';
import { System } from '@/components/pages/system';

export const metadata: Metadata = { title: 'System' };
export default function Page() {
  return <System />;
}
