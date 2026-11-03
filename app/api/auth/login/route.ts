import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { consultantCode, equalSecret, findConsultantByEmail, issueSessionCookie, sameOrigin, tooManyAttempts } from '@/lib/server/auth';
import { serverEnv } from '@/lib/server/env';

export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('owner'), password: z.string().min(1) }),
  z.object({ role: z.literal('consultant'), email: z.string().min(3), code: z.string().min(4) }),
]);

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (tooManyAttempts(ip)) return NextResponse.json({ error: 'Too many attempts. Wait a minute and try again.' }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter your details to sign in.' }, { status: 400 });
  const bad = NextResponse.json({ error: 'Those details do not match. Check them and try again.' }, { status: 401 });

  let cookie;
  if (parsed.data.role === 'owner') {
    if (!equalSecret(parsed.data.password, serverEnv.ownerPassword)) return bad;
    cookie = await issueSessionCookie({ role: 'owner', name: 'Owner' });
  } else {
    const c = await findConsultantByEmail(parsed.data.email);
    const expected = c ? consultantCode(c.email) : consultantCode('nobody@invalid');
    const given = parsed.data.code.trim().toLowerCase().replace(/\s/g, '');
    if (!c || !equalSecret(given, expected)) return bad;
    cookie = await issueSessionCookie({ role: 'consultant', name: c.name, consultantId: c.id, email: c.email });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
