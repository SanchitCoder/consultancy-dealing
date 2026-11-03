import 'server-only';
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, SESSION_TTL_MS, resolveSessionSecret, signSession, verifySession, type Session } from '@/lib/auth/session';
import { callBackend } from './backend';
import { serverEnv } from './env';

/** Consultants sign in with their email and a code derived from CONSULTANT_LOGIN_SEED (the owner sees each code on the Consultants page). */
export function consultantCode(email: string, seed = serverEnv.consultantSeed): string {
  const hex = createHmac('sha256', seed).update(email.trim().toLowerCase()).digest('hex').slice(0, 8);
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

const sha = (s: string) => createHash('sha256').update(s).digest();
export const equalSecret = (a: string, b: string): boolean => timingSafeEqual(sha(a), sha(b));

export async function getSession(): Promise<Session | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value, resolveSessionSecret());
}
export async function getSessionFromRequest(req: NextRequest): Promise<Session | null> {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value, resolveSessionSecret());
}

export async function issueSessionCookie(session: Omit<Session, 'exp'>): Promise<{ name: string; value: string; options: { httpOnly: true; sameSite: 'lax'; secure: boolean; path: string; maxAge: number } }> {
  const full: Session = { ...session, exp: Date.now() + SESSION_TTL_MS };
  return { name: SESSION_COOKIE, value: await signSession(full, resolveSessionSecret()), options: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_TTL_MS / 1000 } };
}

export async function findConsultantByEmail(email: string): Promise<{ id: number; name: string; email: string } | null> {
  const r = await callBackend('consultants', {});
  const rows = (r.json as { data?: { id: number; name: string; email: string }[] } | null)?.data ?? [];
  return rows.find((c) => c.email.toLowerCase() === email.trim().toLowerCase()) ?? null;
}

/** Very small in-memory brake on password guessing. */
const attempts = new Map<string, { n: number; reset: number }>();
export function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.reset < now) { attempts.set(ip, { n: 1, reset: now + 60_000 }); return false; }
  a.n += 1;
  return a.n > 8;
}

/** Same-origin check for state-changing requests (SameSite=Lax already blocks most cross-site posts). */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.get('host'); } catch { return false; }
}
