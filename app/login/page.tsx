import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { IS_MOCK } from '@/lib/config';
import { getMockState } from '@/lib/mock/store';
import { consultantCode, getSession } from '@/lib/server/auth';
import { DEMO } from '@/lib/server/env';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect('/overview');
  const { next } = await searchParams;
  const demo = IS_MOCK
    ? { ownerPassword: process.env.OWNER_PASSWORD?.trim() ? null : DEMO.ownerPassword, consultants: getMockState().db.consultants.map((c) => ({ name: c.name, email: c.email, code: consultantCode(c.email) })) }
    : null;
  return <LoginForm next={next && next.startsWith('/') && !next.startsWith('//') ? next : '/overview'} demo={demo} />;
}
