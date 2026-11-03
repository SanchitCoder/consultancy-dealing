import { NextResponse, type NextRequest } from 'next/server';
import { consultantCode, findConsultantByEmail, getSessionFromRequest } from '@/lib/server/auth';
import { callBackend } from '@/lib/server/backend';

export const dynamic = 'force-dynamic';

/** Owner only: the sign-in code of every consultant (derived from CONSULTANT_LOGIN_SEED, never stored). */
export async function GET(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  if (s.role !== 'owner') return NextResponse.json({ error: 'Owner only.' }, { status: 403 });
  void findConsultantByEmail;
  const r = await callBackend('consultants', {});
  const rows = ((r.json as { data?: { id: number; email: string }[] } | null)?.data ?? []);
  return NextResponse.json({ codes: Object.fromEntries(rows.map((c) => [c.id, consultantCode(c.email)])) }, { headers: { 'Cache-Control': 'no-store' } });
}
