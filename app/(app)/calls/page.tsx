import type { Metadata } from 'next';
import { Calls } from '@/components/pages/calls';

export const metadata: Metadata = { title: 'Calls' };
export default function Page() {
  return <Calls />;
}
