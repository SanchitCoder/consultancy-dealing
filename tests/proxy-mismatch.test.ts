import { describe, expect, it, vi } from 'vitest';
import { endpoints } from '@/contracts/deal-api';
import type { Session } from '@/lib/auth/session';

const owner: Session = { role: 'owner', name: 'Owner', exp: Date.now() + 1e6 };

vi.mock('@/lib/server/backend', () => ({
  callBackend: vi.fn(async (key: string) => {
    if (key === 'overview') {
      // win_rate_pct arrives as a string, and brief_ready_pct is missing: both are contract violations
      const k = { calls_booked: 1, calls_due: 1, calls_brief_ready: 1, proposals_sent: 1, median_hours_call_to_proposal: 1, open_rate_pct: 1, won: 1, lost: 1, open_deals: 1, win_rate_pct: '50.00', win_rate_incl_open_pct: 1, avg_deal_size_inr: 1, revenue_won_inr: 1, pipeline_value_inr: 1 };
      const ts = '2026-11-01T00:00:00+00:00';
      return { status: 200, ms: 1, json: { status: 'ok', data: { range: { from: ts, to: ts }, previous_range: { from: ts, to: ts }, totals: k, previous: k, weekly: [] }, meta: { page: 1, page_size: 1, total: 1 } } };
    }
    if (key === 'services') return { status: 200, ms: 1, json: '<html>Not JSON</html>' };
    if (key === 'deals') return { status: 500, ms: 1, json: { status: 'error', error: 'relation "deals" does not exist', node: 'Deals – Query' } };
    return { status: 200, ms: 1, json: {} };
  }),
}));

describe('a live response that breaks the contract is reported precisely', () => {
  it('names the endpoint and the field', async () => {
    const { runEndpoint } = await import('@/lib/server/proxy');
    const r = await runEndpoint(endpoints.overview, owner, {}, undefined);
    expect(r.status).toBe(502);
    const body = r.json as { error: string; contract_mismatch: { endpoint: string; field: string; issues: { path: string; message: string }[] } };
    expect(body.contract_mismatch.endpoint).toBe('GET /deal/overview');
    expect(body.contract_mismatch.issues.map((i) => i.path)).toEqual(expect.arrayContaining(['data.totals.win_rate_pct', 'data.totals.brief_ready_pct']));
    expect(body.error).toMatch(/Contract mismatch on GET \/deal\/overview: data\.(previous|totals)\./);
  });
  it('treats a non-object body as a mismatch at the root', async () => {
    const { runEndpoint } = await import('@/lib/server/proxy');
    const r = await runEndpoint(endpoints.services, owner, {}, undefined);
    expect(r.status).toBe(502);
    expect((r.json as { contract_mismatch: { field: string } }).contract_mismatch.field).toBe('(root)');
  });
  it('passes the workflow error message through unchanged', async () => {
    const { runEndpoint } = await import('@/lib/server/proxy');
    const r = await runEndpoint(endpoints.deals, owner, {}, undefined);
    expect(r.status).toBe(500);
    expect((r.json as { error: string }).error).toBe('relation "deals" does not exist');
  });
});
