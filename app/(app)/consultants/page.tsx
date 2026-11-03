import type { Metadata } from 'next';
import { Consultants } from '@/components/pages/consultants';

export const metadata: Metadata = { title: 'Consultants' };
export default function Page() {
  return <Consultants />;
}
