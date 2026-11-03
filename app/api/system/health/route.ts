import { NextResponse, type NextRequest } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { contractHealth } from '@/lib/server/proxy';

export const dynamic = 'force-dynamic';

/** Owner only. Calls every GET endpoint and checks the answers against the Zod contract. */
export async function GET(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  if (s.role !== 'owner') return NextResponse.json({ error: 'Owner only.' }, { status: 403 });
  return NextResponse.json({ rows: await contractHealth(s) }, { headers: { 'Cache-Control': 'no-store' } });
}
