/** Signed session cookie. Web Crypto only, so the same code runs in middleware (edge) and in route handlers (node). */
export type Role = 'owner' | 'consultant';
export interface Session {
  role: Role;
  name: string;
  /** Present for consultants. */
  consultantId?: number;
  email?: string;
  /** epoch ms */
  exp: number;
}

export const SESSION_COOKIE = 'dp_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const enc = new TextEncoder();

function toB64Url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSession(session: Session, secret: string): Promise<string> {
  const payload = toB64Url(enc.encode(JSON.stringify(session)));
  return `${payload}.${toB64Url(await hmac(secret, payload))}`;
}

export async function verifySession(token: string | undefined, secret: string, now = Date.now()): Promise<Session | null> {
  if (!token) return null;
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined) return null;
  if (!safeEqual(sig, toB64Url(await hmac(secret, payload)))) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(fromB64Url(payload))) as Session;
    if (typeof s.exp !== 'number' || s.exp <= now) return null;
    if (s.role !== 'owner' && s.role !== 'consultant') return null;
    if (s.role === 'consultant' && typeof s.consultantId !== 'number') return null;
    return s;
  } catch {
    return null;
  }
}

/**
 * Secret resolution is the same everywhere. Mock mode falls back to a demo secret so `npm run dev` works out of the box;
 * live mode refuses to start without a real one.
 */
export function resolveSessionSecret(): string {
  const v = process.env.SESSION_SECRET?.trim();
  if (v) return v;
  if (process.env.NEXT_PUBLIC_DATA_MODE === 'live') throw new Error('SESSION_SECRET is required when NEXT_PUBLIC_DATA_MODE=live');
  return 'dev-only-session-secret-for-sample-data-mode';
}
