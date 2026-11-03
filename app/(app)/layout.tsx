import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { getSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const s = await getSession();
  if (!s) redirect('/login');
  return <AppShell session={{ role: s.role, name: s.name, consultantId: s.consultantId ?? null, email: s.email ?? null }}>{children}</AppShell>;
}
