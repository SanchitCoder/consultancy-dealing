import { NextResponse, type NextRequest } from 'next/server';
import { getSessionFromRequest, sameOrigin } from '@/lib/server/auth';
import { resolveEndpoint, runEndpoint } from '@/lib/server/proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return json(401, { status: 'error', error: 'Please sign in again.' });
  const { path } = await ctx.params;
  const { def, blocked } = resolveEndpoint(req.method, path);
  if (blocked) return json(403, { status: 'error', error: 'This endpoint records opens, clicks or payments and is never called from the dashboard.' });
  if (!def) return json(404, { status: 'error', error: `No dashboard endpoint for ${req.method} /${path.join('/')}.` });
  if (req.method === 'POST' && !sameOrigin(req)) return json(403, { status: 'error', error: 'Cross-site request refused.' });
  let body: unknown;
  if (req.method === 'POST') {
    try { body = await req.json(); } catch { return json(400, { status: 'error', error: 'Request body must be JSON.' }); }
  }
  const result = await runEndpoint(def, session, Object.fromEntries(req.nextUrl.searchParams), body);
  return json(result.status, result.json);
}

export const GET = handle;
export const POST = handle;
