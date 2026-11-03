import { NextResponse, type NextRequest } from 'next/server';
import { resolveSessionSecret, SESSION_COOKIE, verifySession } from '@/lib/auth/session';

const PUBLIC = [/^\/login$/, /^\/api\/auth\//, /^\/_next\//, /^\/favicon/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, resolveSessionSecret());
  if (session) {
    if (session.role === 'consultant' && /^\/(consultants|services|system)(\/|$)/.test(pathname)) return NextResponse.redirect(new URL('/overview', req.url));
    return NextResponse.next();
  }
  if (pathname.startsWith('/api/')) return NextResponse.json({ status: 'error', error: 'Please sign in again.' }, { status: 401 });
  const url = new URL('/login', req.url);
  if (pathname !== '/') url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
