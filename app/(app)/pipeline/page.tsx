import type { Metadata } from 'next';
import { Pipeline } from '@/components/pages/pipeline';

export const metadata: Metadata = { title: 'Pipeline' };
export default function Page() {
  return <Pipeline />;
}
