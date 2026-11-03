import { NextResponse, type NextRequest } from 'next/server';
import { DATA_MODE } from '@/lib/config';
import { getSessionFromRequest } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: 'signed out' }, { status: 401 });
  return NextResponse.json({ role: s.role, name: s.name, consultantId: s.consultantId ?? null, email: s.email ?? null, dataMode: DATA_MODE });
}
