import { NextResponse, type NextRequest } from 'next/server';
import { BLOCKED_PATHS_DOC, endpointList } from '@/contracts/deal-api';
import { DATA_MODE } from '@/lib/config';
import { getSessionFromRequest } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/** Owner only. What the proxy allows, what it refuses, and where it points. Never returns keys or header values. */
export async function GET(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  if (!s || s.role !== 'owner') return NextResponse.json({ error: 'Owner only.' }, { status: s ? 403 : 401 });
  let host: string | null = null;
  try { host = DATA_MODE === 'live' && process.env.N8N_BASE_URL ? new URL(process.env.N8N_BASE_URL).host : null; } catch { host = 'invalid N8N_BASE_URL'; }
  return NextResponse.json({
    dataMode: DATA_MODE, n8nHost: host, authHeaderName: DATA_MODE === 'live' ? process.env.N8N_WEBHOOK_AUTH_HEADER_NAME ?? null : null,
    allowed: endpointList.filter((e) => e.dashboard).map((e) => ({ key: e.key, method: e.method, path: e.path, summary: e.summary, screen: e.screen, addedByDashboard: e.addedByDashboard, mutates: e.mutates, roles: e.roles })),
    blocked: BLOCKED_PATHS_DOC,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
