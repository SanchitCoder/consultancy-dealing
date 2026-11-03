import { describe, expect, it } from 'vitest';
import { signSession, verifySession, type Session } from '@/lib/auth/session';

const secret = 'test-secret-value';
const base: Session = { role: 'consultant', name: 'Asha', consultantId: 7, email: 'asha@x.in', exp: Date.now() + 60_000 };

describe('signed session cookie', () => {
  it('round-trips', async () => expect(await verifySession(await signSession(base, secret), secret)).toEqual(base));
  it('rejects a different secret', async () => expect(await verifySession(await signSession(base, secret), 'other')).toBeNull());
  it('rejects a tampered payload (privilege escalation attempt)', async () => {
    const [, sig] = (await signSession(base, secret)).split('.');
    const forged = btoa(JSON.stringify({ ...base, role: 'owner' })).replace(/=+$/, '');
    expect(await verifySession(`${forged}.${sig}`, secret)).toBeNull();
  });
  it('rejects expired sessions', async () => expect(await verifySession(await signSession({ ...base, exp: Date.now() - 1 }, secret), secret)).toBeNull());
  it('rejects garbage and a consultant with no id', async () => {
    expect(await verifySession('nope', secret)).toBeNull();
    expect(await verifySession(undefined, secret)).toBeNull();
    expect(await verifySession(await signSession({ role: 'consultant', name: 'x', exp: Date.now() + 1000 }, secret), secret)).toBeNull();
  });
});
